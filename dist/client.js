/**
 * dsh-layered-memory — browser half（手写 plain-JS bundle，无打包器）。
 *
 * 1. 输入栏（conversation.input.left，模式选择器右侧）：会话记忆档位 pill
 *    （关闭/chat/自动/work 四态），点击展开 macOS 风格滑动选择器；
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

    // ── Segmented 组件：分段选择器（记忆设置页的蒸馏思考档位等单选项） ──
    function Segmented(props) {
      var value = props.value;
      var disabled = !!props.disabled;
      return react.createElement(
        "div",
        { style: Object.assign({}, S.seg, disabled ? S.switchDisabled : null) },
        props.options.map(function (opt, i) {
          var on = opt.key === value;
          return react.createElement(
            "span",
            {
              key: opt.key,
              style: Object.assign(
                {},
                S.segBtn,
                on ? S.segBtnOn : null,
                i === props.options.length - 1 ? { borderRight: "none" } : null,
                disabled ? { cursor: "not-allowed" } : null,
              ),
              onClick: function () {
                if (!disabled && !on && props.onChange) props.onChange(opt.key);
              },
            },
            opt.label,
          );
        }),
      );
    }

    // ── 会话记忆档位控件（输入栏 pill + macOS 风格滑动选择器） ──
    // 档位顺序即滑轨顺序：关闭 → chat → work → 自动（默认档"自动"居右）
    // 档位色是 CSS 变量引用（--dsh-mem-mode-*，Light/Dark 各一组值，注入样式表定义）
    var MODES = [
      { key: "off", label: "关闭", color: "var(--dsh-mem-mode-off)" },
      { key: "chat", label: "chat", color: "var(--dsh-mem-mode-chat)" },
      { key: "work", label: "work", color: "var(--dsh-mem-mode-work)" },
      { key: "auto", label: "自动", color: "var(--dsh-mem-mode-auto)" },
    ];
    var TRACK_W = 200;
    var THUMB = 16;
    var INNER_W = TRACK_W - THUMB;

    function modeInfo(key) {
      for (var i = 0; i < MODES.length; i++) if (MODES[i].key === key) return MODES[i];
      return MODES[3];
    }

    function modeLabel(key) {
      if (key === "auto") return "自动（双族）";
      if (key === "chat") return "chat（个人）";
      if (key === "work") return "work（工作）";
      return "off（关闭）";
    }

    function modeIndex(key) {
      for (var i = 0; i < MODES.length; i++) if (MODES[i].key === key) return i;
      return 3;
    }

    /** 滑动选择器浮层（参考 macOS 滑动器：拖拽圆头 1:1 连续跟手，松手按动量投影吸附最近档）。 */
    function ModeSlider(props) {
      ensureThemeStyle(); // 主题令牌与玻璃材质 class 共用同一张注入样式表
      var trackRef = react.useRef(null);
      // 拖拽状态：{ x: 圆头连续位置 px, lastX: 上次指针 clientX, t: 时间戳, v: 速度 px/ms（EMA 平滑） }
      var dragState = react.useState(null);
      var drag = dragState[0];
      var setDrag = dragState[1];

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

      var stops = [];
      for (var i = 0; i < MODES.length; i++) {
        (function (i) {
            var stopLeft = (i / (MODES.length - 1)) * INNER_W + THUMB / 2;
            var active = i === activeIdx;
            stops.push(
              react.createElement(
                "div",
                {
                  key: "stop" + i,
                  style: {
                    position: "absolute",
                    left: stopLeft - 3,
                    top: 6,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: active ? MODES[i].color : "var(--dsh-mem-dot)",
                    zIndex: 2,
                  },
                },
              ),
              react.createElement(
                "button",
                {
                  key: "label" + i,
                  style: {
                    position: "absolute",
                    left: stopLeft,
                    top: 26,
                    transform: "translateX(-50%)",
                    fontSize: 11,
                    lineHeight: "16px",
                    padding: "0 4px",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontWeight: active ? 600 : 400,
                    // 未激活标签走 caption 令牌（玻璃面上保持可读，双主题各一档）
                    color: active ? MODES[i].color : "var(--dsw-alias-label-caption, var(--dsh-mem-text-3))",
                  },
                  onClick: function () { if (drag === null) props.onCommit(MODES[i].key); },
                },
                MODES[i].label,
              ),
            );
        })(i);
      }

      return react.createElement(
        "div",
        {
          // 外壳只负责定位（带 transform 居中）；玻璃材质拆到内层独立元素——
          // Chromium 中 transform 元素上的 backdrop-filter 采样异常，玻璃会失效
          style: {
            position: "absolute",
            bottom: "calc(100% + 8px)",
            // 居中悬浮在按钮上方（水平中轴对齐 pill 中心）
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
          },
        },
        react.createElement("div", {
          className: "dsh-mem-glass",
          style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" },
        }),
        react.createElement(
          "div",
          { style: { position: "relative", padding: "12px 16px 30px" } },
          react.createElement(
            "div",
            {
              ref: trackRef,
              style: {
                position: "relative",
                // 容器宽 = thumb 活动范围（0..INNER_W + THUMB），点击映射与视觉两端严格对齐
                width: TRACK_W,
                height: 16,
                touchAction: "none",
                cursor: drag === null ? "pointer" : "grabbing",
            },
            onPointerDown: onPointerDown,
            onPointerMove: onPointerMove,
            onPointerUp: onPointerUp,
            onPointerCancel: onPointerUp,
          },
          // 线条（底层）：只连首尾停点的中心，两端不再露出停点外；
          // thumb（当前档定位球）压最上层，不再被线条与停点穿过。
          // 中性半透明灰在玻璃材质上深浅主题都可辨
          react.createElement("div", {
            style: {
              position: "absolute",
              left: THUMB / 2,
              width: INNER_W,
              top: 7,
              height: 4,
              borderRadius: 999,
              background: "var(--dsh-mem-track)",
              pointerEvents: "none",
              zIndex: 1,
            },
          }),
          stops,
          react.createElement("div", {
            style: {
              position: "absolute",
              left: thumbLeft,
              top: 1,
              width: THUMB,
              height: THUMB,
              borderRadius: "50%",
              // 档位色描边 + 主题化圆头底（暗色非纯白）+ 上缘高光：与浮层玻璃材质同语言
              background: "var(--dsh-mem-thumb)",
              border: "1px solid " + info.color,
              boxShadow: "0 1px 4px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.55)",
              pointerEvents: "none",
              transition: drag === null ? "left 120ms ease" : "none",
              zIndex: 3,
            },
          }),
          ),
          props.error
            ? react.createElement("div", { style: { fontSize: 11, color: "var(--dsh-mem-danger)", marginTop: 20, whiteSpace: "nowrap" } }, props.error)
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
        // ── 令牌（浅色） ──
        ":root {",
        "  --dsh-mem-accent: #4d6bfe;",
        "  --dsh-mem-accent-text: #3d5be0;",
        "  --dsh-mem-accent-fill: #3d5be0;",
        "  --dsh-mem-accent-weak: rgba(77,107,254,0.10);",
        "  --dsh-mem-bg-card: var(--dsw-alias-bg-layer-2, #ffffff);",
        "  --dsh-mem-bg-inset: var(--dsw-alias-bg-secondary, #f6f7fb);",
        "  --dsh-mem-bg-hover: rgba(77,107,254,0.07);",
        "  --dsh-mem-border: var(--dsw-alias-border-secondary, #e3e6ee);",
        "  --dsh-mem-border-strong: #c9cede;",
        "  --dsh-mem-text-1: var(--dsw-alias-label-primary, #1f2328);",
        "  --dsh-mem-text-2: var(--dsw-alias-label-secondary, #59626e);",
        "  --dsh-mem-text-3: var(--dsw-alias-label-tertiary, #6e7781);",
        "  --dsh-mem-danger: #d0403f;",
        "  --dsh-mem-mode-off: #6e7781;",
        "  --dsh-mem-mode-chat: #1a7f37;",
        "  --dsh-mem-mode-work: #9a6700;",
        "  --dsh-mem-mode-auto: #3d5be0;",
        "  --dsh-mem-thumb: #ffffff;",
        "  --dsh-mem-track: rgba(128,140,150,0.32);",
        "  --dsh-mem-dot: rgba(128,140,150,0.55);",
        "  --dsh-mem-shadow-card: 0 1px 2px rgba(20,24,40,0.05);",
        "}",
        // ── 令牌（暗色：body[data-ds-dark-theme] 是 dsh 前端的暗色开关） ──
        "body[data-ds-dark-theme] {",
        "  --dsh-mem-accent: #6e85ff;",
        "  --dsh-mem-accent-text: #7b90ff;",
        "  --dsh-mem-accent-fill: #465ce8;",
        "  --dsh-mem-accent-weak: rgba(110,133,255,0.14);",
        "  --dsh-mem-bg-card: var(--dsw-alias-bg-layer-2, #232734);",
        "  --dsh-mem-bg-inset: var(--dsw-alias-bg-secondary, #1a1e29);",
        "  --dsh-mem-bg-hover: rgba(110,133,255,0.10);",
        "  --dsh-mem-border: var(--dsw-alias-border-secondary, #333950);",
        "  --dsh-mem-border-strong: #454c68;",
        "  --dsh-mem-text-1: var(--dsw-alias-label-primary, #e6e9f2);",
        "  --dsh-mem-text-2: var(--dsw-alias-label-secondary, #a8b0c2);",
        "  --dsh-mem-text-3: var(--dsw-alias-label-tertiary, #8892a6);",
        "  --dsh-mem-danger: #f4707b;",
        "  --dsh-mem-mode-off: #98a2ad;",
        "  --dsh-mem-mode-chat: #3fb950;",
        "  --dsh-mem-mode-work: #d29922;",
        "  --dsh-mem-mode-auto: #7b90ff;",
        "  --dsh-mem-thumb: #e8ebf5;",
        "  --dsh-mem-track: rgba(148,160,180,0.30);",
        "  --dsh-mem-dot: rgba(148,160,180,0.5);",
        "  --dsh-mem-shadow-card: 0 1px 2px rgba(0,0,0,0.3);",
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
        // ── auto 档边缘流光（品牌蓝族）：border 区画旋转 conic 光带；内部必须是【不透明】
        // 底色盖住光带（半透明内层会让 conic 透进按钮内部，文字被光斑干扰——实测事故）。
        // 不透明底 = 主题底混 12% 品牌蓝（color-mix 出来 alpha=1），静态、随主题
        ".dsh-mem-flow {",
        "  border: 1px solid transparent;",
        "  background:",
        "    linear-gradient(",
        "      color-mix(in srgb, var(--dsh-mem-bg-card, #ffffff) 88%, #4d6bfe),",
        "      color-mix(in srgb, var(--dsh-mem-bg-card, #ffffff) 88%, #4d6bfe)",
        "    ) padding-box,",
        "    conic-gradient(from var(--dsh-mem-angle),",
        "      rgba(61,91,224,0.9), rgba(77,107,254,0.95), rgba(147,168,255,1),",
        "      rgba(110,133,255,0.9), rgba(61,91,224,0.9)) border-box;",
        "  animation: dshMemFlow 3s linear infinite;",
        "  color: var(--dsh-mem-accent-text);",
        "}",
        // 浮层玻璃材质（Apple 菜单配方）：材质层必须是【无 transform 的独立元素】——
        // Chromium 中 transform 元素上的 backdrop-filter 采样异常（玻璃失效，实测）。
        // 低不透明度基底让底下内容透出 + 顶部光泽渐变 + blur/saturate + 亮缘 + 分主题阴影
        ".dsh-mem-glass {",
        "  border-radius: 12px;",
        "  background:",
        "    linear-gradient(rgba(255,255,255,0.34), rgba(255,255,255,0.05)),",
        "    rgba(248,249,251,0.55);",
        "  -webkit-backdrop-filter: blur(32px) saturate(180%);",
        "  backdrop-filter: blur(32px) saturate(180%);",
        "  border: 1px solid rgba(255,255,255,0.55);",
        "  box-shadow:",
        "    0 12px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.07),",
        "    inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(0,0,0,0.03);",
        "}",
        "body[data-ds-dark-theme] .dsh-mem-glass {",
        "  background:",
        "    linear-gradient(rgba(255,255,255,0.09), rgba(255,255,255,0.015)),",
        "    rgba(30,32,40,0.55);",
        "  border-color: rgba(255,255,255,0.14);",
        "  box-shadow:",
        "    0 16px 48px rgba(0,0,0,0.55), 0 3px 12px rgba(0,0,0,0.35),",
        "    inset 0 1px 0 rgba(255,255,255,0.12);",
        "}",
        "@media (prefers-reduced-transparency: reduce) {",
        "  .dsh-mem-glass { background: var(--dsh-mem-bg-card, #ffffff); backdrop-filter: none; -webkit-backdrop-filter: none; }",
        "}",
        // ── 重建面板 ──
        ".dsh-mem-rb-card {",
        "  border: 1px solid var(--dsh-mem-border); border-radius: 10px; background: var(--dsh-mem-bg-card);",
        "  box-shadow: var(--dsh-mem-shadow-card); padding: 12px 14px; margin-bottom: 14px; font-size: 13px;",
        "}",
        ".dsh-mem-rb-btn {",
        "  padding: 5px 14px; font-size: 13px; border-radius: 8px; cursor: pointer;",
        "  border: 1px solid var(--dsh-mem-border); background: var(--dsh-mem-bg-card); color: var(--dsh-mem-text-1);",
        "}",
        ".dsh-mem-rb-btn:disabled { opacity: 0.45; cursor: not-allowed; }",
        ".dsh-mem-rb-danger { border-color: color-mix(in srgb, var(--dsh-mem-danger) 45%, transparent); color: var(--dsh-mem-danger); background: transparent; }",
        ".dsh-mem-rb-primary { background: #cf222e; border-color: #cf222e; color: #fff; }",
        "body[data-ds-dark-theme] .dsh-mem-rb-primary { background: #b62324; border-color: #b62324; }",
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
        "  .dsh-mem-root, .dsh-mem-root *, .dsh-mem-btn, .dsh-mem-input, .dsh-mem-select, .dsh-mem-rb-btn, .dsh-mem-rb-fill { transition: none; }",
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
      var isAuto = loaded && mode === "auto";

      ensureThemeStyle();

      // auto 档的边框/背景/文字色均由 .dsh-mem-flow 提供（双层背景画流光边 + 分主题文字），
      // inline 不能设置这些——inline 优先级会盖掉 class 里的流光
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
      };
      if (isAuto) {
        pillStyle.boxShadow = "0 0 12px rgba(77,107,254,0.30)";
      } else {
        // 档位色是 var() 引用，透明度混色用 color-mix（老式 hex+alpha 拼接对 var 无效）
        pillStyle.border = "1px solid " + (loaded ? "color-mix(in srgb, " + info.color + " 45%, transparent)" : "var(--dsh-mem-border)");
        pillStyle.background = loaded ? "color-mix(in srgb, " + info.color + " 10%, transparent)" : "var(--dsh-mem-bg-inset)";
        pillStyle.color = loaded ? info.color : "var(--dsh-mem-text-3)";
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
            className: isAuto ? "dsh-mem-flow" : null,
            style: pillStyle,
          },
          "记忆·",
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
            ? react.createElement("button", {
                type: "button",
                className: "dsh-mem-rb-btn",
                disabled: busy || rb.cancelRequested,
                onClick: cancel,
              }, rb.cancelRequested ? "取消中…" : "取消重建")
            : react.createElement("button", {
                type: "button",
                className: "dsh-mem-rb-btn dsh-mem-rb-danger",
                disabled: busy || empty,
                title: empty ? "L0 无消息，无可重建内容" : "重新蒸馏全部记忆",
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
              "div", {
                className: "dsh-mem-rb-overlay",
                onClick: function (e) {
                  if (e.target === e.currentTarget) setConfirmOpen(false);
                },
              },
              react.createElement(
                "div", { className: "dsh-mem-rb-modal" },
                react.createElement(
                  "div", { style: { fontSize: 15, fontWeight: 600, marginBottom: 10 } },
                  "确认重建全部记忆？",
                ),
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
                react.createElement(
                  "div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 } },
                  react.createElement(
                    "button", {
                      type: "button",
                      className: "dsh-mem-rb-btn",
                      onClick: function () { setConfirmOpen(false); },
                    },
                    "取消",
                  ),
                  react.createElement(
                    "button", {
                      type: "button",
                      className: "dsh-mem-rb-btn dsh-mem-rb-primary",
                      disabled: busy,
                      onClick: start,
                    },
                    busy ? "启动中…" : "开始重建",
                  ),
                ),
              ),
            )
          : null,
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
        var next = Object.assign({}, prev, {
          settings: Object.assign({}, prev.settings, (function () { var o = {}; o[key] = value; return o; })()),
        });
        setSettingsData(next);
        rpc("dsh-memory/settings-set", (function () { var o = {}; o[key] = value; return o; })())
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
                ceilingNote
                  ? react.createElement("p", { style: S.hint }, ceilingNote)
                  : null,
              )
            : null,
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
          react.createElement("input", {
            className: "dsh-mem-input",
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
          react.createElement("button", { className: "dsh-mem-btn", onClick: search }, "搜索"),
        ),
        react.createElement(
          "div", { style: Object.assign({}, S.flexRow, { marginBottom: 10 }) },
          react.createElement("span", { style: S.muted }, loading ? "加载中…" : countText),
          react.createElement("div", { style: S.grow }),
          react.createElement("button", {
            className: "dsh-mem-btn",
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
              react.createElement("button", {
                className: "dsh-mem-btn",
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
          react.createElement("button", { className: "dsh-mem-btn", onClick: load }, "刷新"),
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
          react.createElement("button", { className: "dsh-mem-btn", onClick: load }, "刷新"),
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
          react.createElement("button", { className: "dsh-mem-btn", onClick: load }, "刷新"),
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

    function MemoryPanel(props) {
      var rpc = props.rpc;
      var tabState = react.useState("overview");
      var tab = tabState[0];
      var setTab = tabState[1];

      ensureThemeStyle(); // 设置页挂载即注入主题令牌与组件样式

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
