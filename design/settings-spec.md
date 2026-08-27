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

使用处：蒸馏路由链编辑器行内供应商/模型/档位三级下拉、记忆 Tab 类型/情境过滤
（bundle 内已无原生 `<select>`）。

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
| 蒸馏参数 | 蒸馏路由链（RouteChainEditor）、输出预算（BudgetInputs） |

语义检索（EmbeddingSection）与重建（RebuildPanel）是面板外的独立区块，各自带标题。

## 开关（Switch，自绘）

轨道 999 胶囊：on = `--dsh-mem-accent-fill` 实底 + 白色旋钮（`--dsh-mem-thumb`），
off = `--dsh-mem-track`；旋钮 `left .15s` inline 过渡（reduced-motion 压不住，
已知限制见 global-spec）。写入走 `dsh-memory/settings-set` RPC，不另开写路径。

### 蒸馏路由链编辑器（RouteChainEditor，统一列表）

取代旧「蒸馏思考」全局切换器与「蒸馏模型」单路由选择器（两者已删除）：**一张有序
列表 = 完整路由故事**——第 1 行是主路由（徽标「主」），第 2..N 行按序降级（回退
链，ADR-0004 语义：失败 = 报错/掐断/网络异常/空输出，每路由全额超时）；**档位
逐路由设置**（行内第三级下拉，缺省「跟随部署配置」= 静态 `llm.reasoningEffort`，
仍过服务端能力钳制）。写入走 `settings-set` 的 `distillChain`（数组；空数组 =
跟随部署配置与默认模型）。

数据源：`llm-providers`（5s 轮询）新增的 `chain` 块——`current` 运行时链（含
旧键 `distillProvider/distillModel` 的单行投影，`projectDistillChain` 仅作展示、
不参与生效逻辑）/ `static` 部署回退链 / `effectiveChain` 实际链（buildRouteChain
去重后、每条带档位候选）/ `source`（runtime|static）；`llm-models` 每模型附
`efforts` 档位能力表（行内档位下拉数据源）。模型目录沿用模块级 `modelsCache`
（面板加载预取全部供应商，切换同步渲染），写入在途 `pendingWrites` 丢弃轮询
响应，乐观更新写 `chain.current` 视图。

状态机：

- **pinned**（部署静态 pin）：整区块只读——实际链逐行展示（effort 候选随行）+
  「部署已锁定路由」说明（运行时链整体失效，effectiveCfg 语义）；
- **跟随态**（运行时链空）：只读展示实际链（主路由行显示解析出的默认模型）+
  「编辑为运行时链」——拷贝部署静态回退链为草稿（主路由保持跟随默认），保存
  第一刻起运行时链接管；
- **编辑态**：行式编辑器（下述）+ 底部「清空并跟随部署配置」（ghost 钮）与
  「保存」+ 实际链摘要行（服务端 effectiveChain 值，有未保存修改时注明）。

行编辑器细则：

- 行结构（两行）：控件行 = 徽标（主/序号，定宽 20）+ 供应商 NSel（flex 1 / min
  150）+ 模型 NSel（flex 1 / min 150；或降级 NInput，供应商无目录时回车提交）+
  档位 NSel（定宽 118——词表固定且短，「跟随部署配置」/off/low/high…；未选定
  模型时禁用），flexWrap 兜底窄面板；操作行 = ↑ ↓ ✕（NButton 26×26 图标钮，
  inline 覆盖 padding）**右下角对齐**（justifyContent flex-end，不与控件行
  混排）。行卡片 `--dsh-mem-bg-inset` 底、8px 圆角、校验失败 danger 描边；
- **位置即优先级**：第 2 行 ↑ = 与主路由互换；主路由为空（跟随默认）时是**顶替**
  （空行不保留——回退行必须显式）；空主路由的 ↓ 禁用；主路由 ✕ = 重置为跟随
  默认（回退行保留）；
- 主路由行供应商首项「跟随默认模型（解析出的默认路由）」，模型可留空；回退行
  必须显式（保存校验：行内红字；服务端 `validateDistillChain` 同规则拒收兜底，
  另拒收 provider/model 超长 >200 字符与非词表档位——粘贴兜底；行数 >8 保存前
  拦截）；模型目录加载中（供应商已选、目录未回）模型 NSel 禁用占位
  「加载模型列表…」，目录为空数组才降级 NInput；
- 空主路由行下有说明行「跟随默认模型：P / M（档位跟随部署配置，选定模型后
  可单独设置）」；
- 上限 8 条（`DISTILL_CHAIN_MAX`，UI 与服务端同限，达限添加钮禁用；跟随态
  fork 静态链时截到 7 条回退——静态 fallbacks 无条数上限）；**同供应商+模型即
  视为重复**（含与主路由；档位不同也算——运行时同路由本就会去重跳过）保存时
  拒绝；行内档位下拉只列词表内档位（bundle 内 `EFFORT_VOCAB` 与 config.ts
  `EFFORT_CHOICES` 同源，适配器声明的表外 id 先过滤——防"能选出、存不进"）；
- 供应商失效（不在 providers 列表）：行内红字警示「调用会失败并被链跳过（不
  阻止保存）」+ 选项注入「（已不在列表）」；模型不在列表同款注入（手输 NInput
  非编辑态回填已设模型 id——无目录供应商的行 NInput 是唯一模型展示位）；
- 新行默认供应商 = 主路由供应商（未选时取目录第一个）；
- 保存钮 `variant:"primary"`（原生 Button primary，回退类无此属性自动剥离）；
  乐观更新除写 `chain.current` 外同置 `source:"runtime"`；「清空并跟随部署
  配置」连带清旧运行时键（distillProvider/distillModel/reasoningEffort）——
  链空时旧键覆盖会复活，新 UI 已无旧键编辑入口，不清即永久滞留。

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

`scope` 参数（#34，缺省 `'all'` 原样）：`'input'`（仅输入行，全局面板用）|
`'l1' | 'l2' | 'l3'`（仅该层输出——l1 = 抽取+去重两行；层面板用）。提交仍整组
四键（未编辑键带当前值回写，面板间互不清零）。scoped 模式无描述句——生效值与
放大规则挂标签 title tooltip（'all' 保留原描述行）。

### 蒸馏设置区分段壳（DistillSettings，#34 B 形态）

概览 Tab「蒸馏参数」组的新外壳，把路由链与预算按**范围**组织（原型
`.scratch/layer-routes/proto-layer-settings.html` 三轮肉眼检查定稿的 B 案）：

- **一行提示兼图例**（11px text-3，无底色条）：`● 自定义 · ◌ 部署 YAML · ○ 跟随
  全局（层链优先于全局）`——优先级全句挂该括号的 title tooltip（文案极简约定：
  解释进 tooltip，不占版面）；
- **范围分段**（controls.Segmented，SegOption 增 title）：[全局默认 | L1 | L2 |
  L3]，每层分段带状态点——蓝实心 = 运行时自定义 / 空心（text-3 描边）= 静态
  YAML / 灰（track）= 跟随全局；分段 title 与面板头部徽章 title 承载状态语义
  （如"部署 YAML 层链（UI 只读，自定义可覆盖）"）。状态点数据源
  `llm-providers` 的 `layerChains.<层>.source`（host 侧与解析真值同径，5s 轮询）；
- **全局默认面板**：头部「在用：哪些层」标注（source 为 global 的层；配齐则
  「当前无层使用」）+ RouteChainEditor（scope global）+ BudgetInputs（scope
  input）；无说明段落；
- **层面板**：标题（L1 · 抽取 / 去重 等）+ 三态徽章（title 承载状态语义）+
  RouteChainEditor（scope 层键）+ BudgetInputs（scope 同层键）；无说明段落
  （#34 文案极简：状态交给徽章/圆点、归属交给只读行降灰、动作交给按钮自命名、
  解释进 tooltip）。

RouteChainEditor 的 `scope` 参数化（缺省 global 原样）：层范围读写
`settings-set` 的 `distillLayerChains.<层>`（空数组 = 该层回到跟随，无旧键要连带
清）；**头行必须显式供应商+模型**（无「跟随默认模型」选项，主路由行删除改为
顶替/无操作）；跟随态三态展示——只读行列表（roRow 降灰 text-2 = 非本面板可编辑的视觉自释）
+ **「自定义本层链」按钮紧跟列表**（fork 静态链为草稿 / 无静态则空草稿），无
说明行；编辑态描述行短语化（「主路由失败，按序降级」/「主路由失败，只降级到
本层回退」，全句挂 title）；pinned 提示单行化；编辑态清除按钮文案
层范围为「清除自定义 · 跟随全局」且用 danger 描边形态（红字红边 ghost——破坏性动作，
danger 令牌"危险动作"语义；全局范围保持「清空并跟随部署配置」原 ghost）；
pinned 时按层只读（静态层链照常生效提示）。**切范围 = key 重挂载**（编辑草稿
是组件内部态，不重挂会把上一范围草稿带进下一范围——验收实例复用 bug 的修复；
切范围丢弃未保存草稿）。服务端写入门
`validateDistillChain(entries, {requireExplicitHead:true})` 同规则拒收
（「层路由 l1：<错误>」信封）。

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
