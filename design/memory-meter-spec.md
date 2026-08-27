# memory-meter-spec — 上下文占用指示器（外圈记忆光晕弧 + 面板分项小节）

> 已落地实现的**事实记录**（0.8.8 起，随票01–05 合入）。设计推演与工程契约全文见
> 本地 `.scratch/memory-occupancy-feasibility/`（feasibility / spec-draft / component-design；
> 该目录不入库）。冲突时以代码为准并回写本文件。

## 组件组构成

- `client/src/meter/occupancy-indicator.ts` — 寄生观察器单例：结构签名锚定官方 ContextMeter、
  会话缓存、T2 时钟、光晕弧渲染；对外导出快照读出口与面板开合订阅。
- `client/src/meter/panel-section.ts` — 明细面板底部的「记忆」分项小节。
- 常驻 pill 的 init 链驱动启动（与 sidebar-icon 同款模式，body 级单例幂等）。
- 数据唯一来源：`session-stats.memoryOccupancy` + `contextWindowTokens`
  （host 权威账本；算术唯一来源 `src/util/context-occupancy.ts`，client 经 esbuild 内联同模块）。

## 外圈记忆光晕弧

- 官方环 viewBox 14 双 r=5.5 圆；寄生第三圆 **r=6.4 / strokeWidth 0.85**，
  `rotate(-90 7 7)` 同起点，弧长 `share × C`（C=34.55751918948772 周长常量）。
- 颜色/光晕全部令牌化：stroke 与 `drop-shadow(0 0 3px …)` 用 `--dsh-mem-accent`，
  滤镜仅挂寄生圆自身（不插官方 `<defs>`）；aria-hidden、pointer-events none。
- 外圈位置从结构上保证不遮盖官方弧；无脉冲等任何动效。
- 锚点：`button[aria-haspopup="dialog"]` + viewBox/r 双圆结构签名（locale 无关），
  aria-label 文案仅辅校验；失配静默退回原生外观。锚点存活期巡检走父链校验
  （流式输出高频 mutation 不做全文档查询），失联才重扫。

## 面板分项小节

- 触发：宿主环按钮 `aria-expanded false→true`；在可见 `[role="dialog"]` 根**底部追加**
  `<section data-dsh-mem-panel>`（locale 无关容器定位 + 去重标记；找不到目标静默放弃）。
- 内容自上而下：标题「记忆 · 本插件占用」（text-2 加粗）→
  召回片段 / 记忆稳定区两行（accent 圆点 + text-2 文字与 tabular-nums 数值，份额>0 才显示）→
  「合计约占当前上下文 X%」（text-3，仅有官方窗口分母时出现；<0.1% 显示为 <0.1）→
  OFF 态「已停用 · 显示现存残留」注记（会话 mode==='off' 时）→
  「近似估算 · 与官方同一算法」口径声明（11px、text-3 弱化）。
- 数字格式复用官方 `formatTokens` 口径并带 `~` 前缀（`~15.7K`，整数位不足三位带一位小数，无单位后缀）；打开期静止，关闭随容器销毁。

## 行为语义

| 场景 | 行为 |
|---|---|
| 无存量 / 占比 0 / 开局即 OFF | 弧与小节都不出现（原生形态） |
| 正常 | 弧随权威账渲染；数字只在轮次边界变化 |
| OFF（中途切档） | 既定事实继续显示：召回留存至压缩；稳定区份额随宿主重排即时清零——真实单调衰减，非跳零 |
| RPC 偶发失败 | 保留旧缓存继续渲染；**连续 3 次失败** ⇒ 数据不可信，弧退回原生（静默）；分母缺失只隐藏占比，token 分项照常 |
| 进程重启 / 历史会话回看 | 账本迁移**写穿**流水文件 `occupancy.json`（dataDir 下；90 天过期 + 200 会话 LRU + stock 归零即删；数值不变不落盘）。内存 miss 时从流水复生，agent 销毁不删记录（与召回去重同款持久化语义）——重启后回看历史会话，弧与面板分项照常显示既有存量 |
| 票08 之前的旧会话（流水无账） | **双源回填**：召回侧由 client 从会话快照的 context 注入节点现扫（判别 `provenance.label==='memory' && form==='recall'`，官方同式折算；窗口语义天然正确——压缩即消减；仅节点数组真实存在时上报，防空渲染覆写零）；稳定区由 host 按当前组词估算（`estimateProfileTokens`，纯读不记账）经 `occupancyBackfill` 下发。有效值 = max(扫描, 账本召回) + (账本稳定区 ∥ 回填) |
| 升级重建子树 | 观察器下个 mutation 微任务自动补挂 |

## 数据口径（摘要）

换算与官方 token-meter 固定密度同式：消息侧 `ceil(chars/4)+8`、稳定区子片 `ceil(chars/4)`
不加结构开销；字符数一律 `.length`（UTF-16）。占比分母为主对话模型的 adapter 声明窗口
（`agentDefaultModel` 选择 × `resolveModelInfo().context.contextWindow`，有缓存），
禁止 client 自估。compaction/clear 由 host `agent/session-start` 事件精确复位账本。

## 已知限制

1. 文案硬编码中文（pill 先例）；无插件级 locale 钩子前不承诺多语言。
2. compaction 复位为整数轮粒度近似：被压缩注入全数出账、幸存摘要行不认领（宁低勿高）。
3. 升级断链到补挂之间的微任务间隙内弧短暂缺席；不可消除仅可最小化。
4. 弧几何未做 100% 占用的贴边拥挤处理（P2 再评估降透明度）。
