/** 标准 RRF 常数（原论文值）；k 越大越偏向低排名项（分布更平滑）。 */
export declare const RRF_K = 60;
/** 衰减地板（#29 时效加权的安全边界）：老记忆最多损失一半排序分，永不沉底。
 *  内部常量不进配置——它是安全机制不是调参旋钮。 */
export declare const DECAY_FLOOR = 0.5;
/**
 * 时效衰减加权（#29，读路径专用）：score × max(FLOOR, 0.5^(Δ天/半衰期)) 后重排序。
 *
 * - Δ 按 updated_at（内容版本时间）起算，缺失/非法按最老 → 地板接管（零特判分支）；
 * - 乘法保相关性主导：只在相关度相近的候选之间轮转名次（名额新鲜度），不淘汰不
 *   硬过滤——score≈0 的新记忆乘什么都是 ≈0；hit 的原 score 字段不被改写（排序用
 *   加权分，展示仍反映检索相关度）；
 * - halfLifeDays ≤ 0 直接原样返回（开关关闭）；
 * - 仅用于召回/工具检索；searchCandidates（去重候选）不得应用——写路径找同语义
 *   旧记录要无视新旧，衰减会让去重漏检（同事实双记录）。
 */
export declare function applyDecayWeight<T extends {
    score: number;
}>(hits: T[], halfLifeDays: number, updatedAtOf: (hit: T) => number | undefined, now?: number, floor?: number): T[];
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
