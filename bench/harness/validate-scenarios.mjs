// 场景库结构校验：node bench/harness/validate-scenarios.mjs [目录]
// 对话场景：id/family 合法、teach+change 会话存在且非空、恰好 6 题且六类型齐备、
// 判分方式与 gold/stale 的搭配合法。
// 工作流场景：teach/probe 会话存在、可选 change 会话（流程更新题）、teach/change/probeChecks
// 每条恰一种判据（contains / notContains / absent / exists）、marker 出现在教学文本中。
// 退出码非 0 即校验失败（可挂 CI）。

import fs from 'node:fs';
import path from 'node:path';
import { checkShapeProblem } from './dsh-bench-runner/src/checks.js';

const dir = path.resolve(process.argv[2] || new URL('../scenarios', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const REQUIRED_TYPES = ['extraction', 'multihop', 'temporal', 'update', 'scene', 'abstention'];
const JUDGES = new Set(['contains-all', 'llm', 'abstain-llm']);

let failed = 0;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error(`场景目录为空：${dir}`);
  process.exit(1);
}
for (const f of files) {
  const problems = [];
  let sc;
  try {
    sc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch (e) {
    console.error(`✗ ${f}：JSON 解析失败 ${e.message}`);
    failed++;
    continue;
  }
  if (sc.kind === 'workflow') {
    if (!sc.id) problems.push('缺 id');
    if (!['chat', 'work'].includes(sc.family)) problems.push(`family 非法：${sc.family}`);
    if (!sc.marker) problems.push('缺 marker（跨场景污染检测的唯一标记词，须出现在教学文本中）');
    if (!sc.sandboxFiles || Object.keys(sc.sandboxFiles).length === 0) problems.push('缺 sandboxFiles');
    const teach = sc.sessions?.find((s) => s.kind === 'teach');
    const change = sc.sessions?.find((s) => s.kind === 'change');
    const probe = sc.sessions?.find((s) => s.kind === 'probe');
    if (!teach?.messages?.length) problems.push('缺 teach 会话或消息为空');
    if (change && !change.messages?.length) problems.push('change 会话存在但消息为空');
    if (!probe?.messages?.length) problems.push('缺 probe 会话或消息为空');
    if (!probe?.reteach) problems.push('probe 缺 reteach（B 组反问时的固定重述）');
    if (sc.marker && !(sc.sessions ?? []).some((x) => (x.messages ?? []).join('\n').includes(sc.marker))) {
      problems.push(`marker「${sc.marker}」未出现在任一教学会话文本中`);
    }
    for (const key of ['teachChecks', 'probeChecks']) {
      if (!Array.isArray(sc[key]) || sc[key].length === 0) problems.push(`缺 ${key}（完成度校验）`);
      for (const [i, c] of (sc[key] ?? []).entries()) {
        const p = checkShapeProblem(c);
        if (p) problems.push(`${key}[${i}] ${p}`);
      }
    }
    // changeChecks 可选：有 change 会话时用于校验新版流程演练到位（诊断归因用）
    if (sc.changeChecks !== undefined) {
      if (!Array.isArray(sc.changeChecks) || sc.changeChecks.length === 0) problems.push('changeChecks 存在但为空');
      if (!change) problems.push('changeChecks 存在但缺 change 会话');
      for (const [i, c] of (sc.changeChecks ?? []).entries()) {
        const p = checkShapeProblem(c);
        if (p) problems.push(`changeChecks[${i}] ${p}`);
      }
    }
    if (problems.length) {
      console.error(`✗ ${f}（${sc.id ?? '?'} workflow）：\n    - ${problems.join('\n    - ')}`);
      failed++;
    } else {
      const parts = [`teach ${sc.teachChecks.length}`, `probe ${sc.probeChecks.length}`];
      if (change) parts.push(`change ${(sc.changeChecks ?? []).length}`);
      console.log(`✓ ${f}（${sc.id}，workflow，${parts.join(' + ')} 项校验）`);
    }
    continue;
  }
  if (!sc.id || typeof sc.id !== 'string') problems.push('缺 id');
  if (!['chat', 'work'].includes(sc.family)) problems.push(`family 非法：${sc.family}`);
  if (!sc.marker) problems.push('缺 marker（跨场景污染检测的唯一标记词，须出现在教学文本中）');
  const teachAll = (sc.sessions ?? []).map((x) => (x.messages ?? []).join('\n')).join('\n');
  if (sc.marker && !teachAll.includes(sc.marker)) problems.push(`marker「${sc.marker}」未出现在教学文本中`);
  const teach = sc.sessions?.find((s) => s.kind === 'teach');
  const change = sc.sessions?.find((s) => s.kind === 'change');
  if (!teach?.messages?.length) problems.push('缺 teach 会话或消息为空');
  if (!change?.messages?.length) problems.push('缺 change 会话或消息为空');
  if (sc.extraSessions) problems.push('意外的 extraSessions 字段（当前只支持 teach+change）');

  const probes = sc.probes ?? [];
  if (probes.length !== 6) problems.push(`探题数应为 6，实际 ${probes.length}`);
  const types = probes.map((p) => p.type).sort();
  for (const t of REQUIRED_TYPES) {
    if (!types.includes(t)) problems.push(`缺题型：${t}`);
  }
  for (const [i, p] of probes.entries()) {
    const tag = `第${i + 1}题(${p.type})`;
    if (!p.q || typeof p.q !== 'string') problems.push(`${tag} 缺问题文本`);
    if (!JUDGES.has(p.judge)) problems.push(`${tag} 判分方式非法：${p.judge}`);
    if (p.judge === 'abstain-llm') {
      if (p.gold) problems.push(`${tag} 拒答题不应有 gold`);
    } else if (!Array.isArray(p.gold) || p.gold.length === 0 || p.gold.some((g) => typeof g !== 'string' || !g)) {
      problems.push(`${tag} 缺 gold 或 gold 含空项`);
    }
    if (p.type === 'update' && (!Array.isArray(p.stale) || p.stale.length === 0)) {
      problems.push(`${tag} 更新题必须有 stale（已作废旧信息）`);
    }
  }
  if (problems.length) {
    console.error(`✗ ${f}（${sc.id ?? '?'}）：\n    - ${problems.join('\n    - ')}`);
    failed++;
  } else {
    console.log(`✓ ${f}（${sc.id}，${sc.family} 族，6 题齐备）`);
  }
}
console.log(failed === 0 ? `\n全部通过：${files.length} 个场景` : `\n${failed}/${files.length} 个场景未通过`);
process.exit(failed === 0 ? 0 : 1);
