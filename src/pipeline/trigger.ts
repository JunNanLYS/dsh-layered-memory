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

// ── 档位切换同步（CONTEXT.md「捕获档位」：切片始终按捕获档位蒸馏，不重贴标签） ──

export type ModeSwitchAction = 'flush' | 'park' | 'unpark' | 'none';

/**
 * 档位切换动作表（ADR-0003）：
 * - 非 off 档间切换 → flush（该会话切片立即按捕获档位蒸馏，新档位从空切片起步）
 * - 切到 off → park（切片挂起：用户刚说"停止记忆"，把存量再蒸馏违背意图）
 * - 从 off 切回 → unpark（挂起片按捕获档位落袋）
 */
export function modeSwitchAction(oldMode: string, newMode: string): ModeSwitchAction {
  if (oldMode === newMode) return 'none';
  if (newMode === 'off') return 'park';
  if (oldMode === 'off') return 'unpark';
  return 'flush';
}

// ── 闲置兜底（CONTEXT.md「闲置兜底」：接住"没攒够阈值用户就离开"的尾部） ──

export interface IdleSliceInfo {
  sessionId: string;
  /** 该会话跨桶合计的切片条数。 */
  count: number;
  /** 切片内最晚消息时间（无活动记录时的兜底锚点，如重启后的残留切片）。 */
  lastMessageAt: number;
}

/**
 * 闲置扫描：静默达标且有切片的会话。off 档会话跳过（挂起语义）；
 * 活动时间优先取运行时记录，缺省回退切片内最晚消息时间。
 */
export function idleSessionsToFlush(
  slices: IdleSliceInfo[],
  lastActivity: ReadonlyMap<string, number>,
  now: number,
  idleMs: number,
  isOffSession: (sessionId: string) => boolean,
): string[] {
  if (!(idleMs > 0)) return [];
  const out: string[] = [];
  for (const s of slices) {
    if (s.count <= 0) continue;
    if (isOffSession(s.sessionId)) continue;
    const activity = lastActivity.get(s.sessionId) ?? s.lastMessageAt;
    if (now - activity >= idleMs) out.push(s.sessionId);
  }
  return out;
}
