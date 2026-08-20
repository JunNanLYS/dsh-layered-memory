/**
 * 模型下载器（D3/D7 决策）：镜像直连 + Range 断点续传 + sha256 校验 + 串行队列。
 *
 * - 进度是用户硬性要求（不能傻等）：字节级实时进度（文件 i/N、已收/总量、EMA 速度），
 *   进度对象由 RPC 轮询读取（client 1s 拉一次，records/rebuild 同款模式）；
 * - 断点续传：写 .part 旁车文件，重试从断点 Range 续传；服务器不支持 Range（回 200）
 *   则从头重写；取消保留断点；
 * - 完整性：每文件下满后流式哈希整文件比对目录 sha256（续传无法增量哈希，落盘后
 *   单遍校验最简单且正确）；失配删文件整体重下；单文件失败自动重试（默认 2 次，
 *   吸收镜像瞬态污染——sha 失配从零重下、网络类错误保留断点续传）；
 * - 磁盘门禁：下载前检查数据目录所在卷剩余空间 ≥ 模型体积 × 1.2（statfs 不可用时跳过）；
 * - 同一时刻只跑一个下载任务（串行队列），后续请求直接拒绝并说明。
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { catalogById, catalogTotalBytes, MODEL_CATALOG } from './model-catalog.js';
const DISK_HEADROOM = 1.2;
export class ModelDownloadQueue {
    dataDir;
    opts;
    progress = null;
    busy = false;
    abort = null;
    /** 代理 dispatcher（按需创建；dispose 关闭连接池）。 */
    agent;
    /** 默认 fetch：undici（可挂代理 dispatcher）；测试注入优先。 */
    defaultFetch;
    constructor(dataDir, opts) {
        this.dataDir = dataDir;
        this.opts = opts;
        // 畸形 mirror（无 scheme 等）只跳过代理解析，不炸构造器（下载本身还会报清晰的 URL 错）
        let host = '';
        try {
            host = new URL(this.mirrorUrl()).host;
        }
        catch {
            /* ignore */
        }
        const proxy = resolveProxyUrl(opts.proxy, host);
        if (proxy) {
            this.agent = new ProxyAgent(proxy);
            opts.logger?.info(`[memory] 模型下载走代理 ${proxy}（镜像直连在国内网络间歇不可达）`);
        }
        this.defaultFetch = ((u, init) => {
            const dispatch = this.agent;
            // undici fetch 的 init 接受 dispatcher；RequestInit 类型无此字段，断言透传
            return undiciFetch(u, { ...init, ...(dispatch ? { dispatcher: dispatch } : {}) });
        });
    }
    /** 镜像根（无尾斜杠）。 */
    mirrorUrl() {
        return this.opts.mirror.replace(/\/+$/, '');
    }
    /** 释放代理连接池（插件 dispose 链调用；无代理时幂等无操作）。 */
    dispose() {
        void this.agent?.close().catch(() => { });
        this.agent = undefined;
    }
    /** 当前进度快照（无任务时 null）。 */
    getProgress() {
        return this.progress ? { ...this.progress } : null;
    }
    /** 是否有任务在跑（含校验阶段）。 */
    isBusy() {
        return this.busy;
    }
    modelsDir(id) {
        return path.join(this.dataDir, 'models', id);
    }
    /** 全目录状态扫描（设置页模型卡数据源）。 */
    async listStatus() {
        const out = [];
        for (const entry of MODEL_CATALOG) {
            const dir = this.modelsDir(entry.id);
            let bytes = 0;
            let complete = true;
            let anyFile = false;
            for (const f of entry.files) {
                const size = await fileSize(path.join(dir, f.path));
                const partSize = await fileSize(path.join(dir, f.path + '.part'));
                if (size === f.size) {
                    bytes += size;
                    anyFile = true;
                }
                else if (partSize !== null) {
                    bytes += partSize;
                    complete = false;
                    anyFile = true;
                }
                else if (size !== null) {
                    // 尺寸不吻合的残留文件按 partial 记
                    bytes += size;
                    complete = false;
                    anyFile = true;
                }
                else {
                    complete = false;
                }
            }
            out.push({
                id: entry.id,
                state: complete && anyFile ? 'downloaded' : anyFile ? 'partial' : 'none',
                bytesOnDisk: bytes,
                totalBytes: catalogTotalBytes(entry),
            });
        }
        return out;
    }
    /** 单模型是否已完整下载（尺寸口径，不做哈希复验——下载完成时已验过）。 */
    async isDownloaded(id) {
        return (await this.listStatus()).find((s) => s.id === id)?.state === 'downloaded';
    }
    /** 删除已下载模型（切走后释放磁盘；正在使用/下载中的拒绝）。 */
    async deleteModel(id) {
        const entry = catalogById(id);
        if (!entry)
            return { ok: false, error: '未知模型' };
        if (this.busy && this.progress?.modelId === id)
            return { ok: false, error: '该模型正在下载' };
        try {
            await fs.rm(this.modelsDir(id), { recursive: true, force: true });
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /** 启动下载（串行队列：忙时直接拒绝）。resolve 在任务终态（done/error/cancelled）。 */
    async start(id) {
        const entry = catalogById(id);
        if (!entry)
            throw new Error(`未知模型: ${id}`);
        return this.startEntry(entry);
    }
    /** 按给定目录项启动（测试缝：合成目录项驱动状态机，不触网）。 */
    async startEntry(entry) {
        if (this.busy)
            throw new Error('已有下载任务进行中（串行队列，请等待或取消）');
        this.busy = true;
        this.abort = new AbortController();
        const totalBytes = catalogTotalBytes(entry);
        this.progress = {
            modelId: entry.id,
            phase: 'downloading',
            fileIndex: 0,
            fileCount: entry.files.length,
            fileReceived: 0,
            fileTotal: 0,
            overallReceived: 0,
            overallTotal: totalBytes,
            speedBps: 0,
            startedAt: Date.now(),
        };
        try {
            await this.run(entry);
            this.progress.phase = 'done';
            this.opts.logger?.info(`[memory] 模型 ${entry.id} 下载校验完成（${totalBytes} 字节）`);
            return { ...this.progress };
        }
        catch (err) {
            const cancelled = this.progress.phase === 'cancelled';
            const message = err instanceof Error ? err.message : String(err);
            if (!cancelled) {
                this.progress.phase = 'error';
                this.progress.error = message;
                this.opts.logger?.warn(`[memory] 模型 ${entry.id} 下载失败: ${message}`);
            }
            return { ...this.progress };
        }
        finally {
            this.busy = false;
            this.abort = null;
        }
    }
    /** 取消当前任务：中断 fetch，保留 .part 断点。 */
    cancel() {
        if (!this.busy || !this.abort)
            return false;
        if (this.progress)
            this.progress.phase = 'cancelled';
        this.abort.abort();
        return true;
    }
    async run(entry) {
        const prog = this.progress; // start() 已置位，本方法存活期内非空
        // 磁盘门禁：剩余空间 ≥ 体积 × 1.2（statfs 不可用则跳过检查）
        const free = await this.freeBytes();
        if (free !== null) {
            const need = Math.ceil(catalogTotalBytes(entry) * DISK_HEADROOM);
            if (free < need) {
                const fmt = (n) => (n >= 1e6 ? `${Math.round(n / 1e6)}MB` : `${Math.max(1, Math.round(n / 1e3))}KB`);
                throw new Error(`磁盘剩余空间不足：需要约 ${fmt(need)}（含 20% 余量），当前 ${fmt(free)}`);
            }
        }
        const dir = this.modelsDir(entry.id);
        await fs.mkdir(path.join(dir, 'onnx'), { recursive: true });
        let overall = 0;
        // 之前已完整就位的文件计入整体进度（重试/断点续传场景分母口径一致）
        for (const f of entry.files) {
            if ((await fileSize(path.join(dir, f.path))) === f.size)
                overall += f.size;
        }
        for (let i = 0; i < entry.files.length; i++) {
            if (prog.phase === 'cancelled')
                throw new Error('已取消');
            const f = entry.files[i];
            prog.fileIndex = i + 1;
            prog.fileTotal = f.size;
            const alreadyOk = (await fileSize(path.join(dir, f.path))) === f.size;
            if (alreadyOk) {
                prog.fileReceived = f.size;
                continue;
            }
            overall += await this.downloadFile(entry, f, dir, (received) => {
                prog.fileReceived = received;
                prog.overallReceived = overall + received;
            });
            prog.overallReceived = overall;
        }
    }
    /** 下载单文件到最终路径（含续传与校验），返回该文件贡献的字节数。
     *  单文件失败自动重试（默认 2 次）+ **重试换缓存键**：镜像链路
     *  （Caddy×3 → CloudFront → Cloudflare）存在缓存对象污染窗口——同一时间窗内
     *  同一 URL 确定性拿到错误字节（2026-08-19 embeddinggemma generation_config.json
     *  连续错哈希的真实事故），普通重试会全打同一污染缓存；每次重试追加
     *  `?dshmem-retry=N` 参数绕开缓存键另取对象，窗口期也能自愈。
     *  - sha256 失配：downloadFileOnce 已删除断点 → 从零重下；
     *  - 数量不吻合/网络错误：断点保留 → Range 续传重试；
     *  - 取消：立即上抛不重试。 */
    async downloadFile(entry, f, dir, onBytes) {
        const delays = this.opts.retryDelaysMs ?? [1000, 3000];
        let lastErr;
        for (let attempt = 0;; attempt++) {
            if (this.progress?.phase === 'cancelled')
                throw new Error('已取消');
            try {
                return await this.downloadFileOnce(entry, f, dir, attempt, onBytes);
            }
            catch (err) {
                lastErr = err;
                // as 断言绕开 CFA 窄化——await 期间 cancel() 可能已改写 phase（同 downloadFileOnce 末段）
                if (this.progress?.phase === 'cancelled')
                    throw err;
                if (attempt >= delays.length)
                    throw err;
                const msg = err instanceof Error ? err.message : String(err);
                this.opts.logger?.warn(`[memory] 文件 ${f.path} 第 ${attempt + 1} 次尝试失败（${msg}），${delays[attempt]}ms 后自动重试（换缓存键）`);
                await new Promise((r) => setTimeout(r, delays[attempt]));
            }
        }
    }
    /** 单次尝试：续传探测 → fetch（attempt>0 追加缓存键参数）→ 落盘 → 尺寸与 sha256 校验 → rename。 */
    async downloadFileOnce(entry, f, dir, attempt, onBytes) {
        const finalPath = path.join(dir, f.path);
        const partPath = finalPath + '.part';
        const base = this.mirrorUrl();
        // 重试追加缓存键参数：绕开镜像 CDN 的污染缓存对象（同窗口普通重试全打同一对象）
        const cacheBust = attempt > 0 ? `?dshmem-retry=${attempt}` : '';
        const url = `${base}/${entry.repo}/resolve/${entry.revision}/${f.path}${cacheBust}`;
        const fetchImpl = this.opts.fetchImpl ?? this.defaultFetch;
        const prog = this.progress;
        let resumeFrom = 0;
        const partSize = await fileSize(partPath);
        if (partSize !== null && partSize < f.size)
            resumeFrom = partSize;
        else if (partSize === f.size) {
            // 断点已写满但尚未 rename（进程在最后一字节与改名间被杀）：直接校验收编，
            // 避免发 bytes=<size>- 吃 416 死循环
            const pre = await sha256File(partPath);
            if (pre === f.sha256) {
                await fs.rename(partPath, finalPath);
                return f.size;
            }
            await fs.rm(partPath, { force: true });
        }
        else if (partSize !== null) {
            await fs.rm(partPath, { force: true });
        }
        const headers = {};
        if (resumeFrom > 0)
            headers.range = `bytes=${resumeFrom}-`;
        let res = await fetchImpl(url, { headers, signal: this.abort?.signal });
        if (res.status === 416 && resumeFrom > 0) {
            // 服务器对已满 Range 回 416：删断点从零重来（一次性）
            await fs.rm(partPath, { force: true });
            resumeFrom = 0;
            delete headers.range;
            res = await fetchImpl(url, { headers, signal: this.abort?.signal });
        }
        if (!res.ok)
            throw new Error(`HTTP ${res.status}（${f.path}）`);
        const appending = res.status === 206 && resumeFrom > 0;
        if (!appending)
            resumeFrom = 0;
        // 服务器未给 content-length（chunked）时按目录尺寸兜底展示
        const declared = Number(res.headers.get('content-length') ?? 0);
        const expectBytes = appending ? resumeFrom + declared : declared || f.size;
        const handle = await fs.open(partPath, appending ? 'a' : 'w');
        let received = resumeFrom;
        let lastTick = Date.now();
        let lastBytes = received;
        try {
            if (!res.body)
                throw new Error('响应无 body');
            const reader = res.body.getReader();
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                if (prog.phase === 'cancelled')
                    throw new Error('已取消');
                await handle.write(value);
                received += value.byteLength;
                const now = Date.now();
                if (now - lastTick > 200) {
                    const inst = ((received - lastBytes) / (now - lastTick)) * 1000;
                    prog.speedBps = prog.speedBps * 0.6 + inst * 0.4;
                    lastTick = now;
                    lastBytes = received;
                }
                onBytes(Math.min(received, f.size));
                prog.fileTotal = expectBytes || f.size;
            }
        }
        finally {
            await handle.close();
        }
        if (received !== f.size) {
            throw new Error(`下载数量不吻合：期望 ${f.size}，收到 ${received}（${f.path}）`);
        }
        // 校验（含续传）：落盘后单遍流式哈希
        prog.phase = 'verifying';
        const sha = await sha256File(partPath);
        if (sha !== f.sha256) {
            await fs.rm(partPath, { force: true });
            throw new Error(`sha256 校验失败（${f.path}），已删除断点，请重试`);
        }
        // 校验期间取消（cancel 把 phase 置 cancelled）：不得被下面覆写回 downloading。
        // as 断言绕开 CFA 窄化——await 期间 cancel() 可能已改写 phase
        if (prog.phase === 'cancelled')
            throw new Error('已取消');
        prog.phase = 'downloading';
        await fs.rename(partPath, finalPath);
        return f.size;
    }
    async freeBytes() {
        if (this.opts.freeBytes)
            return this.opts.freeBytes();
        try {
            const statfs = (await import('node:fs/promises')).statfs;
            if (typeof statfs !== 'function')
                return null;
            const s = await statfs(this.dataDir);
            return Number(BigInt(s.bavail) * BigInt(s.bsize));
        }
        catch {
            return null;
        }
    }
}
async function fileSize(p) {
    try {
        const s = await fs.stat(p);
        return s.isFile() ? s.size : null;
    }
    catch {
        return null;
    }
}
/**
 * 解析下载代理（三态）：`''`（默认）= 探测代理环境变量（HTTPS_PROXY > ALL_PROXY >
 * HTTP_PROXY，大小写双形态，尊重 NO_PROXY）；`'none'` = 禁用代理强制直连；
 * 其他值 = 显式代理 URL。与 curl/npm 同语义——用户配置了代理 env 的机器上
 * 镜像直连往往间歇不可达（真实事故：直连超时与污染字节交替出现）。
 */
export function resolveProxyUrl(setting, host) {
    const value = (setting ?? '').trim();
    if (value.toLowerCase() === 'none')
        return '';
    if (value)
        return value;
    const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? '';
    if (noProxy) {
        for (const raw of noProxy.split(',')) {
            const entry = raw.trim().replace(/^\./, '').toLowerCase();
            if (entry && (host.toLowerCase() === entry || host.toLowerCase().endsWith(`.${entry}`)))
                return '';
        }
    }
    const candidates = [
        process.env.HTTPS_PROXY, process.env.https_proxy,
        process.env.ALL_PROXY, process.env.all_proxy,
        process.env.HTTP_PROXY, process.env.http_proxy,
    ];
    for (const c of candidates) {
        if (c && c.trim())
            return c.trim();
    }
    return '';
}
async function sha256File(p) {
    const { createReadStream } = await import('node:fs');
    const hash = createHash('sha256');
    const stream = createReadStream(p);
    for await (const chunk of stream)
        hash.update(chunk);
    return hash.digest('hex');
}
