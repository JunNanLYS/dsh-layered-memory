import type { MemoryLogger } from '../types.js';
import { type CatalogEntry } from './model-catalog.js';
export type DownloadPhase = 'downloading' | 'verifying' | 'done' | 'cancelled' | 'error';
export interface DownloadProgress {
    modelId: string;
    phase: DownloadPhase;
    /** 当前文件序号（1-based）。 */
    fileIndex: number;
    fileCount: number;
    /** 当前文件已收字节（含续传基线）。 */
    fileReceived: number;
    fileTotal: number;
    /** 整模型累计字节（含已完成文件；分母 = 目录总大小）。 */
    overallReceived: number;
    overallTotal: number;
    /** EMA 平滑速度（字节/秒）。 */
    speedBps: number;
    startedAt: number;
    /** phase=error 时的原因。 */
    error?: string;
}
export interface ModelStatus {
    id: string;
    /** none=未下载；partial=有断点/不完整；downloaded=全部文件就位且尺寸吻合。 */
    state: 'none' | 'partial' | 'downloaded';
    bytesOnDisk: number;
    totalBytes: number;
}
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export interface DownloaderOptions {
    /** 下载镜像根（默认 https://hf-mirror.com，可配回 https://huggingface.co）。 */
    mirror: string;
    logger?: MemoryLogger;
    /** 测试注入；默认 undici fetch（按需挂代理 dispatcher）。 */
    fetchImpl?: FetchLike;
    /** 测试注入磁盘剩余字节；默认 statfs。 */
    freeBytes?: () => Promise<number | null>;
    /** 单文件失败的自动重试间隔（毫秒），长度即重试次数；默认 [1000, 3000]。
     *  sha256 失配重试从零开始（污染断点已删除）；数量不吻合/网络错误保留断点续传。 */
    retryDelaysMs?: number[];
    /** 显式代理三态：''（默认）= 探测代理环境变量；'none' = 禁用强制直连；
     *  其他值 = 代理 URL（如 http://127.0.0.1:7890）。镜像直连在国内网络
     *  间歇不可达（真实事故：直连超时与污染字节交替），与 curl/npm 同语义地
     *  走用户已配置的代理是可达性的底线。 */
    proxy?: string;
}
export declare class ModelDownloadQueue {
    private readonly dataDir;
    private readonly opts;
    private progress;
    private busy;
    private abort;
    /** 代理 dispatcher（按需创建；dispose 关闭连接池）。 */
    private agent;
    /** 默认 fetch：undici（可挂代理 dispatcher）；测试注入优先。 */
    private readonly defaultFetch;
    constructor(dataDir: string, opts: DownloaderOptions);
    /** 镜像根（无尾斜杠）。 */
    private mirrorUrl;
    /** 释放代理连接池（插件 dispose 链调用；无代理时幂等无操作）。 */
    dispose(): void;
    /** 当前进度快照（无任务时 null）。 */
    getProgress(): DownloadProgress | null;
    /** 是否有任务在跑（含校验阶段）。 */
    isBusy(): boolean;
    modelsDir(id: string): string;
    /** 全目录状态扫描（设置页模型卡数据源）。 */
    listStatus(): Promise<ModelStatus[]>;
    /** 单模型是否已完整下载（尺寸口径，不做哈希复验——下载完成时已验过）。 */
    isDownloaded(id: string): Promise<boolean>;
    /** 删除已下载模型（切走后释放磁盘；正在使用/下载中的拒绝）。 */
    deleteModel(id: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** 启动下载（串行队列：忙时直接拒绝）。resolve 在任务终态（done/error/cancelled）。 */
    start(id: string): Promise<DownloadProgress>;
    /** 按给定目录项启动（测试缝：合成目录项驱动状态机，不触网）。 */
    startEntry(entry: CatalogEntry): Promise<DownloadProgress>;
    /** 取消当前任务：中断 fetch，保留 .part 断点。 */
    cancel(): boolean;
    private run;
    /** 下载单文件到最终路径（含续传与校验），返回该文件贡献的字节数。
     *  单文件失败自动重试（默认 2 次）+ **重试换缓存键**：镜像链路
     *  （Caddy×3 → CloudFront → Cloudflare）存在缓存对象污染窗口——同一时间窗内
     *  同一 URL 确定性拿到错误字节（2026-08-19 embeddinggemma generation_config.json
     *  连续错哈希的真实事故），普通重试会全打同一污染缓存；每次重试追加
     *  `?dshmem-retry=N` 参数绕开缓存键另取对象，窗口期也能自愈。
     *  - sha256 失配：downloadFileOnce 已删除断点 → 从零重下；
     *  - 数量不吻合/网络错误：断点保留 → Range 续传重试；
     *  - 取消：立即上抛不重试。 */
    private downloadFile;
    /** 单次尝试：续传探测 → fetch（attempt>0 追加缓存键参数）→ 落盘 → 尺寸与 sha256 校验 → rename。 */
    private downloadFileOnce;
    private freeBytes;
}
/**
 * 解析下载代理（三态）：`''`（默认）= 探测代理环境变量（HTTPS_PROXY > ALL_PROXY >
 * HTTP_PROXY，大小写双形态，尊重 NO_PROXY）；`'none'` = 禁用代理强制直连；
 * 其他值 = 显式代理 URL。与 curl/npm 同语义——用户配置了代理 env 的机器上
 * 镜像直连往往间歇不可达（真实事故：直连超时与污染字节交替出现）。
 */
export declare function resolveProxyUrl(setting: string | undefined, host: string): string;
export {};
