/**
 * 蒸馏成本账本（token_cost 明细表）：从 sqlite.ts 巨石拆出的第一刀（体检 P1）。
 *
 * 职责：明细写入（写入时按保留期滚动清理）+ 四路聚合查询（单窗口总览 / 按模型 /
 * 按层级归并 / 按时间桶）。与检索引擎零关系——唯一的耦合是共享同一个
 * node:sqlite 连接。成本看板是增强能力：降级/异常一律返回零值，不向上抛错。
 *
 * 接口策略：MemoryDb 的四个同名公开方法保持原签名做一行委托（"拆文件不拆接口"），
 * 既有调用方（token-cost.ts / smoke）零改动。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { CostByModel } from '../contract.js';
import type { MemoryLogger } from '../types.js';
/** token_cost 单窗口成本聚合（成本看板用）。 */
export interface CostAggregate {
    calls: number;
    inputChars: number;
    outputTokens: number;
    reasoningTokens: number;
    /** 单次调用输出 token 均值（无数据为 0）。 */
    avgOutputTokens: number;
    /** 单次调用输出 token 中位数（无数据为 0）。 */
    medianOutputTokens: number;
}
/** 按层级（l1/l2/l3 归并）分组的成本行。 */
export interface CostByLayer {
    layer: string;
    calls: number;
    inputChars: number;
    outputTokens: number;
    reasoningTokens: number;
    avgOutputTokens: number;
    medianOutputTokens: number;
}
/** 按时间桶 + provider/model 聚合的扁平行（趋势图与日均/周均/月均 + 中位数统计共用）。 */
export interface BucketRow {
    bucket: number;
    provider: string;
    model: string;
    calls: number;
    outputTokens: number;
    reasoningTokens: number;
}
export declare class CostLedger {
    private db;
    private logger;
    private stmtInsert;
    private stmtDelete;
    /** init 是否成功（未就绪 = 宿主库降级，方法全部返回零值不抛错）。 */
    get ready(): boolean;
    /** 建表 + 迁移 + 语句缓存（MemoryDb.initSchema 内调用；失败冒泡触发库级降级）。 */
    init(db: DatabaseSync, logger?: MemoryLogger): void;
    /**
     * 记录一次蒸馏调用成本（明细表，写入时按 retentionDays 滚动清理；0 = 永久保留）。
     * 失败/成功都记（token 照烧）；记账失败记 warn 但不阻断蒸馏（成本看板是增强能力）。
     */
    insertCostCall(provider: string, model: string, layer: string, inputChars: number, outputTokens: number, reasoningTokens: number, retentionDays: number): void;
    /**
     * 查询 token_cost 单窗口聚合（成本看板用；since 为毫秒起点，0 = 全量）。
     * 输入口径：inputChars 是字符（llm 流拿不到输入 token，沿用 llm-usage 的字符折算口径）。
     * median 需取 output_tokens 序列在 JS 侧算（SQLite 无内置 median 函数）。
     */
    aggregateCost(since: number): {
        total: CostAggregate;
        byModel: CostByModel[];
    };
    /**
     * 按层级归并聚合（l1 = l1-extract + l1-dedup；成本看板层级表格用）。
     * 降级/异常返回空数组，不抛错。
     */
    aggregateCostByLayer(since: number): CostByLayer[];
    /**
     * 按时间桶（bucketMs 毫秒）+ model 聚合，返回扁平行。
     * offsetMs 把桶边界对齐本地时区；layer 为空=全部，'l1' 归并 extract/dedup，其余精确匹配。
     * 趋势图与「日均/周均/月均 + 中位数」统计共用：JS 侧按不同 bucketMs 调三次再聚合。
     */
    aggregateByBucket(bucketMs: number, offsetMs: number, since: number, layer: string): BucketRow[];
}
