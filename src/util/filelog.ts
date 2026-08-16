/**
 * 文件日志：dsh 宿主只把插件日志打到控制台（无持久化），
 * 这里镜像 warn/error/info 到数据目录 memory.log，供事后诊断蒸馏管线。
 * 写入失败静默忽略——诊断日志绝不能反过来拖垮管线。
 */
import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryLogger } from '../types.js';

const MAX_LOG_BYTES = 2 * 1024 * 1024;

/** 错误对象转带堆栈的单行描述（诊断日志用，非 Error 直接字符串化）。 */
export function errDetail(err: unknown): string {
  if (err instanceof Error) return `${err.message} @ ${err.stack?.split('\n')[1]?.trim() ?? err.name}`;
  return String(err);
}

export function withFileLog(dataDir: string, logger: MemoryLogger): MemoryLogger {
  const logPath = join(dataDir, 'memory.log');
  const write = (level: string, msg: string): void => {
    try {
      if (existsSync(logPath) && statSync(logPath).size > MAX_LOG_BYTES) {
        renameSync(logPath, `${logPath}.1`);
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
