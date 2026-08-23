// DSH-MemBench 回归对比：改动前基线 vs 改动后新跑，产出对比表与漂移告警。
//
// 用法：node bench/harness/compare.mjs <旧A运行目录> <新A运行目录> [<旧B目录> <新B目录>] [--out <md>]
//   目录结构同 report.mjs（含 rep-N/result.json）。
// 规则：
//   - 环境头（模型/判卷/场景清单）不一致 → 顶部警告，对比仅供参考；
//   - B 组对照漂移 > 10 个百分点 → 警告"疑似环境漂移而非插件改动"；
//   - A 组提升未超噪声带（约 ±5pp/单次）不判"正向"——正式判定需每格 ≥3 次重复。

import fs from 'node:fs';
import path from 'node:path';

const TYPES = ['extraction', 'multihop', 'temporal', 'update', 'scene', 'abstention', 'accretive', 'update-chain', 'ordering', 'paraphrase'];
const TYPE_LABEL = {
  extraction: '抽取', multihop: '多跳', temporal: '时序', update: '更新', scene: '场景', abstention: '拒答',
  accretive: '增量积累', 'update-chain': '连锁更新', ordering: '事件排序', paraphrase: '同义改写',
};
const NOISE_BAND = 0.05;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (dirs.length < 2) {
  console.error('用法：node bench/harness/compare.mjs <旧A目录> <新A目录> [<旧B目录> <新B目录>] [--out compare.md]');
  process.exit(2);
}

function loadRuns(dir) {
  const reps = fs.readdirSync(dir).filter((d) => /^rep-\d+$/.test(d)).sort()
    .map((rep) => JSON.parse(fs.readFileSync(path.join(dir, rep, 'result.json'), 'utf8')));
  if (reps.length === 0) throw new Error(`目录里没有 rep-*：${dir}`);
  const env = reps[0].environment;
  const byType = Object.fromEntries(TYPES.map((t) => [t, { hit: 0, total: 0 }]));
  let hit = 0, total = 0;
  for (const r of reps) for (const sc of r.scenarios) for (const p of sc.probes) {
    total++; byType[p.type].total++;
    if (p.score === 1) { hit++; byType[p.type].hit++; }
  }
  return { dir, reps: reps.length, env, hit, total, accuracy: total ? hit / total : 0, byType };
}

const oldA = loadRuns(dirs[0]);
const newA = loadRuns(dirs[1]);
let oldB = null, newB = null;
if (dirs.length >= 4) { oldB = loadRuns(dirs[2]); newB = loadRuns(dirs[3]); }

// 检索层指标（best-effort）：A 组新旧运行目录各有 memory/memory.db 时对比
// recall@5 / 注入精度——检索层改动（分词/阈值/融合）在这层先翻牌，比端到端钝器敏感。
let retro = null;
try {
  const mod = await import('./retrieval-metrics.mjs');
  retro = { old: mod.retrievalMetricsForRun(dirs[0]), new: mod.retrievalMetricsForRun(dirs[1]) };
} catch (err) {
  console.error(`[compare] 检索层指标不可用（跳过）：${err?.message ?? err}`);
}

function envKey(e) { return `${e.provider}/${e.model}|${e.judgeProvider}/${e.judgeModel}|${(e.scenarioFiles ?? []).join(',')}`; }
const envConsistent = envKey(oldA.env) === envKey(newA.env)
  && (!oldB || envKey(oldB.env) === envKey(newB.env))
  && oldA.env.scenarioFiles?.length === newA.env.scenarioFiles?.length;
const versionChanged = oldA.env.pluginVersion !== newA.env.pluginVersion;

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const pp = (d) => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`;
const lines = [];
lines.push('# DSH-MemBench 回归对比');
lines.push('');
lines.push(`基线：${oldA.dir}（插件 ${oldA.env.pluginVersion || '?'}，${oldA.reps} 次）`);
lines.push(`新跑：${newA.dir}（插件 ${newA.env.pluginVersion || '?'}，${newA.reps} 次）`);
if (versionChanged) lines.push(`插件版本变化：${oldA.env.pluginVersion || '?'} → ${newA.env.pluginVersion || '?'}`);
lines.push('');
if (!envConsistent) lines.push('> ⚠ **环境不一致**（模型/判卷/场景清单有差异），以下对比仅供参考，不构成回归结论。\n');
if (Math.max(oldA.reps, newA.reps) < 3) lines.push(`> ⚠ 单次运行噪声大（基线 ${oldA.reps} 次 / 新跑 ${newA.reps} 次），建议每格 ≥3 次重复后再判定方向。\n`);

lines.push('## A 组（记忆开）对比');
lines.push('');
lines.push('| 指标 | 基线 | 新跑 | 变化 |');
lines.push('|---|---|---|---|');
lines.push(`| 总准确率 | ${pct(oldA.accuracy)} | ${pct(newA.accuracy)} | **${pp(newA.accuracy - oldA.accuracy)}** |`);
for (const t of TYPES) {
  const o = oldA.byType[t].total ? oldA.byType[t].hit / oldA.byType[t].total : 0;
  const n = newA.byType[t].total ? newA.byType[t].hit / newA.byType[t].total : 0;
  lines.push(`| ${TYPE_LABEL[t]} | ${oldA.byType[t].hit}/${oldA.byType[t].total} | ${newA.byType[t].hit}/${newA.byType[t].total} | ${pp(n - o)} |`);
}
lines.push('');
const delta = newA.accuracy - oldA.accuracy;
let verdict;
if (!envConsistent) verdict = '环境不一致，无法判定。';
else if (delta > NOISE_BAND && TYPES.every((t) => (newA.byType[t].hit / Math.max(newA.byType[t].total, 1)) >= (oldA.byType[t].hit / Math.max(oldA.byType[t].total, 1)) - 0.01)) verdict = `**正向**：总准确率提升 ${pp(delta)} 且无题型单项回归。`;
else if (delta < -NOISE_BAND) verdict = `**负向**：总准确率下降 ${pp(delta)}，重点看分题型定位回归层。`;
else verdict = `**无显著变化**（差值 ${pp(delta)} 在噪声带 ±${NOISE_BAND * 100}pp 内）。`;
lines.push(`判定：${verdict}`);

if (retro && (retro.old.dbReps > 0 || retro.new.dbReps > 0)) {
  const overall = (m) => {
    let hit = 0, total = 0, cov = 0, mrr = 0;
    for (const b of m.byType.values()) { hit += b.hit; total += b.total; cov += b.coverage; mrr += b.mrr; }
    return { recall: total ? hit / total : null, coverage: total ? cov / total : null, mrr: total ? mrr / total : null };
  };
  const o = overall(retro.old), n = overall(retro.new);
  const injPct = (m) => (m.injection.linesTotal > 0 ? m.injection.goldLines / m.injection.linesTotal : null);
  const fmt = (v) => (v == null ? '-' : pct(v));
  const fmtD = (a, b) => (a == null || b == null ? '-' : pp(b - a));
  lines.push('');
  lines.push('## 检索层指标对比（A 组，离线确定性；db 缺失的一侧打 `-`）');
  lines.push('');
  lines.push('| 指标 | 基线 | 新跑 | 变化 |');
  lines.push('|---|---|---|---|');
  lines.push(`| recall@5 | ${fmt(o.recall)} | ${fmt(n.recall)} | ${fmtD(o.recall, n.recall)} |`);
  lines.push(`| gold 覆盖 | ${fmt(o.coverage)} | ${fmt(n.coverage)} | ${fmtD(o.coverage, n.coverage)} |`);
  lines.push(`| MRR | ${o.mrr == null ? '-' : o.mrr.toFixed(2)} | ${n.mrr == null ? '-' : n.mrr.toFixed(2)} | ${o.mrr == null || n.mrr == null ? '-' : (n.mrr - o.mrr >= 0 ? '+' : '') + (n.mrr - o.mrr).toFixed(2)} |`);
  lines.push(`| 注入精度（行级） | ${fmt(injPct(retro.old))} | ${fmt(injPct(retro.new))} | ${fmtD(injPct(retro.old), injPct(retro.new))} |`);
  lines.push(`| 注入含已作废信息 | ${retro.old.injection.staleLeak} 题 | ${retro.new.injection.staleLeak} 题 | - |`);
  lines.push('');
  lines.push('> 检索层指标不依赖判卷与被测模型采样，是检索/注入管线改动的直接信号：分题型 recall@5 详见两侧 report。');
}

if (oldB && newB) {
  lines.push('');
  lines.push('## B 组对照（插件改动理论上不影响它，漂移=环境漂移信号）');
  lines.push('');
  lines.push('| 指标 | 基线 | 新跑 | 变化 |');
  lines.push('|---|---|---|---|');
  lines.push(`| 总准确率 | ${pct(oldB.accuracy)} | ${pct(newB.accuracy)} | ${pp(newB.accuracy - oldB.accuracy)} |`);
  const bDelta = Math.abs(newB.accuracy - oldB.accuracy);
  if (bDelta > 0.10) lines.push(`\n> ⚠ **B 组漂移 ${pp(newB.accuracy - oldB.accuracy)} 超过 10pp**：疑似模型/环境变化，A 组差异不应归因于插件改动。`);
}

const md = lines.join('\n');
console.log(md);
const out = arg('out');
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, md + '\n', 'utf8');
  console.error(`\n已写出：${out}`);
}
