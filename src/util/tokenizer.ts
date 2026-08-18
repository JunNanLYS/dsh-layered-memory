/**
 * 分词器装配：jieba 词级分词（@node-rs/jieba，Rust napi 预编译二进制）优先，
 * 加载失败（平台无预编译二进制等）永久回退 CJK 二元组。
 *
 * - 惰性单例：首次调用即定死本进程的分词模式，不会运行中漂移——
 *   FTS 读写两侧共用同一实例（util/text.ts 的 tokenize），索引/查询天然对齐；
 * - require 走 createRequire（与 sqlite-vec 同款）：失败只降级不抛出，
 *   由 MemoryDb.init() 在启动时主动 ensure 并记录模式日志。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export type TokenizerMode = 'jieba' | 'bigram';

interface JiebaLike {
  cut(sentence: string, hmm?: boolean): string[];
}

let mode: TokenizerMode | undefined;
let cutFn: ((text: string) => string[]) | undefined;

/** 惰性初始化（永不抛出）。词典约 5MB，首次加载 ~100ms。 */
function ensure(): TokenizerMode {
  if (mode !== undefined) return mode;
  try {
    const { Jieba } = require('@node-rs/jieba') as {
      Jieba: { withDict(dict: Uint8Array): JiebaLike };
    };
    const { dict } = require('@node-rs/jieba/dict') as { dict: Uint8Array };
    const jieba = Jieba.withDict(dict);
    cutFn = (text: string) => jieba.cut(text, true);
    mode = 'jieba';
  } catch {
    cutFn = undefined;
    mode = 'bigram';
  }
  return mode;
}

/** 启动期主动初始化并返回模式（MemoryDb.init 记日志用）。 */
export function ensureTokenizer(): TokenizerMode {
  return ensure();
}

/**
 * FTS 分词器版本戳（存 embedding_meta 表，键 fts_tokenizer）。
 * 戳 ≠ 当前生效分词器 → FTS 表 drop 后从源表全量回灌（与 family 列迁移同款语义）。
 * 回退模式下戳为 bigram-v1：若历史索引是 jieba 分词建的，同样触发重建，
 * 保证戳永远如实反映"构建当前 FTS 内容的分词器"。
 */
export function tokenizerStamp(): string {
  return ensure() === 'jieba' ? 'jieba-v1' : 'bigram-v1';
}

/** 模式描述（日志用）。 */
export function describeTokenizer(): string {
  return ensure() === 'jieba'
    ? 'jieba 词级分词（@node-rs/jieba）+ CJK 二元组并集'
    : 'jieba 加载失败，回退 CJK 二元组分词（子词召回降级）';
}

/** jieba 切词（回退模式下返回 undefined，调用方走二元组路径）。 */
export function jiebaCut(text: string): string[] | undefined {
  return ensure() === 'jieba' ? cutFn!(text) : undefined;
}
