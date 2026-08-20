// DSH-MemBench 运行包装：组装环境变量并启动 dsh bench profile。
//
// 用法：node bench/harness/run.mjs --arm A|B [选项]
//   --scenarios <dir>   场景库目录（缺省 bench/scenarios）
//   --out <dir>         输出根目录（缺省 bench/results/run-<arm>-<时间戳>）
//   --provider <p>      被测 Agent 模型 provider（缺省回落当前默认模型）
//   --model <m>         被测 Agent 模型名
//   --judge-provider/--judge-model   判卷模型（缺省同被测模型）
//   --repeats <n>       重复次数（缺省 1；正式跑建议 3 取均值）
//   --distill-timeout <ms>           A 组蒸馏等待超时（缺省 120000）
//
// 前置（一次性）：见 bench/README.md——初始化 bench profile 并 link 安装插件与 runner。
// 每次重复独立 dataDir 与结果目录（rep-N/），互不污染。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const arm = arg('arm');
const track = String(arg('track', 'dialog'));
if (arm !== 'A' && arm !== 'B') {
  console.error('用法：node bench/harness/run.mjs --arm A|B [--track dialog|workflow] [--scenarios dir] [--out dir] [--provider p] [--model m] [--repeats n]');
  process.exit(2);
}
if (track !== 'dialog' && track !== 'workflow') {
  console.error(`--track 只支持 dialog 或 workflow，收到「${track}」`);
  process.exit(2);
}
const scenarios = path.resolve(String(arg('scenarios', path.join(repoRoot, 'bench', track === 'workflow' ? 'scenarios-workflow' : 'scenarios'))));
const stamp = stampNow();
const outRoot = path.resolve(String(arg('out', path.join(repoRoot, 'bench', 'results', `run-${track === 'workflow' ? 'wf-' : ''}${arm}-${stamp}`))));
const repeats = Math.max(1, Number(arg('repeats', 1)) || 1);
const distillTimeout = String(arg('distill-timeout', 120000));

const dshBin = process.env.DSH_BIN || 'C:/Users/18906/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js';
if (!fs.existsSync(dshBin)) {
  console.error(`找不到 dsh CLI：${dshBin}（可用环境变量 DSH_BIN 覆盖）`);
  process.exit(2);
}
const patchFile = path.join(here, `${track === 'workflow' ? 'patch-wf-' : 'patch-'}arm-${arm === 'A' ? 'on' : 'off'}.yml`);
const pluginVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;

console.log(`[run] ${arm} 组 × ${repeats} 次，场景库 ${scenarios}，输出 ${outRoot}`);
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
    DSH_BENCH_SCENARIOS: scenarios,
    DSH_BENCH_ARM: arm,
    DSH_BENCH_OUT: outDir,
    DSH_BENCH_WORKSPACE: workspace,
    DSH_BENCH_DATA_DIR: arm === 'A' ? path.join(outDir, 'memory') : '',
    DSH_BENCH_PLUGIN_VERSION: pluginVersion,
    DSH_BENCH_DISTILL_TIMEOUT_MS: distillTimeout,
  };
  for (const [opt, key] of [['provider', 'DSH_BENCH_PROVIDER'], ['model', 'DSH_BENCH_MODEL'], ['judge-provider', 'DSH_BENCH_JUDGE_PROVIDER'], ['judge-model', 'DSH_BENCH_JUDGE_MODEL']]) {
    const v = arg(opt, undefined);
    if (typeof v === 'string') env[key] = v;
  }
  console.log(`[run] 第 ${i}/${repeats} 次 → ${outDir}`);
  const r = spawnSync(process.execPath, [dshBin, '--profile', 'bench', '--patch', patchFile], {
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

// 跑完自动出报告：本次目录 + 另一组最新目录（若有），写入 outRoot/report.md
{
  const prefix = track === 'workflow' ? 'run-wf-' : 'run-';
  const otherArm = arm === 'A' ? 'B' : 'A';
  const cands = fs.readdirSync(path.join(repoRoot, 'bench', 'results')).filter((d) => d.startsWith(`${prefix}${otherArm}-`)).sort();
  const other = cands.length ? path.join(repoRoot, 'bench', 'results', cands.at(-1)) : null;
  const r = spawnSync(process.execPath, [path.join(here, 'report.mjs'), outRoot, ...(other ? [other] : []), '--out', path.join(outRoot, 'report.md')], {
    cwd: repoRoot, stdio: 'inherit',
  });
  if (r.status === 0) {
    console.log(`[run] 报告已生成：${path.join(outRoot, 'report.md')}`);
  }
}

function stampNow() {
  // 文件名友好的时间戳
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
