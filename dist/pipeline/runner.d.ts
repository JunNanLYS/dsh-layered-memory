/**
 * 管线 Runner：串行执行 L0 → L1 → L2 → L3。
 * 所有阶段失败只记日志，绝不向 Agent 循环抛错（失败兜底）。
 *
 * 会话档位：enqueue 带 mode（off 在捕获侧已被拦截）；L1 待重试缓冲按档分桶；
 * L2/L3 按记录族各自跑各自的场景/画像存储与阈值计数（分族隔离不变量）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryConfig } from '../config.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { L0Store } from '../store/l0.js';
import type { L1Store } from '../store/l1.js';
import type { PersonaStore } from '../store/persona.js';
import type { SceneStore } from '../store/scenes.js';
import type { StateStore } from '../store/state.js';
import type { ConversationMessage, ExtractMode, MemoryFamily, MemoryLogger } from '../types.js';
export interface MemoryStores {
    l0: L0Store;
    l1: L1Store;
    scenes: Record<MemoryFamily, SceneStore>;
    persona: Record<MemoryFamily, PersonaStore>;
    state: StateStore;
}
export declare class MemoryRunner {
    private readonly ctx;
    private readonly cfg;
    private readonly stores;
    private readonly logger;
    private readonly live;
    private queue;
    private pending;
    private background;
    private states;
    private afterRun;
    constructor(ctx: Context, cfg: MemoryConfig, stores: MemoryStores, logger: MemoryLogger, live: LiveSettingsHandle);
    init(): Promise<void>;
    /** L1 抽取待重试的消息条数（状态面板用）。 */
    get pendingCount(): number;
    /** 管线跑完一轮后的回调（用于召回缓存失效）。 */
    setAfterRun(fn: () => void): void;
    /** 一轮对话结束后入队（L0 落盘 + 蒸馏触发判定）。 */
    enqueue(sessionId: string, messages: ConversationMessage[], mode: ExtractMode): void;
    private runTurn;
}
