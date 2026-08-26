/**
 * 蒸馏成本看板账本：把每次蒸馏调用（model × layer）的 token 成本写入 SQLite 明细表。
 *
 * 模块级单例 + init 注入 db：callLLM 拿不到 db（db 在 index.ts 运行时创建），
 * 故通过 initTokenCost(db, retentionDays) 在插件启动时注入；recordCostCall 每次调用写一行明细。
 *
 * 与作者 llm-usage.ts 的关系：作者是"按 layer 累计的纯内存计数器"（给 bench 用）；
 * 本模块补上三个缺口——按 model 分组、持久化（保留期可配置，默认 365 天）、面向 UI 成本看板。
 */
import type {
  CostByModel,
  CostSnapshot,
  CostWindow,
  Granularity,
  LayerCost,
  LayerMetrics,
  ModelMetrics,
  TrendBucket,
} from './contract.js';
import type { DistillLayer } from './llm-usage.js';
import type { BucketRow, MemoryDb } from './store/sqlite.js';

// 已迁入契约单一事实源（src/contract.ts），此处保留 re-export 断裂既有 import 路径
export type {
  CostWindow,
  Granularity,
  ModelMetrics,
  LayerMetrics,
  LayerWindow,
  LayerCost,
  TrendBucket,
  TrendSnapshot,
  CostSnapshot,
} from './contract.js';

let db: MemoryDb | null = null;
let retentionDays = 365;

/** 插件启动时注入 db 与明细保留期（index.ts 调用；retentionDays 0 = 永久保留）。 */
export function initTokenCost(d: MemoryDb, retention: number): void {
  db = d;
  retentionDays = Math.max(0, Math.round(retention));
}

/** 插件卸载时清空 db 引用（index.ts 的 ctx.effect 清理里调用，防悬空引用）。 */
export function resetTokenCost(): void {
  db = null;
}

/** 记录一次蒸馏调用成本（callLLM 出口调用；provider/model 由调用方传入）。 */
export function recordCostCall(
  provider: string,
  model: string,
  layer: DistillLayer,
  inputChars: number,
  outputTokens: number,
  reasoningTokens: number,
): void {
  if (!db) return;
  db.insertCostCall(provider, model, layer, inputChars, outputTokens, reasoningTokens, retentionDays);
}

/** 四窗口定义：range + 回看毫秒数（all 的 ms 恒 0）。 */
const WINDOW_DEFS: ReadonlyArray<{ range: CostWindow['range']; ms: number }> = [
  { range: 'day', ms: 24 * 3600_000 },
  { range: 'week', ms: 7 * 24 * 3600_000 },
  { range: 'month', ms: 30 * 24 * 3600_000 },
  { range: 'all', ms: 0 },
];

/** 趋势桶宽（毫秒）与桶数。 */
const TREND_MS: Record<Granularity, number> = { day: 24 * 3600_000, week: 7 * 24 * 3600_000, month: 30 * 24 * 3600_000 };
const TREND_COUNT: Record<Granularity, number> = { day: 30, week: 12, month: 12 };

/** 三个归并层级。 */
const LAYERS: ReadonlyArray<'l1' | 'l2' | 'l3'> = ['l1', 'l2', 'l3'];

/** 本地时区偏移（东正西负）：把 SQL 端 UTC epoch 桶边界对齐到本地午夜。 */
function localOffsetMs(): number {
  return -new Date().getTimezoneOffset() * 60_000;
}

/** 已排序序列的中位数（偶数取中间两者平均；空返回 0）。 */
function medianOf(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** provider/model 复合键（避免跨 provider 同名 model 在聚合里混淆）。 */
function modelKey(provider: string, model: string): string {
  return provider + '/' + model;
}

/** 从某模型某粒度的 bucket 序列算均值/中位数（活跃桶口径：只除有调用的桶数）。 */
function statOf(rows: BucketRow[]): { avgCalls: number; avgOutput: number; medianOutput: number } {
  const active = rows.filter((r) => r.calls > 0);
  if (active.length === 0) return { avgCalls: 0, avgOutput: 0, medianOutput: 0 };
  const calls = active.reduce((s, r) => s + r.calls, 0);
  const output = active.reduce((s, r) => s + r.outputTokens, 0);
  return {
    avgCalls: calls / active.length,
    avgOutput: output / active.length,
    medianOutput: medianOf(active.map((r) => r.outputTokens).sort((a, b) => a - b)),
  };
}

/** 从 day/week/month 三组 bucket 行组装每个模型的统计指标（provider/model 复合键）。 */
function buildModelMetrics(dayRows: BucketRow[], weekRows: BucketRow[], monthRows: BucketRow[]): ModelMetrics[] {
  const keys = new Set<string>();
  for (const r of dayRows) keys.add(modelKey(r.provider, r.model));
  for (const r of weekRows) keys.add(modelKey(r.provider, r.model));
  for (const r of monthRows) keys.add(modelKey(r.provider, r.model));
  return Array.from(keys)
    .sort()
    .map((key) => {
      const d = statOf(dayRows.filter((r) => modelKey(r.provider, r.model) === key));
      const w = statOf(weekRows.filter((r) => modelKey(r.provider, r.model) === key));
      const m = statOf(monthRows.filter((r) => modelKey(r.provider, r.model) === key));
      return {
        model: key,
        dayCalls: d.avgCalls,
        weekCalls: w.avgCalls,
        monthCalls: m.avgCalls,
        dayOutput: d.avgOutput,
        dayMedian: d.medianOutput,
        weekOutput: w.avgOutput,
        weekMedian: w.medianOutput,
        monthOutput: m.avgOutput,
        monthMedian: m.medianOutput,
      };
    });
}

/** 从某层级某粒度的 bucket 行生成连续趋势桶（空桶补 0；count 为桶数，由调用方按展示范围算）。 */
function buildTrend(rows: BucketRow[], granularity: Granularity, now: number, count: number): TrendBucket[] {
  const bucketMs = TREND_MS[granularity];
  const offset = localOffsetMs();
  const cur = Math.floor((now + offset) / bucketMs);
  const buckets: TrendBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const b = cur - i;
    buckets.push({ ts: b * bucketMs - offset, total: 0, byModel: {} });
  }
  for (const r of rows) {
    const idx = count - 1 - (cur - r.bucket);
    if (idx < 0 || idx >= count) continue;
    const tb = buckets[idx];
    tb.total += r.outputTokens;
    const key = modelKey(r.provider, r.model);
    tb.byModel[key] = (tb.byModel[key] ?? 0) + r.outputTokens;
  }
  return buckets;
}

/** 读成本看板快照（db 未注入/降级时返回全零结构，不抛错；rangeDays>0 = 趋势展示近 N 天）。 */
export function snapshotTokenCost(granularity: Granularity, rangeDays: number): CostSnapshot {
  const now = Date.now();
  const emptyWindow = (range: CostWindow['range'], ms: number): CostWindow => ({
    range,
    since: ms === 0 ? 0 : now - ms,
    calls: 0,
    inputChars: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    avgOutputTokens: 0,
    medianOutputTokens: 0,
  });
  if (!db) {
    return {
      windows: WINDOW_DEFS.map((w) => emptyWindow(w.range, w.ms)),
      byModel: [],
      byLayer: [],
      byLayerStats: [],
      trend: { granularity, byLayer: { l1: [], l2: [], l3: [] } },
    };
  }
  // 四窗口总聚合（累计窗口顺带取 byModel）
  const d = db;
  const windows: CostWindow[] = [];
  let byModel: CostByModel[] = [];
  for (const w of WINDOW_DEFS) {
    const since = w.ms === 0 ? 0 : now - w.ms;
    const agg = d.aggregateCost(since);
    windows.push({ range: w.range, since, ...agg.total });
    if (w.range === 'all') byModel = agg.byModel;
  }
  // 按层级 × 窗口聚合（层级×窗口表格）：每个窗口调一次 aggregateCostByLayer，再按层组装
  const layerByWindow = WINDOW_DEFS.map((w) => {
    const since = w.ms === 0 ? 0 : now - w.ms;
    return { range: w.range, rows: d.aggregateCostByLayer(since) };
  });
  const byLayer: LayerCost[] = LAYERS.map((layer) => ({
    layer,
    windows: layerByWindow.map(({ range, rows }) => {
      const row = rows.find((r) => r.layer === layer);
      return {
        range,
        calls: row?.calls ?? 0,
        inputChars: row?.inputChars ?? 0,
        outputTokens: row?.outputTokens ?? 0,
        reasoningTokens: row?.reasoningTokens ?? 0,
        avgOutputTokens: row?.avgOutputTokens ?? 0,
        medianOutputTokens: row?.medianOutputTokens ?? 0,
      };
    }),
  }));
  // 每层级模型统计（全量历史口径）+ 趋势（按展示范围）
  const offset = localOffsetMs();
  const byLayerStats: LayerMetrics[] = [];
  const trendByLayer: Record<'l1' | 'l2' | 'l3', TrendBucket[]> = { l1: [], l2: [], l3: [] };
  // 趋势展示范围：rangeDays > 0 = 近 N 天（强制按「日」粒度出 N 个日桶，不受周/月聚合影响）；否则用默认窗口
  const trendGranularity: Granularity = rangeDays > 0 ? 'day' : granularity;
  const trendSince = rangeDays > 0 ? now - rangeDays * 24 * 3600_000 : 0;
  const trendCount = rangeDays > 0 ? rangeDays : TREND_COUNT[granularity];
  for (const layer of LAYERS) {
    const dayRows = d.aggregateByBucket(TREND_MS.day, offset, 0, layer);
    const weekRows = d.aggregateByBucket(TREND_MS.week, offset, 0, layer);
    const monthRows = d.aggregateByBucket(TREND_MS.month, offset, 0, layer);
    byLayerStats.push({ layer, models: buildModelMetrics(dayRows, weekRows, monthRows) });
    trendByLayer[layer] = buildTrend(d.aggregateByBucket(TREND_MS[trendGranularity], offset, trendSince, layer), trendGranularity, now, trendCount);
  }
  return { windows, byModel, byLayer, byLayerStats, trend: { granularity: trendGranularity, byLayer: trendByLayer } };
}
