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

| 令牌 | 浅色 | 暗色 | 用途 |
|---|---|---|---|
| `--dsh-mem-bg-card` | dsw bg-layer-2，fallback `#ffffff` | 同左，fallback `#232734` | 卡片 / 面板 / 输入控件底 |
| `--dsh-mem-bg-inset` | dsw bg-secondary，fallback `#f6f7fb` | 同左，fallback `#1a1e29` | 代码块 / 分段选择器轨道 / 未加载 pill 底 |
| `--dsh-mem-bg-hover` | `rgba(77,107,254,0.07)` | `rgba(110,133,255,0.10)` | 按钮 hover 淡彩底 |
| `--dsh-mem-border` | dsw border-secondary，fallback `#e3e6ee` | 同左，fallback `#333950` | 常规描边 / 分隔线 |
| `--dsh-mem-border-strong` | `#c9cede` | `#454c68` | hover 加深描边 |
| `--dsh-mem-text-1` | dsw label-primary，fallback `#1f2328` | 同左，fallback `#e6e9f2` | 主文字 |
| `--dsh-mem-text-2` | dsw label-secondary，fallback `#59626e` | 同左，fallback `#a8b0c2` | 次文字 / detail |
| `--dsh-mem-text-3` | dsw label-tertiary，fallback `#6e7781` | 同左，fallback `#8892a6` | 提示 / 标签 / muted |
| `--dsh-mem-danger` | `#d0403f` | `#f4707b` | 错误文字 / 危险按钮 |
| `--dsh-mem-thumb` | `#ffffff` | `#e8ebf5` | 滑块圆头 / 开关旋钮 |
| `--dsh-mem-track` | `rgba(128,140,150,0.32)` | `rgba(148,160,180,0.30)` | 滑轨 / 进度条底 |
| `--dsh-mem-dot` | `rgba(128,140,150,0.55)` | `rgba(148,160,180,0.5)` | 未激活停点 |
| `--dsh-mem-shadow-card` | `0 1px 2px rgba(20,24,40,0.05)` | `0 1px 2px rgba(0,0,0,0.3)` | 卡片浅投影 |

### 2.2 会话档位色（输入栏 pill / 滑动选择器 / 概览默认档）

| 令牌 | 浅色 | 暗色 | 语义 |
|---|---|---|---|
| `--dsh-mem-mode-off` | `#6e7781` | `#98a2ad` | 关闭 |
| `--dsh-mem-mode-chat` | `#1a7f37` | `#3fb950` | chat（个人族） |
| `--dsh-mem-mode-work` | `#9a6700` | `#d29922` | work（工作族） |
| `--dsh-mem-mode-auto` | `#3d5be0` | `#7b90ff` | 自动（默认档，品牌蓝系） |

pill 的半透明衍生色用 `color-mix(in srgb, <档位色> 45%/10%, transparent)`
（border / 淡彩底）——**var() 引用不能拼 hex alpha 后缀**（`color + "66"` 写法对 var 无效）。

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

例外（有意为之）：重建确认主按钮 `.dsh-mem-rb-primary` 用红 `#cf222e`/`#b62324`
（破坏性操作的语义警告，不归入强调色体系）。

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

## 7. 组件类清单（注入样式表）

| 类 | 组件 | 备注 |
|---|---|---|
| `.dsh-mem-root` | 设置页根容器 | 挂主题过渡（§8）；所有 Tab 内容在子树内 |
| `.dsh-mem-btn` | 次级按钮 | hover 淡彩底 + 描边加深；`:active` 按压缩放 `scale(0.98)`；`:focus-visible` 焦点环 |
| `.dsh-mem-input` / `.dsh-mem-select` | 输入框 / 下拉 | 聚焦 = 品牌蓝描边 + 3px `accent-weak` 光环（`:focus`，输入类即时环） |
| `.dsh-mem-tab`（+ `-on`） | Tab（下划线式） | active：字重 600 + 主文字色 + 2px 品牌蓝下划线 |
| `.dsh-mem-card`（+ `-hover`） | 卡片 | 浅投影；`-hover` 变体 = 可交互卡片 hover 描边加深 |
| `.dsh-mem-tag`（+ 7 类型类） | 记忆类型标签 | 见 §4 |
| `.dsh-mem-flow` | auto 档 pill 流光 | 品牌蓝族 conic 旋转光带；内层必须**不透明**底（color-mix 出 alpha=1）盖住光带，防文字被光斑干扰（实测事故）；不支持 `@property` 的浏览器整条 background 退化（2026 常青浏览器均已支持） |
| `.dsh-mem-glass` | 浮层玻璃材质 | `backdrop-filter` 材质层必须是**无 transform 的独立元素**（Chromium 上 transform 元素的 backdrop-filter 采样失效，实测）；`prefers-reduced-transparency` 回退实底 |
| `.dsh-mem-rb-*` | 重建面板族 | card/btn/danger/primary/bar/fill/overlay/modal/muted |

交互态约定：**pointer 按压必有反馈**（`scale(0.98)`，80ms）；键盘可达
（btn/tab 用 `:focus-visible` 环，input/select 用 `:focus` 即时环）；
disabled 统一 `opacity 0.45 + not-allowed`。

## 8. 动效

| 动效 | 参数 | 降级 |
|---|---|---|
| 主题切换过渡 | `.dsh-mem-root, .dsh-mem-root *` 上 `background-color/border-color/color/box-shadow .18s ease`（只挂 paint 属性，不碰 transform） | `prefers-reduced-motion` → `none` |
| 按压反馈 | `transform .08s ease`（`.dsh-mem-btn` 自有 transition） | 同上（reduced-motion 块末置压制） |
| 流光 | `dshMemFlow 3s linear infinite`（`@property --dsh-mem-angle` 注册角度插值） | 同上 → `animation: none` |
| 玻璃浮层 | 常态材质，无进出场动画 | `prefers-reduced-transparency` → 实底去 blur |
| 重建进度 | `.dsh-mem-rb-fill` `width .4s ease` | 同上 |
| 开关旋钮 / 滑块吸附 | inline `left .15s` / `120ms ease` | inline 优先级高于样式表媒体查询，无法被压制（已知限制，见 §10） |

**reduced-motion 兜底块必须放在样式表末尾**：同特异性（0,1,0）下后置声明才能
压过前面的组件类 transition；新增带 transition 的类要同步加进该块的压制名单。

## 9. 无障碍标准

- 文字对比度 WCAG AA（≥4.5:1）：强调文字档、tint 标签 14 组、三级文字 fallback、
  档位色文字——全部复算达标（§2~§4 表内数值）。
- 图形对比度（≥3:1）：焦点环、Tab 下划线、流光边。
- 实底白字（≥4.5:1）：accent-fill 双主题、rb-primary 双主题、徽章固定色。
- 焦点可见：btn/tab `:focus-visible` 2px 环；input/select `:focus`。
- `prefers-reduced-motion` / `prefers-reduced-transparency` 双降级（§8）。
- 可见文案**零 em-dash**（用 `-`、`：` 或改句；smoke 断言字符串字面量）。

## 10. 已知限制（改动前必读）

1. **inline transition 不受 reduced-motion 压制**：开关旋钮（`S.knob`）与滑块圆头
   的 transition 是 React inline style，样式表媒体查询物理上盖不过行内优先级。
   修复需要组件侧读 `matchMedia`，当前接受（位移动画幅度小、时长短）。
2. **浅色三级灰 `#6e7781` 余量薄**（4.547:1）：GitHub 标准灰，当前合规；
   宿主背景若比纯白略暗需复核。
3. **dsw 令牌缺失时 fallback 自负**：中性色链 dsw 是"信任宿主"设计；宿主未定义
   dsw 变量的场景（理论存在）落自带 fallback，已保证双主题各自正确。
4. `color-mix` / `@property` / `backdrop-filter` 要求 Chromium 111+（2023 起的常青版本）；
   更老浏览器：tint 标签与流光退化、玻璃失效，文字与布局不受影响。

## 11. 贡献者守则（硬规则）

1. **颜色只写令牌**：新增 UI 不允许裸 hex / 裸 rgba 出现在可见样式里
   （阴影黑、纯白 knob 等既有豁免除外）；缺令牌就先在 §2 加，两主题成对。
2. **单强调色锁**：品牌蓝是唯一强调色；语义红（danger）与档位色不算强调色。
3. **圆角只取集合** `{4, 8, 10, 12, 999}`（+圆点 `50%`），smoke 机械拦截。
4. **交互态三件套**：hover / active(按压) / focus(-visible)，照 §7 的既有配方。
5. **带 transition 的新类**：同步加进末尾 reduced-motion 压制名单（§8）。
6. **ES5 纯度**：var / function / 无箭头 / 无模板字符串（官方 handoff 外壳
   `factory: (require) =>` 是既有豁免）。
7. **可见文案零 em-dash**；中文注释；保持手写 bundle 风格，不引打包器。
8. 改完跑全链：`node --check client/client.js` → 重建 dist-smoke → `npm run smoke`
   （第 21 节会拦令牌 / 圆角 / em-dash / 类接线回归）→ `npm run build` → 确认
   `dist/client.js` 同步。
