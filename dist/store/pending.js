/**
 * 未蒸馏缓冲持久化（pending.json）：
 * 按档分桶的"已捕获但尚未成功蒸馏"消息——既包括抽取失败的待重试消息，
 * 也包括攒够触发阈值之前的消息。跨重启不丢（CONTEXT.md「未蒸馏缓冲」）。
 *
 * 与 state.json / session-modes.json 同款原子写；读取宽容（坏行丢弃、坏文件空桶起步）。
 */
import * as path from 'node:path';
import { atomicWriteJson, readJsonIfExists } from './io.js';
/** 旧格式（无 sessionId 字段）条目加载时归属的会话组。 */
export const LEGACY_SESSION = 'legacy';
/** 全新起步：三档都从 1 爬坡（首轮即触发抽取）。 */
export function freshWarmup() {
    return { auto: 1, chat: 1, work: 1 };
}
export function emptyPending() {
    return { auto: [], chat: [], work: [] };
}
function isMessage(m) {
    if (!m || typeof m !== 'object')
        return false;
    const r = m;
    return typeof r.id === 'string' && typeof r.content === 'string' && (r.role === 'user' || r.role === 'assistant');
}
/** 读取缓冲文件：文件缺失/损坏 → 空桶（不抛出——丢了缓冲 L0 事实源仍在）。
 *  旧格式条目（无 sessionId）归 legacy 组；warmup 缺省 = 全新起步。 */
export async function loadPending(file, logger) {
    const out = emptyPending();
    let raw;
    try {
        raw = await readJsonIfExists(file);
    }
    catch {
        raw = undefined;
    }
    if (!raw || typeof raw !== 'object' || !raw.buckets || typeof raw.buckets !== 'object') {
        return { buckets: out, warmup: freshWarmup() };
    }
    let dropped = 0;
    let legacy = 0;
    for (const key of ['auto', 'chat', 'work']) {
        const arr = raw.buckets[key];
        if (!Array.isArray(arr))
            continue;
        for (const m of arr) {
            if (!isMessage(m)) {
                dropped++;
                continue;
            }
            const sid = m.sessionId;
            if (typeof sid === 'string' && sid) {
                out[key].push({ ...m, sessionId: sid });
            }
            else {
                legacy++;
                out[key].push({ ...m, sessionId: LEGACY_SESSION });
            }
        }
    }
    if (dropped > 0)
        logger?.warn(`[memory] 未蒸馏缓冲文件含 ${dropped} 条坏记录，已丢弃`);
    if (legacy > 0)
        logger?.info(`[memory] 未蒸馏缓冲含 ${legacy} 条旧格式条目，归入 legacy 会话组`);
    const warmup = freshWarmup();
    for (const key of ['auto', 'chat', 'work']) {
        const w = raw.warmup?.[key];
        if (typeof w === 'number' && Number.isFinite(w) && w >= 0)
            warmup[key] = Math.floor(w);
    }
    return { buckets: out, warmup };
}
/** 按会话分组（会话切片）：组按首条时间排序、组内按时间稳定排序——
 *  蒸馏的一切触发都以切片为单位，切片内永不跨会话混装（ADR-0003）。 */
export function groupPendingBySession(messages) {
    const groups = new Map();
    for (const m of messages) {
        const g = groups.get(m.sessionId);
        if (g)
            g.push(m);
        else
            groups.set(m.sessionId, [m]);
    }
    return [...groups.entries()]
        .map(([sessionId, msgs]) => ({ sessionId, messages: [...msgs].sort((a, b) => a.timestamp - b.timestamp) }))
        .sort((a, b) => a.messages[0].timestamp - b.messages[0].timestamp);
}
/** 全量原子落盘（每次蒸馏尝试后调用；桶有上限，量级为百条级）。 */
export async function savePending(file, buckets, warmup) {
    const payload = { version: 1, buckets, ...(warmup ? { warmup } : {}) };
    await atomicWriteJson(file, payload);
}
export function pendingPathFor(dataDir) {
    return path.join(dataDir, 'pending.json');
}
/** 三档 key（调度/遍历用）。 */
export const PENDING_MODES = ['auto', 'chat', 'work'];
