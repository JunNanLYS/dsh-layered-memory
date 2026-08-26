import type { MemoryConfig } from '../config.js';
import type { MemoryLogger } from '../types.js';
import type { EmbeddingProviderInfo, EmbeddingService } from './embedding.js';
import type { L0Store } from './l0.js';
import type { L1Store } from './l1.js';
import { LocalEmbeddingService } from './local-embedding.js';
import { ModelDownloadQueue } from './download-queue.js';
import { RuntimeInstaller } from './runtime-installer.js';
import type { MemoryDb } from './sqlite.js';
import type { EmbeddingSourceKind, EmbeddingStateView } from '../contract.js';
export type { ApplyPhase, EmbeddingSourceKind, EmbeddingStateView, ReindexProgressState } from '../contract.js';
export interface EmbeddingSourceState {
    source: EmbeddingSourceKind;
    /** source=local 时启用的目录模型 id。 */
    activeModel: string | null;
}
export declare class EmbeddingSourceStore {
    private state;
    private readonly file;
    private writeQueue;
    private readonly logger?;
    constructor(dataDir: string, logger?: MemoryLogger);
    get(): EmbeddingSourceState;
    init(): Promise<void>;
    set(next: EmbeddingSourceState): Promise<void>;
    private persist;
}
export interface InitialEmbedding {
    svc: EmbeddingService;
    dims: number;
    /** 传给 db.init 的 providerInfo（触发既有配置比对 → drop → needsReindex 链）。 */
    providerInfo?: EmbeddingProviderInfo;
    /** 解析降级原因（UI 展示）。 */
    note?: string;
}
/** 远程档部署上限：静态四件套 + enabled。 */
export declare function remoteCeiling(cfg: MemoryConfig): boolean;
export declare function resolveInitialEmbedding(cfg: MemoryConfig, sourceStore: EmbeddingSourceStore, downloader: ModelDownloadQueue, makeLocal: (modelId: string) => LocalEmbeddingService | null, logger?: MemoryLogger): Promise<InitialEmbedding>;
/** 本地服务构造工厂（index.ts 的初始解析与 Manager 共用一份实现，防漂移）。
 *  推理在 worker 线程（见 local-embedding.ts）；此处只传 runtime 目录与模型目录。 */
export declare function makeLocalServiceFactory(installer: RuntimeInstaller, downloader: ModelDownloadQueue, logger?: MemoryLogger, maxInputChars?: number): (modelId: string) => LocalEmbeddingService | null;
export interface EmbeddingManagerDeps {
    dataDir: string;
    cfg: MemoryConfig;
    db: MemoryDb;
    l0: L0Store;
    l1: L1Store;
    sourceStore: EmbeddingSourceStore;
    installer: RuntimeInstaller;
    downloader: ModelDownloadQueue;
    initial: InitialEmbedding;
    logger: MemoryLogger;
    /** 本地服务构造（默认用 makeLocalServiceFactory(installer, downloader)。 */
    makeLocal?: (modelId: string) => LocalEmbeddingService | null;
}
export declare class EmbeddingManager {
    readonly sourceStore: EmbeddingSourceStore;
    readonly installer: RuntimeInstaller;
    readonly downloader: ModelDownloadQueue;
    private readonly deps;
    private current;
    private localSvc;
    private applyPhase;
    private applyMessage;
    private applyStartedAt;
    private applyBusy;
    private reindex;
    private reindexCancel;
    /** 停机标志：dispose 后应用链不再推进（防卸载后的孤儿重嵌/安装）。 */
    private disposedFlag;
    /** 当前生效目标的 providerInfo（backfill/启动链的 meta 写入用——杜绝陈旧闭包）。 */
    private currentInfo;
    /** 初始解析的降级说明（活切换成功后清空，防过期提示常驻）。 */
    private activeNote;
    constructor(deps: EmbeddingManagerDeps);
    /** 当前目标的 providerInfo（index.ts 的启动重嵌链/周期 backfill 写 meta 用）。 */
    currentProviderInfo(): EmbeddingProviderInfo | undefined;
    /** 取消运行时安装（RPC：npm 卡死/用户主动放弃）。 */
    cancelRuntimeInstall(): boolean;
    /** 当前生效服务（index.ts 初始建 store 用）。 */
    getService(): EmbeddingService;
    /** 构造绑定真实运行时 loader 的本地服务（deps.makeLocal 可注入，测试替换）。 */
    private makeLocalService;
    /** 活切换请求：验证通过即接受，后台执行应用链（进度轮询可见）。 */
    requestSource(next: {
        source: EmbeddingSourceKind;
        activeModel?: string | null;
    }): {
        accepted: boolean;
        error?: string;
    };
    /** 下载启动（串行队列忙时拒绝）；完成后自动做一次可加载性预热验证（D6）。 */
    startDownload(modelId: string): {
        ok: boolean;
        error?: string;
    };
    cancelDownload(): boolean;
    deleteModel(modelId: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    cancelReindex(): boolean;
    /** 应用链/后台任务是否在跑（backfill 并发门禁用）。 */
    isBusy(): boolean;
    /** 停机钩子（插件 dispose）：取消 npm 安装、下载与重嵌——不留后台孤儿任务。 */
    dispose(): void;
    private applyChain;
    private reindexNow;
    /** RPC 快照（设置页嵌入区块数据源；client 忙时 1s 轮询）。 */
    snapshot(): Promise<EmbeddingStateView>;
}
