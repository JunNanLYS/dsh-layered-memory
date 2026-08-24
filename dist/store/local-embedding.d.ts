import type { MemoryLogger } from '../types.js';
import type { CatalogEntry } from './model-catalog.js';
import type { EmbedCallOptions, EmbeddingProviderInfo, EmbeddingService } from './embedding.js';
type LocalState = 'idle' | 'loading' | 'ready' | 'failed' | 'terminated';
/** worker 启动参数（workerData；构造后不可变）。 */
export interface EmbedWorkerData {
    runtimeDir: string;
    modelDir: string;
    pooling: 'cls' | 'mean';
    dtype: string;
    maxInputChars: number;
}
/** 主线程 → worker 的调用（id 由通道分配）。 */
export type EmbedWorkerCall = {
    type: 'ping';
} | {
    type: 'warmup';
} | {
    type: 'embed';
    texts: string[];
    priority: boolean;
};
/** worker → 主线程的应答。 */
export type EmbedWorkerReply = {
    id: number;
    ok: true;
    type: 'pong';
} | {
    id: number;
    ok: true;
    type: 'ready';
} | {
    id: number;
    ok: true;
    type: 'embedded';
    vectors: Float32Array[];
} | {
    id: number;
    ok: false;
    stage: 'load' | 'infer';
    error: string;
};
/** worker 通道抽象（测试缝：smoke 注入假实现验证协议与状态机）。 */
export interface EmbedWorkerChannel {
    request(call: EmbedWorkerCall): Promise<EmbedWorkerReply>;
    /** 立即终止 worker 并拒绝全部未决请求（close 语义）；幂等。 */
    terminate(): void;
    /** worker 意外崩溃通知（此后所有未决请求已被通道拒绝）。 */
    setOnCrash(cb: (error: string) => void): void;
}
export interface LocalEmbeddingOptions {
    /** 数据目录 runtime/（worker 据此 createRequire 加载 transformers）。 */
    runtimeDir: string;
    /** worker 资产路径（默认 dist/embedding-worker.cjs；测试可显式指定）。 */
    workerPath?: string;
    /** 通道注入缝（测试用；缺省 spawn 真实 worker）。 */
    channel?: EmbedWorkerChannel;
    logger?: MemoryLogger;
    maxInputChars?: number;
}
export declare class LocalEmbeddingService implements EmbeddingService {
    private state;
    private loadError;
    private readonly channel;
    private readonly entry;
    private readonly logger?;
    constructor(entry: CatalogEntry, modelDir: string, opts: LocalEmbeddingOptions);
    getDimensions(): number;
    getProviderInfo(): EmbeddingProviderInfo;
    isReady(): boolean;
    /** 状态（进度展示用）。 */
    getState(): LocalState;
    getLoadError(): string | null;
    /** 后台预热：启动后让 worker 立即加载模型（幂等；失败态可重试）。 */
    startWarmup(): void;
    /** 等待模型就绪（warmup 协议；applyChain 的 warming 阶段与测试用）。 */
    waitForReady(): Promise<void>;
    embed(text: string, callOpts?: EmbedCallOptions): Promise<Float32Array>;
    embedBatch(texts: string[], callOpts?: EmbedCallOptions): Promise<Float32Array[]>;
    /** 释放 worker 线程与模型（嵌入源切走/关闭时调用；幂等）。terminated 后不可
     *  再复用——防止插件卸载/切走后残留的重嵌循环把模型重新加载常驻（内存泄漏）。 */
    close(): void;
    /** 内层钳制（仅缩短）：超时放弃等待（迟到回复由通道按 id 丢弃），调用方降级。 */
    private requestWithTimeout;
    /** loading → ready 一次性日志（memory.log 时序可读性：启动到模型就绪的间隔）。 */
    private markReady;
    private applyLoadFailure;
}
export {};
