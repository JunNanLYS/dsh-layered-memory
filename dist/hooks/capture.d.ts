import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { MemoryConfig } from '../config.js';
import type { MemoryRunner } from '../pipeline/runner.js';
import type { SessionModeStore } from '../store/session-modes.js';
import type { L0Store } from '../store/l0.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { MemoryLogger } from '../types.js';
export declare function isCaptureRelevant(type: string): boolean;
/**
 * 按会话缓冲轮次事件。turn 被消费后剩余前缀为空即删除 Map 条目——
 * 条目随会话数累积是慢泄漏（每会话残留一个数组引用，宿主长跑不释放）。
 */
export declare class CaptureBuffers {
    private readonly map;
    /** 活跃缓冲条目数（诊断/冒烟用）。 */
    get size(): number;
    push(sid: string, event: SessionEvent): void;
    /** 取出该 turn 的全部事件（不含 turn/start 自身）；无匹配 start 时返回整个缓冲。 */
    takeTurn(sid: string, turn: number): SessionEvent[];
}
export declare function registerCapture(ctx: Context, cfg: MemoryConfig, runner: MemoryRunner, l0: L0Store, logger: MemoryLogger, live: LiveSettingsHandle, modes: SessionModeStore): void;
/**
 * 缓冲上限裁剪（防御性；RELEVANT_TYPES 过滤后基本不可达）。
 * 铁律：进行中轮次（turn/start 之后、turn/end 之前）的事件绝不裁——
 * 只裁最早一个未闭合 turn/start 之前的已完成前缀。
 */
export declare function trimBuffer(buf: SessionEvent[]): void;
