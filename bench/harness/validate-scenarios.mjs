// 场景库结构校验：node bench/harness/validate-scenarios.mjs [目录]
// 对话场景：id/family 合法、teach+change 会话存在且非空（reinforce 补强会话可选、
// 最多 2 个、须位于两者之间）、探题 6~10 道（六核心题型各恰 1 题 + 扩展题型各至多
// 1 题：accretive/update-chain/ordering/paraphrase）、判分方式与 gold/stale 搭配合法。
// 工作流场景：teach/probe 会话存在、可选 change 会话（流程更新题）、teach/change/probeChecks
// 每条恰一种判据（contains / notContains / absent / exists）、marker 出现在教学文本中。
// 退出码非 0 即校验失败（可挂 CI）。

import fs from 'node:fs';
import path from 'node:path';
import { checkShapeProblem } from './dsh-bench-runner/src/checks.js';

const dir = path.resolve(process.argv[2] || new URL('../scenarios', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const REQUIRED_TYPES = ['extraction', 'multihop', 'temporal', 'update', 'scene', 'abstention'];
const EXTENDED_TYPES = ['accretive', 'update-chain', 'ordering', 'paraphrase'];
const JUDGES = new Set(['contains-all', 'llm', 'abstain-llm']);

let failed = 0;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error(`场景目录为空：${dir}`);
  process.exit(1);
}
// marker 全库唯一（跨场景污染检测的前提：两个场景共用 marker 会让污染计数互相串扰）
const markerOwner = new Map();
for (const f of files) {
  let sc;
  try { sc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
  if (sc?.marker) {
    if (markerOwner.has(sc.marker) && markerOwner.get(sc.marker) !== sc.id) {
      console.error(`✗ ${f}：marker「${sc.marker}」与 ${markerOwner.get(sc.marker)} 的场景重复（污染检测要求全库唯一）`);
      failed++;
    } else {
      markerOwner.set(sc.marker, sc.id);
    }
  }
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
    // 防与 snoop 严格档正则撞名（records/、conversations/、scenes/、memory.db 是
    // 越界读取的判负锚点——沙箱文件用这些名字会让合法操作被误判违规）
    for (const key of Object.keys(sc.sandboxFiles ?? {})) {
      if (/^(?:records|conversations|scenes)[\\/]/.test(key) || /memory\.db/.test(key)) {
        problems.push(`sandboxFiles 键「${key}」撞 snoop 严格档判负锚点，请改名`);
      }
    }
    for (const key of ['teachChecks', 'probeChecks', 'changeChecks']) {
      for (const [i, c] of (sc[key] ?? []).entries()) {
        if (c?.file && (/^(?:records|conversations|scenes)[\\/]/.test(c.file) || /memory\.db/.test(c.file))) {
          problems.push(`${key}[${i}] file「${c.file}」撞 snoop 严格档判负锚点，请改名`);
        }
      }
    }
    const teach = sc.sessions?.find((s) => s.kind === 'teach');
    const change = sc.sessions?.find((s) => s.kind === 'change');
    const probe = sc.sessions?.find((s) => s.kind === 'probe');
    const kinds = (sc.sessions ?? []).map((s) => s.kind);
    for (const k of new Set(kinds)) {
      if (!['teach', 'change', 'probe'].includes(k)) problems.push(`未知会话 kind：${k}（工作流场景只支持 teach/change/probe）`);
      if (kinds.filter((x) => x === k).length > 1) problems.push(`kind=${k} 的会话出现多次（执行器只取第一个，多余的是笔误）`);
    }
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
  // reinforce 补强会话（增量积累/连锁更新等题型的碎片载体）：最多 2 个、消息非空、
  // 须位于 teach 与 change 之间——碎片次序是题型语义的一部分（v1→v2→v3 讲反了题就废了）
  const kinds = (sc.sessions ?? []).map((s) => s.kind);
  for (const k of new Set(kinds)) {
    if (!['teach', 'reinforce', 'change'].includes(k)) problems.push(`未知会话 kind：${k}（对话场景只支持 teach/reinforce/change）`);
  }
  const reinforces = (sc.sessions ?? []).filter((s) => s.kind === 'reinforce');
  if (reinforces.length > 2) problems.push(`reinforce 会话最多 2 个，实际 ${reinforces.length}`);
  for (const [i, s] of reinforces.entries()) {
    if (!s.messages?.length) problems.push(`reinforce 会话 ${i + 1} 消息为空`);
  }
  const idxTeach = kinds.indexOf('teach');
  const idxChange = kinds.indexOf('change');
  for (const [i, k] of kinds.entries()) {
    if (k === 'reinforce' && idxTeach !== -1 && idxChange !== -1 && !(i > idxTeach && i < idxChange)) {
      problems.push('reinforce 会话须位于 teach 与 change 之间');
    }
  }

  const probes = sc.probes ?? [];
  if (probes.length < 6 || probes.length > 10) problems.push(`探题数应为 6~10（六核心 + 可选扩展），实际 ${probes.length}`);
  const typeCounts = {};
  for (const p of probes) typeCounts[p.type] = (typeCounts[p.type] ?? 0) + 1;
  for (const t of REQUIRED_TYPES) {
    if ((typeCounts[t] ?? 0) !== 1) problems.push(`核心题型 ${t} 应恰 1 题，实际 ${typeCounts[t] ?? 0}`);
  }
  for (const t of EXTENDED_TYPES) {
    if ((typeCounts[t] ?? 0) > 1) problems.push(`扩展题型 ${t} 每场景至多 1 题，实际 ${typeCounts[t]}`);
  }
  for (const t of Object.keys(typeCounts)) {
    if (![...REQUIRED_TYPES, ...EXTENDED_TYPES].includes(t)) problems.push(`未知题型：${t}`);
  }
  for (const [i, p] of probes.entries()) {
    const tag = `第${i + 1}题(${p.type})`;
    if (!p.q || typeof p.q !== 'string') problems.push(`${tag} 缺问题文本`);
    if (p.judge === 'contains-all') {
      // 程序判的 gold 必须能在教学文本里找到出处（否则该题无记忆不可能答对，是坏题）；
      // 同时 gold 不得原样出现在问题文本里（问题泄漏答案，B 组靠复读也能过）。
      for (const g of p.gold ?? []) {
        if (!teachAll.includes(g)) problems.push(`${tag} gold「${g}」未出现在教学文本（无记忆不可答）`);
        if (p.q.includes(g)) problems.push(`${tag} gold「${g}」泄漏在问题文本里`);
      }
    }
    if (!JUDGES.has(p.judge)) problems.push(`${tag} 判分方式非法：${p.judge}`);
    if (p.judge === 'abstain-llm') {
      if (p.gold) problems.push(`${tag} 拒答题不应有 gold`);
    } else if (!Array.isArray(p.gold) || p.gold.length === 0 || p.gold.some((g) => typeof g !== 'string' || !g)) {
      problems.push(`${tag} 缺 gold 或 gold 含空项`);
    }
    if ((p.type === 'update' || p.type === 'update-chain') && (!Array.isArray(p.stale) || p.stale.length === 0)) {
      problems.push(`${tag} 更新题（update/update-chain）必须有 stale（已作废旧信息）`);
    }
  }
  if (problems.length) {
    console.error(`✗ ${f}（${sc.id ?? '?'}）：\n    - ${problems.join('\n    - ')}`);
    failed++;
  } else {
    console.log(`✓ ${f}（${sc.id}，${sc.family} 族，${(sc.probes ?? []).length} 题齐备${reinforces.length ? `，reinforce ×${reinforces.length}` : ''}）`);
  }
}
console.log(failed === 0 ? `\n全部通过：${files.length} 个场景` : `\n${failed}/${files.length} 个场景未通过`);
process.exit(failed === 0 ? 0 : 1);
