/**
 * L1 原子记忆存储（双写架构，移植 MemoryCore l1-writer 语义）：
 * - records/YYYY-MM-DD.jsonl：追加式事实源（只增不改，备份/恢复用）；
 * - MemoryDb（SQLite）：主检索引擎，upsert/delete 只动这里；
 * - 检索三策略：keyword（FTS5 BM25）/ embedding（vec0 余弦）/ hybrid（双路 + RRF k=60）。
 *
 * 去重/合并的更新记录走 upsert（新 record id + 版本递增），不再全量重写文件。
 */
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { L1Hit, MemoryFamily, MemoryLogger, MemoryRecord } from '../types.js';
import { familyForType } from '../types.js';
import { EmbedHelper, NoopEmbeddingService, type EmbeddingService } from './embedding.js';
import { appendJsonl, dayKey, ensureDir, readJsonl } from './io.js';
import { RRF_K, rrfMerge } from './search-utils.js';
import { isZeroVector, type MemoryDb } from './sqlite.js';

export type RecallStrategy = 'keyword' | 'embedding' | 'hybrid';

export interface L1SearchOptions {
  /** 按记忆类型精确过滤（后置过滤，官方做法）。 */
  type?: string;
  /** 按族过滤（undefined = 不过滤，即 auto 档与浏览路径；检索唯一缝的族语义）。 */
  family?: MemoryFamily;
  /** 分数阈值（仅召回路径传；keyword/embedding 策略生效，FTS 含小语料例外；
   *  hybrid 按官方语义在 RRF 融合前不过滤）。 */
  scoreThreshold?: number;
}

/** 官方过度召回倍数：候选池 = limit × 3（官方 tool 路径同款）。 */
const CANDIDATE_MULTIPLIER = 3;

export class L1Store {
  private readonly recordsDir: string;
  private readonly legacyFile: string;
  private readonly helper: EmbedHelper;
  private readonly embedSvc: EmbeddingService;
  private readonly logger?: MemoryLogger;

  constructor(
    dataDir: string,
    private readonly db: MemoryDb,
    embed: EmbeddingService = new NoopEmbeddingService(),
    private readonly strategy: RecallStrategy = 'hybrid',
    logger?: MemoryLogger,
  ) {
    this.recordsDir = path.join(dataDir, 'records');
    this.legacyFile = path.join(dataDir, 'l1', 'records.jsonl');
    this.embedSvc = embed;
    this.helper = new EmbedHelper(embed, logger);
    this.logger = logger;
  }

  async init(): Promise<void> {
    await ensureDir(this.recordsDir);
    await this.importLegacy();
  }

  /** 旧版单文件 records.jsonl 一次性导入检索库，成功后改名 .imported。 */
  private async importLegacy(): Promise<void> {
    if (!existsSync(this.legacyFile)) return;
    try {
      const records = await readJsonl<MemoryRecord>(this.legacyFile);
      let n = 0;
      for (const r of records) {
        if (r && typeof r.id === 'string' && r.content) {
          if (this.db.upsertL1(r)) n++;
        }
      }
      // 只有确实导入成功（或文件为空）才改名，避免把未入库的数据改名带走
      if (n === records.length) {
        const renamed = await fs
          .rename(this.legacyFile, `${this.legacyFile}.imported`)
          .then(
            () => true,
            () => false,
          );
        if (renamed) {
          this.logger?.info(`[memory] 旧版 L1 数据已导入检索库 ${n} 条（l1/records.jsonl → .imported）`);
        } else {
          this.logger?.warn('[memory] 旧版 L1 导入完成但改名失败，下次启动会重复导入（upsert 幂等，无害）');
        }
      } else {
        this.logger?.warn(`[memory] 旧版 L1 导入不完整（${n}/${records.length}），保留原文件下次重试`);
      }
    } catch (err) {
      this.logger?.warn(`[memory] 旧版 L1 数据导入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  get size(): number {
    return this.db.countL1();
  }

  /** 全量读取（调试/迁移用；检索请走 search）。 */
  all(): MemoryRecord[] {
    return this.db.getAllL1();
  }

  /** 按 id 精确取记录（去重决策的版本号查询用，避免全表扫描）。 */
  getByIds(ids: string[]): MemoryRecord[] {
    return this.db.getL1ByIds(ids);
  }

  /** 新记忆落盘：JSONL 按天追加（事实源）+ 检索库 upsert + 向量。 */
  async appendNew(records: MemoryRecord[]): Promise<void> {
    if (records.length === 0) return;
    for (const r of records) {
      if (!r.family) r.family = familyForType(r.type);
    }
    const byDay = new Map<string, MemoryRecord[]>();
    for (const r of records) {
      const k = dayKey(r.createdAt || Date.now());
      const arr = byDay.get(k) ?? [];
      arr.push(r);
      byDay.set(k, arr);
    }
    for (const [day, list] of byDay) {
      await appendJsonl(path.join(this.recordsDir, `${day}.jsonl`), list);
    }
    const vecs = await this.helper.batch(records.map((r) => r.content));
    for (let i = 0; i < records.length; i++) {
      this.db.upsertL1(records[i], vecs[i]);
    }
  }

  /** 去重 update/merge 产出的记录：只更新检索库（JSONL 事实源不改写，官方语义）。 */
  async upsert(record: MemoryRecord): Promise<void> {
    if (!record.family) record.family = familyForType(record.type);
    const vec = (await this.helper.batch([record.content]))[0];
    this.db.upsertL1(record, vec);
  }

  async deleteBatch(ids: string[]): Promise<void> {
    this.db.deleteL1Batch(ids);
  }

  /**
   * 三策略检索（自动召回与 memory_search 工具共用接缝）。
   * embedding 不可用时自动降级 keyword；type 后置过滤；
   * scoreThreshold 仅对 keyword/embedding 单路策略生效——hybrid 按官方语义
   * 融合完整列表（融合分已归一化 0~1，可直接用于展示/过滤）。
   */
  async search(query: string, limit: number, opts?: L1SearchOptions): Promise<L1Hit[]> {
    const caps = this.db.getCapabilities();
    const canVec = caps.vectorSearch && this.helper.vectorReady();
    let strategy: RecallStrategy | 'none' = this.strategy;
    if (strategy !== 'keyword' && !canVec) strategy = caps.ftsSearch ? 'keyword' : 'none';

    const candidateK = limit * CANDIDATE_MULTIPLIER;
    const threshold = opts?.scoreThreshold ?? 0;

    if (strategy === 'none') return [];
    if (strategy === 'keyword') {
      const fts = this.db.searchL1Fts(query, candidateK, opts?.family);
      return this.postProcess(applyFtsThreshold(fts, threshold, limit), opts?.type, limit);
    }
    if (strategy === 'embedding') {
      const vec = await this.helper.query(query);
      if (!vec) {
        // embedding 调用失败：降级 FTS，不阻断
        const fts = this.db.searchL1Fts(query, candidateK, opts?.family);
        return this.postProcess(applyFtsThreshold(fts, threshold, limit), opts?.type, limit);
      }
      const vecHits = this.db.searchL1Vector(vec, candidateK, opts?.family);
      return this.postProcess(filterScore(vecHits, threshold), opts?.type, limit);
    }

    // hybrid（官方语义）：双路并行 → 完整列表 RRF 融合（融合前不过滤阈值）
    // → 融合分归一化：rank1 双列表命中 = 1.0，单列表命中 ≤ 0.5，保持 0~1 语义
    const [ftsList, vecRaw] = await Promise.all([
      Promise.resolve(this.db.searchL1Fts(query, candidateK, opts?.family)),
      this.helper.query(query),
    ]);
    const vecList = vecRaw ? this.db.searchL1Vector(vecRaw, candidateK, opts?.family) : [];
    const merged = rrfMerge([ftsList, vecList], (h) => h.id);
    return this.postProcess(
      merged.map(({ rrfScore, ...h }) => ({ ...h, score: normalizeRrf(rrfScore) })),
      opts?.type,
      limit,
    );
  }

  /** 浏览列表（UI 用）：无关键词时按更新时间倒序分页。 */
  list(opts: { type?: string; scene?: string; family?: string; limit: number; offset: number }): { items: MemoryRecord[]; total: number } {
    return this.db.listL1(opts);
  }

  /** 场景名去重列表（UI 筛选器数据源）。 */
  distinctScenes(): string[] {
    return this.db.distinctL1Scenes();
  }

  /**
   * 去重候选召回（官方 3 级）：空库跳过 → 向量优先 → FTS 兜底。
   * 传入 family 时只在同族记录里召回（去重永不跨族）。
   */
  async searchCandidates(query: string, limit: number, family?: MemoryFamily): Promise<MemoryRecord[]> {
    if (this.db.countL1() === 0) return [];
    const caps = this.db.getCapabilities();
    if (caps.vectorSearch && this.helper.vectorReady()) {
      try {
        const vec = await this.helper.query(query);
        if (vec) {
          const hits = this.db.searchL1Vector(vec, limit, family);
          if (hits.length > 0) return this.db.getL1ByIds(hits.map((h) => h.id));
        }
      } catch (err) {
        this.logger?.warn(`[memory] 向量候选召回失败，降级 FTS: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const fts = this.db.searchL1Fts(query, limit * 2, family);
    return this.db.getL1ByIds(fts.map((h) => h.id));
  }

  /**
   * 增量重嵌入（embedding 配置变化 / 周期性补齐用）：只处理缺失向量的记录，
   * 排除已判定"当前 provider 不可嵌入"的 skip 集。返回写入/失败/跳过数——
   * failed > 0 时调用方不应标记 meta 同步完成；skipped（零向量）不算失败、
   * 不阻塞同步标记（否则补齐判据永不收敛，每 30 分钟全量重嵌死循环）。
   */
  async reindex(): Promise<{ written: number; failed: number; skipped: number }> {
    if (!this.helper.vectorReady()) return { written: 0, failed: 0, skipped: 0 };
    const items = this.db.getL1ForReindex(this.db.getVecSkipSet('l1'));
    let written = 0;
    let failed = 0;
    let skipped = 0;
    const skippedNow: string[] = [];
    const CHUNK = 16;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      let vecs: Float32Array[];
      try {
        vecs = await this.embedSvc.embedBatch(chunk.map((c) => c.content));
      } catch {
        failed += chunk.length;
        continue;
      }
      chunk.forEach((c, j) => {
        if (isZeroVector(vecs[j])) {
          skipped++;
          skippedNow.push(c.id);
          return;
        }
        if (this.db.updateL1Vec(c.id, vecs[j])) written++;
        else failed++;
      });
    }
    if (skippedNow.length > 0) this.db.addVecSkippedIds('l1', skippedNow);
    return { written, failed, skipped };
  }

  private postProcess(hits: L1Hit[], type: string | undefined, limit: number): L1Hit[] {
    const filtered = type ? hits.filter((h) => h.type === type) : hits;
    return filtered.slice(0, limit);
  }
}

/** RRF 原始分归一化到 0~1：双列表 rank1 命中 = 2/(k+1) → 1.0。 */
function normalizeRrf(rrfScore: number): number {
  return (rrfScore * (RRF_K + 1)) / 2;
}

/** FTS 阈值过滤（含官方小语料例外：全部低于阈值但结果数 ≤ maxResults 时保留）。 */
function applyFtsThreshold(hits: L1Hit[], threshold: number, maxResults: number): L1Hit[] {
  if (threshold <= 0) return hits;
  const filtered = hits.filter((h) => h.score >= threshold);
  if (filtered.length === 0 && hits.length > 0 && hits.length <= maxResults) return hits;
  return filtered;
}

function filterScore(hits: L1Hit[], threshold: number): L1Hit[] {
  if (threshold <= 0) return hits;
  return hits.filter((h) => h.score >= threshold);
}
