import type { MemoryLogger } from '../types.js';
/** 体积检查抽样间隔：每 N 条写检查一次，减少同步 stat 系统调用（超限误差 ≤ N 条日志）。 */
export declare const SIZE_CHECK_INTERVAL = 32;
/** 错误对象转带堆栈的单行描述（诊断日志用，非 Error 直接字符串化）。 */
export declare function errDetail(err: unknown): string;
export declare function withFileLog(dataDir: string, logger: MemoryLogger): MemoryLogger;
