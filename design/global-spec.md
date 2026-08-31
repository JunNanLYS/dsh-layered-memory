# global-spec — 全局设计规范

适用范围：`client/src/`（dsh 插件浏览器半边，TS/TSX 多文件源码，esbuild 打包为
单文件 dist/client.js）。本目录是已落地实现的**事实记录**，改 UI 前先读；令牌终值与
`client/src/theme.ts` 注入样式表一字不差，冲突时以代码为准并同步本文。

品牌基调：DeepSeek 品牌蓝 `#4D6BFE`；克制的产品 UI（设置面板 + 输入栏控件），
单强调色、信息密度适中、动效只做反馈不做表演。

文档导航：

- `global-spec.md`（本文件）——主题机制 / 令牌 / 圆角 / 排版 / 动效 / 无障碍 / 限制 / 守则
- `pill-spec.md`——输入栏记忆 pill + 侧边栏 icon 补丁
- `slider-spec.md`——悬浮板滑动选择器（滑轨 / 填充 / 拖动气泡）
- `settings-spec.md`——设置页记忆浏览器（原生复用 / 标签 tint / 重建面板）

## 主题机制（两层令牌）

dsh 宿主 web 应用的主题机制：

- 浅色：页面定义 `--dsw-alias-*` 令牌（label / bg / border 等中性色）；
- 暗色：宿主在 `<body>` 上设置 `data-ds-dark-theme` 属性并重定义这些令牌。

本插件在其上加一层自有语义令牌 `--dsh-mem-*`：

```
:root { --dsh-mem-...: <浅色值> }                    /* 浅色基准 */
body[data-ds-dark-theme] { --dsh-mem-...: <暗色值> }  /* 暗色整组覆盖 */
```

要点：

- **中性色（bg/border/文字）链真实 dsw 令牌**：`--dsh-mem-bg-card: var(--dsw-alias-bg-layer-2, #ffffff)`。
  宿主定义了就跟宿主走（与 dsh 界面浑然一体）；没定义则落到自带 fallback——
  浅色块配浅色 fallback、暗色块配暗色 fallback，两个主题都不破相。
- **强调色不链 dsw**（宿主交互令牌不是品牌蓝），由本层自定义，见下文"品牌强调色"。
- 组件内联样式一律写 `var(--dsh-mem-*)` → **主题切换时无需 React 重渲染**，
  CSS 变量就地换值，且 `.dsh-mem-root *` 上挂了 0.18s 颜色过渡（见"动效"）。
- 样式表由 `ensureThemeStyle()` 惰性注入（`<style id="dsh-mem-theme-style">`，幂等），
  四个渲染入口都调用：`MemoryPanel` / `MemoryModePill` / `ModeSlider` / `RebuildPanel`。
  `@keyframes`/`@property`/伪类/媒体查询进不了 inline style，只能走这张表。

## 中性与状态令牌

中性色链**真实存在的** dsw 令牌（已对照 design-platform.css 逐名校对：
`bg-layer-1/2/3`、`bg-overlay`、`border-l1/l2/l3`、`border-inverted`、`label-*`、
`interactive-bg-hover`、`state-error-primary`、`tooltip-bg`、`dsw-shadow-lv1/lv3`），
宿主定义了就跟宿主走；没定义则落到自带 fallback（浅色块配浅色、暗色块配暗色）。

| 令牌 | 浅色 | 暗色 | 用途 |
|---|---|---|---|
| `--dsh-mem-bg-card` | dsw bg-layer-2，fallback `#ffffff` | 同左，fallback `#2c2c2e` | 卡片 / 面板底 |
| `--dsh-mem-bg-inset` | dsw bg-overlay，fallback `#e9ecf2` | dsw bg-layer-1，fallback `#232324` | 代码块 / 分段选择器轨道 |
| `--dsh-mem-bg-hover` | dsw interactive-bg-hover，fallback `rgba(38,49,72,0.06)` | 同左，fallback `rgba(255,255,255,0.08)` | hover 淡底（跟宿主中性色） |
| `--dsh-mem-bg-pop` | dsw-specific-menu→bg-layer-3，fallback `#ffffff` | 同左，fallback `#353638` | **浮层**（dsh 原生菜单同配方，不透明实底） |
| `--dsh-mem-border` | dsw border-l2，fallback `rgba(0,0,0,0.10)` | 同左，fallback `rgba(255,255,255,0.12)` | 常规描边 / 分隔线 |
| `--dsh-mem-border-strong` | dsw border-l3，fallback `rgba(0,0,0,0.12)` | 同左，fallback `rgba(255,255,255,0.16)` | hover 加深描边 |
| `--dsh-mem-border-pop` | dsw border-inverted，fallback `rgba(0,0,0,0)`（不可见） | 同左，fallback `rgba(255,255,255,0.06)` | 浮层描边（原生菜单同款） |
| `--dsh-mem-text-1` | dsw label-primary，fallback `#0f1115` | 同左，fallback `#f9fafb` | 主文字 |
| `--dsh-mem-text-2` | dsw label-secondary，fallback `#61666b` | 同左，fallback `#cfd3d6` | 次文字 / detail |
| `--dsh-mem-text-3` | dsw label-tertiary，fallback `#6e7781` | 同左，fallback `#8892a6` | 提示 / 标签 / muted |
| `--dsh-mem-danger` | dsw state-error-primary，fallback `#d0403f` | 同左，fallback `#f4707b` | 错误文字 / 危险动作 |
| `--dsh-mem-thumb` | `#ffffff` | `#e8ebf5` | 滑块圆球 / 开关旋钮 |
| `--dsh-mem-track` | `rgba(128,140,150,0.32)` | `rgba(148,160,180,0.30)` | 滑轨 / 进度条底 |
| `--dsh-mem-dot` | `rgba(128,140,150,0.55)` | `rgba(148,160,180,0.5)` | 滑轨停点 |
| `--dsh-mem-shadow-card` | dsw shadow-lv1，fallback `0 2px 4px rgba(0,0,0,.05)` | 同左，fallback `0 2px 4px rgba(0,0,0,.3)` | 卡片浅投影 |
| `--dsh-mem-shadow-pop` | dsw shadow-lv3，fallback `0 0 1px rgba(0,0,0,.2), 0 0 4px rgba(0,0,0,.02), 0 12px 32px rgba(0,0,0,.08)`（双主题同值） | 同左 | 浮层投影（原生菜单同款） |
| `--dsh-mem-fill-1/2` | `#7b93ff` → `#3d5be0` | `#8fa0ff` → `#465ce8` | 滑轨填充渐变（左浅右深、球侧最深；浅端为可见性下限，勿再调浅） |

会话档位色令牌（`--dsh-mem-mode-chat/work/auto`）归 `pill-spec.md`。

## 品牌强调色：三档语义

DeepSeek 品牌蓝拆三档，各司其职，**双主题 WCAG AA 全部达标**（数值经独立审查复算）：

| 令牌 | 浅色 | 暗色 | 语义 | 对比度 |
|---|---|---|---|---|
| `--dsh-mem-accent` | `#4d6bfe` | `#6e85ff` | **图形**：Tab 下划线、焦点环、光晕、流光边（非文字，≥3:1 即可） | 4.33 / 4.58（on 卡底） |
| `--dsh-mem-accent-text` | `#3d5be0` | `#7b90ff` | **强调文字**：表面上的品牌蓝文字（≥4.5:1） | 5.57 / 5.16 |
| `--dsh-mem-accent-fill` | `#3d5be0` | `#465ce8` | **实底填充**：开关 on、分段选中、进度条填充，配白字（≥4.5:1） | 5.57 / 5.31（白字 on fill） |
| `--dsh-mem-accent-weak` | `rgba(77,107,254,0.10)` | `rgba(110,133,255,0.14)` | 输入框聚焦光环 / 淡彩底 | — |

选型纪律（**单强调色锁**）：全 UI 只允许这一个品牌蓝色系作强调，
不允许第二强调色与它抢视觉；语义色只有 danger（红）与档位色（见 `pill-spec.md`）。
危险确认按钮也走**原生 Button primary**（dsh 原生确认形态即蓝色 primary，
由 NModal/NButton 组合提供，不再自绘红色主按钮）。

## 图表系列色：数据可视化编码（单强调色锁的豁免类目）

多系列数据可视化（当前唯一使用处：成本看板折线图，见 `settings-spec.md`）需要
按系列区分颜色——这是**信息编码**而非装饰强调，故作为独立类目豁免单强调色锁。纪律：

- **只准用于多系列区分**（折线/色块图例/同类编码），不得挪作强调色/按钮/链接等装饰用途；
- 固定 8 档，超出的系列循环取模；第 1 档与 `--dsh-mem-accent` 同值（品牌蓝锚定首位），
  第 8 档与 text-2/text-3 fallback 同值（中性灰收"其他"语义）；
- 图形元素按 accent 同纪律执行（非文字，≥3:1 即可），**双主题数值经独立复算达标**
  （浅 on `#ffffff` 卡底 / 暗 on `#2c2c2e` 卡底）：

| 令牌 | 浅色 | 暗色 | 对比度（浅 / 暗） |
|---|---|---|---|
| `--dsh-mem-chart-1`（蓝·锚） | `#4d6bfe` | `#6e85ff` | 4.33 / 4.29 |
| `--dsh-mem-chart-2`（青） | `#0e9c8f` | `#35c4b5` | 3.40 / 6.45 |
| `--dsh-mem-chart-3`（绿） | `#1f9d55` | `#52c98d` | 3.49 / 6.70 |
| `--dsh-mem-chart-4`（琥珀） | `#a8821c` | `#d9b23e` | 3.57 / 6.89 |
| `--dsh-mem-chart-5`（橙） | `#d97a0d` | `#f59e5b` | 3.12 / 6.59 |
| `--dsh-mem-chart-6`（玫红，与 danger 拉开） | `#d64570` | `#f47ba2` | 4.25 / 5.44 |
| `--dsh-mem-chart-7`（紫） | `#7c5cff` | `#a78bfa` | 4.35 / 5.12 |
| `--dsh-mem-chart-8`（中性灰·"其他"） | `#61666b` | `#8892a6` | 5.80 / 4.45 |

## 圆角体系（锁定）

| 值 | 用途 | 使用处 |
|---|---|---|
| `4px` | 进度条内轨（唯一例外） | `.dsh-mem-rb-bar` / `.dsh-mem-rb-fill` |
| `8px` | **控件** | 按钮 / 输入框 / 下拉 / 分段选择器 |
| `10px` | **卡片** | 记忆卡 / 场景卡 / 开关面板 / 统计瓦片 / 代码块 / 菜单条目 |
| `12px` | **浮层** | 悬浮板 / 重建模态框 |
| `24px` | **原生芯片触发钮** | `.dsh-mem-mchip`（宿主 Sh0Q9G_trigger 真机实测，2026-08-31） |
| `999px` | **胶囊** | pill / 标签 / 开关轨道 / 滑轨 |

smoke 第 21 节机械断言：inline `borderRadius` 与 CSS `border-radius` 只允许
`{4, 8, 10, 12, 24, 999, 50%}`（`50%` 为圆点/圆头）。**加新组件必须落进这个集合。**

## 排版与间距

- 字号阶梯：11（标签/浮层小字）/ 12（muted、描述）/ 12.5（明细行）/ 13（正文、控件）/
  15（浮层标题）/ 16（区块标题）/ 20/650（统计瓦片大数字）。
- 等宽字体（id / 路径 / 日志 / 明细值）：`ui-monospace, SFMono-Regular, Consolas, monospace`。
- 间距节奏：4 / 8 / 10 / 12 / 14 / 16，不发明中间值；卡片间距 8、区块下沿 12~14。
- 布局原语（`S.flexRow` / `S.grow`）不变；概览统计瓦片网格
  `repeat(auto-fill, minmax(140px, 1fr))` + gap 8（360px 侧栏 2 列起）。

## 动效

| 动效 | 参数 | 降级 |
|---|---|---|
| 主题切换过渡 | `.dsh-mem-root, .dsh-mem-root *` 上 `background-color/border-color/color/box-shadow .18s ease`（只挂 paint 属性，不碰 transform） | `prefers-reduced-motion` → `none` |
| 按压反馈 | `transform .08s ease`（`.dsh-mem-btn` 自有 transition） | 同上（reduced-motion 块末置压制） |
| 流光 | `dshMemFlow 3s linear infinite`（`@property --dsh-mem-angle` 注册角度插值） | 同上 → `animation: none` |
| 滑块吸附 | 圆球 `left` 与填充 `width` 同步 `120ms ease`（拖拽中两者 `transition: none` 保 1:1 跟手） | inline 优先级高于样式表媒体查询，无法被压制（已知限制） |
| 开关旋钮 | inline `left .15s` | 同上（无法压制，同滑块） |
| 重建进度 | `.dsh-mem-rb-fill` `width .4s ease` | `prefers-reduced-motion` → `none` |
| 场景卡折叠箭头 | `.dsh-mem-scene-chev` `transform .15s ease`（展开态 rotate(90deg)） | 同上（兜底块名单内） |
| 下拉触发钮箭头 | `.dsh-mem-sel-chev` `transform .12s ease`（展开态 rotate(225deg)；CSS 描边画法，无位图/SVG 资产） | 同上（兜底块名单内） |

**reduced-motion 兜底块必须放在样式表末尾**：同特异性（0,1,0）下后置声明才能
压过前面的组件类 transition；新增带 transition 的类要同步加进该块的压制名单。

## 无障碍标准

- 文字对比度 WCAG AA（≥4.5:1）：强调文字档、tint 标签 14 组、三级文字 fallback、
  档位色文字——全部复算达标（各 spec 表内数值）。
- 图形对比度（≥3:1）：焦点环、Tab 下划线、流光边。
- 实底白字（≥4.5:1）：accent-fill 双主题、徽章固定色。
- 焦点可见：btn/tab/pill（流光态与 off 态）`:focus-visible` 2px 环；input/select `:focus`。
- `prefers-reduced-motion` 双降级（见"动效"）。
- 可见文案**零 em-dash**（用 `-`、`：` 或改句；smoke 断言字符串字面量）。

## 已知限制（改动前必读）

1. **inline transition 不受 reduced-motion 压制**：开关旋钮（`S.knob`）、滑块圆头与
   滑轨填充（width）的 transition 是 React inline style，样式表媒体查询物理上盖不过
   行内优先级。修复需要组件侧读 `matchMedia`，当前接受（位移动画幅度小、时长短）。
2. **浅色三级灰 `#6e7781` 余量薄**（4.547:1）：GitHub 标准灰，当前合规；
   宿主背景若比纯白略暗需复核。
3. **dsw 令牌缺失时 fallback 自负**：中性色链 dsw 是"信任宿主"设计；宿主未定义
   dsw 变量的场景（理论存在）落自带 fallback，已保证双主题各自正确。
4. `color-mix` / `@property` 要求 Chromium 111+（2023 起的常青版本）；
   更老浏览器：tint 标签与流光退化，文字与布局不受影响。
5. **原生 primitives 缺失时回退自绘**：`NButton/NInput/NModal` 的回退实现
   （`.dsh-mem-btn` 等）只在宿主未注册 seed 模块时出场；两套实现都要改时
   先改原生用法再同步回退类（视觉基线以原生为准，详见 `settings-spec.md`）。

组件特有的边界（侧边栏 icon DOM 补丁等）记录在各自 spec 的"边界"节。

## 贡献者守则（硬规则）

1. **颜色只写令牌**：新增 UI 不允许裸 hex / 裸 rgba 出现在可见样式里
   （阴影黑、纯白 knob 等既有豁免除外）；缺令牌就先在本文令牌表加，两主题成对。
2. **原生组件优先**：按钮/输入/模态一律走 `NButton/NInput/NModal`；
   primitives 没有的组件（Switch/Tab/Card/Select）才自绘，且必须用 dsw 令牌对齐。
3. **单强调色锁**：品牌蓝是唯一强调色；语义红（danger）、档位蓝阶与图表系列色
   （数据编码，见"图表系列色"节）不算强调色。
4. **圆角只取集合** `{4, 8, 10, 12, 24, 999}`（+圆点 `50%`；24 仅限与原生芯片触发钮对齐），smoke 机械拦截。
5. **交互态三件套**：hover / active(按压) / focus(-visible)，照 `settings-spec.md` 的配方。
6. **带 transition 的新类**：同步加进末尾 reduced-motion 压制名单（"动效"节）。
7. ~~ES5 纯度~~（已废除：client 已迁 TS/TSX + esbuild，见 AGENTS.md 代码约定）。
8. **可见文案零 em-dash**；中文注释；RPC 端点/载荷类型一律取 `src/contract.ts` 契约。
9. 改完跑全链：`npm run typecheck`（client 侧 strict 双检）→ 重建 dist-smoke →
   `npm run smoke`（第 21 节对 dist/client.js 产物拦令牌 / 圆角 / em-dash / 类接线 /
   档位名 / handoff 协议回归）→ `npm run build` 产出最新 dist/client.js。
