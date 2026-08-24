/**
 * 蒸馏触发决策纯函数（ADR-0003 / 规格 B 节；S2 测试缝——决策与执行分离，
 * 不依赖 dsh 宿主即可测调度语义）。
 *
 * 语义（CONTEXT.md「渐进阈值」「会话切片」）：
 * - 生效阈值从 1 起步（新用户首轮即出记忆），每次成功抽取后翻倍至稳态值毕业；
 * - 阈值按会话切片计数，只抽取达到阈值的那个会话的切片；
 * - warmup 值 0 = 已毕业（使用稳态值），按档位桶各记一次（全局爬坡，非按会话）。
 */
/** 生效阈值：爬坡中取 min(当前爬坡值, 稳态)，毕业（0）取稳态。 */
export function effectiveExtractThreshold(warmup, steady) {
    if (!Number.isFinite(warmup) || warmup <= 0)
        return steady;
    return Math.min(warmup, steady);
}
/** 成功抽取后推进爬坡：翻倍，达到稳态即毕业（0）；已毕业保持 0。 */
export function advanceWarmupThreshold(current, steady) {
    if (!Number.isFinite(current) || current <= 0)
        return 0;
    const next = current * 2;
    return next >= steady ? 0 : next;
}
/**
 * 档位切换动作表（ADR-0003）：
 * - 非 off 档间切换 → flush（该会话切片立即按捕获档位蒸馏，新档位从空切片起步）
 * - 切到 off → park（切片挂起：用户刚说"停止记忆"，把存量再蒸馏违背意图）
 * - 从 off 切回 → unpark（挂起片按捕获档位落袋）
 */
export function modeSwitchAction(oldMode, newMode) {
    if (oldMode === newMode)
        return 'none';
    if (newMode === 'off')
        return 'park';
    if (oldMode === 'off')
        return 'unpark';
    return 'flush';
}
// ── 背景参考按会话现查（ADR-0003：抽取背景从 L0 按会话取，剔除切片自身） ──
/** 从"该会话最近消息"里剔除切片自身成员后取尾部 n 条作为抽取背景。
 *  剔除防止抽取目标混入背景（L0 在 turn/end 已先落盘，现查必含切片）。 */
export function pickSessionBackground(recent, sliceIds, n) {
    if (n <= 0)
        return [];
    return recent.filter((m) => !sliceIds.has(m.id)).slice(-n);
}
// ── 抽取失败退避（修"重试风暴"：LLM 网关故障期间闲置兜底每 30s 入队一个任务，
//    在 120s LLM 超时的等待中堆积成连环调用）──
/** 退避基数与封顶：60s 起步指数翻倍，封顶 30 分钟（LLM 故障自愈的合理量级）。 */
const EXTRACT_BACKOFF_BASE_MS = 60_000;
const EXTRACT_BACKOFF_CAP_MS = 30 * 60_000;
/** 连续失败第 failStreak 次后的自动重试等待时长（1 → 60s，2 → 120s，…封顶 30min）。 */
export function extractionBackoffMs(failStreak) {
    if (!Number.isFinite(failStreak) || failStreak <= 0)
        return EXTRACT_BACKOFF_BASE_MS;
    return Math.min(EXTRACT_BACKOFF_BASE_MS * 2 ** (failStreak - 1), EXTRACT_BACKOFF_CAP_MS);
}
/**
 * 闲置扫描：静默达标且有切片的会话。off 档会话跳过（挂起语义）；
 * 活动时间优先取运行时记录，缺省回退切片内最晚消息时间。
 */
export function idleSessionsToFlush(slices, lastActivity, now, idleMs, isOffSession) {
    if (!(idleMs > 0))
        return [];
    const out = [];
    for (const s of slices) {
        if (s.count <= 0)
            continue;
        if (isOffSession(s.sessionId))
            continue;
        const activity = lastActivity.get(s.sessionId) ?? s.lastMessageAt;
        if (now - activity >= idleMs)
            out.push(s.sessionId);
    }
    return out;
}
