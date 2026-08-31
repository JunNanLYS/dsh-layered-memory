# chat-spec — 分散式会话记忆面（记忆芯片 + 级联菜单 + 滑条 + 统计行）

> 0.9.0 UI 重构落地的事实记录。会话侧不再有插件自有的条带/悬浮板：信息按类型
> 分散进宿主原生座位。全局令牌与守则见 `global-spec.md`；占用展示见
> `memory-meter-spec.md`（官方环面板分项是唯一占用展示处）。

## 组件组构成

- `client/src/chat/MemoryChip.tsx` — 记忆芯片（`MemoryChip`）与内联滑条（`ScopeSlider`），
  注册 `conversation.input.left`（id `dsh-memory-mode`，order 100，权限预设芯片右侧）。
- `client/src/chat/stats-segment.tsx` — 统计行遥测段（`StatsSegment`），注册
  `conversation.composer.dock`（id `dsh-memory-telemetry`，order 5）。
- `client/src/i18n.ts` — zh/en 字典 + `t()/tpl()`；全部用户可见文案经字典（宿主 locale
  服务缺失回退 zh）。

## 记忆芯片（.dsh-mem-mchip）

- 官方 composer chip 语法，**逐字对齐宿主源码**（`dsh-client-ui-conversation` 的
  `.Sh0Q9G_trigger`；对齐方法规则见 `client/AGENTS.md`「宿主 UI 对齐」）：高 28 /
  字号 13 / **字重 500** / **圆角 24px** /
  padding 左 8 右 4 / gap 4 / label-secondary / 透明底 / min-width 0 / max-width 220；
  label ellipsis（`.mc-label` 同 `.Sh0Q9G_triggerLabel`）。hover =
  `.Sh0Q9G_trigger:hover:not(:disabled)` 的 **interactive-bg-hover 淡底**；打开态无
  持续底色（仅 chevron 旋转反馈）；focus-visible 环是键盘无障碍超集、保留。
- chevron = **原生 SVG 逐字复刻**（Sh0Q9G_chevron 14×14 path，fill currentColor）；
  图标色 = **`var(--dsw-alias-label-caption)`**（源码原令牌；fallback 浅 #ADB2B8 /
  暗 #81858C 为实测值）；**展开态旋转 180°**，过渡 `transform .12s`（默认 ease）——
  与 `.Sh0Q9G_chevronOpen` 逐字一致。
- 文案 = 解析真值（live）：`记忆 · {智能|日常|工作}`（注入生效）/ `记忆 · 只写`
  （recallResolved=false）/ `记忆 · 暂停`（off 档，前置灰点）/ `记忆 · 降级`（warn 点）。
- 暂停档显示的档位 = host 暂停快照 `resume.scope`（暂停前范围），无快照回退默认档。

## 级联菜单（.dsh-mem-menu）

- 点击芯片向上展开（`bottom: calc(100% + 4px)`，左缘对齐芯片；原生 `_list` 为
  `top: calc(100% + 4px)` 下挂 + min-width 218 / max-width 360，此处镜像为上弹），
  dsh 原生菜单同配方浮层（menu 底 + inverted 描边 + lv3 阴影 + 12px 圆角 + 4px 内衬）。
- **行尺寸对齐原生菜单条目（_item 实测）**：字号 **14px** / 行高 22 / **min-height 40px** /
  padding 8px 10px / 圆角 10 / label-primary 色。作用域限定 `.dsh-mem-menu` /
  `.dsh-mem-sub` 内——settings 页 NSel 下拉保持 13/32 紧凑档不受影响。
- 两行：`记忆范围 {值} ›` / `数据流 {值} ›`（行尾当前值 `.dsh-mem-subval`，13px text-3；
  `›` = **原生右向 chevron 图标** IconChevronRightOutline14（primitives 具名导出，
  guarded require + 内联同款 path 回退），色 label-caption，展开旋转 90° 向下、
  过渡 transform .12s——插件内不再有文字箭头符号）。
- **范围行点击** = 原地展开内联滑条（见下）；再点收起。展开期间数据流行 `hidden`。
- **数据流行** hover 二级子面板（`.dsh-mem-sub`，右浮）：跟随全局✓/读写/只写/暂停。
  仅 hover 揭示、点击不固定；`::before` 10px 桥接热区保证慢速移动不断链。
  键盘通路：触发行 tabbable（`tabIndex=0`），`:focus-within` 同样揭示子面板；
  鼠标 `mousedown` 被 `preventDefault`（点击不夺焦 = 不固定）。子项 `menuitemradio`。
- **子卡片视口适配**：默认 `top:-5px` 下挂；菜单打开时量行 rect，
  行下方（`innerHeight-8` 内）放不下整卡（≈4×40+10）即加 `.flip` 翻转为
  `bottom:-5px` 上翻，并按可用侧夹持 `maxHeight`
  （`overflow-y:auto`）。滚动(capture)/resize 重算。输入栏贴视口底的结构下
  行下方恒 ≈120px < 170px，**上翻是常态路径**；桥接热区横跨卡片全高，
  纵向翻转不影响 hover 链。菜单整体另有 `useAnchoredMaxHeight` 限高（cap 480，
  上弹底锚语义），宿主原语缺失时本地回退（`rect.bottom - 12` 同式）；**仅当限高
  真正收紧（< cap，矮窗口）才开 `overflow-y:auto`**——菜单是子卡片的裁剪祖先，
  常态开滚动会把横向外浮的绝对定位子卡片整个裁掉。
- wire 映射：follow→`recall:null`、rw→`recall:true`、wo→`recall:false`、
  paused→`mode:'off'`（host 侧写入暂停快照 `{scope, recall}`；恢复 = 单次 RPC
  `{mode: resume.scope, recall: resume.recall}` 合并提交）。
- 乐观更新带 seq token 回滚；host 旧版无 `resume` 字段时客户端回退默认档显示。

## 内联滑条（Codex 式，.dsh-mem-sl-*）

- 展开：`grid-template-rows 0fr → 1fr`（.26s cubic-bezier(.2,.7,.3,1)）+ opacity；
  折叠态 `visibility: hidden`（收起即移出可访问树）；内层 `min-height:0; overflow:hidden`。
- 视觉：26px 灰胶囊轨（bg-inset）+ accent-fill 左填充 + 22px 白圆钮（阴影）+
  三停点 + 上方标签 `日常 · 工作 · 智能`（`.dsh-mem-sl-labels`）。
- 拖拽：pointer capture 1:1 跟手（无过渡）、跨档即 `onPreview`（芯片文字实时变）、
  松手按动量投影吸附最近档（clamp 半档，绝不跳两档）；0.18s 吸附过渡。
- 键盘：圆钮 `role="slider"` + `aria-valuetext`（档位名）；方向键 ±1 档、Home/End 到两端。
- 暂停档：范围行 `disabled`（值显示暂停前范围）。

## 统计行遥测（StatsSegment，inline style）

- `待蒸馏 {N}`（N = `session-stats.distill.pendingSlice + parkedSlices`，>0 才显示），
  text-3 居中（无自有类名，纯 inline）；轮询忙 2s / 静 5s，关闭即停。
  检索降级时附内联提示。
- composer 区**无任何占用 UI**（占用只住官方上下文环面板）。

## 交互事实

- 芯片位置 = `＋` / Read Only / 记忆（原生顺序）；菜单两行 + 值 + 图标箭头均正常；
- 滑条键盘切档芯片文字实时联动；数据流 hover 子面板四态 + ✓ 当前项；
- 子卡片上翻后四选项全可见，`maxHeight` 夹持与 resize 重算生效；
- 全部文案走字典（宿主语言切换生效）；reduced-motion 压制全部过渡。
