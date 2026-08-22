// DSH-MemBench 实时进度面板。
//
// 用法：node bench/harness/panel.mjs [--root <results目录>] [--port <n>] [--no-open]
//   run.mjs 会在跑基准时自动拉起本面板并打开浏览器（--no-panel 关闭该行为）；
//   也可手动运行盯着历史/进行中的运行。
//
// 数据源（全部只读，绝不影响运行中的基准）：
//   <root>/run-*/plan.json       run.mjs 启动时写入（arm/repeats/场景清单/模型）
//   <root>/run-*/rep-N/progress.json   bench-runner 增量写（阶段/消息粒度/累计/心跳）
// 安全：只绑 127.0.0.1；只服务内联 HTML 与 /api/state 两个路由，不读其它文件。

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const root = path.resolve(String(arg('root', path.join(repoRoot, 'bench', 'results'))));
const wantPort = Math.max(1024, Number(arg('port', 4173)) || 4173);
const noOpen = arg('no-open', false) === true || process.env.DSH_BENCH_PANEL_NO_OPEN === '1';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null; // 不存在 / 写一半（原子写窗口）/ 损坏 → 当作无数据
  }
}

// ---------------------------------------------------------------------------
// 状态聚合：results 目录 → 按时间戳分组的运行，每组 A/B 两臂
// ---------------------------------------------------------------------------

function buildState() {
  const now = new Date().toISOString();
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith('run-'));
  } catch { /* root 尚不存在：空面板 */ }
  const groups = new Map();
  for (const ent of entries) {
    const dir = path.join(root, ent.name);
    const plan = readJson(path.join(dir, 'plan.json'));
    if (!plan || !plan.arm) continue; // 旧版运行无 plan：面板只认新版 harness
    const reps = [];
    for (let i = 1; i <= (plan.repeats ?? 1); i++) {
      reps.push({ rep: i, progress: readJson(path.join(dir, `rep-${i}`, 'progress.json')) });
    }
    const stamp = plan.stamp || ent.name.split('-').pop();
    if (!groups.has(stamp)) {
      groups.set(stamp, {
        stamp,
        startedAt: plan.startedAt || '',
        track: plan.track || '',
        model: plan.model || '',
        judgeModel: plan.judgeModel || '',
        pluginVersion: plan.pluginVersion || '',
        arms: [],
      });
    }
    groups.get(stamp).arms.push(analyzeArm(ent.name, plan, reps));
  }
  const list = [...groups.values()]
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .map((g) => ({ ...g, arms: g.arms.sort((a, b) => a.arm.localeCompare(b.arm)) }));
  return { now, root, groups: list.slice(0, 4) };
}

/** 单臂分析：活跃 rep、阶段、心跳/活动新鲜度、跨 rep 累计（服务端算好，客户端只渲染）。 */
function analyzeArm(dirName, plan, reps) {
  const now = Date.now();
  let activeRep = null;
  let doneReps = 0;
  let errorReps = 0;
  for (const r of reps) {
    const ph = r.progress?.phase;
    if (!r.progress) continue;
    if (ph === 'done') doneReps++;
    else if (ph === 'error') errorReps++;
    else if (activeRep === null) activeRep = r.rep;
  }
  const allDone = doneReps + errorReps === reps.length;
  const active = activeRep !== null ? reps.find((r) => r.rep === activeRep) : null;
  const ap = active?.progress ?? null;
  const hbAgeMs = ap?.heartbeatAt ? now - Date.parse(ap.heartbeatAt) : null;
  const activityAgeMs = ap?.updatedAt ? now - Date.parse(ap.updatedAt) : null;

  const totals = { inputTokens: 0, outputTokens: 0, toolCalls: 0, turns: 0, asks: 0 };
  let doneScenarios = 0;
  let passed = 0;
  let total = 0;
  for (const r of reps) {
    const p = r.progress;
    if (!p) continue;
    doneScenarios += (p.completed?.length) || 0;
    for (const c of p.completed || []) {
      passed += c.passed ?? 0;
      total += c.total ?? 0;
    }
    for (const k of Object.keys(totals)) totals[k] += p.totals?.[k] ?? 0;
  }
  const scenarioCount = plan.scenarioCount ?? (plan.scenarios?.length) ?? 0;
  return {
    dir: dirName,
    arm: plan.arm,
    repeats: reps.length,
    scenarioCount,
    scenarios: plan.scenarios ?? [],
    reps,
    activeRep,
    armPhase: errorReps > 0 ? 'error' : allDone ? 'done' : activeRep === null ? 'waiting-next' : 'running',
    heartbeatAgeMs: hbAgeMs,
    activityAgeMs,
    distillTimeoutMs: plan.distillTimeoutMs ?? 120000,
    overall: { doneScenarios, totalScenarios: reps.length * scenarioCount, passed, total },
    totals,
  };
}

// ---------------------------------------------------------------------------
// HTTP：内联 HTML + /api/state
// ---------------------------------------------------------------------------

const HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH-MemBench 实时进度</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px 24px 40px; background: #0e1117; color: #d7dde6;
         font: 14px/1.55 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; }
  header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
  h1 { font-size: 17px; margin: 0; letter-spacing: .3px; }
  #conn { font-size: 12px; color: #7d8590; }
  #conn.bad { color: #f85149; }
  .group { margin: 0 0 26px; }
  .group-head { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap;
                padding: 8px 12px; background: #161b22; border: 1px solid #21262d; border-radius: 8px 8px 0 0;
                font-size: 12.5px; color: #9aa4b2; }
  .group-head b { color: #d7dde6; font-size: 13.5px; }
  .arms { display: grid; grid-template-columns: repeat(auto-fit, minmax(430px, 1fr)); gap: 0;
          border: 1px solid #21262d; border-top: 0; border-radius: 0 0 8px 8px; overflow: hidden; }
  .card { padding: 14px 16px 16px; border-right: 1px solid #21262d; background: #11151c; }
  .card:last-child { border-right: 0; }
  .card-title { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .arm-chip { font-weight: 600; font-size: 14px; padding: 2px 10px; border-radius: 999px; }
  .arm-A .arm-chip { background: #12325e; color: #8ab4f8; }
  .arm-B .arm-chip { background: #3a2a12; color: #e3b341; }
  .phase { font-size: 12px; padding: 2px 9px; border-radius: 999px; background: #21262d; color: #c9d1d9; white-space: nowrap; }
  .phase.run { background: #0d2b1a; color: #4ec98a; }
  .phase.warn { background: #33230b; color: #e3b341; }
  .phase.err { background: #3d1114; color: #f85149; }
  .rep-tag { margin-left: auto; font-size: 12px; color: #9aa4b2; }
  .bar { height: 7px; border-radius: 4px; background: #21262d; overflow: hidden; margin: 6px 0 4px; }
  .bar > i { display: block; height: 100%; background: #2f81f7; transition: width .6s ease; }
  .arm-B .bar > i { background: #bb8009; }
  .bar-line { display: flex; justify-content: space-between; font-size: 12px; color: #9aa4b2; }
  .fresh { display: flex; gap: 16px; flex-wrap: wrap; margin: 10px 0 4px; font-size: 12.5px; }
  .fresh .ok { color: #4ec98a; } .fresh .warn { color: #e3b341; } .fresh .bad { color: #f85149; }
  .now-line { margin: 4px 0 2px; font-size: 13px; color: #d7dde6; }
  .now-line .dim { color: #7d8590; font-size: 12px; }
  .stats { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 12px; }
  .stat { font-size: 12px; background: #161b22; border: 1px solid #21262d; border-radius: 6px;
          padding: 3px 9px; color: #b6c2cf; }
  .stat b { color: #e6edf3; font-weight: 600; }
  .scen { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0 12px; }
  .sc { font-size: 11.5px; border-radius: 5px; padding: 2px 7px; background: #161b22;
        border: 1px solid #21262d; color: #7d8590; }
  .sc.done { color: #4ec98a; border-color: #12362a; }
  .sc.cur { color: #8ab4f8; border-color: #1f4a7d; }
  .sc.bad { color: #f85149; }
  .ev { margin: 0; padding: 8px 10px; background: #0b0e14; border: 1px solid #21262d; border-radius: 6px;
        font: 11.5px/1.7 ui-monospace, Consolas, monospace; color: #8b949e; max-height: 150px; overflow: auto; }
  .ev time { color: #566070; margin-right: 8px; }
  .ev .err { color: #f85149; }
  .empty { color: #7d8590; padding: 30px; text-align: center; }
  footer { margin-top: 8px; font-size: 11.5px; color: #566070; }
</style>
</head>
<body>
<header><h1>DSH-MemBench 实时进度</h1><span id="conn"></span></header>
<div id="app"><div class="empty">加载中…</div></div>
<footer>面板进程随基准运行存活（run.mjs 退出时自动关闭）；服务器关闭后本页停止刷新。手动启动：node bench/harness/panel.mjs</footer>
<script>
'use strict';
var PHASES = {
  init:    ['启动', ''],
  teach:   ['教学', 'run'],
  change:  ['改版', 'run'],
  distill: ['蒸馏等待', 'warn'],
  probe:   ['探针', 'run'],
  judge:   ['判分', 'warn'],
  done:    ['完成', 'run'],
  error:   ['错误', 'err']
};
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmtTok(n) {
  n = Number(n) || 0;
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0) + 'k';
  return (n / 1e6).toFixed(2) + 'M';
}
function fmtAge(ms) {
  if (ms == null || !isFinite(ms)) return '—';
  var s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return s + 's';
  if (s < 5400) return Math.round(s / 60) + 'min';
  return (s / 3600).toFixed(1) + 'h';
}
function fmtClock(iso) {
  if (!iso) return '';
  try { return new Date(iso).toTimeString().slice(0, 8); } catch (e) { return ''; }
}
function renderArm(a) {
  var ap = a.activeRep !== null ? a.reps[a.activeRep - 1].progress : null;
  var phaseKey = ap ? ap.phase : (a.armPhase === 'error' ? 'error' : a.armPhase === 'waiting-next' ? 'init' : 'done');
  var ph = PHASES[phaseKey] || [phaseKey, ''];
  var repTag = a.activeRep !== null
    ? 'rep ' + a.activeRep + '/' + a.repeats
    : (a.armPhase === 'done' ? a.repeats + '/' + a.repeats + ' rep 全部结束' : '等待下一轮启动…');
  // 新鲜度：心跳停 → 红（进程退出/崩溃）；心跳在但长时间无新事件 → 黄（模型长回复或卡住）
  var fresh = '';
  if (a.armPhase === 'running' && ap) {
    var hbBad = a.heartbeatAgeMs != null && a.heartbeatAgeMs > 30000;
    var slow = a.activityAgeMs != null && a.activityAgeMs > 300000;
    fresh += '<span class="' + (hbBad ? 'bad' : 'ok') + '">心跳 ' + fmtAge(a.heartbeatAgeMs) + ' 前</span>';
    fresh += '<span class="' + (hbBad ? 'bad' : slow ? 'warn' : 'ok') + '">活动 ' + fmtAge(a.activityAgeMs) + ' 前</span>';
    if (hbBad) fresh += '<span class="bad">⚠ 心跳停止——进程退出或崩溃</span>';
    else if (slow) fresh += '<span class="warn">⚠ 长时间无新事件（长回复或疑似卡住）</span>';
  } else if (a.armPhase === 'waiting-next') {
    fresh += '<span class="warn">上一轮已结束，下一轮尚未启动</span>';
  }
  // 当前场景行
  var nowLine = '';
  if (ap && ap.scenarioId) {
    nowLine += '<div class="now-line">' + esc(ap.scenarioId);
    if (ap.message) {
      nowLine += ' <span class="dim">' + esc(ap.message.label) + ' · 消息 ' + ap.message.i + '/' + ap.message.n +
        ' · 输入 ' + fmtTok(ap.message.inputTokens) + ' · 工具 ' + ap.message.toolCalls + '</span>';
    }
    if (ap.phase === 'distill' && ap.distillWaitedMs != null) {
      nowLine += ' <span class="dim">已等 ' + Math.round(ap.distillWaitedMs / 1000) + 's / 上限 ' + Math.round(a.distillTimeoutMs / 1000) + 's</span>';
    }
    if (ap.probeTotal > 0 && (ap.phase === 'probe' || ap.phase === 'judge')) {
      nowLine += ' <span class="dim">题目 ' + ap.probeDone + '/' + ap.probeTotal + '</span>';
    }
    nowLine += '</div>';
  }
  // 场景清单（活跃 rep 视角：之前 rep 的完成数在总进度条里）
  var scen = '';
  if (ap && ap.scenarios && ap.scenarios.length) {
    var doneMap = {};
    (ap.completed || []).forEach(function (c) { doneMap[c.id] = c; });
    ap.scenarios.forEach(function (id) {
      var c = doneMap[id];
      if (c) scen += '<span class="sc done" title="' + esc(c.id) + '">✓ ' + c.passed + '/' + c.total + '</span>';
      else if (id === ap.scenarioId) scen += '<span class="sc cur">▶ ' + esc(id) + '</span>';
      else scen += '<span class="sc">' + esc(id) + '</span>';
    });
  }
  // 事件尾巴
  var ev = '';
  var evs = (ap && ap.events) || [];
  evs.slice(-8).forEach(function (e) {
    ev += '<div><time>' + fmtClock(e.t) + '</time>' + esc(e.msg) + '</div>';
  });
  if (!ev) ev = '<div style="color:#566070">（暂无事件）</div>';
  var pct = a.overall.totalScenarios ? Math.round(100 * a.overall.doneScenarios / a.overall.totalScenarios) : 0;
  var t = a.totals;
  return '<div class="card arm-' + a.arm + '">' +
    '<div class="card-title"><span class="arm-chip">' + a.arm + ' 组 · ' + (a.arm === 'A' ? '记忆开' : '记忆关') + '</span>' +
      '<span class="phase ' + ph[1] + '">' + ph[0] + '</span>' +
      '<span class="rep-tag">' + repTag + '</span></div>' +
    '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
    '<div class="bar-line"><span>' + a.overall.doneScenarios + '/' + a.overall.totalScenarios + ' 场景 · ' + pct + '%</span>' +
      '<span>检查 ' + a.overall.passed + '/' + a.overall.total + '</span></div>' +
    '<div class="fresh">' + fresh + '</div>' +
    nowLine +
    '<div class="stats">' +
      '<span class="stat">累计输入 <b>' + fmtTok(t.inputTokens) + '</b></span>' +
      '<span class="stat">输出 <b>' + fmtTok(t.outputTokens) + '</b></span>' +
      '<span class="stat">工具 <b>' + t.toolCalls + '</b></span>' +
      '<span class="stat">轮次 <b>' + t.turns + '</b></span>' +
      '<span class="stat">求助 <b>' + t.asks + '</b></span>' +
    '</div>' +
    '<div class="scen">' + scen + '</div>' +
    '<pre class="ev">' + ev + '</pre>' +
  '</div>';
}
function render(s) {
  var el = document.getElementById('app');
  if (!s.groups.length) {
    el.innerHTML = '<div class="empty">没有可展示的运行（<code>' + esc(s.root) + '</code> 下无带 plan.json 的 run-* 目录）。<br>跑一次基准后自动出现。</div>';
    return;
  }
  var html = '';
  s.groups.forEach(function (g) {
    var arms = g.arms.map(renderArm).join('');
    html += '<div class="group">' +
      '<div class="group-head"><b>' + esc(g.stamp) + '</b>' +
        '<span>' + esc(g.track === 'workflow' ? '工作流赛道' : '对话赛道') + '</span>' +
        '<span>模型 ' + esc(g.model) + '</span>' +
        (g.judgeModel ? '<span>判卷 ' + esc(g.judgeModel) + '</span>' : '') +
        (g.pluginVersion ? '<span>插件 ' + esc(g.pluginVersion) + '</span>' : '') +
        '<span>' + fmtClock(g.startedAt) + ' 开始</span></div>' +
      '<div class="arms">' + arms + '</div></div>';
  });
  el.innerHTML = html;
}
var conn = document.getElementById('conn');
function tick() {
  fetch('/api/state').then(function (r) { return r.json(); }).then(function (s) {
    conn.className = ''; conn.textContent = '刷新于 ' + fmtClock(s.now);
    render(s);
  }).catch(function () {
    conn.className = 'bad'; conn.textContent = '✕ 连接断开（面板进程可能已退出）';
  });
}
tick();
setInterval(tick, 1000);
</script>
</body>
</html>
`;

function handler(req, res) {
  if (req.method !== 'GET' || (req.url !== '/' && req.url !== '/api/state')) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }
  if (req.url === '/api/state') {
    const body = JSON.stringify(buildState());
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(HTML);
}

// 端口被占则顺延重试（同机可能残留上一场面板进程）
function listen(port, attemptsLeft) {
  const server = http.createServer(handler);
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error(`[panel] ✗ 无法监听 ${port}：${e.message}`);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`[panel] DSH-MemBench 实时进度面板：${url}（root: ${root}，Ctrl+C 退出）`);
    if (!noOpen) openBrowser(url);
  });
}

function openBrowser(url) {
  try {
    let p;
    if (process.platform === 'win32') p = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    else if (process.platform === 'darwin') p = spawn('open', [url], { detached: true, stdio: 'ignore' });
    else p = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    p.unref();
  } catch (e) {
    console.log(`[panel] 自动打开浏览器失败（${e.message}），请手动访问 ${url}`);
  }
}

listen(wantPort, 20);
