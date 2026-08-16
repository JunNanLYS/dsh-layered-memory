/**
 * 构建辅助：把手写的 client bundle 拷入 dist（tsc 不处理纯 JS 输入）。
 */
import { copyFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'dist'), { recursive: true });
await copyFile(path.join(root, 'client', 'client.js'), path.join(root, 'dist', 'client.js'));
console.log('client bundle copied → dist/client.js');
