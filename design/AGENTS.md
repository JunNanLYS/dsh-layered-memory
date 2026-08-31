# design/ — client bundle 视觉规范（spec 目录，非代码）

spec 是**已落地实现的事实记录**，不是愿望文档：与代码冲突时以代码为准，并立即回写 spec
消除分歧——不许留陈旧 spec。

## 文件

- `global-spec.md` — 全局规范：主题机制两层令牌 / `--dsh-mem-*` 中性·强调·档位令牌表 /
  DeepSeek 品牌蓝三档强调色 / 圆角集合 / 排版间距 / 动效 / 无障碍（AA 对比度依据）/
  已知限制 / 贡献者守则。
- `chat-spec.md` — 分散式会话记忆面（记忆芯片 + 级联菜单 + 内联滑条 + 统计行遥测）。
- `settings-spec.md` — 记忆工作台（设置 → 记忆 五区：总览/记忆库/自动化/洞察/维护）。
- `memory-meter-spec.md` — 上下文占用指示器（官方环面板「记忆」分项小节；外圈光晕弧
  0.9.0 已移除）。
- `pill-spec.md` — 【已废弃·历史归档】输入栏记忆 pill + 侧边栏 icon 补丁（icon 补丁存活）。
- `slider-spec.md` — 【已废弃·历史归档】悬浮板滑动选择器 + 粒子层（滑条以内联形态
  复活在 chat-spec）。

## spec 循环（改 client/src 的 UI 时执行）

1. 动手前读对应组件组的 spec；涉及全局性约束（令牌/圆角/动效）再读 `global-spec.md`。
2. 实现（代码是事实权威，spec 跟随代码）。
3. 改完回写：令牌增删改、圆角、动效等全局性约束同步 `global-spec.md`；组件行为细节同步
   所属组件 spec。
4. 新组件组落新 spec 文件（`<组件组>-spec.md`）；全局性约束进 global-spec，不散落在组件 spec。

- 颜色在 spec 与代码中都只写令牌，不写裸 hex。
