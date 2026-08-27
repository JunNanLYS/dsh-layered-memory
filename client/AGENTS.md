# client/ — 浏览器半边（TS/TSX 源码，esbuild 打包为单文件产物）

改 client/src 任何文件前先读本文件。UI 视觉改动另须走 `design/` 的 spec 循环
（规则见 `design/AGENTS.md`）；构建管线细节见 `scripts/AGENTS.md`。

## 结构（client/src，28 个模块）

- `entry.tsx` — 入口：导出 `inject = ['slots', 'connection']` + apply，两处 slot 注册：
  设置页（`settings.section`，id `dsh-memory`，order 200）与输入栏 pill
  （`conversation.input.left`，id `dsh-memory-mode`，order 100）。
- `env.ts` — 宿主环境声明（`declare const require` + hostRequire + MemoryClientCtx 类型）。
- `rpc.ts` — 泛型 RPC 通道：`makeRpc(ctx)` 返回 `call(endpoint, payload)`，带
  connection 缺失守卫（可选服务，可能晚于插件就绪）；类型全部来自 `src/contract.ts`。
- `theme.ts` — 主题令牌（`--dsh-mem-*` CSS 变量两层令牌机制）；
  `styles.ts` — 样式注入（ensureThemeStyle 等）。theme CSS 与 design/global-spec 的
  令牌表逐字对应。
- `format.ts` — 格式化工具；`sidebar-icon.ts` — 侧边栏 icon 补丁（宿主 navIcon 白名单
  之外的自绘 icon，含定时器管理）。
- `meter/` — 上下文占用指示器（官方环外圈记忆光晕弧 + 面板分项小节；
  行为契约见 design/memory-meter-spec.md）：`occupancy-indicator.ts`
  （body 级观察器单例 + 会话缓存 + T2 时钟；共享算术从 `src/util/context-occupancy.ts`
  经 esbuild 内联——占用数字的唯一来源在宿主侧，client 禁止另写算法）
  与 `panel-section.ts`（dialog 底部寄生 section）。
- `ui/primitives.tsx` — 宿主 UI 原语的 guarded require（`P = hostRequire('@deepseek-ai/dsh-client-ui-primitives')`，
  未注册时 try/catch 回退）；`ui/controls.tsx`（Switch/SwitchRow/Segmented）；`ui/NSel.tsx`（下拉）。
- `pill/` — 输入栏会话档位 pill：`modes.ts`（档位常量）+ `ModeSlider.tsx`（macOS 风格滑动
  选择器）+ `SessionInfoArea.tsx`（悬浮卡）+ `MemoryModePill.tsx`（组装）。
- `tabs/` — 设置页各 Tab：Overview / Records / Scenes / Persona / Log / Cost /
  RebuildPanel / EmbeddingSection / RouteChainEditor / BudgetInputs /
  DistillSettings（#34 B 形态分段壳：路由链与预算按范围组织的「蒸馏参数」外壳）。
- `panel.tsx` — TABS 表 + MemoryPanel（设置页根组件）。

## 铁律

- **handoff 协议**：产物必须是
  `window.__ModuleLoader__.load({ id: "dsh-layered-memory", factory })`，
  factory(require) 返回 `{apply, inject}`——id 三处同步（包名 / 产物 / 挂载声明），
  违反则宿主加载失败。
- **external 铁律**：`react`、`react/jsx-runtime`、`@deepseek-ai/*` 绝不打进 bundle
  （防双 react 实例导致 Symbol 身份不等）——源码里直接 import/require，构建期由
  esbuild external + factory 参数注入解析（与官方 dsh-client-ui-* 包同构）。
- **RPC 类型只认 contract**：端点/载荷/响应类型一律 `import type` 自 `src/contract.ts`
  （esbuild 构建期擦除，零运行时依赖），不在 client 侧另写形状——契约漂移在
  `npm run typecheck` 编译期双向暴露。
- **颜色只写令牌**：用 `--dsh-mem-*` 主题令牌，不写裸 hex（令牌表见 design/global-spec.md）。
- client bundle 的 slots 注册形状：设置页
  `ctx.slots.inject("settings.section", () => ctx.slots.register({name, id, order, label, inject: fn}, Component))`。

## 构建与验证

- `npm run build` 产出 `dist/client.js`（esbuild 细节与产物形状约定见 `scripts/AGENTS.md`）。
- `npm run typecheck` 双链之一就是 client：`tsconfig.client.json`（strict + react-jsx +
  DOM + noUncheckedIndexedAccess，noEmit；include client/src + src/contract.ts）。
- smoke 第 21 节对 `dist/client.js` **产物**断言（协议头 / external 接线 / 展平尾 /
  数字规范化等）——改产物形状或 wrapper 须同步该节断言。
- 宿主侧 RPC handle/call 的完整规则在 `src/AGENTS.md`「dsh 运行时 API 硬规则」。
