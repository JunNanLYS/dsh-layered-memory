/**
 * 模型目录权威校验：升级/修改 model-catalog 后必须跑一次。
 *
 * 背景：目录 sha256 采自"下载后本地实测 + 手工抄写"，曾真实抄错一个字符
 * （embeddinggemma generation_config.json，2026-08 全网用户下载必败且无从排查）。
 * 本脚本对照权威源核验每个文件：LFS 文件比 HF tree API 的 lfs.oid（即 sha256），
 * 非 LFS 小文件按 `embedding.mirror` 实测哈希；大文件尺寸比对（内容靠下载期校验）。
 *
 * 用法：pnpm run verify-catalog [-- --mirror https://hf-mirror.com] [--proxy URL|none]
 *   代理默认三态自动探测（HTTPS_PROXY/ALL_PROXY 等，尊重 NO_PROXY），与下载器同语义。
 * 退出码：全部吻合 0，任何失配/缺失 1。
 */
import { createHash } from 'node:crypto';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

const mirror = (process.argv.find((a, i, arr) => arr[i - 1] === '--mirror')) ?? 'https://hf-mirror.com';
const proxyArg = process.argv.find((a, i, arr) => arr[i - 1] === '--proxy');
const { resolveProxyUrl, maskProxyUrl } = await import('../dist/store/download-queue.js');
const { MODEL_CATALOG } = await import('../dist/store/model-catalog.js');

let host = '';
try {
  host = new URL(mirror).host;
} catch {
  console.error(`镜像地址不可解析: ${mirror}`);
  process.exit(1);
}
const proxy = resolveProxyUrl(proxyArg, host);
let agent;
if (proxy) {
  try {
    agent = new ProxyAgent(proxy);
    console.log(`走代理 ${maskProxyUrl(proxy)}`);
  } catch (err) {
    console.warn(`代理配置无效（${maskProxyUrl(proxy)}），已忽略并直连: ${err.message}`);
    agent = undefined;
  }
}

const get = async (url) => {
  const res = await undiciFetch(url, ...(agent ? [{ dispatcher: agent }] : []));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

let failures = 0;
for (const entry of MODEL_CATALOG) {
  let tree;
  try {
    tree = JSON.parse((await get(`${mirror}/api/models/${entry.repo}/tree/main?recursive=true&revision=${entry.revision}`)).toString());
  } catch (err) {
    console.error(`✗ ${entry.id}: tree API 拉取失败（${err.message}）——repo/revision 可疑`);
    failures++;
    continue;
  }
  const byPath = new Map(tree.filter((f) => f.type === 'file').map((f) => [f.path, f]));
  for (const f of entry.files) {
    const remote = byPath.get(f.path);
    if (!remote) {
      console.error(`✗ ${entry.id}/${f.path}: 仓库中不存在（revision 内容与目录漂移）`);
      failures++;
      continue;
    }
    if (remote.size !== f.size) {
      console.error(`✗ ${entry.id}/${f.path}: 尺寸不符（仓库 ${remote.size} vs 目录 ${f.size}）`);
      failures++;
      continue;
    }
    const lfsOid = remote.lfs?.oid;
    if (lfsOid) {
      if (lfsOid === f.sha256) {
        console.log(`✓ ${entry.id}/${f.path}（LFS oid 权威核验）`);
      } else {
        console.error(`✗ ${entry.id}/${f.path}: sha256 与 LFS oid 不符\n    目录=${f.sha256}\n    实际=${lfsOid}`);
        failures++;
      }
    } else if (remote.size < 3_000_000) {
      const buf = await get(`${mirror}/${entry.repo}/resolve/${entry.revision}/${f.path}`);
      const sha = createHash('sha256').update(buf).digest('hex');
      if (sha === f.sha256) {
        console.log(`✓ ${entry.id}/${f.path}（下载实测）`);
      } else {
        console.error(`✗ ${entry.id}/${f.path}: sha256 实测不符\n    目录=${f.sha256}\n    实际=${sha}`);
        failures++;
      }
    } else {
      console.log(`- ${entry.id}/${f.path}: 非 LFS 大文件仅尺寸比对（${remote.size}B，内容靠下载期校验）`);
    }
  }
}
await agent?.close().catch(() => {});
if (failures > 0) {
  console.error(`\n${failures} 处失配——禁止发布，按上方"实际="值修正 model-catalog.ts`);
  process.exit(1);
}
console.log('\n目录全部核验通过');
