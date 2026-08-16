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
    private readonly dimensions;
    private readonly logger?;
    private stmtUpsertL1;
    private stmtGetL1;
    private stmtDeleteL1Meta;
    private stmtDeleteL1Vec?;
    private stmtInsertL1Vec?;
    private stmtSearchL1Vec?;
    private stmtL1FtsInsert;
    private stmtL1FtsDelete;
    private stmtL1FtsSearch;
    private stmtL1FtsSearchFamily;
    private stmtUpsertL0;
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
    private initSchema;
    private prepareL1VecStatements;
    private prepareL0VecStatements;
    private dropVectorTables;
    private tableExists;
    private hasColumn;
    /** 重建后的 l1_fts 从 l1_records 全量回灌（仅在 drop 重建时调用）。 */
    private backfillL1Fts;
    private readEmbeddingMeta;
    private writeEmbeddingMeta;
    /**
     * 标记当前向量与 embedding 配置同步完成（持久化 meta）。
     * 只应在重嵌入成功（或空库无历史向量）后调用——过早写入会让下次启动
     * 比对通过而跳过补齐，向量表永远空着（review P7）。
     */
    markEmbeddingSynced(info: EmbeddingProviderInfo): void;
    /** upsert 一条 L1（元数据 + FTS 同步；embedding 非零时写向量）。失败返回 false 不抛。 */
    upsertL1(record: MemoryRecord, embedding?: Float32Array): boolean;
    /** 批量删除 L1（元数据 + 向量 + FTS），返回删除条数。 */
    deleteL1Batch(ids: string[]): number;
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
    /** 向量表行数（backfill 判据：与元数据行数的差值即缺失向量数；不可用时返回 -1）。 */
    countL1Vec(): number;
    countL0Vec(): number;
    searchL0Fts(query: string, limit: number): L0SearchHit[];
    searchL0Vector(embedding: Float32Array, topK: number): L0SearchHit[];
    getL1ForReindex(): Array<{
        id: string;
        content: string;
    }>;
    getL0ForReindex(): Array<{
        id: string;
        text: string;
    }>;
    /** 只更新向量行（重嵌入用）。 */
    updateL1Vec(id: string, embedding: Float32Array): boolean;
    updateL0Vec(id: string, embedding: Float32Array, recordedAt: string): boolean;
    close(): void;
}
