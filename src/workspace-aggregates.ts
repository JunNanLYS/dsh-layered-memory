/**
 * 工作台只读聚合（UI 重构分散式）：总览快照、资产活动流、运行洞察三个端点的
 * 数据装配层。全部只读，不触碰蒸馏/召回语义。
 *
 * 数据源纪律：本组端点按「设置页打开期间低频拉取」设计（非 session-stats
 * 热路径）——L1 走 SQL 索引（idx_l1_updated 范围扫描 / FTS 检索唯一缝）；
 * L2 场景与 L3 画像是文件级小数据（dsh-memory/scenes、/persona 端点同款读法）。
 */
import type {
  AssetActivityItem,
  AssetActivityResponse,
  MemoryStats,
  RuntimeInsightsResponse,
  WorkspaceOverviewResponse,
} from './contract.js';
import { snapshotDistillUsage } from './llm-usage.js';
import type { L1Store } from './store/l1.js';
import type { PersonaStore } from './store/persona.js';
import type { SceneStore } from './store/scenes.js';
import type { SessionModeStore } from './store/session-modes.js';
import type { MemoryFamily, MemoryRecord } from './types.js';
import type { SessionInfoSource } from './stats.js';
import type { LiveSettingsHandle } from './settings.js';

/** 工作台可见的分族存储聚合（与 registerMemoryRpc 的 stores 同形）。 */
export type WorkspaceStores = {
  l1: L1Store;
  scenes: Record<MemoryFamily, SceneStore>;
  persona: Record<MemoryFamily, PersonaStore>;
};

/** 检索路径单次上限（与 list-records 同值：检索缝的硬上限，触达即 truncated）。 */
const SEARCH_CAP = 200;
/** L1 标题截断长度（内容首行；完整内容在 content 字段）。 */
const TITLE_MAX = 60;

const FAMILIES: readonly MemoryFamily[] = ['chat', 'work'];

/* ── 资产活动流 ── */

export interface ActivityQuery {
  query: string;
  kind: '' | 'l1' | 'l2' | 'l3';
  family: '' | 'chat' | 'work';
  sinceMs: number;
  limit: number;
  offset: number;
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { o?: unknown };
    return typeof v.o === 'number' && Number.isInteger(v.o) && v.o >= 0 && v.o <= 1_000_000 ? v.o : 0;
  } catch {
    return 0;
  }
}

function l1Title(content: string): string {
  const firstLine = content.split('\n', 1)[0] ?? '';
  const t = firstLine.trim();
  return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX - 1) + '…' : t;
}

function l1ToItem(r: MemoryRecord): AssetActivityItem {
  const family: MemoryFamily = r.family ?? 'chat';
  return {
    id: `l1:${r.id}`,
    kind: 'l1',
    verb: (r.version ?? 0) > 1 ? 'upd' : 'new',
    family,
    title: l1Title(r.content),
    content: r.content,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    version: r.version ?? 0,
    sourceSession: r.sessionId ?? 'default',
    scene: r.scene_name || null,
  };
}

/** 剥离 L2 场景文件头 frontmatter（--- … --- 块），活动流正文只留自然内容。 */
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return raw;
  return raw.slice(end + 4).replace(/^\s*\n/, '');
}

const ts = (iso: string | null): number => (iso ? Date.parse(iso) || 0 : 0);

/**
 * 混排资产活动流：L1（索引列表/检索缝）+ L2（场景摘要，页内补读正文）+
 * L3（画像 + mtime），按 updatedAt 倒序统一排序后游标切片。
 */
export async function collectAssetActivity(stores: WorkspaceStores, q: ActivityQuery): Promise<AssetActivityResponse> {
  const pool: AssetActivityItem[] = [];
  const window = q.offset + q.limit; // 每源取满窗口后混排切片（偏移分页的合并语义）
  const sinceIso = q.sinceMs > 0 ? new Date(q.sinceMs).toISOString() : undefined;
  const familyOpt = q.family || undefined;
  let truncated = false;

  if (q.kind === '' || q.kind === 'l1') {
    let items: MemoryRecord[];
    if (q.query) {
      // 检索唯一缝（与召回同源）：ranked hits 再经 getByIds 索引点查补全
      // 时间戳/版本（L1Hit 投影不含 updatedAt，混排排序需要），此后统一按时间排序
      const hits = await stores.l1.search(q.query, Math.min(window, SEARCH_CAP), { family: familyOpt });
      items = stores.l1.getByIds(hits.map((h) => h.id));
      truncated = window > SEARCH_CAP;
    } else {
      items = stores.l1.list({ family: familyOpt, since: sinceIso, limit: window, offset: 0 }).items;
    }
    for (const r of items) {
      if (sinceIso && r.updatedAt && new Date(r.updatedAt).toISOString() < sinceIso) continue;
      pool.push(l1ToItem(r));
    }
  }

  if (q.kind === '' || q.kind === 'l2') {
    for (const family of FAMILIES) {
      if (familyOpt && family !== familyOpt) continue;
      const scenes = await stores.scenes[family].list();
      for (const s of scenes) {
        const updatedMs = Date.parse(s.updated) || 0;
        const createdMs = Date.parse(s.created) || 0;
        if (q.sinceMs > 0 && (!updatedMs || updatedMs < q.sinceMs)) continue;
        if (q.query) {
          const needle = q.query.toLowerCase();
          if (!s.path.toLowerCase().includes(needle) && !s.summary.toLowerCase().includes(needle)) continue;
        }
        pool.push({
          id: `l2:${family}:${s.path}`,
          kind: 'l2',
          verb: updatedMs > createdMs ? 'upd' : 'new',
          family,
          title: s.path.replace(/\.md$/i, ''),
          content: s.summary, // 页内切片后补读正文（见下）
          createdAt: s.created && createdMs ? new Date(createdMs).toISOString() : null,
          updatedAt: updatedMs ? new Date(updatedMs).toISOString() : null,
          version: null,
          sourceSession: null,
          scene: null,
        });
      }
    }
  }

  if (q.kind === '' || q.kind === 'l3') {
    for (const family of FAMILIES) {
      if (familyOpt && family !== familyOpt) continue;
      const store = stores.persona[family];
      const [content, mtimeMs] = await Promise.all([store.read(), store.mtime()]);
      if (!content || !mtimeMs) continue;
      if (q.sinceMs > 0 && mtimeMs < q.sinceMs) continue;
      if (q.query && !content.toLowerCase().includes(q.query.toLowerCase())) continue;
      pool.push({
        id: `l3:${family}`,
        kind: 'l3',
        verb: 'upd', // 画像只有演进没有首版语义（mtime 即最近一次蒸馏写入）
        family,
        title: `persona-${family}.md`,
        content,
        createdAt: null,
        updatedAt: new Date(mtimeMs).toISOString(),
        version: null,
        sourceSession: null,
        scene: null,
      });
    }
  }

  pool.sort((a, b) => ts(b.updatedAt) - ts(a.updatedAt) || (a.id < b.id ? -1 : 1));
  const items = pool.slice(q.offset, q.offset + q.limit);

  // L2 页内条目补读完整正文（只读窗口内 ≤limit 个文件，非全量）
  await Promise.all(
    items.map(async (it) => {
      if (it.kind !== 'l2') return;
      const raw = await stores.scenes[it.family].read(it.id.slice(`l2:${it.family}:`.length));
      const body = raw ? stripFrontmatter(raw).trim() : '';
      if (body) it.content = body;
    }),
  );

  return {
    items,
    nextCursor: pool.length > q.offset + q.limit ? encodeCursor(q.offset + q.limit) : null,
    truncated,
  };
}

/* ── 总览快照 ── */

/** 总览聚合：buildStats 既有字段 + 本周成本（token-cost 周窗口）+ 最近活动前 5 条。 */
export async function buildWorkspaceOverview(
  stores: WorkspaceStores,
  base: MemoryStats,
  week: { calls: number; outputTokens: number; reasoningTokens: number } | null,
  retrieval: 'hybrid' | 'vector' | 'keyword' | 'none' | null,
): Promise<WorkspaceOverviewResponse> {
  const recent = await collectAssetActivity(stores, {
    query: '',
    kind: '',
    family: '',
    sinceMs: 0,
    limit: 5,
    offset: 0,
  });
  return {
    ok: true,
    degraded: base.message !== 'running',
    retrieval,
    pendingExtract: base.pendingExtract,
    l0Today: base.l0Today,
    l1Count: base.l1Count,
    sceneCount: base.sceneCount,
    personaChars: base.personaChars,
    empty: base.l1Count === 0 && base.sceneCount === 0 && base.personaChars === 0,
    lastExtractAt: base.lastExtractAt,
    lastL2At: base.lastL2At,
    lastL3At: base.lastL3At,
    week,
    recent: recent.items,
  };
}

/* ── 运行洞察 ── */

const DAY_MS = 24 * 3600_000;
/** UTC 日期键（与 L1 SQL substr(updated_time,1,10) 口径一致）。 */
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 洞察聚合：近 7 天逐日资产活动 + 蒸馏调用计数器 + 召回全量累计与停用分布。 */
export async function buildRuntimeInsights(
  stores: WorkspaceStores,
  sessionInfo: SessionInfoSource | undefined,
  modes: SessionModeStore | undefined,
  live: LiveSettingsHandle | undefined,
): Promise<RuntimeInsightsResponse> {
  // 近 7 天（含当日）UTC 日桶；L1 走索引 GROUP BY，L2/L3 小数据内存归桶
  const today = utcDay(Date.now());
  const startMs = Date.parse(today + 'T00:00:00Z') - 6 * DAY_MS;
  const buckets = new Map<string, { l1: number; l2: number; l3: number }>();
  for (let i = 0; i < 7; i++) {
    buckets.set(utcDay(startMs + i * DAY_MS), { l1: 0, l2: 0, l3: 0 });
  }
  const bump = (ms: number, k: 'l1' | 'l2' | 'l3') => {
    const b = buckets.get(utcDay(ms));
    if (b) b[k]++;
  };
  for (const row of stores.l1.countByDay(new Date(startMs).toISOString())) {
    const b = buckets.get(row.day);
    if (b) b.l1 += row.n;
  }
  for (const family of FAMILIES) {
    const scenes = await stores.scenes[family].list();
    for (const s of scenes) {
      const ms = Date.parse(s.updated) || 0;
      if (ms >= startMs) bump(ms, 'l2');
    }
    const mtimeMs = await stores.persona[family].mtime();
    if (mtimeMs !== null && mtimeMs >= startMs) bump(mtimeMs, 'l3');
  }
  const activityDays = Array.from(buckets.entries(), ([day, v]) => ({ day, ...v }));

  // 蒸馏调用计数器（进程生命周期累计；llm-usage 口径）
  const usage = snapshotDistillUsage();
  const layerOrder = ['l1-extract', 'l1-dedup', 'l2', 'l3'];
  const distill = layerOrder.map((layer) => ({
    layer,
    calls: usage.layers[layer]?.calls ?? 0,
    failures: usage.layers[layer]?.failures ?? 0,
  }));

  // 召回全量累计（进程内注册表）+ 停用分布
  const all = sessionInfo?.recallStatsAll?.() ?? [];
  const sums = { injectedTurns: 0, hitTurns: 0, totalHits: 0, timeouts: 0, suppressedRecalls: 0 };
  for (const s of all) {
    sums.injectedTurns += s.injectedTurns;
    sums.hitTurns += s.hitTurns;
    sums.totalHits += s.totalHits;
    sums.timeouts += s.timeouts;
    sums.suppressedRecalls += s.suppressedRecalls;
  }
  const counts = modes?.countStates() ?? { off: 0, wo: 0 };

  return {
    ok: true,
    activityDays,
    distill,
    recall: {
      sessions: all.length,
      ...sums,
      globalRecall: live?.get()?.recall ?? true,
      sessionsModeOff: counts.off,
      sessionsWriteOnly: counts.wo,
    },
  };
}
