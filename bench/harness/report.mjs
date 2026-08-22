// DSH-MemBench 汇总报告：把一组运行目录（run-A-*、run-B-*，各含 rep-N/result.json）
// 聚合成准确率总表（markdown + JSON 留档）。
//
// 用法：node bench/harness/report.mjs <runDirA> <runDirB> [--out <md 路径>]
//   runDir 可传多个同组目录（各含 rep-*）；先出现的作为表列。
// 输出：stdout 打 markdown；--out 同时写文件（同目录附 report.json）。

import fs from 'node:fs';
import path from 'node:path';

const TYPES = ['extraction', 'multihop', 'temporal', 'update', 'scene', 'abstention'];
const TYPE_LABEL = {
  extraction: '抽取', multihop: '多跳', temporal: '时序', update: '更新', scene: '场景', abstention: '拒答',
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
// --latest [dialog|workflow]：自动取 bench/results 下最新的 A/B 两组运行目录
const argv = process.argv.slice(2);
const flagValues = new Set();
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out' || argv[i] === '--latest') {
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) flagValues.add(argv[i + 1]);
    i++;
  }
}
const latestIdx = argv.indexOf('--latest');
const dirArgs = argv.filter((a) => !a.startsWith('--') && !flagValues.has(a));
let dirs = dirArgs;
if (latestIdx !== -1) {
  const trackArg = dirArgs[0] === 'workflow' ? 'workflow' : 'dialog';
  const prefix = trackArg === 'workflow' ? 'run-wf-' : 'run-';
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../results');
  const pick = (arm) => {
    const cands = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => d.startsWith(`${prefix}${arm}-`)).sort() : [];
    return cands.length ? path.join(root, cands.at(-1)) : null;
  };
  dirs = [pick('A'), pick('B')].filter(Boolean);
  if (dirs.length === 0) {
    console.error(`bench/results 下没有 ${prefix}A-*/${prefix}B-* 运行目录`);
    process.exit(2);
  }
  console.error(`[report] --latest（${trackArg} 赛道）：${dirs.map((d) => path.basename(d)).join(' + ')}`);
}
if (dirs.length < 1 || dirs.some((d) => typeof d !== 'string')) {
  console.error('用法：node bench/harness/report.mjs <runDir...> | --latest [dialog|workflow] [--out report.md]');
  process.exit(2);
}

// 读取所有 rep 的 result.json，按 arm 分组
const reps = { A: [], B: [] };
for (const dir of dirs) {
  const entries = fs.readdirSync(dir).filter((d) => /^rep-\d+$/.test(d)).sort();
  if (entries.length === 0) {
    console.error(`目录里没有 rep-*：${dir}`);
    process.exit(2);
  }
  for (const rep of entries) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, rep, 'result.json'), 'utf8'));
    if (!reps[r.arm]) reps[r.arm] = [];
    reps[r.arm].push({ run: dir, rep, result: r });
  }
}
const arms = Object.keys(reps).filter((a) => reps[a].length > 0).sort();

// 环境一致性检查
const envLines = [];
let envMismatch = false;
const refEnv = reps[arms[0]]?.[0]?.result.environment;
for (const a of arms) {
  for (const { run, rep, result } of reps[a]) {
    const e = result.environment;
    const same = e.provider === refEnv?.provider && e.model === refEnv?.model
      && e.judgeProvider === refEnv?.judgeProvider && e.judgeModel === refEnv?.judgeModel
      && JSON.stringify(e.scenarioFiles) === JSON.stringify(refEnv?.scenarioFiles);
    if (!same) envMismatch = true;
    envLines.push(`${a} 组 ${run}/${rep}：${e.provider}/${e.model}（判卷 ${e.judgeProvider}/${e.judgeModel}，插件 ${e.pluginVersion || '?'}，${e.scenarioFiles.length} 场景）${same ? '' : '  ⚠ 与首个运行不一致'}`);
  }
}

// 计分
function armStats(arm) {
  const items = reps[arm];
  const byType = Object.fromEntries(TYPES.map((t) => [t, { hit: 0, total: 0 }]));
  let hit = 0, total = 0, updateHit = 0, abstainFabricate = 0;
  const perScenario = [];
  const wf = { scenarios: 0, checksPassed: 0, checksTotal: 0, probePassed: 0, probeTotal: 0, asks: 0, snoopSuspect: false, snoopViolation: false };
  const contamination = [];
  for (const { result } of items) {
    for (const sc of result.scenarios) {
      for (const c of sc.contamination ?? []) contamination.push(`${sc.id} ← ${c.from}(${c.marker})`);
      if (sc.kind === 'workflow') {
        wf.scenarios++;
        wf.checksPassed += sc.workflow?.checksPassed ?? 0;
        wf.checksTotal += sc.workflow?.checksTotal ?? 0;
        // 探针单列：教学/变更段两臂都有现场上下文，探针段才是纯记忆窗口（口径更锐）
        const probeChecks = (sc.workflow?.checks ?? []).filter((c) => c.phase === 'probe');
        wf.probePassed += probeChecks.filter((c) => c.ok).length;
        wf.probeTotal += probeChecks.length;
        wf.asks += sc.workflow?.probe?.asks ?? 0;
        wf.snoopSuspect = wf.snoopSuspect || sc.workflow?.probe?.toolAudit?.snoopSuspect === true
          || sc.workflow?.teachToolAudit?.snoopSuspect === true
          || sc.workflow?.change?.toolAudit?.snoopSuspect === true;
        wf.snoopViolation = wf.snoopViolation || sc.workflow?.snoopViolation === true;
        continue;
      }
      let scHit = 0;
      for (const p of sc.probes) {
        total++;
        byType[p.type].total++;
        if (p.score === 1) { hit++; byType[p.type].hit++; scHit++; }
      }
      perScenario.push({ id: sc.id, hit: scHit, total: sc.probes.length, distillTimeout: sc.distill?.timedOut === true });
    }
  }
  for (const t of ['update']) updateHit = byType[t].hit;
  for (const t of ['abstention']) abstainFabricate = byType[t].total - byType[t].hit;
  return { reps: items.length, hit, total, accuracy: total ? hit / total : 0, byType, updateHit, abstainFabricate, perScenario, wf, contamination };
}
const stats = Object.fromEntries(arms.map((a) => [a, armStats(a)]));

// 效率次表（全场景合计：教学+变更+探针所有会话）
function armEfficiency(arm) {
  const items = reps[arm];
  let steps = 0, turns = 0, inTok = 0, outTok = 0, n = 0;
  let steadyIn = 0, steadyCache = 0;
  for (const { result } of items) {
    for (const sc of result.scenarios) {
      const all = [sc.teach?.metrics, sc.change?.metrics, sc.probeMetrics].filter(Boolean);
      for (const m of all) {
        steps += m.steps; turns += m.turns;
        inTok += (m.inputTokens ?? 0) + (m.cacheReadTokens ?? 0);
        outTok += m.outputTokens ?? 0;
        // 稳态缓存：剔除首请求（新会话首问的前缀天然未命中）后按会话聚合
        if (m.steadyCacheRate != null) {
          const total = (m.inputTokens ?? 0) + (m.cacheReadTokens ?? 0) - (m.firstRequestMiss ?? 0);
          steadyIn += total * (1 - m.steadyCacheRate);
          steadyCache += total * m.steadyCacheRate;
        }
      }
      n++;
    }
  }
  return n ? {
    steps: steps / n, turns: turns / n, inputTokens: inTok / n, outputTokens: outTok / n, scenarios: n,
    steadyCacheRate: steadyIn + steadyCache > 0 ? steadyCache / (steadyIn + steadyCache) : null,
  } : null;
}

// ---- markdown ----
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const lines = [];
lines.push('# DSH-MemBench 结果报告');
lines.push('');
lines.push(`生成时间：${new Date().toISOString()}`);
lines.push('');
lines.push('## 环境');
lines.push('```');
lines.push(...envLines);
lines.push('```');
if (envMismatch) lines.push('\n> ⚠ 存在环境不一致的运行，跨行对比请谨慎。');
lines.push('');
lines.push('## 总表（准确率 = 探题答对 / 总题数，多次运行合并）');
lines.push('');
lines.push('| 组 | 次数 | 题数 | 总准确率 | ' + TYPES.map((t) => TYPE_LABEL[t]).join(' | ') + ' | 更新专项 | 拒答失败 |');
lines.push('|---|---|---|---|' + TYPES.map(() => '---').join('|') + '|---|---|');
for (const a of arms) {
  const s = stats[a];
  lines.push(`| ${a} 组（记忆${a === 'A' ? '开' : '关'}） | ${s.reps} | ${s.total} | **${pct(s.accuracy)}** | `
    + TYPES.map((t) => `${s.byType[t].hit}/${s.byType[t].total}`).join(' | ') + ` | ${s.updateHit}/${s.byType.update.total} | ${s.abstainFabricate} |`);
}
lines.push('');
lines.push('> 拒答失败 = 拒答题未通过数（编造或未否认）；更新专项直接考核记忆去重更新（答出旧信息计 0）。');
lines.push('>');
lines.push('> **记忆生命周期**：一个 rep 的记忆库从第一次蒸馏起全程保留、跨场景累积（rep 结束才废弃）——越靠后的场景记忆越多，检索干扰越大。');
const contA = stats.A?.contamination ?? [], contB = stats.B?.contamination ?? [];
if (contA.length || contB.length) {
  lines.push('>');
  lines.push(`> ⚠ **跨场景污染**（探针召回注入里出现其他场景的 marker）：A 组 ${contA.length} 次${contA.length ? '——' + contA.slice(0, 5).join('、') + (contA.length > 5 ? ' 等' : '') : ''}${contB.length ? `；B 组 ${contB.length} 次` : ''}。`);
} else {
  lines.push('>');
  lines.push('> 跨场景污染：A 组 0 次（探针召回未引入其他场景的记忆）。');
}
// 召回分析（A 组）：被动注入命中率 + 主动记忆工具兜底——双通道分离
function armRecall(arm) {
  const items = reps[arm];
  let withGold = 0, injHit = 0, injTotal = 0, toolQ = 0, toolHitRescue = 0, q = 0;
  for (const { result } of items) {
    for (const sc of result.scenarios) {
      for (const p of sc.probes ?? []) {
        q++;
        if (p.recall?.injected) injTotal++;
        if (p.recall?.hit === true) injHit++;
        if (p.recall?.hit !== null && p.recall?.hit !== undefined) withGold++;
        if (p.usedMemoryTool) {
          toolQ++;
          if (p.score === 1 && p.recall?.hit !== true) toolHitRescue++;
        }
      }
    }
  }
  return withGold ? { withGold, injHit, injTotal, toolQ, toolHitRescue, q } : null;
}

const effA = stats.A && armEfficiency('A'), effB = stats.B && armEfficiency('B');
if (effA || effB) {
  lines.push('');
  lines.push('## 效率次表（每场景均值，教学+变更+探针全会话合计；输入含缓存命中）');
  lines.push('');
  lines.push('| 组 | 场景数 | 轮次/场景 | 步骤/场景 | 输入 token/场景 | 输出 token/场景 | 稳态缓存率 |');
  lines.push('|---|---|---|---|---|---|---|');
  if (effA) lines.push(`| A 组 | ${effA.scenarios} | ${effA.turns.toFixed(1)} | ${effA.steps.toFixed(1)} | ${effA.inputTokens.toFixed(0)} | ${effA.outputTokens.toFixed(0)} | ${effA.steadyCacheRate != null ? pct(effA.steadyCacheRate) : '—'} |`);
  if (effB) lines.push(`| B 组 | ${effB.scenarios} | ${effB.turns.toFixed(1)} | ${effB.steps.toFixed(1)} | ${effB.inputTokens.toFixed(0)} | ${effB.outputTokens.toFixed(0)} | ${effB.steadyCacheRate != null ? pct(effB.steadyCacheRate) : '—'} |`);
  lines.push('');
  lines.push('> 输入/输出 token 为供应商上报值（usage 事件）；输入 = 非缓存 inputTokens + 缓存命中 cacheReadTokens。稳态缓存率剔除每会话首请求（新会话首问的前缀天然未命中，不代表引擎健康度；跨会话前缀缓存共享还受跑序影响）。');
}
const recA = stats.A && armRecall('A'), recB = stats.B && armRecall('B');
if (recA || recB) {
  lines.push('');
  lines.push('## 召回分析（双通道分离）');
  lines.push('');
  lines.push('| 组 | 探针注入次数 | 注入召回率（gold 要点在该题注入中） | 主动调记忆工具的题数 | 其中工具兜底答对 |');
  lines.push('|---|---|---|---|---|');
  for (const [a, r] of [['A', recA], ['B', recB]]) {
    if (r) lines.push(`| ${a} 组 | ${r.injTotal}/${r.q} | **${(r.injHit / Math.max(r.withGold, 1) * 100).toFixed(1)}%**（${r.injHit}/${r.withGold}） | ${r.toolQ} | ${r.toolHitRescue} |`);
  }
  lines.push('');
  lines.push('> 被动通道 = 消息侧召回注入（`<relevant-memories>`）；主动通道 = 模型按需调用 memory_search / conversation_search。注入召回率量的是检索+注入管线本身；端到端准确率 = 两通道 + 模型利用的合成结果。工具兜底答对 = 注入未命中但靠记忆工具查回并答对的题数。');
}
const timeouts = [];
for (const a of arms) for (const ps of stats[a].perScenario) if (ps.distillTimeout) timeouts.push(`${a}:${ps.id}`);
if (timeouts.length) lines.push(`\n> ⚠ 蒸馏等待超时的场景：${timeouts.join('、')}（该场景 A 组结果可能偏低）`);
lines.push('');
const wfArms = arms.filter((a) => stats[a].wf.scenarios > 0);
if (wfArms.length) {
  lines.push('## 工作流赛道（复杂任务延续：完成度校验 + 反问次数）');
  lines.push('');
  lines.push('| 组 | 场景数 | 完成度校验 | 探针段完成度 | 探针反问次数 |');
  lines.push('|---|---|---|---|---|');
  for (const a of wfArms) {
    const w = stats[a].wf;
    const probe = w.probeTotal > 0 ? `${w.probePassed}/${w.probeTotal}` : '—';
    lines.push(`| ${a} 组 | ${w.scenarios} | ${w.checksPassed}/${w.checksTotal} | ${probe} | ${w.asks} |`);
  }
  lines.push('');
  const violated = wfArms.filter((a) => stats[a].wf.snoopViolation);
  if (violated.length) lines.push(`> ⛔ **越界读取记忆库（严格档命中，涉事场景已判负）**：${violated.join('、')} 组（详见 result.json 各场景 workflow.snoopViolation 与检查 detail）。\n`);
  const snoop = wfArms.filter((a) => stats[a].wf.snoopSuspect && !stats[a].wf.snoopViolation);
  if (snoop.length) lines.push(`> ⚠ 疑似越出沙箱（宽松启发式，未达判负线，仅提示人工复核）：${snoop.join('、')} 组。\n`);
  lines.push('> 完成度 = 产物文件与关键内容校验（程序化）；**探针段**只计探针会话检查（教学/变更段两臂都有现场上下文，探针段才是纯记忆对照窗口）；反问 = 探针会话中 agent 向用户求助次数（补发固定重述，token 如实计入）。');
  lines.push('');
}
const md = lines.join('\n');

console.log(md);
const out = arg('out');
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, md + '\n', 'utf8');
  fs.writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify({ generatedAt: new Date().toISOString(), envLines, stats }, null, 2) + '\n', 'utf8');
  console.error(`\n已写出：${out}（附 report.json）`);
}
