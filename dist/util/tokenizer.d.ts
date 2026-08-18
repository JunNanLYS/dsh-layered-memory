export type TokenizerMode = 'jieba' | 'bigram';
/** 启动期主动初始化并返回模式（MemoryDb.init 记日志用）。 */
export declare function ensureTokenizer(): TokenizerMode;
/**
 * FTS 分词器版本戳（存 embedding_meta 表，键 fts_tokenizer）。
 * 戳 ≠ 当前生效分词器 → FTS 表 drop 后从源表全量回灌（与 family 列迁移同款语义）。
 * 回退模式下戳为 bigram-v1：若历史索引是 jieba 分词建的，同样触发重建，
 * 保证戳永远如实反映"构建当前 FTS 内容的分词器"。
 */
export declare function tokenizerStamp(): string;
/** 模式描述（日志用）。 */
export declare function describeTokenizer(): string;
/** jieba 切词（回退模式下返回 undefined，调用方走二元组路径）。 */
export declare function jiebaCut(text: string): string[] | undefined;
