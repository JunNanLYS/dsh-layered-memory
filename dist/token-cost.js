let db = null;
/** 插件启动时注入 db（index.ts 调用）。 */
export function initTokenCost(d) {
    db = d;
}
/** 插件卸载时清空 db 引用（index.ts 的 ctx.effect 清理里调用，防悬空引用）。 */
export function resetTokenCost() {
    db = null;
}
/** 记录一次蒸馏调用成本（callLLM 出口调用；provider/model 由调用方传入）。 */
export function recordCostCall(provider, model, layer, inputChars, outputTokens, reasoningTokens) {
    if (!db)
        return;
    db.insertCostCall(provider, model, layer, inputChars, outputTokens, reasoningTokens);
}
/** 四窗口定义：range + 回看毫秒数（all 的 ms 恒 0）。 */
const WINDOW_DEFS = [
    { range: 'day', ms: 24 * 3600_000 },
    { range: 'week', ms: 7 * 24 * 3600_000 },
    { range: 'month', ms: 30 * 24 * 3600_000 },
    { range: 'all', ms: 0 },
];
/** 趋势桶宽（毫秒）与桶数。 */
const TREND_MS = { day: 24 * 3600_000, week: 7 * 24 * 3600_000, month: 30 * 24 * 3600_000 };
const TREND_COUNT = { day: 30, week: 12, month: 12 };
/** 三个归并层级。 */
const LAYERS = ['l1', 'l2', 'l3'];
/** 本地时区偏移（东正西负）：把 SQL 端 UTC epoch 桶边界对齐到本地午夜。 */
function localOffsetMs() {
    return -new Date().getTimezoneOffset() * 60_000;
}
/** 已排序序列的中位数（偶数取中间两者平均；空返回 0）。 */
function medianOf(sorted) {
    const n = sorted.length;
    if (n === 0)
        return 0;
    const mid = Math.floor(n / 2);
    return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/** provider/model 复合键（避免跨 provider 同名 model 在聚合里混淆）。 */
function modelKey(provider, model) {
    return provider + '/' + model;
}
/** 从某模型某粒度的 bucket 序列算均值/中位数（活跃桶口径：只除有调用的桶数）。 */
function statOf(rows) {
    const active = rows.filter((r) => r.calls > 0);
    if (active.length === 0)
        return { avgCalls: 0, avgOutput: 0, medianOutput: 0 };
    const calls = active.reduce((s, r) => s + r.calls, 0);
    const output = active.reduce((s, r) => s + r.outputTokens, 0);
    return {
        avgCalls: calls / active.length,
        avgOutput: output / active.length,
        medianOutput: medianOf(active.map((r) => r.outputTokens).sort((a, b) => a - b)),
    };
}
/** 从 day/week/month 三组 bucket 行组装每个模型的统计指标（provider/model 复合键）。 */
function buildModelMetrics(dayRows, weekRows, monthRows) {
    const keys = new Set();
    for (const r of dayRows)
        keys.add(modelKey(r.provider, r.model));
    for (const r of weekRows)
        keys.add(modelKey(r.provider, r.model));
    for (const r of monthRows)
        keys.add(modelKey(r.provider, r.model));
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
function buildTrend(rows, granularity, now, count) {
    const bucketMs = TREND_MS[granularity];
    const offset = localOffsetMs();
    const cur = Math.floor((now + offset) / bucketMs);
    const buckets = [];
    for (let i = count - 1; i >= 0; i--) {
        const b = cur - i;
        buckets.push({ ts: b * bucketMs - offset, total: 0, byModel: {} });
    }
    for (const r of rows) {
        const idx = count - 1 - (cur - r.bucket);
        if (idx < 0 || idx >= count)
            continue;
        const tb = buckets[idx];
        tb.total += r.outputTokens;
        const key = modelKey(r.provider, r.model);
        tb.byModel[key] = (tb.byModel[key] ?? 0) + r.outputTokens;
    }
    return buckets;
}
/** 读成本看板快照（db 未注入/降级时返回全零结构，不抛错；rangeDays>0 = 趋势展示近 N 天）。 */
export function snapshotTokenCost(granularity, rangeDays) {
    const now = Date.now();
    const emptyWindow = (range, ms) => ({
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
    const windows = [];
    let byModel = [];
    for (const w of WINDOW_DEFS) {
        const since = w.ms === 0 ? 0 : now - w.ms;
        const agg = d.aggregateCost(since);
        windows.push({ range: w.range, since, ...agg.total });
        if (w.range === 'all')
            byModel = agg.byModel;
    }
    // 按层级 × 窗口聚合（层级×窗口表格）：每个窗口调一次 aggregateCostByLayer，再按层组装
    const layerByWindow = WINDOW_DEFS.map((w) => {
        const since = w.ms === 0 ? 0 : now - w.ms;
        return { range: w.range, rows: d.aggregateCostByLayer(since) };
    });
    const byLayer = LAYERS.map((layer) => ({
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
    const byLayerStats = [];
    const trendByLayer = { l1: [], l2: [], l3: [] };
    // 趋势展示范围：rangeDays > 0 = 近 N 天（since + 桶数按 N 折算）；否则用默认窗口
    const trendSince = rangeDays > 0 ? now - rangeDays * 24 * 3600_000 : 0;
    const trendCount = rangeDays > 0 ? Math.max(1, Math.ceil((rangeDays * 24 * 3600_000) / TREND_MS[granularity])) : TREND_COUNT[granularity];
    for (const layer of LAYERS) {
        const dayRows = d.aggregateByBucket(TREND_MS.day, offset, 0, layer);
        const weekRows = d.aggregateByBucket(TREND_MS.week, offset, 0, layer);
        const monthRows = d.aggregateByBucket(TREND_MS.month, offset, 0, layer);
        byLayerStats.push({ layer, models: buildModelMetrics(dayRows, weekRows, monthRows) });
        trendByLayer[layer] = buildTrend(d.aggregateByBucket(TREND_MS[granularity], offset, trendSince, layer), granularity, now, trendCount);
    }
    return { windows, byModel, byLayer, byLayerStats, trend: { granularity, byLayer: trendByLayer } };
}
