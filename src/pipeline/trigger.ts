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
export function effectiveExtractThreshold(warmup: number, steady: number): number {
  if (!Number.isFinite(warmup) || warmup <= 0) return steady;
  return Math.min(warmup, steady);
}

/** 成功抽取后推进爬坡：翻倍，达到稳态即毕业（0）；已毕业保持 0。 */
export function advanceWarmupThreshold(current: number, steady: number): number {
  if (!Number.isFinite(current) || current <= 0) return 0;
  const next = current * 2;
  return next >= steady ? 0 : next;
}
