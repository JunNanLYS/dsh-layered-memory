# settings-spec — 设置页记忆浏览器

组件：`MemoryPanel`（"设置 → 记忆"多 Tab 浏览器：概览+开关 / 记忆 / 场景 / 画像 / 成本 / 日志，
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
`.dsh-mem-card`（卡片）、**NSel 自绘下拉**（见下节，dsh MenuDropdown 同款）、
`.dsh-mem-tag`（类型标签）。

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
| `.dsh-mem-scene-chev` | 场景卡折叠箭头 | ▸ 基础态 / 展开态 rotate(90deg)；`transform .15s`（进 reduced-motion 压制名单） |

交互态约定：**pointer 按压必有反馈**（`scale(0.98)`，80ms）；键盘可达
（btn/tab/pill 用 `:focus-visible` 环，input/select 用 `:focus` 即时环）；
disabled 统一 `opacity 0.45 + not-allowed`。

## 自绘下拉（NSel，dsh MenuDropdown 同款）

原生 `<select>` 的弹出列表是**操作系统画的**（方角、系统高亮色），`appearance:none`
只能改闭合态外壳——所以下拉整件自绘（对齐 dsh 输入栏模型选择器的 MenuDropdown）：

- **触发钮** `.dsh-mem-select`（button）：观感同输入框（8px 圆角、`--dsh-mem-border`/
  `--dsh-mem-bg-card`），文字 ellipsis + 右侧 CSS 描边 chevron（`.dsh-mem-sel-chev`，
  8×8 双边框旋转 45°，展开转 225°，`transform .12s`）；
- **弹出面板** `.dsh-mem-pop`：浮层圆角 12、`--dsh-mem-bg-pop`（dsw-specific-menu）+
  `--dsh-mem-border-pop` + `--dsh-mem-shadow-pop`（lv3），`top: calc(100%+6px)` 锚在
  触发钮下方，`max-height 264` 内滚（overscroll contain）；
- **选项行** `.dsh-mem-pop-opt`（**button**，dsh 同款）：10px 圆角、hover/键盘活动
  （`data-active`）底色 `--dsh-mem-bg-hover`，选中项右侧打勾（✓，text-1）；
  选项 mousedown `preventDefault`（焦点留在触发钮）——否则点击不可聚焦元素的
  mousedown 会把焦点移到 body，触发钮 blur → 包装层 onBlur 关面板 → click 落空，
  表现为"点选项无反应"（修过的事故）；
- **键盘**：↑↓ 移动（wrap）、回车/空格开面板并落到当前值、Enter 选定、Esc/外点/
  焦点离开（relatedTarget 判定）收起并还焦触发钮；aria：trigger `haspopup=listbox`
  + `aria-expanded`，面板 `role=listbox`、选项 `role=option` + `aria-selected`。

使用处：蒸馏模型供应商/模型两级、记忆 Tab 类型/情境过滤（共 4 处，bundle 内已无
原生 `<select>`）。

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

## 开关面板分组（概览 Tab）

面板（`.dsh-mem-*` 令牌卡片）内按 `S.panelLabel`（12px/600/text-3）分两组，
与页面级"记忆概况 / 运行状态"标签同款样式：

| 组 | 内容 |
|---|---|
| 记忆模式 | 总开关 + 捕获/蒸馏/召回三分项（SwitchRow×4） |
| 蒸馏参数 | 蒸馏思考（Segmented）、蒸馏模型（LlmModelRow）、输出预算（BudgetInputs） |

语义检索（EmbeddingSection）与重建（RebuildPanel）是面板外的独立区块，各自带标题。

## 开关（Switch，自绘）

轨道 999 胶囊：on = `--dsh-mem-accent-fill` 实底 + 白色旋钮（`--dsh-mem-thumb`），
off = `--dsh-mem-track`；旋钮 `left .15s` inline 过渡（reduced-motion 压不住，
已知限制见 global-spec）。写入走 `dsh-memory/settings-set` RPC，不另开写路径。

### 蒸馏思考选择器（Segmented，跟随记忆模式开关面板）

选项**跟随当前生效模型的能力声明**：`settings-get` 返回的 `effort.options`
（`resolveModelInfo().reasoning.efforts`，5s 轮询随模型切换自动刷新）；模型未声明
档位时只显示 `high`（用户规则：无声明默认 high）。**首项固定「自动」（key=''）**，
点击回写空串 = 按模型能力解析（模型默认档 → high，服务端 `decideSendableEffort`
解析）——选过显式档位后仍可经首项回到自动。选择器值：`effort.current` 为 '' 或
在表内用它，否则高亮 `effort.effective`（失效档位的实际发送值），再否则 `high`。
描述行展示 `effort.effective`（'' = "不传，跟随模型默认"）+ "（自动）"后缀
（current 为空时）。写入同样走 `settings-set`（`reasoningEffort` 键；'' 是合法
值，服务端白名单与 schema 同源 `EFFORT_CHOICES`）。乐观更新必须**同时**写
`settings.reasoningEffort` 与视图字段 `effort.current/effective`——选择器只读
后者，漏掉会在下一个 5s 轮询前弹回旧值（已修过的不同步点）。

### 蒸馏模型选择器（LlmModelRow，供应商/模型两级下拉）

位于思考选择器之后，同属开关面板（记忆模式关闭时随面板禁用）。数据源
`dsh-memory/llm-providers`（5s 轮询：`providers` 供应商目录 / `default` 默认选择 /
`current` 运行时覆盖 / `effective` 实际生效路由 / `pinned` 部署 pin 位）与
`dsh-memory/llm-models`（选供应商后按需拉取）。要点：

- 两级 NSel 自绘下拉（供应商：首项"跟随默认（当前默认路由）"→ 模型：**无
  "跟随默认"，只列具体模型**）；选供应商先入**本地草稿**（不打设置），模型列表
  到手后**自动落第一个模型**（当前覆盖模型不在该供应商列表时成对提交
  `distillProvider`/`distillModel`）；手动挑模型同样成对提交（单字段不算覆盖，
  effectiveCfg 语义）；
- **无真空期**：模型列表按供应商缓存在模块级 `modelsCache`（面板加载时后台预取
  全部供应商，llm-providers 轮询兜底补漏），切换供应商时缓存命中**同步渲染**
  （后台仍刷新一遍）；未命中才显示禁用态占位"加载模型列表…"（不再是上一供应商
  的过期模型名）；失败整体回滚；
- **乐观更新必须写视图键**：`writeLlm` 把覆盖映射成 `current.provider/model` +
  同步推导 `effective`（"当前生效"描述行）。**坑**：直接把 settings 键
  `distillProvider/distillModel` 合并进 `info.current` 对显示层是空操作（按钮文本
  读 `.provider/.model`），文本要等 5s 轮询才变——0.8.2 后修掉的按钮延迟真因；
- 写入在途（`pendingWrites` 计数）时 `refreshInfo` 丢弃轮询响应（在途请求读到
  写入前的旧值，直接 set 会闪回旧文本）；settings-set 成功后立即拉一次
  llm-providers 收敛服务器真值；
- 供应商"跟随默认"一次提交双空串清掉覆盖；失败回滚（草稿一并恢复）；
- **部署 pin**（`pinned=true`，cordis.patch.yml 的 `llm.provider`+`llm.model` 双字段
  齐）：选择器不出场，改为静态文本"已由部署配置固定：provider / model（如需在
  页面切换，请移除 profile cordis.patch.yml 中 llm 的 provider/model 覆盖）"；
- **降级手输**：适配器 `listModels` 返回空列表时模型下拉换成 `NInput`（回车提交）；
- **失效提示**：已存覆盖的供应商/模型不在列表（用户在宿主侧删掉）时注入
  "（已不在列表）"选项并红字提示蒸馏调用可能失败（danger 色，12px）。

### 蒸馏预算（BudgetInputs，蒸馏参数组）

两行：**输出预算**（四个数字输入，宽 92px：抽取 / 去重 / L2 场景 / L3 画像，单位
token）与**输入预算**（单个输入，宽 120px，单位字符 ≈token）。数据源
`settings-get` 的 `budgets`（`current` 运行时覆盖，0 = 跟随默认；`defaults`
内置默认 16k/8k/32k/16k，作 placeholder；`effective` 实际生效，描述行展示）与
`inputBudget`（`current` 0 = 跟随配置；`fallback` 静态配置 `llm.maxInputChars`；
`effective` 实际生效）。写入：输出四键走 `settings-set` 的 `distillBudgets` 成对
提交；输入走 `distillMaxInputChars` 单键（0 或 1000~100 万，与静态 schema 同款
下限）。击键只入本地草稿，blur/回车才提交（焦点切换先 blur 旧框，逐框触发各自
提交）；乐观更新同步 `settings.*` 与对应视图字段，失败回滚。输出预算描述行注明
思考档 high/xhigh/max 的 ×4 放大只作用于输出预算。

## 场景 Tab（ScenesTab）

L2 场景块列表。每块一张 `.dsh-mem-card dsh-mem-card-hover` 卡片（`SceneCard`
子组件，逐卡独立开合态）：**默认收起**，只显示头部（折叠箭头 ▸ + 场景文件路径 +
热度 + 更新时间）与摘要行；点击头部整行切换展开/收起，展开时渲染正文 `<pre>`
（S.pre）。箭头 `.dsh-mem-scene-chev` 展开态旋转 90°。交互范式与记忆 Tab 的
点击展开卡同款（cursor pointer + hover 描边加深；头部 userSelect 关闭防误选）。

## 成本 Tab（CostTab）

蒸馏 token 成本看板（`dsh-memory/token-cost` RPC，5s 轮询刷新；只读）。结构自上而下：

- **控件行**：层级过滤（Segmented：全部/L1/L2/L3）+ 趋势粒度（Segmented：日/周/月）+
  「近N天」按钮（展开内联输入行：NInput 正整数，清空=默认窗口；超保留期由后端回退）+
  「刷新」。
- **成本趋势（按模型）**：自绘 SVG 折线（viewBox 600×200，折线走
  `var(--dsh-mem-chart-1..8)` 按模型名序循环取色，轴线/刻度文字用 border/text-3 令牌）；
  图例色块 10×10、圆角 4。近 N 天模式后端强制日粒度（N 个日桶），横轴日期格式化
  跟随后端实际粒度（trend.granularity）而非用户所选。无数据时整块替换为
  muted 占位文案（"暂无成本数据…"）。
- **层级成本（输出 token）表格**：行=L1/L2/L3（l1 = l1-extract + l1-dedup 归并），
  列=今日/本周/本月/累计四窗口，格=调用数 + 输出/思考 token + avg/median
  （median 由 JS 侧计算，SQLite 无内置函数）。
- **按模型（累计）**：infoRow 列表，键为 `provider/model` 复合键。

数据口径：输入按**字符**（llm 流 usage 拿不到输入 token，沿用 llm-usage 口径），
输出/思考按 token；明细保留期 = `tokenCost.retentionDays` 配置（默认 365，0=永久），
写入时滚动清理。空 `byModel`/`byLayer` 时表格/列表渲染空态。

## 日志 Tab（LogTab）

`log-tail` RPC 拉最近 200 行（memory.log）平铺进单个 `<pre>`（S.pre，自身即滚动
容器：maxHeight 480 + overflow auto）。**加载/刷新后默认滚到最底**——看日志的
用户意图是最新的尾部（tail 语义），`lines` 变化即贴底（`scrollTop =
scrollHeight`，经 ref 直接操作，无动效）；只有手动"刷新"会打断向上回看的历史
位置（无自动轮询，不打扰阅读）。

## 重建面板（RebuildPanel）

- `.dsh-mem-rb-card` 卡片 + 运行态进度条（`.dsh-mem-rb-bar` 8px 底 / `.dsh-mem-rb-fill`
  accent-fill 填充，`width .4s ease`；圆角 4px 是全 UI 唯一例外）；
- 确认流走 NModal（原生 Modal + footer 双按钮：ghost 取消 / primary 开始重建）；
  空库禁用 + title 提示；运行中可取消（`cancelRequested` 态按钮转"取消中…"）；
- 状态轮询 `rebuild-status`；阶段文案 `RB_PHASE_LABEL`
  （preparing / distilling / finalizing）。
