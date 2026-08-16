export interface Bm25Doc {
    id: string;
    text: string;
}
export interface Bm25Hit {
    id: string;
    score: number;
}
export declare class Bm25Index {
    private docs;
    private termFreq;
    private docLen;
    private df;
    private totalLen;
    get size(): number;
    /** 全量重建。 */
    rebuild(docs: Bm25Doc[]): void;
    search(query: string, topK: number, filter?: (id: string) => boolean): Bm25Hit[];
}
