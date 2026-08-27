/**
 * RPC 契约单一事实源（types-only，零运行时代码）。
 *
 * 把 host（src/stats.ts 的 case 表）与 client（client/src，浏览器侧）共用的
 * 23 个 `dsh-memory/*` 端点请求/响应类型收敛到本模块——两端各自 `import type`，
 * 契约漂移在编译期暴露，而不是等 UI 渲染出 undefined 才发现。
 *
 * 铁律：
 * - 本文件**只允许 type/interface 与纯类型推导**，不 import 任何运行时值
 *   （tsc 会产出空 contract.js，client bundle 里 import type 被 esbuild 擦除）；
 * - 被迁移进来的类型在原模块保留 `export type { … } from './contract.js'`
 *   re-export，既有 import 路径不断裂；
 * - 响应类型按 stats.ts 实际返回逐字段建模（含 `chain.current[].reasoningEffort`
 *   与 `chain.effectiveChain[].effort` 这对**故意不同名**的字段——链上两种条目
 *   形状不同，不合并）。
 */
import type { MemoryFamily, MemoryMode } from './types.js';
/** 蒸馏思考档位：'' = 自动（模型默认档 → high）。词汇表运行时源是 config.ts 的
 *  EFFORT_CHOICES（`satisfies readonly EffortChoice[]` 反向锁定防漂移）。 */
export type EffortChoice = '' | 'off' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
/** 蒸馏用量/成本记账的层标识（llm-usage.ts 计数器口径）。 */
export type DistillLayer = 'l1-extract' | 'l1-dedup' | 'l2' | 'l3';
/** 分层输出预算的层键（与 DistillLayer 不同：预算按管线阶段分四层，用量按调用点分四层）。 */
export type DistillBudgetLayer = 'extract' | 'dedup' | 'l2' | 'l3';
/** 分层输出预算（token）：0 = 跟随内置默认。 */
export type DistillBudgets = Record<DistillBudgetLayer, number>;
/**
 * 运行时统一路由链条目：[0] = 主路由（provider/model 双空 = 跟随默认模型），
 * [1..] = 回退链（按序降级）；reasoningEffort 为该路由的档位覆盖（'' = 跟随部署全局）。
 */
export interface DistillChainEntry {
    provider: string;
    model: string;
    reasoningEffort: EffortChoice;
}
/** 部署静态回退链条目（config.llm.fallbacks）：reasoningEffort 可选——与运行时链
 *  DistillChainEntry（必填）形状不同，不共用类型。 */
export interface StaticFallbackEntry {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** 按层路由的层键（#34）：l1 同管 l1-extract + l1-dedup 两个调用点（与成本看板
 *  按层级归并口径同源）；预算键（DistillBudgetLayer）是另一套四键词表，不混用。 */
export type LayerRouteKey = 'l1' | 'l2' | 'l3';
/** 记忆模式运行时开关（settings-get/set 的 settings 载荷）。 */
export interface MemoryLiveSettings {
    /** 总开关：关 = 捕获/蒸馏/召回注入全停（数据保留） */
    enabled: boolean;
    /** L0 捕获（原始对话落盘） */
    capture: boolean;
    /** L1 抽取 + L2/L3 蒸馏 */
    distill: boolean;
    /** 召回注入（画像/记忆上下文） */
    recall: boolean;
    /** 蒸馏思考档位运行时覆盖：'' = 跟随静态 config（llm.reasoningEffort） */
    reasoningEffort: EffortChoice;
    /** 蒸馏模型运行时覆盖（供应商 id）：'' = 跟随静态 config/默认选择。
     *  与 distillModel 成对生效（单字段不算）；部署静态 pin（provider+model 双字段）优先。 */
    distillProvider: string;
    /** 蒸馏模型运行时覆盖（模型 id）：'' = 跟随静态 config/默认选择。 */
    distillModel: string;
    /** 运行时统一路由链（统一列表 UI 的存储形态，见 DistillChainEntry）；
     *  非空即权威（旧 distillProvider/distillModel/reasoningEffort 不再参与），
     *  空数组 = 跟随部署静态配置与默认模型。 */
    distillChain: DistillChainEntry[];
    /** 分层输出预算运行时覆盖（token）：extract/dedup/l2/l3 四层，0 = 跟随内置默认；
     *  思考档 high/max 的 ×4 放大在覆盖值之上照常生效。 */
    distillBudgets: DistillBudgets;
    /** 输入预算运行时覆盖（字符，≈token）：单次蒸馏调用的输入上限，L1 按此分块、
     *  超限截断；0 = 跟随静态配置 llm.maxInputChars。 */
    distillMaxInputChars: number;
    /** 运行时按层路由链（#34）：层键 l1/l2/l3 各一条完整链（条目同 DistillChainEntry）；
     *  非空即完整接管该层解析（压过静态 layerRoutes，层内第一优先级）；空数组 = 该层
     *  跟随（静态层链 → 全局解析逐级兜底）。写入经 settings-set 逐层校验（头行必须显式）。 */
    distillLayerChains: Record<LayerRouteKey, DistillChainEntry[]>;
}
/** 单会话召回统计（悬浮卡信息区数据源；口径见 recall.ts 注释）。 */
export interface RecallSessionStats {
    /** 发生过召回检索的轮次数（含零命中、全量压制与超时）。 */
    injectedTurns: number;
    /** 命中（≥1 条实际注入，或有命中但被去重全量压制）轮次数。 */
    hitTurns: number;
    /** 累计注入条数（去重过滤后、预算截断前）。 */
    totalHits: number;
    /** 总预算超时跳过次数。 */
    timeouts: number;
    /** 累计被去重压制的命中条数（同会话已注入过，不重复注入）。 */
    suppressedRecalls: number;
    /** 最近一轮实际注入条数（0 = 零命中/超时/全量压制；工具指南门控沿用此信号）。 */
    lastHits: number;
    /** 最近一轮检索耗时 ms。 */
    lastDurationMs: number;
    /** 最近一次记账时间（LRU 清理依据）。 */
    updatedAt: number;
}
/**
 * 单会话记忆上下文占用（session-stats.memoryOccupancy；悬浮卡与输入栏占用指示器共用）。
 * 形状与算术的唯一来源是 util/context-occupancy 的 OccupancyLedger——官方 token-meter
 * 同式启发式，禁止任何一侧另写换算。null = 本会话从未注入过。
 */
export type MemoryOccupancy = import('./util/context-occupancy.js').OccupancyLedger;
/** 重建阶段。 */
export type RebuildPhase = 'idle' | 'preparing' | 'distilling' | 'finalizing' | 'done' | 'cancelled' | 'failed';
/** 重建状态（rebuild-status/start/cancel 端点返回值）。 */
export interface RebuildStatus {
    running: boolean;
    phase: RebuildPhase;
    /** 已完成的会话块数 / 总块数。 */
    done: number;
    total: number;
    /** L0 体量（idle 时为实时预估，运行中为快照值）。 */
    sessionCount: number;
    messageCount: number;
    /** 预计 LLM 抽取调用次数（下界估算：块数与字符预算取大）。 */
    estCalls: number;
    /** 重建产出的 L1 记录累计条数。 */
    recordsBuilt: number;
    cancelRequested: boolean;
    startedAt: number | null;
    finishedAt: number | null;
    error: string | null;
    /** 归档产物名（提示用户可手工找回）。 */
    archiveNote: string | null;
}
/** 概览统计（dsh-memory/stats 端点返回值）。 */
export interface MemoryStats {
    ok: boolean;
    dataDir: string;
    /** 新会话默认记忆档位（auto/chat/work）。 */
    family: string;
    version: string;
    l0Today: number;
    l1Count: number;
    l1TotalExtracted: number;
    sceneCount: number;
    personaChars: number;
    hasPersona: boolean;
    lastExtractAt: string | null;
    lastL2At: string | null;
    lastL3At: string | null;
    memoriesSinceL2: number;
    memoriesSinceL3: number;
    pendingExtract: number;
    message: string;
    /** 实际生效的阈值（概览进度分母用，避免 UI 硬编码与部署配置脱节）。 */
    thresholds: {
        l2MinNewMemories: number;
        l3Interval: number;
    };
}
/** 成本看板时间粒度（趋势图 + 统计口径共用）。 */
export type Granularity = 'day' | 'week' | 'month';
/** 成本看板单个时间窗口（day/week/month/all）。 */
export interface CostWindow {
    range: 'day' | 'week' | 'month' | 'all';
    /** 窗口起点（毫秒；all 为 0）。 */
    since: number;
    calls: number;
    inputChars: number;
    outputTokens: number;
    reasoningTokens: number;
    avgOutputTokens: number;
    medianOutputTokens: number;
}
/** 每模型统计指标（层级表格行；均值/中位数按 since=0 全量历史的活跃桶口径，非「最近窗口」）。 */
export interface ModelMetrics {
    model: string;
    dayCalls: number;
    weekCalls: number;
    monthCalls: number;
    dayOutput: number;
    dayMedian: number;
    weekOutput: number;
    weekMedian: number;
    monthOutput: number;
    monthMedian: number;
}
/** 每层级（l1/l2/l3）的模型统计（层级表格）。 */
export interface LayerMetrics {
    layer: 'l1' | 'l2' | 'l3';
    models: ModelMetrics[];
}
/** 层级 × 窗口矩阵里的单个窗口格子。 */
export interface LayerWindow {
    range: 'day' | 'week' | 'month' | 'all';
    calls: number;
    inputChars: number;
    outputTokens: number;
    reasoningTokens: number;
    avgOutputTokens: number;
    medianOutputTokens: number;
}
/** 单个层级在四个窗口的聚合（层级×窗口表格行）。 */
export interface LayerCost {
    layer: 'l1' | 'l2' | 'l3';
    windows: LayerWindow[];
}
/** 趋势单桶。 */
export interface TrendBucket {
    ts: number;
    total: number;
    byModel: Record<string, number>;
}
/** 趋势快照：三个层级各一份连续桶序列。 */
export interface TrendSnapshot {
    granularity: Granularity;
    byLayer: Record<'l1' | 'l2' | 'l3', TrendBucket[]>;
}
/** 按 model 分组的成本行（成本看板用）。 */
export interface CostByModel {
    provider: string;
    model: string;
    calls: number;
    inputChars: number;
    outputTokens: number;
    reasoningTokens: number;
}
/** 成本快照（dsh-memory/token-cost 端点返回值）。 */
export interface CostSnapshot {
    /** day/week/month/all 四窗口聚合。 */
    windows: CostWindow[];
    /** 全量窗口（all）按 model 分组。 */
    byModel: CostByModel[];
    /** 按层级（l1/l2/l3 归并）在四个窗口的聚合（层级×窗口表格）。 */
    byLayer: LayerCost[];
    /** 每层级的模型统计指标（层级表格）。 */
    byLayerStats: LayerMetrics[];
    /** 趋势图数据。 */
    trend: TrendSnapshot;
}
/** 嵌入源：远程 / 本地 / 关闭。 */
export type EmbeddingSourceKind = 'remote' | 'local' | 'off';
/** 嵌入运行时安装进度（runtime-installer）。 */
export interface RuntimeProgress {
    phase: 'idle' | 'installing' | 'ready' | 'error' | 'cancelled';
    /** 插件钉死的目标版本。 */
    targetVersion: string;
    /** runtime 里实际就位的版本（未安装为 null）。 */
    installedVersion: string | null;
    startedAt: number;
    /** 已运行毫秒（读时计算）。 */
    elapsedMs: number;
    /** npm 输出尾行（最近 5 行，让用户看到 npm 在干什么）。 */
    lastLines: string[];
    error?: string;
}
/** 下载阶段。 */
export type DownloadPhase = 'downloading' | 'verifying' | 'done' | 'cancelled' | 'error';
/** 模型下载进度（下载器 getProgress；无活动下载为 null）。 */
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
/** 嵌入源活切换阶段。 */
export type ApplyPhase = 'idle' | 'installing-runtime' | 'warming' | 'switching' | 'reindexing' | 'done' | 'error';
/** 重嵌入进度。 */
export interface ReindexProgressState {
    running: boolean;
    l1Done: number;
    l1Total: number;
    l0Done: number;
    l0Total: number;
    startedAt: number;
    cancelled: boolean;
    error?: string;
}
/** 嵌入源状态视图（embedding-state-get 端点的主体）。 */
export interface EmbeddingStateView {
    source: EmbeddingSourceKind;
    activeModel: string | null;
    ceilings: {
        remote: boolean;
        local: boolean;
    };
    runtime: RuntimeProgress;
    models: Array<{
        id: string;
        name: string;
        dims: number;
        contextTokens: number;
        tags: string[];
        description: string;
        totalBytes: number;
        bytesOnDisk: number;
        state: 'none' | 'partial' | 'downloaded';
    }>;
    download: DownloadProgress | null;
    apply: {
        phase: ApplyPhase;
        message: string;
        startedAt: number;
        busy: boolean;
    };
    local: {
        state: 'idle' | 'loading' | 'ready' | 'failed' | 'terminated';
        error: string | null;
    } | null;
    reindex: ReindexProgressState;
    activeNote?: string;
}
/** dsh-memory/stats */
export interface StatsResponse extends MemoryStats {
}
/** dsh-memory/token-cost */
export interface TokenCostRequest {
    granularity?: Granularity;
    /** 正整数且 ≤ 明细保留期（0/非法回退全量窗口）。 */
    rangeDays?: number;
}
export interface TokenCostResponse extends CostSnapshot {
}
/** dsh-memory/session-mode-get | set */
export interface SessionModeGetRequest {
    sessionId: string;
}
export interface SessionModeGetResponse {
    sessionId: string;
    mode: MemoryMode;
    defaultMode: MemoryMode;
}
export interface SessionModeSetRequest {
    sessionId: string;
    mode: MemoryMode;
}
export interface SessionModeSetResponse {
    sessionId: string;
    mode: MemoryMode;
}
/** dsh-memory/session-stats（悬浮卡信息区；热路径端点）。 */
export interface SessionStatsRequest {
    sessionId: string;
}
/** 蒸馏管线会话视图（runner 投影，lastDistillAt 已转 ISO）。 */
export interface SessionDistillView {
    pendingSlice: number;
    parkedSlices: number;
    threshold: number | null;
    producedRecords: number;
    lastDistillAt: string | null;
}
export type SessionStatsResponse = {
    supported: false;
} | {
    supported: true;
    sessionId: string;
    mode: MemoryMode;
    defaultMode: MemoryMode;
    recall: {
        enabled: boolean;
    } & RecallSessionStats;
    /** 记忆上下文占用账本（未注入过的会话为 null）。 */
    memoryOccupancy: MemoryOccupancy | null;
    /** 旧会话回填（票08）：host 侧估出的双通道份额——召回按 live 会话 surface 现扫
     *  （null = 会话不在 store），稳定区按当前组词折算。账本存在时客户端取两者较大值。 */
    occupancyBackfill: {
        recallTokens: number | null;
        profileTokens: number;
    } | null;
    /** 主对话模型的官方声明上下文窗口（占用占比分母；null = 未声明/解析失败，UI 降级隐藏占比）。 */
    contextWindowTokens: number | null;
    distill: SessionDistillView;
    l0Count: number;
    retrieval: 'hybrid' | 'vector' | 'keyword' | 'none';
    global: {
        degraded: boolean;
        pendingTotal: number;
        lastExtractAt: string | null;
    };
};
/** dsh-memory/settings-get */
export interface SettingsGetResponse {
    supported: boolean;
    settings: MemoryLiveSettings;
    /** 静态部署上限（cordis.patch.yml）：运行时开关与它取 AND。 */
    ceilings: {
        capture: boolean;
        distill: boolean;
        recall: boolean;
    };
    effort: {
        current: EffortChoice;
        effective: EffortChoice;
        fallback: EffortChoice;
        options: string[];
        route?: {
            provider: string;
            model: string;
        };
    };
    budgets: {
        current: DistillBudgets;
        defaults: DistillBudgets;
        effective: DistillBudgets;
    };
    inputBudget: {
        current: number;
        fallback: number;
        effective: number;
    };
}
/** dsh-memory/settings-set（patch 语义：只带要改的键）。 */
export interface SettingsSetRequest {
    enabled?: boolean;
    capture?: boolean;
    distill?: boolean;
    recall?: boolean;
    distillChain?: DistillChainEntry[];
    /** 运行时按层路由链（#34）：逐层 patch（只带要改的层；空数组 = 该层回到跟随）。 */
    distillLayerChains?: Partial<Record<LayerRouteKey, DistillChainEntry[]>>;
    reasoningEffort?: EffortChoice;
    distillProvider?: string;
    distillModel?: string;
    distillBudgets?: {
        extract: number;
        dedup: number;
        l2: number;
        l3: number;
    };
    distillMaxInputChars?: number;
}
export interface SettingsSetResponse {
    ok: true;
    settings: MemoryLiveSettings;
}
/** dsh-memory/list-records（记忆浏览器；hitToUiRecord 投影）。 */
export interface ListRecordsRequest {
    query?: string;
    type?: string;
    scene?: string;
    /** 1~200，默认 50。 */
    limit?: number;
    /** 0~1_000_000。 */
    offset?: number;
}
/** 浏览器卡片字段（比 MemoryRecord 精简，去掉大 metadata；epoch→ISO、snake→camel）。 */
export interface UiRecord {
    id: string;
    content: string;
    type: string;
    priority: number;
    scene: string;
    family: MemoryFamily | null;
    timestamps: string[];
    createdAt: string | null;
    updatedAt: string | null;
    version: number;
    sourceMessageIds: string[];
    /** 检索相关度（列表路径无 score → null）。 */
    score: number | null;
}
export interface ListRecordsResponse {
    items: UiRecord[];
    hasMore: boolean;
    /** 列表路径给总数；检索路径无法便宜计数 → null。 */
    total: number | null;
    /** 检索单次上限截断（结果可能不完整）。 */
    truncated: boolean;
    /** 场景筛选下拉选项（仅 offset===0 时附带）。 */
    scenes?: string[];
}
/** dsh-memory/scenes（两族拼接的混合视图）。 */
export interface ScenesResponse {
    items: Array<{
        path: string;
        family: MemoryFamily;
        summary: string;
        updated: string;
        heat: number;
        content: string;
    }>;
}
/** dsh-memory/persona（两族以 family 注释 + 分隔线拼接）。 */
export interface PersonaResponse {
    content: string;
}
/** dsh-memory/log-tail */
export interface LogTailRequest {
    /** 1~1000，默认 200。 */
    lines?: number;
}
export interface LogTailResponse {
    lines: string[];
}
/** dsh-memory/rebuild-* */
export type RebuildStatusResponse = {
    supported: false;
    running: false;
    phase: 'idle';
} | RebuildStatus;
/** dsh-memory/llm-providers（蒸馏路由链编辑器数据源）。 */
/** 生效链条目：effort 与 DistillChainEntry.reasoningEffort **不同名不合并**（链上两种条目形状的事实）。 */
export interface EffectiveChainRoute {
    provider: string;
    model: string;
    effort: string;
}
export interface LlmProvidersResponse {
    supported: true;
    providers: Array<{
        id: string;
        name: string;
    }>;
    default: {
        provider: string;
        model: string;
    } | null;
    /** 部署静态 pin（provider+model 双字段）优先于运行时选择，UI 据此禁用选择器。 */
    pinned: boolean;
    current: {
        provider: string;
        model: string;
    };
    /** 所选供应商是否仍在已注册路由中（用户删掉供应商后提示回退）。 */
    currentRegistered: boolean;
    effective: {
        provider: string;
        model: string;
    } | null;
    chain: {
        current: DistillChainEntry[];
        static: StaticFallbackEntry[];
        effectiveChain: EffectiveChainRoute[];
        source: 'runtime' | 'static';
    };
}
/** dsh-memory/llm-models */
export interface LlmModelsRequest {
    provider: string;
}
/** 模型条目（附思考档位能力表，探询失败/未声明 → 空表）。 */
export interface ModelWithEfforts {
    id: string;
    name: string;
    description: string | null;
    efforts: string[];
}
export interface LlmModelsResponse {
    provider: string;
    models: ModelWithEfforts[];
}
/** dsh-memory/embedding-state-get */
export type EmbeddingStateResponse = {
    supported: false;
} | ({
    supported: true;
} & EmbeddingStateView);
/** dsh-memory/embedding-source-set */
export interface EmbeddingSourceSetRequest {
    source: EmbeddingSourceKind;
    activeModel?: string | null;
}
export interface EmbeddingSourceSetResponse {
    accepted: true;
}
/** dsh-memory/embedding-download-start */
export interface EmbeddingDownloadStartRequest {
    modelId: string;
}
export interface EmbeddingDownloadStartResponse {
    accepted: true;
}
/** dsh-memory/embedding-download-cancel | runtime-cancel | reindex-cancel */
export interface EmbeddingCancelResponse {
    cancelled: boolean;
}
/** dsh-memory/embedding-model-delete */
export interface EmbeddingModelDeleteRequest {
    modelId: string;
}
export interface EmbeddingModelDeleteResponse {
    ok: boolean;
    error?: string;
}
export interface DshMemoryRequestMap {
    'dsh-memory/stats': Record<string, never>;
    'dsh-memory/token-cost': TokenCostRequest;
    'dsh-memory/session-mode-get': SessionModeGetRequest;
    'dsh-memory/session-mode-set': SessionModeSetRequest;
    'dsh-memory/session-stats': SessionStatsRequest;
    'dsh-memory/settings-get': Record<string, never>;
    'dsh-memory/settings-set': SettingsSetRequest;
    'dsh-memory/list-records': ListRecordsRequest;
    'dsh-memory/scenes': Record<string, never>;
    'dsh-memory/persona': Record<string, never>;
    'dsh-memory/log-tail': LogTailRequest;
    'dsh-memory/rebuild-status': Record<string, never>;
    'dsh-memory/rebuild-start': Record<string, never>;
    'dsh-memory/rebuild-cancel': Record<string, never>;
    'dsh-memory/llm-providers': Record<string, never>;
    'dsh-memory/llm-models': LlmModelsRequest;
    'dsh-memory/embedding-state-get': Record<string, never>;
    'dsh-memory/embedding-source-set': EmbeddingSourceSetRequest;
    'dsh-memory/embedding-download-start': EmbeddingDownloadStartRequest;
    'dsh-memory/embedding-download-cancel': Record<string, never>;
    'dsh-memory/embedding-model-delete': EmbeddingModelDeleteRequest;
    'dsh-memory/embedding-runtime-cancel': Record<string, never>;
    'dsh-memory/embedding-reindex-cancel': Record<string, never>;
}
export interface DshMemoryResponseMap {
    'dsh-memory/stats': StatsResponse;
    'dsh-memory/token-cost': TokenCostResponse;
    'dsh-memory/session-mode-get': SessionModeGetResponse;
    'dsh-memory/session-mode-set': SessionModeSetResponse;
    'dsh-memory/session-stats': SessionStatsResponse;
    'dsh-memory/settings-get': SettingsGetResponse;
    'dsh-memory/settings-set': SettingsSetResponse;
    'dsh-memory/list-records': ListRecordsResponse;
    'dsh-memory/scenes': ScenesResponse;
    'dsh-memory/persona': PersonaResponse;
    'dsh-memory/log-tail': LogTailResponse;
    'dsh-memory/rebuild-status': RebuildStatusResponse;
    'dsh-memory/rebuild-start': RebuildStatus;
    'dsh-memory/rebuild-cancel': RebuildStatus;
    'dsh-memory/llm-providers': LlmProvidersResponse;
    'dsh-memory/llm-models': LlmModelsResponse;
    'dsh-memory/embedding-state-get': EmbeddingStateResponse;
    'dsh-memory/embedding-source-set': EmbeddingSourceSetResponse;
    'dsh-memory/embedding-download-start': EmbeddingDownloadStartResponse;
    'dsh-memory/embedding-download-cancel': EmbeddingCancelResponse;
    'dsh-memory/embedding-model-delete': EmbeddingModelDeleteResponse;
    'dsh-memory/embedding-runtime-cancel': EmbeddingCancelResponse;
    'dsh-memory/embedding-reindex-cancel': EmbeddingCancelResponse;
}
/** 全部端点名（client 调用与 host case 表的共用字面量来源）。 */
export type DshMemoryEndpoint = keyof DshMemoryResponseMap;
