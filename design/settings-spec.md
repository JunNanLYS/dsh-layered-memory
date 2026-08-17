# settings-spec — 设置页记忆浏览器

组件：`MemoryPanel`（"设置 → 记忆"多 Tab 浏览器：概览+开关 / 记忆 / 场景 / 画像 / 日志，
两族混合视图）与 `RebuildPanel`（记忆全量重建）。全局令牌与守则见 `global-spec.md`。

## 原生组件复用（原生优先）

`require("@deepseek-ai/dsh-client-ui-primitives")`——官方 seed 模块，与宿主视觉完全一致。
bundle 内 guarded require（宿主未注册时回退自绘等效实现——degrade-don't-crash）：

| 包装器 | 原生组件 | 用法 | 回退 |
|---|---|---|---|
| `NButton` | `Button`（size sm；variant ghost/primary/outline） | 全部普通按钮（刷新/搜索/加载更多/取消/嵌入区块按钮）；确认按钮 `variant:"primary"` | `.dsh-mem-btn` 类按钮 |
| `NInput` | `Input` | 记忆搜索框（原生结构 span>input，**布局 style 必须路由到外层 span**） | `.dsh-mem-input` |
| `NModal` | `Modal`（open/onClose/title/footer） | 重建确认模态 | `.dsh-mem-rb-overlay`/`.dsh-mem-rb-modal` |

primitives 里**没有** Switch/Tabs/Card/Badge/Select（官方消费方同样自绘），
以下等效组件用 dsw 令牌手工对齐原生观感：Switch（开关）、Tab 下划线导航条、
`.dsh-mem-card`（卡片）、`.dsh-mem-select`（下拉）、`.dsh-mem-tag`（类型标签）。

**边界**：两套实现都要改时先改原生用法再同步回退类（视觉基线以原生为准）。

## 自有组件类（注入样式表）

| 类 | 组件 | 备注 |
|---|---|---|
| `.dsh-mem-root` | 设置页根容器 | 挂主题过渡（见 global-spec"动效"）；所有 Tab 内容在子树内 |
| `.dsh-mem-btn` / `-input` / `-select` | 回退态按钮/输入/下拉 | 仅在原生组件缺失时出场 |
| `.dsh-mem-tab`（+ `-on`） | Tab（下划线式） | active：字重 600 + 主文字色 + 2px 品牌蓝下划线 |
| `.dsh-mem-card`（+ `-hover`） | 卡片 | 浅投影；`-hover` 变体 = 可交互卡片 hover 描边加深 |
| `.dsh-mem-tag`（+ 7 类型类） | 记忆类型标签 | 见下节 tint 系统 |
| `.dsh-mem-rb-*` | 重建面板族 | card/bar/fill/muted + NModal 回退用 overlay/modal |

交互态约定：**pointer 按压必有反馈**（`scale(0.98)`，80ms）；键盘可达
（btn/tab/pill 用 `:focus-visible` 环，input/select 用 `:focus` 即时环）；
disabled 统一 `opacity 0.45 + not-allowed`。

## 记忆类型标签：tint 系统

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

## 开关（Switch，自绘）

轨道 999 胶囊：on = `--dsh-mem-accent-fill` 实底 + 白色旋钮（`--dsh-mem-thumb`），
off = `--dsh-mem-track`；旋钮 `left .15s` inline 过渡（reduced-motion 压不住，
已知限制见 global-spec）。写入走 `dsh-memory/settings-set` RPC，不另开写路径。

## 重建面板（RebuildPanel）

- `.dsh-mem-rb-card` 卡片 + 运行态进度条（`.dsh-mem-rb-bar` 8px 底 / `.dsh-mem-rb-fill`
  accent-fill 填充，`width .4s ease`；圆角 4px 是全 UI 唯一例外）；
- 确认流走 NModal（原生 Modal + footer 双按钮：ghost 取消 / primary 开始重建）；
  空库禁用 + title 提示；运行中可取消（`cancelRequested` 态按钮转"取消中…"）；
- 状态轮询 `rebuild-status`；阶段文案 `RB_PHASE_LABEL`
  （preparing / distilling / finalizing）。
