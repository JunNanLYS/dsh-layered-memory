/**
 * 运行时安装器（D8 决策）：本地嵌入的推理运行时（@huggingface/transformers，
 * 纯库、二进制随 npm 包分发、零 postinstall）在用户首次开启本地嵌入时才安装——
 * 插件 npm 包本体不带重依赖，不用本地嵌入的用户零成本。
 *
 * - 安装位置：数据目录 runtime/（自带 package.json 锚定，防 npm 向上层目录逃逸安装）；
 * - 子进程 npm install --ignore-scripts --no-audit --no-fund，钉死精确版本；
 * - 进度（用户硬性要求：不能傻等）：npm 非交互模式无百分比 API，采用不确定进度——
 *   已耗时 + 子进程 stdout/stderr 尾行实时流出 + 可 kill；
 * - 幂等：已装版本 == 目标版本直接就绪；版本漂移（插件升级换了钉死版本）重装覆盖。
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
/** 钉死的 transformers.js 版本（D8：精确版本，升级插件时在此变更并重装运行时）。 */
export const PINNED_TRANSFORMERS_VERSION = '4.2.0';
export class RuntimeInstaller {
    runtimeDir;
    target;
    logger;
    spawnImpl;
    progress;
    child = null;
    current = null;
    /** 安装超时（npm 卡死不罕见：registry 停滞即永挂，applyBusy 会被锁死）。 */
    static INSTALL_TIMEOUT_MS = 10 * 60_000;
    constructor(dataDir, targetVersion, opts) {
        this.runtimeDir = path.join(dataDir, 'runtime');
        this.target = targetVersion;
        this.logger = opts?.logger;
        this.spawnImpl =
            opts?.spawnImpl ??
                ((command, args, cwd) => {
                    const child = spawn(command, args, {
                        cwd,
                        // Windows 上 .cmd 必须走 shell（Node 20+ 安全限制）；参数全部来自插件常量，无注入面
                        shell: process.platform === 'win32',
                        windowsHide: true,
                    });
                    const spawned = {
                        onStdout(cb) {
                            child.stdout?.on('data', (d) => String(d).split(/\r?\n/).forEach((l) => l && cb(l)));
                        },
                        onStderr(cb) {
                            child.stderr?.on('data', (d) => String(d).split(/\r?\n/).forEach((l) => l && cb(l)));
                        },
                        kill: () => child.kill(),
                        // 'error'（如 ENOENT：PATH 无 npm）只发 error 不发 close——不监听会永挂
                        exited: new Promise((resolve) => {
                            child.on('close', (code) => resolve(code));
                            child.on('error', () => resolve(null));
                        }),
                    };
                    return spawned;
                });
        this.progress = {
            phase: 'idle',
            targetVersion: targetVersion,
            installedVersion: null,
            startedAt: 0,
            elapsedMs: 0,
            lastLines: [],
        };
    }
    /** 包内模块名（与钉死版本一起构成安装目标）。 */
    static packageName = '@huggingface/transformers';
    /** 进度快照。 */
    getProgress() {
        const elapsed = this.progress.phase === 'installing' ? Date.now() - this.progress.startedAt : this.progress.elapsedMs;
        return { ...this.progress, lastLines: [...this.progress.lastLines], elapsedMs: elapsed };
    }
    pkgJsonPath() {
        return path.join(this.runtimeDir, 'node_modules', RuntimeInstaller.packageName, 'package.json');
    }
    /** 已就位版本（读 package.json；未安装返回 null）。 */
    async installedVersion() {
        try {
            const raw = await fs.readFile(this.pkgJsonPath(), 'utf8');
            const pkg = JSON.parse(raw);
            return typeof pkg.version === 'string' ? pkg.version : null;
        }
        catch {
            return null;
        }
    }
    /** 是否就绪（版本精确匹配目标）。 */
    async isReady() {
        return (await this.installedVersion()) === this.target;
    }
    /**
     * 确保运行时就位：版本匹配直接就绪；否则安装（忙时并 await 同一次任务）。
     * 返回是否就绪（失败/取消返回 false 并在 progress.error 说明原因）。
     */
    async ensure() {
        if (await this.isReady()) {
            this.progress.phase = 'ready';
            this.progress.installedVersion = this.target;
            return true;
        }
        if (this.current)
            return this.current;
        this.current = this.installOnce();
        try {
            return await this.current;
        }
        finally {
            this.current = null;
        }
    }
    /** 取消安装（kill 子进程；node_modules 残留无害，npm 幂等重装）。 */
    cancel() {
        if (this.progress.phase !== 'installing' || !this.child)
            return false;
        this.progress.phase = 'cancelled';
        this.child.kill();
        return true;
    }
    /** 从 runtime 目录解析已安装的 transformers 模块（LocalEmbeddingService 用）。 */
    resolveModule() {
        const req = createRequire(path.join(this.runtimeDir, 'package.json'));
        return req(RuntimeInstaller.packageName);
    }
    pushLine(line) {
        const lines = this.progress.lastLines;
        lines.push(line.length > 300 ? line.slice(0, 300) + '…' : line);
        if (lines.length > 5)
            lines.splice(0, lines.length - 5);
    }
    async installOnce() {
        // 锚定 package.json：没有它 npm 会向上层目录找最近的 package.json 安装（逃逸事故）
        await fs.mkdir(this.runtimeDir, { recursive: true });
        const manifestPath = path.join(this.runtimeDir, 'package.json');
        try {
            await fs.access(manifestPath);
        }
        catch {
            await fs.writeFile(manifestPath, JSON.stringify({ name: 'dsh-memory-runtime', private: true }, null, 2));
        }
        this.progress = {
            phase: 'installing',
            targetVersion: this.target,
            installedVersion: await this.installedVersion(),
            startedAt: Date.now(),
            elapsedMs: 0,
            lastLines: [`npm install ${RuntimeInstaller.packageName}@${this.target}（--ignore-scripts）`],
        };
        const child = this.spawnImpl('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel', 'notice', `${RuntimeInstaller.packageName}@${this.target}`], this.runtimeDir);
        this.child = child;
        child.onStdout((l) => this.pushLine(l));
        child.onStderr((l) => this.pushLine(l));
        const timeout = setTimeout(() => {
            this.pushLine('安装超时（10 分钟），终止子进程');
            child.kill();
        }, RuntimeInstaller.INSTALL_TIMEOUT_MS);
        this.logger?.info(`[memory] 运行时安装开始: ${RuntimeInstaller.packageName}@${this.target} → ${this.runtimeDir}`);
        const code = await new Promise((resolve) => {
            void child.exited.then((c) => {
                clearTimeout(timeout);
                resolve(c);
            });
        });
        this.progress.elapsedMs = Date.now() - this.progress.startedAt;
        this.child = null;
        const version = await this.installedVersion();
        this.progress.installedVersion = version;
        if (this.progress.phase === 'cancelled') {
            this.logger?.warn('[memory] 运行时安装已取消（残留无害，重装幂等）');
            return false;
        }
        if (code === 0 && version === this.target) {
            this.progress.phase = 'ready';
            this.logger?.info(`[memory] 运行时安装完成: v${version}`);
            return true;
        }
        this.progress.phase = 'error';
        this.progress.error = `npm 退出码 ${code ?? '被杀死'}${version ? `（就位版本 ${version}）` : '（模块未就位）'}`;
        this.logger?.warn(`[memory] 运行时安装失败: ${this.progress.error}`);
        return false;
    }
}
