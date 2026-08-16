/**
 * 未蒸馏缓冲持久化（pending.json）：
 * 按档分桶的"已捕获但尚未成功蒸馏"消息——既包括抽取失败的待重试消息，
 * 也包括攒够触发阈值之前的消息。跨重启不丢（CONTEXT.md「未蒸馏缓冲」）。
 *
 * 与 state.json / session-modes.json 同款原子写；读取宽容（坏行丢弃、坏文件空桶起步）。
 */
import * as path from 'node:path';
import type { ConversationMessage, ExtractMode, MemoryLogger } from '../types.js';
import { atomicWriteJson, readJsonIfExists } from './io.js';

/** 三档蒸馏缓冲桶（off 在捕获侧已被拦截，永远不到这里）。 */
export interface PendingBuckets {
  auto: ConversationMessage[];
  chat: ConversationMessage[];
  work: ConversationMessage[];
}

interface PendingFile {
  version: 1;
  buckets: PendingBuckets;
}

export function emptyPending(): PendingBuckets {
  return { auto: [], chat: [], work: [] };
}

function isMessage(m: unknown): m is ConversationMessage {
  if (!m || typeof m !== 'object') return false;
  const r = m as Partial<ConversationMessage>;
  return typeof r.id === 'string' && typeof r.content === 'string' && (r.role === 'user' || r.role === 'assistant');
}

/** 读取缓冲文件：文件缺失/损坏 → 空桶（不抛出——丢了缓冲 L0 事实源仍在）。 */
export async function loadPending(file: string, logger?: MemoryLogger): Promise<PendingBuckets> {
  const out = emptyPending();
  let raw: (PendingFile & { buckets?: Record<string, unknown> }) | undefined;
  try {
    raw = await readJsonIfExists<PendingFile & { buckets?: Record<string, unknown> }>(file);
  } catch {
    raw = undefined;
  }
  if (!raw || typeof raw !== 'object' || !raw.buckets || typeof raw.buckets !== 'object') return out;
  let dropped = 0;
  for (const key of ['auto', 'chat', 'work'] as const) {
    const arr = raw.buckets[key];
    if (!Array.isArray(arr)) continue;
    for (const m of arr) {
      if (isMessage(m)) out[key].push(m);
      else dropped++;
    }
  }
  if (dropped > 0) logger?.warn(`[memory] 未蒸馏缓冲文件含 ${dropped} 条坏记录，已丢弃`);
  return out;
}

/** 全量原子落盘（每次蒸馏尝试后调用；桶有上限，量级为百条级）。 */
export async function savePending(file: string, buckets: PendingBuckets): Promise<void> {
  const payload: PendingFile = { version: 1, buckets };
  await atomicWriteJson(file, payload);
}

export function pendingPathFor(dataDir: string): string {
  return path.join(dataDir, 'pending.json');
}

/** 三档 key（调度/遍历用）。 */
export const PENDING_MODES: readonly ExtractMode[] = ['auto', 'chat', 'work'];
