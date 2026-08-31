import type { L1Hit, MemoryFamily, MemoryLogger, MemoryRecord } from '../types.js';
import { type EmbeddingService } from './embedding.js';
import { type MemoryDb } from './sqlite.js';
export type RecallStrategy = 'keyword' | 'embedding' | 'hybrid';
export interface L1SearchOptions {
    /** 按记忆类型精确过滤（后置过滤，官方做法）。 */
    type?: string;
    /** 按族过滤（undefined = 不过滤，即 auto 档与浏览路径；检索唯一缝的族语义）。 */
    family?: MemoryFamily;
    /** 分数阈值（仅召回路径传；keyword/embedding 策略生效，FTS 含小语料例外；
     *  hybrid 按官方语义在 RRF 融合前不过滤）。 */
    scoreThreshold?: number;
    /** 嵌入查询内层钳制（ms，只缩短不放大；召回路径传入给 FTS 降级留时间）。 */
    embeddingTimeoutMs?: number;
}
export declare class L1Store {
    private readonly db;
    private readonly strategy;
    private readonly recordsDir;
    private readonly legacyFile;
    private readonly helper;
    private embedSvc;
    private readonly logger?;
    /** 时效衰减半衰期（天；0=关）。 */
    private readonly decayHalfLifeDays;
    constructor(dataDir: string, db: MemoryDb, embed?: EmbeddingService, strategy?: RecallStrategy, logger?: MemoryLogger, 
    /** 时效衰减半衰期（天；0=关）。缺省 30 与 config 默认一致。 */
    decayHalfLifeDays?: number);
    init(): Promise<void>;
    /** 旧版单文件 records.jsonl 一次性导入检索库，成功后改名 .imported。 */
    private importLegacy;
    get size(): number;
    /** 全量读取（调试/迁移用；检索请走 search）。 */
    all(): MemoryRecord[];
    /** 按 id 精确取记录（去重决策的版本号查询用，避免全表扫描）。 */
    getByIds(ids: string[]): MemoryRecord[];
    /** 新记忆落盘：JSONL 按天追加（事实源）+ 检索库 upsert + 向量。 */
    appendNew(records: MemoryRecord[]): Promise<void>;
    /** 去重 update/merge 产出的记录：只更新检索库（JSONL 事实源不改写，官方语义）。 */
    upsert(record: MemoryRecord): Promise<void>;
    /** 活切换嵌入源：同步换底层服务（嵌入源三态切换用）。 */
    setEmbeddingService(svc: EmbeddingService): void;
    deleteBatch(ids: string[]): Promise<void>;
    /**
     * 三策略检索（自动召回与 memory_search 工具共用接缝）。
     * embedding 不可用时自动降级 keyword；type 后置过滤；
     * scoreThreshold 仅对 keyword/embedding 单路策略生效——hybrid 按官方语义
     * 融合完整列表（融合分已归一化 0~1，可直接用于展示/过滤）。
     */
    search(query: string, limit: number, opts?: L1SearchOptions): Promise<L1Hit[]>;
    /**
     * 时效衰减加权（#29）：三路共用的读路径后处理——阈值过滤之后、截断之前
     * （才能轮转名额，而不只是重排已截断的集合）。updated_at 经主表批量点查
     * 回填（FTS 表无该列；候选池 ≤ limit×3 条主键查询，微秒级）。关闭时零开销。
     */
    private applyDecay;
    /** 浏览列表（UI 用）：无关键词时按更新时间倒序分页；since 为 ISO 时间下限（可选）。 */
    list(opts: {
        type?: string;
        scene?: string;
        family?: string;
        since?: string;
        limit: number;
        offset: number;
    }): {
        items: MemoryRecord[];
        total: number;
    };
    /** 近 N 天逐日更新计数（工作台活动图；索引化 GROUP BY）。 */
    countByDay(sinceIso: string): Array<{
        day: string;
        n: number;
    }>;
    /** 场景名去重列表（UI 筛选器数据源）。 */
    distinctScenes(): string[];
    /**
     * 去重候选召回（官方 3 级）：空库跳过 → 向量优先 → FTS 兜底。
     * 传入 family 时只在同族记录里召回（去重永不跨族）。
     */
    searchCandidates(query: string, limit: number, family?: MemoryFamily): Promise<MemoryRecord[]>;
    /**
     * 增量重嵌入（embedding 配置变化 / 周期性补齐用）：只处理缺失向量的记录，
     * 排除已判定"当前 provider 不可嵌入"的 skip 集。返回写入/失败/跳过数——
     * failed > 0 时调用方不应标记 meta 同步完成；skipped（零向量）不算失败、
     * 不阻塞同步标记（否则补齐判据永不收敛，每 30 分钟全量重嵌死循环）。
     * onProgress/shouldCancel 供活切换（D5）的进度展示与取消。
     */
    reindex(opts?: {
        onProgress?: (done: number, total: number) => void;
        shouldCancel?: () => boolean;
    }): Promise<{
        written: number;
        failed: number;
        skipped: number;
        cancelled?: boolean;
    }>;
    private postProcess;
}
