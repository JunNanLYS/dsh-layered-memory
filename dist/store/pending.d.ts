import type { ConversationMessage, ExtractMode, MemoryLogger } from '../types.js';
/** 三档蒸馏缓冲桶（off 在捕获侧已被拦截，永远不到这里）。 */
export interface PendingBuckets {
    auto: ConversationMessage[];
    chat: ConversationMessage[];
    work: ConversationMessage[];
}
export declare function emptyPending(): PendingBuckets;
/** 读取缓冲文件：文件缺失/损坏 → 空桶（不抛出——丢了缓冲 L0 事实源仍在）。 */
export declare function loadPending(file: string, logger?: MemoryLogger): Promise<PendingBuckets>;
/** 全量原子落盘（每次蒸馏尝试后调用；桶有上限，量级为百条级）。 */
export declare function savePending(file: string, buckets: PendingBuckets): Promise<void>;
export declare function pendingPathFor(dataDir: string): string;
/** 三档 key（调度/遍历用）。 */
export declare const PENDING_MODES: readonly ExtractMode[];
