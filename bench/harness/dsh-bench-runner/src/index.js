// dsh-bench-runner — DSH-MemBench 自动化基准驱动器。
//
// 装入专用 bench profile（dsh-base + dsh-layered-memory + 本包），apply 即开始执行：
//   逐场景 → 教学会话 → 变更会话 →（A 组）轮询蒸馏落袋 → 探针会话逐题提问 →
//   判分（contains-all 程序判 / llm·abstain 判卷模型）→ 逐场景落盘 result.json。
// 全部旋钮来自环境变量，不依赖 Web/HTTP/client 服务：
//   DSH_BENCH_SCENARIOS     场景库目录（*.json）       必填
//   DSH_BENCH_ARM           A（记忆开）| B（记忆关）     必填
//   DSH_BENCH_OUT           结果输出目录                必填
//   DSH_BENCH_DATA_DIR      本次运行的记忆数据目录       A 组必填（与 patch 的 dataDir 一致）
//   DSH_BENCH_PLUGIN_VERSION 被测插件版本（结果头记录用） 可选
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

export const name = 'dsh-bench-runner';
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'llm'];
export const Config = z.object({});

const POLL_MS = 5000;
/** 文件名白名单：仅字母数字点下划线连字符，杜绝任何路径片段。 */
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export function apply(ctx) {
  run(ctx).then(
    (code) => exit(ctx, code),
    (err) => {
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
  const fallback = ctx.get('agentDefaultModel').currentSelection();
  const selection = {
    provider: process.env.DSH_BENCH_PROVIDER || fallback.provider,
    model: process.env.DSH_BENCH_MODEL || fallback.model,
  };
  const judge = {
    provider: process.env.DSH_BENCH_JUDGE_PROVIDER || selection.provider,
    model: process.env.DSH_BENCH_JUDGE_MODEL || selection.model,
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
      judgeProvider: judge.provider,
      judgeModel: judge.model,
      pluginVersion: process.env.DSH_BENCH_PLUGIN_VERSION || '',
      scenarioFiles: files,
    },
    scenarios: [],
  };
  console.log(`[bench-runner] ${arm} 组启动：${files.length} 个场景，模型 ${selection.provider}/${selection.model}，判卷 ${judge.provider}/${judge.model}`);

  const markers = new Map(); // marker -> 场景 id，跨场景污染检测用
  for (const file of files) {
    const scenario = JSON.parse(fs.readFileSync(safeJoin(scenariosDir, file), 'utf8'));
    if (scenario.marker) markers.set(scenario.marker, scenario.id);
  }

  for (const file of files) {
    const scenario = JSON.parse(fs.readFileSync(safeJoin(scenariosDir, file), 'utf8'));
    const t0 = Date.now();
    const r = await runScenario(ctx, scenario, { arm, selection, judge, dataDir, outDir, workspace, markers });
    r.file = file;
    r.durationMs = Date.now() - t0;
    result.scenarios.push(r);
    writeJson(path.join(outDir, 'result.json'), result); // 逐场景落盘，中断不丢已完成部分
    const hit = r.probes.filter((p) => p.score === 1).length;
    console.log(`[bench-runner] 场景完成 ${scenario.id}：探针 ${hit}/${r.probes.length}，耗时 ${(r.durationMs / 1000).toFixed(0)}s`);
  }
  result.finishedAt = new Date().toISOString();
  writeJson(path.join(outDir, 'result.json'), result);
  return 0;
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

/** 拼接并校验相对路径不越出 base 目录：逐段白名单（段内仅字母数字点下划线连字符）。 */
function safeJoin(base, rel) {
  const root = path.resolve(base);
  const segs = String(rel).split(/[\\/]+/).filter((s) => s !== '');
  if (segs.length === 0 || segs.some((s) => !SAFE_NAME.test(s))) {
    throw new Error(`非法相对路径：${rel}`);
  }
  const full = path.resolve(root, ...segs);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`路径越界：${rel}`);
  }
  return full;
}

// ---------------------------------------------------------------------------
// 场景执行
// ---------------------------------------------------------------------------

async function runScenario(ctx, sc, opts) {
  if (sc.kind === 'workflow') return runWorkflowScenario(ctx, sc, opts);
  return runDialogScenario(ctx, sc, opts);
}

/** 纯对话赛道（默认）：教学 → 变更 → 蒸馏等待 → 探针判分。 */
async function runDialogScenario(ctx, sc, opts) {
  const teachSession = sc.sessions.find((s) => s.kind === 'teach');
  const changeSession = sc.sessions.find((s) => s.kind === 'change');
  if (!teachSession || !changeSession) throw new Error(`场景 ${sc.id} 缺少 teach 或 change 会话`);

  const teach = await driveScriptedSession(ctx, opts.selection, `${sc.id}-teach`, teachSession.messages, { cwd: opts.workspace });
  const change = await driveScriptedSession(ctx, opts.selection, `${sc.id}-change`, changeSession.messages, { cwd: opts.workspace });

  // A 组等蒸馏落袋（records/ 行数稳定）；B 组插件整体禁用，无蒸馏可等。
  // 记忆生命周期：一个 rep 的 dataDir 从第一次蒸馏起全程保留、跨场景累积，rep 结束才废弃
  // ——后续场景的探针因此会被前面场景的记忆干扰，抗干扰能力经 contamination 指标量化。
  const distill = opts.arm === 'A'
    ? await waitForDistillation(opts.dataDir, Number(process.env.DSH_BENCH_DISTILL_TIMEOUT_MS) || 120_000)
    : { skipped: true };

  const probe = await runProbeSession(ctx, sc, opts);

  return {
    id: sc.id,
    family: sc.family,
    teach: teach,
    change: change,
    distill,
    probes: probe.probes,
    probeMetrics: probe.metrics,
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
    const firstSeq = agent.session.seq;
    let asks = 0;
    for (let i = 0; i < messages.length; i++) {
      agent.followup(userMessage(messages[i]));
      await agent.whenIdle();
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
          agent.followup(userMessage(options.reteach));
          await agent.whenIdle();
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
    };
  } finally {
    try { dispose?.(); } catch { /* 拆除失败不影响结果落盘 */ }
  }
}

/** 求助检测：问号结尾、ask 类工具，或索取凭据/信息/约定的典型措辞。 */
function looksLikeAsk(text) {
  const t = String(text || '');
  if (/[？?]\s*$/.test(t.trimEnd())) return true;
  return /(请|麻烦|能否|能不能|可以)?\s*(提供|告诉|告知|给我|发我|补充|说明)[^。！？!]{0,24}(账号|密码|凭据|用户名|口令|令牌|密钥|信息|约定|规矩|流程|方式|方法)|(账号|密码|凭据|用户名|口令)(是(什么|多少))|我(需要|缺少|没有)[^。！？!]{0,16}(账号|密码|凭据|信息|约定)|(无法|不能|没能)[^。！？!]{0,20}(因为|由于|没有|缺少|不知道)/.test(t);
}

function hasAskTool(events, sinceSeq) {
  return events.some((e) => e.seq > sinceSeq && e.type === 'tool/call' && /ask/i.test(String(e.data?.name ?? '')));
}

/** 任务完成的粗判：末条消息含明确交付物指向（文件/完成措辞）时不按反问处理。 */
function taskSeemsDone(text) {
  return /(已完成|已生成|已写入|搞定|done)/i.test(text || '');
}

/** 工具调用审计：记录 name + 参数摘要，标记疑似翻越沙箱（.dsh/memory 等）。 */
function collectToolAudit(events) {
  const audit = [];
  for (const e of events) {
    if (e.type !== 'tool/call') continue;
    const name = String(e.data?.name ?? '');
    const args = String(e.data?.arguments ?? e.data?.input ?? '');
    audit.push({ name, args: args.slice(0, 120) });
  }
  const snoopSuspect = audit.some((a) => /(\.dsh|memory\.db|\.memory)/i.test(a.args));
  return audit.length > 40 ? { calls: audit.slice(0, 40), truncated: true, snoopSuspect } : { calls: audit, truncated: false, snoopSuspect };
}

/** 探针会话：新会话逐题提问，逐题取末条 assistant 文本并判分；顺带检测召回注入的跨场景污染。 */
async function runProbeSession(ctx, sc, opts) {
  const { agent, dispose } = await createAgent(ctx, opts.selection, `${sc.id}-probe`, opts.workspace);
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
        },
        usedMemoryTool: events.some((e) => e.type === 'tool/call' && /memory|conversation/i.test(String(e.data?.name ?? ''))),
      });
      console.log(`  [${sc.id}·${p.type}] score=${judged.score} ${judged.reason ?? ''}`);
    }
    const contamination = detectContamination(agent.session.events, sc, opts.markers);
    await ctx.get('sessions').flush(agent.session);
    return {
      probes,
      metrics: foldMetrics(agent.session.events.filter((e) => e.seq >= firstSeq)),
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
  const runChecks = (list) => (list ?? []).map((c) => {
    let ok = false, detail = '';
    try {
      const file = safeJoin(sandbox, c.file);
      const text = fs.readFileSync(file, 'utf8');
      const missing = (c.contains ?? []).filter((k) => !text.includes(k));
      ok = missing.length === 0;
      detail = ok ? '命中' : `缺关键词：${missing.join('、')}`;
    } catch {
      detail = '产物文件不存在';
    }
    return { file: c.file, ok, detail };
  });
  const teach = sc.sessions.find((s) => s.kind === 'teach');
  const probe = sc.sessions.find((s) => s.kind === 'probe');
  if (!teach || !probe) throw new Error(`工作流场景 ${sc.id} 缺 teach 或 probe 会话`);

  try {
    resetSandbox();
    const teachRun = await driveScriptedSession(ctx, opts.selection, `${sc.id}-teach`, teach.messages, {
      cwd: sandbox,
      reteach: teach.reteach ?? probe.reteach,
      maxExchanges: 2,
    });
    const teachChecks = runChecks(sc.teachChecks);
    // 探针前重置沙箱到原始状态：抹掉教学产物，防止 B 组从文件系统"考古"工作流
    //（否则 B 组照抄上一次的产物格式即可，记忆对照失效）。
    resetSandbox();
    const distill = opts.arm === 'A'
      ? await waitForDistillation(opts.dataDir, Number(process.env.DSH_BENCH_DISTILL_TIMEOUT_MS) || 120_000)
      : { skipped: true };
    const probeRun = await driveScriptedSession(ctx, opts.selection, `${sc.id}-probe`, probe.messages, {
      cwd: sandbox,
      reteach: probe.reteach,
      maxExchanges: probe.maxExchanges ?? 2,
    });
    const probeChecks = runChecks(sc.probeChecks);
    const allChecks = [...teachChecks.map((c) => ({ phase: 'teach', ...c })), ...probeChecks.map((c) => ({ phase: 'probe', ...c }))];
    return {
      id: sc.id,
      family: sc.family,
      kind: 'workflow',
      teach: teachRun,
      change: { metrics: null, skipped: true },
      distill,
      probes: [],
      workflow: {
        probe: { asks: probeRun.asks, toolAudit: probeRun.toolAudit },
        teachToolAudit: teachRun.toolAudit,
        checks: allChecks,
        checksPassed: allChecks.filter((c) => c.ok).length,
        checksTotal: allChecks.length,
      },
      probeMetrics: probeRun.metrics,
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
