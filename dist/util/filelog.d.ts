import type { MemoryLogger } from '../types.js';
/** 错误对象转带堆栈的单行描述（诊断日志用，非 Error 直接字符串化）。 */
export declare function errDetail(err: unknown): string;
export declare function withFileLog(dataDir: string, logger: MemoryLogger): MemoryLogger;
