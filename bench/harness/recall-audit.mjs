// 召回注入审计（可追溯）：从已完成运行的 result.json（gold）+ 会话落盘（召回注入原文）
// 计算"注入召回率"——每道探针题前注入的记忆里是否包含该题 gold 要点。
// 用法：node bench/harness/recall-audit.mjs <runDir>（内含 rep-N/result.json）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const runDir = path.resolve(process.argv[2]);
const rep = process.argv[3] || 'rep-1';
const result = JSON.parse(fs.readFileSync(path.join(runDir, rep, 'result.json'), 'utf8'));

const sessionsRoot = path.join(os.tmpdir(), 'dsh-mem-bench-sessions-mirror');
// 会话落盘在 ~/.dsh/sessions/<projectKey>/；projectKey 由 workspace cwd 派生。
// workspace = %TEMP%/dsh-mem-bench/<runName>-rep<N>，这里直接按前缀搜。
const dshSessions = path.join(process.env.USERPROFILE || os.homedir(), '.dsh', 'sessions');
const wsName = path.basename(runDir) + '-rep' + rep.replace('rep-', '');
const projDirs = fs.readdirSync(dshSessions).filter((d) => d.includes(wsName) && d.startsWith('--'));

function readSession(file) {
  const buf = fs.readFileSync(file);
  const parts = [];
  let start = -1;
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) {
      if (start >= 0) parts.push(zlib.zstdDecompressSync(buf.subarray(start, i)));
      start = i;
    }
  }
  if (start >= 0) parts.push(zlib.zstdDecompressSync(buf.subarray(start)));
  return Buffer.concat(parts).toString('utf8');
}

const tokens = (item) => item.split(/[\s（）()、，,。；;：:/「」【】\[\]——\-!?？！]+/).filter((t) => t.length >= 2);

let withGold = 0, hit = 0, injectedCount = 0, charsSum = 0;
const misses = [];
for (const sc of result.scenarios) {
  if (sc.kind === 'workflow' || !projDirs.length) continue;
  // 找该场景的 probe 会话目录
  let probeDir = null;
  for (const proj of projDirs) {
    const base = path.join(dshSessions, proj);
    const cand = fs.readdirSync(base).find((d) => d.startsWith(`bench-${sc.id}-probe`));
    if (cand) { probeDir = path.join(base, cand); break; }
  }
  if (!probeDir) { console.error(`  ? 找不到 ${sc.id} 的 probe 会话落盘`); continue; }
  const events = readSession(path.join(probeDir, 'session.jsonl.zstd')).split('\n')
    .filter((l) => l.trim()).map((l) => JSON.parse(l));
  // 按序取召回注入文本（每道用户题前一条）
  const injections = [];
  for (const ev of events) {
    if (ev.type === 'user/message' && ev.data?.source?.form === 'recall') {
      injections.push((ev.data.content ?? []).map((b) => b.text ?? '').join(''));
    }
  }
  sc.probes.forEach((p, i) => {
    const inj = injections[i] ?? '';
    if (inj) { injectedCount++; charsSum += inj.length; }
    if (!p.gold || p.gold.length === 0) return; // 拒答题无 gold，不计入
    withGold++;
    const ok = p.gold.some((item) => {
      const ts = tokens(item);
      return ts.length === 0 ? inj.includes(item) : ts.every((t) => inj.includes(t));
    });
    if (ok) hit++;
    else misses.push(`${sc.id}[${p.type}] 注入${inj ? Math.round(inj.length / 100) / 10 + 'KB' : '为空'}`);
  });
}
console.log(`== 注入召回率（${path.basename(runDir)} / ${rep}，A 组）==`);
console.log(`注入发生：${injectedCount} 次探针注入，平均 ${(charsSum / Math.max(injectedCount, 1)).toFixed(0)} 字符/次`);
console.log(`注入召回率（gold 要点出现在该题注入里）：${hit}/${withGold} = ${(hit / Math.max(withGold, 1) * 100).toFixed(1)}%`);
if (misses.length) console.log(`未命中：\n  - ${misses.join('\n  - ')}`);
