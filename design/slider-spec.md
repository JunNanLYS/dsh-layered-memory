# slider-spec — 悬浮板滑动选择器

组件：`ModeSlider`（点击记忆 pill 展开的档位滑动选择浮层，macOS 滑动器交互参考）。
全局令牌与守则见 `global-spec.md`；档位定义见 `pill-spec.md`。

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
