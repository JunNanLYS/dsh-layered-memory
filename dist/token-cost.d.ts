/**
 * 蒸馏成本看板账本：把每次蒸馏调用（model × layer）的 token 成本写入 SQLite 明细表。
 *
 * 模块级单例 + init 注入 db：callLLM 拿不到 db（db 在 index.ts 运行时创建），
 * 故通过 initTokenCost(db) 在插件启动时注入；recordCostCall 每次调用写一行明细。
 *
 * 与作者 llm-usage.ts 的关系：作者是"按 layer 累计的纯内存计数器"（给 bench 用）；
 * 本模块补上三个缺口——按 model 分组、持久化（365 天明细）、面向 UI 成本看板。
 */
import type { DistillLayer } from './llm-usage.js';
import type { CostByModel, MemoryDb } from './store/sqlite.js';
/** 插件启动时注入 db（index.ts 调用）。 */
export declare function initTokenCost(d: MemoryDb): void;
/** 插件卸载时清空 db 引用（index.ts 的 ctx.effect 清理里调用，防悬空引用）。 */
export declare function resetTokenCost(): void;
/** 记录一次蒸馏调用成本（callLLM 出口调用；provider/model 由调用方传入）。 */
export declare function recordCostCall(provider: string, model: string, layer: DistillLayer, inputChars: number, outputTokens: number, reasoningTokens: number): void;
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
/** 成本看板时间粒度（趋势图 + 统计口径共用）。 */
export type Granularity = 'day' | 'week' | 'month';
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
/** 成本看板快照（dsh-memory/token-cost 端点返回值）。 */
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
/** 读成本看板快照（db 未注入/降级时返回全零结构，不抛错；rangeDays>0 = 趋势展示近 N 天）。 */
export declare function snapshotTokenCost(granularity: Granularity, rangeDays: number): CostSnapshot;
