# scripts/ — 构建辅助脚本与随包资产

改 scripts/ 下脚本、调试构建产物、升级 model-catalog 或动 resources/ 资产前先读本文件。
client 产物链的协议背景见 `client/AGENTS.md`。

## build-client.mjs（client 产物链核心）

esbuild 打包 `client/src/entry.tsx` → `dist/client.js`：

- 配置：bundle + format=cjs + platform=browser + target es2020 + jsx automatic +
  **charset: 'utf8'**（esbuild 默认 ascii 会把中文转义成 \uXXXX）+ **不 minify**
  （保标识符，smoke 第 21 节断言依赖可读源码）。
- **external**：`react` / `react/jsx-runtime` / `@deepseek-ai/*`——绝不打入 bundle，
  运行期经 factory(require) 参数由宿主 ModuleLoader 注入。
- CJS 产物体包进 factory wrapper（`var module = { exports: {} }` 垫片 + 顶部剥
  "use strict"），与官方 dsh-client-ui-* 包同构；wrapper **尾部把 module.exports 展平为
  普通对象再返回**（`__flat` + for-in 拷贝 + Symbol.toStringTag）——esbuild 的
  `__toCommonJS` 产出是 getter 形状，宿主 loader 对 `apply`/`inject` 的读取方式会丢键。
- 产物自检（构建失败即报错）：协议包装头 / id 与包名一致 / 无裸 import 语句 /
  external 引用只走 require。
- 已知产物特征（smoke 断言依赖）：esbuild 把数字字面量规范化（如 2000 → 2e3）。

## copy-client.mjs

构建后把 tsc 不处理的资产拷入 dist/：`resources/runtime-package-lock.json` +
`resources/embedding-worker.cjs`。（client bundle 已由 build-client.mjs 直接产出到 dist/，
本脚本不再拷 client。）

## verify-catalog.mjs

权威源核验 `src/store/model-catalog.ts` 的 sha256/尺寸——**改目录后必跑**（`pnpm run
verify-catalog`，需先 build）。

## CI（.github/workflows/ci.yml）

push main/dev + PR 触发：pnpm install --frozen-lockfile → typecheck（双链）→ build →
build:smoke → smoke → verify-catalog（Node 22 / ubuntu / 15min 超时）。发布流水线是另一个 `publish.yml`
（tag 触发：校验 tag 与版本一致 → pnpm install → build → 校验 → npm publish → 自动建 Release；
0.10.0 起依赖安装走 pnpm，发布步骤仍走 npm CLI——OIDC Trusted Publishing 要求）。
依赖管理自 0.10.0 起由 npm 迁移到 pnpm：`pnpm-workspace.yaml` 的 `allowBuilds` 放行
esbuild 的 postinstall（pnpm 默认拦截依赖构建脚本），版本由 package.json 的
`packageManager` 钉死。

## resources/（随包发布的纯资产，非代码）

- `runtime-package-lock.json` — 本地嵌入运行时的作者侧依赖树锁定；升级
  PINNED_TRANSFORMERS_VERSION 时须同步重新生成。
- `embedding-worker.cjs` — 嵌入 worker 线程脚本，手写 CJS——包是 `"type":"module"`，
  tsc 产出的 .js 会被当 ESM，故走资产拷贝而非编译（构建期拷入 dist 根）。
