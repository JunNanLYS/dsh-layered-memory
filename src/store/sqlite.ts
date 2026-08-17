/**
 * SQLite 主检索引擎（移植 MemoryCore sqlite 后端的单机裁剪版）。
 *
 * 双写架构（官方语义）：JSONL 追加文件是备份/恢复的事实源，
 * 本库承担全部检索——L0/L1 的检索不再扫文件、不再全量载入内存。
 *
 * - l1_records / l0_conversations：结构化元数据表；
 * - l1_fts / l0_fts：FTS5 BM25 全文索引（content 列存分词结果，其余列 UNINDEXED 随行携带）；
 * - l1_vec / l0_vec：sqlite-vec vec0 余弦向量表（仅 embedding 启用且维度 > 0 时创建）。
 *
 * 降级规则（degrade-don't-crash）：
 * - sqlite-vec 加载失败 → 纯 FTS 模式，能力位 vectorSearch=false；
 * - FTS5 建表失败 → ftsSearch=false；
 * - 任何一步 schema 初始化失败 → degraded=true，全部读写变为安全 no-op，
 *   由上层走 storageOk=false 降级链路，绝不拖垮宿主启动。
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { EmbeddingProviderInfo } from './embedding.js';
import type { L0MessageRecord, MemoryFamily, MemoryLogger, MemoryRecord } from '../types.js';
import { familyForType } from '../types.js';
import { bm25RankToScore, buildFtsQuery, tokenizeForFts } from './search-utils.js';

const require = createRequire(import.meta.url);

const TAG = '[memory][sqlite]';

export interface StoreInitResult {
  /** embedding 配置（provider/model/维度）变化，需要后台全量重嵌入。 */
  needsReindex: boolean;
  reason?: string;
}

export interface StoreCapabilities {
  ftsSearch: boolean;
  vectorSearch: boolean;
}

/** L1 检索命中（含 BM25/余弦归一分数）。 */
export interface L1SearchHit {
  id: string;
  content: string;
  type: string;
  priority: number;
  scene_name: string;
  score: number;
  family: MemoryFamily;
}

/** L0 检索命中。 */
export interface L0SearchHit extends L0MessageRecord {
  score: number;
}

interface EmbeddingMeta {
  provider: string;
  model: string;
  dimensions: number;
}

interface StatementLike {
  run(...params: unknown[]): { changes: number | bigint };
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

/** vec0 KNN 对遗留零向量的补偿缓冲（官方同款）。 */
const ZERO_VEC_BUFFER = 10;

/** IN 查询/删除的分块大小（保守避开 SQLite 变量数上限：现代构建 32766，老版 999）。 */
const IN_CHUNK = 900;

/** 零向量 skip 集上限（NOT IN 占位符随之有界；被挤出的 id 只多一次重试）。 */
const VEC_SKIP_CAP = 1000;

/** 把 id 列表切成 ≤IN_CHUNK 的块（分块执行后合并语义等价于单次 IN）。 */
function chunkIds(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) out.push(ids.slice(i, i + IN_CHUNK));
  return out;
}

export class MemoryDb {
  private db!: DatabaseSync;
  private degraded = false;
  private ftsAvailable = false;
  private vecLoaded = false;
  private readonly dimensions: number;
  private readonly logger?: MemoryLogger;

  private stmtUpsertL1!: StatementLike;
  private stmtGetL1!: StatementLike;
  private stmtDeleteL1Meta!: StatementLike;
  private stmtDeleteL1Vec?: StatementLike;
  private stmtInsertL1Vec?: StatementLike;
  private stmtSearchL1Vec?: StatementLike;
  private stmtL1FtsInsert!: StatementLike;
  private stmtL1FtsDelete!: StatementLike;
  private stmtL1FtsSearch!: StatementLike;
  private stmtL1FtsSearchFamily!: StatementLike;

  private stmtUpsertL0!: StatementLike;
  private stmtGetL0!: StatementLike;
  private stmtDeleteL0Vec?: StatementLike;
  private stmtInsertL0Vec?: StatementLike;
  private stmtSearchL0Vec?: StatementLike;
  private stmtL0FtsInsert!: StatementLike;
  private stmtL0FtsDelete!: StatementLike;
  private stmtL0FtsSearch!: StatementLike;

  constructor(dbPath: string, dimensions: number, logger?: MemoryLogger) {
    this.dimensions = dimensions;
    this.logger = logger;

    // 构造永不抛出（storage-degrade 不变量）：开库/PRAGMA 任一失败 → 降级模式，
    // 全部读写变为安全 no-op，宿主照常启动。
    try {
      const dbDir = path.dirname(dbPath);
      if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

      const { DatabaseSync: DbSync } = require('node:sqlite') as typeof import('node:sqlite');
      this.db = new DbSync(dbPath, { allowExtension: true });

      // 并发读优化 + 有界内存（照搬官方 PRAGMA 组合）
      this.db.exec('PRAGMA busy_timeout = 5000');
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA cache_size = -65536');
      this.db.exec('PRAGMA mmap_size = 134217728');
      this.db.exec('PRAGMA wal_autocheckpoint = 1000');
    } catch (err) {
      this.degraded = true;
      this.logger?.error(
        `${TAG} 数据库打开失败，存储进入降级模式（记忆读写停用）: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  getCapabilities(): StoreCapabilities {
    return {
      ftsSearch: this.ftsAvailable && !this.degraded,
      vectorSearch: this.vecLoaded && this.dimensions > 0 && !this.degraded,
    };
  }

  /**
   * 加载 sqlite-vec 扩展并建 schema。构造后必须调用一次。
   * providerInfo 变化（provider/model/维度）时 drop 向量表并返回 needsReindex。
   */
  init(providerInfo?: EmbeddingProviderInfo): StoreInitResult {
    // 构造期已降级（开库失败）→ 直接短路
    if (this.degraded) return { needsReindex: false, reason: 'database open failed' };
    // dimensions=0 是合法的"纯 FTS 模式"，不能因 sqlite-vec 缺失而降级（官方语义）
    if (this.dimensions > 0) {
      try {
        const sqliteVec = require('sqlite-vec') as { load(db: unknown): void };
        this.db.enableLoadExtension(true);
        try {
          sqliteVec.load(this.db);
          this.vecLoaded = true;
        } finally {
          // 加载失败也必须复位扩展开关，不留常开的扩展加载面
          this.db.enableLoadExtension(false);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger?.warn(`${TAG} sqlite-vec 加载失败，向量检索停用（降级为纯 FTS）: ${message}`);
      }
    }
    try {
      return this.initSchema(providerInfo);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger?.error(`${TAG} schema 初始化失败，存储进入降级模式: ${message}`);
      this.degraded = true;
      return { needsReindex: false, reason: `schema init failed: ${message}` };
    }
  }

  private initSchema(providerInfo?: EmbeddingProviderInfo): StoreInitResult {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // ── embedding 配置变化检测 → 重建向量表 ──
    let needsReindex = false;
    let reason: string | undefined;
    const savedMeta = this.readEmbeddingMeta();
    if (providerInfo) {
      if (savedMeta) {
        const providerChanged = savedMeta.provider !== providerInfo.provider;
        const modelChanged = savedMeta.model !== providerInfo.model;
        const dimsChanged = savedMeta.dimensions !== this.dimensions;
        if (providerChanged || modelChanged || dimsChanged) {
          const reasons: string[] = [];
          if (providerChanged) reasons.push(`provider: ${savedMeta.provider} → ${providerInfo.provider}`);
          if (modelChanged) reasons.push(`model: ${savedMeta.model} → ${providerInfo.model}`);
          if (dimsChanged) reasons.push(`dimensions: ${savedMeta.dimensions} → ${this.dimensions}`);
          reason = reasons.join(', ');
          this.logger?.info(`${TAG} embedding 配置变化（${reason}），重建向量表`);
          this.dropVectorTables();
          needsReindex = true;
        }
      } else if (this.countL1() > 0 || this.countL0() > 0) {
        // 已有数据但无 meta 记录（首次启用 embedding）→ 需要全量重嵌入
        this.dropVectorTables();
        needsReindex = true;
        reason = 'embedding 首次启用，已有数据需要重嵌入';
      }
    }

    // ── L1 schema ──
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS l1_records (
        record_id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        type TEXT DEFAULT '',
        priority INTEGER DEFAULT 50,
        scene_name TEXT DEFAULT '',
        session_id TEXT DEFAULT 'default',
        version INTEGER NOT NULL DEFAULT 0,
        timestamp_str TEXT DEFAULT '',
        timestamp_start TEXT DEFAULT '',
        timestamp_end TEXT DEFAULT '',
        created_time TEXT DEFAULT '',
        updated_time TEXT DEFAULT '',
        metadata_json TEXT DEFAULT '{}',
        family TEXT NOT NULL DEFAULT 'chat'
      )
    `);
    // 旧库缺 family 列 → ALTER 补列，并按 type 前缀回填（幂等：已正确的行不再命中）
    if (!this.hasColumn('l1_records', 'family')) {
      this.db.exec("ALTER TABLE l1_records ADD COLUMN family TEXT NOT NULL DEFAULT 'chat'");
      this.logger?.info(`${TAG} l1_records 补 family 列（旧数据按 type 前缀回填）`);
    }
    const backfilled = this.db
      .prepare("UPDATE l1_records SET family = 'work' WHERE type LIKE 'work\\_%' ESCAPE '\\' AND family != 'work'")
      .run().changes;
    if (backfilled > 0) this.logger?.info(`${TAG} family 回填 ${backfilled} 条 work 记录`);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_l1_type ON l1_records(type)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_l1_scene ON l1_records(scene_name)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_l1_ts_start ON l1_records(timestamp_start)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_l1_updated ON l1_records(updated_time)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_l1_family ON l1_records(family)');

    this.stmtUpsertL1 = this.db.prepare(`
      INSERT INTO l1_records (
        record_id, content, type, priority, scene_name, session_id, version,
        timestamp_str, timestamp_start, timestamp_end, created_time, updated_time, metadata_json, family
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(record_id) DO UPDATE SET
        content=excluded.content,
        type=excluded.type,
        priority=excluded.priority,
        scene_name=excluded.scene_name,
        version=excluded.version,
        timestamp_str=excluded.timestamp_str,
        timestamp_start=excluded.timestamp_start,
        timestamp_end=excluded.timestamp_end,
        updated_time=excluded.updated_time,
        metadata_json=excluded.metadata_json,
        family=excluded.family
    `);
    this.stmtGetL1 = this.db.prepare(`
      SELECT record_id, content, type, priority, scene_name, version, timestamp_str,
             timestamp_start, timestamp_end, created_time, updated_time, metadata_json, family
      FROM l1_records WHERE record_id = ?
    `);
    this.stmtDeleteL1Meta = this.db.prepare('DELETE FROM l1_records WHERE record_id = ?');
    this.prepareL1VecStatements();

    // ── L0 schema ──
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS l0_conversations (
        record_id TEXT PRIMARY KEY,
        session_id TEXT DEFAULT 'default',
        role TEXT NOT NULL DEFAULT '',
        message_text TEXT NOT NULL,
        recorded_at TEXT DEFAULT '',
        timestamp INTEGER DEFAULT 0
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_l0_session_id ON l0_conversations(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_l0_recorded ON l0_conversations(recorded_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_l0_timestamp ON l0_conversations(timestamp)');

    this.stmtUpsertL0 = this.db.prepare(`
      INSERT INTO l0_conversations (record_id, session_id, role, message_text, recorded_at, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(record_id) DO UPDATE SET
        session_id=excluded.session_id,
        role=excluded.role,
        message_text=excluded.message_text,
        recorded_at=excluded.recorded_at,
        timestamp=excluded.timestamp
    `);
    this.stmtGetL0 = this.db.prepare(
      'SELECT session_id, role, message_text, recorded_at, timestamp FROM l0_conversations WHERE record_id = ?',
    );
    this.prepareL0VecStatements();

    // ── FTS5 全文索引（建表失败仅停用 FTS，不降级整个库） ──
    try {
      // 旧 l1_fts 无 family 列（FTS5 无法 ALTER）→ drop 后从 l1_records 全量重建
      let ftsRebuilt = false;
      if (this.tableExists('l1_fts') && !this.hasColumn('l1_fts', 'family')) {
        this.db.exec('DROP TABLE l1_fts');
        ftsRebuilt = true;
        this.logger?.info(`${TAG} l1_fts 缺 family 列，重建全文索引`);
      }
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS l1_fts USING fts5(
          content,
          content_original UNINDEXED,
          record_id UNINDEXED,
          type UNINDEXED,
          priority UNINDEXED,
          scene_name UNINDEXED,
          session_id UNINDEXED,
          version UNINDEXED,
          timestamp_str UNINDEXED,
          timestamp_start UNINDEXED,
          timestamp_end UNINDEXED,
          metadata_json UNINDEXED,
          family UNINDEXED
        )
      `);
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS l0_fts USING fts5(
          message_text,
          message_text_original UNINDEXED,
          record_id UNINDEXED,
          session_id UNINDEXED,
          role UNINDEXED,
          recorded_at UNINDEXED,
          timestamp UNINDEXED
        )
      `);

      this.stmtL1FtsInsert = this.db.prepare(`
        INSERT INTO l1_fts (content, content_original, record_id, type, priority, scene_name,
          session_id, version, timestamp_str, timestamp_start, timestamp_end, metadata_json, family)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      this.stmtL1FtsDelete = this.db.prepare('DELETE FROM l1_fts WHERE record_id = ?');
      this.stmtL1FtsSearch = this.db.prepare(`
        SELECT record_id, content_original AS content, type, priority, scene_name, version,
               timestamp_str, timestamp_start, timestamp_end, metadata_json, family,
               bm25(l1_fts) AS rank
        FROM l1_fts
        WHERE l1_fts MATCH ?
        ORDER BY rank ASC
        LIMIT ?
      `);
      // 族过滤版（FTS5 UNINDEXED 列可作行级过滤条件）
      this.stmtL1FtsSearchFamily = this.db.prepare(`
        SELECT record_id, content_original AS content, type, priority, scene_name, version,
               timestamp_str, timestamp_start, timestamp_end, metadata_json, family,
               bm25(l1_fts) AS rank
        FROM l1_fts
        WHERE l1_fts MATCH ? AND family = ?
        ORDER BY rank ASC
        LIMIT ?
      `);
      if (ftsRebuilt) this.backfillL1Fts();

      this.stmtL0FtsInsert = this.db.prepare(`
        INSERT INTO l0_fts (message_text, message_text_original, record_id, session_id, role, recorded_at, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      this.stmtL0FtsDelete = this.db.prepare('DELETE FROM l0_fts WHERE record_id = ?');
      this.stmtL0FtsSearch = this.db.prepare(`
        SELECT record_id, message_text_original AS message_text, session_id, role, recorded_at, timestamp,
               bm25(l0_fts) AS rank
        FROM l0_fts
        WHERE l0_fts MATCH ?
        ORDER BY rank ASC
        LIMIT ?
      `);
      this.ftsAvailable = true;
    } catch (err) {
      this.ftsAvailable = false;
      this.logger?.warn(
        `${TAG} FTS5 不可用（可能未编译进 SQLite）: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (providerInfo && this.countL1() === 0 && this.countL0() === 0) {
      // 空库 + 全新 meta：无历史向量，直接标记同步完成
      this.writeEmbeddingMeta(providerInfo);
    }
    return { needsReindex, reason };
  }

  private prepareL1VecStatements(): void {
    if (this.vecLoaded && this.dimensions > 0) {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS l1_vec USING vec0(
          record_id TEXT PRIMARY KEY,
          embedding float[${this.dimensions}] distance_metric=cosine,
          updated_time TEXT DEFAULT ''
        )
      `);
      this.stmtDeleteL1Vec = this.db.prepare('DELETE FROM l1_vec WHERE record_id = ?');
      this.stmtInsertL1Vec = this.db.prepare(
        'INSERT INTO l1_vec (record_id, embedding, updated_time) VALUES (?, ?, ?)',
      );
      this.stmtSearchL1Vec = this.db.prepare(`
        SELECT record_id, distance
        FROM l1_vec
        WHERE embedding MATCH ?
          AND k = ?
        ORDER BY distance
      `);
    } else {
      this.stmtDeleteL1Vec = undefined;
      this.stmtInsertL1Vec = undefined;
      this.stmtSearchL1Vec = undefined;
    }
  }

  private prepareL0VecStatements(): void {
    if (this.vecLoaded && this.dimensions > 0) {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS l0_vec USING vec0(
          record_id TEXT PRIMARY KEY,
          embedding float[${this.dimensions}] distance_metric=cosine,
          recorded_at TEXT DEFAULT ''
        )
      `);
      this.stmtDeleteL0Vec = this.db.prepare('DELETE FROM l0_vec WHERE record_id = ?');
      this.stmtInsertL0Vec = this.db.prepare(
        'INSERT INTO l0_vec (record_id, embedding, recorded_at) VALUES (?, ?, ?)',
      );
      this.stmtSearchL0Vec = this.db.prepare(`
        SELECT record_id, distance
        FROM l0_vec
        WHERE embedding MATCH ?
          AND k = ?
        ORDER BY distance
      `);
    } else {
      this.stmtDeleteL0Vec = undefined;
      this.stmtInsertL0Vec = undefined;
      this.stmtSearchL0Vec = undefined;
    }
  }

  private dropVectorTables(): void {
    this.db.exec('DROP TABLE IF EXISTS l1_vec');
    this.db.exec('DROP TABLE IF EXISTS l0_vec');
    // 表已重建：作废按块缓存的 IN 语句（旧语句指向已删表，不能依赖引擎自动重编译兜底）
    this.inStmts.clear();
    // provider/model/维度已变：旧的"不可嵌入"判定作废（新 provider 可能嵌入得了），skip 集清空
    this.clearVecSkipIds('l1');
    this.clearVecSkipIds('l0');
    this.prepareL1VecStatements();
    this.prepareL0VecStatements();
  }

  private tableExists(table: string): boolean {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
      .get(table) as { name: string } | undefined;
    return row !== undefined;
  }

  private hasColumn(table: string, column: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((r) => r.name === column);
  }

  /** 重建后的 l1_fts 从 l1_records 全量回灌（仅在 drop 重建时调用）。 */
  private backfillL1Fts(): void {
    const rows = this.db
      .prepare(
        `SELECT record_id, content, type, priority, scene_name, session_id, version,
                timestamp_str, timestamp_start, timestamp_end, metadata_json, family FROM l1_records`,
      )
      .all() as Array<Record<string, unknown>>;
    for (const r of rows) {
      try {
        this.stmtL1FtsInsert.run(
          tokenizeForFts(String(r.content ?? '')),
          String(r.content ?? ''),
          String(r.record_id ?? ''),
          String(r.type ?? ''),
          Number(r.priority ?? 50),
          String(r.scene_name ?? ''),
          String(r.session_id ?? 'default'),
          Number(r.version ?? 0),
          String(r.timestamp_str ?? ''),
          String(r.timestamp_start ?? ''),
          String(r.timestamp_end ?? ''),
          String(r.metadata_json ?? '{}'),
          String(r.family ?? 'chat'),
        );
      } catch {
        /* 单行失败跳过 */
      }
    }
    if (rows.length > 0) this.logger?.info(`${TAG} l1_fts 回灌 ${rows.length} 行`);
  }

  private readEmbeddingMeta(): EmbeddingMeta | undefined {
    try {
      const row = this.db
        .prepare('SELECT value FROM embedding_meta WHERE key = ?')
        .get('embedding_provider_info') as { value: string } | undefined;
      if (!row) return undefined;
      const parsed = JSON.parse(row.value) as Partial<EmbeddingMeta>;
      if (typeof parsed.provider !== 'string') return undefined;
      return {
        provider: parsed.provider,
        model: parsed.model ?? '',
        dimensions: parsed.dimensions ?? 0,
      };
    } catch {
      return undefined;
    }
  }

  private writeEmbeddingMeta(info: EmbeddingProviderInfo): void {
    this.db
      .prepare(
        'INSERT INTO embedding_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run('embedding_provider_info', JSON.stringify(info));
  }

  /**
   * 标记当前向量与 embedding 配置同步完成（持久化 meta）。
   * 只应在重嵌入成功（或空库无历史向量）后调用——过早写入会让下次启动
   * 比对通过而跳过补齐，向量表永远空着（review P7）。
   */
  markEmbeddingSynced(info: EmbeddingProviderInfo): void {
    if (this.degraded) return;
    try {
      this.writeEmbeddingMeta(info);
    } catch (err) {
      this.logger?.warn(`${TAG} embedding meta 写入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ============================
  // L1 写入 / 删除 / 读取
  // ============================

  /** upsert 一条 L1（元数据 + FTS 同步；embedding 非零时写向量）。失败返回 false 不抛。 */
  upsertL1(record: MemoryRecord, embedding?: Float32Array): boolean {
    if (this.degraded) return false;
    try {
      this.db.exec('BEGIN');
      try {
        this.upsertL1InTx(record, embedding);
        this.db.exec('COMMIT');
      } catch (err) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      }
      return true;
    } catch (err) {
      this.logger?.warn(
        `${TAG} L1 upsert 失败（非致命）id=${record.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * 批量 upsert L1（单事务；与单条同语义：FTS 失败整批回滚）。
   * 追加/导入热路径用它——逐条开事务在 WAL FULL 下每条一次 fsync。
   * 整批失败时回退逐条写入：好记录照常入库、坏记录只丢自身——否则
   * JSONL 事实源已先行追加，检索库却整批缺失且无自动重导路径（批次空洞）。
   */
  upsertL1Batch(records: MemoryRecord[], embeddings?: Array<Float32Array | undefined>): boolean {
    if (this.degraded || records.length === 0) return false;
    try {
      this.db.exec('BEGIN');
      try {
        for (let i = 0; i < records.length; i++) {
          this.upsertL1InTx(records[i], embeddings?.[i]);
        }
        this.db.exec('COMMIT');
      } catch (err) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      }
      return true;
    } catch (err) {
      this.logger?.warn(
        `${TAG} L1 批量写入失败，回退逐条写入: ${err instanceof Error ? err.message : String(err)}`,
      );
      const failed: string[] = [];
      for (let i = 0; i < records.length; i++) {
        if (!this.upsertL1(records[i], embeddings?.[i])) failed.push(records[i].id);
      }
      if (failed.length > 0) {
        this.logger?.warn(
          `${TAG} 逐条回退后仍失败 ${failed.length}/${records.length} 条: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}`,
        );
      }
      return failed.length === 0;
    }
  }

  /** 事务内的单条写入体（upsertL1 / upsertL1Batch 共用；调用方负责 BEGIN/COMMIT）。 */
  private upsertL1InTx(record: MemoryRecord, embedding?: Float32Array): void {
    const ts = timestampsToDb(record.timestamps);
    this.stmtUpsertL1.run(
      record.id,
      record.content,
      record.type,
      record.priority,
      record.scene_name,
      record.sessionId ?? 'default',
      record.version ?? 0,
      ts.str,
      ts.start,
      ts.end,
      toIso(record.createdAt),
      toIso(record.updatedAt),
      JSON.stringify(record.metadata ?? {}),
      record.family ?? familyForType(record.type),
    );
    // vec0 不支持 ON CONFLICT → 先删后插；零向量跳过（cosine 未定义）
    if (this.stmtDeleteL1Vec && this.stmtInsertL1Vec) {
      this.stmtDeleteL1Vec.run(record.id);
      if (embedding && !isZeroVector(embedding)) {
        this.stmtInsertL1Vec.run(record.id, vecToBuffer(embedding), toIso(record.updatedAt));
      }
    }
    // FTS 删除/插入与元数据同事务：失败必须整体回滚——若只吞 FTS 错误照常 COMMIT，
    // 已执行的 DELETE 会让该 id 的索引行被删未补，记录从此全文检索不可见（静默丢数据）。
    if (this.ftsAvailable) {
      this.stmtL1FtsDelete.run(record.id);
      this.stmtL1FtsInsert.run(
        tokenizeForFts(record.content),
        record.content,
        record.id,
        record.type,
        record.priority,
        record.scene_name,
        record.sessionId ?? 'default',
        record.version ?? 0,
        ts.str,
        ts.start,
        ts.end,
        JSON.stringify(record.metadata ?? {}),
        record.family ?? familyForType(record.type),
      );
    }
  }

  /** 批量删除 L1（元数据 + 向量 + FTS），返回删除条数。IN 按 ≤900 分块（避变量数上限）。 */
  deleteL1Batch(ids: string[]): number {
    if (this.degraded || ids.length === 0) return 0;
    try {
      this.db.exec('BEGIN');
      try {
        for (const chunk of chunkIds(ids)) this.inStatement('l1_records', 'delete', chunk.length).run(...chunk);
        if (this.stmtDeleteL1Vec) {
          for (const chunk of chunkIds(ids)) this.inStatement('l1_vec', 'delete', chunk.length).run(...chunk);
        }
        if (this.ftsAvailable) {
          for (const chunk of chunkIds(ids)) this.inStatement('l1_fts', 'delete', chunk.length).run(...chunk);
        }
        this.db.exec('COMMIT');
        return ids.length;
      } catch (err) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      }
    } catch (err) {
      this.logger?.warn(`${TAG} L1 批量删除失败: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }

  /** 按块缓存的 IN 语句（表名/动作/尺寸 → 预编译语句）：热路径不再每次动态 prepare。 */
  private readonly inStmts = new Map<string, StatementLike>();

  private inStatement(table: 'l1_records' | 'l1_vec' | 'l1_fts', action: 'delete' | 'select', size: number): StatementLike {
    const key = `${table}:${action}:${size}`;
    let stmt = this.inStmts.get(key);
    if (!stmt) {
      const ph = Array.from({ length: size }, () => '?').join(',');
      stmt =
        action === 'delete'
          ? this.db.prepare(`DELETE FROM ${table} WHERE record_id IN (${ph})`)
          : this.db.prepare(
              `SELECT record_id, content, type, priority, scene_name, version, timestamp_str, created_time, updated_time, metadata_json, family FROM ${table} WHERE record_id IN (${ph})`,
            );
      this.inStmts.set(key, stmt);
    }
    return stmt;
  }

  /**
   * 清空 L1 检索库全部数据（重建用）。records/FTS 直接 DELETE；
   * 向量表走 DROP + 重建（vec0 的全表 DELETE 语义不可靠，dropVectorTables
   * 会连 l0_vec 一起删——L0 向量必须保留——故此处单独处理 l1_vec）。
   * L0 表与 embedding_meta 不动：backfill 的行数比对天然重新一致。
   */
  clearL1(): boolean {
    if (this.degraded) return false;
    try {
      this.db.exec('BEGIN');
      try {
        this.db.exec('DELETE FROM l1_records');
        if (this.ftsAvailable) this.db.exec('DELETE FROM l1_fts');
        this.db.exec('COMMIT');
      } catch (err) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      }
      // vec0 全表 DELETE 语义不可靠 → DROP + 重建空表；放事务外（vtab DDL 事务性弱）。
      // 中间态：向量行短暂孤儿——检索侧对缺 meta 的向量本就跳过（searchL1Vector 回查过滤）。
      if (this.stmtDeleteL1Vec) {
        this.db.exec('DROP TABLE IF EXISTS l1_vec');
        this.prepareL1VecStatements();
        this.inStmts.clear();
      }
      // 重建后 L1 id 全新，旧 skip 集是死数据，清空让新记录获得一次嵌入机会
      this.clearVecSkipIds('l1');
      this.logger?.info(`${TAG} L1 检索库已清空（重建）`);
      return true;
    } catch (err) {
      this.logger?.warn(`${TAG} L1 清空失败: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  countL1(): number {
    if (this.degraded) return 0;
    try {
      const row = this.db.prepare('SELECT COUNT(*) AS n FROM l1_records').get() as { n: number };
      return row?.n ?? 0;
    } catch {
      // 建表前（init 的 embedding 变更检测）会先调用计数
      return 0;
    }
  }

  /** 全量读取（调试/迁移/重嵌入用；检索请走 FTS/向量）。 */
  getAllL1(): MemoryRecord[] {
    if (this.degraded) return [];
    const rows = this.db
      .prepare(
        'SELECT record_id, content, type, priority, scene_name, version, timestamp_str, created_time, updated_time, metadata_json, family FROM l1_records',
      )
      .all() as unknown as L1MetaRow[];
    return rows.map(rowToRecord);
  }

  getL1ByIds(ids: string[]): MemoryRecord[] {
    if (this.degraded || ids.length === 0) return [];
    const rows: L1MetaRow[] = [];
    for (const chunk of chunkIds(ids)) {
      rows.push(...(this.inStatement('l1_records', 'select', chunk.length).all(...chunk) as unknown as L1MetaRow[]));
    }
    return rows.map(rowToRecord);
  }

  /** 浏览列表（UI 用）：按更新时间倒序，支持类型/场景/族过滤与分页。失败返回空。 */
  listL1(opts: { type?: string; scene?: string; family?: string; limit: number; offset: number }): { items: MemoryRecord[]; total: number } {
    if (this.degraded) return { items: [], total: 0 };
    try {
      const where: string[] = [];
      const params: Array<string | number> = [];
      if (opts.type) {
        where.push('type = ?');
        params.push(opts.type);
      }
      if (opts.scene) {
        where.push('scene_name = ?');
        params.push(opts.scene);
      }
      if (opts.family) {
        where.push('family = ?');
        params.push(opts.family);
      }
      const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
      const totalRow = this.db.prepare(`SELECT COUNT(*) AS n FROM l1_records${whereSql}`).get(...params) as { n: number };
      const rows = this.db
        .prepare(
          `SELECT record_id, content, type, priority, scene_name, version, timestamp_str, created_time, updated_time, metadata_json, family FROM l1_records${whereSql} ORDER BY updated_time DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, opts.limit, opts.offset) as unknown as L1MetaRow[];
      return { items: rows.map(rowToRecord), total: totalRow?.n ?? 0 };
    } catch (err) {
      this.logger?.warn(`${TAG} L1 浏览列表查询失败（返回空）: ${err instanceof Error ? err.message : String(err)}`);
      return { items: [], total: 0 };
    }
  }

  /** 场景名去重列表（UI 筛选器数据源）。失败返回空。 */
  distinctL1Scenes(): string[] {
    if (this.degraded) return [];
    try {
      const rows = this.db
        .prepare('SELECT DISTINCT scene_name FROM l1_records ORDER BY scene_name')
        .all() as Array<{ scene_name: string }>;
      return rows.map((r) => r.scene_name).filter(Boolean);
    } catch {
      return [];
    }
  }

  // ============================
  // L1 检索
  // ============================

  /** FTS5 BM25 检索（family 缺省不过滤）。失败返回空数组（调用方降级）。 */
  searchL1Fts(query: string, limit: number, family?: string): L1SearchHit[] {
    if (this.degraded || !this.ftsAvailable) return [];
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return [];
    try {
      const rows = (
        family
          ? this.stmtL1FtsSearchFamily.all(ftsQuery, family, limit)
          : this.stmtL1FtsSearch.all(ftsQuery, limit)
      ) as Array<{
        record_id: string;
        content: string;
        type: string;
        priority: number;
        scene_name: string;
        family: string;
        rank: number;
      }>;
      return rows.map((r) => ({
        id: r.record_id,
        content: r.content,
        type: r.type,
        priority: r.priority,
        scene_name: r.scene_name,
        family: normFamily(r.family, r.type),
        score: bm25RankToScore(r.rank),
      }));
    } catch (err) {
      this.logger?.warn(`${TAG} L1 FTS 检索失败（返回空）: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /** vec0 余弦 KNN 检索（score = 1 - cosine distance；family 过滤走过度召回 + 回查过滤，vec0 无法 WHERE）。失败返回空数组。 */
  searchL1Vector(embedding: Float32Array, topK: number, family?: string): L1SearchHit[] {
    if (this.degraded || !this.stmtSearchL1Vec) return [];
    try {
      // 过度召回补偿遗留零向量；带族过滤时再放大（不命中本族的行会被丢弃）
      const retrieveCount = (topK + ZERO_VEC_BUFFER) * (family ? 3 : 1);
      const rows = this.stmtSearchL1Vec.all(vecToBuffer(embedding), retrieveCount) as Array<{
        record_id: string;
        distance: number | null;
      }>;
      const hits: L1SearchHit[] = [];
      for (const { record_id, distance } of rows) {
        if (distance == null || Number.isNaN(distance)) continue;
        const meta = this.stmtGetL1.get(record_id) as L1MetaRow | undefined;
        if (!meta) continue;
        if (family && normFamily(meta.family, meta.type) !== family) continue;
        hits.push({
          id: record_id,
          content: meta.content,
          type: meta.type,
          priority: meta.priority,
          scene_name: meta.scene_name,
          family: normFamily(meta.family, meta.type),
          score: 1.0 - distance,
        });
      }
      return hits.slice(0, topK);
    } catch (err) {
      this.logger?.warn(`${TAG} L1 向量检索失败（返回空）: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  // ============================
  // L0 写入 / 删除 / 读取
  // ============================

  /** 批量 upsert L0 消息（元数据 + FTS；embeddings 与 records 等长，可省略）。 */
  upsertL0Batch(records: L0MessageRecord[], embeddings?: Array<Float32Array | undefined>): boolean {
    if (this.degraded || records.length === 0) return false;
    try {
      this.db.exec('BEGIN');
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        this.stmtUpsertL0.run(r.id, r.sessionId, r.role, r.content, r.recordedAt, r.timestamp);
        if (this.stmtDeleteL0Vec && this.stmtInsertL0Vec) {
          this.stmtDeleteL0Vec.run(r.id);
          const vec = embeddings?.[i];
          if (vec && !isZeroVector(vec)) {
            this.stmtInsertL0Vec.run(r.id, vecToBuffer(vec), r.recordedAt);
          }
        }
        if (this.ftsAvailable) {
          // 同 upsertL1：FTS 失败冒泡触发整批回滚，禁止"删了没补"的索引空洞。
          this.stmtL0FtsDelete.run(r.id);
          this.stmtL0FtsInsert.run(tokenizeForFts(r.content), r.content, r.id, r.sessionId, r.role, r.recordedAt, r.timestamp);
        }
      }
      this.db.exec('COMMIT');
      return true;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      this.logger?.warn(`${TAG} L0 批量写入失败: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  countL0(): number {
    if (this.degraded) return 0;
    try {
      const row = this.db.prepare('SELECT COUNT(*) AS n FROM l0_conversations').get() as { n: number };
      return row?.n ?? 0;
    } catch {
      return 0;
    }
  }

  /** 统计 recorded_at >= iso 的消息数（状态面板"今日捕获"用）。 */
  countL0Since(iso: string): number {
    if (this.degraded) return 0;
    try {
      const row = this.db
        .prepare('SELECT COUNT(*) AS n FROM l0_conversations WHERE recorded_at >= ?')
        .get(iso) as { n: number };
      return row?.n ?? 0;
    } catch {
      return 0;
    }
  }

  /** L0 全量列举（重建快照用；按时间升序，事务一致性避开 JSONL 追加竞态）。 */
  listL0All(): L0MessageRecord[] {
    if (this.degraded) return [];
    try {
      const rows = this.db
        .prepare('SELECT record_id, session_id, role, message_text, recorded_at, timestamp FROM l0_conversations ORDER BY timestamp ASC')
        .all() as Array<{ record_id: string; session_id: string; role: string; message_text: string; recorded_at: string; timestamp: number }>;
      return rows.map((r) => ({
        sessionId: r.session_id,
        recordedAt: r.recorded_at,
        id: r.record_id,
        role: r.role as L0MessageRecord['role'],
        content: r.message_text,
        timestamp: r.timestamp ?? 0,
      }));
    } catch (err) {
      this.logger?.warn(`${TAG} L0 全量列举失败（返回空）: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /** 重建成本预估（一次全表聚合：会话数 / 消息数 / 字符量）。 */
  l0RebuildEstimate(): { sessions: number; messages: number; chars: number } {
    if (this.degraded) return { sessions: 0, messages: 0, chars: 0 };
    try {
      const row = this.db
        .prepare(
          'SELECT COUNT(DISTINCT session_id) AS s, COUNT(*) AS n, COALESCE(SUM(LENGTH(message_text)), 0) AS c FROM l0_conversations',
        )
        .get() as { s: number; n: number; c: number };
      return { sessions: row?.s ?? 0, messages: row?.n ?? 0, chars: row?.c ?? 0 };
    } catch {
      return { sessions: 0, messages: 0, chars: 0 };
    }
  }

  /** 向量表行数（backfill 判据：与元数据行数的差值即缺失向量数；不可用时返回 -1）。 */
  countL1Vec(): number {
    if (this.degraded || !this.stmtSearchL1Vec) return -1;
    try {
      const row = this.db.prepare('SELECT COUNT(*) AS n FROM l1_vec').get() as { n: number };
      return row?.n ?? -1;
    } catch {
      return -1;
    }
  }

  countL0Vec(): number {
    if (this.degraded || !this.stmtSearchL0Vec) return -1;
    try {
      const row = this.db.prepare('SELECT COUNT(*) AS n FROM l0_vec').get() as { n: number };
      return row?.n ?? -1;
    } catch {
      return -1;
    }
  }

  // ============================
  // L0 检索
  // ============================

  searchL0Fts(query: string, limit: number): L0SearchHit[] {
    if (this.degraded || !this.ftsAvailable) return [];
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return [];
    try {
      const rows = this.stmtL0FtsSearch.all(ftsQuery, limit) as Array<{
        record_id: string;
        message_text: string;
        session_id: string;
        role: string;
        recorded_at: string;
        timestamp: number;
        rank: number;
      }>;
      return rows.map((r) => ({
        sessionId: r.session_id,
        recordedAt: r.recorded_at,
        id: r.record_id,
        role: r.role as L0MessageRecord['role'],
        content: r.message_text,
        timestamp: r.timestamp ?? 0,
        score: bm25RankToScore(r.rank),
      }));
    } catch (err) {
      this.logger?.warn(`${TAG} L0 FTS 检索失败（返回空）: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  searchL0Vector(embedding: Float32Array, topK: number): L0SearchHit[] {
    if (this.degraded || !this.stmtSearchL0Vec) return [];
    try {
      const retrieveCount = topK + ZERO_VEC_BUFFER;
      const rows = this.stmtSearchL0Vec.all(vecToBuffer(embedding), retrieveCount) as Array<{
        record_id: string;
        distance: number | null;
      }>;
      const hits: L0SearchHit[] = [];
      for (const { record_id, distance } of rows) {
        if (distance == null || Number.isNaN(distance)) continue;
        const row = this.stmtGetL0.get(record_id) as
          | { session_id: string; role: string; message_text: string; recorded_at: string; timestamp: number }
          | undefined;
        if (!row) continue;
        hits.push({
          sessionId: row.session_id,
          recordedAt: row.recorded_at,
          id: record_id,
          role: row.role as L0MessageRecord['role'],
          content: row.message_text,
          timestamp: row.timestamp ?? 0,
          score: 1.0 - distance,
        });
      }
      return hits.slice(0, topK);
    } catch (err) {
      this.logger?.warn(`${TAG} L0 向量检索失败（返回空）: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  // ============================
  // 重嵌入（reindexAll 用）
  // ============================

  /** L1 缺失向量的记录数（排除 skip 集后的补齐判据；向量能力不可用返回 -1）。 */
  countL1VecMissing(exclude?: Set<string>): number {
    if (this.degraded || !this.stmtSearchL1Vec) return -1;
    try {
      const row = this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM l1_records r
           LEFT JOIN l1_vec v ON v.record_id = r.record_id
           WHERE v.record_id IS NULL${notInClause('r.record_id', exclude)}`,
        )
        .all(...notInParams(exclude))[0] as { n: number };
      return row?.n ?? 0;
    } catch (err) {
      // -1 会让补齐判据（> 0）按"无缺失"处理——必须留痕，不能静默停摆
      this.logger?.warn(`${TAG} L1 缺失向量计数失败（补齐判据按无缺失处理）: ${err instanceof Error ? err.message : String(err)}`);
      return -1;
    }
  }

  /** L0 缺失向量的记录数（同上）。 */
  countL0VecMissing(exclude?: Set<string>): number {
    if (this.degraded || !this.stmtSearchL0Vec) return -1;
    try {
      const row = this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM l0_conversations r
           LEFT JOIN l0_vec v ON v.record_id = r.record_id
           WHERE v.record_id IS NULL${notInClause('r.record_id', exclude)}`,
        )
        .all(...notInParams(exclude))[0] as { n: number };
      return row?.n ?? 0;
    } catch (err) {
      this.logger?.warn(`${TAG} L0 缺失向量计数失败（补齐判据按无缺失处理）: ${err instanceof Error ? err.message : String(err)}`);
      return -1;
    }
  }

  /**
   * 待重嵌入的 L1：只取缺失向量的记录（增量），排除 skip 集里已判定
   * "当前 provider 下不可嵌入（零向量）"的 id——缺 1 条不再全量重嵌，
   * 零向量记录也不再反复喂给 embeddings API（H1 死循环双根因）。
   */
  getL1ForReindex(exclude?: Set<string>): Array<{ id: string; content: string }> {
    if (this.degraded) return [];
    try {
      return this.db
        .prepare(
          `SELECT r.record_id AS id, r.content FROM l1_records r
           LEFT JOIN l1_vec v ON v.record_id = r.record_id
           WHERE v.record_id IS NULL${notInClause('r.record_id', exclude)}`,
        )
        .all(...notInParams(exclude)) as Array<{ id: string; content: string }>;
    } catch (err) {
      this.logger?.warn(`${TAG} L1 重嵌入取数失败（返回空，本轮跳过）: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /** 待重嵌入的 L0（增量 + 排除 skip 集，同 getL1ForReindex）。 */
  getL0ForReindex(exclude?: Set<string>): Array<{ id: string; text: string }> {
    if (this.degraded) return [];
    try {
      return this.db
        .prepare(
          `SELECT r.record_id AS id, r.message_text AS text FROM l0_conversations r
           LEFT JOIN l0_vec v ON v.record_id = r.record_id
           WHERE v.record_id IS NULL${notInClause('r.record_id', exclude)}`,
        )
        .all(...notInParams(exclude)) as Array<{ id: string; text: string }>;
    } catch (err) {
      this.logger?.warn(`${TAG} L0 重嵌入取数失败（返回空，本轮跳过）: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  // ── 零向量 skip 集（embedding_meta 持久化；provider 变化时随向量表一起清空） ──

  getVecSkipSet(kind: 'l1' | 'l0'): Set<string> {
    if (this.degraded) return new Set();
    try {
      const row = this.db
        .prepare('SELECT value FROM embedding_meta WHERE key = ?')
        .get(vecSkipKey(kind)) as { value: string } | undefined;
      if (!row) return new Set();
      const parsed = JSON.parse(row.value) as unknown;
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((x): x is string => typeof x === 'string'));
    } catch {
      return new Set();
    }
  }

  addVecSkippedIds(kind: 'l1' | 'l0', ids: string[]): void {
    if (this.degraded || ids.length === 0) return;
    try {
      let merged = [...new Set([...this.getVecSkipSet(kind), ...ids])];
      // 上限防 NOT IN 占位符无界膨胀（老构建变量上限 999）；达到上限本身
      // 说明 embedding 服务大面积返回零向量，被挤出的旧 id 只是多一次重试
      if (merged.length > VEC_SKIP_CAP) {
        merged = merged.slice(-VEC_SKIP_CAP);
        this.logger?.warn(`${TAG} skip 集达上限 ${VEC_SKIP_CAP}（零向量记录过多，embedding 服务疑似异常）`);
      }
      this.db
        .prepare('INSERT INTO embedding_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        .run(vecSkipKey(kind), JSON.stringify(merged));
    } catch (err) {
      this.logger?.warn(`${TAG} skip 集写入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  clearVecSkipIds(kind: 'l1' | 'l0'): void {
    if (this.degraded) return;
    try {
      this.db.prepare('DELETE FROM embedding_meta WHERE key = ?').run(vecSkipKey(kind));
    } catch {
      /* 空集语义，失败无影响 */
    }
  }

  /** 只更新向量行（重嵌入用）。 */
  updateL1Vec(id: string, embedding: Float32Array): boolean {
    if (this.degraded || !this.stmtDeleteL1Vec || !this.stmtInsertL1Vec) return false;
    if (isZeroVector(embedding)) return false;
    try {
      this.stmtDeleteL1Vec.run(id);
      this.stmtInsertL1Vec.run(id, vecToBuffer(embedding), new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  updateL0Vec(id: string, embedding: Float32Array, recordedAt: string): boolean {
    if (this.degraded || !this.stmtDeleteL0Vec || !this.stmtInsertL0Vec) return false;
    if (isZeroVector(embedding)) return false;
    try {
      this.stmtDeleteL0Vec.run(id);
      this.stmtInsertL0Vec.run(id, vecToBuffer(embedding), recordedAt);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* ignore */
    }
  }
}

// ============================
// 行映射工具
// ============================

interface L1MetaRow {
  record_id: string;
  content: string;
  type: string;
  priority: number;
  scene_name: string;
  version: number;
  timestamp_str: string;
  created_time: string;
  updated_time: string;
  metadata_json: string;
  family?: string;
}

function rowToRecord(row: L1MetaRow): MemoryRecord {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata_json || '{}') as Record<string, unknown>;
  } catch {
    /* 坏 JSON 容忍 */
  }
  return {
    id: row.record_id,
    content: row.content,
    type: row.type,
    priority: row.priority,
    scene_name: row.scene_name,
    timestamps: dbToTimestamps(row.timestamp_str),
    createdAt: Date.parse(row.created_time) || 0,
    updatedAt: Date.parse(row.updated_time) || 0,
    version: row.version ?? 0,
    metadata,
    family: normFamily(row.family, row.type),
  };
}

function timestampsToDb(ts: number[] | undefined): { str: string; start: string; end: string } {
  if (!ts || ts.length === 0) return { str: '', start: '', end: '' };
  const sorted = [...ts].filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  if (sorted.length === 0) return { str: '', start: '', end: '' };
  const isos = sorted.map((t) => new Date(t).toISOString());
  return { str: isos.join(','), start: isos[0], end: isos[isos.length - 1] };
}

function dbToTimestamps(str: string): number[] {
  if (!str) return [];
  return str
    .split(',')
    .map((t) => Date.parse(t))
    .filter((t) => !Number.isNaN(t));
}

function toIso(epochMs: number | undefined): string {
  if (!epochMs || !Number.isFinite(epochMs)) return '';
  return new Date(epochMs).toISOString();
}

/** 全零向量（cosine 未定义，不可入向量表）。reindex 侧用它区分"不可嵌入"与"写入失败"。 */
export function isZeroVector(vec: Float32Array): boolean {
  for (const v of vec) {
    if (v !== 0) return false;
  }
  return true;
}

/** NOT IN 片段（空集 → 空串；配合 notInParams 使用）。 */
function notInClause(column: string, exclude?: Set<string>): string {
  if (!exclude || exclude.size === 0) return '';
  return ` AND ${column} NOT IN (${[...exclude].map(() => '?').join(',')})`;
}

function notInParams(exclude?: Set<string>): string[] {
  if (!exclude || exclude.size === 0) return [];
  return [...exclude];
}

function vecSkipKey(kind: 'l1' | 'l0'): string {
  return kind === 'l1' ? 'embedding_zero_vec_l1' : 'embedding_zero_vec_l0';
}

/** DB 字符串 → 族（异常值按 type 前缀兜底归一）。 */
function normFamily(raw: string | undefined, type: string): MemoryFamily {
  if (raw === 'work' || raw === 'chat') return raw;
  return familyForType(type);
}

function vecToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}
