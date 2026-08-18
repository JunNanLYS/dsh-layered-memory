/**
 * L0 原始对话存储（双写架构，目录布局对齐 MemoryCore l0-recorder）：
 * - conversations/YYYY-MM-DD.jsonl：追加式事实源；
 * - MemoryDb（SQLite）：主检索引擎——检索不再按天扫文件、现建内存索引。
 */
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ConversationMessage, L0MessageRecord, MemoryLogger } from '../types.js';
import { EmbedHelper, NoopEmbeddingService, type EmbeddingService } from './embedding.js';
import { appendJsonl, dayKey, ensureDir, nowIso, readJsonl } from './io.js';
import { rrfMerge } from './search-utils.js';
import { isZeroVector, type MemoryDb } from './sqlite.js';

/** 官方过度召回倍数（conversation-search：limit × 3）。 */
const CANDIDATE_MULTIPLIER = 3;

export class L0Store {
  private readonly dir: string;
  private readonly legacyDir: string;
  private readonly helper: EmbedHelper;
  private embedSvc: EmbeddingService;
  private readonly logger?: MemoryLogger;

  constructor(
    dataDir: string,
    private readonly db: MemoryDb,
    embed: EmbeddingService = new NoopEmbeddingService(),
    logger?: MemoryLogger,
  ) {
    this.dir = path.join(dataDir, 'conversations');
    this.legacyDir = path.join(dataDir, 'l0');
    this.embedSvc = embed;
    this.helper = new EmbedHelper(embed, logger);
    this.logger = logger;
  }

  async init(): Promise<void> {
    await ensureDir(this.dir);
    await this.importLegacy();
  }

  /** 旧版 l0/*.jsonl 一次性导入检索库，成功后目录改名 l0.imported/。 */
  private async importLegacy(): Promise<void> {
    if (!existsSync(this.legacyDir)) return;
    try {
      const files = await fs.readdir(this.legacyDir).catch(() => [] as string[]);
      let imported = 0;
      let total = 0;
      for (const f of files.sort()) {
        if (!f.endsWith('.jsonl')) continue;
        const records = await readJsonl<L0MessageRecord>(path.join(this.legacyDir, f));
        if (records.length > 0) {
          total += records.length;
          if (this.db.upsertL0Batch(records)) imported += records.length;
        }
      }
      // 只有全部批次入库成功（或目录为空）才改名，避免数据被改名带走
      if (imported === total) {
        const renamed = await fs
          .rename(this.legacyDir, `${this.legacyDir}.imported`)
          .then(
            () => true,
            () => false,
          );
        if (renamed) {
          this.logger?.info(`[memory] 旧版 L0 数据已导入检索库 ${imported} 条（l0/ → l0.imported/）`);
        } else {
          this.logger?.warn('[memory] 旧版 L0 导入完成但改名失败（l0.imported/ 已存在？），下次启动会重复导入（幂等，无害）');
        }
      } else {
        this.logger?.warn(`[memory] 旧版 L0 导入不完整（${imported}/${total}），保留原目录下次重试`);
      }
    } catch (err) {
      this.logger?.warn(`[memory] 旧版 L0 数据导入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async append(sessionId: string, messages: ConversationMessage[]): Promise<void> {
    if (messages.length === 0) return;
    const records: L0MessageRecord[] = messages.map((m) => ({
      sessionId,
      recordedAt: nowIso(),
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
    // 事实源：按天追加
    const byDay = new Map<string, L0MessageRecord[]>();
    for (const r of records) {
      const k = dayKey(r.timestamp);
      const arr = byDay.get(k) ?? [];
      arr.push(r);
      byDay.set(k, arr);
    }
    for (const [day, list] of byDay) {
      await appendJsonl(path.join(this.dir, `${day}.jsonl`), list);
    }
    // 检索引擎：DB + 向量（嵌入失败只跳过向量，不影响元数据/FTS，backfill 补齐）
    const vecs = await this.helper.batch(records.map((r) => r.content));
    this.db.upsertL0Batch(records, vecs);
  }

  /** 今日已捕获消息数（SQL 计数，不再读整文件）。 */
  async countToday(): Promise<number> {
    const d = new Date();
    return this.db.countL0Since(new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString());
  }

  /** 该会话最近 n 条消息（时间升序；蒸馏背景参考用，按会话现查——ADR-0003）。 */
  async recentBySession(sessionId: string, limit: number): Promise<ConversationMessage[]> {
    return this.db.recentL0BySession(sessionId, limit);
  }

  /** 检索：FTS + 向量 hybrid（RRF 融合），返回按相关性排序的消息。 */
  async search(query: string, limit: number): Promise<L0MessageRecord[]> {
    const caps = this.db.getCapabilities();
    if (!caps.ftsSearch && !caps.vectorSearch) return [];
    const candidateK = limit * CANDIDATE_MULTIPLIER;

    if (caps.vectorSearch && this.helper.vectorReady()) {
      const [ftsRaw, vec] = await Promise.all([
        Promise.resolve(this.db.searchL0Fts(query, candidateK)),
        this.helper.query(query),
      ]);
      const vecList = vec ? this.db.searchL0Vector(vec, candidateK) : [];
      const merged = rrfMerge([ftsRaw, vecList], (h) => h.id);
      return merged.map(({ rrfScore: _rrf, ...r }) => r).slice(0, limit);
    }
    return this.db.searchL0Fts(query, limit).map(({ score: _score, ...r }) => r);
  }

  /** 活切换嵌入源：同步换底层服务（嵌入源三态切换用）。 */
  setEmbeddingService(svc: EmbeddingService): void {
    this.embedSvc = svc;
    this.helper.setService(svc);
  }

  /**
   * 增量重嵌入（同 L1Store.reindex：只补缺失向量，零向量记 skipped 并入 skip 集，
   * 不算失败、不阻塞同步标记——保证补齐判据收敛）。onProgress/shouldCancel
   * 供活切换（D5）的进度展示与取消。
   */
  async reindex(opts?: {
    onProgress?: (done: number, total: number) => void;
    shouldCancel?: () => boolean;
  }): Promise<{ written: number; failed: number; skipped: number; cancelled?: boolean }> {
    if (!this.helper.vectorReady()) return { written: 0, failed: 0, skipped: 0 };
    const items = this.db.getL0ForReindex(this.db.getVecSkipSet('l0'));
    const total = items.length;
    let done = 0;
    let written = 0;
    let failed = 0;
    let skipped = 0;
    let cancelled = false;
    const skippedNow: string[] = [];
    const CHUNK = 32;
    for (let i = 0; i < items.length; i += CHUNK) {
      if (opts?.shouldCancel?.()) {
        cancelled = true;
        break;
      }
      const chunk = items.slice(i, i + CHUNK);
      let vecs: Float32Array[];
      try {
        vecs = await this.embedSvc.embedBatch(chunk.map((c) => c.text));
      } catch {
        failed += chunk.length;
        done += chunk.length;
        opts?.onProgress?.(done, total);
        continue;
      }
      const pending: Array<{ id: string; embedding: Float32Array }> = [];
      chunk.forEach((c, j) => {
        if (isZeroVector(vecs[j])) {
          skipped++;
          skippedNow.push(c.id);
          return;
        }
        pending.push({ id: c.id, embedding: vecs[j] });
      });
      if (pending.length > 0) {
        const ok = this.db.updateL0VecBatch(pending, '');
        written += ok;
        failed += pending.length - ok;
      }
      done += chunk.length;
      opts?.onProgress?.(done, total);
    }
    if (skippedNow.length > 0) this.db.addVecSkippedIds('l0', skippedNow);
    return { written, failed, skipped, cancelled };
  }
}
