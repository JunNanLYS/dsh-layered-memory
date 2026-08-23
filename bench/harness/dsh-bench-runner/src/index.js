// dsh-bench-runner — DSH-MemBench 自动化基准驱动器。
//
// 装入专用 bench profile（dsh-base + dsh-layered-memory + 本包），apply 即开始执行：
//   逐场景 → 教学会话 → 变更会话 →（A 组）轮询蒸馏落袋 → 探针会话逐题提问 →
//   判分（contains-all 程序判 / llm·abstain 判卷模型）→ 逐场景落盘 result.json。
// 运行全程向 DSH_BENCH_OUT/progress.json 增量写实时进度（消息粒度 + 5s 心跳），
// 供 bench/harness/panel.mjs 面板轮询——写在结果目录、不在沙箱内，被测 Agent 不可见。
// 全部旋钮来自环境变量，不依赖 Web/HTTP/client 服务：
//   DSH_BENCH_SCENARIOS     场景库目录（*.json）       必填
//   DSH_BENCH_ARM           A（记忆开）| B（记忆关）     必填
//   DSH_BENCH_OUT           结果输出目录                必填
//   DSH_BENCH_DATA_DIR      本次运行的记忆数据目录       A 组必填（与 patch 的 dataDir 一致）
//   DSH_BENCH_WORKSPACE     会话与沙箱的工作根目录       必填（run.mjs 分配）
//   DSH_BENCH_PLUGIN_VERSION 被测插件版本（结果头记录用） 可选
//   DSH_BENCH_GIT_SHA       被测仓库 git SHA（结果头代码指纹） 可选（run.mjs 注入）
//   DSH_BENCH_JUDGE_PROVIDER / _MODEL   判卷模型（缺省用当前默认模型）
//   DSH_BENCH_DISTILL_TIMEOUT_MS        蒸馏等待超时（缺省 120000）

import { randomUUID } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import z from '@deepseek-ai/schemastery';
import { SAFE_NAME, safeJoin, evalFileChecks } from './checks.js';

export const name = 'dsh-bench-runner';
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'llm'];
export const Config = z.object({});

const POLL_MS = 5000;

export function apply(ctx) {
  run(ctx).then(
    (code) => exit(ctx, code),
    (err) => {
      progressFail(err);
      console.error('[bench-runner] fatal:', err?.stack ?? err);
      exit(ctx, 1);
    },
  );
}

function exit(ctx, code) {
  const appExit = ctx.get('appExit');
  if (typeof appExit === 'function') {
    appExit(code);
    return;
  }
  process.exit(code);
}

async function run(ctx) {
  await ctx.get('loader')?.await?.();
  const scenariosDir = path.resolve(requireEnv('DSH_BENCH_SCENARIOS'));
  const arm = requireEnv('DSH_BENCH_ARM');
  const outDir = path.resolve(requireEnv('DSH_BENCH_OUT'));
  // 仓库外干净 workspace：对话会话 cwd 与工作流沙箱都在这里（防读仓库 AGENTS.md）
  const workspace = path.resolve(requireEnv('DSH_BENCH_WORKSPACE'));
  const dataDirRaw = process.env.DSH_BENCH_DATA_DIR || '';
  const dataDir = path.resolve(dataDirRaw || '.');
  if (arm !== 'A' && arm !== 'B') throw new Error(`DSH_BENCH_ARM 必须是 A 或 B，收到「${arm}」`);
  if (arm === 'A' && !process.env.DSH_BENCH_DATA_DIR) {
    throw new Error('A 组必须设置 DSH_BENCH_DATA_DIR（与 patch-arm-on.yml 的 dataDir 指向一致）');
  }
  fs.mkdirSync(outDir, { recursive: true });

  // 模型钉死：优先环境变量（绕开 settings.yaml 用户层对默认模型的热替换），缺省回落当前默认。
  // reasoningEffort 缺省不传 = 跟随 provider 默认（installModelSelection 的 absent 语义）。
  // agentDefaultModel 是可选服务（并发 heal 竞态等极端情况下可能缺失）——缺失时
  // 回落空对象（run.mjs 正常路径总会显式传 DSH_BENCH_PROVIDER/MODEL，不依赖这里）
  const fallback = ctx.get('agentDefaultModel')?.currentSelection?.() ?? {};
  const selection = {
    provider: process.env.DSH_BENCH_PROVIDER || fallback.provider,
    model: process.env.DSH_BENCH_MODEL || fallback.model,
    ...(process.env.DSH_BENCH_REASONING_EFFORT ? { reasoningEffort: process.env.DSH_BENCH_REASONING_EFFORT } : {}),
  };
  const judge = {
    provider: process.env.DSH_BENCH_JUDGE_PROVIDER || selection.provider,
    model: process.env.DSH_BENCH_JUDGE_MODEL || selection.model,
    ...(process.env.DSH_BENCH_JUDGE_REASONING_EFFORT ? { reasoningEffort: process.env.DSH_BENCH_JUDGE_REASONING_EFFORT } : {}),
  };
  const files = listScenarioFiles(scenariosDir);
  if (files.length === 0) throw new Error(`场景目录为空：${scenariosDir}`);

  const result = {
    version: 1,
    startedAt: new Date().toISOString(),
    arm,
    environment: {
      provider: selection.provider,
      model: selection.model,
      reasoningEffort: selection.reasoningEffort ?? '',
      judgeProvider: judge.provider,
      judgeModel: judge.model,
      judgeReasoningEffort: judge.reasoningEffort ?? '',
      pluginVersion: process.env.DSH_BENCH_PLUGIN_VERSION || '',
      // git SHA：版本号之外的代码指纹（profile 链接指向哪个工作树、代码是否与
      // 场景库同源，版本号反映不了——2026-08-21 实测被旧 runner 静默咬过）
      gitSha: process.env.DSH_BENCH_GIT_SHA || '',
      scenarioFiles: files,
    },
    scenarios: [],
  };
  console.log(`[bench-runner] ${arm} 组启动：${files.length} 个场景，模型 ${selection.provider}/${selection.model}，判卷 ${judge.provider}/${judge.model}`);

  const markers = new Map(); // marker -> 场景 id，跨场景污染检测用
  const ids = []; // 进度面板用：按执行顺序的场景 id
  for (const file of files) {
    const scenario = JSON.parse(fs.readFileSync(safeJoin(scenariosDir, file), 'utf8'));
    ids.push(scenario.id);
    if (scenario.marker) markers.set(scenario.marker, scenario.id);
  }
  progressInit(outDir, arm, ids);

  // 赛道旋钮：lifecycle（run.mjs --track lifecycle）在主循环后追加五个生命周期阶段；
  // noise（run.mjs --noise k）在对话场景之间插入 k 个噪声填充会话（记忆库加速膨胀，
  // 测检索/端到端随库容的退化）——填充不是场景文件，scenarioFiles 清单不变。
  const lifecycle = process.env.DSH_BENCH_TRACK === 'lifecycle';
  const noise = lifecycle ? 0 : Math.max(0, Number(process.env.DSH_BENCH_NOISE) || 0);
  const fillers = noise > 0 ? loadFillers(markers) : [];
  let fillerUsed = 0;
  const parsed = [];

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const scenario = JSON.parse(fs.readFileSync(safeJoin(scenariosDir, file), 'utf8'));
    parsed.push(scenario);
    const t0 = Date.now();
    const noiseBefore = fillerUsed;
    progressPatch({
      scenarioIndex: idx,
      scenarioId: scenario.id,
      phase: 'teach',
      message: null,
      distillWaitedMs: null,
      probeDone: 0,
      probeTotal: (scenario.probes?.length) || 0,
    });
    progressEvent(`▶ 场景 ${idx + 1}/${files.length}：${scenario.id}`);
    const r = await runScenario(ctx, scenario, { arm, selection, judge, dataDir, outDir, workspace, markers });
    r.file = file;
    r.durationMs = Date.now() - t0;
    r.noiseBefore = noiseBefore;
    result.scenarios.push(r);
    writeJson(path.join(outDir, 'result.json'), result); // 逐场景落盘，中断不丢已完成部分
    progressCompleteScenario(r);
    const hit = r.probes.filter((p) => p.score === 1).length;
    console.log(`[bench-runner] 场景完成 ${scenario.id}：探针 ${hit}/${r.probes.length}，耗时 ${(r.durationMs / 1000).toFixed(0)}s`);
    // 噪声填充：每个对话场景探针后、下一场景教学前插 k 个填充会话（末场景后无探针受益，省成本跳过）
    if (noise > 0 && idx < files.length - 1 && scenario.kind !== 'workflow') {
      progressPatch({ phase: 'teach' });
      for (let f = 0; f < noise; f++) {
        const filler = fillers[fillerUsed % fillers.length];
        fillerUsed++;
        await driveScriptedSession(ctx, selection, `filler-${fillerUsed}`, filler.messages, { cwd: workspace });
        progressEvent(`· 噪声填充会话 ${fillerUsed}（${filler.id}）`);
      }
    }
  }
  if (noise > 0) {
    result.noise = { level: noise, total: fillerUsed };
  }
  if (lifecycle) {
    result.lifecycle = await runLifecycleStages(ctx, parsed, result.scenarios, { arm, selection, judge, dataDir, outDir, workspace, markers });
    writeJson(path.join(outDir, 'result.json'), result);
  }
  // 效率三角分母与「记忆开销」记账：捕获消息计数（蒸馏成本摊到这里）+ 分层蒸馏用量
  // （bench 控制服务；arm-on/lifecycle patch 已开 benchControl，旧 profile 缺服务时静默跳过）
  result.capturedMessages = result.scenarios.reduce(
    (acc, r) => ({ user: acc.user + (r.messages?.user ?? 0), assistant: acc.assistant + (r.messages?.assistant ?? 0) }),
    { user: 0, assistant: 0 },
  );
  result.capturedMessages.total = result.capturedMessages.user + result.capturedMessages.assistant;
  if (arm === 'A') {
    const control = await tryBenchControl(ctx);
    if (control) result.distillUsage = control.getDistillUsage();
  }
  result.finishedAt = new Date().toISOString();
  writeJson(path.join(outDir, 'result.json'), result);
  progressFinish();
  return 0;
}

/** 场景完成 → 进度收尾：完成清单 + 全 rep 累计指标（面板的成本表数据源）。 */
function progressCompleteScenario(r) {
  if (!progress) return;
  const wf = r.workflow;
  const passed = wf ? wf.checksPassed : r.probes.filter((p) => p.score === 1).length;
  const total = wf ? wf.checksTotal : r.probes.length;
  progress.completed.push({ id: r.id, passed, total, durationMs: r.durationMs });
  const sessions = [r.teach?.metrics, r.change?.metrics, r.probeMetrics].filter(Boolean);
  for (const m of sessions) {
    progress.totals.inputTokens += m.inputTokens ?? 0;
    progress.totals.outputTokens += m.outputTokens ?? 0;
    progress.totals.toolCalls += m.toolCalls ?? 0;
    progress.totals.turns += m.turns ?? 0;
  }
  progress.totals.asks += (r.teach?.asks ?? 0) + (r.change?.asks ?? 0) + (r.workflow?.probe?.asks ?? 0);
  progressEvent(`✓ ${r.id}：${passed}/${total}，耗时 ${(r.durationMs / 1000).toFixed(0)}s`);
}

// ---------------------------------------------------------------------------
// 受限文件访问：文件名白名单 + 目录内包含校验
// ---------------------------------------------------------------------------

function listScenarioFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && SAFE_NAME.test(f)).sort();
}

function readFileInDir(dir, name) {
  return fs.readFileSync(safeJoin(dir, name), 'utf8');
}

// ---------------------------------------------------------------------------
// 场景执行
// ---------------------------------------------------------------------------

async function runScenario(ctx, sc, opts) {
  if (sc.kind === 'workflow') return runWorkflowScenario(ctx, sc, opts);
  return runDialogScenario(ctx, sc, opts);
}

/** 纯对话赛道（默认）：教学（teach / reinforce / change 按声明顺序）→ 蒸馏等待 → 探针判分。
 * reinforce 是补强教学会话（增量积累、连锁更新等题型的碎片载体），整个属于教学阶段；
 * 蒸馏等待仍在全部教学会话之后做一次（minMessages=1 + idleSeconds=30 下中间会话已自然落袋）。 */
async function runDialogScenario(ctx, sc, opts) {
  const teachSession = sc.sessions.find((s) => s.kind === 'teach');
  const changeSession = sc.sessions.find((s) => s.kind === 'change');
  if (!teachSession || !changeSession) throw new Error(`场景 ${sc.id} 缺少 teach 或 change 会话`);
  const unknown = sc.sessions.find((s) => !['teach', 'reinforce', 'change'].includes(s.kind));
  if (unknown) throw new Error(`场景 ${sc.id} 出现未知会话 kind：${unknown.kind}`);

  const reinforce = [];
  let teach = null;
  let change = null;
  progressPatch({ phase: 'teach' });
  for (const s of sc.sessions) {
    if (s.kind === 'teach') {
      teach = await driveScriptedSession(ctx, opts.selection, `${sc.id}-teach`, s.messages, { cwd: opts.workspace });
    } else if (s.kind === 'reinforce') {
      reinforce.push(await driveScriptedSession(ctx, opts.selection, `${sc.id}-reinforce${reinforce.length + 1}`, s.messages, { cwd: opts.workspace }));
    } else {
      progressPatch({ phase: 'change' });
      change = await driveScriptedSession(ctx, opts.selection, `${sc.id}-change`, s.messages, { cwd: opts.workspace });
    }
  }

  // A 组等蒸馏落袋（records/ 行数稳定）；B 组插件整体禁用，无蒸馏可等。
  // 记忆生命周期：一个 rep 的 dataDir 从第一次蒸馏起全程保留、跨场景累积，rep 结束才废弃
  // ——后续场景的探针因此会被前面场景的记忆干扰，抗干扰能力经 contamination 指标量化。
  progressPatch({ phase: 'distill' });
  const distill = opts.arm === 'A'
    ? await waitForDistillation(opts.dataDir, Number(process.env.DSH_BENCH_DISTILL_TIMEOUT_MS) || 120_000)
    : { skipped: true };
  if (!distill.skipped) progressEvent(`蒸馏等待 ${(distill.waitedMs / 1000).toFixed(0)}s（records ${distill.recordLines} 行${distill.timedOut ? '，超时' : ''}）`);

  progressPatch({ phase: 'probe' });
  const probe = await runProbeSession(ctx, sc, opts);

  return {
    id: sc.id,
    family: sc.family,
    teach: teach,
    reinforce,
    change: change,
    distill,
    probes: probe.probes,
    probeMetrics: probe.metrics,
    // 效率三角：该场景全部会话的轮次延迟/消息计数合计
    latency: sumLatency([teach?.latency, ...reinforce.map((r) => r.latency), change?.latency, probe.latency]),
    messages: {
      user: (teach?.messages?.user ?? 0) + reinforce.reduce((s, r) => s + (r.messages?.user ?? 0), 0) + (change?.messages?.user ?? 0) + (probe.messages?.user ?? 0),
      assistant: (teach?.messages?.assistant ?? 0) + reinforce.reduce((s, r) => s + (r.messages?.assistant ?? 0), 0) + (change?.messages?.assistant ?? 0) + (probe.messages?.assistant ?? 0),
    },
    contamination: probe.contamination,
  };
}

function userMessage(text) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } });
}

/** 按剧本逐条驱动一个全新会话，返回会话事件折叠指标。 */
async function driveScriptedSession(ctx, selection, label, messages, options = {}) {
  const { agent, dispose } = await createAgent(ctx, selection, label, options.cwd);
  try {
    await agent.whenIdle();
    // lifecycle 赛道：首条消息前经 bench 控制服务设会话档位（capture/recall 每轮读 Map）
    if (options.mode) {
      const control = options.control ?? (await getBenchControl(ctx));
      control.setSessionMode(String(agent.session.id), options.mode);
    }
    const firstSeq = agent.session.seq;
    let asks = 0;
    for (let i = 0; i < messages.length; i++) {
      agent.followup(userMessage(messages[i]));
      await agent.whenIdle();
      progressLive(label, i + 1, messages.length, foldMetrics(agent.session.events.filter((e) => e.seq >= firstSeq)));
      // 交互窗口（剧本最后一条消息后）：agent 求助（问凭据/约定/信息）→ 补发固定重述，
      // 真实用户行为——"问就再讲一遍"。轮次与 token 如实计入，这正是记忆缺失的代价。
      if (options.reteach && i === messages.length - 1) {
        let exchanges = 0;
        while (exchanges < (options.maxExchanges ?? 2)) {
          const lastText = lastAssistantText(agent.session.events);
          const asked = looksLikeAsk(lastText) || hasAskTool(agent.session.events, firstSeq);
          if (!asked || taskSeemsDone(lastText)) break;
          exchanges++;
          asks++;
          console.log(`    [${label}] 检测到求助，补发固定重述（第 ${asks} 次）`);
          progressEvent(`[${label}] 检测到求助，补发固定重述（第 ${asks} 次）`);
          agent.followup(userMessage(options.reteach));
          await agent.whenIdle();
          progressLive(label, i + 1, messages.length, foldMetrics(agent.session.events.filter((e) => e.seq >= firstSeq)));
        }
      }
    }
    await ctx.get('sessions').flush(agent.session);
    const driven = agent.session.events.filter((e) => e.seq >= firstSeq);
    return {
      sessionId: agent.session.id,
      metrics: foldMetrics(driven),
      asks,
      toolAudit: collectToolAudit(driven),
      // 效率三角：轮次延迟 + 消息计数（user = 剧本 + 补发重述；assistant = 事件计数）
      latency: summarizeTurnLatency(driven),
      messages: {
        user: messages.length + asks,
        assistant: driven.filter((e) => e.type === 'assistant/message').length,
      },
      // 可选：跨场景污染检测（工作流探针也测——召回注入里出现其他场景 marker 即计）
      ...(options.markers && options.scenarioId
        ? { contamination: detectContamination(agent.session.events, { id: options.scenarioId }, options.markers) }
        : {}),
    };
  } finally {
    try { dispose?.(); } catch { /* 拆除失败不影响结果落盘 */ }
  }
}

/** 求助检测：问号结尾、ask 类工具，或索取凭据/信息/约定的典型措辞（中英双语）。 */
function looksLikeAsk(text) {
  const t = String(text || '');
  if (/[？?]\s*$/.test(t.trimEnd())) return true;
  if (/\b(password|credential|username|account|token|api ?key)\b\s*(is|are|was)?\b[^.!?]{0,30}\?/i.test(t)) return true;
  if (/\b(what(?:'s| is| are)|could you|can you|please)\b[^.!?]{0,40}\b(provide|tell|share|confirm|give)\b/i.test(t)) return true;
  return /(请|麻烦|能否|能不能|可以)?\s*(提供|告诉|告知|给我|发我|补充|说明)[^。！？!]{0,24}(账号|密码|凭据|用户名|口令|令牌|密钥|信息|约定|规矩|流程|方式|方法)|(账号|密码|凭据|用户名|口令)(是(什么|多少))|我(需要|缺少|没有)[^。！？!]{0,16}(账号|密码|凭据|信息|约定)|(无法|不能|没能)[^。！？!]{0,20}(因为|由于|没有|缺少|不知道)/.test(t);
}

function hasAskTool(events, sinceSeq) {
  return events.some((e) => e.seq > sinceSeq && e.type === 'tool/call' && /ask/i.test(String(e.data?.name ?? '')));
}

/** 任务完成的粗判：末条消息含明确交付物指向（文件/完成措辞）时不按反问处理。 */
function taskSeemsDone(text) {
  return /(已完成|已生成|已写入|搞定|done)/i.test(text || '');
}

/**
 * 工具调用审计：记录 name + 参数摘要。越界读取分两档：
 *   snoopViolation（严格）——参数中出现明确的记忆库/会话库路径（~/.dsh、memory.db、
 *   records/conversations/scenes 存储目录）。触发即判该场景全部检查负（防"翻库作弊"，
 *   权限模型只限写不限读，这是唯一硬防线）。带路径分隔符锚定 + 词尾负前瞻，
 *   防止 '.MemoryMappedFiles' 这类子串误命中（2026-08-21 实测误报过）。
 *   snoopSuspect（宽松）——疑似但不确定（如 .dsh 相关、memory 泛词），仅标记供人工复核。
 */
const SNOOP_VIOLATION = /(?:\.dsh[\\/](?:memory|sessions|profiles)|memory\.db|(?:^|[\s"'\\/])(?:records|conversations|scenes)[\\/])/i;
const SNOOP_SUSPECT = /(\.dsh(?![a-z0-9])|memory\.db|\.memory(?![a-z]))/i;
function collectToolAudit(events) {
  const audit = [];
  for (const e of events) {
    if (e.type !== 'tool/call') continue;
    const name = String(e.data?.name ?? '');
    // 合法主动召回通道不进审计：memory_read_scene 的参数本身就是 scenes/<family>/
    // 路径，按路径正则会误判违规（违规只针对 bash/fs 等通用工具的越界读取）
    if (/^(memory_search|conversation_search|memory_read_scene)$/.test(name)) continue;
    const args = String(e.data?.arguments ?? e.data?.input ?? '');
    audit.push({ name, args: args.slice(0, 400) });
  }
  // 检测跑原始全串（截断只影响留痕展示，不产生漏检）
  const raws = [];
  for (const e of events) {
    if (e.type !== 'tool/call') continue;
    const name = String(e.data?.name ?? '');
    if (/^(memory_search|conversation_search|memory_read_scene)$/.test(name)) continue;
    raws.push(String(e.data?.arguments ?? e.data?.input ?? ''));
  }
  const test = (re) => raws.some((s) => re.test(s));
  const out = {
    calls: audit.length > 40 ? audit.slice(0, 40) : audit,
    truncated: audit.length > 40,
    snoopSuspect: test(SNOOP_SUSPECT),
    snoopViolation: test(SNOOP_VIOLATION),
  };
  return out;
}

/** 探针会话：新会话逐题提问，逐题取末条 assistant 文本并判分；顺带检测召回注入的跨场景污染。 */
async function runProbeSession(ctx, sc, opts) {
  const { agent, dispose } = await createAgent(ctx, opts.selection, `${sc.id}-probe${opts.probeLabelSuffix ?? ''}`, opts.workspace);
  try {
    await agent.whenIdle();
    const firstSeq = agent.session.seq;
    const probes = [];
    for (const p of sc.probes) {
      const before = agent.session.seq;
      agent.followup(userMessage(p.q));
      await agent.whenIdle();
      const events = agent.session.events.filter((e) => e.seq > before);
      const answer = lastAssistantText(events);
      progressPatch({ phase: 'judge' });
      const judged = await judgeProbe(ctx, opts.judge, p, answer);
      // 召回分析：该题的被动注入是否含 gold 要点；模型是否主动调了记忆工具（双通道分离）
      const injText = recallInjectionText(events);
      probes.push({
        type: p.type,
        q: p.q,
        gold: p.gold ?? null,
        stale: p.stale ?? null,
        judge: p.judge,
        answer,
        score: judged.score,
        reason: judged.reason,
        recall: {
          injected: injText.length > 0,
          chars: injText.length,
          hit: (p.gold ?? []).length > 0 ? goldInText(p.gold, injText) : null,
          // 注入明细（记忆行内容，预算截断后原样）——离线注入精度/recall@k 指标的原料
          lines: recallInjectionLines(injText),
        },
        // 效率三角：该轮输入 token（注入占比的分母）
        turnInputTokens: turnInputTokens(events),
        usedMemoryTool: events.some((e) => e.type === 'tool/call' && /memory|conversation/i.test(String(e.data?.name ?? ''))),
      });
      console.log(`  [${sc.id}·${p.type}] score=${judged.score} ${judged.reason ?? ''}`);
      progressPatch({ phase: 'probe', probeDone: probes.length });
    }
    const contamination = detectContamination(agent.session.events, sc, opts.markers);
    await ctx.get('sessions').flush(agent.session);
    const drivenAll = agent.session.events.filter((e) => e.seq >= firstSeq);
    return {
      probes,
      metrics: foldMetrics(drivenAll),
      latency: summarizeTurnLatency(drivenAll),
      messages: {
        user: sc.probes.length,
        assistant: drivenAll.filter((e) => e.type === 'assistant/message').length,
      },
      contamination,
    };
  } finally {
    try { dispose?.(); } catch { /* 同上 */ }
  }
}

/**
 * 跨场景污染检测：扫描探针会话里的召回注入消息（source.form === 'recall'），
 * 若注入文本中出现**其他场景**的 marker 词，说明检索被前面场景的记忆干扰。
 * 返回 [{marker, from: 场景id}]（去重）。
 */
function detectContamination(events, sc, markers) {
  if (!markers || markers.size === 0) return [];
  const hits = new Map();
  for (const e of events) {
    if (e.type !== 'user/message') continue;
    const src = e.data?.source;
    if (!src || src.form !== 'recall') continue;
    const text = (e.data?.content ?? []).map((b) => b.text ?? '').join('');
    for (const [marker, from] of markers) {
      if (from === sc.id) continue;
      if (text.includes(marker)) hits.set(marker, from);
    }
  }
  return [...hits].map(([marker, from]) => ({ marker, from }));
}

async function createAgent(ctx, selection, label, cwd) {
  const handle = await ctx.get('agents').create({
    sessionId: SessionId(`bench-${label}-${randomUUID()}`),
    meta: { cwd: cwd || process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: (agentCtx) => {
      installModelSelection(agentCtx, { current: selection, assembled: undefined });
    },
  });
  return handle;
}

// ---------------------------------------------------------------------------
// 生命周期赛道（lifecycle）：主循环（教学 + 探针轮 1）之后追加阶段——
//   分族门控 / off 档捕获 / rebuild 保真（探针轮 2 对照轮 1）/ 遗忘请求。
// 零新场景文件，复用对话场景库；rebuild 触发与会话档位经 bench 控制服务
// （插件 config benchControl=true 时提供，服务名 dsh-memory-bench）。
// ---------------------------------------------------------------------------

/** off 档教学事实：含全库唯一 nonce——行为断言（auto 探针须拒答）+ 数据断言
 *  （records/conversations JSONL 全文不得出现 nonce，off 会话连 L0 都不该写）。 */
const OFF_FACTS = {
  messages: [
    '顺便记一个只有你知道的数：我的幸运数字是 88417，别外传。',
    '我家旧门牌号是 SH-0921，早就作废了，提一下而已。',
  ],
  nonces: ['88417', 'SH-0921'],
  probes: [
    { q: '我的幸运数字是多少？', judge: 'abstain-llm' },
    { q: '我家旧门牌号是什么？', judge: 'abstain-llm' },
  ],
};

/** 获取 bench 控制服务（插件可能晚于 runner 就绪，轮询等待；超时给出可操作提示）。 */
function getBenchControl(ctx, timeoutMs = 30_000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const control = ctx.get('dsh-memory-bench');
      if (control) return resolve(control);
      if (Date.now() - t0 > timeoutMs) {
        return reject(new Error('bench 控制服务不可用：确认 patch 用 patch-arm-lifecycle.yml（dsh-memory 配置 benchControl: true）'));
      }
      setTimeout(tick, 1000);
    };
    tick();
  });
}

/** 噪声填充库装载（bench/harness/fillers.json）+ 防假污染断言：填充文本出现任何
 *  场景 marker 都会在探针污染计数里张冠李戴，装载期直接拒绝。 */
function loadFillers(markers) {
  const url = new URL('../../fillers.json', import.meta.url);
  let list;
  try {
    list = JSON.parse(fs.readFileSync(url, 'utf8'));
  } catch (err) {
    throw new Error(`噪声填充库不可读（${url}）：${err?.message ?? err}`);
  }
  if (!Array.isArray(list) || list.length === 0) throw new Error('噪声填充库为空或非数组');
  for (const f of list) {
    if (!f.id || !Array.isArray(f.messages) || f.messages.length === 0) {
      throw new Error(`填充会话 ${f.id ?? '?'} 结构非法（需 id + 非空 messages）`);
    }
    const text = f.messages.join('\n');
    for (const [marker, from] of markers) {
      if (text.includes(marker)) {
        throw new Error(`填充会话 ${f.id} 含场景 ${from} 的 marker「${marker}」（假污染），请改写`);
      }
    }
  }
  return list;
}

/** dataDir 子目录（records/conversations）的 JSONL 里是否出现任一 needle。 */
function dataDirJsonlContains(dataDir, sub, needles) {
  const dir = path.join(dataDir, sub);
  if (!fs.existsSync(dir)) return false;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl') && SAFE_NAME.test(x))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const n of needles) {
      if (text.includes(n)) return true;
    }
  }
  return false;
}

/** 指定档位的问答会话：建 agent →（可选）设档 → 逐题提问判分。
 *  mode 为空 = auto（不设档，用部署默认）；questions 元素即探针对象（judge 分发用）。 */
async function runModeProbeSession(ctx, opts, label, questions, mode) {
  const { agent, dispose } = await createAgent(ctx, opts.selection, label, opts.workspace);
  try {
    await agent.whenIdle();
    if (mode) {
      const control = await getBenchControl(ctx);
      control.setSessionMode(String(agent.session.id), mode);
    }
    const firstSeq = agent.session.seq;
    const probes = [];
    progressPatch({ phase: 'probe', probeDone: 0, probeTotal: questions.length });
    for (const p of questions) {
      const before = agent.session.seq;
      agent.followup(userMessage(p.q));
      await agent.whenIdle();
      const events = agent.session.events.filter((e) => e.seq > before);
      const answer = lastAssistantText(events);
      progressPatch({ phase: 'judge' });
      const judged = await judgeProbe(ctx, opts.judge, p, answer);
      const injText = recallInjectionText(events);
      probes.push({
        q: p.q,
        gold: p.gold ?? null,
        stale: p.stale ?? null,
        judge: p.judge,
        // 门控矩阵聚合键（report 按 polarity 分桶、from 标来源场景）
        polarity: p.polarity ?? null,
        from: p.from ?? null,
        answer,
        score: judged.score,
        reason: judged.reason,
        recall: {
          injected: injText.length > 0,
          chars: injText.length,
          hit: (p.gold ?? []).length > 0 ? goldInText(p.gold, injText) : null,
          lines: recallInjectionLines(injText),
        },
        turnInputTokens: turnInputTokens(events),
        // 工具通道标记：门控阴性题若靠 conversation_search（L0 原文检索，不分族）答出，
        // 泄漏归因与被动注入不同——报告/取证据此区分（2026-08-23 实测主要泄漏通道）
        usedMemoryTool: events.some((e) => e.type === 'tool/call' && /memory|conversation/i.test(String(e.data?.name ?? ''))),
      });
      console.log(`  [${label}·${p.from ?? p.polarity ?? '?'}] score=${judged.score} ${judged.reason ?? ''}`);
      progressPatch({ phase: 'probe', probeDone: probes.length });
    }
    await ctx.get('sessions').flush(agent.session);
    const drivenAll = agent.session.events.filter((e) => e.seq >= firstSeq);
    return {
      probes,
      metrics: foldMetrics(drivenAll),
      latency: summarizeTurnLatency(drivenAll),
      messages: {
        user: questions.length,
        assistant: drivenAll.filter((e) => e.type === 'assistant/message').length,
      },
    };
  } finally {
    try { dispose?.(); } catch { /* 拆除失败不影响结果落盘 */ }
  }
}

/** 轮询 rebuild 至终态（done/cancelled/failed），超时返回 timedOut（不中断流程）。 */
async function waitForBenchRebuild(control, timeoutMs) {
  const t0 = Date.now();
  let last = control.rebuildStatus();
  while (last.running && !['done', 'cancelled', 'failed'].includes(last.phase)) {
    if (Date.now() - t0 > timeoutMs) return { status: last, durationMs: Date.now() - t0, timedOut: true };
    progressEvent(`· rebuild ${last.phase} ${last.done ?? 0}/${last.total ?? '?'}`);
    await new Promise((r) => setTimeout(r, 5000));
    last = control.rebuildStatus();
  }
  return { status: last, durationMs: Date.now() - t0, timedOut: false };
}

function roundAccuracy(rows) {
  const byType = {};
  let hit = 0;
  let total = 0;
  for (const row of rows) {
    for (const p of row.probes ?? []) {
      total++;
      (byType[p.type] ??= { hit: 0, total: 0 }).total++;
      if (p.score === 1) {
        hit++;
        byType[p.type].hit++;
      }
    }
  }
  return { hit, total, accuracy: total ? hit / total : 0, byType };
}

/** 生命周期五阶段（前两阶段在主循环完成：教学 + 探针轮 1）。resultRows 传主循环
 *  的结果记录（probes 带 score）——轮 1 准确率从这里算，不能用原始场景定义（无 score）。 */
async function runLifecycleStages(ctx, scenarios, resultRows, opts) {
  const control = await getBenchControl(ctx);
  const lifecycle = { track: 'lifecycle' };

  // ---- 阶段 A：分族门控（"写入与召回同档"不变量的反向验证）----
  // chat 档会话问 chat 题（阳性对照：召回应命中）+ work 题（阴性：异族事实必须答不出）；
  // work 档镜像。阴性题强制 abstain-llm（给出具体内容 = 泄漏）。
  progressEvent('▶ 生命周期：分族门控');
  const byFamily = (fam) => scenarios.filter((s) => s.family === fam && s.kind !== 'workflow').slice(0, 2);
  const pickQuestions = (list) =>
    list.flatMap((sc) =>
      (sc.probes ?? []).filter((p) => Array.isArray(p.gold) && p.gold.length > 0).slice(0, 2)
        .map((p) => ({ q: p.q, gold: p.gold, stale: p.stale ?? null, judge: p.judge, from: sc.id })));
  const chatQ = pickQuestions(byFamily('chat'));
  const workQ = pickQuestions(byFamily('work'));
  if (chatQ.length === 0 || workQ.length === 0) {
    throw new Error('lifecycle 赛道需要至少 1 个 chat 族与 1 个 work 族对话场景（--scenarios 指定的库缺族）');
  }
  const gatingArm = async (mode, own, other) => {
    const questions = [
      ...own.map((p) => ({ ...p, polarity: 'positive' })),
      ...other.map((p) => ({ q: p.q, gold: null, stale: null, judge: 'abstain-llm', from: p.from, polarity: 'negative' })),
    ];
    return (await runModeProbeSession(ctx, opts, `lc-gate-${mode}`, questions, mode)).probes;
  };
  lifecycle.gating = {
    chatArm: await gatingArm('chat', chatQ, workQ),
    workArm: await gatingArm('work', workQ, chatQ),
  };

  // ---- 阶段 B：off 档捕获（行为 + 数据双断言）----
  progressEvent('▶ 生命周期：off 档捕获');
  progressPatch({ phase: 'teach', probeDone: 0, probeTotal: OFF_FACTS.probes.length });
  await driveScriptedSession(ctx, opts.selection, 'lc-off-teach', OFF_FACTS.messages, { cwd: opts.workspace, mode: 'off', control });
  progressPatch({ phase: 'distill' });
  const offDistill = await waitForDistillation(opts.dataDir, Number(process.env.DSH_BENCH_DISTILL_TIMEOUT_MS) || 120_000);
  const offBehavior = await runModeProbeSession(ctx, opts, 'lc-off-probe', OFF_FACTS.probes);
  const offDataLeak =
    dataDirJsonlContains(opts.dataDir, 'records', OFF_FACTS.nonces)
    || dataDirJsonlContains(opts.dataDir, 'conversations', OFF_FACTS.nonces);
  lifecycle.offCapture = {
    behavior: offBehavior.probes,
    dataLeak: offDataLeak,
    nonces: OFF_FACTS.nonces,
    distillWaitedMs: offDistill.waitedMs ?? 0,
  };

  // ---- 阶段 C：rebuild 保真（探针轮 2 对照轮 1）----
  progressEvent('▶ 生命周期：触发 rebuild（从 L0 重导全部派生层）');
  progressPatch({ phase: 'distill' });
  lifecycle.rebuild = { error: null };
  try {
    const usageBefore = control.getDistillUsage(); // rebuild 专属用量归因（前后差分）
    const started = control.rebuildStart();
    lifecycle.rebuild.started = { phase: started.phase, sessionCount: started.sessionCount, messageCount: started.messageCount, estCalls: started.estCalls };
    const done = await waitForBenchRebuild(control, Number(process.env.DSH_BENCH_REBUILD_TIMEOUT_MS) || 15 * 60_000);
    lifecycle.rebuild = {
      ...lifecycle.rebuild,
      phase: done.status.phase,
      durationMs: done.durationMs,
      timedOut: done.timedOut === true,
      sessionCount: done.status.sessionCount,
      messageCount: done.status.messageCount,
      recordsBuilt: done.status.recordsBuilt,
      error: done.status.error ?? (done.timedOut ? '轮询超时' : null),
      distillUsage: diffDistillUsage(usageBefore, control.getDistillUsage()),
    };
    progressEvent(`· rebuild 终态 ${done.status.phase}（${(done.durationMs / 1000).toFixed(0)}s，重建 ${done.status.recordsBuilt ?? 0} 条）`);
    if (done.status.phase === 'done') {
      // 探针轮 2：全新 auto 会话重问全部题——准确率应不回退（分题型对照轮 1）
      const round2 = [];
      for (const sc of scenarios) {
        if (sc.kind === 'workflow') continue;
        const r2 = await runProbeSession(ctx, sc, { ...opts, probeLabelSuffix: '-2' });
        round2.push({ id: sc.id, probes: r2.probes });
      }
      lifecycle.rounds = [
        { label: 'probe-1', ...roundAccuracy(resultRows.filter((s) => s.kind !== 'workflow')) },
        { label: 'probe-2', ...roundAccuracy(round2), scenarios: round2 },
      ];
      // off 复验：rebuild 不触碰 L0，off 内容从未入 L0 → nonce 仍应缺席
      lifecycle.offCapture.dataLeakAfterRebuild =
        dataDirJsonlContains(opts.dataDir, 'records', OFF_FACTS.nonces)
        || dataDirJsonlContains(opts.dataDir, 'conversations', OFF_FACTS.nonces);
    }
  } catch (err) {
    lifecycle.rebuild.error = err?.message ?? String(err);
    console.error(`[bench-runner] rebuild 阶段失败（继续后续阶段）：${lifecycle.rebuild.error}`);
  }

  // ---- 阶段 D：遗忘请求（自然对话，考 L1 冲突检测的删除路径）----
  // 目标：首个 chat 场景的第一道 contains-all 题（gold 程序可验）；遗忘会话要求删除
  // → 蒸馏去重应把旧记录作废（update/deleteBatch）→ 原题重问须拒答且不复述旧值。
  progressEvent('▶ 生命周期：遗忘请求');
  const forgetTarget = scenarios
    .filter((s) => s.family === 'chat' && s.kind !== 'workflow')
    .flatMap((sc) => (sc.probes ?? []).filter((p) => p.judge === 'contains-all').slice(0, 1).map((p) => ({ ...p, from: sc.id })))[0];
  if (forgetTarget) {
    const forgetMsg = `之前你问过我这件事，现在彻底作废了：把「${forgetTarget.q}」相关的记忆删掉，别再保留这条信息，以后我问起就当没有这回事。`;
    progressPatch({ phase: 'teach', probeDone: 0, probeTotal: 1 });
    await driveScriptedSession(ctx, opts.selection, 'lc-forget', [forgetMsg], { cwd: opts.workspace, control });
    progressPatch({ phase: 'distill' });
    await waitForDistillation(opts.dataDir, Number(process.env.DSH_BENCH_DISTILL_TIMEOUT_MS) || 120_000);
    const fr = await runModeProbeSession(ctx, opts, 'lc-forget-probe', [
      // 判卷口径：遗忘题的正确行为是"确认已删除/作废"且不复述旧值——不同于"从未发生"的
      // 拒答题（abstain-llm 会把复述相邻事实也判负，过严）；stale=原 gold，复述即 FAIL。
      { q: forgetTarget.q, gold: ['已删除或作废'], stale: forgetTarget.gold, judge: 'llm' },
    ]);
    lifecycle.forget = { scenarioId: forgetTarget.from, topic: forgetTarget.q, gold: forgetTarget.gold, probe: fr.probes[0] };
  } else {
    lifecycle.forget = { error: '无 contains-all 题可作遗忘目标' };
  }

  return lifecycle;
}

// ---------------------------------------------------------------------------
// 效率三角工具（注入延迟 / 注入占比 / 蒸馏记账的数据采集侧）：
// 事件自带 time（epoch ms），逐轮测「用户消息 → 召回注入 → 首个 step/assistant 事件」。
// ---------------------------------------------------------------------------

/** 轮次延迟摘要。事件时间戳的落盘语义（实测取证 2026-08-23）：recall 注入与 user
 *  消息在同一步骤派发时写盘——seq 相邻、时间同戳（注入钩子自身耗时不可观测），
 *  且 recall 的 seq 在 user 消息**之前**。因此：
 *  - 注入轮判定 = user 消息向后看（到上一条 user 消息为止）有无 recall 事件；
 *  - 轮次响应 = user 消息 → 首个 assistant/* 事件（chunk 即流式首响应）；
 *  - 注入开销在报告侧用「注入轮均值 − 无注入轮均值」的差分口径表达。 */
function summarizeTurnLatency(events) {
  let turns = 0, injTurns = 0, firstRespInjSumMs = 0, firstRespPlainSumMs = 0;
  let i = 0;
  while (i < events.length) {
    const e = events[i];
    if (e.type === 'user/message' && e.data?.source?.form !== 'recall') {
      turns++;
      let injected = false;
      for (let k = i - 1; k >= 0; k--) {
        const ev = events[k];
        if (ev.type === 'user/message' && ev.data?.source?.form !== 'recall') break; // 上一轮 user 消息，停止
        if (ev.type === 'user/message' && ev.data?.source?.form === 'recall') {
          injected = true;
          break;
        }
      }
      let t2 = null;
      for (let j = i + 1; j < events.length; j++) {
        const ev = events[j];
        if (ev.type === 'user/message' && ev.data?.source?.form !== 'recall') break; // 下一轮开始
        if (String(ev.type).startsWith('assistant/')) {
          t2 = ev.time;
          break;
        }
      }
      if (injected) injTurns++;
      if (t2 !== null) {
        const resp = Math.max(0, t2 - e.time);
        if (injected) firstRespInjSumMs += resp;
        else firstRespPlainSumMs += resp;
      }
      i++;
    } else {
      i++;
    }
  }
  return { turns, injTurns, firstRespInjSumMs, firstRespPlainSumMs };
}

function sumLatency(list) {
  const out = { turns: 0, injTurns: 0, firstRespInjSumMs: 0, firstRespPlainSumMs: 0 };
  for (const l of list) {
    if (!l) continue;
    for (const k of Object.keys(out)) out[k] += l[k] ?? 0;
  }
  return out;
}

/** 该轮 assistant 消息 usage 的输入 token 合计（非缓存 + 缓存命中）。 */
function turnInputTokens(events) {
  let t = 0;
  for (const e of events) {
    if (e.type !== 'assistant/message') continue;
    const u = e.data?.usage;
    if (!u) continue;
    t += (typeof u.inputTokens === 'number' ? u.inputTokens : 0) + (typeof u.cacheReadTokens === 'number' ? u.cacheReadTokens : 0);
  }
  return t;
}

/** 非致命版控制服务获取（效率三角的蒸馏记账用；旧 profile 未开 benchControl 时静默跳过）。 */
async function tryBenchControl(ctx, timeoutMs = 5000) {
  try {
    return await getBenchControl(ctx, timeoutMs);
  } catch {
    return null;
  }
}

/** 两份蒸馏用量快照的差值（lifecycle 的 rebuild 归因用）。 */
function diffDistillUsage(before, after) {
  const layers = {};
  for (const [layer, a] of Object.entries(after?.layers ?? {})) {
    const b = before?.layers?.[layer] ?? { calls: 0, failures: 0, inputChars: 0, outputTokens: 0, reasoningTokens: 0 };
    layers[layer] = {
      calls: a.calls - b.calls,
      failures: a.failures - b.failures,
      inputChars: a.inputChars - b.inputChars,
      outputTokens: a.outputTokens - b.outputTokens,
      reasoningTokens: a.reasoningTokens - b.reasoningTokens,
    };
  }
  return { layers };
}

/**
 * 工作流赛道：沙箱目录 + 工具可用 + 模糊延续任务。
 * 教学会话讲清工作流约定并完成第一批（探索成本发生在此）；
 * 探针会话给模糊延续任务（"按老办法处理新的这批"）——
 * A 组靠召回直取工作流，B 组反问（补发固定重述，token 如实计）或重新探索。
 * 完成度按 checks（产物文件 + 关键内容）程序化校验。
 */
/** 本地站点模拟服务（wf-site-login 用）：会话令牌存服务端内存，沙箱内无法伪造。 */
function startSiteServer(creds) {
  return new Promise((resolve) => {
    const sessions = new Set();
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const send = (code, text) => {
        res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(text);
      };
      if (req.method === 'POST' && url.pathname === '/login') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const f = new URLSearchParams(body);
          if (f.get('u') === creds.user && f.get('p') === creds.pass) {
            const token = randomUUID();
            sessions.add(token);
            send(200, `session-ok-${token}`);
          } else {
            send(401, '用户名或密码错误');
          }
        });
        return;
      }
      if (req.method === 'GET' && (url.pathname === '/fetch' || url.pathname === '/whoami')) {
        const token = (url.searchParams.get('token') || '').replace(/^session-ok-/, '');
        if (!sessions.has(token)) {
          send(401, '会话无效或未登录（令牌由站点服务签发，无法本地伪造）');
          return;
        }
        if (url.pathname === '/whoami') {
          send(200, `${creds.user}（内部站点·只读）`);
          return;
        }
        const p = url.searchParams.get('path') || '';
        if (p === '/reports/daily') {
          send(200, 'DAILY-2026-09-06 营收 1,204 单 关键指标正常 备货提醒：华东仓周一盘点');
        } else {
          send(404, `404：${p} 不存在（可用：/reports/daily）`);
        }
        return;
      }
      send(404, 'not found');
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function runWorkflowScenario(ctx, sc, opts) {
  const sandbox = safeJoin(opts.workspace, `sandbox-${sc.id}`);
  // 场景声明的本地服务（如 site-login）：先启动，端口写入沙箱；会话状态在服务端内存。
  let site = null;
  if (sc.server?.type === 'site-login') site = await startSiteServer(sc.server);
  const resetSandbox = () => {
    fs.rmSync(sandbox, { recursive: true, force: true });
    for (const [rel, content] of Object.entries(sc.sandboxFiles ?? {})) {
      const target = safeJoin(sandbox, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }
    if (site) fs.writeFileSync(safeJoin(sandbox, '.site-port'), `${site.port}\n`, 'utf8');
  };
  const runChecks = (list) => evalFileChecks(sandbox, list);
  const teach = sc.sessions.find((s) => s.kind === 'teach');
  const change = sc.sessions.find((s) => s.kind === 'change');
  const probe = sc.sessions.find((s) => s.kind === 'probe');
  if (!teach || !probe) throw new Error(`工作流场景 ${sc.id} 缺 teach 或 probe 会话`);

  try {
    resetSandbox();
    progressPatch({ phase: 'teach' });
    const teachRun = await driveScriptedSession(ctx, opts.selection, `${sc.id}-teach`, teach.messages, {
      cwd: sandbox,
      reteach: teach.reteach ?? probe.reteach,
      maxExchanges: 2,
    });
    const teachChecks = runChecks(sc.teachChecks);
    progressEvent(`教学段检查 ${teachChecks.filter((c) => c.ok).length}/${teachChecks.length}`);
    // 可选变更会话（流程知识更新题用）：在同一沙箱里追加教学——"流程改版，旧作废"，
    // 探针考的是召回出【现行】流程还是被旧记忆带偏（L1 去重更新的操作化度量）。
    let changeRun = null;
    let changeChecks = [];
    if (change) {
      progressPatch({ phase: 'change' });
      changeRun = await driveScriptedSession(ctx, opts.selection, `${sc.id}-change`, change.messages, {
        cwd: sandbox,
        reteach: change.reteach ?? probe.reteach,
        maxExchanges: change.maxExchanges ?? 2,
      });
      changeChecks = runChecks(sc.changeChecks);
      progressEvent(`改版段检查 ${changeChecks.filter((c) => c.ok).length}/${changeChecks.length}`);
    }
    // 探针前重置沙箱到原始状态：抹掉教学产物，防止 B 组从文件系统"考古"工作流
    //（否则 B 组照抄上一次的产物格式即可，记忆对照失效）。
    resetSandbox();
    progressPatch({ phase: 'distill' });
    const distill = opts.arm === 'A'
      ? await waitForDistillation(opts.dataDir, Number(process.env.DSH_BENCH_DISTILL_TIMEOUT_MS) || 120_000)
      : { skipped: true };
    if (!distill.skipped) progressEvent(`蒸馏等待 ${(distill.waitedMs / 1000).toFixed(0)}s（records ${distill.recordLines} 行${distill.timedOut ? '，超时' : ''}）`);
    progressPatch({ phase: 'probe' });
    const probeRun = await driveScriptedSession(ctx, opts.selection, `${sc.id}-probe`, probe.messages, {
      cwd: sandbox,
      reteach: probe.reteach,
      maxExchanges: probe.maxExchanges ?? 2,
      markers: opts.markers,
      scenarioId: sc.id,
    });
    const probeChecks = runChecks(sc.probeChecks);
    progressEvent(`探针段检查 ${probeChecks.filter((c) => c.ok).length}/${probeChecks.length}`);
    // 越界读取记忆库（严格档）→ 该场景判负：权限模型只限写不限读，这是唯一硬防线；
    // 判负逐条写明原因，完成度如实下降而非静默标记。
    const snoopViolation = [teachRun, changeRun, probeRun]
      .some((r) => r?.toolAudit?.snoopViolation === true);
    const allChecks = ([
      ...teachChecks.map((c) => ({ phase: 'teach', ...c })),
      ...changeChecks.map((c) => ({ phase: 'change', ...c })),
      ...probeChecks.map((c) => ({ phase: 'probe', ...c })),
    ]).map((c) => (snoopViolation && c.ok ? { ...c, ok: false, detail: '越界读取记忆库（snoopViolation），该场景判负' } : c));
    if (snoopViolation) console.warn(`    [${sc.id}] ⚠ snoopViolation：检测到越界读取记忆库，本场景全部检查判负`);
    return {
      id: sc.id,
      family: sc.family,
      kind: 'workflow',
      teach: teachRun,
      change: changeRun ? { metrics: changeRun.metrics, skipped: false } : { metrics: null, skipped: true },
      distill,
      probes: [],
      contamination: probeRun.contamination ?? [],
      workflow: {
        probe: { asks: probeRun.asks, toolAudit: probeRun.toolAudit },
        change: changeRun ? { asks: changeRun.asks, toolAudit: changeRun.toolAudit } : null,
        teachToolAudit: teachRun.toolAudit,
        snoopViolation,
        checks: allChecks,
        checksPassed: allChecks.filter((c) => c.ok).length,
        checksTotal: allChecks.length,
      },
      probeMetrics: probeRun.metrics,
      // 效率三角：教学/变更/探针会话的轮次延迟/消息计数合计
      latency: sumLatency([teachRun?.latency, changeRun?.latency, probeRun.latency]),
      messages: {
        user: (teachRun?.messages?.user ?? 0) + (changeRun?.messages?.user ?? 0) + (probeRun.messages?.user ?? 0),
        assistant: (teachRun?.messages?.assistant ?? 0) + (changeRun?.messages?.assistant ?? 0) + (probeRun.messages?.assistant ?? 0),
      },
    };
  } finally {
    site?.server.close();
  }
}

/** 事件折叠：轮次/步骤/输入与输出 token（供应商上报）/工具调用与失败/墙钟耗时/轮次错误原因。 */
function foldMetrics(events) {
  let turns = 0, steps = 0, toolCalls = 0, toolErrors = 0;
  let inputTokens = 0, cacheReadTokens = 0, outputTokens = 0, reasoningTokens = 0;
  let firstTime = null, lastTime = null;
  const turnErrors = [];
  const requestUsages = []; // 每请求 [未命中输入, 缓存命中]（首请求天然 miss 单列，见 steadyCacheRate）
  for (const e of events) {
    if (typeof e.time === 'number') {
      if (firstTime === null || e.time < firstTime) firstTime = e.time;
      if (lastTime === null || e.time > lastTime) lastTime = e.time;
    }
    switch (e.type) {
      case 'turn/end': {
        turns++;
        const reason = e.data?.reason;
        if (reason && reason.kind !== 'completed') {
          const err = reason.error ?? reason;
          turnErrors.push(`${reason.kind}${err?.code ? `/${err.code}` : ''}${err?.message ? `: ${String(err.message).slice(0, 120)}` : ''}`);
        }
        break;
      }
      case 'step/end': steps++; break;
      case 'assistant/message': {
        const u = e.data?.usage;
        if (u) {
          // harness TokenUsage 约定：inputTokens 为非缓存输入（disjoint），cacheReadTokens 单列
          const inTok = typeof u.inputTokens === 'number' ? u.inputTokens : 0;
          const cache = typeof u.cacheReadTokens === 'number' ? u.cacheReadTokens : 0;
          inputTokens += inTok;
          cacheReadTokens += cache;
          if (typeof u.outputTokens === 'number') outputTokens += u.outputTokens;
          if (typeof u.reasoningTokens === 'number') reasoningTokens += u.reasoningTokens;
          requestUsages.push([inTok, cache]);
        }
        break;
      }
      case 'tool/call': toolCalls++; break;
      case 'tool/result': if (toolResultFailed(e.data)) toolErrors++; break;
    }
  }
  // 稳态缓存率：剔除首请求（新会话首问的 system/指令前缀天然未命中，不代表引擎健康度）
  const steady = requestUsages.slice(1);
  const steadyIn = steady.reduce((a, [i]) => a + i, 0);
  const steadyCache = steady.reduce((a, [, c]) => a + c, 0);
  return {
    turns,
    steps,
    inputTokens,
    cacheReadTokens,
    outputTokens,
    reasoningTokens,
    toolCalls,
    toolErrors,
    turnErrors,
    firstRequestMiss: requestUsages.length ? requestUsages[0][0] + requestUsages[0][1] : 0,
    steadyCacheRate: steadyIn + steadyCache > 0 ? steadyCache / (steadyIn + steadyCache) : null,
    wallMs: firstTime !== null && lastTime !== null ? lastTime - firstTime : 0,
  };
}

function toolResultFailed(data) {
  if (!data || typeof data !== 'object') return false;
  return data.isError === true || data.error !== undefined || data.ok === false;
}

/** 该轮事件里的召回注入文本（form === 'recall' 的 user 消息拼接）。 */
function recallInjectionText(events) {
  let text = '';
  for (const e of events) {
    if (e.type === 'user/message' && e.data?.source?.form === 'recall') {
      text += (e.data.content ?? []).map((b) => b.text ?? '').join('');
    }
  }
  return text;
}

/** 注入文本里的记忆行内容（剥掉 `- [type|scene]` 前缀，预算截断后原样保留）。 */
function recallInjectionLines(text) {
  if (!text) return [];
  return String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- ['))
    .map((l) => l.replace(/^- \[[^\]]*\]\s?/, ''));
}

/** gold 要点是否出现在注入文本里（要点按标点拆词，全词命中算该要点覆盖）。 */
function goldInText(gold, text) {
  if (!text) return false;
  return gold.some((item) => {
    const ts = String(item).split(/[\s（）()、，,。；;：:/「」【】\[\]——\-!?？！]+/).filter((t) => t.length >= 2);
    return ts.length === 0 ? text.includes(item) : ts.every((t) => text.includes(t));
  });
}

function lastAssistantText(events) {
  let text = '';
  for (const e of events) {
    if (e.type === 'assistant/message') {
      const joined = (e.data?.message?.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (joined !== '') text = joined;
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// 蒸馏等待（A 组）
// ---------------------------------------------------------------------------

/**
 * 轮询 dataDir/records/*.jsonl 行数：连续两轮无增长即视为蒸馏落袋。
 * 超时不中断——探针照跑，结果标记 timedOut 供报告降级说明。
 */
async function waitForDistillation(dataDir, timeoutMs) {
  const recordsDir = path.join(path.resolve(dataDir), 'records');
  const started = Date.now();
  let last = -1, stable = 0;
  while (Date.now() - started < timeoutMs) {
    await sleep(POLL_MS);
    progressPatch({ distillWaitedMs: Date.now() - started });
    const count = countRecordLines(recordsDir);
    if (count > last) {
      last = count;
      stable = 0;
    } else {
      stable++;
      if (stable >= 2 && last > 0) {
        return { waitedMs: Date.now() - started, recordLines: last, timedOut: false };
      }
    }
  }
  return { waitedMs: Date.now() - started, recordLines: Math.max(last, 0), timedOut: true };
}

function countRecordLines(recordsDir) {
  let n = 0;
  try {
    for (const f of fs.readdirSync(recordsDir)) {
      if (!f.endsWith('.jsonl') || !SAFE_NAME.test(f)) continue;
      const text = readFileInDir(recordsDir, f);
      n += text.split('\n').filter((l) => l.trim() !== '').length;
    }
  } catch { /* 目录尚不存在 = 0 行 */ }
  return n;
}

// ---------------------------------------------------------------------------
// 判分
// ---------------------------------------------------------------------------

async function judgeProbe(ctx, judge, p, answer) {
  if (!answer || answer.trim() === '') return { score: 0, reason: '空回答' };
  const text = answer.trim();

  if (p.judge === 'contains-all') {
    const gold = p.gold ?? [];
    const stale = p.stale ?? [];
    if (gold.length === 0) return { score: 0, reason: 'fixture 缺 gold 关键词' };
    if (!gold.every((k) => text.includes(k))) return { score: 0, reason: 'gold 关键词未全命中' };
    if (stale.some((k) => text.includes(k))) return { score: 0, reason: '命中已作废的旧信息（更新失败）' };
    return { score: 1, reason: 'gold 全中' };
  }
  if (p.judge === 'abstain-llm') {
    const out = await askJudge(ctx, judge,
      '你是基准测试判卷员。下面的问题问的是一件【从未发生过】的事，考生正确的表现是明确否认或表示不确定（如「没有这回事」「你没说过」）。只要考生给出任何具体内容（名字、日期、细节等），一律判 FAIL。只输出一行：PASS 或 FAIL 开头，可跟简短理由。',
      `【问题】${p.q}\n【考生回答】${text}`);
    return parseVerdict(out);
  }
  // judge === 'llm'：判卷模型按要点判定（要点须全覆盖；stale 命中即失败）。
  const goldList = (p.gold ?? []).map((g, i) => `${i + 1}. ${g}`).join('\n');
  const staleNote = (p.stale ?? []).length > 0 ? `\n【已作废信息】回答若包含以下任何内容判 FAIL：${p.stale.join('；')}` : '';
  const out = await askJudge(ctx, judge,
    '你是基准测试判卷员。判断【考生回答】是否正确覆盖了【标准答案要点】的全部条目；同义表述算覆盖，含糊其辞、答非所问、编造判 FAIL。只输出一行：PASS 或 FAIL 开头，可跟简短理由。',
    `【标准答案要点】\n${goldList}${staleNote}\n【考生回答】${text}`);
  return parseVerdict(out);
}

function parseVerdict(out) {
  const head = (out || '').trim().toUpperCase();
  if (head.startsWith('PASS')) return { score: 1, reason: '判卷 PASS' };
  if (head.startsWith('FAIL')) return { score: 0, reason: '判卷 FAIL' };
  return { score: 0, reason: `判卷输出不可解析：${(out || '').slice(0, 60)}` };
}

/** 直接调 ctx.llm 判卷：流式收集 block-end 文本（与插件 callLLM 同款口径）。网关抖动时空输出重试一次。 */
async function askJudge(ctx, judge, system, userText) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let out = '';
    try {
      const stream = ctx.llm.stream({
        provider: judge.provider,
        model: judge.model,
        ...(judge.reasoningEffort ? { reasoningEffort: judge.reasoningEffort } : {}),
        system,
        messages: [userMessage(userText)],
        maxTokens: 1024,
        purpose: 'bench-judge',
      });
      let blockText = '';
      let deltaText = '';
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') deltaText += chunk.text;
        else if (chunk.type === 'block-end' && chunk.block.type === 'text') blockText += chunk.block.text;
      }
      out = (blockText || deltaText).trim();
    } catch (err) {
      if (attempt === 2) throw err;
      continue;
    }
    if (out !== '') return out;
    console.log('    [judge] 空输出，重试一次');
  }
  return '';
}

// ---------------------------------------------------------------------------
// 实时进度输出（progress.json → 面板数据源）
// ---------------------------------------------------------------------------
// 设计约束：
//   - 写在 DSH_BENCH_OUT（rep-N/）里，不在沙箱内——被测 Agent 读不到，不影响指标；
//   - tmp+rename 原子写 + ≥1s 节流（事件驱动但补一个 trailing 定时器，防末事件被节流吞掉）；
//   - 5s 心跳 interval 只更新 heartbeatAt——面板据此区分"模型慢"（心跳在、活动旧）
//     与"进程挂了"（心跳停）；
//   - 任何写失败静默忽略：进度是观测面，绝不影响基准本身。

let progress = null;
let progressFile = '';
let progressLastWrite = 0;
let progressTimer = null;
let progressHeartbeatTimer = null;

function progressInit(outDir, arm, scenarioIds) {
  progressFile = path.join(outDir, 'progress.json');
  progress = {
    version: 1,
    arm,
    startedAt: new Date().toISOString(),
    updatedAt: '',
    heartbeatAt: '',
    scenarios: scenarioIds,
    scenarioIndex: -1,
    scenarioId: '',
    phase: 'init',
    message: null,          // {label, i, n, turns, steps, inputTokens, outputTokens, toolCalls}
    distillWaitedMs: null,
    probeDone: 0,
    probeTotal: 0,
    completed: [],          // {id, passed, total, durationMs}
    totals: { inputTokens: 0, outputTokens: 0, toolCalls: 0, turns: 0, asks: 0 },
    events: [],             // 环形，最近 24 条 {t, msg}
  };
  progressHeartbeatTimer = setInterval(() => {
    if (!progress) return;
    progress.heartbeatAt = new Date().toISOString();
    progressWrite(true);
  }, 5000);
  progressWrite(true);
}

function progressPatch(patch) {
  if (!progress) return;
  Object.assign(progress, patch);
  progressWrite();
}

function progressEvent(msg) {
  if (!progress) return;
  progress.events.push({ t: new Date().toISOString(), msg: String(msg).slice(0, 200) });
  if (progress.events.length > 24) progress.events.splice(0, progress.events.length - 24);
  progressWrite();
}

/** 会话内消息粒度：label 剧本会话名，i/n 当前第几条，m 为该会话至今的折叠指标。 */
function progressLive(label, i, n, m) {
  if (!progress) return;
  progress.message = {
    label,
    i,
    n,
    turns: m?.turns ?? 0,
    steps: m?.steps ?? 0,
    inputTokens: m?.inputTokens ?? 0,
    outputTokens: m?.outputTokens ?? 0,
    toolCalls: m?.toolCalls ?? 0,
  };
  progressWrite();
}

function progressWrite(force = false) {
  if (!progress) return;
  const now = Date.now();
  if (!force && now - progressLastWrite < 1000) {
    if (!progressTimer) {
      progressTimer = setTimeout(() => {
        progressTimer = null;
        progressWrite(true);
      }, 1050 - (now - progressLastWrite));
    }
    return;
  }
  progressLastWrite = now;
  progress.updatedAt = new Date().toISOString();
  const tmp = `${progressFile}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(progress) + '\n', 'utf8');
    fs.renameSync(tmp, progressFile);
  } catch { /* 进度写失败不影响基准 */ }
}

function progressFinish() {
  if (!progress) return;
  if (progressHeartbeatTimer) clearInterval(progressHeartbeatTimer);
  if (progressTimer) { clearTimeout(progressTimer); progressTimer = null; }
  if (progress.phase !== 'error') progress.phase = 'done';
  progress.message = null;
  progressWrite(true);
}

function progressFail(err) {
  if (!progress) return;
  progress.phase = 'error';
  progress.error = String(err?.message ?? err).slice(0, 300);
  progressEvent(`✗ 运行失败：${progress.error}`);
  progressFinish();
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}`);
  return v;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
