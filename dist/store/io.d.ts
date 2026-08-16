export declare function ensureDir(dir: string): Promise<void>;
/** 原子写文本文件。 */
export declare function atomicWriteText(file: string, content: string): Promise<void>;
/** 原子写 JSON。 */
export declare function atomicWriteJson(file: string, value: unknown): Promise<void>;
export declare function readJsonIfExists<T>(file: string): Promise<T | undefined>;
export declare function readTextIfExists(file: string): Promise<string | undefined>;
/** 追加 JSONL 行（存在则追加，否则创建）。 */
export declare function appendJsonl(file: string, lines: unknown[]): Promise<void>;
/** 读取 JSONL 全部行。 */
export declare function readJsonl<T>(file: string): Promise<T[]>;
export declare function nowIso(): string;
export declare function dayKey(ts: number): string;
