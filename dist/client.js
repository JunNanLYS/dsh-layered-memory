/**
 * dsh-layered-memory — browser half（手写 plain-JS bundle，无打包器）。
 *
 * 1. 输入栏（conversation.input.left，模式选择器右侧）：会话记忆档位 pill
 *    （关闭/日常/工作/智能 四态，配置键 off/chat/work/auto），点击展开滑动选择器；
 * 2. 设置 → 记忆：多 Tab 记忆浏览器（概览+开关 / L1 记忆 / L2 场景 / L3 画像 / 运行日志，
 *    两族混合视图）。
 * 数据通道：ctx.connection.rpc.call('/rpc', 'dsh-memory/*', payload) → Host 侧 RPC 端点。
 *
 * 结构对齐官方 client bundle 的 handoff 协议：
 *   window.__ModuleLoader__.load({ id, factory })，
 *   factory(require) 返回 { apply, inject }。
 */
window.__ModuleLoader__.load({
  id: "dsh-layered-memory",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");

    // ── dsh 原生 UI 组件（官方 seed 模块 @deepseek-ai/dsh-client-ui-primitives，
    // 与宿主视觉完全一致）。宿主未注册该模块（老版本 dsh）时静默回退到
    // 本 bundle 的等效实现——degrade-don't-crash，与插件整体降级哲学一致。 ──
    var P = null;
    try {
      P = require("@deepseek-ai/dsh-client-ui-primitives");
    } catch (e) {
      P = null;
    }

    /** 原生 Button（size sm）优先；回退 .dsh-mem-btn 类按钮（剥离原生专属 props）。 */
    function NButton(props) {
      if (P && P.Button) return react.createElement(P.Button, Object.assign({ size: "sm" }, props));
      var rest = Object.assign({}, props);
      delete rest.variant;
      delete rest.icon;
      rest.className = "dsh-mem-btn" + (rest.className ? " " + rest.className : "");
      return react.createElement("button", rest);
    }

    /** 原生 Input 优先；回退 .dsh-mem-input 类输入框。
     * 原生 Input 是 span>input 结构且 rest 摊给内层 input——布局属性（flex/minWidth
     * 等）必须路由到外层，否则搜索框在 flex 工具栏里不再撑满。 */
    function NInput(props) {
      if (P && P.Input) {
        var inner = Object.assign({}, props);
        var layoutStyle = inner.style;
        delete inner.style;
        return react.createElement("span", { style: layoutStyle }, react.createElement(P.Input, inner));
      }
      var rest = Object.assign({}, props);
      rest.className = "dsh-mem-input" + (rest.className ? " " + rest.className : "");
      return react.createElement("input", rest);
    }

    /** 原生 Modal 优先；回退 .dsh-mem-rb-overlay/.dsh-mem-rb-modal 模态。 */
    function NModal(props) {
      if (props.open === false) return null;
      if (P && P.Modal) return react.createElement(P.Modal, Object.assign({ closeLabel: "关闭" }, props));
      return react.createElement(
        "div",
        {
          className: "dsh-mem-rb-overlay",
          onClick: function (e) {
            if (e.target === e.currentTarget && props.onClose) props.onClose();
          },
        },
        react.createElement(
          "div",
          { className: "dsh-mem-rb-modal" },
          props.title
            ? react.createElement("div", { style: { fontSize: 15, fontWeight: 600, marginBottom: 10 } }, props.title)
            : null,
          props.children,
          props.footer
            ? react.createElement(
                "div",
                { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 } },
                props.footer,
              )
            : null,
        ),
      );
    }

    var inject = ["slots", "connection"];

    // ── 通用样式：颜色一律走 --dsh-mem-* 令牌（随 Light/Dark 主题自动切换）；
    // 视觉与交互态（hover/active/focus）在注入样式表的类里，这里只留布局 ──
    var S = {
      section: { padding: "0 4px" },
      heading: { fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "var(--dsh-mem-text-1)" },
      intro: { fontSize: 13, color: "var(--dsh-mem-text-3)", margin: "0 0 12px" },
      tabbar: { display: "flex", gap: 2, borderBottom: "1px solid var(--dsh-mem-border)", marginBottom: 14 },
      error: {
        marginTop: 10,
        fontSize: 13,
        color: "var(--dsh-mem-danger)",
        whiteSpace: "pre-wrap",
      },
      hint: { marginTop: 12, fontSize: 12, color: "var(--dsh-mem-text-3)" },
      toolbar: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" },
      card: {
        padding: "10px 12px",
        marginBottom: 8,
        fontSize: 13,
      },
      cardHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
      muted: { color: "var(--dsh-mem-text-3)", fontSize: 12 },
      content: { lineHeight: 1.5, wordBreak: "break-word", color: "var(--dsh-mem-text-1)" },
      detail: {
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px dashed var(--dsh-mem-border)",
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        color: "var(--dsh-mem-text-2)",
        whiteSpace: "pre-wrap",
      },
      pre: {
        margin: 0,
        padding: "10px 12px",
        background: "var(--dsh-mem-bg-inset)",
        border: "1px solid var(--dsh-mem-border)",
        borderRadius: 10,
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        lineHeight: 1.6,
        maxHeight: 480,
        overflow: "auto",
      },
      switchRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0" },
      switchLabel: { fontSize: 13, fontWeight: 600, minWidth: 72, color: "var(--dsh-mem-text-1)" },
      switchDesc: { fontSize: 12, color: "var(--dsh-mem-text-3)" },
      switch: {
        width: 36,
        height: 20,
        borderRadius: 999,
        position: "relative",
        cursor: "pointer",
        transition: "background .15s",
        flexShrink: 0,
      },
      switchOn: { background: "var(--dsh-mem-accent-fill)" },
      switchOff: { background: "var(--dsh-mem-border-strong)" },
      switchDisabled: { opacity: 0.4, cursor: "not-allowed" },
      knob: {
        position: "absolute",
        top: 2,
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "var(--dsh-mem-thumb)",
        transition: "left .15s",
        boxShadow: "0 1px 2px rgba(0,0,0,.25)",
      },
      switchPanel: {
        border: "1px solid var(--dsh-mem-border)",
        borderRadius: 10,
        background: "var(--dsh-mem-bg-card)",
        boxShadow: "var(--dsh-mem-shadow-card)",
        padding: "4px 14px",
        marginBottom: 14,
      },
      panelLabel: {
        fontSize: 12,
        fontWeight: 600,
        color: "var(--dsh-mem-text-3)",
        margin: "12px 0 2px",
      },
      statGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 8,
        marginBottom: 14,
      },
      statTile: { padding: "10px 12px" },
      statNum: { fontSize: 20, fontWeight: 650, lineHeight: "28px", color: "var(--dsh-mem-text-1)" },
      statLabel: { fontSize: 12, color: "var(--dsh-mem-text-3)", marginTop: 2 },
      infoRow: {
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        padding: "5px 0",
        borderBottom: "1px solid var(--dsh-mem-border)",
      },
      infoKey: { fontSize: 12.5, color: "var(--dsh-mem-text-3)", whiteSpace: "nowrap", minWidth: 96 },
      infoVal: {
        fontSize: 12.5,
        color: "var(--dsh-mem-text-1)",
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        wordBreak: "break-all",
        textAlign: "right",
        flex: 1,
      },
      seg: {
        display: "inline-flex",
        border: "1px solid var(--dsh-mem-border)",
        borderRadius: 8,
        overflow: "hidden",
        flexShrink: 0,
        background: "var(--dsh-mem-bg-inset)",
      },
      segBtn: {
        padding: "4px 12px",
        fontSize: 12,
        lineHeight: "16px",
        cursor: "pointer",
        background: "transparent",
        color: "var(--dsh-mem-text-2)",
        border: "none",
        borderRight: "1px solid var(--dsh-mem-border)",
      },
      segBtnOn: {
        background: "var(--dsh-mem-accent-fill)",
        color: "#fff",
        fontWeight: 600,
      },
      flexRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
      grow: { flex: 1 },
      sceneHead: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" },
      sceneTitle: { fontSize: 13, fontWeight: 600, fontFamily: "ui-monospace, Consolas, monospace", color: "var(--dsh-mem-text-1)" },
    };

    var TYPE_LABELS = {
      persona: "画像偏好",
      episodic: "客观事件",
      instruction: "全局指令",
      work_fact: "工作事实",
      work_task: "工作任务",
      work_method: "工作方法",
      work_artifact: "工作资产",
    };

    function fmtTime(iso) {
      if (!iso) return "-";
      try {
        return new Date(iso).toLocaleString();
      } catch (e) {
        return String(iso);
      }
    }

    // ── Switch 组件 ──
    function Switch(props) {
      var on = !!props.checked;
      var disabled = !!props.disabled;
      var base = Object.assign({}, S.switch, on ? S.switchOn : S.switchOff, disabled ? S.switchDisabled : null);
      return react.createElement(
        "div",
        {
          style: base,
          onClick: function () {
            if (!disabled && props.onChange) props.onChange(!on);
          },
        },
        react.createElement("span", {
          style: Object.assign({}, S.knob, { left: on ? 18 : 2 }),
        }),
      );
    }

    function SwitchRow(props) {
      return react.createElement(
        "div",
        { style: S.switchRow },
        react.createElement(Switch, {
          checked: props.checked,
          disabled: props.disabled,
          onChange: props.onChange,
        }),
        react.createElement("div", null,
          react.createElement("div", { style: S.switchLabel }, props.label),
          react.createElement("div", { style: S.switchDesc }, props.desc || "")),
      );
    }

    // ── Segmented 组件：分段选择器（支持逐项禁用：远程档未配四件套时置灰） ──
    function Segmented(props) {
      var value = props.value;
      var disabled = !!props.disabled;
      return react.createElement(
        "div",
        { style: Object.assign({}, S.seg, disabled ? S.switchDisabled : null) },
        props.options.map(function (opt, i) {
          var on = opt.key === value;
          var optDisabled = disabled || !!opt.disabled;
          return react.createElement(
            "span",
            {
              key: opt.key,
              title: opt.disabledTitle || "",
              style: Object.assign(
                {},
                S.segBtn,
                on ? S.segBtnOn : null,
                i === props.options.length - 1 ? { borderRight: "none" } : null,
                optDisabled ? { cursor: "not-allowed", opacity: 0.45 } : null,
              ),
              onClick: function () {
                if (!optDisabled && !on && props.onChange) props.onChange(opt.key);
              },
            },
            opt.label,
          );
        }),
      );
    }

    // ── 会话记忆档位控件（输入栏 pill + 滑动选择器） ──
    // 档位顺序即滑轨顺序：关闭 → 日常 → 工作 → 智能（默认档"智能"居右）。
    // 显示名中文；配置键与英文层保持 off/chat/work/auto（session-modes.json 不变）。
    // 档位色是 CSS 变量引用（--dsh-mem-mode-*，Light/Dark 各一组值，注入样式表定义），
    // 取值 = 灰 → 品牌蓝 的渐变阶：off 灰、chat/work 过渡蓝、auto 品牌蓝。
    var MODES = [
      { key: "off", label: "关闭", color: "var(--dsh-mem-text-2)" },
      { key: "chat", label: "日常", color: "var(--dsh-mem-mode-chat)" },
      { key: "work", label: "工作", color: "var(--dsh-mem-mode-work)" },
      { key: "auto", label: "智能", color: "var(--dsh-mem-mode-auto)" },
    ];
    var TRACK_W = 200;
    var THUMB = 16;
    var RAIL_H = 22; // 粗滑轨高度 > 圆球直径（圆球被滑轨包裹）
    var INNER_W = TRACK_W - THUMB;
    // 点阵粒子场档位参数（参考 DSH-Claude-Style-Reasoning-Slider 的分档场强，
    // 配色锁品牌蓝单色系）：density 越大点阵越密、alpha 亮度系数、wave 明暗水波纹、
    // tempo 闪烁节拍倍率。tier0（关闭）不参与——show=false 整层不画
    var FIELD_TIERS = [
      { density: 0, alpha: 0, wave: 0, tempo: 1 },
      { density: 0.34, alpha: 0.5, wave: 0, tempo: 1 }, // 日常：稀疏微光
      { density: 0.55, alpha: 0.78, wave: 1, tempo: 1.15 }, // 工作：中强 + 水波纹
      { density: 0.72, alpha: 1, wave: 1, tempo: 1.3 }, // 智能：满场最活跃
    ];

    /** smoothstep（粒子场展开/揭示用 ease） */
    function smStep(a, b, x) {
      var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }

    function modeInfo(key) {
      for (var i = 0; i < MODES.length; i++) if (MODES[i].key === key) return MODES[i];
      return MODES[3];
    }

    function modeLabel(key) {
      if (key === "auto") return "智能（双族）";
      if (key === "chat") return "日常（个人）";
      if (key === "work") return "工作（团队）";
      return "关闭";
    }

    function modeIndex(key) {
      for (var i = 0; i < MODES.length; i++) if (MODES[i].key === key) return i;
      return 3;
    }

    /** 滑动选择器浮层（参考 macOS 滑动器：拖拽圆头 1:1 连续跟手，松手按动量投影吸附最近档）。 */
    function ModeSlider(props) {
      ensureThemeStyle(); // 主题令牌与浮层/气泡 class 共用同一张注入样式表
      var trackRef = react.useRef(null);
      // 拖拽状态：{ x: 圆头连续位置 px, lastX: 上次指针 clientX, t: 时间戳, v: 速度 px/ms（EMA 平滑） }
      var dragState = react.useState(null);
      var drag = dragState[0];
      var setDrag = dragState[1];
      // 粒子层 canvas ref + 几何快照 ref（rAF 循环跨帧读最新值，不重建 effect）
      var canvasRef = react.useRef(null);
      var geoRef = react.useRef(null);

      var clampX = function (x) {
        if (x < 0) return 0;
        if (x > INNER_W) return INNER_W;
        return x;
      };
      var xFromClientX = function (clientX) {
        var rect = trackRef.current.getBoundingClientRect();
        return clampX(clientX - rect.left - THUMB / 2);
      };

      var onPointerDown = function (e) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ x: xFromClientX(e.clientX), lastX: e.clientX, t: e.timeStamp, v: 0 });
      };
      var onPointerMove = function (e) {
        if (drag === null) return;
        var dt = e.timeStamp - drag.t;
        var instV = dt > 0 ? (e.clientX - drag.lastX) / dt : drag.v;
        setDrag({
          x: xFromClientX(e.clientX),
          lastX: e.clientX,
          t: e.timeStamp,
          v: drag.v * 0.7 + instV * 0.3, // EMA：瞬时抖动不放大，松手投影用
        });
      };
      var onPointerUp = function (e) {
        if (drag === null) return;
        // 动量投影（Designing Fluid Interfaces）：按松手速度前瞻落点就近吸附；
        // 投影量 clamp 到半档（±30px）——甩动最多把边界推到相邻档，绝不会跳两档
        var projected = xFromClientX(e.clientX) + Math.max(-30, Math.min(30, drag.v * 120));
        var idx = Math.round((clampX(projected) / INNER_W) * (MODES.length - 1));
        setDrag(null);
        props.onCommit(MODES[idx].key);
      };

      // 拖拽中圆头 1:1 跟指针（连续位置，不吸附）；静止时停在档位中心
      var thumbLeft = drag !== null ? drag.x : (modeIndex(props.mode) / (MODES.length - 1)) * INNER_W;
      var activeIdx = Math.min(MODES.length - 1, Math.max(0, Math.round((thumbLeft / INNER_W) * (MODES.length - 1))));
      var info = MODES[activeIdx];

      // 粒子层几何快照：每帧渲染时更新，rAF 循环跨帧读取（避免按帧重建 effect）
      geoRef.current = {
        origin: thumbLeft + THUMB / 2, // 密度/亮度中心 = 圆球中心
        rightEdge: thumbLeft + THUMB, // 粒子活动区右界 = 填充右缘（不越过圆球）
        tier: activeIdx, // 场强档位（与填充/气泡同源；拖拽预览即时升降级）
        show: activeIdx > 0 || drag !== null, // 与填充显隐同源
        dragging: drag !== null,
      };

      // 粒子层动画循环：DPR 适配 + ResizeObserver + 主题观察；reduced-motion 只画静帧。
      // 依赖数组为空——几何/拖拽态经 geoRef 传递，effect 全生命周期只建一次
      react.useEffect(function () {
        var canvas = canvasRef.current;
        if (!canvas) return undefined;
        var ctx = canvas.getContext && canvas.getContext("2d");
        if (!ctx) return undefined;
        var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        var width = 1;
        var height = 1;
        var frame = 0;
        var grid = []; // 点阵网格（resize 时预计算静态哈希，逐帧只做时间维运算）
        var cell = 5;
        var gap = 1.1;
        var fieldOn = false; // show 翻转沿：入场展开动画的计时原点
        var fieldStart = 0;
        var lastDrawn = 0;

        var resize = function () {
          var b = canvas.getBoundingClientRect();
          var ratio = Math.min(window.devicePixelRatio || 1, 2);
          width = Math.max(1, b.width);
          height = Math.max(1, b.height);
          canvas.width = Math.max(1, Math.round(width * ratio));
          canvas.height = Math.max(1, Math.round(height * ratio));
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          // 网格：200×22 轨道 → 40 列 × 5 行 ≈ 200 格（哈希来自仓库B 的预计算方案）
          cell = width < 280 ? 5 : 6;
          grid = [];
          for (var row = 0; row * cell < height; row++) {
            for (var column = 0; column * cell < width; column++) {
              grid.push({
                x: column * cell,
                y: row * cell,
                base: Math.abs(Math.sin(column * 12.9898 + row * 78.233) * 43758.5453) % 1,
                tempo: Math.abs(Math.sin(column * 7.13 + row * 19.41) * 19341.731) % 1,
                phase: Math.abs(Math.sin(column * 31.17 + row * 11.93) * 28437.123) % 1,
              });
            }
          }
        };

        var draw = function (time) {
          var st = geoRef.current || { origin: 0, rightEdge: 0, tier: 0, show: false, dragging: false };
          ctx.clearRect(0, 0, width, height);
          if (!st.show || st.rightEdge <= 0) {
            fieldOn = false;
            return;
          }
          if (!fieldOn) {
            fieldOn = true;
            fieldStart = time; // 入场展开从这一刻起算（900ms 从圆球向外揭示）
          }
          var dark = document.body.hasAttribute("data-ds-dark-theme");
          var tier = FIELD_TIERS[st.tier] || FIELD_TIERS[1];
          var elapsed = Math.max(0, time - fieldStart);
          var reveal = reduced.matches ? 1 : smStep(0, 1, elapsed / 900);
          var ripplePhase = (elapsed % 1200) / 1200; // 明暗水波纹（1200ms 一轮，从球向外）
          var tempo = tier.tempo * (st.dragging ? 2 : 1); // 拖拽全档提速
          // 基色→高亮色：浅色用深蓝（multiply 混合下沉显色）/ 暗色用亮蓝
          var dim = dark ? [124, 144, 250] : [61, 91, 224];
          var hot = dark ? [214, 224, 255] : [126, 148, 250];

          ctx.save();
          ctx.beginPath();
          // 裁剪到填充区（胶囊形，与滑轨同圆角——矩形裁剪会在圆角末端溢出）
          if (ctx.roundRect) ctx.roundRect(0, 0, st.rightEdge, height, height / 2);
          else ctx.rect(0, 0, st.rightEdge, height);
          ctx.clip();

          for (var i = 0; i < grid.length; i++) {
            var c = grid[i];
            var dx = Math.abs(c.x + cell * 0.5 - st.origin) / Math.max(1, st.rightEdge * 0.5);
            if (dx > 1) continue;
            var near = Math.min(1, Math.max(0, 1 - dx * 1.1)); // 近球更密更亮
            if (c.base > tier.density - near * 0.3) continue; // 密度门（近球放行更多格）
            // 独立随机闪烁：每格按自身 tempo/phase 起伏
            var flicker = 0.5 + 0.5 * Math.sin(elapsed * 0.012 * tempo + c.tempo * 6.283 + c.phase * 6.283);
            // 明暗水波纹：从球心向外传播的亮带（tier 未开波纹时给常量底）
            var wave = tier.wave ? 0.5 + 0.5 * Math.sin((dx * 2 - ripplePhase) * 6.283) : 0.62;
            // 展开：越靠近球越早亮，向外渐显
            var revealA = smStep(0, 1, reveal * (1 - dx * 0.85) + dx * 0.15);
            var alpha = Math.min(1, (0.26 + 0.44 * flicker + near * 0.28) * (0.28 + 0.72 * wave) * revealA * tier.alpha);
            if (alpha < 0.02) continue;
            // 亮闪格向高亮色靠（flicker×wave 双高才发白）
            var glowMix = Math.max(0, flicker * wave - 0.45) * 1.6;
            ctx.fillStyle = "rgba(" +
              Math.round(dim[0] + (hot[0] - dim[0]) * glowMix) + "," +
              Math.round(dim[1] + (hot[1] - dim[1]) * glowMix) + "," +
              Math.round(dim[2] + (hot[2] - dim[2]) * glowMix) + "," +
              alpha.toFixed(3) + ")";
            ctx.fillRect(c.x + gap * 0.5, c.y + gap * 0.5, cell - gap, cell - gap);
          }
          ctx.restore();
        };

        var loop = function (time) {
          // 33ms 节流（≈30fps）：闪烁/波纹尺度下无可感差异，省电
          if (time - lastDrawn >= 33) {
            lastDrawn = time;
            draw(time);
          }
          frame = window.requestAnimationFrame(loop);
        };
        var redrawStatic = function () {
          if (reduced.matches) draw(performance.now());
        };
        var ro = new ResizeObserver(function () {
          resize();
          redrawStatic();
        });
        var themeObs = new MutationObserver(function () {
          redrawStatic(); // 静帧模式下主题翻转要重画（动画循环每帧自读主题）
        });
        ro.observe(canvas);
        themeObs.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
        resize();
        draw(performance.now());
        if (!reduced.matches) frame = window.requestAnimationFrame(loop);
        return function () {
          window.cancelAnimationFrame(frame);
          ro.disconnect();
          themeObs.disconnect();
        };
      }, []);

      // 停点刻度：轨道上的 4 个小点提示可吸附位置；档位名改由拖动气泡显示
      var stops = [];
      for (var i = 0; i < MODES.length; i++) {
        var stopLeft = (i / (MODES.length - 1)) * INNER_W + THUMB / 2;
        stops.push(
          react.createElement("div", {
            key: "stop" + i,
            style: {
              position: "absolute",
              left: stopLeft - 3,
              top: (RAIL_H - 6) / 2,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--dsh-mem-dot)",
              zIndex: 2,
              pointerEvents: "none",
            },
          }),
        );
      }

      return react.createElement(
        "div",
        {
          // 外壳只负责定位（带 transform 居中悬浮在按钮上方，水平中轴对齐 pill 中心）
          style: {
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
          },
        },
        react.createElement(
          "div",
          // dsh 原生菜单同配方浮层：不透明实底（dsw-specific-menu）+ inverted 描边 + lv3 阴影；
          // 上下内边距对称（滑轨垂直居中、浮层紧凑），拖动气泡经 overflow: visible 溢出到浮层上方
          { className: "dsh-mem-popover", style: { position: "relative", padding: "14px 16px" } },
          react.createElement(
            "div",
            {
              ref: trackRef,
              style: {
                position: "relative",
                // 容器宽 = thumb 活动范围（0..INNER_W + THUMB），点击映射与视觉两端严格对齐
                width: TRACK_W,
                height: RAIL_H,
                borderRadius: 999,
                background: "var(--dsh-mem-track)",
                touchAction: "none",
                cursor: drag === null ? "pointer" : "grabbing",
              },
              onPointerDown: onPointerDown,
              onPointerMove: onPointerMove,
              onPointerUp: onPointerUp,
              onPointerCancel: onPointerUp,
            },
            // 填充：从滑轨左端铺到圆球右缘（width = thumbLeft + THUMB，整球落在
            // 填充末端上与其重合，无空隙不割裂；auto 档恰好全轨蓝、不超出轨道）；
            // 颜色从左往右渐变：左侧浅（fill-1）到球侧深（fill-2）；
            // 显隐分两支：静态关闭档（off 且未拖拽）不渲染；拖拽中无论预览到哪档
            // 恒显示（松手落 off 才随提交消失）；
            // 松手吸附时 width 与圆球 left 同走 120ms ease（防球与填充瞬时分家）
            activeIdx > 0 || drag !== null
              ? react.createElement("div", {
                  style: {
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: thumbLeft + THUMB,
                    borderRadius: 999,
                    background: "linear-gradient(90deg, var(--dsh-mem-fill-1), var(--dsh-mem-fill-2))",
                    pointerEvents: "none",
                    zIndex: 1,
                    transition: drag === null ? "width 120ms ease" : "none",
                  },
                })
              : null,
            stops,
            // 粒子层：点阵粒子场（pointerEvents none 不挡拖拽；拖拽时滤镜增饱和提亮）
            react.createElement("canvas", {
              ref: canvasRef,
              className: "dsh-mem-particles",
              style: {
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 2,
                filter: drag !== null ? "saturate(1.45) brightness(1.28) contrast(1.06)" : "none",
              },
            }),
            // 圆球：被粗滑轨包裹（RAIL_H > THUMB），品牌蓝描边，拖拽时阴影加重
            react.createElement("div", {
              style: {
                position: "absolute",
                left: thumbLeft,
                top: (RAIL_H - THUMB) / 2,
                width: THUMB,
                height: THUMB,
                borderRadius: "50%",
                background: "var(--dsh-mem-thumb)",
                border: "1px solid var(--dsh-mem-accent)",
                boxShadow: drag !== null
                  ? "0 2px 8px rgba(0,0,0,0.35)"
                  : "0 1px 4px rgba(0,0,0,0.25)",
                pointerEvents: "none",
                transition: drag === null ? "left 120ms ease" : "none",
                zIndex: 3,
              },
            }),
            // 拖动气泡：仅拖拽期间显示当前档位名，下尖角指向圆球，松手即消失
            drag !== null
              ? react.createElement(
                  "div",
                  { className: "dsh-mem-bubble", style: { left: thumbLeft + THUMB / 2, zIndex: 4 } },
                  info.label,
                )
              : null,
          ),
          props.error
            ? react.createElement("div", { style: { fontSize: 11, color: "var(--dsh-mem-danger)", marginTop: 10, whiteSpace: "nowrap" } }, props.error)
            : null,
        ),
      );
    }

    // ── 主题令牌层 + 组件样式：inline style 放不了 @keyframes/@property/伪类/媒体查询，
    // 惰性注入一次性样式表（id 防重复）。
    // 主题机制：dsh 前端在 body[data-ds-dark-theme] 切暗色并重定义 --dsw-alias-* 令牌；
    // 我们的中性色链真实 dsw 令牌（缺省时用自带 fallback），强调色是 DeepSeek 品牌蓝体系：
    //   accent（图形：下划线/边框/光晕，非文字，3:1 即可）
    //   accent-text（表面上的强调文字，双主题 ≥4.5:1）
    //   accent-fill（实底填充 + 白字，双主题 ≥4.5:1）
    // 设置页挂载即注入（ensureThemeStyle），输入栏 pill / 浮层 / 重建面板共用。 ──
    var THEME_STYLE_ID = "dsh-mem-theme-style";
    function ensureThemeStyle() {
      if (document.getElementById(THEME_STYLE_ID)) return;
      var el = document.createElement("style");
      el.id = THEME_STYLE_ID;
      el.textContent = [
        // conic 角度动画需要 @property 注册才能插值；不支持 @property 的浏览器里
        // var(--dsh-mem-angle) 无定义 → conic 层失效 → 整条 background 退化为无背景
        // （光带边框与内底一并消失，仅剩文字色）。2026 常青浏览器均已支持，仅作记录。
        "@property --dsh-mem-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }",
        "@keyframes dshMemFlow { to { --dsh-mem-angle: 360deg; } }",
        // ── 令牌（浅色）。中性色链【真实存在的】dsw 令牌（design-platform.css 校对）：
        //    bg-layer-2/3、bg-overlay、border-l1/l2/l3、border-inverted、label-*、
        //    interactive-bg-hover、state-error-primary、tooltip-bg、dsw-shadow-lv1/lv3 ──
        ":root {",
        "  --dsh-mem-accent: #4d6bfe;",
        "  --dsh-mem-accent-text: #3d5be0;",
        "  --dsh-mem-accent-fill: #3d5be0;",
        "  --dsh-mem-accent-weak: rgba(77,107,254,0.10);",
        "  --dsh-mem-bg-card: var(--dsw-alias-bg-layer-2, #ffffff);",
        "  --dsh-mem-bg-inset: var(--dsw-alias-bg-overlay, #e9ecf2);",
        "  --dsh-mem-bg-hover: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,0.06));",
        "  --dsh-mem-bg-pop: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #ffffff));",
        "  --dsh-mem-border: var(--dsw-alias-border-l2, rgba(0,0,0,0.10));",
        "  --dsh-mem-border-strong: var(--dsw-alias-border-l3, rgba(0,0,0,0.12));",
        "  --dsh-mem-border-pop: var(--dsw-alias-border-inverted, rgba(0,0,0,0));",
        "  --dsh-mem-text-1: var(--dsw-alias-label-primary, #0f1115);",
        "  --dsh-mem-text-2: var(--dsw-alias-label-secondary, #61666b);",
        "  --dsh-mem-text-3: var(--dsw-alias-label-tertiary, #6e7781);",
        "  --dsh-mem-danger: var(--dsw-alias-state-error-primary, #d0403f);",
        // 档位色 = 灰 → 品牌蓝 的渐变阶（chat/work 过渡蓝 / auto 品牌蓝）；
        // 文字对比度按 pill 真实底色（流光内底 = bg-card 97% + 档位色 3%）复算 AA 达标
        "  --dsh-mem-mode-chat: #5a69b0;",
        "  --dsh-mem-mode-work: #5263ca;",
        "  --dsh-mem-mode-auto: #3d5be0;",
        // 滑轨填充渐变（左浅右深）
        "  --dsh-mem-fill-1: #7b93ff;",
        "  --dsh-mem-fill-2: #3d5be0;",
        "  --dsh-mem-thumb: #ffffff;",
        "  --dsh-mem-track: rgba(128,140,150,0.32);",
        "  --dsh-mem-dot: rgba(128,140,150,0.55);",
        "  --dsh-mem-shadow-card: var(--dsw-shadow-lv1, 0 2px 4px 0 rgba(0,0,0,0.05));",
        "  --dsh-mem-shadow-pop: var(--dsw-shadow-lv3, 0 0 1px 0 rgba(0,0,0,.2), 0 0 4px 0 rgba(0,0,0,.02), 0 12px 32px 0 rgba(0,0,0,.08));",
        "}",
        // ── 令牌（暗色：body[data-ds-dark-theme] 是 dsh 前端的暗色开关） ──
        "body[data-ds-dark-theme] {",
        "  --dsh-mem-accent: #6e85ff;",
        "  --dsh-mem-accent-text: #7b90ff;",
        "  --dsh-mem-accent-fill: #465ce8;",
        "  --dsh-mem-accent-weak: rgba(110,133,255,0.14);",
        "  --dsh-mem-bg-card: var(--dsw-alias-bg-layer-2, #2c2c2e);",
        "  --dsh-mem-bg-inset: var(--dsw-alias-bg-layer-1, #232324);",
        "  --dsh-mem-bg-hover: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.08));",
        "  --dsh-mem-bg-pop: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #353638));",
        "  --dsh-mem-border: var(--dsw-alias-border-l2, rgba(255,255,255,0.12));",
        "  --dsh-mem-border-strong: var(--dsw-alias-border-l3, rgba(255,255,255,0.16));",
        "  --dsh-mem-border-pop: var(--dsw-alias-border-inverted, rgba(255,255,255,0.06));",
        "  --dsh-mem-text-1: var(--dsw-alias-label-primary, #f9fafb);",
        "  --dsh-mem-text-2: var(--dsw-alias-label-secondary, #cfd3d6);",
        "  --dsh-mem-text-3: var(--dsw-alias-label-tertiary, #8892a6);",
        "  --dsh-mem-danger: var(--dsw-alias-state-error-primary, #f4707b);",
        "  --dsh-mem-mode-chat: #97a4ff;",
        "  --dsh-mem-mode-work: #8295ff;",
        "  --dsh-mem-mode-auto: #7b90ff;",
        "  --dsh-mem-fill-1: #8fa0ff;",
        "  --dsh-mem-fill-2: #465ce8;",
        "  --dsh-mem-thumb: #e8ebf5;",
        "  --dsh-mem-track: rgba(148,160,180,0.30);",
        "  --dsh-mem-dot: rgba(148,160,180,0.5);",
        "  --dsh-mem-shadow-card: var(--dsw-shadow-lv1, 0 2px 4px 0 rgba(0,0,0,0.3));",
        "  --dsh-mem-shadow-pop: var(--dsw-shadow-lv3, 0 0 1px 0 rgba(0,0,0,.2), 0 0 4px 0 rgba(0,0,0,.02), 0 12px 32px 0 rgba(0,0,0,.08));",
        "}",
        // ── 主题切换过渡：只挂颜色/阴影（不碰 transform），让明暗翻转不生硬 ──
        ".dsh-mem-root, .dsh-mem-root * { transition: background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease; }",
        // ── 控件：按钮（次级）── 圆角体系：控件 8 / 卡片 10 / 浮层 12 / 胶囊 999
        ".dsh-mem-btn {",
        "  padding: 5px 14px; font-size: 13px; line-height: 20px; border-radius: 8px; cursor: pointer;",
        "  border: 1px solid var(--dsh-mem-border); background: var(--dsh-mem-bg-card); color: var(--dsh-mem-text-1);",
        "  transition: background-color .15s ease, border-color .15s ease, transform .08s ease;",
        "}",
        ".dsh-mem-btn:hover:not(:disabled) { border-color: var(--dsh-mem-border-strong); background: var(--dsh-mem-bg-hover); }",
        ".dsh-mem-btn:active:not(:disabled) { transform: scale(0.98); }",
        ".dsh-mem-btn:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: 1px; }",
        ".dsh-mem-btn:disabled { opacity: 0.45; cursor: not-allowed; }",
        // ── 控件：输入框 / 下拉 ──
        ".dsh-mem-input, .dsh-mem-select {",
        "  padding: 5px 10px; font-size: 13px; border-radius: 8px; color: var(--dsh-mem-text-1);",
        "  border: 1px solid var(--dsh-mem-border); background: var(--dsh-mem-bg-card);",
        "  transition: border-color .15s ease, box-shadow .15s ease;",
        "}",
        ".dsh-mem-input:focus, .dsh-mem-select:focus {",
        "  outline: none; border-color: var(--dsh-mem-accent);",
        "  box-shadow: 0 0 0 3px var(--dsh-mem-accent-weak);",
        "}",
        // ── Tab（下划线式）：active 品牌蓝下划线 + 主文字色 ──
        ".dsh-mem-tab {",
        "  padding: 6px 12px; font-size: 13px; cursor: pointer; background: none; border: none;",
        "  color: var(--dsh-mem-text-2); border-bottom: 2px solid transparent; margin-bottom: -1px;",
        "}",
        ".dsh-mem-tab:hover { color: var(--dsh-mem-text-1); }",
        ".dsh-mem-tab-on { font-weight: 600; color: var(--dsh-mem-text-1); border-bottom-color: var(--dsh-mem-accent); }",
        ".dsh-mem-tab:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: -2px; }",
        // ── 卡片：悬浮微抬 + 边框加深（只在可交互卡片上用 hover） ──
        ".dsh-mem-card {",
        "  border: 1px solid var(--dsh-mem-border); border-radius: 10px; background: var(--dsh-mem-bg-card);",
        "  box-shadow: var(--dsh-mem-shadow-card);",
        "}",
        ".dsh-mem-card-hover:hover { border-color: var(--dsh-mem-border-strong); }",
        // ── 记忆类型标签：tint 风格（彩底淡色 + 彩字），--dsh-mem-tag-c 由类型类给定 ──
        ".dsh-mem-tag {",
        "  display: inline-block; padding: 1px 8px; border-radius: 999px;",
        "  font-size: 11px; font-weight: 600; line-height: 18px; white-space: nowrap;",
        "  color: var(--dsh-mem-tag-c, var(--dsh-mem-text-2));",
        "  background: color-mix(in srgb, var(--dsh-mem-tag-c, #8a93a1) 12%, transparent);",
        "  border: 1px solid color-mix(in srgb, var(--dsh-mem-tag-c, #8a93a1) 28%, transparent);",
        "}",
        ".dsh-mem-tag-persona   { --dsh-mem-tag-c: #6f42c1; }",
        ".dsh-mem-tag-episodic  { --dsh-mem-tag-c: #0757b4; }",
        ".dsh-mem-tag-instruction, .dsh-mem-tag-work-artifact { --dsh-mem-tag-c: #8a5a00; }",
        ".dsh-mem-tag-work-fact { --dsh-mem-tag-c: #0757b4; }",
        ".dsh-mem-tag-work-task { --dsh-mem-tag-c: #116629; }",
        ".dsh-mem-tag-work-method { --dsh-mem-tag-c: #6f42c1; }",
        "body[data-ds-dark-theme] .dsh-mem-tag-persona   { --dsh-mem-tag-c: #c297ff; }",
        "body[data-ds-dark-theme] .dsh-mem-tag-episodic  { --dsh-mem-tag-c: #6cb2ff; }",
        "body[data-ds-dark-theme] .dsh-mem-tag-instruction, body[data-ds-dark-theme] .dsh-mem-tag-work-artifact { --dsh-mem-tag-c: #e3b341; }",
        "body[data-ds-dark-theme] .dsh-mem-tag-work-fact { --dsh-mem-tag-c: #6cb2ff; }",
        "body[data-ds-dark-theme] .dsh-mem-tag-work-task { --dsh-mem-tag-c: #6fca74; }",
        "body[data-ds-dark-theme] .dsh-mem-tag-work-method { --dsh-mem-tag-c: #c297ff; }",
        // ── pill 边缘流光（品牌蓝族，chat/work/auto 三档共用；off 无）：border 区画旋转
        // conic 光带；内部必须是【不透明】底色盖住光带（半透明内层会让 conic 透进按钮
        // 内部，文字被光斑干扰——实测事故）。不透明底 = 主题底混 3% 档位色
        // （--dsh-mem-pill-tint 由 pill inline 给定；3% 保证档位色文字 AA，暗色智能档余量 4.63:1）
        ".dsh-mem-flow {",
        "  border: 1px solid transparent;",
        "  background:",
        "    linear-gradient(",
        "      color-mix(in srgb, var(--dsh-mem-bg-card, #ffffff) 97%, var(--dsh-mem-pill-tint, #4d6bfe)),",
        "      color-mix(in srgb, var(--dsh-mem-bg-card, #ffffff) 97%, var(--dsh-mem-pill-tint, #4d6bfe))",
        "    ) padding-box,",
        "    conic-gradient(from var(--dsh-mem-angle),",
        "      rgba(61,91,224,0.9), rgba(77,107,254,0.95), rgba(147,168,255,1),",
        "      rgba(110,133,255,0.9), rgba(61,91,224,0.9)) border-box;",
        "  animation: dshMemFlow 3s linear infinite;",
        "}",
        // ── off 档 pill：dsh 透明按钮——无底无边框只留文字，hover 才出 interactive 淡底 ──
        //（button 裸元素会露出 UA 默认灰底+描边，必须显式压掉）
        ".dsh-mem-pill-off { border: none; background: transparent; }",
        ".dsh-mem-pill-off:hover { background: var(--dsh-mem-bg-hover); }",
        ".dsh-mem-pill-off:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: 1px; }",
        // 流光态焦点环（同一物理按钮的两态焦点反馈对称，配方同 .dsh-mem-btn）
        ".dsh-mem-flow:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: 1px; }",
        // ── 浮层（dsh 原生菜单同配方：不透明实底 + inverted 描边（浅色不可见）+ lv3 阴影） ──
        ".dsh-mem-popover {",
        "  border-radius: 12px;",
        "  border: 1px solid var(--dsh-mem-border-pop);",
        "  background: var(--dsh-mem-bg-pop);",
        "  box-shadow: var(--dsh-mem-shadow-pop);",
        "  color: var(--dsh-mem-text-1);",
        "}",
        // ── 拖动气泡：拖拽时显示当前档位名，随圆球移动，下倒三角尖角贴近圆球 ──
        // 底色走浮层同材质令牌（浅色白底深字 / 暗色深底浅字，随主题翻转；
        // tooltip-bg 令牌在浅色下仍是深色，不随材质走，已弃用）。
        // 悬停 8px（尖角尖端距圆球顶约 5px）；气泡 zIndex 4 高于浮层（同层叠上下文内
        // 数值比较），跨过浮层上缘时盖在其上；描边 + 投影让同材质不融合
        ".dsh-mem-bubble {",
        "  position: absolute; bottom: calc(100% + 8px); transform: translateX(-50%);",
        "  padding: 3px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; line-height: 18px;",
        "  border: 1px solid var(--dsh-mem-border);",
        "  background: var(--dsh-mem-bg-pop); color: var(--dsh-mem-text-1); white-space: nowrap;",
        "  box-shadow: 0 2px 8px rgba(0,0,0,0.18);",
        "}",
        // 尖角：clip-path 倒三角（旋转方块会露出上半截成菱形，实测视觉缺陷）。
        // 双三角叠画：外层描边色大一圈、内层填充色，压在浮层上缘也有轮廓可读
        ".dsh-mem-bubble::before {",
        "  content: ''; position: absolute; top: 100%; left: 50%; margin-left: -6px;",
        "  width: 12px; height: 7px;",
        "  clip-path: polygon(0 0, 100% 0, 50% 100%);",
        "  background: var(--dsh-mem-border);",
        "}",
        ".dsh-mem-bubble::after {",
        "  content: ''; position: absolute; top: 100%; left: 50%; margin-left: -5px;",
        "  width: 10px; height: 6px;",
        "  clip-path: polygon(0 0, 100% 0, 50% 100%);",
        "  background: var(--dsh-mem-bg-pop);",
        "}",
        // ── 粒子层（点阵场）：浅色 multiply 混合——深蓝点乘在浅蓝填充上沉显对比 ──
        "body:not([data-ds-dark-theme]) .dsh-mem-particles { mix-blend-mode: multiply; opacity: 0.82; }",
        // ── 重建面板 ──（模态本体走 NModal：原生 Modal 优先，回退 rb-overlay/rb-modal）
        ".dsh-mem-rb-card {",
        "  border: 1px solid var(--dsh-mem-border); border-radius: 10px; background: var(--dsh-mem-bg-card);",
        "  box-shadow: var(--dsh-mem-shadow-card); padding: 12px 14px; margin-bottom: 14px; font-size: 13px;",
        "}",
        ".dsh-mem-rb-bar { height: 8px; border-radius: 4px; overflow: hidden; flex: 1; background: var(--dsh-mem-track); }",
        ".dsh-mem-rb-fill { height: 100%; border-radius: 4px; background: var(--dsh-mem-accent-fill); transition: width .4s ease; }",
        ".dsh-mem-rb-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35);",
        "  display: flex; align-items: center; justify-content: center; z-index: 2000; }",
        ".dsh-mem-rb-modal { width: 440px; max-width: calc(100vw - 48px); border-radius: 12px;",
        "  padding: 18px 20px; font-size: 13px; line-height: 1.6;",
        "  border: 1px solid var(--dsh-mem-border); background: var(--dsh-mem-bg-card); color: var(--dsh-mem-text-1);",
        "  box-shadow: 0 16px 48px rgba(0,0,0,0.24); }",
        "body[data-ds-dark-theme] .dsh-mem-rb-modal { box-shadow: 0 16px 48px rgba(0,0,0,0.6); }",
        ".dsh-mem-rb-muted { font-size: 12px; color: var(--dsh-mem-text-3); }",
        // reduced-motion 兜底放样式表末尾：同特异性下后置声明才能压过上面的组件类
        "@media (prefers-reduced-motion: reduce) {",
        "  .dsh-mem-root, .dsh-mem-root *, .dsh-mem-btn, .dsh-mem-input, .dsh-mem-select, .dsh-mem-rb-fill { transition: none; }",
        "  .dsh-mem-flow { animation: none; }",
        "}",
      ].join("\n");
      document.head.appendChild(el);
    }

    /** 输入栏 pill：点击展开滑动选择器；props 来自 conversation.input.left 的 zone 注入。 */
    function MemoryModePill(props) {
      var rpc = props.rpc;
      var sessionId = props.sessionId || (props.session && props.session.sessionId);
      var modeState = react.useState(null);
      var mode = modeState[0];
      var setMode = modeState[1];
      var errState = react.useState(null);
      var error = errState[0];
      var setError = errState[1];
      var openState = react.useState(false);
      var open = openState[0];
      var setOpen = openState[1];
      var wrapRef = react.useRef(null);
      // 请求序列号：快速切换会话时丢弃旧会话的过期响应（慢响应不得覆盖新会话档位）
      var seqRef = react.useRef(0);

      var load = react.useCallback(function () {
        if (!sessionId || !rpc) return;
        var token = ++seqRef.current;
        setError(null);
        rpc("dsh-memory/session-mode-get", { sessionId: sessionId })
          .then(function (r) {
            if (token !== seqRef.current) return;
            if (r && r.ok && r.value) setMode(r.value.mode);
            else setError(r && r.error ? r.error.message : "RPC error");
          })
          .catch(function (e) {
            if (token !== seqRef.current) return;
            setError(String((e && e.message) || e));
          });
      }, [sessionId, rpc]);

      react.useEffect(function () { load(); }, [load]);

      // 侧边栏书本 icon 补丁由常驻 pill 驱动（MemoryPanel 只在记忆分节激活时挂载，
      // 覆盖不了"打开设置第一眼"的场景）；body 级观察器全局单例，多实例幂等
      react.useEffect(function () { watchSidebarIcon(); }, []);

      react.useEffect(function () {
        if (!open) return;
        var onDown = function (e) {
          if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        var onKey = function (e) {
          if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return function () {
          document.removeEventListener("mousedown", onDown);
          document.removeEventListener("keydown", onKey);
        };
      }, [open]);

      /** 乐观提交：立即更新 UI，RPC 失败回滚并提示。 */
      var commit = function (next) {
        if (!rpc || next === mode) return;
        var prev = mode;
        setMode(next);
        setError(null);
        rpc("dsh-memory/session-mode-set", { sessionId: sessionId, mode: next })
          .then(function (r) {
            if (!r || !r.ok) {
              setMode(prev);
              setError(r && r.error ? "档位写入失败：" + r.error.message : "档位写入失败");
            }
          })
          .catch(function (e) {
            setMode(prev);
            setError("档位写入失败：" + String((e && e.message) || e));
          });
      };

      if (!sessionId || !rpc) return null;
      var info = modeInfo(mode);
      var loaded = mode !== null;
      // 关闭档与其余三档二分：关闭 = dsh 透明按钮（无边框无底无光晕）；
      // 日常/工作/智能 = 同款流光 + 光晕，档位区分靠蓝阶文字色与流光内底混色深度
      var isOff = loaded && mode === "off";
      var isFlow = loaded && !isOff;

      ensureThemeStyle();

      var pillStyle = {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 24,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: "20px",
        cursor: "pointer",
        // 流光档的边框/背景由 .dsh-mem-flow 的双层背景提供（流光边 + 不透明内底），
        // inline 只给文字色 / 光晕 / 流光内底混色通道（--dsh-mem-pill-tint）
        color: isFlow ? info.color : "var(--dsh-mem-text-2)",
      };
      if (isFlow) {
        pillStyle.boxShadow = "0 0 12px color-mix(in srgb, " + info.color + " 30%, transparent)";
        pillStyle["--dsh-mem-pill-tint"] = info.color;
      }

      return react.createElement(
        "div",
        { ref: wrapRef, style: { position: "relative", display: "inline-flex" } },
        react.createElement(
          "button",
          {
            type: "button",
            title: error ? "档位读取失败：" + error + "（点击重试）" : "本会话记忆档位（点击切换）",
            onClick: function () {
              if (error) load();
              setOpen(!open);
            },
            className: isFlow ? "dsh-mem-flow" : "dsh-mem-pill-off",
            style: pillStyle,
          },
          "记忆 · ",
          react.createElement("span", null, loaded ? info.label : error ? "⚠" : "…"),
        ),
        open
          ? react.createElement(ModeSlider, {
              mode: mode || "auto",
              onCommit: commit,
              error: error,
            })
          : null,
      );
    }

    // ── 重建面板：从 L0 重导 L1/L2/L3（确认弹窗 + 进度 + 取消；Light/Dark 双主题走 class） ──
    var RB_PHASE_LABEL = {
      preparing: "准备中（归档旧数据 · 清空检索库）",
      distilling: "分块蒸馏中",
      finalizing: "收尾（强制 L2 场景 + L3 画像）",
    };

    function RebuildPanel(props) {
      var rpc = props.rpc;
      var rbState = react.useState(null);
      var rb = rbState[0];
      var setRb = rbState[1];
      var confirmState = react.useState(false);
      var confirmOpen = confirmState[0];
      var setConfirmOpen = confirmState[1];
      var busyState = react.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var errState = react.useState(null);
      var rbError = errState[0];
      var setRbError = errState[1];

      var refresh = react.useCallback(function () {
        rpc("dsh-memory/rebuild-status", {})
          .then(function (r) {
            if (r && r.ok) setRb(r.value);
          })
          .catch(function () {});
      }, [rpc]);

      react.useEffect(function () { refresh(); }, [refresh]);

      // 运行中 1.5s 高频轮询进度；空闲不轮询（重新打开 Tab 时挂载刷新一次）
      var running = !!(rb && rb.running);
      react.useEffect(function () {
        if (!running) return;
        var timer = setInterval(refresh, 1500);
        return function () { clearInterval(timer); };
      }, [running, refresh]);

      if (!rb || rb.supported === false) return null;
      ensureThemeStyle();

      var start = function () {
        setBusy(true);
        setRbError(null);
        rpc("dsh-memory/rebuild-start", {})
          .then(function (r) {
            setBusy(false);
            if (r && r.ok) {
              setConfirmOpen(false);
              setRb(r.value);
            } else {
              setRbError(r && r.error ? r.error.message : "启动失败");
            }
          })
          .catch(function (e) {
            setBusy(false);
            setRbError(String((e && e.message) || e));
          });
      };
      var cancel = function () {
        setBusy(true);
        rpc("dsh-memory/rebuild-cancel", {})
          .then(function (r) {
            setBusy(false);
            if (r && r.ok) setRb(r.value);
          })
          .catch(function () {
            setBusy(false);
          });
      };

      var empty = !running && (rb.messageCount === 0 || rb.estCalls === 0);
      var pct = rb.total > 0 ? Math.round((rb.done / rb.total) * 100) : 0;

      var lastNote = null;
      if (!running && rb.phase === "done") {
        lastNote =
          "上次重建：完成（" + rb.done + "/" + rb.total + " 会话，产出 " + rb.recordsBuilt + " 条记录）" +
          (rb.finishedAt ? " · " + fmtTime(new Date(rb.finishedAt).toISOString()) : "");
      } else if (!running && rb.phase === "cancelled") {
        lastNote = "上次重建：已取消（完成 " + rb.done + "/" + rb.total + " 会话，已重建部分保留）";
      } else if (!running && rb.phase === "failed") {
        lastNote = "上次重建：失败：" + (rb.error || "未知错误");
      }

      return react.createElement(
        "div", { className: "dsh-mem-rb-card" },
        react.createElement(
          "div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
          react.createElement("div", { style: { fontWeight: 600, whiteSpace: "nowrap" } }, "重建记忆"),
          react.createElement(
            "div", { className: "dsh-mem-rb-muted", style: { flex: 1, minWidth: 180 } },
            running
              ? (RB_PHASE_LABEL[rb.phase] || rb.phase) + " · " + rb.done + "/" + rb.total + " 会话（" + pct + "%）"
              : "从 L0 原始对话重新蒸馏 L1/L2/L3；旧数据先归档（不删除）",
          ),
          running
            ? react.createElement(NButton, {
                disabled: busy || rb.cancelRequested,
                onClick: cancel,
              }, rb.cancelRequested ? "取消中…" : "取消重建")
            : react.createElement(NButton, {
                disabled: busy || empty,
                title: empty ? "L0 无消息，无可重建内容" : "重新蒸馏全部记忆",
                style: { color: "var(--dsh-mem-danger)" },
                onClick: function () { setConfirmOpen(true); },
              }, busy ? "…" : "开始重建"),
        ),
        running
          ? react.createElement(
              "div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 } },
              react.createElement(
                "div", { className: "dsh-mem-rb-bar" },
                react.createElement("div", { className: "dsh-mem-rb-fill", style: { width: pct + "%" } }),
              ),
              react.createElement(
                "span", { className: "dsh-mem-rb-muted", style: { whiteSpace: "nowrap" } },
                "产出 " + rb.recordsBuilt + " 条",
              ),
            )
          : null,
        lastNote
          ? react.createElement("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 } }, lastNote)
          : null,
        rbError
          ? react.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsh-mem-danger)" } }, rbError)
          : null,
        confirmOpen
          ? react.createElement(
              NModal,
              {
                open: true,
                onClose: function () { setConfirmOpen(false); },
                title: "确认重建全部记忆？",
                footer: [
                  react.createElement(NButton, {
                    key: "cancel",
                    onClick: function () { setConfirmOpen(false); },
                  }, "取消"),
                  react.createElement(NButton, {
                    key: "confirm",
                    variant: "primary",
                    disabled: busy,
                    onClick: start,
                  }, busy ? "启动中…" : "开始重建"),
                ],
              },
              react.createElement(
                "div", null,
                "将以 L0 原始对话为事实源重新蒸馏：",
                react.createElement("b", null, rb.sessionCount + " 个会话 · " + rb.messageCount + " 条消息"),
                "，预计 ≥" + rb.estCalls + " 次蒸馏调用。",
              ),
              react.createElement(
                "div", { style: { marginTop: 8 } },
                "现有 L1 记忆 / L2 场景 / L3 画像会整体归档（*.bak.时间戳，可手工找回），随后清空重建；重建期间可正常对话，新对话的蒸馏优先进行；中途可取消，已重建部分保留。",
              ),
            )
          : null,
      );
    }

    // ── Tab：概览（开关面板 + 计数） ──
    function fmtMB(bytes) {
      if (!bytes || bytes <= 0) return "0MB";
      if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + "KB";
      return (bytes / (1024 * 1024)).toFixed(bytes < 100 * 1024 * 1024 ? 1 : 0) + "MB";
    }

    /** 嵌入源区块（D4 三态单选 + D7 下载进度 + D5 重嵌进度；1.2s 轮询，不能让用户傻等）。 */
    function EmbeddingSection(props) {
      var rpc = props.rpc;
      var stState = react.useState(null);
      var st = stState[0];
      var setSt = stState[1];
      var errState = react.useState(null);
      var err = errState[0];
      var setErr = errState[1];
      // 轮询退避标志（load 维护）：snapshot 每次几十次 fs.stat，空闲常开 1.2s 是白烧
      var busyPollRef = react.useRef(null);

      var load = react.useCallback(function () {
        rpc("dsh-memory/embedding-state-get", {})
          .then(function (r) {
            if (r && r.ok && r.value && r.value.supported !== false) {
              var v = r.value;
              if (busyPollRef.current) {
                busyPollRef.current.v = !!(
                  (v.download && (v.download.phase === "downloading" || v.download.phase === "verifying")) ||
                  v.apply.busy ||
                  (v.reindex && v.reindex.running) ||
                  (v.runtime && v.runtime.phase === "installing")
                );
              }
              setSt(v);
              setErr(null);
            } else if (r && r.ok && r.value && r.value.supported === false) {
              setSt(null);
              setErr("__unsupported__");
            } else {
              setErr(r && r.error ? r.error.message : "RPC error");
            }
          })
          .catch(function (e) {
            setErr(String((e && e.message) || e));
          });
      }, [rpc]);

      react.useEffect(function () { load(); }, [load]);
      react.useEffect(function () {
        var stopped = false;
        var busyFlag = { v: false };
        busyPollRef.current = busyFlag;
        var tick = function () {
          if (stopped) return;
          load();
          timer = setTimeout(tick, busyFlag.v ? 1200 : 5000);
        };
        var timer = setTimeout(tick, 1200);
        return function () {
          stopped = true;
          clearTimeout(timer);
          busyPollRef.current = null;
        };
      }, [load]);

      var call = function (endpoint, payload, confirmText) {
        if (confirmText && !window.confirm(confirmText)) return;
        rpc(endpoint, payload)
          .then(function (r) {
            if (!r || !r.ok) setErr(r && r.error ? r.error.message : "操作失败");
            else { setErr(null); load(); }
          })
          .catch(function (e) { setErr(String((e && e.message) || e)); });
      };

      if (err === "__unsupported__") {
        return react.createElement(
          "div", { className: "dsh-mem-rb-card" },
          react.createElement("div", { style: { fontWeight: 600, marginBottom: 4 } }, "语义检索（嵌入）"),
          react.createElement("div", { className: "dsh-mem-rb-muted" }, "存储处于降级状态，嵌入管理不可用。"),
        );
      }
      if (!st) {
        return react.createElement(
          "div", { className: "dsh-mem-rb-card" },
          react.createElement("div", { className: "dsh-mem-rb-muted" }, err ? "嵌入状态读取失败：" + err : "嵌入状态读取中…"),
          err ? react.createElement(NButton, { style: { marginTop: 8 }, onClick: load }, "重试") : null,
        );
      }

      var switchConfirm = "切换嵌入源后将按新模型重建向量索引（期间语义检索暂退化为关键词匹配，不影响对话）。确定切换？";
      var onSource = function (key) {
        if (key === "local") {
          // 本地档需要具体模型：有已下载模型直接用最新的启用；否则提示先下载
          var ready = [];
          for (var i = 0; i < st.models.length; i++) if (st.models[i].state === "downloaded") ready.push(st.models[i].id);
          if (ready.length === 0) {
            setErr("请先在下方下载一个本地嵌入模型，再切换到本地档。");
            return;
          }
          // 默认取目录序首个已下载模型（目录按轻→重排序，避免默认选中最重最慢的）
          var current = st.activeModel && ready.indexOf(st.activeModel) >= 0 ? st.activeModel : ready[0];
          call("dsh-memory/embedding-source-set", { source: "local", activeModel: current }, switchConfirm);
          return;
        }
        call("dsh-memory/embedding-source-set", { source: key }, key === "remote" ? switchConfirm : null);
      };

      var dl = st.download;
      var dlActive = dl && (dl.phase === "downloading" || dl.phase === "verifying");
      var ap = st.apply;
      var localInfo = st.local;
      var rt = st.runtime;

      var runtimeRow = null;
      if (rt.phase === "installing") {
        runtimeRow = react.createElement(
          "div", { style: { marginTop: 8, fontSize: 12 } },
          react.createElement("div", { style: S.flexRow },
            react.createElement("span", null, "安装推理运行时中… 已耗时 " + Math.round(rt.elapsedMs / 1000) + "s（约 100~200MB，视网络）"),
            react.createElement("div", { style: S.grow }),
            react.createElement(NButton, { onClick: function () { call("dsh-memory/embedding-runtime-cancel", {}); } }, "取消"),
          ),
          react.createElement(
            "pre",
            { style: Object.assign({}, S.pre, { maxHeight: 68, marginTop: 6, fontSize: 11, opacity: 0.85 }) },
            (rt.lastLines || []).join("\n") || "等待 npm 输出…",
          ),
        );
      } else if (rt.phase === "error") {
        runtimeRow = react.createElement(
          "div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsh-mem-danger)" } },
          "运行时安装失败：" + (rt.error || "未知") + "（重新切换嵌入源可重试）",
        );
      } else if (rt.phase === "ready") {
        runtimeRow = react.createElement(
          "div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 } },
          "推理运行时就绪（transformers.js v" + rt.installedVersion + "）",
        );
      } else if (st.source === "local") {
        runtimeRow = react.createElement(
          "div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 } },
          "首次启用本地嵌入时会自动安装推理运行时（约 100~200MB）。",
        );
      }

      var applyRow = null;
      if (ap.phase === "warming") {
        applyRow = react.createElement("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 } }, "加载嵌入模型中…（首次需数秒）");
      } else if (ap.phase === "switching") {
        applyRow = react.createElement("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 } }, "切换嵌入源中…");
      } else if (ap.phase === "error") {
        applyRow = react.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsh-mem-danger)" } }, "切换失败：" + ap.message + "（已保存的嵌入源不变，重启后仍按原源运行）");
      } else if (st.reindex && st.reindex.running) {
        var rj = st.reindex;
        var rDone = rj.l1Done + rj.l0Done;
        var rTotal = rj.l1Total + rj.l0Total;
        var rPct = rTotal > 0 ? Math.round((rDone / rTotal) * 100) : 0;
        applyRow = react.createElement(
          "div", { style: { marginTop: 8 } },
          react.createElement("div", { style: S.flexRow },
            react.createElement("span", { className: "dsh-mem-rb-muted" },
              "重嵌入中 L1 " + rj.l1Done + "/" + rj.l1Total + " · L0 " + rj.l0Done + "/" + rj.l0Total + "（" + rPct + "%）"),
            react.createElement("div", { style: S.grow }),
            react.createElement(NButton, { onClick: function () { call("dsh-memory/embedding-reindex-cancel", {}); } }, "取消"),
          ),
          react.createElement(
            "div", { style: Object.assign({}, S.flexRow, { marginTop: 6 }) },
            react.createElement("div", { className: "dsh-mem-rb-bar" }, react.createElement("div", { className: "dsh-mem-rb-fill", style: { width: rPct + "%" } })),
          ),
        );
      }

      var modelCards = st.models.map(function (m) {
        var isActive = st.source === "local" && st.activeModel === m.id;
        var mDl = dlActive && dl.modelId === m.id;
        var pct = mDl && dl.overallTotal > 0 ? Math.round((dl.overallReceived / dl.overallTotal) * 100) : 0;
        var action = null;
        if (mDl) {
          action = react.createElement(
            "div", { style: { flex: 1, minWidth: 200 } },
            react.createElement("div", { style: S.flexRow },
              react.createElement("span", { className: "dsh-mem-rb-muted", style: { whiteSpace: "nowrap" } },
                (dl.phase === "verifying" ? "校验中 " : "") +
                fmtMB(dl.overallReceived) + " / " + fmtMB(dl.overallTotal) + "（文件 " + dl.fileIndex + "/" + dl.fileCount + "，" + pct + "%" +
                (dl.speedBps > 0 && dl.phase === "downloading" ? "，" + fmtMB(dl.speedBps) + "/s" : "") + "）"),
              react.createElement("div", { style: S.grow }),
              react.createElement(NButton, { onClick: function () { call("dsh-memory/embedding-download-cancel", {}); } }, "取消"),
            ),
            react.createElement(
              "div", { style: Object.assign({}, S.flexRow, { marginTop: 6 }) },
              react.createElement("div", { className: "dsh-mem-rb-bar" }, react.createElement("div", { className: "dsh-mem-rb-fill", style: { width: pct + "%" } })),
            ),
          );
        } else if (isActive) {
          action = react.createElement(
            "div", { style: S.flexRow },
            react.createElement("span", { className: "dsh-mem-tag dsh-mem-tag-work-task" }, "使用中"),
            localInfo && localInfo.state === "loading" ? react.createElement("span", { className: "dsh-mem-rb-muted" }, "模型加载中…") : null,
            localInfo && localInfo.state === "failed"
              ? react.createElement("span", { style: { fontSize: 12, color: "var(--dsh-mem-danger)" } }, "加载失败：" + (localInfo.error || ""))
              : null,
            localInfo && localInfo.state === "ready" ? react.createElement("span", { className: "dsh-mem-rb-muted" }, "已就绪") : null,
          );
        } else if (m.state === "downloaded") {
          action = react.createElement(
            "div", { style: S.flexRow },
            react.createElement(NButton, { disabled: ap.busy, onClick: function () {
              call("dsh-memory/embedding-source-set", { source: "local", activeModel: m.id }, switchConfirm);
            } }, "启用"),
            react.createElement(NButton, { disabled: dlActive, onClick: function () {
              call("dsh-memory/embedding-model-delete", { modelId: m.id }, "删除已下载的 " + m.name + "（" + fmtMB(m.totalBytes) + "）？");
            } }, "删除"),
          );
        } else {
          action = react.createElement(NButton, {
            disabled: dlActive || !st.ceilings.local,
            title: !st.ceilings.local ? "部署已禁用本地嵌入模型" : "",
            onClick: function () { call("dsh-memory/embedding-download-start", { modelId: m.id }); },
          }, (m.state === "partial" ? "继续下载 " : "下载 ") + fmtMB(m.totalBytes));
        }
        return react.createElement(
          "div",
          { key: m.id, style: Object.assign({}, S.flexRow, { padding: "8px 0", borderBottom: "1px solid var(--dsh-mem-border)", flexWrap: "wrap" }) },
          react.createElement(
            "div", { style: { minWidth: 150 } },
            react.createElement("div", { style: { fontWeight: 600 } }, m.name),
            react.createElement("div", { className: "dsh-mem-rb-muted" }, m.tags.join(" · ") + " · " + m.dims + " 维 · 上下文 " + m.contextTokens),
          ),
          react.createElement("div", { style: { flex: 1, minWidth: 180, fontSize: 12, color: "var(--dsh-mem-text-2)" } }, m.description),
          action,
        );
      });

      return react.createElement(
        "div", { className: "dsh-mem-rb-card" },
        react.createElement(
          "div", { style: S.flexRow },
          react.createElement("div", { style: { fontWeight: 600, whiteSpace: "nowrap" } }, "语义检索（嵌入源）"),
          react.createElement("div", { style: S.grow }),
          react.createElement(Segmented, {
            value: st.source,
            options: [
              { key: "off", label: "关闭" },
              { key: "local", label: "本地", disabled: !st.ceilings.local, disabledTitle: "部署已禁用本地嵌入模型" },
              { key: "remote", label: "远程", disabled: !st.ceilings.remote, disabledTitle: "部署未配置远程嵌入（baseUrl/apiKey/model/dimensions）" },
            ],
            onChange: onSource,
          }),
        ),
        react.createElement(
          "div", { className: "dsh-mem-rb-muted", style: { marginTop: 4 } },
          st.source === "off" ? "当前：关键词（BM25）检索，不做向量嵌入"
            : st.source === "remote" ? "当前：远程嵌入（" + (rt ? "" : "") + "模型由部署配置给定）"
            : "当前：本地嵌入" + (st.activeModel ? "（" + st.activeModel + "）" : ""),
        ),
        st.activeNote
          ? react.createElement("div", { style: { marginTop: 4, fontSize: 12, color: "var(--dsh-mem-danger)" } }, st.activeNote)
          : null,
        err && err !== "__unsupported__"
          ? react.createElement("div", { style: { marginTop: 6, fontSize: 12, color: "var(--dsh-mem-danger)" } }, err)
          : null,
        dl && dl.phase === "error"
          ? react.createElement("div", { style: { marginTop: 6, fontSize: 12, color: "var(--dsh-mem-danger)" } }, "下载失败：" + (dl.error || ""))
          : null,
        runtimeRow,
        applyRow,
        react.createElement("div", { style: S.panelLabel }, "本地模型目录（下载后离线可用，不随插件分发）"),
        modelCards,
      );
    }

    // ── 蒸馏模型选择器（供应商/模型两级下拉）──
    // 数据源：dsh-memory/llm-providers（供应商目录 + 当前覆盖 + 实际生效路由）与
    // dsh-memory/llm-models（所选供应商的模型列表）。写入走 settings-set 的
    // distillProvider/distillModel 两键（成对提交）。部署静态 pin（pinned）时禁用。
    function LlmModelRow(props) {
      var rpc = props.rpc;
      var disabled = !!props.disabled;

      // 注意：全部 hook 必须在任何提前返回之前声明（Rules of Hooks）——
      // info 未加载的首渲染会 return null，晚于它的 useState 会让 hook 数随渲染漂移而崩溃
      var infoState = react.useState(null);
      var setInfo = infoState[1];
      var modelsState = react.useState(null);
      var setModels = modelsState[1];
      var draftState = react.useState("");
      var setDraft = draftState[1];
      var manualState = react.useState("");
      var manualModel = manualState[0];
      var setManualModel = manualState[1];

      react.useEffect(function () {
        var load = function () {
          rpc("dsh-memory/llm-providers", {})
            .then(function (r) { if (r && r.ok) setInfo(r.value); })
            .catch(function () {});
        };
        load();
        var timer = setInterval(load, 5000);
        return function () { clearInterval(timer); };
      }, [rpc]);

      var info = infoState[0];
      // 草稿供应商（已选待挑模型）优先于已存选择
      var draft = draftState[0];
      var curProvider = draft || (info && info.current ? info.current.provider : "");
      var curModel = info && info.current ? info.current.model : "";

      react.useEffect(function () {
        if (!curProvider) { setModels(null); return undefined; }
        var alive = true;
        setModels(null);
        rpc("dsh-memory/llm-models", { provider: curProvider })
          .then(function (r) { if (alive && r && r.ok) setModels(r.value.models || []); })
          .catch(function () { if (alive) setModels([]); });
        return function () { alive = false; };
      }, [rpc, curProvider]);

      var writeLlm = function (patch) {
        if (!info) return;
        // 乐观更新：立即写视图字段，失败回滚
        var prev = info;
        setInfo(Object.assign({}, prev, {
          current: Object.assign({}, prev.current, patch),
        }));
        setDraft("");
        rpc("dsh-memory/settings-set", patch)
          .then(function (r) {
            if (!r || !r.ok) {
              setInfo(prev);
              setDraft(draft);
            }
          })
          .catch(function () {
            setInfo(prev);
            setDraft(draft);
          });
      };

      if (!info) return null;
      if (info.pinned) {
        // 部署静态 pin：显示固定路由，选择器不出场
        return react.createElement(
          "div", { style: S.switchRow },
          react.createElement("div", null,
            react.createElement("div", { style: S.switchLabel }, "蒸馏模型"),
            react.createElement(
              "div", { style: S.switchDesc },
              "已由部署配置固定：" + info.effective.provider + " / " + info.effective.model,
            )),
        );
      }

      var providers = info.providers || [];
      var models = modelsState[0];
      var providerKnown = curProvider === "" || providers.some(function (p) { return p.id === curProvider; });
      var modelKnown = models && models.some(function (m) { return m.id === curModel; });
      // 供应商列表为空数组 = 适配器不提供模型目录：降级为手动输入模型 id
      var manualInput = models !== null && models.length === 0;

      var defaultLabel = info.default
        ? "跟随默认（" + info.default.provider + " / " + info.default.model + "）"
        : "跟随默认";

      var providerOptions = [{ id: "", label: defaultLabel }].concat(
        providers.map(function (p) { return { id: p.id, label: p.name + "（" + p.id + "）" }; }),
      );
      if (curProvider && !providerKnown) {
        providerOptions.push({ id: curProvider, label: curProvider + "（已不在列表）" });
      }

      var modelOptions = [{ id: "", label: "跟随默认" }].concat(
        (models || []).map(function (m) { return { id: m.id, label: m.name !== m.id ? m.name + "（" + m.id + "）" : m.id }; }),
      );
      if (curModel && !modelKnown) {
        modelOptions.push({ id: curModel, label: curModel + "（已不在列表）" });
      }

      return react.createElement(
        "div", { style: Object.assign({}, S.switchRow, { flexWrap: "wrap" }) },
        react.createElement(
          "select",
          {
            className: "dsh-mem-select",
            style: { flexShrink: 0, maxWidth: 220 },
            value: curProvider,
            disabled: disabled,
            onChange: function (e) {
              var v = e.target.value;
              if (v === "") {
                writeLlm({ distillProvider: "", distillModel: "" });
              } else {
                setDraft(v);
              }
            },
          },
          providerOptions.map(function (o) {
            return react.createElement("option", { key: o.id, value: o.id }, o.label);
          }),
        ),
        !curProvider
          ? null
          : manualInput
            ? react.createElement(NInput, {
                style: { flex: 1, minWidth: 160 },
                placeholder: "模型 id（该供应商未提供列表，手动输入后回车）…",
                value: manualModel,
                onChange: function (e) { setManualModel(e.target.value); },
                onKeyDown: function (e) {
                  if (e.key === "Enter" && manualModel.trim()) {
                    writeLlm({ distillProvider: curProvider, distillModel: manualModel.trim() });
                    setManualModel("");
                  }
                },
              })
            : react.createElement(
                "select",
                {
                  className: "dsh-mem-select",
                  style: { flex: 1, minWidth: 160 },
                  value: curModel,
                  disabled: disabled || models === null,
                  onChange: function (e) {
                    writeLlm({ distillProvider: curProvider, distillModel: e.target.value });
                  },
                },
                modelOptions.map(function (o) {
                  return react.createElement("option", { key: o.id, value: o.id }, o.label);
                }),
              ),
        react.createElement("div", null,
          react.createElement("div", { style: S.switchLabel }, "蒸馏模型"),
          react.createElement(
            "div", { style: S.switchDesc },
            info.effective
              ? "当前生效 " + info.effective.provider + " / " + info.effective.model +
                  (curProvider ? "" : "（跟随默认选择）")
              : "暂无可用路由（未选择且无默认）",
          ),
          !providerKnown || (curModel && models !== null && !modelKnown)
            ? react.createElement(
                "div", { style: { fontSize: 12, color: "var(--dsh-mem-danger)" } },
                "所选供应商或模型已不在已配置列表中，蒸馏调用可能失败，建议重新选择。",
              )
            : null),
      );
    }

    // ── 蒸馏输出预算（分层 token 上限）──
    // 数据源：settings-get 的 budgets（current 运行时覆盖 0=跟随默认 / defaults
    // 内置默认 / effective 实际生效）。写入走 settings-set 的 distillBudgets 四键
    // （成对提交）；输入空或 0 = 跟随内置默认。思考档 high/max 的 ×4 放大在生效
    // 值之上自动应用（提示文案注明）。
    function BudgetInputs(props) {
      var rpc = props.rpc;
      var disabled = !!props.disabled;
      var data = props.data;
      var setData = props.setData;
      var onError = props.onError;
      var layers = [
        ["extract", "抽取"],
        ["dedup", "去重"],
        ["l2", "L2 场景"],
        ["l3", "L3 画像"],
      ];
      // 输入草稿（string|null）：击峰只改本地，blur/回车才提交
      var draftState = react.useState(null);
      var draft = draftState[0];
      var setDraft = draftState[1];

      if (!data || !data.budgets) return null;
      var cur = data.budgets.current || {};
      var def = data.budgets.defaults || {};
      var eff = data.budgets.effective || {};

      var shown = function (key) {
        if (draft && draft[key] !== undefined) return draft[key];
        return cur[key] > 0 ? String(cur[key]) : "";
      };

      var commit = function () {
        if (!draft) return;
        var next = {};
        for (var i = 0; i < layers.length; i++) {
          var key = layers[i][0];
          var raw = (draft[key] !== undefined ? draft[key] : shown(key)).trim();
          var n = raw === "" ? 0 : Number(raw);
          if (!Number.isInteger(n) || n < 0 || n > 1000000) {
            onError("预算须为 0~1000000 的整数（留空或 0 = 跟随默认）");
            setDraft(null);
            return;
          }
          next[key] = n;
        }
        setDraft(null);
        // 乐观更新：同步 settings.distillBudgets 与 budgets.current/effective 视图字段
        var prev = data;
        var effNext = {};
        for (var j = 0; j < layers.length; j++) {
          var k = layers[j][0];
          effNext[k] = next[k] > 0 ? next[k] : (def[k] || 0);
        }
        setData(Object.assign({}, prev, {
          settings: Object.assign({}, prev.settings, { distillBudgets: next }),
          budgets: Object.assign({}, prev.budgets, { current: next, effective: effNext }),
        }));
        rpc("dsh-memory/settings-set", { distillBudgets: next })
          .then(function (r) {
            if (!r || !r.ok) {
              setData(prev);
              onError(r && r.error ? "预算写入失败：" + r.error.message : "预算写入失败");
            } else {
              onError(null);
            }
          })
          .catch(function (e) {
            setData(prev);
            onError("预算写入失败：" + String((e && e.message) || e));
          });
      };

      var changed = false;
      if (draft) {
        for (var c = 0; c < layers.length; c++) {
          var ck = layers[c][0];
          var want = (draft[ck] !== undefined ? draft[ck] : "").trim();
          var was = cur[ck] > 0 ? String(cur[ck]) : "";
          if (want !== was) { changed = true; break; }
        }
      }

      return react.createElement(
        "div", { style: S.switchRow },
        react.createElement(
          "div", { style: Object.assign({}, S.flexRow, { gap: 6 }) },
          layers.map(function (l) {
            return react.createElement(NInput, {
              key: l[0],
              type: "number",
              min: 0,
              max: 1000000,
              style: { width: 92 },
              title: l[1] + " 输出预算（token，留空 = 默认 " + (def[l[0]] || "?") + "）",
              placeholder: String(def[l[0]] || ""),
              value: shown(l[0]),
              disabled: disabled,
              onChange: function (e) {
                var v = e.target.value;
                var d = Object.assign({}, draft || {});
                d[l[0]] = v;
                setDraft(d);
              },
              onBlur: function () { if (changed) commit(); },
              onKeyDown: function (e) { if (e.key === "Enter" && changed) commit(); },
            });
          }),
        ),
        react.createElement("div", null,
          react.createElement("div", { style: S.switchLabel }, "输出预算"),
          react.createElement(
            "div", { style: S.switchDesc },
            "各蒸馏层单次输出的 token 上限（抽取/去重/L2/L3）；留空或 0 = 跟随默认（当前生效 " +
              layers.map(function (l) { return eff[l[0]] || "?"; }).join(" / ") +
              "）；思考档 high/max 时实际限额自动 ×4",
          )),
      );
    }

    // ── Tab：概览（开关面板 + 计数） ──
    function OverviewTab(props) {
      var rpc = props.rpc;
      var statsState = react.useState(null);
      var stats = statsState[0];
      var setStats = statsState[1];
      var settingsState = react.useState(null);
      var settingsData = settingsState[0];
      var setSettingsData = settingsState[1];
      var errState = react.useState(null);
      var error = errState[0];
      var setError = errState[1];

      var load = react.useCallback(function () {
        rpc("dsh-memory/stats", {})
          .then(function (r) {
            if (r && r.ok) setStats(r.value);
            else setError(r && r.error ? r.error.message : "RPC error");
          })
          .catch(function (e) { setError(String((e && e.message) || e)); });
        rpc("dsh-memory/settings-get", {})
          .then(function (r) {
            if (r && r.ok) setSettingsData(r.value);
          })
          .catch(function () {});
      }, [rpc]);

      react.useEffect(function () {
        load();
        var timer = setInterval(load, 5000);
        return function () { clearInterval(timer); };
      }, [load]);

      var toggle = function (key, value) {
        if (!settingsData) return;
        // 乐观更新：立即翻 UI，失败回滚
        var prev = settingsData;
        var patch = (function () { var o = {}; o[key] = value; return o; })();
        var next = Object.assign({}, prev, {
          settings: Object.assign({}, prev.settings, patch),
        });
        // 蒸馏思考选择器读 effort.current（非 settings 键）：乐观更新须同步该视图字段，
        // 否则点击后选择器在下一个 5s 轮询前"弹回"旧值，看起来没生效
        if (key === "reasoningEffort" && next.effort) {
          next.effort = Object.assign({}, prev.effort, {
            current: value,
            effective: value || prev.effort.fallback,
          });
        }
        setSettingsData(next);
        rpc("dsh-memory/settings-set", patch)
          .then(function (r) {
            if (!r || !r.ok) {
              setSettingsData(prev);
              setError(r && r.error ? "开关写入失败：" + r.error.message : "开关写入失败");
            } else {
              setError(null);
            }
          })
          .catch(function (e) {
            setSettingsData(prev);
            setError("开关写入失败：" + String((e && e.message) || e));
          });
      };

      // 统计分两段：计数瓦片（一眼可读）+ 明细行（目录/版本/时间线/队列）
      var tiles = [];
      var infos = [];
      if (stats) {
        var th = stats.thresholds || {};
        tiles.push({ num: String(stats.l0Today), label: "L0 今日消息" });
        tiles.push({ num: String(stats.l1Count), label: "L1 原子记忆" });
        tiles.push({ num: String(stats.sceneCount), label: "L2 场景块" });
        tiles.push({ num: String(stats.pendingExtract), label: "待重试消息" });
        infos.push(["数据目录", stats.dataDir]);
        infos.push(["插件版本", "v" + stats.version]);
        infos.push(["默认档", modeLabel(stats.family)]);
        infos.push(["L1 累计抽取", String(stats.l1TotalExtracted)]);
        infos.push(["L3 画像", stats.personaChars > 0 ? stats.personaChars + " 字符" : "未生成"]);
        infos.push(["上次 L1 抽取", fmtTime(stats.lastExtractAt)]);
        infos.push(["上次 L2 整合", fmtTime(stats.lastL2At)]);
        infos.push(["上次 L3 蒸馏", fmtTime(stats.lastL3At)]);
        infos.push(["待 L2 新记忆", stats.memoriesSinceL2 + " / " + (th.l2MinNewMemories != null ? th.l2MinNewMemories : 5)]);
        infos.push(["待 L3 新记忆", stats.memoriesSinceL3 + " / " + (th.l3Interval != null ? th.l3Interval : 20)]);
      }
      var degraded = stats && stats.message && stats.message !== "running";

      var master = settingsData && settingsData.settings ? settingsData.settings.enabled : true;
      var ceilingNote = "";
      if (settingsData && settingsData.ceilings) {
        var off = [];
        if (!settingsData.ceilings.capture) off.push("捕获");
        if (!settingsData.ceilings.distill) off.push("蒸馏");
        if (!settingsData.ceilings.recall) off.push("召回");
        if (off.length > 0) ceilingNote = "注意：部署配置已停用 " + off.join("、") + "（运行时开关无法开启）";
      }

      return react.createElement(
        "div", null,
        settingsData && settingsData.supported === false
          ? react.createElement("p", { style: S.hint }, "settings 服务不可用，记忆模式开关未启用（记忆保持全开）。")
          : settingsData
            ? react.createElement(
                "div", { style: S.switchPanel },
                // 分组：记忆模式（总闸与三个分项开关）
                react.createElement("div", { style: S.panelLabel }, "记忆模式"),
                react.createElement(SwitchRow, {
                  label: "记忆模式",
                  desc: master ? "已开启：捕获对话并蒸馏记忆" : "已关闭：不捕获、不蒸馏、不注入（数据保留）",
                  checked: master,
                  onChange: function (v) { toggle("enabled", v); },
                }),
                react.createElement(SwitchRow, {
                  label: "捕获",
                  desc: "L0：记录原始对话（关闭后蒸馏也无输入）",
                  checked: settingsData.settings.capture,
                  disabled: !master,
                  onChange: function (v) { toggle("capture", v); },
                }),
                react.createElement(SwitchRow, {
                  label: "蒸馏",
                  desc: "L1 抽取 + L2 场景 + L3 画像",
                  checked: settingsData.settings.distill,
                  disabled: !master,
                  onChange: function (v) { toggle("distill", v); },
                }),
                react.createElement(SwitchRow, {
                  label: "召回",
                  desc: "对话时注入相关记忆与画像",
                  checked: settingsData.settings.recall,
                  disabled: !master,
                  onChange: function (v) { toggle("recall", v); },
                }),
                // 分组：蒸馏参数（模型路由 / 思考档位 / 输出预算）
                react.createElement("div", { style: S.panelLabel }, "蒸馏参数"),
                settingsData.effort
                  ? react.createElement(
                      "div",
                      { style: S.switchRow },
                      react.createElement(Segmented, {
                        value: settingsData.effort.current,
                        options: [
                          { key: "", label: "跟随配置" },
                          { key: "off", label: "off" },
                          { key: "high", label: "high" },
                          { key: "max", label: "max" },
                        ],
                        disabled: !master,
                        onChange: function (v) { toggle("reasoningEffort", v); },
                      }),
                      react.createElement("div", null,
                        react.createElement("div", { style: S.switchLabel }, "蒸馏思考"),
                        react.createElement(
                          "div",
                          { style: S.switchDesc },
                          "当前生效 " + (settingsData.effort.effective || "（不传，跟随模型默认）") +
                            (settingsData.effort.current ? "" : "（来自部署配置 llm.reasoningEffort）"),
                        )),
                    )
                  : null,
                react.createElement(LlmModelRow, { rpc: rpc, disabled: !master }),
                react.createElement(BudgetInputs, {
                  rpc: rpc,
                  disabled: !master,
                  data: settingsData,
                  setData: setSettingsData,
                  onError: setError,
                }),
                ceilingNote
                  ? react.createElement("p", { style: S.hint }, ceilingNote)
                  : null,
              )
            : null,
        react.createElement(EmbeddingSection, { rpc: rpc }),
        react.createElement(RebuildPanel, { rpc: rpc }),
        degraded
          ? react.createElement(
              "div",
              { style: Object.assign({}, S.error, { marginBottom: 10 }) },
              "⚠ " + stats.message + "。上方数据为最后一次成功读取的值，记忆功能当前未工作。",
            )
          : null,
        error
          ? react.createElement("div", { style: S.error }, "获取状态失败：" + error)
          : !stats
            ? react.createElement("p", { style: S.intro }, "正在读取记忆状态…")
            : react.createElement(
                "div", null,
                react.createElement("div", { style: S.panelLabel }, "记忆概况"),
                react.createElement(
                  "div", { style: S.statGrid },
                  tiles.map(function (t) {
                    return react.createElement(
                      "div",
                      { key: t.label, className: "dsh-mem-card", style: S.statTile },
                      react.createElement("div", { style: S.statNum }, t.num),
                      react.createElement("div", { style: S.statLabel }, t.label),
                    );
                  }),
                ),
                react.createElement("div", { style: S.panelLabel }, "运行状态"),
                infos.map(function (row) {
                  return react.createElement(
                    "div", { key: row[0], style: S.infoRow },
                    react.createElement("span", { style: S.infoKey }, row[0]),
                    react.createElement("span", { style: S.infoVal }, row[1]),
                  );
                }),
              ),
        react.createElement(
          "p", { style: S.hint },
          "浏览各层记忆内容请切换上方 Tab；原始对话（L0）不入浏览器，可由模型侧 conversation_search 工具查询。",
        ),
      );
    }

    // ── Tab：L1 记忆浏览器 ──
    function RecordsTab(props) {
      var rpc = props.rpc;
      var limit = 50;

      var itemsState = react.useState([]);
      var items = itemsState[0];
      var setItems = itemsState[1];
      var moreState = react.useState(false);
      var hasMore = moreState[0];
      var setHasMore = moreState[1];
      var totalState = react.useState(null);
      var total = totalState[0];
      var setTotal = totalState[1];
      var scenesState = react.useState([]);
      var sceneOptions = scenesState[0];
      var setSceneOptions = scenesState[1];
      var loadingState = react.useState(false);
      var loading = loadingState[0];
      var setLoading = loadingState[1];
      var truncState = react.useState(false);
      var truncated = truncState[0];
      var setTruncated = truncState[1];
      var errState = react.useState(null);
      var error = errState[0];
      var setError = errState[1];
      var expandedState = react.useState(null);
      var expandedId = expandedState[0];
      var setExpandedId = expandedState[1];

      var queryState = react.useState("");
      var query = queryState[0];
      var setQuery = queryState[1];
      var typeState = react.useState("");
      var typeFilter = typeState[0];
      var setTypeFilter = typeState[1];
      var sceneState = react.useState("");
      var sceneFilter = sceneState[0];
      var setSceneFilter = sceneState[1];

      // 最近一次实际查询条件（分页累积用）
      var lastState = react.useState({ query: "", type: "", scene: "" });
      var last = lastState[0];
      var setLast = lastState[1];

      // 请求序列号：快速连续搜索/翻页时丢弃过期响应（慢的旧响应不得覆盖新结果）
      var seqRef = react.useRef(0);

      var fetchPage = react.useCallback(function (conds, offset, append) {
        setLoading(true);
        setError(null);
        var token = ++seqRef.current;
        var payload = { limit: limit, offset: offset };
        if (conds.query) payload.query = conds.query;
        if (conds.type) payload.type = conds.type;
        if (conds.scene) payload.scene = conds.scene;
        rpc("dsh-memory/list-records", payload)
          .then(function (r) {
            if (token !== seqRef.current) return;
            setLoading(false);
            if (!r || !r.ok) {
              setError(r && r.error ? r.error.message : "RPC error");
              return;
            }
            var v = r.value;
            setItems(function (prev) { return append ? prev.concat(v.items) : v.items; });
            setHasMore(!!v.hasMore);
            setTotal(v.total === undefined || v.total === null ? null : v.total);
            setTruncated(!!v.truncated);
            if (v.scenes) setSceneOptions(v.scenes);
          })
          .catch(function (e) {
            if (token !== seqRef.current) return;
            setLoading(false);
            setError(String((e && e.message) || e));
          });
      }, [rpc]);

      var search = function () {
        var conds = { query: query.trim(), type: typeFilter, scene: sceneFilter };
        setLast(conds);
        fetchPage(conds, 0, false);
      };

      react.useEffect(function () {
        fetchPage({ query: "", type: "", scene: "" }, 0, false);
      }, [fetchPage]);

      // 混合视图：两族类型都在库里，筛选器给全 7 类
      var typeChoices = [
        "persona", "episodic", "instruction",
        "work_fact", "work_task", "work_method", "work_artifact",
      ];

      var countText = total !== null ? "共 " + total + " 条" : items.length + " 条" + (hasMore ? "+" : "");

      return react.createElement(
        "div", null,
        react.createElement(
          "div", { style: S.toolbar },
          react.createElement(NInput, {
            style: { flex: 1, minWidth: 160 },
            placeholder: "搜索记忆内容（BM25 关键词）…",
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            onKeyDown: function (e) { if (e.key === "Enter") search(); },
          }),
          react.createElement(
            "select",
            {
              className: "dsh-mem-select",
              value: typeFilter,
              onChange: function (e) { setTypeFilter(e.target.value); },
            },
            react.createElement("option", { value: "" }, "全部类型"),
            typeChoices.map(function (t) {
              return react.createElement("option", { key: t, value: t }, TYPE_LABELS[t] || t);
            }),
          ),
          react.createElement(
            "select",
            {
              className: "dsh-mem-select",
              value: sceneFilter,
              onChange: function (e) { setSceneFilter(e.target.value); },
            },
            react.createElement("option", { value: "" }, "全部情境"),
            sceneOptions.map(function (s) {
              return react.createElement("option", { key: s, value: s }, s.length > 24 ? s.slice(0, 24) + "…" : s);
            }),
          ),
          react.createElement(NButton, { onClick: search }, "搜索"),
        ),
        react.createElement(
          "div", { style: Object.assign({}, S.flexRow, { marginBottom: 10 }) },
          react.createElement("span", { style: S.muted }, loading ? "加载中…" : countText),
          react.createElement("div", { style: S.grow }),
          react.createElement(NButton, {
            onClick: function () { fetchPage(last, 0, false); },
          }, "刷新"),
        ),
        error ? react.createElement("div", { style: S.error }, error) : null,
        truncated
          ? react.createElement(
              "div",
              { style: S.hint },
              "搜索分页已达检索上限（200 条），更早的结果未显示。请用更精确的关键词或类型/情境过滤。",
            )
          : null,
        items.length === 0 && !loading && !error
          ? react.createElement("p", { style: S.intro }, "暂无记忆。对话几轮后，蒸馏管线会自动抽取记忆。")
          : items.map(function (m) {
              var open = expandedId === m.id;
              return react.createElement(
                "div",
                {
                  key: m.id,
                  className: "dsh-mem-card dsh-mem-card-hover",
                  style: Object.assign({}, S.card, { cursor: "pointer" }),
                  onClick: function () { setExpandedId(open ? null : m.id); },
                },
                react.createElement(
                  "div", { style: S.cardHead },
                  react.createElement(
                    "span",
                    { className: "dsh-mem-tag dsh-mem-tag-" + m.type },
                    TYPE_LABELS[m.type] || m.type,
                  ),
                  react.createElement("span", { style: S.muted }, "优先级 " + m.priority),
                  m.score !== null && m.score !== undefined
                    ? react.createElement("span", { style: S.muted }, "相关度 " + Number(m.score).toFixed(2))
                    : null,
                  react.createElement("div", { style: S.grow }),
                  react.createElement("span", { style: S.muted }, fmtTime(m.updatedAt)),
                ),
                react.createElement("div", { style: S.content }, m.content),
                open
                  ? react.createElement(
                      "div", { style: S.detail },
                      "id: " + m.id + "\n" +
                      "情境: " + (m.scene || "-") + "\n" +
                      "版本: v" + m.version + "（去重合并次数 " + m.version + "）\n" +
                      "创建: " + fmtTime(m.createdAt) + "\n" +
                      "活跃时间: " + (m.timestamps && m.timestamps.length > 0 ? m.timestamps.map(fmtTime).join(" → ") : "-") + "\n" +
                      (m.sourceMessageIds && m.sourceMessageIds.length > 0
                        ? "来源消息: " + m.sourceMessageIds.join(", ")
                        : "来源消息: -"),
                    )
                  : null,
              );
            }),
        hasMore
          ? react.createElement(
              "div", { style: S.flexRow },
              react.createElement("div", { style: S.grow }),
              react.createElement(NButton, {
                disabled: loading,
                onClick: function () {
                  if (!loading) fetchPage(last, items.length, true);
                },
              }, loading ? "加载中…" : "加载更多"),
            )
          : null,
      );
    }

    // ── Tab：L2 场景 ──
    function ScenesTab(props) {
      var rpc = props.rpc;
      var itemsState = react.useState(null);
      var items = itemsState[0];
      var setItems = itemsState[1];
      var errState = react.useState(null);
      var error = errState[0];
      var setError = errState[1];

      var load = react.useCallback(function () {
        rpc("dsh-memory/scenes", {})
          .then(function (r) {
            if (r && r.ok) { setItems(r.value.items); setError(null); }
            else setError(r && r.error ? r.error.message : "RPC error");
          })
          .catch(function (e) { setError(String((e && e.message) || e)); });
      }, [rpc]);

      react.useEffect(function () { load(); }, [load]);

      return react.createElement(
        "div", null,
        react.createElement(
          "div", { style: Object.assign({}, S.flexRow, { marginBottom: 10 }) },
          react.createElement("span", { style: S.muted }, items ? items.length + " 个场景块" : "加载中…"),
          react.createElement("div", { style: S.grow }),
          react.createElement(NButton, { onClick: load }, "刷新"),
        ),
        error ? react.createElement("div", { style: S.error }, error) : null,
        items && items.length === 0
          ? react.createElement("p", { style: S.intro }, "暂无场景块。累计 5 条新记忆后 L2 会自动整合出第一个场景。")
          : null,
        (items || []).map(function (s) {
          return react.createElement(
            "div", { key: s.path, className: "dsh-mem-card", style: S.card },
            react.createElement(
              "div", { style: S.sceneHead },
              react.createElement("span", { style: S.sceneTitle }, s.path),
              s.heat ? react.createElement("span", { style: S.muted }, "热度 " + s.heat) : null,
              react.createElement("div", { style: S.grow }),
              react.createElement("span", { style: S.muted }, "更新 " + fmtTime(s.updated)),
            ),
            s.summary
              ? react.createElement(
                  "div",
                  { style: Object.assign({}, S.muted, { marginBottom: 6 }) },
                  s.summary,
                )
              : null,
            react.createElement("pre", { style: S.pre }, s.content || "(空)"),
          );
        }),
      );
    }

    // ── Tab：L3 画像 ──
    function PersonaTab(props) {
      var rpc = props.rpc;
      var contentState = react.useState(null);
      var content = contentState[0];
      var setContent = contentState[1];
      var errState = react.useState(null);
      var error = errState[0];
      var setError = errState[1];

      var load = react.useCallback(function () {
        setError(null);
        rpc("dsh-memory/persona", {})
          .then(function (r) {
            if (r && r.ok) setContent(r.value.content);
            else setError(r && r.error ? r.error.message : "RPC error");
          })
          .catch(function (e) { setError(String((e && e.message) || e)); });
      }, [rpc]);

      react.useEffect(function () { load(); }, [load]);

      return react.createElement(
        "div", null,
        react.createElement(
          "div", { style: Object.assign({}, S.flexRow, { marginBottom: 10 }) },
          react.createElement("span", { style: S.muted },
            error ? "加载失败" : content === null ? "加载中…" : content ? content.length + " 字符" : "未生成画像"),
          react.createElement("div", { style: S.grow }),
          react.createElement(NButton, { onClick: load }, "刷新"),
        ),
        error
          ? react.createElement(
              "div",
              { style: Object.assign({}, S.error, { marginBottom: 10 }) },
              "画像读取失败：" + error + "（点右上“刷新”重试）",
            )
          : null,
        content
          ? react.createElement("pre", { style: S.pre }, content)
          : content === null
            ? null
            : react.createElement("p", { style: S.intro }, "画像尚未生成；蒸馏若干记忆后 L3 会自动产出。"),
      );
    }

    // ── Tab：运行日志 ──
    function LogTab(props) {
      var rpc = props.rpc;
      var linesState = react.useState(null);
      var lines = linesState[0];
      var setLines = linesState[1];
      var errState = react.useState(null);
      var error = errState[0];
      var setError = errState[1];

      var load = react.useCallback(function () {
        setError(null);
        rpc("dsh-memory/log-tail", { lines: 200 })
          .then(function (r) {
            if (r && r.ok) setLines(r.value.lines);
            else setError(r && r.error ? r.error.message : "RPC error");
          })
          .catch(function (e) { setError(String((e && e.message) || e)); });
      }, [rpc]);

      react.useEffect(function () { load(); }, [load]);

      return react.createElement(
        "div", null,
        react.createElement(
          "div", { style: Object.assign({}, S.flexRow, { marginBottom: 10 }) },
          react.createElement("span", { style: S.muted }, error ? "加载失败" : lines === null ? "加载中…" : "最近 " + lines.length + " 行（memory.log）"),
          react.createElement("div", { style: S.grow }),
          react.createElement(NButton, { onClick: load }, "刷新"),
        ),
        error
          ? react.createElement(
              "div",
              { style: Object.assign({}, S.error, { marginBottom: 10 }) },
              "日志读取失败：" + error + "（点右上“刷新”重试）",
            )
          : react.createElement("pre", { style: S.pre }, (lines || []).join("\n") || "(暂无日志)"),
      );
    }

    // ── 主面板：Tab 框架 ──
    var TABS = [
      ["overview", "概览"],
      ["records", "记忆"],
      ["scenes", "场景"],
      ["persona", "画像"],
      ["log", "日志"],
    ];

    // ── 设置页侧边栏 icon：宿主 navIcon() 按 section id 硬编码白名单（slot 注册对象
    // 无 icon 字段），"dsh-memory" 落齿轮兜底。受控 DOM 补丁：把侧边栏"记忆"按钮的
    // 齿轮换成书本 icon。宿主只在分节激活时渲染我们的面板，所以补丁不能依赖
    // MemoryPanel 挂载——由常驻的输入栏 pill 驱动一个 body 级防抖观察器（全局单例，
    // 应用生命周期存续，观察 body 子树 childList）：设置页随时打开、侧边栏随时
    // 重渲染都能打上/重打补丁。找不到或 DOM 结构变化时静默保持原生齿轮。 ──
    var BOOK_ICON_SVG =
      '<svg data-mem-icon="1" viewBox="0 0 16 16" width="16" height="16" fill="none" ' +
      'xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">' +
      '<path d="M8 3.4C6.6 2.5 4.6 2.4 2.9 3.1v9.3c1.7-.7 3.7-.6 5.1.3 1.4-.9 3.4-1 5.1-.3V3.1C11.4 2.4 9.4 2.5 8 3.4Z" ' +
      'stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M8 3.4v9.3" stroke="currentColor" stroke-width="1.2"/></svg>';

    function patchSidebarIcon() {
      try {
        var buttons = document.querySelectorAll("button");
        for (var i = 0; i < buttons.length; i++) {
          var b = buttons[i];
          var span = b.querySelector("span");
          var svg = b.querySelector("svg");
          // 侧边栏导航项 = [svg 图标, span 标签文本]；输入栏 pill 的文本形态不同（"记忆 · X"）
          if (span && svg && span.textContent.trim() === "记忆" && svg.getAttribute("data-mem-icon") !== "1") {
            svg.outerHTML = BOOK_ICON_SVG;
          }
        }
      } catch (e) {
        /* best-effort：失败保持原生齿轮 */
      }
    }

    // body 子树变更频繁（对话流式渲染），补丁扫描走 250ms 尾随防抖
    var sidebarIconTimer = null;
    function scheduleSidebarPatch() {
      if (sidebarIconTimer !== null) return;
      sidebarIconTimer = setTimeout(function () {
        sidebarIconTimer = null;
        patchSidebarIcon();
      }, 250);
    }

    function watchSidebarIcon() {
      patchSidebarIcon();
      try {
        if (document.body.getAttribute("data-mem-icon-bodywatch") === "1") return;
        document.body.setAttribute("data-mem-icon-bodywatch", "1");
        new MutationObserver(scheduleSidebarPatch).observe(document.body, { childList: true, subtree: true });
      } catch (e) {
        /* ignore */
      }
    }

    function MemoryPanel(props) {
      var rpc = props.rpc;
      var tabState = react.useState("overview");
      var tab = tabState[0];
      var setTab = tabState[1];

      ensureThemeStyle(); // 设置页挂载即注入主题令牌与组件样式
      react.useEffect(function () { watchSidebarIcon(); }, []);

      var body;
      if (tab === "overview") body = react.createElement(OverviewTab, { rpc: rpc });
      else if (tab === "records") body = react.createElement(RecordsTab, { rpc: rpc });
      else if (tab === "scenes") body = react.createElement(ScenesTab, { rpc: rpc });
      else if (tab === "persona") body = react.createElement(PersonaTab, { rpc: rpc });
      else body = react.createElement(LogTab, { rpc: rpc });

      return react.createElement(
        "div",
        { className: "dsh-mem-root", style: S.section },
        react.createElement("h2", { style: S.heading }, "记忆 (Memory)"),
        react.createElement(
          "p", { style: S.intro },
          "L0~L3 分层蒸馏记忆：浏览被记住的内容，控制记忆模式开关。",
        ),
        react.createElement(
          "div", { style: S.tabbar },
          TABS.map(function (t) {
            return react.createElement(
              "button",
              {
                key: t[0],
                className: tab === t[0] ? "dsh-mem-tab dsh-mem-tab-on" : "dsh-mem-tab",
                onClick: function () { setTab(t[0]); },
              },
              t[1],
            );
          }),
        ),
        body,
      );
    }

    // ── 插件主体：注册设置页 + 输入栏档位控件 ──
    function makeRpc(ctx) {
      return function (endpoint, payload) {
        if (!ctx.connection || !ctx.connection.rpc) {
          return Promise.reject(new Error("connection 服务不可用"));
        }
        return ctx.connection.rpc.call("/rpc", endpoint, payload || {});
      };
    }

    function apply(ctx) {
      var rpc = makeRpc(ctx);

      // 设置 → 记忆：状态页（浏览器保持两族混合视图）
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          {
            name: "settings.section",
            id: "dsh-memory",
            order: 200,
            label: "记忆",
            inject: function () {
              return { rpc: rpc };
            },
          },
          MemoryPanel,
        );
      });

      // 输入栏（模式选择器右侧）：会话记忆档位 pill + 滑动选择器
      ctx.slots.inject("conversation.input.left", function () {
        return ctx.slots.register(
          {
            name: "conversation.input.left",
            id: "dsh-memory-mode",
            order: 100,
            inject: function (sessionId) {
              return { sessionId: sessionId, rpc: rpc };
            },
          },
          MemoryModePill,
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
