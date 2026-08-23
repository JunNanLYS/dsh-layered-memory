import type { EmbeddingProviderInfo } from './embedding.js';
import type { L0MessageRecord, MemoryFamily, MemoryLogger, MemoryRecord } from '../types.js';
export interface StoreInitResult {
    /** embedding 配置（provider/model/维度）变化，需要后台全量重嵌入。 */
    needsReindex: boolean;
    reason?: string;
}
export interface StoreCapabilities {
    ftsSearch: boolean;
    vectorSearch: boolean;
}
/** L1 检索命中（含 BM25/余弦归一分数）。 */
export interface L1SearchHit {
    id: string;
    content: string;
    type: string;
    priority: number;
    scene_name: string;
    score: number;
    family: MemoryFamily;
}
/** L0 检索命中。 */
export interface L0SearchHit extends L0MessageRecord {
    score: number;
}
export declare class MemoryDb {
    private db;
    private degraded;
    private ftsAvailable;
    private vecLoaded;
    private vecLoadWarned;
    /** 向量维度：活切换嵌入源（D5）时会变——vec0 表随维度重建。 */
    private dimensions;
    private readonly logger?;
    private stmtUpsertL1;
    private stmtGetL1;
    /** 主表存在性点查（防御性 FTS 删除的前置判断，走主键索引）。 */
    private stmtL1Exists;
    private stmtDeleteL1Meta;
    private stmtDeleteL1Vec?;
    private stmtInsertL1Vec?;
    private stmtSearchL1Vec?;
    private stmtL1FtsInsert;
    private stmtL1FtsDelete;
    private stmtL1FtsSearch;
    private stmtL1FtsSearchFamily;
    private stmtUpsertL0;
    private stmtGetL0;
    /** 主表存在性点查（同 L1：防御性 FTS 删除的前置判断）。 */
    private stmtL0Exists;
    private stmtDeleteL0Vec?;
    private stmtInsertL0Vec?;
    private stmtSearchL0Vec?;
    private stmtL0FtsInsert;
    private stmtL0FtsDelete;
    private stmtL0FtsSearch;
    constructor(dbPath: string, dimensions: number, logger?: MemoryLogger);
    isDegraded(): boolean;
    getCapabilities(): StoreCapabilities;
    /**
     * 加载 sqlite-vec 扩展并建 schema。构造后必须调用一次。
     * providerInfo 变化（provider/model/维度）时 drop 向量表并返回 needsReindex。
     */
    init(providerInfo?: EmbeddingProviderInfo): StoreInitResult;
    /** 惰性加载 sqlite-vec（纯 FTS 起步后切本地嵌入时补加载）；失败只停用向量能力并告警一次。 */
    private ensureVecLoaded;
    /**
     * 活切换嵌入源（D5）：provider/model/维度任一变化 → drop 向量表按新维度重建，
     * 返回 needsReindex=true（调用方后台重嵌，全部成功后 markEmbeddingSynced）；
     * 配置未变化 → false（切回同一模型不重嵌）。
     * 新维度 > 0 但 sqlite-vec 不可用 → ok=false（调用方向用户说明，维持 FTS）。
     */
    swapProvider(info: EmbeddingProviderInfo): {
        ok: boolean;
        needsReindex: boolean;
        error?: string;
    };
    /** l1_vec 物理表的向量维度（建表 DDL 里的 float[N]）；无表返回 null。 */
    private physicalVecDims;
    private initSchema;
    private prepareL1VecStatements;
    private prepareL0VecStatements;
    private dropVectorTables;
    private tableExists;
    private hasColumn;
    /** 重建后的 l1_fts 从 l1_records 全量回灌（仅在 drop 重建时调用）。 */
    private backfillL1Fts;
    /** 重建后的 l0_fts 从 l0_conversations 全量回灌（仅 drop 重建时调用；iterate 流式防大库内存峰值）。 */
    private backfillL0Fts;
    private readEmbeddingMeta;
    private writeEmbeddingMeta;
    /** 通用字符串 kv（embedding_meta 表兼作元数据 kv 存储，如 FTS 分词器版本戳）。 */
    private readMetaString;
    private writeMetaString;
    /**
     * 持久化 embedding meta（语义：物理向量表当前对应的 provider/维度）。
     * 活切换在 swapProvider 成功后即写（表已是新维度）；启动/补齐链在
     * 缺失向量补齐收敛（missing=0）后写——缺失行补齐判据是行数差，
     * 不依赖 meta（review P7 语义在 backfill 计数判据下仍然收敛）。
     */
    markEmbeddingSynced(info: EmbeddingProviderInfo): void;
    /** upsert 一条 L1（元数据 + FTS 同步；embedding 非零时写向量）。失败返回 false 不抛。 */
    upsertL1(record: MemoryRecord, embedding?: Float32Array): boolean;
    /**
     * 批量 upsert L1（单事务；与单条同语义：FTS 失败整批回滚）。
     * 追加/导入热路径用它——逐条开事务在 WAL FULL 下每条一次 fsync。
     * 整批失败时回退逐条写入：好记录照常入库、坏记录只丢自身——否则
     * JSONL 事实源已先行追加，检索库却整批缺失且无自动重导路径（批次空洞）。
     */
    upsertL1Batch(records: MemoryRecord[], embeddings?: Array<Float32Array | undefined>): boolean;
    /** 事务内的单条写入体（upsertL1 / upsertL1Batch 共用；调用方负责 BEGIN/COMMIT）。 */
    private upsertL1InTx;
    /** 批量删除 L1（元数据 + 向量 + FTS），返回删除条数。IN 按 ≤900 分块（避变量数上限）。 */
    deleteL1Batch(ids: string[]): number;
    /** 按块缓存的 IN 语句（表名/动作/尺寸 → 预编译语句）：热路径不再每次动态 prepare。 */
    private readonly inStmts;
    private inStatement;
    /**
     * 清空 L1 检索库全部数据（重建用）。records/FTS 直接 DELETE；
     * 向量表走 DROP + 重建（vec0 的全表 DELETE 语义不可靠，dropVectorTables
     * 会连 l0_vec 一起删——L0 向量必须保留——故此处单独处理 l1_vec）。
     * L0 表与 embedding_meta 不动：backfill 的行数比对天然重新一致。
     */
    clearL1(): boolean;
    countL1(): number;
    /** 全量读取（调试/迁移/重嵌入用；检索请走 FTS/向量）。 */
    getAllL1(): MemoryRecord[];
    getL1ByIds(ids: string[]): MemoryRecord[];
    /** 浏览列表（UI 用）：按更新时间倒序，支持类型/场景/族过滤与分页。失败返回空。 */
    listL1(opts: {
        type?: string;
        scene?: string;
        family?: string;
        limit: number;
        offset: number;
    }): {
        items: MemoryRecord[];
        total: number;
    };
    /** 场景名去重列表（UI 筛选器数据源）。失败返回空。 */
    distinctL1Scenes(): string[];
    /** FTS5 BM25 检索（family 缺省不过滤）。失败返回空数组（调用方降级）。 */
    searchL1Fts(query: string, limit: number, family?: string): L1SearchHit[];
    /** vec0 余弦 KNN 检索（score = 1 - cosine distance；family 过滤走过度召回 + 回查过滤，vec0 无法 WHERE）。失败返回空数组。 */
    searchL1Vector(embedding: Float32Array, topK: number, family?: string): L1SearchHit[];
    /** 批量 upsert L0 消息（元数据 + FTS；embeddings 与 records 等长，可省略）。 */
    upsertL0Batch(records: L0MessageRecord[], embeddings?: Array<Float32Array | undefined>): boolean;
    countL0(): number;
    /** 统计 recorded_at >= iso 的消息数（状态面板"今日捕获"用）。 */
    countL0Since(iso: string): number;
    /** 统计某会话已捕获消息数（session-stats 数据源；idx_l0_session_id 索引点查）。 */
    countL0BySession(sessionId: string): number;
    /** 按会话取最近消息（时间升序返回；走 idx_l0_session_id 索引）。
     *  蒸馏背景参考专用——按会话现查替代全局内存数组（ADR-0003）。 */
    recentL0BySession(sessionId: string, limit: number): L0MessageRecord[];
    /** L0 全量列举（重建快照用；按时间升序，事务一致性避开 JSONL 追加竞态）。 */
    listL0All(): L0MessageRecord[];
    /** 重建成本预估（一次全表聚合：会话数 / 消息数 / 字符量）。 */
    l0RebuildEstimate(): {
        sessions: number;
        messages: number;
        chars: number;
    };
    /** 向量表行数（backfill 判据：与元数据行数的差值即缺失向量数；不可用时返回 -1）。 */
    countL1Vec(): number;
    countL0Vec(): number;
    searchL0Fts(query: string, limit: number): L0SearchHit[];
    searchL0Vector(embedding: Float32Array, topK: number): L0SearchHit[];
    /** L1 缺失向量的记录数（排除 skip 集后的补齐判据；向量能力不可用返回 -1）。 */
    countL1VecMissing(exclude?: Set<string>): number;
    /** L0 缺失向量的记录数（同上）。 */
    countL0VecMissing(exclude?: Set<string>): number;
    /**
     * 待重嵌入的 L1：只取缺失向量的记录（增量），排除 skip 集里已判定
     * "当前 provider 下不可嵌入（零向量）"的 id——缺 1 条不再全量重嵌，
     * 零向量记录也不再反复喂给 embeddings API（H1 死循环双根因）。
     */
    getL1ForReindex(exclude?: Set<string>): Array<{
        id: string;
        content: string;
    }>;
    /** 待重嵌入的 L0（增量 + 排除 skip 集，同 getL1ForReindex）。 */
    getL0ForReindex(exclude?: Set<string>): Array<{
        id: string;
        text: string;
    }>;
    getVecSkipSet(kind: 'l1' | 'l0'): Set<string>;
    addVecSkippedIds(kind: 'l1' | 'l0', ids: string[]): void;
    clearVecSkipIds(kind: 'l1' | 'l0'): void;
    /** 只更新向量行（重嵌入用）。 */
    updateL1Vec(id: string, embedding: Float32Array): boolean;
    updateL0Vec(id: string, embedding: Float32Array, recordedAt: string): boolean;
    /**
     * 批量更新 L1 向量行（重嵌入热路径）：单事务写入整批，替代逐条裸写——
     * 逐条每行一次隐式事务，批量场景（万级记录重嵌）开销集中在 fsync 上。
     * 整批失败回退逐条：好行照常入库，坏行只丢自身（向量行 id 寻址，无顺序依赖）。
     * 返回成功写入的行数（零向量行防御性跳过、不计入）。
     */
    updateL1VecBatch(items: Array<{
        id: string;
        embedding: Float32Array;
    }>): number;
    /** L0 版 updateL1VecBatch（语义同：单事务 + 失败回退逐条）。recordedAt 整批统一。 */
    updateL0VecBatch(items: Array<{
        id: string;
        embedding: Float32Array;
    }>, recordedAt: string): number;
    close(): void;
}
/** 全零向量（cosine 未定义，不可入向量表）。reindex 侧用它区分"不可嵌入"与"写入失败"。 */
export declare function isZeroVector(vec: Float32Array): boolean;
