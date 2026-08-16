/**
 * 文本工具：ContentBlock → 纯文本；BM25 分词。
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
/** 把消息的 ContentBlock[] 展平成纯文本（仅 text 块）。 */
export declare function blocksToText(blocks: readonly ContentBlock[] | undefined): string;
/**
 * 轻量中英混排分词：英文按词，中文按二元组。
 * 与 MemoryCore 的 BM25 思路一致（无外部分词依赖）。
 */
export declare function tokenize(text: string): string[];
