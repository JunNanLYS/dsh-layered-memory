import type { Context } from '@deepseek-ai/cordis';
import { type MemoryConfig } from '../config.js';
import type { L1Store } from '../store/l1.js';
import type { PersonaStore } from '../store/persona.js';
import type { SceneStore } from '../store/scenes.js';
import type { StateStore } from '../store/state.js';
import type { MemoryDb } from '../store/sqlite.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { ConversationMessage, L0MessageRecord, MemoryFamily, MemoryLogger } from '../types.js';
import { type MemoryRunner } from './runner.js';
/** 重建所需的存储子集（l0 不需要——快照直接走 db）。 */
export interface RebuildStores {
    l1: L1Store;
    scenes: Record<MemoryFamily, SceneStore>;
    persona: Record<MemoryFamily, PersonaStore>;
    state: StateStore;
}
export type RebuildPhase = 'idle' | 'preparing' | 'distilling' | 'finalizing' | 'done' | 'cancelled' | 'failed';
export interface RebuildStatus {
    running: boolean;
    phase: RebuildPhase;
    /** 已完成的会话块数 / 总块数。 */
    done: number;
    total: number;
    /** L0 体量（idle 时为实时预估，运行中为快照值）。 */
    sessionCount: number;
    messageCount: number;
    /** 预计 LLM 抽取调用次数（下界估算：块数与字符预算取大）。 */
    estCalls: number;
    /** 重建产出的 L1 记录累计条数。 */
    recordsBuilt: number;
    cancelRequested: boolean;
    startedAt: number | null;
    finishedAt: number | null;
    error: string | null;
    /** 归档产物名（提示用户可手工找回）。 */
    archiveNote: string | null;
}
export interface RebuildChunk {
    sessionId: string;
    messages: ConversationMessage[];
}
export declare function groupL0Sessions(records: L0MessageRecord[]): RebuildChunk[];
/** 抽取调用数下界估算（与 l1.ts 的 perChunk 同式；会话数与字符预算取大）。 */
export declare function estimateCalls(sessions: number, messages: number, chars: number, maxInputChars: number): number;
export declare class RebuildController {
    private readonly ctx;
    private readonly cfg;
    private readonly stores;
    private readonly db;
    private readonly runner;
    private readonly logger;
    private readonly live;
    private status;
    private chunks;
    private cancelRequested;
    /** 快照时刻（收尾时按它区分重建产物与重建后新对话的记录）。 */
    private rebuildStartMs;
    constructor(ctx: Context, cfg: MemoryConfig, stores: RebuildStores, db: MemoryDb, runner: Pick<MemoryRunner, 'enqueueRebuildTask' | 'runRebuildTurn' | 'states'>, logger: MemoryLogger, live: LiveSettingsHandle);
    /** 状态快照（idle 时附带实时 L0 预估，供确认弹窗显示成本）。 */
    getStatus(): RebuildStatus;
    /** 内存中尚未处理的会话快照块数（收尾后应为 0——快照即弃，诊断/冒烟用）。 */
    get chunkCount(): number;
    /** 启动重建（校验后入队准备任务；真正的清库/归档在管线队列里串行执行，避开并发竞态）。 */
    start(): RebuildStatus;
    /** 请求取消：当前块完成后停止，已重建部分保留并照常收尾 L2/L3。 */
    requestCancel(): RebuildStatus;
    private prepare;
    /** 分块链：一次只挂一个重建块，跑完再挂下一块——正常轮次可随时插队。 */
    private scheduleChunk;
    private finalize;
    /**
     * 收集重建窗口内某族的记录：重建产物全部是新插入（updated==created），
     * 按 updated_time 倒序翻页、越过 rebuildStartMs 即停。
     */
    private collectRebuildRecords;
    private finish;
    /** 归档旧派生层：records/ scenes/ persona-*.md 改名 .bak.<ts>。不存在则跳过。 */
    private archiveDerived;
}
