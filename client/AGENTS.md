# client/ — 浏览器半边（TS/TSX 源码，esbuild 打包为单文件产物）

改 client/src 任何文件前先读本文件。UI 视觉改动另须走 `design/` 的 spec 循环
（规则见 `design/AGENTS.md`）；构建管线细节见 `scripts/AGENTS.md`。

## 结构（client/src，0.9.0 分散式布局）

- `entry.tsx` — 入口：导出 `inject = ['slots', 'connection']` + apply，三处 slot 注册：
  设置页工作台（`settings.section`，id `dsh-memory`，order 200）、记忆芯片
  （`conversation.input.left`，id `dsh-memory-mode`，order 100）、统计行遥测
  （`conversation.composer.dock`，id `dsh-memory-telemetry`，order 5）。
- `env.ts` — 宿主环境声明（`declare const require` + hostRequire + MemoryClientCtx 类型）。
- `rpc.ts` — 泛型 RPC 通道：`makeRpc(ctx)` 返回 `call(endpoint, payload)`，带
  connection 缺失守卫（可选服务，可能晚于插件就绪）；类型全部来自 `src/contract.ts`。
- `theme.ts` — 主题令牌（`--dsh-mem-*` CSS 变量两层令牌机制）+ 注入样式表
  （ensureThemeStyle，卡片/菜单/滑条/活动流/披露/危险区等组件类）。theme CSS 与
  design/global-spec 的令牌表逐字对应。`styles.ts` — S 布局常量表。
- `i18n.ts` — zh/en 字典 + 宿主 locale 服务探测（`dsh-memory` 命名空间）+
  `t()/tpl()/fmtAgoLocal()/typeLabel()`；用户可见文案必须走字典。
- `format.ts` — 格式化工具；`sidebar-icon.ts` — 侧边栏 icon 补丁（宿主 navIcon 白名单
  之外的自绘 icon，含定时器管理）。
- `chat/` — 分散式会话记忆面（design/chat-spec.md）：`MemoryChip.tsx`（记忆芯片 +
  级联菜单 + Codex 式内联滑条 ScopeSlider）、`stats-segment.tsx`（`待蒸馏 N` 遥测段）。
- `meter/` — 上下文占用指示器（官方环面板「记忆」分项小节 = 占用唯一展示处；
  行为契约见 design/memory-meter-spec.md）：`occupancy-indicator.ts`
  （body 级观察器单例 + 会话缓存 + T2 时钟；共享算术从 `src/util/context-occupancy.ts`
  经 esbuild 内联——占用数字的唯一来源在宿主侧，client 禁止另写算法）
  与 `panel-section.ts`（dialog 底部寄生 section）。外圈光晕弧已移除（0.9.0）。
- `workspace/` — 记忆工作台五区（design/settings-spec.md）：`common.tsx`（区标题/
  错误块/小标）+ Overview / Library（asset-activity 只读活动流）/ Automation（开关 +
  披露）/ Insights（成本/活动/召回）/ Maintenance（健康 + 日志 + 危险区）。
- `tabs/` — 既有生产编辑器（工作台内复用）：Cost / Log / RebuildPanel /
  EmbeddingSection / RouteChainEditor / BudgetInputs / DistillSettings
  （#34 B 形态分段壳：路由链与预算按范围组织的「高级路由与预算」外壳）。
- `panel.tsx` — MemoryPanel（工作台壳：五区 sticky tablist + 箭头键巡游）。
- `ui/primitives.tsx` — 宿主 UI 原语的 guarded require（`P = hostRequire('@deepseek-ai/dsh-client-ui-primitives')`，
  未注册时 try/catch 回退）；`ui/controls.tsx`（Switch/SwitchRow/Segmented）；`ui/NSel.tsx`（下拉）。

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
- **文案只走 i18n 字典**（新代码）：zh/en 成对，宿主 locale 优先、缺键回退 zh；
  不写双语并列或裸硬编码。既有 tabs/ 编辑器中文文案属登记欠账，逐步迁移。
- **颜色只写令牌**：用 `--dsh-mem-*` 主题令牌，不写裸 hex（令牌表见 design/global-spec.md）。
- client bundle 的 slots 注册形状：设置页
  `ctx.slots.inject("settings.section", () => ctx.slots.register({name, id, order, label, inject: fn}, Component))`。

## 构建与验证

- `npm run build` 产出 `dist/client.js`（esbuild 细节与产物形状约定见 `scripts/AGENTS.md`）。
- `npm run typecheck` 双链之一就是 client：`tsconfig.client.json`（strict + react-jsx +
  DOM + noUncheckedIndexedAccess，noEmit；include client/src + src/contract.ts）。
- smoke 第 21 节对 `dist/client.js` **产物**断言（协议头 / external 接线 / 展平尾 /
  数字规范化 / 五区词表 / 聚合端点接线等）——改产物形状、删组件或改文案词表
  须同步该节断言。
- 宿主侧 RPC handle/call 的完整规则在 `src/AGENTS.md`「dsh 运行时 API 硬规则」。
