/**
 * 蒸馏成本看板账本：把每次蒸馏调用（model × layer）的 token 成本写入 SQLite 明细表。
 *
 * 模块级单例 + init 注入 db：callLLM 拿不到 db（db 在 index.ts 运行时创建），
 * 故通过 initTokenCost(db, retentionDays) 在插件启动时注入；recordCostCall 每次调用写一行明细。
 *
 * 与作者 llm-usage.ts 的关系：作者是"按 layer 累计的纯内存计数器"（给 bench 用）；
 * 本模块补上三个缺口——按 model 分组、持久化（保留期可配置，默认 365 天）、面向 UI 成本看板。
 */
import type { CostSnapshot, Granularity } from './contract.js';
import type { DistillLayer } from './llm-usage.js';
import type { MemoryDb } from './store/sqlite.js';
export type { CostWindow, Granularity, ModelMetrics, LayerMetrics, LayerWindow, LayerCost, TrendBucket, TrendSnapshot, CostSnapshot, } from './contract.js';
/** 插件启动时注入 db 与明细保留期（index.ts 调用；retentionDays 0 = 永久保留）。 */
export declare function initTokenCost(d: MemoryDb, retention: number): void;
/** 插件卸载时清空 db 引用（index.ts 的 ctx.effect 清理里调用，防悬空引用）。 */
export declare function resetTokenCost(): void;
/** 记录一次蒸馏调用成本（callLLM 出口调用；provider/model 由调用方传入）。 */
export declare function recordCostCall(provider: string, model: string, layer: DistillLayer, inputChars: number, outputTokens: number, reasoningTokens: number): void;
/** 读成本看板快照（db 未注入/降级时返回全零结构，不抛错；rangeDays>0 = 趋势展示近 N 天）。 */
export declare function snapshotTokenCost(granularity: Granularity, rangeDays: number): CostSnapshot;
