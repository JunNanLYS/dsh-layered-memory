# DESIGN_SYSTEM.md — client bundle 设计系统

适用范围：`client/client.js`（dsh 插件浏览器半边，手写 plain-JS / ES5，无打包器）。
本文档是已落地实现的**事实记录**（commit `b7dd98e` 起），改 UI 前先读；
令牌终值与 `client.js` 注入样式表一字不差，冲突时以代码为准并同步本文。

品牌基调：DeepSeek 品牌蓝 `#4D6BFE`；克制的产品 UI（设置面板 + 输入栏控件），
单强调色、信息密度适中、动效只做反馈不做表演。

---

## 1. 主题机制（两层令牌）

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
- **强调色不链 dsw**（宿主交互令牌不是品牌蓝），由本层自定义，见 §3。
- 组件内联样式一律写 `var(--dsh-mem-*)` → **主题切换时无需 React 重渲染**，
  CSS 变量就地换值，且 `.dsh-mem-root *` 上挂了 0.18s 颜色过渡（见 §8）。
- 样式表由 `ensureThemeStyle()` 惰性注入（`<style id="dsh-mem-theme-style">`，幂等），
  四个渲染入口都调用：`MemoryPanel` / `MemoryModePill` / `ModeSlider` / `RebuildPanel`。
  `@keyframes`/`@property`/伪类/媒体查询进不了 inline style，只能走这张表。

## 2. 色彩令牌总表

### 2.1 中性与状态令牌

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
| `--dsh-mem-fill-1/2` | `#93a8ff` → `#3d5be0` | `#8fa0ff` → `#465ce8` | 滑轨填充渐变（左浅右深） |

### 2.2 会话档位色（输入栏 pill / 滑动选择器 / 概览默认档）

显示名：**关闭 / 日常 / 工作 / 智能**（配置键与英文层保留 off/chat/work/auto）。
色阶 = **灰 → 品牌蓝** 的渐变过渡（旧绿/橙已废）；关闭档无专属色（透明按钮，文字走 text-2）。
文字对比度按 **pill 真实底色**（流光内底 = bg-card 97% + 档位色 3%）复算，全部 ≥4.6:1
（浅 4.94/4.99/5.36；暗 5.71/4.88/4.63——最紧的暗色智能档余量 0.13）。

| 令牌 | 浅色 | 暗色 | 语义 |
|---|---|---|---|
| `--dsh-mem-mode-chat` | `#5a69b0` | `#97a4ff` | 日常（过渡蓝一档） |
| `--dsh-mem-mode-work` | `#5263ca` | `#8295ff` | 工作（过渡蓝二档） |
| `--dsh-mem-mode-auto` | `#3d5be0` | `#7b90ff` | 智能（默认档，品牌蓝） |

pill 形态二分：**关闭/未加载 = dsh 透明按钮**（无边框无底，文字 text-2）；
**日常/工作/智能 = 同款流光 + 光晕**，档位区分靠蓝阶文字色与流光内底混色
（`--dsh-mem-pill-tint` 通道，见 §7）。pill 半透明衍生色一律
`color-mix(in srgb, <档位色> N%, transparent)`——**var() 引用不能拼 hex alpha 后缀**。

## 3. 品牌强调色：三档语义

DeepSeek 品牌蓝拆三档，各司其职，**双主题 WCAG AA 全部达标**（数值经独立审查复算）：

| 令牌 | 浅色 | 暗色 | 语义 | 对比度 |
|---|---|---|---|---|
| `--dsh-mem-accent` | `#4d6bfe` | `#6e85ff` | **图形**：Tab 下划线、焦点环、光晕、流光边（非文字，≥3:1 即可） | 4.33 / 4.58（on 卡底） |
| `--dsh-mem-accent-text` | `#3d5be0` | `#7b90ff` | **强调文字**：表面上的品牌蓝文字（≥4.5:1） | 5.57 / 5.16 |
| `--dsh-mem-accent-fill` | `#3d5be0` | `#465ce8` | **实底填充**：开关 on、分段选中、进度条填充，配白字（≥4.5:1） | 5.57 / 5.31（白字 on fill） |
| `--dsh-mem-accent-weak` | `rgba(77,107,254,0.10)` | `rgba(110,133,255,0.14)` | 输入框聚焦光环 / 淡彩底 | — |

选型纪律（**单强调色锁**）：全 UI 只允许这一个品牌蓝色系作强调，
不允许第二强调色与它抢视觉；语义色只有 danger（红）与档位色（见 §2.2）。
危险确认按钮也走**原生 Button primary**（dsh 原生确认形态即蓝色 primary，
由 NModal/NButton 组合提供，不再自绘红色主按钮）。

## 4. 记忆类型标签：tint 系统

7 类类型标签走"彩底淡色 + 彩字"tint 风格（替代旧"中饱和底 + 白字"——后者 11px 白字
对比度多处不足）。实现：`--dsh-mem-tag-c` 色彩通道 + `color-mix` 派生：

```css
.dsh-mem-tag { color: var(--dsh-mem-tag-c, var(--dsh-mem-text-2));
  background: color-mix(in srgb, var(--dsh-mem-tag-c, #8a93a1) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsh-mem-tag-c, #8a93a1) 28%, transparent); }
```

| 类型类 | 浅色 `--dsh-mem-tag-c` | 暗色 |
|---|---|---|
| `-persona` / `-work-method`（紫） | `#6f42c1` | `#c297ff` |
| `-episodic` / `-work-fact`（蓝） | `#0757b4` | `#6cb2ff` |
| `-instruction` / `-work-artifact`（琥珀） | `#8a5a00` | `#e3b341` |
| `-work-task`（绿） | `#116629` | `#6fca74` |

全部 14 组（7 类 × 2 主题）在各自 tint 底上 ≥4.5:1（4.99~5.99）。

## 5. 圆角体系（锁定）

| 值 | 用途 | 使用处 |
|---|---|---|
| `4px` | 进度条内轨（唯一例外） | `.dsh-mem-rb-bar` / `.dsh-mem-rb-fill` |
| `8px` | **控件** | 按钮 / 输入框 / 下拉 / 分段选择器 |
| `10px` | **卡片** | 记忆卡 / 场景卡 / 开关面板 / 统计瓦片 / 代码块 |
| `12px` | **浮层** | 玻璃材质浮层 / 重建模态框 |
| `999px` | **胶囊** | pill / 标签 / 开关轨道 / 滑轨 |

smoke 第 21 节机械断言：inline `borderRadius` 与 CSS `border-radius` 只允许
`{4, 8, 10, 12, 999, 50%}`（`50%` 为圆点/圆头）。**加新组件必须落进这个集合。**

## 6. 排版与间距

- 字号阶梯：11（标签/浮层小字）/ 12（muted、描述）/ 12.5（明细行）/ 13（正文、控件）/
  15（浮层标题）/ 16（区块标题）/ 20/650（统计瓦片大数字）。
- 等宽字体（id / 路径 / 日志 / 明细值）：`ui-monospace, SFMono-Regular, Consolas, monospace`。
- 间距节奏：4 / 8 / 10 / 12 / 14 / 16，不发明中间值；卡片间距 8、区块下沿 12~14。
- 布局原语（`S.flexRow` / `S.grow`）不变；概览统计瓦片网格
  `repeat(auto-fill, minmax(140px, 1fr))` + gap 8（360px 侧栏 2 列起）。

## 7. 组件清单：原生优先 + 等效自绘

### 7.1 原生组件复用（require("@deepseek-ai/dsh-client-ui-primitives")）

官方 seed 模块，与宿主视觉完全一致。bundle 内 guarded require
（宿主未注册时回退自绘等效实现——degrade-don't-crash）：

| 包装器 | 原生组件 | 用法 | 回退 |
|---|---|---|---|
| `NButton` | `Button`（size sm；variant ghost/primary/outline） | 全部普通按钮（刷新/搜索/加载更多/取消/嵌入区块按钮）；确认按钮 `variant:"primary"` | `.dsh-mem-btn` 类按钮 |
| `NInput` | `Input` | 记忆搜索框 | `.dsh-mem-input` |
| `NModal` | `Modal`（open/onClose/title/footer） | 重建确认模态 | `.dsh-mem-rb-overlay`/`.dsh-mem-rb-modal` |

primitives 里**没有** Switch/Tabs/Card/Badge/Select（官方消费方同样自绘），
以下等效组件用 dsw 令牌手工对齐原生观感：Switch（开关）、Tab 下划线导航条、
`.dsh-mem-card`（卡片）、`.dsh-mem-select`（下拉）、`.dsh-mem-tag`（类型标签）。

### 7.2 自有组件类（注入样式表）

| 类 | 组件 | 备注 |
|---|---|---|
| `.dsh-mem-root` | 设置页根容器 | 挂主题过渡（§8）；所有 Tab 内容在子树内 |
| `.dsh-mem-btn` / `-input` / `-select` | 回退态按钮/输入/下拉 | 仅在原生组件缺失时出场；交互态配方见 §7.3 |
| `.dsh-mem-tab`（+ `-on`） | Tab（下划线式） | active：字重 600 + 主文字色 + 2px 品牌蓝下划线 |
| `.dsh-mem-card`（+ `-hover`） | 卡片 | 浅投影；`-hover` 变体 = 可交互卡片 hover 描边加深 |
| `.dsh-mem-tag`（+ 7 类型类） | 记忆类型标签 | 见 §4 |
| `.dsh-mem-flow` | pill 边缘流光（日常/工作/智能共用；关闭无） | 品牌蓝族 conic 旋转光带；内层必须**不透明**底（`color-mix(bg-card 97%, var(--dsh-mem-pill-tint) 3%)`，`--dsh-mem-pill-tint` 由 pill inline 按档位给定）盖住光带防文字被光斑干扰（实测事故）；不支持 `@property` 的浏览器整条 background 退化（2026 常青浏览器均已支持） |
| `.dsh-mem-pill-off` | off 档 pill | dsh 透明按钮：`border: none; background: transparent` 显式压掉 button UA 默认灰底/描边（实测事故：裸 button 在宿主页露出默认 chrome），hover 才出 `--dsh-mem-bg-hover` 淡底，带 `:focus-visible` 环；加载态（档位未加载）同款 |
| `.dsh-mem-popover` | 滑动选择器浮层 | **dsh 原生菜单同配方**：不透明 `--dsh-mem-bg-pop`（dsw-specific-menu）+ inverted 描边 + lv3 阴影 + 圆角 12；上下内边距对称（14px，滑轨垂直居中、尺寸紧凑）；旧玻璃材质已废 |
| `.dsh-mem-bubble` | 拖动气泡 | 拖拽时在圆球上方显示当前档位（**浮层同材质**：`--dsh-mem-bg-pop` 底 + `--dsh-mem-text-1` 字 + `--dsh-mem-border` 描边，随主题翻转；tooltip-bg 在浅色下仍是深色，已弃用），下**倒三角**尖角贴近圆球（悬停 8px，尖端距球顶约 5px；`::before` 描边 + `::after` 填充**双 clip-path 三角**叠画——旋转方块会露出上半截成菱形，同材质单三角压浮层边缘会融合），随圆球移动松手消失；zIndex 4 高于浮层（跨浮层上缘时盖在其上），经 `overflow: visible` 溢出 |
| `.dsh-mem-rb-*` | 重建面板族 | card/bar/fill/muted + NModal 回退用 overlay/modal |

滑动选择器（ModeSlider）：粗滑轨 22px **包裹** 14px 可视圆球（THUMB=16 含描边）；
滑轨填充从滑轨左端铺到**圆球右缘**（`width = thumbLeft + THUMB`，整球落在填充末端上与其
重合无割裂；auto 档恰好全轨蓝、任何档位不超出轨道），品牌蓝左浅右深（球侧最深）
`--dsh-mem-fill-1/2` 渐变；**静态关闭档不渲染填充，拖拽中无论预览到哪档恒显示**
（`activeIdx > 0 || drag !== null`，松手落 off 才随提交消失）；
4 个停点刻度在轨内；拖拽交互（Pointer capture / EMA 速度 / 动量投影 ±半档）不变。

交互态约定：**pointer 按压必有反馈**（`scale(0.98)`，80ms）；键盘可达
（btn/tab/pill 用 `:focus-visible` 环——pill 的流光态与 off 态各有规则，input/select 用 `:focus` 即时环）；
disabled 统一 `opacity 0.45 + not-allowed`。

## 8. 动效

| 动效 | 参数 | 降级 |
|---|---|---|
| 主题切换过渡 | `.dsh-mem-root, .dsh-mem-root *` 上 `background-color/border-color/color/box-shadow .18s ease`（只挂 paint 属性，不碰 transform） | `prefers-reduced-motion` → `none` |
| 按压反馈 | `transform .08s ease`（`.dsh-mem-btn` 自有 transition） | 同上（reduced-motion 块末置压制） |
| 流光 | `dshMemFlow 3s linear infinite`（`@property --dsh-mem-angle` 注册角度插值） | 同上 → `animation: none` |
| 滑块吸附 | 圆球 `left` 与填充 `width` 同步 `120ms ease`（拖拽中两者 `transition: none` 保 1:1 跟手） | inline 优先级高于样式表媒体查询，无法被压制（已知限制，见 §10） |
| 重建进度 | `.dsh-mem-rb-fill` `width .4s ease` | 同上（末置块压制） |
| 开关旋钮 | inline `left .15s` | 同上（无法压制，同滑块） |

**reduced-motion 兜底块必须放在样式表末尾**：同特异性（0,1,0）下后置声明才能
压过前面的组件类 transition；新增带 transition 的类要同步加进该块的压制名单。

## 9. 无障碍标准

- 文字对比度 WCAG AA（≥4.5:1）：强调文字档、tint 标签 14 组、三级文字 fallback、
  档位蓝阶文字按 pill 真实底色（97%+3% 混色）复算：浅 4.94/4.99/5.36、暗 5.71/4.88/4.63
  （最紧的暗色智能档 #7b90ff=4.63:1，余量 0.13——再加深前必须先复算）
  ——全部复算达标（§2~§4 表内数值）。
- 图形对比度（≥3:1）：焦点环、Tab 下划线、流光边。
- 实底白字（≥4.5:1）：accent-fill 双主题（原生 primary 按钮由宿主保证）。
- 焦点可见：btn/tab/pill（流光态与 off 态）`:focus-visible` 2px 环；input/select `:focus`。
- `prefers-reduced-motion` 降级（§8）。
- 可见文案**零 em-dash**（用 `-`、`：` 或改句；smoke 断言字符串字面量）。

## 10. 已知限制（改动前必读）

1. **inline transition 不受 reduced-motion 压制**：开关旋钮（`S.knob`）、滑块圆头与
   滑轨填充（width）的 transition 是 React inline style，样式表媒体查询物理上盖不过行内优先级。
   修复需要组件侧读 `matchMedia`，当前接受（位移动画幅度小、时长短）。
2. **浅色三级灰 `#6e7781` 余量薄**（4.547:1）：GitHub 标准灰，当前合规；
   宿主背景若比纯白略暗需复核。
3. **dsw 令牌缺失时 fallback 自负**：中性色链 dsw 是"信任宿主"设计；宿主未定义
   dsw 变量的场景（理论存在）落自带 fallback，已保证双主题各自正确。
4. `color-mix` / `@property` 要求 Chromium 111+（2023 起的常青版本）；
   更老浏览器：tint 标签与流光退化，文字与布局不受影响。
5. **原生 primitives 缺失时回退自绘**：`NButton/NInput/NModal` 的回退实现
   （`.dsh-mem-btn` 等）只在宿主未注册 seed 模块时出场；两套实现都要改时
   先改原生用法再同步回退类（视觉基线以原生为准）。
6. **侧边栏 icon 是受控 DOM 补丁**：宿主 `navIcon()` 按 section id 硬编码白名单
   （slot 注册对象无 icon 字段），书本 icon 靠 `patchSidebarIcon()` 替换 svg；
   补丁由常驻输入栏 pill 驱动一个 body 级 childList 观察器（250ms 尾随防抖、
   body 属性标记全局单例、应用生命周期存续）——设置页随时打开都能打上；
   宿主 DOM 结构变化时静默回退齿轮（best-effort），上游若开放 icon 字段应立即
   切换为官方机制。

## 11. 贡献者守则（硬规则）

1. **颜色只写令牌**：新增 UI 不允许裸 hex / 裸 rgba 出现在可见样式里
   （阴影黑、纯白 knob 等既有豁免除外）；缺令牌就先在 §2 加，两主题成对。
2. **原生组件优先**：按钮/输入/模态一律走 `NButton/NInput/NModal`；
   primitives 没有的组件（Switch/Tab/Card/Select）才自绘，且必须用 dsw 令牌对齐。
3. **单强调色锁**：品牌蓝是唯一强调色；语义红（danger）与档位蓝阶不算强调色。
4. **圆角只取集合** `{4, 8, 10, 12, 999}`（+圆点 `50%`），smoke 机械拦截。
5. **交互态三件套**：hover / active(按压) / focus(-visible)，照 §7 的既有配方。
6. **带 transition 的新类**：同步加进末尾 reduced-motion 压制名单（§8）。
7. **ES5 纯度**：var / function / 无箭头 / 无模板字符串（官方 handoff 外壳
   `factory: (require) =>` 是既有豁免）。
8. **可见文案零 em-dash**；中文注释；保持手写 bundle 风格，不引打包器。
9. 改完跑全链：`node --check client/client.js` → 重建 dist-smoke → `npm run smoke`
   （第 21 节会拦令牌 / 圆角 / em-dash / 类接线 / 档位名回归）→ `npm run build`
   → 确认 `dist/client.js` 同步。
