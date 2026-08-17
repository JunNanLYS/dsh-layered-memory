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

    // ── 通用样式 ──
    var S = {
      section: { padding: "0 4px" },
      heading: { fontSize: 15, fontWeight: 600, margin: "0 0 4px" },
      intro: { fontSize: 13, color: "var(--dsw-alias-label-tertiary, #888)", margin: "0 0 12px" },
      badge: {
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        marginLeft: 8,
        verticalAlign: "middle",
      },
      badgeOk: { background: "var(--dsw-alias-interactive-bg-primary, #1a7f37)", color: "#fff" },
      badgeErr: { background: "var(--dsw-alias-state-error-primary, #cf222e)", color: "#fff" },
      tabbar: { display: "flex", gap: 4, borderBottom: "1px solid var(--dsw-alias-border-secondary, #e0e0e0)", marginBottom: 12 },
      tab: {
        padding: "6px 14px",
        fontSize: 13,
        border: "none",
        background: "none",
        cursor: "pointer",
        color: "var(--dsw-alias-label-secondary, #666)",
        borderBottom: "2px solid transparent",
        marginBottom: -1,
      },
      tabActive: {
        fontWeight: 600,
        color: "var(--dsw-alias-label-primary, #111)",
        borderBottom: "2px solid var(--dsw-alias-interactive-bg-primary, #1a7f37)",
      },
      table: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
      },
      td: { padding: "6px 10px", borderBottom: "1px solid var(--dsw-alias-border-secondary, #eee)" },
      tdKey: { width: 180, color: "var(--dsw-alias-label-tertiary, #888)", whiteSpace: "nowrap" },
      error: {
        marginTop: 10,
        fontSize: 13,
        color: "var(--dsh-alias-state-error-primary, #cf222e)",
        whiteSpace: "pre-wrap",
      },
      hint: { marginTop: 12, fontSize: 12, color: "var(--dsw-alias-label-tertiary, #999)" },
      toolbar: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" },
      input: {
        flex: 1,
        minWidth: 160,
        padding: "5px 10px",
        fontSize: 13,
        borderRadius: 6,
        border: "1px solid var(--dsw-alias-border-secondary, #ccc)",
        background: "var(--dsw-alias-bg-primary, #fff)",
        color: "var(--dsw-alias-label-primary, #111)",
      },
      select: { padding: "5px 6px", fontSize: 13, borderRadius: 6, border: "1px solid var(--dsw-alias-border-secondary, #ccc)" },
      button: {
        padding: "5px 14px",
        fontSize: 13,
        borderRadius: 6,
        border: "1px solid var(--dsw-alias-border-secondary, #ccc)",
        background: "var(--dsw-alias-bg-primary, #fff)",
        cursor: "pointer",
      },
      card: {
        border: "1px solid var(--dsw-alias-border-secondary, #e5e5e5)",
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
        fontSize: 13,
      },
      cardHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
      tag: {
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 600,
        color: "#fff",
        whiteSpace: "nowrap",
      },
      muted: { color: "var(--dsw-alias-label-tertiary, #999)", fontSize: 12 },
      content: { lineHeight: 1.5, wordBreak: "break-word" },
      detail: {
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px dashed var(--dsw-alias-border-secondary, #ddd)",
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        color: "var(--dsw-alias-label-secondary, #666)",
        whiteSpace: "pre-wrap",
      },
      pre: {
        margin: 0,
        padding: "10px 12px",
        background: "var(--dsw-alias-bg-secondary, #f6f8fa)",
        borderRadius: 8,
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        lineHeight: 1.6,
        maxHeight: 480,
        overflow: "auto",
      },
      switchRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0" },
      switchLabel: { fontSize: 13, fontWeight: 600, minWidth: 72 },
      switchDesc: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #999)" },
      switch: {
        width: 36,
        height: 20,
        borderRadius: 10,
        position: "relative",
        cursor: "pointer",
        transition: "background .15s",
        flexShrink: 0,
      },
      switchOn: { background: "var(--dsw-alias-interactive-bg-primary, #1a7f37)" },
      switchOff: { background: "var(--dsw-alias-border-secondary, #ccc)" },
      switchDisabled: { opacity: 0.4, cursor: "not-allowed" },
      knob: {
        position: "absolute",
        top: 2,
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "#fff",
        transition: "left .15s",
        boxShadow: "0 1px 2px rgba(0,0,0,.2)",
      },
      switchPanel: {
        border: "1px solid var(--dsw-alias-border-secondary, #e5e5e5)",
        borderRadius: 8,
        padding: "4px 12px",
        marginBottom: 14,
      },
      seg: {
        display: "inline-flex",
        border: "1px solid var(--dsw-alias-border-secondary, #e5e5e5)",
        borderRadius: 8,
        overflow: "hidden",
        flexShrink: 0,
      },
      segBtn: {
        padding: "4px 12px",
        fontSize: 12,
        lineHeight: "16px",
        cursor: "pointer",
        background: "transparent",
        color: "inherit",
        border: "none",
        borderRight: "1px solid var(--dsw-alias-border-secondary, #e5e5e5)",
      },
      segBtnOn: {
        background: "var(--dsw-alias-interactive-bg-primary, #1a7f37)",
        color: "#fff",
        fontWeight: 600,
      },
      segBtnOff: {
        background: "var(--dsw-alias-bg-secondary, #f6f8fa)",
      },
      flexRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
      grow: { flex: 1 },
      sceneHead: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" },
      sceneTitle: { fontSize: 13, fontWeight: 600, fontFamily: "ui-monospace, Consolas, monospace" },
    };

    var TYPE_COLORS = {
      persona: "#8250df",
      episodic: "#0969da",
      instruction: "#bf8700",
      work_fact: "#0969da",
      work_task: "#1a7f37",
      work_method: "#8250df",
      work_artifact: "#bf8700",
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
      if (!iso) return "—";
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
                on ? S.segBtnOn : S.segBtnOff,
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
    var MODES = [
      { key: "off", label: "关闭", color: "#6e7781" },
      { key: "chat", label: "chat", color: "#1a7f37" },
      { key: "work", label: "work", color: "#bf8700" },
      { key: "auto", label: "自动", color: "#0969da" },
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
      ensureFlowStyle(); // 玻璃材质 class 与流光共用同一张注入样式表
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
                  background: active ? MODES[i].color : "rgba(128,140,150,0.55)",
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
                  // 未激活标签走主题 caption 令牌（浅色 #400 灰蓝 / 暗色 #600），玻璃面上保持可读
                  color: active ? MODES[i].color : "var(--dsw-alias-label-caption, #888)",
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
              background: "rgba(128,140,150,0.32)",
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
              // 微透白 + 上缘高光：与浮层玻璃材质同语言
              background: "rgba(255,255,255,0.94)",
              border: "1px solid " + info.color,
              boxShadow: "0 1px 4px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.9)",
              pointerEvents: "none",
              transition: drag === null ? "left 120ms ease" : "none",
              zIndex: 3,
            },
          }),
          ),
          props.error
            ? react.createElement("div", { style: { fontSize: 11, color: "#cf222e", marginTop: 20, whiteSpace: "nowrap" } }, props.error)
            : null,
        ),
      );
    }

    // ── auto 档边缘流光 + 浮层玻璃材质 + 重建面板样式：inline style 放不了
    // @keyframes/@property/媒体查询，惰性注入一次性样式表（id 防重复）。
    // dsw 主题变量参考其前端令牌：暗色走 body[data-ds-dark-theme]。 ──
    var FLOW_STYLE_ID = "dsh-mem-flow-style";
    function ensureFlowStyle() {
      if (document.getElementById(FLOW_STYLE_ID)) return;
      var el = document.createElement("style");
      el.id = FLOW_STYLE_ID;
      el.textContent = [
        // conic 角度动画需要 @property 注册才能插值；不支持的浏览器优雅降级为静态渐变边框
        "@property --dsh-mem-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }",
        "@keyframes dshMemFlow { to { --dsh-mem-angle: 360deg; } }",
        // 边缘流光（双层背景）：border 区画旋转 conic 冷蓝光带；内部必须是【不透明】底色盖住
        // 光带（半透明内层会让 conic 透进按钮内部，文字被光斑干扰——实测事故）。
        // 不透明底 = 主题底混 12% 冷蓝（color-mix 出来 alpha=1），静态、随主题
        ".dsh-mem-flow {",
        "  border: 1px solid transparent;",
        "  background:",
        "    linear-gradient(",
        "      color-mix(in srgb, var(--dsw-alias-bg-layer-2, #ffffff) 88%, #3b82f6),",
        "      color-mix(in srgb, var(--dsw-alias-bg-layer-2, #ffffff) 88%, #3b82f6)",
        "    ) padding-box,",
        "    conic-gradient(from var(--dsh-mem-angle),",
        "      rgba(8,145,178,0.9), rgba(59,130,246,0.9), rgba(125,211,252,1),",
        "      rgba(99,102,241,0.9), rgba(8,145,178,0.9)) border-box;",
        "  animation: dshMemFlow 3s linear infinite;",
        "  color: #0284c7;",
        "}",
        "body[data-ds-dark-theme] .dsh-mem-flow { color: #7dd3fc; }",
        "@media (prefers-reduced-motion: reduce) { .dsh-mem-flow { animation: none; } }",
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
        "  .dsh-mem-glass { background: var(--dsw-alias-bg-layer-2, #ffffff); backdrop-filter: none; -webkit-backdrop-filter: none; }",
        "}",
        // ── 重建面板（Light/Dark 双主题：基底用 dsw 真实令牌 bg-layer-2/border-l2，
        //    暗色由 body[data-ds-dark-theme] 切换；强调红/进度蓝紫双主题各调一档） ──
        ".dsh-mem-rb-card {",
        "  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);",
        "  border-radius: 10px;",
        "  background: var(--dsw-alias-bg-layer-2, #ffffff);",
        "  padding: 12px 14px;",
        "  margin-bottom: 14px;",
        "  font-size: 13px;",
        "}",
        ".dsh-mem-rb-btn {",
        "  padding: 5px 14px; font-size: 13px; border-radius: 6px; cursor: pointer;",
        "  border: 1px solid var(--dsw-alias-border-l2, #d0d7de);",
        "  background: var(--dsw-alias-bg-layer-2, #ffffff);",
        "  color: inherit;",
        "}",
        ".dsh-mem-rb-btn:disabled { opacity: 0.45; cursor: not-allowed; }",
        ".dsh-mem-rb-danger { border-color: rgba(207,34,46,0.45); color: #cf222e; background: transparent; }",
        "body[data-ds-dark-theme] .dsh-mem-rb-danger { color: #f4707b; border-color: rgba(244,112,123,0.5); }",
        ".dsh-mem-rb-primary { background: #cf222e; border-color: #cf222e; color: #fff; }",
        "body[data-ds-dark-theme] .dsh-mem-rb-primary { background: #b62324; border-color: #b62324; }",
        ".dsh-mem-rb-bar { height: 8px; border-radius: 4px; overflow: hidden; flex: 1;",
        "  background: var(--dsw-alias-border-l2, #e8ebef); }",
        "body[data-ds-dark-theme] .dsh-mem-rb-bar { background: rgba(255,255,255,0.12); }",
        ".dsh-mem-rb-fill { height: 100%; border-radius: 4px;",
        "  background: linear-gradient(90deg, #0969da, #8250df); transition: width .4s ease; }",
        ".dsh-mem-rb-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35);",
        "  display: flex; align-items: center; justify-content: center; z-index: 2000; }",
        ".dsh-mem-rb-modal { width: 440px; max-width: calc(100vw - 48px); border-radius: 12px;",
        "  padding: 18px 20px; font-size: 13px; line-height: 1.6;",
        "  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);",
        "  background: var(--dsw-alias-bg-layer-2, #ffffff);",
        "  box-shadow: 0 16px 48px rgba(0,0,0,0.24); }",
        "body[data-ds-dark-theme] .dsh-mem-rb-modal { box-shadow: 0 16px 48px rgba(0,0,0,0.6); }",
        ".dsh-mem-rb-muted { font-size: 12px; color: var(--dsw-alias-label-caption, #6e7781); }",
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

      var load = react.useCallback(function () {
        if (!sessionId || !rpc) return;
        setError(null);
        rpc("dsh-memory/session-mode-get", { sessionId: sessionId })
          .then(function (r) {
            if (r && r.ok && r.value) setMode(r.value.mode);
            else setError(r && r.error ? r.error.message : "RPC error");
          })
          .catch(function (e) { setError(String((e && e.message) || e)); });
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

      if (isAuto) ensureFlowStyle();

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
        pillStyle.boxShadow = "0 0 12px rgba(56,189,248,0.30)";
      } else {
        pillStyle.border = "1px solid " + (loaded ? info.color + "66" : "var(--dsw-alias-border-secondary, #ccc)");
        pillStyle.background = loaded ? info.color + "14" : "var(--dsw-alias-bg-secondary, #f6f8fa)";
        pillStyle.color = loaded ? info.color : "var(--dsh-alias-label-tertiary, #888)";
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
      ensureFlowStyle();

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
        lastNote = "上次重建：失败 — " + (rb.error || "未知错误");
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
          ? react.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "#cf222e" } }, rbError)
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

      var rows = [];
      if (stats) {
        var th = stats.thresholds || {};
        rows.push(["数据目录", stats.dataDir]);
        rows.push(["插件版本", "v" + stats.version]);
        rows.push(["默认档", modeLabel(stats.family)]);
        rows.push(["L0 今日消息", String(stats.l0Today)]);
        rows.push(["L1 原子记忆", stats.l1Count + " 条（累计抽取 " + stats.l1TotalExtracted + "）"]);
        rows.push(["L2 场景块", String(stats.sceneCount)]);
        rows.push(["L3 画像", stats.personaChars > 0 ? stats.personaChars + " 字符" : "未生成"]);
        rows.push(["上次 L1 抽取", fmtTime(stats.lastExtractAt)]);
        rows.push(["上次 L2 整合", fmtTime(stats.lastL2At)]);
        rows.push(["上次 L3 蒸馏", fmtTime(stats.lastL3At)]);
        rows.push(["待 L2 新记忆", stats.memoriesSinceL2 + " / " + (th.l2MinNewMemories != null ? th.l2MinNewMemories : 5)]);
        rows.push(["待 L3 新记忆", stats.memoriesSinceL3 + " / " + (th.l3Interval != null ? th.l3Interval : 20)]);
        rows.push(["待重试消息", String(stats.pendingExtract)]);
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
              "⚠ " + stats.message + "——上方数据为最后一次成功读取的值，记忆功能当前未工作。",
            )
          : null,
        error
          ? react.createElement("div", { style: S.error }, "获取状态失败：" + error)
          : !stats
            ? react.createElement("p", { style: S.intro }, "正在读取记忆状态…")
            : react.createElement(
                "table",
                { style: S.table },
                react.createElement(
                  "tbody", null,
                  rows.map(function (row) {
                    return react.createElement(
                      "tr", { key: row[0] },
                      react.createElement("td", { style: S.tdKey }, row[0]),
                      react.createElement("td", { style: S.td }, row[1]),
                    );
                  }),
                ),
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

      var fetchPage = react.useCallback(function (conds, offset, append) {
        setLoading(true);
        setError(null);
        var payload = { limit: limit, offset: offset };
        if (conds.query) payload.query = conds.query;
        if (conds.type) payload.type = conds.type;
        if (conds.scene) payload.scene = conds.scene;
        rpc("dsh-memory/list-records", payload)
          .then(function (r) {
            setLoading(false);
            if (!r || !r.ok) {
              setError(r && r.error ? r.error.message : "RPC error");
              return;
            }
            var v = r.value;
            setItems(function (prev) { return append ? prev.concat(v.items) : v.items; });
            setHasMore(!!v.hasMore);
            setTotal(v.total === undefined || v.total === null ? null : v.total);
            if (v.scenes) setSceneOptions(v.scenes);
          })
          .catch(function (e) {
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
            style: S.input,
            placeholder: "搜索记忆内容（BM25 关键词）…",
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            onKeyDown: function (e) { if (e.key === "Enter") search(); },
          }),
          react.createElement(
            "select",
            {
              style: S.select,
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
              style: S.select,
              value: sceneFilter,
              onChange: function (e) { setSceneFilter(e.target.value); },
            },
            react.createElement("option", { value: "" }, "全部情境"),
            sceneOptions.map(function (s) {
              return react.createElement("option", { key: s, value: s }, s.length > 24 ? s.slice(0, 24) + "…" : s);
            }),
          ),
          react.createElement("button", { style: S.button, onClick: search }, "搜索"),
        ),
        react.createElement(
          "div", { style: Object.assign({}, S.flexRow, { marginBottom: 10 }) },
          react.createElement("span", { style: S.muted }, loading ? "加载中…" : countText),
          react.createElement("div", { style: S.grow }),
          react.createElement("button", {
            style: S.button,
            onClick: function () { fetchPage(last, 0, false); },
          }, "刷新"),
        ),
        error ? react.createElement("div", { style: S.error }, error) : null,
        items.length === 0 && !loading && !error
          ? react.createElement("p", { style: S.intro }, "暂无记忆。对话几轮后，蒸馏管线会自动抽取记忆。")
          : items.map(function (m) {
              var open = expandedId === m.id;
              return react.createElement(
                "div",
                {
                  key: m.id,
                  style: S.card,
                  onClick: function () { setExpandedId(open ? null : m.id); },
                },
                react.createElement(
                  "div", { style: S.cardHead },
                  react.createElement(
                    "span",
                    {
                      style: Object.assign({}, S.tag, {
                        background: TYPE_COLORS[m.type] || "#666",
                      }),
                    },
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
                      "情境: " + (m.scene || "—") + "\n" +
                      "版本: v" + m.version + "（去重合并次数 " + m.version + "）\n" +
                      "创建: " + fmtTime(m.createdAt) + "\n" +
                      "活跃时间: " + (m.timestamps && m.timestamps.length > 0 ? m.timestamps.map(fmtTime).join(" → ") : "—") + "\n" +
                      (m.sourceMessageIds && m.sourceMessageIds.length > 0
                        ? "来源消息: " + m.sourceMessageIds.join(", ")
                        : "来源消息: —"),
                    )
                  : null,
              );
            }),
        hasMore
          ? react.createElement(
              "div", { style: S.flexRow },
              react.createElement("div", { style: S.grow }),
              react.createElement("button", {
                style: S.button,
                onClick: function () { fetchPage(last, items.length, true); },
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
          react.createElement("button", { style: S.button, onClick: load }, "刷新"),
        ),
        error ? react.createElement("div", { style: S.error }, error) : null,
        items && items.length === 0
          ? react.createElement("p", { style: S.intro }, "暂无场景块。累计 5 条新记忆后 L2 会自动整合出第一个场景。")
          : null,
        (items || []).map(function (s) {
          return react.createElement(
            "div", { key: s.path, style: S.card },
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
          react.createElement("button", { style: S.button, onClick: load }, "刷新"),
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
          react.createElement("button", { style: S.button, onClick: load }, "刷新"),
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

      var body;
      if (tab === "overview") body = react.createElement(OverviewTab, { rpc: rpc });
      else if (tab === "records") body = react.createElement(RecordsTab, { rpc: rpc });
      else if (tab === "scenes") body = react.createElement(ScenesTab, { rpc: rpc });
      else if (tab === "persona") body = react.createElement(PersonaTab, { rpc: rpc });
      else body = react.createElement(LogTab, { rpc: rpc });

      return react.createElement(
        "div",
        { style: S.section },
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
                style: Object.assign({}, S.tab, tab === t[0] ? S.tabActive : null),
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
