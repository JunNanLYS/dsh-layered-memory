/**
 * 构建辅助：把 client/src（TS/TSX 多文件）经 esbuild 打包为 dist/client.js。
 *
 * 产物形态必须符合 dsh handoff 协议（对齐官方 dsh-client-ui-* 包的 lib/client.js）：
 *   window.__ModuleLoader__.load({ id, factory: (require) => { …; return module.exports; } })
 * esbuild 产 format=cjs 的 bundle（react / react/jsx-runtime / @deepseek-ai/* 全部
 * external，顶层是 require(...) 调用），再把整个产物体包进 factory——require 解析到
 * factory 参数（宿主 ModuleLoader 注入），不依赖浏览器全局 require。
 * react 绝不打进 bundle：双 react 实例会炸 hooks（Symbol 身份不等）。
 */
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_ID = 'dsh-layered-memory';

const result = await build({
  entryPoints: [path.join(root, 'client/src/entry.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/*'],
  minify: false,
  legalComments: 'none',
  sourcemap: false,
  write: false,
  logLevel: 'info',
});

let body = result.outputFiles[0].text;
// CJS 产物头部的 "use strict" 指令放进函数体无害，剥掉保持 wrapper 干净
body = body.replace(/^("|')use strict\1;\s*/, '');

const out =
  'window.__ModuleLoader__.load({\n' +
  `\tid: ${JSON.stringify(PLUGIN_ID)},\n` +
  '\tfactory: (require) => {\n' +
  '\t\tvar module = { exports: {} };\n' +
  '\t\tvar exports = module.exports;\n' +
  '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n' +
  body.replace(/\n/g, '\n\t\t') +
  '\n\t\treturn module.exports;\n' +
  '\t}\n' +
  '});\n';

// ── 产物自检：协议包装形状 + external 未被打入 ──
if (!out.startsWith('window.__ModuleLoader__.load({')) {
  throw new Error('build-client: 产物缺少协议包装头');
}
if (!out.includes(`id: ${JSON.stringify(PLUGIN_ID)}`)) {
  throw new Error('build-client: 产物 id 与包名不一致（loader 三处同步要求）');
}
if (/^\s*import[\s{"' ]/m.test(out)) {
  throw new Error('build-client: 产物含裸 import 语句（bundle 必须是纯 CJS 体）');
}
if (!out.includes('require("react")')) {
  throw new Error('build-client: 产物缺少 react 的 require 调用（external 失效，react 被打入或缺失？）');
}

await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist/client.js'), out, 'utf8');
console.log(`client bundle built → dist/client.js (${out.length} bytes)`);
