/**
 * Embedding 服务（移植 MemoryCore embedding.ts 的裁剪版，仅保留远程 OpenAI 兼容实现）。
 * dsh 的 ctx.llm 只有 chat 流式接口、无 embeddings 端点，因此向量能力
 * 需要用户自备任意 OpenAI 兼容 /embeddings 服务（OpenAI/SiliconFlow/Jina/自托管 BGE 等）。
 * 默认关闭（Noop）——纯 FTS 模式即可运行，这是官方 provider="none" 的同款语义。
 */
import type { MemoryLogger } from '../types.js';
export interface EmbeddingProviderInfo {
    provider: string;
    model: string;
    dimensions: number;
}
export interface EmbeddingService {
    embed(text: string): Promise<Float32Array>;
    embedBatch(texts: string[]): Promise<Float32Array[]>;
    getDimensions(): number;
    getProviderInfo(): EmbeddingProviderInfo;
    isReady(): boolean;
    close?(): void;
}
/** 空实现：向量能力关闭/不可用时使用，一切调用安全返回。 */
export declare class NoopEmbeddingService implements EmbeddingService {
    getDimensions(): number;
    getProviderInfo(): EmbeddingProviderInfo;
    isReady(): boolean;
    embed(): Promise<Float32Array>;
    embedBatch(texts: string[]): Promise<Float32Array[]>;
}
export interface RemoteEmbeddingOptions {
    baseUrl: string;
    apiKey: string;
    model: string;
    /** 必填且须与模型输出一致（vec0 建表需要固定维度）。 */
    dimensions: number;
    maxInputChars?: number;
    timeoutMs?: number;
    logger?: MemoryLogger;
}
/**
 * OpenAI 兼容远程 embedding：POST {baseUrl}/embeddings。
 * 向量在客户端做 L2 归一化（与余弦度量配套，照搬官方 sanitizeAndNormalize）。
 */
export declare class RemoteEmbeddingService implements EmbeddingService {
    private readonly opts;
    constructor(opts: RemoteEmbeddingOptions);
    getDimensions(): number;
    getProviderInfo(): EmbeddingProviderInfo;
    isReady(): boolean;
    embed(text: string): Promise<Float32Array>;
    embedBatch(texts: string[]): Promise<Float32Array[]>;
}
/**
 * 嵌入调用降级助手（L0/L1 Store 共用）：查询向量失败 → undefined（调用方降级 FTS）；
 * 批量嵌入失败 → 全 undefined（跳过向量写入，由周期性 backfill 补齐）。
 * 同类失败只告警一次，避免刷屏。
 */
export declare class EmbedHelper {
    private readonly embed;
    private readonly logger?;
    private warned;
    constructor(embed: EmbeddingService, logger?: MemoryLogger | undefined);
    vectorReady(): boolean;
    /** 查询向量；失败或空向量返回 undefined（调用方降级 FTS）。 */
    query(text: string): Promise<Float32Array | undefined>;
    /** 批量嵌入；服务未就绪或失败时返回全 undefined（不阻断元数据/FTS 写入）。 */
    batch(texts: string[]): Promise<Array<Float32Array | undefined>>;
    private warn;
}
