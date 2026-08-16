/**
 * 轻量 BM25 检索（无外部依赖）：拉丁词 + CJK 二元组分词。
 * 仅用于 L2 场景摘要的上下文选取（小语料）；L0/L1 检索走 SQLite FTS5/向量。
 */
import { tokenize } from '../util/text.js';
const K1 = 1.5;
const B = 0.75;
export class Bm25Index {
    docs = [];
    termFreq = [];
    docLen = [];
    df = new Map();
    totalLen = 0;
    get size() {
        return this.docs.length;
    }
    /** 全量重建。 */
    rebuild(docs) {
        this.docs = docs;
        this.termFreq = [];
        this.docLen = [];
        this.df = new Map();
        this.totalLen = 0;
        for (let i = 0; i < docs.length; i++) {
            const terms = tokenize(docs[i].text);
            const tf = new Map();
            for (const t of terms)
                tf.set(t, (tf.get(t) ?? 0) + 1);
            this.termFreq.push(tf);
            this.docLen.push(terms.length);
            this.totalLen += terms.length;
            for (const t of tf.keys())
                this.df.set(t, (this.df.get(t) ?? 0) + 1);
        }
    }
    search(query, topK, filter) {
        const terms = tokenize(query);
        if (terms.length === 0 || this.docs.length === 0)
            return [];
        const avgdl = this.totalLen / this.docs.length || 1;
        const n = this.docs.length;
        const scores = [];
        for (let i = 0; i < n; i++) {
            if (filter && !filter(this.docs[i].id))
                continue;
            const tf = this.termFreq[i];
            const len = this.docLen[i];
            let score = 0;
            for (const t of new Set(terms)) {
                const f = tf.get(t) ?? 0;
                if (f === 0)
                    continue;
                const idf = Math.log(1 + (n - (this.df.get(t) ?? 0) + 0.5) / ((this.df.get(t) ?? 0) + 0.5));
                score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (len / avgdl))));
            }
            if (score > 0)
                scores.push({ i, s: score });
        }
        scores.sort((a, b) => b.s - a.s);
        return scores.slice(0, topK).map(({ i, s }) => ({ id: this.docs[i].id, score: s }));
    }
}
