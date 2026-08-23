// DSH-MemBench 汇总报告：把一组运行目录（run-A-*、run-B-*，各含 rep-N/result.json）
// 聚合成准确率总表（markdown + JSON 留档）。
//
// 用法：node bench/harness/report.mjs <runDirA> <runDirB> [--out <md 路径>]
//   runDir 可传多个同组目录（各含 rep-*）；先出现的作为表列。
// 输出：stdout 打 markdown；--out 同时写文件（同目录附 report.json）。

import fs from 'node:fs';
import path from 'node:path';

const TYPES = ['extraction', 'multihop', 'temporal', 'update', 'scene', 'abstention', 'accretive', 'update-chain', 'ordering', 'paraphrase'];
const TYPE_LABEL = {
  extraction: '抽取', multihop: '多跳', temporal: '时序', update: '更新', scene: '场景', abstention: '拒答',
  accretive: '增量积累', 'update-chain': '连锁更新', ordering: '事件排序', paraphrase: '同义改写',
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
  for (const t of ['update', 'update-chain']) updateHit += byType[t].hit;
  for (const t of ['abstention']) abstainFabricate = byType[t].total - byType[t].hit;
  const updateTotal = byType.update.total + byType['update-chain'].total;
  return { reps: items.length, hit, total, accuracy: total ? hit / total : 0, byType, updateHit, updateTotal, abstainFabricate, perScenario, wf, contamination };
}
const stats = Object.fromEntries(arms.map((a) => [a, armStats(a)]));

// 检索层指标（离线确定性）：recall@5/MRR 受控复现 + 注入精度。dist 检索工具缺失
// （未 build 的新 clone）时动态 import 失败 → 降级跳过，不影响主表。
let retrieval = null;
try {
  const mod = await import('./retrieval-metrics.mjs');
  for (const dir of dirs) {
    const m = mod.retrievalMetricsForRun(dir);
    retrieval = retrieval ? mod.mergeRetrieval(retrieval, m) : m;
  }
} catch (err) {
  console.error(`[report] 检索层指标不可用（跳过）：${err?.message ?? err}`);
}

// 效率次表（全场景合计：教学+变更+探针所有会话）
function armEfficiency(arm) {
  const items = reps[arm];
  let steps = 0, turns = 0, inTok = 0, outTok = 0, n = 0;
  let steadyIn = 0, steadyCache = 0;
  for (const { result } of items) {
    for (const sc of result.scenarios) {
      const all = [sc.teach?.metrics, ...(sc.reinforce ?? []).map((r) => r.metrics), sc.change?.metrics, sc.probeMetrics].filter(Boolean);
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
    + TYPES.map((t) => `${s.byType[t].hit}/${s.byType[t].total}`).join(' | ') + ` | ${s.updateHit}/${s.updateTotal} | ${s.abstainFabricate} |`);
}
lines.push('');
lines.push('> 拒答失败 = 拒答题未通过数（编造或未否认）；更新专项直接考核记忆去重更新（答出旧信息计 0，含单步更新与连锁更新两类题）。');
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

// ── 记忆开销（效率三角）：注入延迟 / 注入占比 / 蒸馏记账——「记忆的开销」与
//    工作流赛道已测的"记忆节省"（B 组重新探索 token）配成完整 ROI ──
{
  // 注入延迟：按 arm 聚合各场景的 latency（旧运行无此字段则整节跳过）
  const armLatency = {};
  for (const a of arms) {
    const agg = { turns: 0, injTurns: 0, firstRespInjSumMs: 0, firstRespPlainSumMs: 0 };
    let seen = false;
    for (const { result } of reps[a]) {
      for (const sc of result.scenarios) {
        if (!sc.latency) continue;
        seen = true;
        for (const k of Object.keys(agg)) agg[k] += sc.latency[k] ?? 0;
      }
    }
    if (seen) armLatency[a] = agg;
  }
  // 注入占比：探针轮的注入字符 / 该轮输入 token（旧运行无 turnInputTokens 则跳过）
  const shares = [];
  let injCharsSum = 0;
  let injProbeCount = 0;
  for (const { result } of reps.A ?? []) {
    for (const sc of result.scenarios) {
      for (const p of sc.probes ?? []) {
        const chars = p.recall?.chars ?? 0;
        if (chars > 0) {
          injCharsSum += chars;
          injProbeCount++;
        }
        if (chars > 0 && typeof p.turnInputTokens === 'number' && p.turnInputTokens > 0) {
          shares.push(chars / p.turnInputTokens);
        }
      }
    }
  }
  // 蒸馏记账（A 组，bench 控制服务提供；旧运行/未开 benchControl 的跑跳过）
  const usageList = (reps.A ?? []).map(({ result }) => result.distillUsage).filter(Boolean);
  const capturedTotal = (reps.A ?? []).reduce((s, { result }) => s + (result.capturedMessages?.total ?? 0), 0);
  if (Object.keys(armLatency).length > 0 || shares.length > 0 || usageList.length > 0) {
    lines.push('');
    lines.push('## 记忆开销（效率三角：注入延迟 / 注入占比 / 蒸馏记账）');
    lines.push('');
    const ms = (v) => (v == null ? '-' : `${Math.round(v)}ms`);
    lines.push('| 指标 | 值 |');
    lines.push('|---|---|');
    for (const [a, agg] of Object.entries(armLatency)) {
      const plainTurns = agg.turns - agg.injTurns;
      if (agg.injTurns > 0 && plainTurns > 0) {
        const meanInj = agg.firstRespInjSumMs / agg.injTurns;
        const meanPlain = agg.firstRespPlainSumMs / plainTurns;
        lines.push(`| ${a} 组 · 轮次响应（首 assistant 事件）：注入轮 vs 无注入轮 | ${ms(meanInj)} vs ${ms(meanPlain)}（${agg.injTurns}/${plainTurns} 轮） |`);
        lines.push(`| ${a} 组 · 注入开销（响应差分 = 注入轮均值 − 无注入轮均值） | **${ms(meanInj - meanPlain)}** |`);
      } else if (agg.injTurns > 0) {
        lines.push(`| ${a} 组 · 轮次响应（全部为注入轮，无基线可差分） | ${ms(agg.firstRespInjSumMs / agg.injTurns)}（${agg.injTurns} 轮） |`);
      } else if (plainTurns > 0) {
        lines.push(`| ${a} 组 · 轮次响应（无注入轮，B 组基线） | ${ms(agg.firstRespPlainSumMs / plainTurns)}（${plainTurns} 轮） |`);
      }
    }
    if (shares.length > 0) {
      const mean = shares.reduce((s, x) => s + x, 0) / shares.length;
      lines.push(`| A 组 · 探针注入占比均值 | **${pct(mean)}**（注入字符 / 该轮输入 token，中文 1 字≈1 token 折算，${shares.length} 题） |`);
      lines.push(`| A 组 · 探针注入字符均值 | ${Math.round(injCharsSum / Math.max(injProbeCount, 1))} 字（${injProbeCount} 题有注入） |`);
    }
    if (usageList.length > 0) {
      const merged = { calls: 0, failures: 0, inputChars: 0, outputTokens: 0, reasoningTokens: 0 };
      const layerRows = {};
      for (const u of usageList) {
        for (const [layer, b] of Object.entries(u.layers ?? {})) {
          const r = (layerRows[layer] ??= { calls: 0, failures: 0, inputChars: 0, outputTokens: 0, reasoningTokens: 0 });
          for (const k of Object.keys(r)) r[k] += b[k] ?? 0;
          merged.calls += b.calls ?? 0; merged.failures += b.failures ?? 0; merged.inputChars += b.inputChars ?? 0;
          merged.outputTokens += b.outputTokens ?? 0; merged.reasoningTokens += b.reasoningTokens ?? 0;
        }
      }
      const LAYER_LABEL = { 'l1-extract': 'L1 抽取', 'l1-dedup': 'L1 去重', l2: 'L2 场景', l3: 'L3 画像' };
      lines.push('');
      lines.push('### 蒸馏记账（按层累计，跨 rep 合并）');
      lines.push('');
      lines.push('| 层 | 调用 | 失败 | 输入（字符≈token） | 输出 token | 思考 token |');
      lines.push('|---|---|---|---|---|---|');
      for (const [layer, r] of Object.entries(layerRows)) {
        lines.push(`| ${LAYER_LABEL[layer] ?? layer} | ${r.calls} | ${r.failures} | ${r.inputChars} | ${r.outputTokens} | ${r.reasoningTokens} |`);
      }
      lines.push(`| **合计** | ${merged.calls} | ${merged.failures} | **${merged.inputChars}** | **${merged.outputTokens}** | ${merged.reasoningTokens} |`);
      if (capturedTotal > 0) {
        lines.push('');
        lines.push(`> 摊到每条捕获消息（共 ${capturedTotal} 条 user+assistant）：输入 ≈${Math.round(merged.inputChars / capturedTotal)}、输出 ${Math.round(merged.outputTokens / capturedTotal)} token/消息。输入侧流 usage 不含输入 token，按中文 1 字≈1 token 保守折算字符数。lifecycle 跑的 rebuild 专属用量见生命周期节的 rebuild 行。`);
      }
    }
  }
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
if (retrieval && (retrieval.dbReps > 0 || retrieval.injection.probes > 0)) {
  const mod = await import('./retrieval-metrics.mjs');
  lines.push('');
  lines.push('## 检索层指标（离线确定性）');
  lines.push('');
  lines.push(...mod.renderRetrievalSection(retrieval, (t) => TYPE_LABEL[t] ?? t));
  const inj = mod.renderInjectionLines(retrieval);
  if (inj.length) lines.push(...inj, '');
  if (retrieval.dbReps > 0) {
    lines.push('> recall@5 = 用探针问题原文在 rep 最终记忆库上受控复现 keyword 检索（候选池 ×3、阈值 0.3 + 小语料例外、slice 5 与运行时一致，分词与索引共用同一套）；记忆库取 rep 结束态（全场景累积），跨运行同口径。gold 覆盖 = top5 命中的要点数/要点总数。');
  }
}

// ── 规模位置分析（记忆库随场景推进单调膨胀；--noise 填充会加速膨胀）──
{
  const items = reps.A ?? [];
  const dialogScenarios = items[0]?.result.scenarios.filter((s) => s.kind !== 'workflow') ?? [];
  if (dialogScenarios.length >= 6) {
    const bucketCount = 3;
    const buckets = Array.from({ length: bucketCount }, () => ({ hit: 0, total: 0, cont: 0, from: 0, to: 0 }));
    const noiseLevels = [];
    for (const { result } of items) {
      const scs = result.scenarios.filter((s) => s.kind !== 'workflow');
      if (result.noise?.level) noiseLevels.push(result.noise.level);
      const per = Math.ceil(scs.length / bucketCount);
      scs.forEach((sc, i) => {
        const b = Math.min(bucketCount - 1, Math.floor(i / per));
        for (const p of sc.probes ?? []) {
          buckets[b].total++;
          if (p.score === 1) buckets[b].hit++;
        }
        buckets[b].cont += (sc.contamination ?? []).length;
      });
    }
    const labels = ['前段（库容最小）', '中段', '后段（库容最大）'];
    lines.push('');
    lines.push('## 规模位置分析（同 rep 内库容单调增长下的准确率/污染）');
    lines.push('');
    lines.push('| 位置 | 题数 | 准确率 | 跨场景污染次数 |');
    lines.push('|---|---|---|---|');
    buckets.forEach((b, i) => {
      lines.push(`| ${labels[i] ?? `段 ${i + 1}`} | ${b.total} | ${b.total ? pct(b.hit / b.total) : '-'} | ${b.cont} |`);
    });
    lines.push('');
    lines.push(`> 记忆库在一个 rep 内跨场景只增不减——后段场景的检索干扰天然更大${noiseLevels.length ? `；本次为噪声填充运行（每场景后插 ${[...new Set(noiseLevels)].join('/')} 个填充会话，` + '膨胀被刻意加速）' : '；用 --noise k 可加速膨胀测退化'}。检索层的库容曲线（离线灌水）另见 retrieval-metrics.mjs --flood。`);
  }
}

// ── 生命周期赛道（--track lifecycle 的专属结果块）──
if (reps.A?.some(({ result }) => result.lifecycle)) {
  const lc = reps.A.filter(({ result }) => result.lifecycle).map(({ result }) => result.lifecycle);
  lines.push('');
  lines.push('## 生命周期赛道（分族门控 / off 捕获 / rebuild 保真 / 遗忘请求）');
  lines.push('');
  // 门控泄漏矩阵：阳性=同族题应答对（召回命中对照），阴性=异族题应答不出（泄漏=答出）
  const gating = { chat: { posHit: 0, posTotal: 0, leak: 0, negTotal: 0 }, work: { posHit: 0, posTotal: 0, leak: 0, negTotal: 0 } };
  for (const l of lc) {
    for (const [mode, armProbes] of [['chat', l.gating?.chatArm], ['work', l.gating?.workArm]]) {
      for (const p of armProbes ?? []) {
        if (p.polarity === 'positive') {
          gating[mode].posTotal++;
          if (p.score === 1) gating[mode].posHit++;
        } else {
          gating[mode].negTotal++;
          if (p.score === 0) gating[mode].leak++; // abstain-llm 判负 = 给出了异族具体内容 = 泄漏
        }
      }
    }
  }
  lines.push('### 分族门控（写入与召回同档不变量）');
  lines.push('');
  lines.push('| 档位会话 | 同族题（应答对） | 异族题（泄漏/总） |');
  lines.push('|---|---|---|');
  for (const [mode, g] of Object.entries(gating)) {
    lines.push(`| ${mode} 档 | ${g.posHit}/${g.posTotal} | ${g.negTotal ? `**${g.leak}/${g.negTotal}**` : '-'} |`);
  }
  lines.push('');
  lines.push('> 异族泄漏 = 在 chat（或 work）档会话里被问出 work（或 chat）族的事实——非 0 即"写入与召回同档"不变量被打破。同族题答对是阳性对照（档位没有把召回整体关死）。');
  // off 捕获
  const offBeh = { hit: 0, total: 0 };
  let offDataLeak = false;
  let offAfterLeak = false;
  for (const l of lc) {
    for (const p of l.offCapture?.behavior ?? []) {
      offBeh.total++;
      if (p.score === 1) offBeh.hit++;
    }
    offDataLeak = offDataLeak || l.offCapture?.dataLeak === true;
    offAfterLeak = offAfterLeak || l.offCapture?.dataLeakAfterRebuild === true;
  }
  lines.push(`- **off 档捕获**：off 会话教的 nonce 事实，auto 探针拒答 **${offBeh.hit}/${offBeh.total}**；数据断言：records/conversations JSONL 中 nonce ${offDataLeak ? '⚠ **出现（off 档写入泄漏）**' : '未出现'}${offAfterLeak ? '；⚠ rebuild 后复验仍泄漏' : '（rebuild 后复验亦然）'}。`);
  // rebuild 保真（轮 1/轮 2 对照）
  for (const l of lc) {
    if (l.rebuild?.error) {
      lines.push(`- **rebuild 保真**：⚠ 失败——${l.rebuild.error}`);
      continue;
    }
    const r = l.rebuild ?? {};
    let rebuildUsage = '';
    const layers = Object.values(r.distillUsage?.layers ?? {});
    if (layers.length > 0) {
      const inChars = layers.reduce((s, b) => s + (b.inputChars ?? 0), 0);
      const outTok = layers.reduce((s, b) => s + (b.outputTokens ?? 0), 0);
      const calls = layers.reduce((s, b) => s + (b.calls ?? 0), 0);
      rebuildUsage = `；rebuild 专属蒸馏 ${calls} 次调用、输入 ${inChars} 字符、输出 ${outTok} token`;
    }
    lines.push(`- **rebuild 保真**：终态 ${r.phase}${r.timedOut ? '（轮询超时）' : ''}，耗时 ${((r.durationMs ?? 0) / 1000).toFixed(0)}s，${r.sessionCount ?? '?'} 会话重建出 ${r.recordsBuilt ?? '?'} 条 L1${rebuildUsage}。`);
  }
  const rounds = lc.map((l) => l.rounds).filter(Boolean);
  if (rounds.length > 0) {
    lines.push('');
    lines.push('| 轮次 | 题数 | 准确率 | ' + TYPES.map((t) => TYPE_LABEL[t]).join(' | ') + ' |');
    lines.push('|---|---|---|' + TYPES.map(() => '---').join('|') + '|');
    let acc1 = null;
    let acc2 = null;
    for (const pair of rounds) {
      for (const rd of pair) {
        const acc = rd.total ? rd.hit / rd.total : 0;
        if (rd.label === 'probe-1') acc1 = acc;
        if (rd.label === 'probe-2') acc2 = acc;
        lines.push(`| ${rd.label} | ${rd.total} | **${pct(acc)}** | ` + TYPES.map((t) => (rd.byType?.[t] ? `${rd.byType[t].hit}/${rd.byType[t].total}` : '-')).join(' | ') + ' |');
      }
    }
    if (acc1 != null && acc2 != null) {
      const d = (acc2 - acc1) * 100;
      lines.push('');
      lines.push(`> 重建后准确率差 ${d >= 0 ? '+' : ''}${d.toFixed(1)}pp（probe-2 − probe-1；显著回退即 rebuild 链路丢信息）。`);
    }
  }
  // 遗忘请求
  for (const l of lc) {
    const f = l.forget;
    if (!f) continue;
    if (f.error) { lines.push(`- **遗忘请求**：⚠ ${f.error}`); continue; }
    const ok = f.probe?.score === 1;
    lines.push(`- **遗忘请求**：${f.scenarioId}「${f.topic}」→ ${ok ? '✅ 探针拒答（未复述旧值）' : `⚠ 判负——${f.probe?.reason ?? '?'}（答案：${String(f.probe?.answer ?? '').slice(0, 80)}）`}。注意 rebuild 会从 L0 重导、旧事实可能复活（现状语义，L0 只增不改）。`);
  }
  lines.push('');
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
  fs.writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify({ generatedAt: new Date().toISOString(), envLines, stats, retrieval: retrieval ? { dbReps: retrieval.dbReps, missingReps: retrieval.missingReps, vector: retrieval.vector, byType: Object.fromEntries(retrieval.byType), injection: retrieval.injection } : null }, null, 2) + '\n', 'utf8');
  console.error(`\n已写出：${out}（附 report.json）`);
}
