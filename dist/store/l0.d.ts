import type { ConversationMessage, L0MessageRecord, MemoryLogger } from '../types.js';
import { type EmbeddingService } from './embedding.js';
import { type MemoryDb } from './sqlite.js';
export declare class L0Store {
    private readonly db;
    private readonly dir;
    private readonly legacyDir;
    private readonly helper;
    private readonly embedSvc;
    private readonly logger?;
    constructor(dataDir: string, db: MemoryDb, embed?: EmbeddingService, logger?: MemoryLogger);
    init(): Promise<void>;
    /** 旧版 l0/*.jsonl 一次性导入检索库，成功后目录改名 l0.imported/。 */
    private importLegacy;
    append(sessionId: string, messages: ConversationMessage[]): Promise<void>;
    /** 今日已捕获消息数（SQL 计数，不再读整文件）。 */
    countToday(): Promise<number>;
    /** 检索：FTS + 向量 hybrid（RRF 融合），返回按相关性排序的消息。 */
    search(query: string, limit: number): Promise<L0MessageRecord[]>;
    /**
     * 增量重嵌入（同 L1Store.reindex：只补缺失向量，零向量记 skipped 并入 skip 集，
     * 不算失败、不阻塞同步标记——保证补齐判据收敛）。
     */
    reindex(): Promise<{
        written: number;
        failed: number;
        skipped: number;
    }>;
}
