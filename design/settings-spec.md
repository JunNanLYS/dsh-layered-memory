# settings-spec — 记忆工作台（设置 → 记忆，五区任务导航）

> 0.9.0 UI 重构落地的事实记录（取代旧六 Tab 记忆浏览器：概览/记忆/场景/画像/成本/日志
> 四 Tab 已删，成本与日志分别并入洞察/维护）。全局令牌与守则见 `global-spec.md`；
> 会话面见 `chat-spec.md`。新组件在 `client/src/workspace/`。

## 壳（panel.tsx）

- `MemoryPanel`：sticky 任务导航（`.dsh-mem-ws-tabs`：bg-card 底 + border + lv1 影 +
  10px 圆角 + 横向滚动；role=tablist + roving tabindex 箭头键巡游），五区：
  **总览 / 记忆库 / 自动化 / 洞察 / 维护**；选中态 `aria-selected` = accent-weak 底 +
  accent-text 字重 600（`.dsh-mem-ws-tab`，8px 圆角胶囊段）；重挂载自然回总览。
- 侧边栏书本 icon 补丁照旧（`watchSidebarIcon`；历史见 pill-spec 文末归档）。

## 总览（Overview.tsx，`workspace-overview` 单发聚合）

- 健康卡：状态点（ok/warn）+ 运行文案（运行正常/检索降级/存储不可用）+ 子系统 chip
  （存储/向量检索/蒸馏队列，`.dsh-mem-chip-{ok,warn,err,biz}` 语义色 tint）+
  注意区（待蒸馏 N / 向量检索降级 / 存储降级）。
- 最近活动：`recent` 前 5 条（动词标签 + 层标签 + 标题 + 相对时间 `fmtAgoLocal`）。
- 关键数字瓦片：记忆资产 / 场景 / 本周蒸馏输出（~K 格式 + 调用数）/ 上次蒸馏。
- 引导式空状态：`empty`（L1/L2/L3 全空）时 捕获→蒸馏→召回 三步指引 + 能力确认行。
- 跳转按钮直达其余四区（`onNavigate` 回调）。轮询 15s。

## 记忆库（Library.tsx，`asset-activity` 只读资产活动流）

- 只读定位：资产经对话蒸馏演进，此处不提供任何修改入口。
- 筛选：搜索框（300ms 防抖；L1 走 FTS 检索唯一缝 + getByIds 补全时间戳，L2/L3 小数据
  内存子串）+ 类型（全部/记忆/场景/画像）+ 族（全部/日常/工作）+ 时间（今天/7 天/30 天）
  分段器（自绘 Segmented）。
- 行（`.dsh-mem-feed-*`）：动词标签（`.dsh-mem-vtag-new/-upd`：新增=ok 色 / 更新=
  accent 色，4px 圆角 tint）+ 层标签（`.dsh-mem-typetag`，inset 底）+ 标题（ellipsis）+
  相对时间 + 原生右向 chevron 图标（IconChevronRightOutline14，展开旋转 90°，过渡 .12s，进 reduced-motion 名单）。
- 原位展开：完整内容框（max-height 320 滚动）+ 元信息 dl（情境/类型/创建/更新/版本/
  来源会话）+ 复制按钮（`已复制` 2s 态）。游标分页（`nextCursor`，opaque base64url
  offset）「加载更多」；检索触达 200 上限显示 truncated 提示。

## 自动化（Automation.tsx）

- 基础控制卡：总闸/捕获/蒸馏/召回四开关（乐观更新 + 失败回滚，`settings-get/set`）+
  语义检索摘要行（`本地 · {model}` / `远程 · {model}` / `关闭`，embedding-state-get）+
  蒸馏路由摘要行（生效链首行 + 回退条数 / 跟随默认模型，llm-providers）+ 部署上限提示。
- 两处披露（`.dsh-mem-disc` + chev 旋转 90°）：**高级路由与预算**（DistillSettings，
  内含 RouteChainEditor/BudgetInputs）与**嵌入模型**（EmbeddingSection）——两组件为
  本插件既有生产组件原样迁入（其内部文案暂未全面字典化，登记为欠账）。

## 洞察（Insights.tsx）

- 三子页分段：**成本**（复用 CostTab：token-cost 趋势折线 + 层级×窗口表 + 窗口总览）/
  **活动**（`runtime-insights.activityDays` 近 7 天条形图（4px 圆角柱、逐日 title
  breakdown）+ `distill` 调用/失败表（失败 >0 红））/ **召回**（进程内全量累计行 +
  停用分布 chip：全局注入开关态 / 档位暂停会话 N / 只写覆盖会话 N；计数重启归零，
  空态如实说明）。轮询 15s。

## 维护（Maintenance.tsx，诊断优先）

- 运行健康行：存储（降级=error 点）/ 向量检索（正常/仅关键词/仅向量/未启用）/
  蒸馏队列（待处理 N / 空闲）+ 信息行（今日捕获 / 数据目录 / 插件版本）。
- 诊断日志披露（LogTab 原样迁入）；危险区（`.dsh-mem-danger`，error 色 35% 淡描边
  容器）内 RebuildPanel（原生 Modal 确认 + 进度条 + 取消）。

## 原生组件复用（原生优先）

`require("@deepseek-ai/dsh-client-ui-primitives")`——官方 seed 模块，与宿主视觉完全一致。
bundle 内 guarded require（宿主未注册时回退自绘等效实现——degrade-don't-crash）：

| 包装器 | 原生组件 | 用法 | 回退 |
|---|---|---|---|
| `NButton` | `Button`（size sm；variant ghost/primary/outline） | 全部普通按钮；确认按钮 `variant:"primary"` | `.dsh-mem-btn` 类按钮 |
| `NInput` | `Input` | 记忆库搜索框（原生结构 span>input，**布局 style 必须路由到外层 span**） | `.dsh-mem-input` |
| `NModal` | `Modal`（open/onClose/title/footer） | 重建确认模态 | `.dsh-mem-rb-overlay`/`.dsh-mem-rb-modal` |

primitives 里**没有** Switch/Tabs/Card/Badge/Select（官方消费方同样自绘），
以下等效组件用 dsw 令牌手工对齐原生观感：Switch/SwitchRow（开关）、五区任务导航、
`.dsh-mem-card`（卡片）、**NSel 自绘下拉**（高级披露内路由链编辑器在用）、
`.dsh-mem-tag`/`.dsh-mem-vtag`（标签）。

## 自绘下拉（NSel，dsh MenuDropdown 同款；高级披露内使用）

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
  选项 mousedown `preventDefault`（焦点留在触发钮——否则触发钮 blur → 包装层关面板
  → click 落空）；
- **键盘**：↑↓ 移动（wrap）、回车/空格开面板并落到当前值、Enter 选定、Esc/外点/
  焦点离开收起并还焦触发钮；aria：trigger `haspopup=listbox` + `aria-expanded`，
  面板 `role=listbox`、选项 `role=option` + `aria-selected`。

使用处：蒸馏路由链编辑器行内供应商/模型/档位三级下拉（bundle 内已无原生 `<select>`）。

## 记忆类型标签：tint 系统

7 类类型标签走"彩底淡色 + 彩字"tint 风格。实现：`--dsh-mem-tag-c` 色彩通道 +
`color-mix` 派生（`.dsh-mem-tag` + 7 类型类 + 暗色覆盖）。L1 的 7 类显示名走 i18n
字典 `type.*`（`typeLabel()`）；记忆库活动流的动词/层/族小标同思路
（`.dsh-mem-vtag` / `.dsh-mem-typetag`，4px 圆角）。

## 数据端点（host 侧装配见 src/workspace-aggregates.ts）

- `workspace-overview`：buildStats 字段 + token-cost 周窗口 + 最近活动前 5 条，
  单发聚合免去 client N+1。
- `asset-activity`：L1（`listL1` 索引 `idx_l1_updated` 范围扫描 + since 下限；检索路径
  FTS + getByIds 点查补全）+ L2 场景（list 摘要，页内切片后补读正文并剥 frontmatter）+
  L3 画像（read + mtime），按 updatedAt 混排 + base64url 游标分页 + 类型/族/时间/关键词
  筛选。设置页低频拉取设计（非 session-stats 热路径；L2/L3 文件级小数据）。
- `runtime-insights`：近 7 天逐日活动（L1 SQL GROUP BY UTC 日桶走 idx_l1_updated；
  L2/L3 内存归桶）+ llm-usage 进程计数器 + 召回注册表聚合（`recallStatsAll`）+
  档位停用分布（`SessionModeStore.countStates`：off 与 recall=false 互斥计数）。
