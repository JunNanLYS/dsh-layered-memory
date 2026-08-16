import type { Context } from '@deepseek-ai/cordis';
import type { MemoryConfig } from '../config.js';
import type { L1Store } from '../store/l1.js';
import type { MemoryState } from '../store/state.js';
import type { ConversationMessage, ExtractMode, MemoryFamily, MemoryLogger, MemoryRecord } from '../types.js';
export interface ExtractionResult {
    stored: number;
    skipped: boolean;
    sceneName: string;
    newRecords: MemoryRecord[];
}
/** 分族 checkpoint 桶（活引用，改动由调用方 save 落盘）。 */
export type FamilyStates = Record<MemoryFamily, MemoryState>;
/**
 * 按字符预算把消息切成多块（保持顺序，单条超预算独占一块，由 callLLM 兜底截断）。
 * 每条消息按 content 长度 + 64 字符脚手架开销（id/时间戳行）计。
 */
export declare function chunkByCharBudget(messages: ConversationMessage[], budgetChars: number): ConversationMessage[][];
export declare function runExtraction(ctx: Context, cfg: MemoryConfig, store: L1Store, states: FamilyStates, pending: ConversationMessage[], background: ConversationMessage[], logger: MemoryLogger, mode: ExtractMode): Promise<ExtractionResult>;
