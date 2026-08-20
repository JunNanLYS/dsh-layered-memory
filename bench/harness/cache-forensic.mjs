// 缓存取证：解包指定 bench 会话的 session.jsonl(.zstd)，逐请求列出 usage，
// 定位缓存未命中的具体请求与新增内容规模。用法：
//   node bench/harness/cache-forensic.mjs <sessionDir> [更多目录…]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

async function readSession(file) {
  if (!file.endsWith('.zstd')) return fs.readFileSync(file).toString('utf8');
  // 落盘格式：多个独立 zstd 帧拼接（与 dsh-session-persistence-jsonl 的读取器同款处理）。
  // 按魔数 28 B5 2F FD 切帧，逐帧 zstdDecompressSync（Node 的流式解压不吃多帧流）。
  const buf = fs.readFileSync(file);
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
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

for (const dir of process.argv.slice(2)) {
  const file = fs.existsSync(path.join(dir, 'session.jsonl'))
    ? path.join(dir, 'session.jsonl')
    : path.join(dir, 'session.jsonl.zstd');
  if (!fs.existsSync(file)) { console.error(`目录无 session 文件：${dir}`); continue; }
  const raw = await readSession(file);
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  const label = path.basename(dir).slice(0, 46);
  console.log(`\n== ${label}（${lines.length} 行）==`);
  console.log('seq | kind            | input(未命中) | cacheRead | 未命中率 | 本步新增内容');
  for (const line of lines) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'session') continue;
    if (ev.type === 'assistant/message') {
      const u = ev.data?.usage ?? {};
      const inTok = u.inputTokens ?? 0, cache = u.cacheReadTokens ?? 0;
      const total = inTok + cache;
      const rate = total ? (inTok / total * 100).toFixed(0) + '%' : '-';
      console.log(`${String(ev.seq).padStart(3)} | assistant       | ${String(inTok).padStart(6)} | ${String(cache).padStart(7)} | ${rate.padStart(5)} |`);
    } else if (ev.type === 'tool/result') {
      const size = JSON.stringify(ev.data ?? '').length;
      console.log(`${String(ev.seq).padStart(3)} | tool/result     |        |          |       | +${(size / 1000).toFixed(1)}KB 工具结果`);
    } else if (ev.type === 'user/message') {
      console.log(`${String(ev.seq).padStart(3)} | USER 消息       |        |          |       | ${(JSON.stringify(ev.data ?? '').length / 1000).toFixed(1)}KB`);
    } else if (ev.type === 'turn/start') {
      console.log(`${String(ev.seq).padStart(3)} | ── turn ──`);
    }
  }
}
