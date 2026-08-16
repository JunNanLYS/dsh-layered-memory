/**
 * 检索工具（移植 MemoryCore search-utils + sqlite FTS helpers）：
 * - rrfMerge：RRF（Reciprocal Rank Fusion，k=60）多路结果融合，hybrid 检索用；
 * - bm25RankToScore：FTS5 bm25 rank（负值=更相关）转 0~1 分数；
 * - buildFtsQuery / tokenizeForFts：FTS5 查询构造与写入侧分词。
 *   官方用 jieba 分词；这里用项目自带的 CJK 二元组 + 英文词分词（util/text.ts），
 *   读写两侧共用同一分词器，保证查询 token 与索引 token 对齐，且零原生依赖。
 */
import { tokenize } from '../util/text.js';

/** 标准 RRF 常数（原论文值）；k 越大越偏向低排名项（分布更平滑）。 */
export const RRF_K = 60;

/**
 * RRF 融合多个已排序列表：每项得分 = 各列表 1/(k + rank + 1) 之和。
 * 出现在多个列表的项得分累加，按得分降序返回（附 rrfScore）。
 */
export function rrfMerge<T>(
  lists: T[][],
  getId: (item: T) => string,
  k: number = RRF_K,
): Array<T & { rrfScore: number }> {
  const map = new Map<string, { item: T; rrfScore: number }>();
  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const id = getId(item);
      const score = 1 / (k + rank + 1);
      const existing = map.get(id);
      if (existing) {
        existing.rrfScore += score;
      } else {
        map.set(id, { item, rrfScore: score });
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(({ item, rrfScore }) => ({ ...item, rrfScore }));
}

/** FTS5 bm25 rank（负值=更相关）转 0~1 分数（照搬 MemoryCore 公式）。 */
export function bm25RankToScore(rank: number): number {
  if (!Number.isFinite(rank)) return 1 / (1 + 999);
  if (rank < 0) {
    const relevance = -rank;
    return relevance / (1 + relevance);
  }
  return 1 / (1 + rank);
}

/** 高频中文虚词，进 FTS 查询只添噪声（沿用官方小表）。 */
const ZH_STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那',
  '吗', '吧', '呢', '啊', '呀', '哦', '嗯',
]);

/**
 * 把自然语言查询构造成 FTS5 MATCH 表达式：token 引号化后 OR 连接，
 * 命中任一 token 即返回，BM25 自然把命中多 token 的文档排前——
 * 长查询与纯 FTS 模式（无向量）下召回率显著优于整句匹配。
 */
export function buildFtsQuery(raw: string): string | null {
  const tokens = [...new Set(tokenize(raw).filter((t) => !ZH_STOP_WORDS.has(t)))];
  if (tokens.length === 0) return null;
  const quoted = tokens.map((t) => `"${t.replaceAll('"', '')}"`);
  return quoted.join(' OR ');
}

/**
 * 写入侧分词：tokenize 后空格连接，交给 FTS5 unicode61 切词建索引。
 * 与 buildFtsQuery 用同一分词器，保证查询 token 在索引中可命中。
 */
export function tokenizeForFts(raw: string): string {
  return tokenize(raw).join(' ');
}
