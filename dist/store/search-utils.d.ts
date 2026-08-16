/** 标准 RRF 常数（原论文值）；k 越大越偏向低排名项（分布更平滑）。 */
export declare const RRF_K = 60;
/**
 * RRF 融合多个已排序列表：每项得分 = 各列表 1/(k + rank + 1) 之和。
 * 出现在多个列表的项得分累加，按得分降序返回（附 rrfScore）。
 */
export declare function rrfMerge<T>(lists: T[][], getId: (item: T) => string, k?: number): Array<T & {
    rrfScore: number;
}>;
/** FTS5 bm25 rank（负值=更相关）转 0~1 分数（照搬 MemoryCore 公式）。 */
export declare function bm25RankToScore(rank: number): number;
/**
 * 把自然语言查询构造成 FTS5 MATCH 表达式：token 引号化后 OR 连接，
 * 命中任一 token 即返回，BM25 自然把命中多 token 的文档排前——
 * 长查询与纯 FTS 模式（无向量）下召回率显著优于整句匹配。
 */
export declare function buildFtsQuery(raw: string): string | null;
/**
 * 写入侧分词：tokenize 后空格连接，交给 FTS5 unicode61 切词建索引。
 * 与 buildFtsQuery 用同一分词器，保证查询 token 在索引中可命中。
 */
export declare function tokenizeForFts(raw: string): string;
