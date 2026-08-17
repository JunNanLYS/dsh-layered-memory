/**
 * 文件日志：dsh 宿主只把插件日志打到控制台（无持久化），
 * 这里镜像 warn/error/info 到数据目录 memory.log，供事后诊断蒸馏管线。
 * 写入失败静默忽略——诊断日志绝不能反过来拖垮管线。
 */
import { appendFileSync, existsSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryLogger } from '../types.js';

const MAX_LOG_BYTES = 2 * 1024 * 1024;
/** 轮转 rename 连续失败多少次后放弃归档、直接截断重开（Windows 文件占用兜底）。 */
const ROTATE_FAIL_LIMIT = 5;
/** 体积检查抽样间隔：每 N 条写检查一次，减少同步 stat 系统调用（超限误差 ≤ N 条日志）。 */
export const SIZE_CHECK_INTERVAL = 32;

/** 错误对象转带堆栈的单行描述（诊断日志用，非 Error 直接字符串化）。 */
export function errDetail(err: unknown): string {
  if (err instanceof Error) return `${err.message} @ ${err.stack?.split('\n')[1]?.trim() ?? err.name}`;
  return String(err);
}

export function withFileLog(dataDir: string, logger: MemoryLogger): MemoryLogger {
  const logPath = join(dataDir, 'memory.log');
  let rotateFailures = 0;
  let writesSinceCheck = 0;
  const write = (level: string, msg: string): void => {
    try {
      if (writesSinceCheck++ % SIZE_CHECK_INTERVAL === 0 && existsSync(logPath) && statSync(logPath).size > MAX_LOG_BYTES) {
        try {
          renameSync(logPath, `${logPath}.1`);
          rotateFailures = 0;
        } catch {
          // rename 可能因文件被占用失败（Windows EBUSY）：连续失败达上限后
          // 截断重开，保住"日志体积有上界"的底线（放弃 .1 归档，保当前日志可用）
          if (++rotateFailures >= ROTATE_FAIL_LIMIT) {
            writeFileSync(logPath, '');
            rotateFailures = 0;
          }
        }
      }
      appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${msg}\n`);
    } catch {
      /* ignore */
    }
  };
  return {
    debug: (m) => logger.debug?.(m),
    info: (m) => {
      logger.info(m);
      write('info', m);
    },
    warn: (m) => {
      logger.warn(m);
      write('warn', m);
    },
    error: (m) => {
      logger.error(m);
      write('error', m);
    },
  };
}
