# memory-meter-spec — 上下文占用指示器（官方环面板「记忆」分项小节）

> 已落地实现的**事实记录**（0.8.8 起光晕弧 + 面板分项；**0.9.0 UI 重构移除外圈
> 光晕弧**——用户裁定占用只住官方上下文环面板，composer 区零占用 UI）。
> 设计推演全文见本地 `.scratch/memory-occupancy-feasibility/`（不入库）。
> 冲突时以代码为准并回写本文件。

## 组件组构成

- `client/src/meter/occupancy-indicator.ts` — 寄生观察器单例：结构签名锚定官方
  ContextMeter、每会话缓存、T2 时钟（官方 fill dasharray 变化 ⇒ 节流重取权威账）、
  面板开合检测与订阅分发；**0.9.0 起不再注入任何 SVG 节点**（外圈弧已删）。
- `client/src/meter/panel-section.ts` — 官方明细面板底部的「记忆」分项小节
  （**占用的唯一展示处**）。
- 常驻记忆芯片的 init 链驱动启动（body 级单例幂等）。
- 数据唯一来源：`session-stats.memoryOccupancy` + `contextWindowTokens`
  （host 权威账本；算术唯一来源 `src/util/context-occupancy.ts`，client 经 esbuild 内联同模块）。

## 外圈记忆光晕弧（0.9.0 已移除，历史归档）

0.8.8–0.8.12 期间官方环外圈有寄生第三圆（r=6.4 / strokeWidth 0.85 / 最小可见弧长
2 单位 / accent 光晕）。0.9.0 分散式重构中按用户裁定整体移除：官方环恢复逐比特原生，
占用读数全部由面板分项承担。锚定与时钟机制保留（改为纯数据侧：官方 fill dasharray
变化 ⇒ 节流 refetch + 面板刷新）。

## 面板分项小节

- 触发：宿主环按钮 `aria-expanded false→true`；在可见 `[role="dialog"]` 根**底部追加**
  `<section data-dsh-mem-panel>`（locale 无关容器定位 + 去重标记；找不到目标静默放弃）。
- 内容自上而下：标题「记忆占用」（text-2 加粗）→
  召回片段 / 记忆稳定区两行（accent 圆点 + text-2 文字与 tabular-nums 数值，份额>0 才显示）→
  OFF 态「已停用 · 显示现存残留」注记（会话 mode==='off' 时）。
  （2026-08-27 用户裁定：不显示合计占比行与"近似估算"口径声明——占比语义由环形弧承担，口径见本文档而非 UI。）
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
