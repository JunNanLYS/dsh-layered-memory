// DSH-MemBench 运行包装：组装环境变量并启动 dsh bench profile。
//
// 用法：node bench/harness/run.mjs --arm A|B|AB [选项]
//   --track <dialog|workflow>  赛道（缺省 dialog；dialog 只允许 A 组——B 组会话独立
//                              无记忆必然失败，对照无信息量，已下线）
//   --arm AB                   双组并行：两个子进程分别跑 A/B（互不依赖），父进程收尾出联合报告
//   --scenarios <dir>          场景库目录（缺省按赛道取 bench/scenarios[-workflow]）
//   --out <dir>                输出根目录（缺省 bench/results/run-<arm>-<时间戳>；AB 模式不支持）
//   --provider <p>             被测 Agent 模型 provider
//   --model <m>                被测 Agent 模型名
//   --judge-provider/--judge-model   判卷模型（缺省同被测模型；正式跑建议换模型，避免自判偏置）
//   --distill-provider/--distill-model  蒸馏模型（A 组记忆插件用；缺省 deepseek-official/deepseek-v4-flash）
//   --repeats <n>              重复次数（缺省 1；正式跑建议 3 取均值）
//   --distill-timeout <ms>     A 组蒸馏等待超时（缺省 120000）
//
// 模型也可集中在 bench.env 配置（模板 bench.env.example，复制后本地填写；该文件
// 含 API key 已 gitignore）：BENCH_PROVIDER/BENCH_MODEL（被测）、BENCH_JUDGE_*（判卷）、
// BENCH_DISTILL_*（蒸馏）、BENCH_TEST/JUDGE_BASE_URL+API_KEY+API（自定义 OpenAI 兼容
// 网关，配置后自动注册临时 provider 并注入 API key）。优先级：命令行 > bench.env > 缺省。
//
// 前置（一次性）：见 bench/README.md——初始化 bench profile 并 link 安装插件与 runner。
// 每次重复独立 dataDir 与结果目录（rep-N/），互不污染。
// 运行开始前清扫历史残留（跨运行"考古"通道）：%TEMP%/dsh-mem-bench/ 全部旧 workspace
// 与 ~/.dsh/sessions 里 projectKey 含 dsh-mem-bench 的会话目录（只匹配 bench 命名，绝不碰用户会话）。
// AB 并行模式下清扫只在父进程做一次（DSH_BENCH_SKIP_PURGE=1 传给子进程，防止互删活跃沙箱）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { resolveModelConfig, buildGatewayPatch, TEST_GW_ID, JUDGE_GW_ID } from './env-config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const track = String(arg('track', 'dialog'));
if (track !== 'dialog' && track !== 'workflow') {
  console.error(`--track 只支持 dialog 或 workflow，收到「${track}」`);
  process.exit(2);
}
let arm = String(arg('arm'));
// 对话赛道 B 组下线：Harness 会话彼此独立，无记忆的 B 组必然失败，对照无信息量；
// 工作流赛道保留 B 组（重新探索/反问的代价是有效测量目标）。
if (track === 'dialog' && arm === 'B') {
  console.error('对话赛道不再运行 B 组（会话独立无记忆必然失败，对照无信息量）；只跑 A 组即可。');
  process.exit(2);
}
if (track === 'dialog' && arm === 'AB') {
  console.error('[run] 对话赛道无 B 组，AB 并行模式退化为 A 单组');
  arm = 'A';
}
if (!['A', 'B', 'AB'].includes(arm)) {
  console.error('用法：node bench/harness/run.mjs --arm A|B|AB [--track dialog|workflow] [--scenarios dir] [--out dir] [--provider p] [--model m] [--repeats n]');
  process.exit(2);
}
if (arm === 'AB' && arg('out', undefined) !== undefined) {
  console.error('AB 并行模式不支持 --out（两组各自使用默认目录，父进程按时间戳统一分配并出联合报告）。');
  process.exit(2);
}

// ── 模型配置（bench.env，模板 bench.env.example；解析与网关 patch 构造见 env-config.mjs）──
const mc = resolveModelConfig({ argv: process.argv, envFile: path.join(here, 'bench.env') });
if (mc.problems.length) {
  console.error(`[run] ✗ ${mc.problems.join('；')}。`);
  process.exit(2);
}
const { provider, model, judgeProvider, judgeModel, distillProvider, distillModel, effort, judgeEffort, distillEffort, gw } = mc;
const scenarios = path.resolve(String(arg('scenarios', path.join(repoRoot, 'bench', track === 'workflow' ? 'scenarios-workflow' : 'scenarios'))));
const repeats = Math.max(1, Number(arg('repeats', 1)) || 1);
const distillTimeout = String(arg('distill-timeout', 120000));

const dshBin = [
  process.env.DSH_BIN,
  // rc.8 起全局安装；旧布局兜底
  path.join(os.homedir(), '.npm-global/node_modules/@deepseek-ai/dsh/lib/bin.js'),
  path.join(os.homedir(), '.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js'),
].filter(Boolean).find((p) => fs.existsSync(p));
if (!dshBin) {
  console.error('找不到 dsh CLI（依次找 DSH_BIN → npm 全局前缀 → ~/.dsh/profiles；可用环境变量 DSH_BIN 覆盖）');
  process.exit(2);
}

// ── 环境守卫：bench profile 的 link: 必须指向本仓库 ──
// result 头的版本号来自 package.json，不反映"实际加载的代码"；若 profile 链接指向
// 别的工作树（旧代码），会静默跑错实现而结果头毫无异常（2026-08-21 实测事故）。
{
  const profileDir = path.join(os.homedir(), '.dsh', 'profiles', 'bench');
  if (fs.existsSync(profileDir)) {
    // 两侧都取 canonical 路径：仓库经 junction/subst 挂载时，realpath 与字面前缀不可比
    let rootReal = repoRoot;
    try { rootReal = fs.realpathSync(repoRoot); } catch { /* 保底用原路径 */ }
    const rootNorm = rootReal.toLowerCase();
    for (const name of ['dsh-layered-memory', 'dsh-bench-runner']) {
      const link = path.join(profileDir, 'node_modules', name);
      let real = null;
      try { real = fs.realpathSync(link); } catch { /* 链接缺失交给 dsh 启动报错 */ }
      if (real && real.toLowerCase() !== rootNorm && !real.toLowerCase().startsWith(rootNorm + path.sep)) {
        console.error(`[run] ✗ bench profile 的 ${name} 链接指向 ${real}，不在被测仓库 ${repoRoot} 内。\n` +
          '  旧工作树代码会静默污染结果（结果头的版本号不反映实跑代码）。\n' +
          '  先重装到本仓库：dsh plugin --profile bench add <本仓库路径> 与 ...\\bench\\harness\\dsh-bench-runner');
        process.exit(2);
      }
    }
  }
}

// ── 代码指纹：git SHA 进结果头（可复现性锚点，版本号之外的第二证据） ──
let gitSha = '';
try {
  gitSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout?.trim() || '';
} catch { /* 非 git 环境留空 */ }

// ── 历史残留清扫（跨运行考古通道） ──
// ① %TEMP%/dsh-mem-bench/：历史运行的沙箱（含完成态探针产物，新 agent 翻 ../ 即可考古）；
// ② ~/.dsh/sessions/ 中 projectKey 含 dsh-mem-bench 的会话目录：只匹配 bench 命名空间，用户会话不受影响。
function purgeStaleBenchState() {
  let removed = 0;
  const tmpRoot = path.join(os.tmpdir(), 'dsh-mem-bench');
  if (fs.existsSync(tmpRoot)) {
    for (const name of fs.readdirSync(tmpRoot)) {
      try { fs.rmSync(path.join(tmpRoot, name), { recursive: true, force: true }); removed++; }
      catch (e) { console.warn(`[run] ⚠ 历史 workspace 清理失败（忽略）：${name} — ${e.message}`); }
    }
  }
  const sessRoot = path.join(os.homedir(), '.dsh', 'sessions');
  if (fs.existsSync(sessRoot)) {
    for (const name of fs.readdirSync(sessRoot)) {
      if (!name.includes('dsh-mem-bench')) continue;
      try { fs.rmSync(path.join(sessRoot, name), { recursive: true, force: true }); removed++; }
      catch (e) { console.warn(`[run] ⚠ 历史 bench 会话清理失败（忽略）：${name} — ${e.message}`); }
    }
  }
  if (removed > 0) console.log(`[run] 已清扫 ${removed} 项历史 bench 残留（临时沙箱/会话记录，防跨运行考古）`);
}
if (process.env.DSH_BENCH_SKIP_PURGE !== '1') purgeStaleBenchState();

const stamp = stampNow();
const wfPrefix = track === 'workflow' ? 'run-wf-' : 'run-';
const outRootOf = (a) => path.resolve(String(arg('out', path.join(repoRoot, 'bench', 'results', `${wfPrefix}${a}-${stamp}`))));
const pluginVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;

// ── 自定义网关注入：生成 llm-pi-ai patch（配置了 BASE_URL 才生成；随 bench/results 留痕）──
const gwPatchFile = (() => {
  // AB 子进程复用父进程生成的文件（避免每个子进程再生成一份）
  if (process.env.DSH_BENCH_GW_PATCH && fs.existsSync(process.env.DSH_BENCH_GW_PATCH)) {
    return process.env.DSH_BENCH_GW_PATCH;
  }
  const y = buildGatewayPatch(mc);
  if (!y) return null;
  fs.mkdirSync(path.join(repoRoot, 'bench', 'results'), { recursive: true });
  const f = path.join(repoRoot, 'bench', 'results', `.gw-${stamp}.patch.yml`);
  fs.writeFileSync(f, y, 'utf8');
  console.log(`[run] 自定义网关已注入（${gw.testBase ? TEST_GW_ID : ''}${gw.testBase && gw.judgeBase ? ' + ' : ''}${gw.judgeBase ? JUDGE_GW_ID : ''}）：${f}`);
  return f;
})();
// 凭据服务从继承的进程环境读 key（apiKeyEnv 引用名）——只注入子进程，不污染当前 shell
const gwEnv = {
  ...(gw.testBase && gw.testKey ? { BENCH_TEST_API_KEY: gw.testKey } : {}),
  ...(gw.judgeBase && gw.judgeKey ? { BENCH_JUDGE_API_KEY: gw.judgeKey } : {}),
};

function runSingleArm(a, outRoot) {
  console.log(`[run] ${a} 组 × ${repeats} 次，场景库 ${scenarios}，输出 ${outRoot}`);
  for (let i = 1; i <= repeats; i++) {
    const outDir = path.join(outRoot, `rep-${i}`);
    fs.mkdirSync(outDir, { recursive: true });
    // 仓库外干净 workspace：对话会话与工作流沙箱的 cwd 都在这里，
    // 斩断 agent-instructions 沿父链读取仓库 AGENTS.md 的路径（首请求曾因此多 19KB）。
    const workspace = path.join(os.tmpdir(), 'dsh-mem-bench', `${path.basename(outRoot)}-rep${i}`);
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.mkdirSync(workspace, { recursive: true });
    const env = {
      ...process.env,
      ...gwEnv,
      DSH_BENCH_SCENARIOS: scenarios,
      DSH_BENCH_ARM: a,
      DSH_BENCH_OUT: outDir,
      DSH_BENCH_WORKSPACE: workspace,
      DSH_BENCH_DATA_DIR: a === 'A' ? path.join(outDir, 'memory') : '',
      DSH_BENCH_PLUGIN_VERSION: pluginVersion,
      DSH_BENCH_DISTILL_TIMEOUT_MS: distillTimeout,
      DSH_BENCH_GIT_SHA: gitSha,
      DSH_BENCH_PROVIDER: provider,
      DSH_BENCH_MODEL: model,
      DSH_BENCH_REASONING_EFFORT: effort,
      DSH_BENCH_DISTILL_PROVIDER: distillProvider,
      DSH_BENCH_DISTILL_MODEL: distillModel,
      DSH_BENCH_DISTILL_REASONING_EFFORT: distillEffort,
      ...(judgeProvider ? { DSH_BENCH_JUDGE_PROVIDER: judgeProvider, DSH_BENCH_JUDGE_MODEL: judgeModel || model, DSH_BENCH_JUDGE_REASONING_EFFORT: judgeEffort } : {}),
    };
    console.log(`[run] 第 ${i}/${repeats} 次 → ${outDir}`);
    const patches = [patchFileOf(a), ...(gwPatchFile ? [gwPatchFile] : [])];
    const r = spawnSync(process.execPath, [dshBin, '--profile', 'bench', ...patches.flatMap((p) => ['--patch', p])], {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
    });
    if (r.status !== 0) {
      console.error(`[run] 第 ${i} 次运行失败（退出码 ${r.status}），中止后续重复。`);
      process.exit(r.status ?? 1);
    }
  }
  console.log(`[run] 完成：${outRoot}`);
  return outRoot;
}

function patchFileOf(a) {
  return path.join(here, `${track === 'workflow' ? 'patch-wf-' : 'patch-'}arm-${a === 'A' ? 'on' : 'off'}.yml`);
}

// ── AB 并行：两组互不依赖，双进程并发跑，父进程等齐后出联合报告 ──
if (arm === 'AB') {
  const passThrough = [];
  for (const opt of ['scenarios', 'provider', 'model', 'effort', 'judge-provider', 'judge-model', 'judge-effort', 'distill-provider', 'distill-model', 'distill-effort', 'repeats', 'distill-timeout']) {
    const v = arg(opt, undefined);
    if (typeof v === 'string') passThrough.push(`--${opt}`, v);
  }
  const outA = path.join(repoRoot, 'bench', 'results', `${wfPrefix}A-${stamp}`);
  const outB = path.join(repoRoot, 'bench', 'results', `${wfPrefix}B-${stamp}`);
  const childEnv = { ...process.env, ...gwEnv, DSH_BENCH_SKIP_PURGE: '1', DSH_BENCH_NO_AUTOREPORT: '1', ...(gwPatchFile ? { DSH_BENCH_GW_PATCH: gwPatchFile } : {}) };
  // 并发启动防线（2026-08-22 实测事故）：dsh 每次启动会 heal 共享的
  // ~/.dsh/profiles/node_modules 平铺符号链接——链接需要重指时是先 unlink 再建，
  // 两个子进程同时落在该窗口会互踩 ENOENT 崩溃。①父进程先串行预热一次 boot
  // （完成待重指的 heal，链接正确后启动不再触碰）；②B 子进程延迟 15s 错峰。
  {
    const warm = spawnSync(process.execPath, [dshBin, '--profile', 'bench', '--dump-config'], { cwd: repoRoot, encoding: 'utf8' });
    if (warm.status !== 0) {
      console.error(`[run] ✗ bench profile 预热失败（退出码 ${warm.status}）——请先单独排查：dsh --profile bench --dump-config`);
      process.exit(2);
    }
    console.log('[run] profile 预热完成（heal 已在单进程内收敛）');
  }
  console.log(`[run] AB 并行：A → ${outA}；B → ${outB}（各 ${repeats} 次）`);
  const spawnChild = (a, out) => spawn(process.execPath, [fileURLToPath(import.meta.url), '--arm', a, '--track', track, '--out', out, ...passThrough], {
    cwd: repoRoot,
    env: childEnv,
    stdio: 'inherit',
  });
  const children = [spawnChild('A', outA)];
  await new Promise((r) => setTimeout(r, 15_000));
  children.push(spawnChild('B', outB));
  const codes = children.map((c) => new Promise((resolve) => c.on('close', resolve)));
  const results = await Promise.all(codes);
  const failed = results.filter((c) => c !== 0).length;
  if (failed) {
    console.error(`[run] AB 并行有 ${failed} 个组失败（退出码：${results.join('、')}），不出联合报告。`);
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [path.join(here, 'report.mjs'), outA, outB, '--out', path.join(outA, 'report.md')], {
    cwd: repoRoot, stdio: 'inherit',
  });
  if (r.status === 0) console.log(`[run] 联合报告已生成：${path.join(outA, 'report.md')}`);
  process.exit(r.status === 0 ? 0 : 1);
}

const outRoot = runSingleArm(arm, outRootOf(arm));

// 跑完自动出报告：本次目录 + 另一组最新目录（若有），写入 outRoot/report.md。
// 对话赛道无 B 组（已下线）——单组出报告；工作流赛道自动配对另一组的最新运行。
{
  if (process.env.DSH_BENCH_NO_AUTOREPORT !== '1') {
    const otherArm = arm === 'A' ? 'B' : 'A';
    const cands = track === 'workflow'
      ? fs.readdirSync(path.join(repoRoot, 'bench', 'results')).filter((d) => d.startsWith(`${wfPrefix}${otherArm}-`)).sort()
      : [];
    const other = cands.length ? path.join(repoRoot, 'bench', 'results', cands.at(-1)) : null;
    const r = spawnSync(process.execPath, [path.join(here, 'report.mjs'), outRoot, ...(other ? [other] : []), '--out', path.join(outRoot, 'report.md')], {
      cwd: repoRoot, stdio: 'inherit',
    });
    if (r.status === 0) {
      console.log(`[run] 报告已生成：${path.join(outRoot, 'report.md')}`);
    }
  }
}

function stampNow() {
  // 文件名友好的时间戳
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
