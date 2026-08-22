// bench.env 模型配置解析（纯函数模块，可独立单测）。
// 模板见 bench.env.example；bench.env 本体含 API key，已被 .gitignore 排除。
// 优先级：命令行参数 > bench.env > 内置缺省。
// 网关三件套（*_BASE_URL/API_KEY/API）只有配了 BASE_URL 才注册临时 provider——
// run.mjs 把生成的 patch 叠给 dsh（llm-pi-ai 的 providers 键整行替换：本次运行的
// 自定义供应商完全由 bench.env 决定，用户 settings.yaml 的自定义网关不参与；
// deepseek-official 等内置路由不受影响）。API key 经 apiKeyEnv 引用环境变量名，
// 由 run.mjs 注入子进程环境（凭据服务从继承的进程环境读取）。

import fs from 'node:fs';

export const TEST_GW_ID = 'bench-gw';
export const JUDGE_GW_ID = 'bench-judge-gw';

/** KEY=VALUE 解析（# 注释、空行忽略、成对引号剥离；不存在返回空对象）。 */
export function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*)(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/**
 * 解析被测/判卷/蒸馏模型与网关配置。纯函数：校验失败不退出，收进 problems 由调用方处置。
 * @param {{argv: string[], envFile: string}} input
 * @returns {{provider,model,judgeProvider,judgeModel,distillProvider,distillModel,gw,problems}}
 */
export function resolveModelConfig({ argv, envFile }) {
  const arg = (name) => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    return v && !v.startsWith('--') ? v : true;
  };
  const benchEnv = loadEnvFile(envFile);
  const fromEnv = (k) => (typeof benchEnv[k] === 'string' && benchEnv[k].trim() ? benchEnv[k].trim() : '');
  const pick = (opt, envKey, fallback = '') => {
    const a = arg(opt);
    if (typeof a === 'string' && a) return a;
    return fromEnv(envKey) || fallback;
  };
  const problems = [];
  const gw = {
    testBase: fromEnv('BENCH_TEST_BASE_URL'),
    testKey: fromEnv('BENCH_TEST_API_KEY'),
    testApi: fromEnv('BENCH_TEST_API') || 'openai-responses',
    judgeBase: fromEnv('BENCH_JUDGE_BASE_URL'),
    judgeKey: fromEnv('BENCH_JUDGE_API_KEY'),
    judgeApi: fromEnv('BENCH_JUDGE_API') || 'openai-responses',
  };
  if ((gw.testBase && !gw.testKey) || (gw.judgeBase && !gw.judgeKey)) {
    problems.push('配置了网关 BASE_URL 但缺对应 API_KEY（bench.env 的 BENCH_TEST_API_KEY / BENCH_JUDGE_API_KEY）');
    return { provider: '', model: '', judgeProvider: '', judgeModel: '', distillProvider: '', distillModel: '', gw, problems };
  }
  if ((gw.testKey && !gw.testBase) || (gw.judgeKey && !gw.judgeBase)) {
    problems.push('填了 API_KEY 但没填 BASE_URL（bench.env）——key 无法生效，请补 BASE_URL 或清掉 key');
    return { provider: '', model: '', judgeProvider: '', judgeModel: '', distillProvider: '', distillModel: '', gw, problems };
  }
  const provider = pick('provider', 'BENCH_PROVIDER', gw.testBase ? TEST_GW_ID : '');
  const model = pick('model', 'BENCH_MODEL');
  if (!provider || !model) problems.push('缺被测模型（--provider/--model 或 bench.env 的 BENCH_PROVIDER/BENCH_MODEL）');
  if (provider === TEST_GW_ID && !gw.testBase) problems.push(`provider 引用 ${TEST_GW_ID} 但 bench.env 未配置 BENCH_TEST_BASE_URL`);
  const judgeProvider = pick('judge-provider', 'BENCH_JUDGE_PROVIDER', gw.judgeBase ? JUDGE_GW_ID : '');
  const judgeModel = pick('judge-model', 'BENCH_JUDGE_MODEL', gw.judgeBase ? model : '');
  if (judgeProvider === JUDGE_GW_ID && !gw.judgeBase) problems.push(`judge provider 引用 ${JUDGE_GW_ID} 但 bench.env 未配置 BENCH_JUDGE_BASE_URL`);
  const distillProvider = pick('distill-provider', 'BENCH_DISTILL_PROVIDER', 'deepseek-official');
  const distillModel = pick('distill-model', 'BENCH_DISTILL_MODEL', 'deepseek-v4-flash');
  if (distillProvider === TEST_GW_ID && !gw.testBase) problems.push(`蒸馏 provider 引用 ${TEST_GW_ID} 但 bench.env 未配置 BENCH_TEST_BASE_URL`);
  return { provider, model, judgeProvider, judgeModel, distillProvider, distillModel, gw, problems };
}

/**
 * 由解析结果生成 llm-pi-ai 网关注入 patch 的 YAML 文本；无网关配置返回 null。
 * 模型表按"哪个角色用哪个网关"聚合去重（判卷/蒸馏可复用被测网关）。
 */
export function buildGatewayPatch(mc) {
  const providers = {};
  if (mc.gw.testBase) {
    // 判卷落在被测网关的两种形态：显式 judgeProvider=bench-gw，或 judgeProvider 留空
    // 由 runner 回落到被测 provider（此时 judgeModel 可能与被测模型不同 id，同样要注册）
    const judgeOnTestGw = mc.judgeProvider === TEST_GW_ID || (!mc.judgeProvider && mc.provider === TEST_GW_ID);
    const models = [...new Set([
      mc.model,
      judgeOnTestGw ? mc.judgeModel : '',
      mc.distillProvider === TEST_GW_ID ? mc.distillModel : '',
    ].filter(Boolean))];
    providers[TEST_GW_ID] = { apiKeyEnv: 'BENCH_TEST_API_KEY', api: mc.gw.testApi, baseURL: mc.gw.testBase, models };
  }
  if (mc.gw.judgeBase) {
    providers[JUDGE_GW_ID] = { apiKeyEnv: 'BENCH_JUDGE_API_KEY', api: mc.gw.judgeApi, baseURL: mc.gw.judgeBase, models: [mc.judgeModel || mc.model] };
  }
  if (Object.keys(providers).length === 0) return null;
  const q = (v) => JSON.stringify(String(v));
  const lines = ['# 自动生成：bench.env 自定义网关注入（run.mjs 产出，勿手编；providers 键整行替换）', '- id: llm-pi-ai', '  config:', '    providers:'];
  for (const [id, p] of Object.entries(providers)) {
    lines.push(`      ${id}:`);
    lines.push(`        displayName: ${q(id + ' (bench.env)')}`);
    lines.push(`        apiKeyEnv: ${q(p.apiKeyEnv)}`);
    lines.push(`        api: ${q(p.api)}`);
    lines.push(`        baseURL: ${q(p.baseURL)}`);
    lines.push('        models:');
    for (const m of p.models) lines.push(`          - id: ${q(m)}`, `            name: ${q(m)}`);
  }
  return lines.join('\n') + '\n';
}
