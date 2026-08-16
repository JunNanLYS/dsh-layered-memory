import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { MemoryConfig } from '../config.js';
import type { MemoryRunner } from '../pipeline/runner.js';
import type { SessionModeStore } from '../store/session-modes.js';
import type { L0Store } from '../store/l0.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { MemoryLogger } from '../types.js';
export declare function isCaptureRelevant(type: string): boolean;
export declare function registerCapture(ctx: Context, cfg: MemoryConfig, runner: MemoryRunner, l0: L0Store, logger: MemoryLogger, live: LiveSettingsHandle, modes: SessionModeStore): void;
/**
 * 缓冲上限裁剪（防御性；RELEVANT_TYPES 过滤后基本不可达）。
 * 铁律：进行中轮次（turn/start 之后、turn/end 之前）的事件绝不裁——
 * 只裁最早一个未闭合 turn/start 之前的已完成前缀。
 */
export declare function trimBuffer(buf: SessionEvent[]): void;
