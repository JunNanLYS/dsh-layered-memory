// 临时汇总：两组工作流运行的 token 总账与缓存率 + A 组蒸馏开销粗估
import fs from 'node:fs';

const load = (tag) => {
  const d = fs.readdirSync('bench/results').filter((x) => x.startsWith(`run-wf-${tag}`)).sort().at(-1);
  return { dir: d, r: JSON.parse(fs.readFileSync(`bench/results/${d}/rep-1/result.json`, 'utf8')) };
};
const stat = (r, phase) => {
  let inTok = 0, cache = 0, out = 0, steps = 0;
  for (const s of r.scenarios) {
    const m = phase === 'teach' ? s.teach.metrics : s.probeMetrics;
    inTok += m.inputTokens; cache += m.cacheReadTokens; out += m.outputTokens; steps += m.steps;
  }
  const total = inTok + cache;
  return { total, cache, out, steps, cacheRate: total ? (cache / total * 100).toFixed(1) : '-' };
};
for (const tag of ['A', 'B']) {
  const { dir, r } = load(tag);
  const t = stat(r, 'teach'), p = stat(r, 'probe');
  const allTotal = t.total + p.total, allCache = t.cache + p.cache;
  console.log(`${tag}组（${dir}，2 场景）`);
  console.log(`  教学: 输入 ${t.total}（缓存 ${t.cache} → ${t.cacheRate}%）输出 ${t.out} 步骤 ${t.steps}`);
  console.log(`  探针: 输入 ${p.total}（缓存 ${p.cache} → ${p.cacheRate}%）输出 ${p.out} 步骤 ${p.steps}`);
  console.log(`  合计: 输入 ${allTotal} 缓存率 ${(allCache / allTotal * 100).toFixed(1)}% 输出 ${t.out + p.out}`);
}
const { dir } = load('A');
const log = fs.readFileSync(`bench/results/${dir}/rep-1/memory/memory.log`, 'utf8');
let calls = 0, inChars = 0, outChars = 0;
for (const line of log.split('\n')) {
  const m = line.match(/LLM 调用.*?输入 (\d+) 字符 → 输出 (\d+) 字符/);
  if (m) { calls++; inChars += +m[1]; outChars += +m[2]; }
}
console.log(`A组蒸馏开销（memory.log）: 调用 ${calls} 次，输入 ${inChars} 字符 → 输出 ${outChars} 字符（≈输入 ${Math.round(inChars / 1.6)} / 输出 ${Math.round(outChars / 1.6)} token，中文粗估）`);
