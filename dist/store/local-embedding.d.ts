/**
 * 本地嵌入服务（D1/D6 决策）：transformers.js + ONNX，进程内 CPU 推理。
 *
 * - 懒加载（D6）：首次嵌入调用才加载模型（下载完成后的预热也走这里），
 *   加载后常驻，close() 释放（嵌入源切走/关闭时调用）；
 * - 模型从数据目录 models/<id>/ 本地加载（env.allowRemoteModels=false 杜绝联网）；
 * - loader 可注入（测试缝）：不依赖真实 transformers.js/模型文件即可测状态机；
 * - 池化方式来自模型目录（BGE 系 CLS / Gemma 系 MEAN），normalize 交给 pipeline
 *   内建 L2 归一（与远程路径的 sanitizeAndNormalize 语义一致）。
 *
 * 注意：真实模型路径的池化正确性（尤其 embeddinggemma 的 mean）属于实现期
 * 待验证项——下载预热后应做一次相似度 sanity 检查（见 PR 验证指引）。
 */
import type { MemoryLogger } from '../types.js';
import type { CatalogEntry } from './model-catalog.js';
import type { EmbeddingProviderInfo, EmbeddingService } from './embedding.js';
/** transformers.js 的 feature-extraction pipeline 最小面（结构化注入缝）。 */
export interface ExtractorLike {
    (texts: string[], opts: {
        pooling: 'cls' | 'mean';
        normalize: boolean;
    }): Promise<Array<{
        data: number[] | Float32Array;
    }>>;
    dispose?: () => Promise<void> | void;
}
export interface TransformersModuleLike {
    pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<ExtractorLike>;
    env?: {
        allowLocalModels?: boolean;
        allowRemoteModels?: boolean;
    };
}
/** 模块加载器（默认走 RuntimeInstaller.resolveModule；测试注入假模块）。 */
export type ModuleLoader = () => Promise<TransformersModuleLike>;
type LocalState = 'idle' | 'loading' | 'ready' | 'failed' | 'terminated';
export declare class LocalEmbeddingService implements EmbeddingService {
    private state;
    private extractor;
    private loadPromise;
    private loadError;
    private readonly modelDir;
    private readonly entry;
    private readonly loader;
    private readonly logger?;
    /** 输入截断（与远程路径同源的 embedding.maxInputChars 配置，缺省 5000）。 */
    private readonly maxInputChars;
    constructor(entry: CatalogEntry, modelDir: string, loader: ModuleLoader, logger?: MemoryLogger, maxInputChars?: number);
    getDimensions(): number;
    getProviderInfo(): EmbeddingProviderInfo;
    isReady(): boolean;
    /** 状态（进度展示用）。 */
    getState(): LocalState;
    getLoadError(): string | null;
    /** 后台预热：下载完成后验证可加载性（幂等；失败态可重试）。 */
    startWarmup(): void;
    /** 等待预热完成（测试用）。 */
    waitForReady(): Promise<void>;
    embed(text: string): Promise<Float32Array>;
    embedBatch(texts: string[]): Promise<Float32Array[]>;
    /** 释放模型（嵌入源切走/关闭时调用；幂等）。terminated 后不可再复用——
     * 防止插件卸载/切走后残留的重嵌循环把模型重新加载常驻（内存泄漏）。 */
    close(): void;
    private ensureLoaded;
}
export {};
