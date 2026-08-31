# slider-spec — 悬浮板滑动选择器

> **已废弃（0.9.0 UI 重构）**：独立悬浮板随分散式会话记忆面（`chat-spec.md`）移除。
> 滑条本体以 **Codex 式内联滑条**形态复活在记忆芯片级联菜单内（`grid-rows` 原地长高、
> 三停点 日常/工作/智能、键盘方向键/Home/End + aria-valuetext），会话信息区拆解为
> 官方上下文环面板记忆分项（`memory-meter-spec.md`）与统计行 `待蒸馏 N` 遥测。
> 本文件仅作历史事实归档；改滑条行为请读 `chat-spec.md`。

组件：`ModeSlider`（点击记忆 pill 展开的档位滑动选择浮层，macOS 滑动器交互参考）
及其下半部的 `SessionInfoArea` 会话信息区。全局令牌与守则见 `global-spec.md`；
档位定义见 `pill-spec.md`。

## 浮层（.dsh-mem-popover）

**dsh 原生菜单同配方**（不透明实底，与 dsh 原生悬浮卡片一致）：

- 底：`--dsh-mem-bg-pop`（dsw-specific-menu → bg-layer-3）；
- 描边：`--dsh-mem-border-pop`（border-inverted，浅色不可见）；
- 投影：`--dsh-mem-shadow-pop`（lv3）；
- 圆角 12；上下内边距对称 `14px 16px`（滑轨垂直居中、浮层紧凑——
  早期为气泡预留 38px 顶内边距的 asymmetric 布局已废）；
- `overflow: visible`：拖动气泡溢出到浮层上方；
- 外壳 `position: absolute; bottom: calc(100% + 8px); left: 50%; translateX(-50%)`
  悬浮在 pill 上方，zIndex 1000。

## 滑轨几何

常量：`TRACK_W = 200` / `RAIL_H = 22` / `THUMB = 16`（含 1px 描边，可视 14）/
`INNER_W = TRACK_W - THUMB = 184`（thumb 活动范围）。粗滑轨 22px **包裹**圆球
（球顶 `(RAIL_H-THUMB)/2 = 3`，被轨包裹不凸出）。

- 轨底 `--dsh-mem-track`，圆角 999；
- 停点刻度：4 个 6px 圆点（`--dsh-mem-dot`），左缘
  `i/3 * INNER_W + THUMB/2 - 3`，zIndex 2（浮在填充上、球下）；
- 圆球：`--dsh-mem-thumb` 底 + 1px `--dsh-mem-accent` 描边，拖拽时阴影加重
  （`0 2px 8px` vs 静止 `0 1px 4px`）。

## 填充

- **几何**：从滑轨左端铺到**圆球右缘**——`left: 0; width: thumbLeft + THUMB`，
  整颗圆球落在填充末端上与其**重合**（无空隙不割裂）；auto 档恰好全轨蓝
  （184+16=200），任何档位不超出轨道。
- **颜色**：从左往右渐变，左侧浅（`--dsh-mem-fill-1`）到球侧深（`--dsh-mem-fill-2`）。
- **显隐两分支**（`activeIdx > 0 || drag !== null`）：
  - 静态关闭档（off 且未拖拽）**不渲染**；
  - 拖拽中无论预览到哪档（含关闭区）**恒显示**，松手落 off 才随提交消失；
  - `activeIdx` 与拖动气泡档名同源（`Math.round(thumbLeft / INNER_W * 3)`）。
- **吸附动画**：松手时 `width` 与圆球 `left` 同条件同走 `width/left 120ms ease`
  （拖拽中两者 `transition: none` 保 1:1 跟手）——等差恒定，填充右缘与球右缘不分离。

## 粒子层（canvas 点阵粒子场）

轨道填充区内的**离散点阵粒子场**（视觉主体取 DSH-Claude-Style-Reasoning-Slider
的点阵路线；配色锁品牌蓝单色系；场强随档位升级——"越智能越活跃"）：

- **载体**：`<canvas class="dsh-mem-particles">` 覆盖滑轨（`pointerEvents: "none"`
  不挡拖拽，zIndex 2——填充 1 之上、圆球 3 之下）；DPR 适配（ratio ≤ 2）+
  `ResizeObserver` 重设画布 + `setTransform`。
- **网格**：resize 时预计算点阵（cell 5px / gap 1.1，200×22 → 40 列 × 5 行 ≈ 200 格），
  每格带 base/tempo/phase 三个静态哈希——逐帧只做时间维运算。
- **档位场强**（`FIELD_TIERS`，tier 与填充/气泡同源 `activeIdx`，拖拽预览即时升降级）：

| 档位 | density 密度门 | alpha 亮度 | wave 水波纹 | tempo 节拍 |
|---|---|---|---|---|
| 关闭 | —（整层不画） | — | — | — |
| 日常 | 0.34 | 0.5 | 无 | 1 |
| 工作 | 0.55 | 0.78 | 有 | 1.15 |
| 智能 | 0.72 | 1 | 有 | 1.3 |

- **每格渲染**：密度门 `base > density - near*0.3` 跳过（近球更密）；
  独立随机闪烁 `sin(elapsed*0.012*tempo + tempo*2π + phase*2π)`；
  明暗水波纹（1200ms 一轮从球向外，未开波纹的档位给 0.62 常量底）；
  展开 900ms（`smoothstep`，近球先亮向外渐显，show 翻真时起算）；
  α = `(0.26 + 0.44*flicker + near*0.28) * (0.28 + 0.72*wave) * reveal * tier.alpha`。
- **着色**：基色→高亮色双停插值（flicker×wave 双高才发白）——暗色
  `rgb(124,144,250) → rgb(214,224,255)`、浅色 `rgb(61,91,224) → rgb(126,148,250)`。
- **浅色混合**：`body:not([data-ds-dark-theme]) .dsh-mem-particles
  { mix-blend-mode: multiply; opacity: 0.82 }`——深蓝点乘在浅蓝填充上沉显对比。
- **拖拽全套增强**：闪烁节拍 ×2 + canvas 滤镜
  `saturate(1.45) brightness(1.28) contrast(1.06)`。
- **裁剪**：`roundRect(0, 0, 填充右缘, height, height/2)` 胶囊形（与滑轨同圆角）；
  不支持 roundRect 回退矩形。
- **显隐与填充同源**：`show = activeIdx > 0 || drag !== null`——静态关闭档无场，
  拖拽中恒有（预览到关闭区时 tier=0 → density 0 → 无格通过，同样无场）；
  活动区右界 = 填充右缘（**不越过圆球**）。
- **动画循环**：`requestAnimationFrame` + 33ms 节流（≈30fps）；effect 依赖数组为空
  （几何/档位/拖拽态经 `geoRef` 每帧渲染写入、循环跨帧读取）；卸载时
  `cancelAnimationFrame` + disconnect。主题翻转由 body `data-ds-dark-theme` 的
  MutationObserver 兜底（动画循环每帧自读）。
- **降级**：`prefers-reduced-motion: reduce` 不启动循环，只画一帧静帧
  （reveal 直接取 1；状态/主题变化时由观察器触发重画）。

## 拖拽交互

- Pointer capture；`xFromClientX` 按 track rect 连续映射（clamp 0..INNER_W）；
- 速度 EMA（`v = v*0.7 + instV*0.3`）：瞬时抖动不放大；
- 松手动量投影（Designing Fluid Interfaces）：`projected = x + clamp(v*120, ±30)`
  就近吸附——甩动最多把边界推到相邻档，**绝不会跳两档**；
- 松手 `onCommit(MODES[idx].key)`；气泡随 `drag` 状态消失。

## 拖动气泡（.dsh-mem-bubble）

拖拽期间在圆球上方显示当前档位名（`MODES[activeIdx].label`），随圆球移动，松手即消失：

- **贴近圆球**：悬停 `bottom: calc(100% + 8px)`（相对滑轨），尖角尖端距球顶约 5px；
- **层级高于浮层**：zIndex 4（同层叠上下文内数值比较，浮层无 z-index），
  跨过浮层上缘时盖在其上；
- **材质**：浮层同材质——`--dsh-mem-bg-pop` 底 + `--dsh-mem-text-1` 字
  （浅色白底深字 / 暗色深底浅字，随主题翻转）+ `--dsh-mem-border` 描边 + 投影
  （`0 2px 8px rgba(0,0,0,0.18)`）；**tooltip-bg 令牌已弃用**（它在浅色下仍是深色，
  黑底白字不随材质走，实测视觉错误）；
- **尖角 = 双 clip-path 倒三角叠画**：`::before` 描边色三角（12×7）在下、
  `::after` 填充色三角（10×6）叠上，`polygon(0 0, 100% 0, 50% 100%)`——
  旋转方块方案会露出上半截成**菱形**（实测视觉缺陷）；双三角让同材质尖角
  压在浮层区域也有轮廓可读；
- 气泡居中于圆球中心（`left: thumbLeft + THUMB/2; translateX(-50%)`）。

## 错误显示

`props.error` 在滑轨下方 11px danger 色一行（`whiteSpace: nowrap`）。

## 注入三态行（#38 只写不读）

滑轨（族维度）正下方、会话信息区上方的一行分段控件——档位与注入正交分立的 UI 落点：

- **布局**：`border-top: 1px solid --dsh-mem-border`（上 10px 下 8px）+ 左标签右分段的
  `space-between` 行；标签「注入」两字 12px text-3（文案极简约定：无解释行，
  语义进 Segmented 各项 title tooltip）；
- **分段**：复用 `ui/controls.tsx` 的 `Segmented`（设置页同款令牌样式），三态
  「跟随全局 / 开 / 关」——`跟随全局` = 清除会话覆盖（recall null），`关` = 只写
  （强制关），`开` = 强制开；当前值来自 `session-mode-get` 的 `recall`；
- **off 档禁用**：档位关闭 = 完全隐身（包含注入），分段 `disabled` 置灰；
- **提交**：乐观更新 + RPC 失败回滚（与档位 commit 同款）；清除覆盖后的解析值由
  `session-mode-set` 响应的 `recallResolved` 回填（client 不自猜全局开关）。

## 会话信息区（SessionInfoArea，滑轨下方）

浮层下半部：分隔线（1px `--dsh-mem-border`，上 12px 下 10px）+ 2×2 指标网格 +
可选状态行 + 全局摘要行。宿主不支持 / 未传 `rpc`/`sessionId` 时整体不渲染
（best-effort 增强，不占位）。

### 数据策略（性能契约）

- **唯一数据通道**：`dsh-memory/session-stats` 端点。热路径设计——宿主侧只允许
  内存注册表读取（recall 统计 / runner 会话视图 / live 开关 / 档位 Map）与
  索引化 SQL 点查（`countL0BySession` 走 `idx_l0_session_id`），
  **禁止任何文件读/目录扫描**（`scenes.list()` / `persona.read()` 级别的 I/O
  会把每次轮询变成数十毫秒全量读；`stats.ts` 的 `SessionInfoSource` 注释为
  实现侧硬规则）。全局慢变字段（degraded / pendingTotal / lastExtractAt）取
  内存态随车下发，不另拉 `dsh-memory/stats`。
- **自适应轮询**：打开期间 `setTimeout` 链轮询，攒批/挂起/全局待蒸馏任一 >0 →
  2000ms，静默 5000ms（对齐嵌入态 `busy?1200:5000` 的既有模式）；
  浮层卸载（ModeSlider 随 pill 关闭卸载）→ cleanup 置 `alive = false` + 清定时器。
- **容错**：RPC 失败保持旧快照（信息区不因瞬时错误闪没）；响应
  `supported === false`（旧宿主无数据源）整体隐藏；首次加载渲染占位骨架
  （四格 `…`）防内容跳变。
- **渲染成本**：纯静态 DOM，不进粒子层 rAF 循环；轮询数据到达才触发本组件
  小树 re-render（状态局部于 SessionInfoArea，拖拽滑块不触发重取——effect 依赖
  只有 `[rpc, sessionId]`）。

### 指标口径

| 格 | 值 | 标签 | 说明 |
|---|---|---|---|
| 召回命中 | `hitTurns/injectedTurns`；停用时显示"停用" | `召回命中 · N 条`（累计命中） | **注入统计**而非 bench 的离线 recall@k（运行时无 ground truth）；hover title 显示最近一轮命中数/耗时/超时次数。停用原因由 host `recall.reason` 短路判定带出（`deploy` 部署未启用 / `global` 全局开关关闭 / `session` 会话只写 / `mode` 档位关闭，#38 起含会话只写）；旧宿主无 reason 时回退本地枚举文案 |
| 攒批进度 | `pendingSlice/threshold`；off 档显示挂起数 | `攒批进度`（有挂起时 `攒批 · 挂起 N`） | threshold 含 warmup 爬坡；off 档标签"挂起切片"（ADR-0003 挂起语义） |
| 本会话记忆 | 累计产出 L1 条数 | `本会话记忆` | hover title 显示最近蒸馏时间 |
| 会话消息 | L0 已捕获条数 | `会话消息` | 索引 COUNT |

状态行（异常才出现）：degraded → danger 色"⚠ 存储不可用，记忆功能已停用"；
向量不可用且非 off 档 → muted"检索降级：纯关键词（向量不可用）"；
FTS+向量全失效 → "检索不可用（FTS 与向量均失效）"。
摘要行：`待蒸馏 N · 上次蒸馏 <相对时间>`（fmtAgo：刚刚 / N 分钟前 / N 小时前 / N 天前）。

### 样式类

`.dsh-mem-sinfo`（分隔线容器）/ `-grid`（`1fr 1fr`，gap `8px 10px`）/
`-val`（13px/600 text-1，`tabular-nums`）/ `-label`（11px text-3，nowrap +
ellipsis 防溢出）/ `-warn`（11px danger）/ `-note`、`-sum`（11px text-3）。
无 transition、无圆角（不涉及 reduced-motion 名单与圆角集合）。
