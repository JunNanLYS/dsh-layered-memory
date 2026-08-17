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
    /** 测试注入；默认全局 fetch。 */
    fetchImpl?: FetchLike;
    /** 测试注入磁盘剩余字节；默认 statfs。 */
    freeBytes?: () => Promise<number | null>;
}
export declare class ModelDownloadQueue {
    private readonly dataDir;
    private readonly opts;
    private progress;
    private busy;
    private abort;
    constructor(dataDir: string, opts: DownloaderOptions);
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
    /** 下载单文件到最终路径（含续传与校验），返回该文件贡献的字节数。 */
    private downloadFile;
    private freeBytes;
}
export {};
