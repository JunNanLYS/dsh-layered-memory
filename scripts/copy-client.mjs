/**
 * 构建辅助：把 tsc 不处理的纯 JS/JSON 资产拷入 dist。
 * - client/client.js：手写的 client bundle；
 * - resources/runtime-package-lock.json：本地嵌入运行时的随包 lockfile
 *   （npm ci 用，锁定 @huggingface/transformers 的完整传递依赖树）；
 * - resources/embedding-worker.cjs：本地嵌入 worker（transformers 加载与推理
 *   在 worker_threads 执行，主线程只跑 local-embedding.ts 的协议代理）。
 */
import { copyFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'dist'), { recursive: true });
await copyFile(path.join(root, 'client', 'client.js'), path.join(root, 'dist', 'client.js'));
console.log('client bundle copied → dist/client.js');
await copyFile(
  path.join(root, 'resources', 'runtime-package-lock.json'),
  path.join(root, 'dist', 'runtime-package-lock.json'),
);
console.log('runtime lockfile copied → dist/runtime-package-lock.json');
await copyFile(
  path.join(root, 'resources', 'embedding-worker.cjs'),
  path.join(root, 'dist', 'embedding-worker.cjs'),
);
console.log('embedding worker copied → dist/embedding-worker.cjs');
