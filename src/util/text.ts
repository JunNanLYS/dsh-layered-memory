/**
 * 文本工具：ContentBlock → 纯文本；BM25 分词。
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';

/** 把消息的 ContentBlock[] 展平成纯文本（仅 text 块）。 */
export function blocksToText(blocks: readonly ContentBlock[] | undefined): string {
  if (!blocks) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'text') parts.push((b as { text: string }).text);
    else if (b.type === 'reasoning') parts.push((b as { text: string }).text);
  }
  return parts.join('\n');
}

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WORD_RE = /[a-zA-Z0-9][a-zA-Z0-9_-]{1,}/g;

/**
 * 轻量中英混排分词：英文按词，中文按二元组。
 * 与 MemoryCore 的 BM25 思路一致（无外部分词依赖）。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(WORD_RE)) tokens.push(m[0]);
  // CJK 二元组
  const cjk = lower.replace(/[^\u3400-\u9fff\uf900-\ufaff]/g, ' ');
  let i = 0;
  while (i < cjk.length) {
    const ch = cjk[i];
    if (CJK_RE.test(ch)) {
      const next = cjk[i + 1];
      if (next && CJK_RE.test(next)) tokens.push(ch + next);
      else tokens.push(ch);
      i += 1;
    } else {
      i += 1;
    }
  }
  return tokens.filter((t) => t.length >= 2 || CJK_RE.test(t));
}

