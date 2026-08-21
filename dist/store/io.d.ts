export declare function ensureDir(dir: string): Promise<void>;
/**
 * 原子写文本文件。tmp 写满后先 fsync 数据块再 rename——否则断电时文件系统可能
 * 先持久化 rename 元数据、后持久化数据块（ext4 delayed allocation / NTFS 均可能），
 * 目标文件变成空文件或半截。tmp 名带随机段防同毫秒碰撞；失败路径清理孤儿 tmp。
 */
export declare function atomicWriteText(file: string, content: string): Promise<void>;
/** 原子写 JSON。 */
export declare function atomicWriteJson(file: string, value: unknown): Promise<void>;
export declare function readJsonIfExists<T>(file: string): Promise<T | undefined>;
export declare function readTextIfExists(file: string): Promise<string | undefined>;
/**
 * 追加 JSONL 行（存在则追加，否则创建）。走 OS 写回不加 fsync：追加是热路径
 * （每轮对话一次），逐条 fsync 的延迟代价大于崩溃窗口丢尾部几行的损失——
 * 事实源的完整性边界见 README「日志与故障排查」。
 */
export declare function appendJsonl(file: string, lines: unknown[]): Promise<void>;
/** 读取 JSONL 全部行。 */
export declare function readJsonl<T>(file: string): Promise<T[]>;
export declare function nowIso(): string;
export declare function dayKey(ts: number): string;
