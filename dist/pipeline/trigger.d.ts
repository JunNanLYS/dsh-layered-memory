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
export declare function effectiveExtractThreshold(warmup: number, steady: number): number;
/** 成功抽取后推进爬坡：翻倍，达到稳态即毕业（0）；已毕业保持 0。 */
export declare function advanceWarmupThreshold(current: number, steady: number): number;
export type ModeSwitchAction = 'flush' | 'park' | 'unpark' | 'none';
/**
 * 档位切换动作表（ADR-0003）：
 * - 非 off 档间切换 → flush（该会话切片立即按捕获档位蒸馏，新档位从空切片起步）
 * - 切到 off → park（切片挂起：用户刚说"停止记忆"，把存量再蒸馏违背意图）
 * - 从 off 切回 → unpark（挂起片按捕获档位落袋）
 */
export declare function modeSwitchAction(oldMode: string, newMode: string): ModeSwitchAction;
/** 从"该会话最近消息"里剔除切片自身成员后取尾部 n 条作为抽取背景。
 *  剔除防止抽取目标混入背景（L0 在 turn/end 已先落盘，现查必含切片）。 */
export declare function pickSessionBackground<T extends {
    id: string;
}>(recent: readonly T[], sliceIds: ReadonlySet<string>, n: number): T[];
/** 连续失败第 failStreak 次后的自动重试等待时长（1 → 60s，2 → 120s，…封顶 30min）。 */
export declare function extractionBackoffMs(failStreak: number): number;
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
export declare function idleSessionsToFlush(slices: IdleSliceInfo[], lastActivity: ReadonlyMap<string, number>, now: number, idleMs: number, isOffSession: (sessionId: string) => boolean): string[];
