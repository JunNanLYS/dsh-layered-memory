// 检索层离线确定性指标（零 LLM 成本，跑完即可分析）：
//   recall@5 / gold 覆盖 / MRR —— 用探针问题原文在 rep 的最终记忆库上受控复现
//     keyword 检索（语义照抄运行时：候选池 limit×3、scoreThreshold=0.3 + 小语料
//     例外、slice 5、auto 档无 family 过滤；查询构造与索引分词共用 dist 的
//     search-utils，保证 token 对齐）；
//   注入精度 / 作废泄漏 —— 纯 result.json 计算：recall.lines 里含 gold 要点的行
//     占比；update 类题的 stale 出现在注入行即计入泄漏（更新失败在注入层可见）。
//
// 数据源：<runDir>/rep-N/result.json + <runDir>/rep-N/memory/memory.db（run.mjs 为
// A 组固定分配的 dataDir）。db 缺失（旧版运行 / B 组）优雅跳过。
//
// 口径边界（bench/README「已知边界」同款声明）：
// - recall@k 是受控复现而非逐字复刻——运行时查询是会话尾部 8 条消息窗口，此处用
//   探针问题原文；记忆库取 rep 结束态（全场景累积后的最终库），所有探针同口径，
//   跨运行可比，侧重检索层能力而非逐题运行时状态；
// - 该跑启用向量时运行时走 hybrid，此处 FTS-only 为近似（输出会标注）；
// - 注入行经过预算截断（单条 ≤500 字符），gold 落在截断尾巴时注入精度被低估。
//
// 用法：node bench/harness/retrieval-metrics.mjs <runDir...>
// 库函数（report.mjs / compare.mjs 复用）：retrievalMetricsForRun / mergeRetrieval /
// renderRetrievalSection / renderInjectionLines。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { bm25RankToScore, buildFtsQuery } from '../../dist/store/search-utils.js';
import { MemoryDb } from '../../dist/store/sqlite.js';

// 与插件运行时对齐的检索参数（src/config.ts recall 默认值 + src/store/l1.ts 常量）
const RECALL_LIMIT = 5;
const SCORE_THRESHOLD = 0.3;
const CANDIDATE_MULTIPLIER = 3;

function listReps(runDir) {
  return fs.existsSync(runDir)
    ? fs.readdirSync(runDir).filter((d) => /^rep-\d+$/.test(d)).sort()
    : [];
}

function readResult(runDir, rep) {
  const file = path.join(runDir, rep, 'result.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** FTS 查询（与 db.searchL1Fts 同 SQL 形态——取 content_original 原文做 gold 匹配，
 *  分词列带空格会让子串匹配系统性失真；FTS5 内置于 node:sqlite，无需扩展）。 */
function queryFts(db, query, limit) {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];
  const rows = db
    .prepare('SELECT record_id AS id, content_original AS content, rank FROM l1_fts WHERE l1_fts MATCH ? ORDER BY rank LIMIT ?')
    .all(ftsQuery, limit);
  return rows.map((r) => ({ id: r.id, content: r.content, score: bm25RankToScore(r.rank) }));
}

/** FTS 阈值过滤（照抄 src/store/l1.ts applyFtsThreshold：全部低于阈值但结果数
 *  ≤ maxResults 时保留——官方小语料例外）。 */
function applyFtsThreshold(hits, threshold, maxResults) {
  if (threshold <= 0) return hits;
  const filtered = hits.filter((h) => h.score >= threshold);
  if (filtered.length === 0 && hits.length > 0 && hits.length <= maxResults) return hits;
  return filtered;
}

/** 受控复现运行时 keyword 检索（无 type 过滤、无 family 过滤——auto 档口径）。 */
function keywordSearch(db, query, limit = RECALL_LIMIT, threshold = SCORE_THRESHOLD) {
  return applyFtsThreshold(queryFts(db, query, limit * CANDIDATE_MULTIPLIER), threshold, limit).slice(0, limit);
}

function emptyTypeBucket() {
  return { hit: 0, total: 0, coverage: 0, mrr: 0 };
}

/** 在打开的库上跑全部对话探针的 recall@k，累计进 byType（flood 模式与常规模式共用）。 */
function accumulateProbeRecall(db, result, byType) {
  for (const sc of result.scenarios ?? []) {
    if (sc.kind === 'workflow') continue;
    for (const p of sc.probes ?? []) {
      if (!Array.isArray(p.gold) || p.gold.length === 0) continue; // 拒答题无 gold，不进 recall@k
      const bucket = byType.get(p.type) ?? emptyTypeBucket();
      byType.set(p.type, bucket);
      const hits = keywordSearch(db, p.q);
      const goldHit = p.gold.filter((g) => hits.some((h) => h.content.includes(g)));
      const firstRank = hits.findIndex((h) => p.gold.some((g) => h.content.includes(g))) + 1;
      bucket.total++;
      bucket.coverage += goldHit.length / p.gold.length;
      bucket.mrr += firstRank > 0 ? 1 / firstRank : 0;
      if (goldHit.length > 0) bucket.hit++;
    }
  }
}

// ── 离线灌水（规模退化曲线）：把基准库复制一份、往副本灌 N 条确定性合成记录、
//    重算 recall@k——「检索质量 vs 库容」曲线，零运行成本、库容精确可控。 ──

// 合成记录素材：主题域与全部场景错开（园艺/垂钓/桌游/天文/家务/办公杂务…），
// 且全文零数字——避免误撞场景 gold 里的数值型要点（4900 / 98% / 24-70 …）。
const FLOOD_SUBJECTS = ['阳台的绿萝', '社区的钓鱼群', '桌游角的卡牌', '双筒望远镜', '玄关的鞋柜', '客厅的落地灯', '楼下的快递驿站', '窗台的蚁路', '手环的睡眠分', '背包的充电宝', '折叠伞的伞骨', '冰箱的保鲜层', '跑步鞋的鞋码', '理发店的预约', '朋友的柯基', '表姐的地铁通勤', '手机里的延时摄影', '工位的加湿器', '园区的班车', '年会的彩排', '消防通道的指示牌', '记账软件的科目表', '打印机搓纸轮', '陶艺课的转盘'];
const FLOOD_PREDS = ['状态是', '这周调整成了', '备注写着', '群里讨论的是', '预算定在', '周期固定为', '型号选了', '负责人改成', '地点挪到', '规则更新为', '评分是', '偏好是'];
const FLOOD_VALUES = ['待观察', '稳定运行', '需要返工', '效果不错', '继续观望', '已取消', '延后处理', '一次性投入', '按周复盘', '略有盈余', '口碑尚可', '还需打磨', '已完结', '进行中', '待确认'];

/** 确定性合成记录（组合穷举 + 尾缀字母序号保证唯一，零随机、可复现）。 */
function genFloodRecords(n) {
  const now = Date.now();
  const codeOf = (i) => {
    let s = '';
    let x = i;
    do { s = String.fromCharCode(97 + (x % 26)) + s; x = Math.floor(x / 26); } while (x > 0);
    return s;
  };
  const out = [];
  const S = FLOOD_SUBJECTS.length;
  const P = FLOOD_PREDS.length;
  for (let i = 0; i < n; i++) {
    const content = `${FLOOD_SUBJECTS[i % S]}${FLOOD_PREDS[Math.floor(i / S) % P]}${FLOOD_VALUES[Math.floor(i / (S * P)) % FLOOD_VALUES.length]}（${codeOf(i)}）`;
    out.push({
      id: `flood-${i}`,
      content,
      type: i % 3 === 2 ? 'work_fact' : 'fact',
      priority: 50,
      scene_name: '',
      timestamps: [now, now],
      createdAt: now + i,
      updatedAt: now + i,
      version: 1,
      source_message_ids: [],
      metadata: {},
      sessionId: 'flood',
      family: i % 3 === 2 ? 'work' : 'chat',
    });
  }
  return out;
}

/** 复制 db 三件套（.db/-wal/-shm）到临时目录，返回副本路径。 */
function copyDbToTemp(dbPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-flood-'));
  const copy = path.join(tmp, 'flood.db');
  for (const [src, dst] of [
    [dbPath, copy],
    [dbPath + '-wal', copy + '-wal'],
    [dbPath + '-shm', copy + '-shm'],
  ]) {
    if (fs.existsSync(src)) fs.copyFileSync(src, dst);
  }
  return { tmp, copy };
}

/**
 * 一个运行目录的灌水曲线：对每个 rep 库 × 每档 N 各复制一份、灌 N 条合成记录、
 * 重算 recall@k。返回 { levels: Map<N, {byType, baseRecords, flooded}> }（跨 rep 合并）。
 */
export function floodCurveForRun(runDir, levels) {
  const merged = new Map();
  for (const n of levels) merged.set(n, { byType: new Map(), baseRecords: 0, reps: 0 });
  for (const rep of listReps(runDir)) {
    const result = readResult(runDir, rep);
    if (!result || result.arm !== 'A') continue;
    const dbPath = path.join(runDir, rep, 'memory', 'memory.db');
    if (!fs.existsSync(dbPath)) continue;
    for (const n of levels) {
      const { tmp, copy } = copyDbToTemp(dbPath);
      try {
        // 阶段 1：MemoryDb 写入（分词建 FTS 索引与运行时一致）→ close（WAL 落盘）
        const wdb = new MemoryDb(copy, 0);
        try {
          wdb.init();
          if (n > 0) for (const rec of genFloodRecords(n)) wdb.upsertL1(rec);
        } finally {
          try { wdb.close(); } catch { /* 忽略 */ }
        }
        // 阶段 2：纯查询（node:sqlite 只读复现 recall@k）
        const qdb = new DatabaseSync(copy);
        try {
          const entry = merged.get(n);
          const base = qdb.prepare('SELECT COUNT(*) AS c FROM l1_records').get();
          entry.baseRecords += base.c - n;
          entry.reps += 1;
          accumulateProbeRecall(qdb, result, entry.byType);
        } finally {
          try { qdb.close(); } catch { /* Windows 句柄 */ }
        }
      } catch (err) {
        console.error(`[flood] ${runDir}/${rep} N=${n} 失败（跳过该档）：${err?.message ?? err}`);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
  }
  return merged;
}

/** 渲染灌水曲线表。 */
export function renderFloodCurve(curve, typeLabel = (t) => t) {
  const lines = [];
  const levels = [...curve.keys()].sort((a, b) => a - b);
  if (!levels.some((n) => curve.get(n).reps > 0)) {
    lines.push('（无可灌水的 rep 库：需要 arm A 运行的 memory/memory.db）');
    return lines;
  }
  const overall = (e) => {
    let hit = 0, total = 0, cov = 0, mrr = 0;
    for (const b of e.byType.values()) { hit += b.hit; total += b.total; cov += b.coverage; mrr += b.mrr; }
    return { recall: total ? hit / total : null, cov: total ? cov / total : null, mrr: total ? mrr / total : null };
  };
  const base = overall(curve.get(0) ?? curve.get(levels[0]));
  lines.push('| 灌入记录数 | 库容（均值） | recall@5 | Δ vs 基线 | gold 覆盖 | MRR |');
  lines.push('|---|---|---|---|---|---|');
  const fmt = (v) => (v == null ? '-' : `${(v * 100).toFixed(1)}%`);
  for (const n of levels) {
    const e = curve.get(n);
    if (e.reps === 0) continue;
    const o = overall(e);
    const avgRecords = e.reps > 0 ? Math.round(e.baseRecords / e.reps) + n : 0;
    const delta = o.recall != null && base.recall != null ? `${o.recall - base.recall >= 0 ? '+' : ''}${((o.recall - base.recall) * 100).toFixed(1)}pp` : '-';
    lines.push(`| +${n} | ${avgRecords} | ${fmt(o.recall)} | ${delta} | ${fmt(o.cov)} | ${o.mrr == null ? '-' : o.mrr.toFixed(2)} |`);
  }
  lines.push('');
  lines.push('> 灌水记录为确定性合成（主题域与场景库错开、全文零数字防误撞数值型 gold）；每档独立复制原库，原库不动。');
  return lines;
}

function emptyMetrics() {
  return {
    dbReps: 0,
    missingReps: 0,
    vector: false,
    byType: new Map(),
    injection: { probes: 0, linesTotal: 0, goldLines: 0, precisionSum: 0, staleLeak: 0 },
  };
}

/** 一个运行目录的检索层指标（跨 rep 合并；A 组才可能有 db，B 组自动只有 dbReps=0）。 */
export function retrievalMetricsForRun(runDir) {
  const m = emptyMetrics();
  for (const rep of listReps(runDir)) {
    const result = readResult(runDir, rep);
    if (!result) continue;
    if (result.arm !== 'A') continue; // B 组本就无记忆库，不算缺库
    const dbPath = path.join(runDir, rep, 'memory', 'memory.db');
    if (!fs.existsSync(dbPath)) {
      m.missingReps++;
    } else {
      let db = null;
      try {
        db = new DatabaseSync(dbPath);
        m.dbReps++;
        try {
          const meta = db.prepare("SELECT value FROM embedding_meta WHERE key = 'embedding_provider_info'").get();
          const dims = meta ? (JSON.parse(meta.value).dimensions ?? 0) : 0;
          if (dims > 0) m.vector = true;
        } catch { /* 元数据缺失视同纯 FTS */ }
        accumulateProbeRecall(db, result, m.byType);
      } catch (err) {
        m.missingReps++;
        console.error(`[retrieval] ${runDir}/${rep} memory.db 读取失败（跳过）：${err?.message ?? err}`);
      } finally {
        try { db?.close(); } catch { /* Windows 句柄释放失败只影响后续读，忽略 */ }
      }
    }
    // 注入精度：纯 result.json，无 db 依赖（recall.lines 是 0.8.5 起 runner 落盘的字段）
    for (const sc of result.scenarios ?? []) {
      if (sc.kind === 'workflow') continue;
      for (const p of sc.probes ?? []) {
        const lines = p.recall?.lines;
        if (!Array.isArray(lines) || lines.length === 0) continue;
        const gold = Array.isArray(p.gold) ? p.gold : [];
        const goldLines = lines.filter((l) => gold.some((g) => l.includes(g))).length;
        m.injection.probes++;
        m.injection.linesTotal += lines.length;
        m.injection.goldLines += goldLines;
        m.injection.precisionSum += goldLines / lines.length;
        if (Array.isArray(p.stale) && p.stale.some((s) => lines.some((l) => l.includes(s)))) {
          m.injection.staleLeak++;
        }
      }
    }
  }
  return m;
}

/** 跨运行目录合并（report.mjs 传入多个 run 目录时用）。 */
export function mergeRetrieval(into, from) {
  into.dbReps += from.dbReps;
  into.missingReps += from.missingReps;
  into.vector = into.vector || from.vector;
  for (const [type, b] of from.byType) {
    const t = into.byType.get(type) ?? emptyTypeBucket();
    t.hit += b.hit; t.total += b.total; t.coverage += b.coverage; t.mrr += b.mrr;
    into.byType.set(type, t);
  }
  for (const k of ['probes', 'linesTotal', 'goldLines', 'precisionSum', 'staleLeak']) {
    into.injection[k] += from.injection[k];
  }
  return into;
}

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');

/** 渲染「检索层指标」markdown 小节（typeLabel 把 type 映射成中文标签，缺省原样）。 */
export function renderRetrievalSection(m, typeLabel = (t) => t) {
  const lines = [];
  if (m.dbReps === 0 && m.injection.probes === 0) {
    lines.push('（无可用数据：需要 rep 的 memory/memory.db（A 组）或 runner 落盘的 recall.lines）');
    return lines;
  }
  if (m.dbReps > 0) {
    lines.push(`### recall@5（FTS 受控复现，${m.dbReps} 个 rep 库${m.missingReps > 0 ? `，${m.missingReps} 个缺库跳过` : ''}）`);
    if (m.vector) lines.push('> ⚠ 该跑启用了向量（运行时为 hybrid 检索），此处 FTS-only 为近似口径。');
    lines.push('');
    if (m.byType.size > 0) {
      lines.push('| 题型 | recall@5 | gold 覆盖 | MRR | 题数 |');
      lines.push('|---|---|---|---|---|');
      let hit = 0, total = 0, cov = 0, mrr = 0;
      for (const [type, b] of [...m.byType.entries()].sort((a, b) => b[1].total - a[1].total)) {
        lines.push(`| ${typeLabel(type)} | ${pct(b.hit, b.total)} | ${pct(b.coverage, b.total)} | ${b.total > 0 ? (b.mrr / b.total).toFixed(2) : '-'} | ${b.total} |`);
        hit += b.hit; total += b.total; cov += b.coverage; mrr += b.mrr;
      }
      lines.push(`| **合计** | **${pct(hit, total)}** | **${pct(cov, total)}** | **${total > 0 ? (mrr / total).toFixed(2) : '-'}** | ${total} |`);
      lines.push('');
    } else {
      lines.push('（无对话探针——纯工作流运行没有可回查的 gold 题型）');
      lines.push('');
    }
  }
  return lines;
}

/** 渲染「注入精度」行（拼在召回分析附近；数据缺失返回空数组）。 */
export function renderInjectionLines(m) {
  const inj = m.injection;
  if (inj.probes === 0) return [];
  const micro = pct(inj.goldLines, inj.linesTotal);
  const macro = pct(inj.precisionSum, inj.probes);
  return [
    `- 注入精度（行级，微观）：注入的记忆行里 **${micro}** 含当题 gold 要点（${inj.goldLines}/${inj.linesTotal} 行，${inj.probes} 题有注入）；`,
    `- 注入精度（按题平均）：**${macro}**；注入含已作废信息（update 类 stale 进注入）**${inj.staleLeak} 题**——非 0 即更新失败在注入层可见。`,
  ];
}

// ── CLI ──
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const floodArgIdx = process.argv.indexOf('--flood');
  const floodLevels = floodArgIdx !== -1
    ? String(process.argv[floodArgIdx + 1] ?? '').split(',').map((x) => Math.max(0, Number(x) || 0)).filter((x) => Number.isFinite(x))
    : null;
  const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== (floodArgIdx !== -1 ? process.argv[floodArgIdx + 1] : undefined));
  if (dirs.length === 0) {
    console.error('用法：node bench/harness/retrieval-metrics.mjs <runDir...> [--flood N1,N2,…]');
    process.exit(2);
  }
  if (floodLevels) {
    // 规模退化曲线模式：复制库灌水，不动原库
    const levels = [...new Set([0, ...floodLevels])].sort((a, b) => a - b);
    for (const dir of dirs) {
      const curve = floodCurveForRun(dir, levels);
      console.log(`\n## ${path.basename(dir)} 规模退化曲线（离线灌水）\n`);
      console.log(renderFloodCurve(curve).join('\n'));
    }
  } else {
    for (const dir of dirs) {
      const m = retrievalMetricsForRun(dir);
      console.log(`\n## ${path.basename(dir)} 检索层指标（离线确定性）\n`);
      const section = renderRetrievalSection(m);
      if (section.length > 0) console.log(section.join('\n'));
      const inj = renderInjectionLines(m);
      if (inj.length > 0) console.log(inj.join('\n'));
      if (m.dbReps === 0 && m.injection.probes === 0) console.log('（无可用数据）');
    }
  }
}
