import { jiebaCut } from './tokenizer.js';
/** 把消息的 ContentBlock[] 展平成纯文本（仅 text 块）。 */
export function blocksToText(blocks) {
    if (!blocks)
        return '';
    const parts = [];
    for (const b of blocks) {
        if (b.type === 'text')
            parts.push(b.text);
        else if (b.type === 'reasoning')
            parts.push(b.text);
    }
    return parts.join('\n');
}
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WORD_RE = /[a-zA-Z0-9][a-zA-Z0-9_-]{1,}/g;
/** token 里至少要有一个字母/数字/CJK 字（输入已小写；滤掉 jieba 切出的纯标点 token）。 */
const TOKEN_KEEP_RE = /[a-z0-9\u3400-\u9fff\uf900-\ufaff]/;
/** CJK 连续段二元组（jieba 失败回退时的唯一分词，也是并集模式的子词召回底线）。 */
function cjkBigrams(text) {
    const tokens = [];
    const cjk = text.replace(/[^\u3400-\u9fff\uf900-\ufaff]/g, ' ');
    let i = 0;
    while (i < cjk.length) {
        const ch = cjk[i];
        if (CJK_RE.test(ch)) {
            const next = cjk[i + 1];
            if (next && CJK_RE.test(next))
                tokens.push(ch + next);
            else
                tokens.push(ch);
        }
        i += 1;
    }
    return tokens;
}
/**
 * 中英混排分词：jieba 词元 ∪ 拉丁词 ∪ CJK 二元组，按首次出现顺序去重。
 *
 * - 词元给 BM25 提供高精度整词命中（"负载均衡"作为词，idf 远高于碎片二元组）；
 * - 二元组保住子词召回底线：查询"负载"仍能命中只含"负载均衡"词元的行，
 *   且旧库纯二元组索引无需迁移即可被新查询命中（新查询仍含二元组 token）；
 * - 去重防 2 字词与其自身二元组重复计数（FTS tf / bm25.ts 词频被同一出现双计）；
 * - jieba 加载失败时 jiebaCut 返回 undefined，自动退化为纯二元组（原 0.7 行为）。
 */
export function tokenize(text) {
    const lower = text.toLowerCase();
    const seen = new Set();
    const tokens = [];
    const push = (t) => {
        if (t.length >= 2 && TOKEN_KEEP_RE.test(t) && !seen.has(t)) {
            seen.add(t);
            tokens.push(t);
        }
        else if (t.length === 1 && CJK_RE.test(t) && !seen.has(t)) {
            seen.add(t);
            tokens.push(t);
        }
    };
    const words = jiebaCut(lower);
    if (words)
        for (const w of words)
            push(w.trim());
    for (const m of lower.matchAll(WORD_RE))
        push(m[0]);
    for (const bg of cjkBigrams(lower))
        push(bg);
    return tokens;
}
