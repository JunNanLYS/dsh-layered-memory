import type { ConversationMessage, ExtractMode, MemoryLogger } from '../types.js';
/** 带会话标识的未蒸馏消息（会话切片的成员；CONTEXT.md「会话切片」「捕获档位」）。 */
export interface PendingMessage extends ConversationMessage {
    /** 捕获该消息的会话；旧格式数据无此字段，加载时归 legacy 组一次性蒸馏。 */
    sessionId: string;
}
/** 三档蒸馏缓冲桶（off 在捕获侧已被拦截，永远不到这里）。 */
export interface PendingBuckets {
    auto: PendingMessage[];
    chat: PendingMessage[];
    work: PendingMessage[];
}
/** 旧格式（无 sessionId 字段）条目加载时归属的会话组。 */
export declare const LEGACY_SESSION = "legacy";
/** 各档位桶的渐进阈值状态（0 = 已毕业用稳态值；1 = 爬坡起点；ADR-0003）。 */
export type WarmupState = Record<ExtractMode, number>;
/** 全新起步：三档都从 1 爬坡（首轮即触发抽取）。 */
export declare function freshWarmup(): WarmupState;
export declare function emptyPending(): PendingBuckets;
/** 读取缓冲文件：文件缺失/损坏 → 空桶（不抛出——丢了缓冲 L0 事实源仍在）。
 *  旧格式条目（无 sessionId）归 legacy 组；warmup 缺省 = 全新起步。 */
export declare function loadPending(file: string, logger?: MemoryLogger): Promise<{
    buckets: PendingBuckets;
    warmup: WarmupState;
}>;
/** 按会话分组（会话切片）：组按首条时间排序、组内按时间稳定排序——
 *  蒸馏的一切触发都以切片为单位，切片内永不跨会话混装（ADR-0003）。 */
export declare function groupPendingBySession(messages: PendingMessage[]): Array<{
    sessionId: string;
    messages: PendingMessage[];
}>;
/** 全量原子落盘（每次蒸馏尝试后调用；桶有上限，量级为百条级）。 */
export declare function savePending(file: string, buckets: PendingBuckets, warmup?: WarmupState): Promise<void>;
export declare function pendingPathFor(dataDir: string): string;
/** 三档 key（调度/遍历用）。 */
export declare const PENDING_MODES: readonly ExtractMode[];
