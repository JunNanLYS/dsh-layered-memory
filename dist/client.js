window.__ModuleLoader__.load({
	id: "dsh-layered-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
		
		// client/src/entry.tsx
		var entry_exports = {};
		__export(entry_exports, {
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(entry_exports);
		
		// client/src/panel.tsx
		var import_react14 = require("react");
		
		// client/src/sidebar-icon.ts
		var BOOK_ICON_SVG = '<svg data-mem-icon="1" viewBox="0 0 16 16" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0"><path d="M8 3.4C6.6 2.5 4.6 2.4 2.9 3.1v9.3c1.7-.7 3.7-.6 5.1.3 1.4-.9 3.4-1 5.1-.3V3.1C11.4 2.4 9.4 2.5 8 3.4Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 3.4v9.3" stroke="currentColor" stroke-width="1.2"/></svg>';
		function patchSidebarIcon() {
		  try {
		    const buttons = document.querySelectorAll("button");
		    for (let i = 0; i < buttons.length; i++) {
		      const b = buttons[i];
		      const span = b.querySelector("span");
		      const svg = b.querySelector("svg");
		      if (span && svg && span.textContent && span.textContent.trim() === "记忆" && svg.getAttribute("data-mem-icon") !== "1") {
		        svg.outerHTML = BOOK_ICON_SVG;
		      }
		    }
		  } catch {
		  }
		}
		var sidebarIconTimer = null;
		function scheduleSidebarPatch() {
		  if (sidebarIconTimer !== null) return;
		  sidebarIconTimer = setTimeout(() => {
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
		  } catch {
		  }
		}
		
		// client/src/styles.ts
		var S = {
		  section: { padding: "0 4px" },
		  heading: { fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "var(--dsh-mem-text-1)" },
		  intro: { fontSize: 13, color: "var(--dsh-mem-text-3)", margin: "0 0 12px" },
		  tabbar: { display: "flex", gap: 2, borderBottom: "1px solid var(--dsh-mem-border)", marginBottom: 14 },
		  error: {
		    marginTop: 10,
		    fontSize: 13,
		    color: "var(--dsh-mem-danger)",
		    whiteSpace: "pre-wrap"
		  },
		  hint: { marginTop: 12, fontSize: 12, color: "var(--dsh-mem-text-3)" },
		  toolbar: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" },
		  card: {
		    padding: "10px 12px",
		    marginBottom: 8,
		    fontSize: 13
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
		    whiteSpace: "pre-wrap"
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
		    overflow: "auto"
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
		    flexShrink: 0
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
		    boxShadow: "0 1px 2px rgba(0,0,0,.25)"
		  },
		  switchPanel: {
		    border: "1px solid var(--dsh-mem-border)",
		    borderRadius: 10,
		    background: "var(--dsh-mem-bg-card)",
		    boxShadow: "var(--dsh-mem-shadow-card)",
		    padding: "4px 14px",
		    marginBottom: 14
		  },
		  panelLabel: {
		    fontSize: 12,
		    fontWeight: 600,
		    color: "var(--dsh-mem-text-3)",
		    margin: "12px 0 2px"
		  },
		  statGrid: {
		    display: "grid",
		    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
		    gap: 8,
		    marginBottom: 14
		  },
		  statTile: { padding: "10px 12px" },
		  statNum: { fontSize: 20, fontWeight: 650, lineHeight: "28px", color: "var(--dsh-mem-text-1)" },
		  statLabel: { fontSize: 12, color: "var(--dsh-mem-text-3)", marginTop: 2 },
		  infoRow: {
		    display: "flex",
		    alignItems: "baseline",
		    gap: 12,
		    padding: "5px 0",
		    borderBottom: "1px solid var(--dsh-mem-border)"
		  },
		  infoKey: { fontSize: 12.5, color: "var(--dsh-mem-text-3)", whiteSpace: "nowrap", minWidth: 96 },
		  infoVal: {
		    fontSize: 12.5,
		    color: "var(--dsh-mem-text-1)",
		    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
		    wordBreak: "break-all",
		    textAlign: "right",
		    flex: 1
		  },
		  seg: {
		    display: "inline-flex",
		    border: "1px solid var(--dsh-mem-border)",
		    borderRadius: 8,
		    overflow: "hidden",
		    flexShrink: 0,
		    background: "var(--dsh-mem-bg-inset)"
		  },
		  segBtn: {
		    padding: "4px 12px",
		    fontSize: 12,
		    lineHeight: "16px",
		    cursor: "pointer",
		    background: "transparent",
		    color: "var(--dsh-mem-text-2)",
		    border: "none",
		    borderRight: "1px solid var(--dsh-mem-border)"
		  },
		  segBtnOn: {
		    background: "var(--dsh-mem-accent-fill)",
		    color: "#fff",
		    fontWeight: 600
		  },
		  flexRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
		  grow: { flex: 1 },
		  sceneHead: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" },
		  sceneTitle: { fontSize: 13, fontWeight: 600, fontFamily: "ui-monospace, Consolas, monospace", color: "var(--dsh-mem-text-1)" }
		};
		
		// client/src/theme.ts
		var THEME_STYLE_ID = "dsh-mem-theme-style";
		function ensureThemeStyle() {
		  if (document.getElementById(THEME_STYLE_ID)) return;
		  const el = document.createElement("style");
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
		    // 图表系列（成本折线图）：8 档固定色，PALETTE 只引用 var()；1 档锚品牌蓝，8 档中性"其他"
		    "  --dsh-mem-chart-1: #4d6bfe;",
		    "  --dsh-mem-chart-2: #0e9c8f;",
		    "  --dsh-mem-chart-3: #1f9d55;",
		    "  --dsh-mem-chart-4: #a8821c;",
		    "  --dsh-mem-chart-5: #d97a0d;",
		    "  --dsh-mem-chart-6: #d64570;",
		    "  --dsh-mem-chart-7: #7c5cff;",
		    "  --dsh-mem-chart-8: #61666b;",
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
		    "  --dsh-mem-shadow-pop: var(--dsw-shadow-lv3, 0 0 1px 0 rgba(0,0,0,.2), 0 0 4px 0 rgba(0,0,0,.02), 0 12px 32px 0 rgba(0,0,0,0.08));",
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
		    "  --dsh-mem-chart-1: #6e85ff;",
		    "  --dsh-mem-chart-2: #35c4b5;",
		    "  --dsh-mem-chart-3: #52c98d;",
		    "  --dsh-mem-chart-4: #d9b23e;",
		    "  --dsh-mem-chart-5: #f59e5b;",
		    "  --dsh-mem-chart-6: #f47ba2;",
		    "  --dsh-mem-chart-7: #a78bfa;",
		    "  --dsh-mem-chart-8: #8892a6;",
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
		    ".dsh-mem-input {",
		    "  padding: 5px 10px; font-size: 13px; border-radius: 8px; color: var(--dsh-mem-text-1);",
		    "  border: 1px solid var(--dsh-mem-border); background: var(--dsh-mem-bg-card);",
		    "  transition: border-color .15s ease, box-shadow .15s ease;",
		    "}",
		    ".dsh-mem-input:focus {",
		    "  outline: none; border-color: var(--dsh-mem-accent);",
		    "  box-shadow: 0 0 0 3px var(--dsh-mem-accent-weak);",
		    "}",
		    // ── 下拉（NSel 触发钮）：观感同输入框（8px 圆角/同令牌边框底色），文字
		    //    ellipsis + CSS 描边 chevron（展开旋转 180°）；弹出面板见 .dsh-mem-pop ──
		    ".dsh-mem-select {",
		    "  display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;",
		    "  width: 100%; min-width: 0; padding: 5px 10px; font: inherit; font-size: 13px; line-height: 20px;",
		    "  text-align: left; border-radius: 8px; cursor: pointer; color: var(--dsh-mem-text-1);",
		    "  border: 1px solid var(--dsh-mem-border); background: var(--dsh-mem-bg-card);",
		    "  transition: border-color .15s ease, box-shadow .15s ease;",
		    "}",
		    ".dsh-mem-select:focus-visible {",
		    "  outline: none; border-color: var(--dsh-mem-accent);",
		    "  box-shadow: 0 0 0 3px var(--dsh-mem-accent-weak);",
		    "}",
		    ".dsh-mem-select:disabled { opacity: 0.45; cursor: not-allowed; }",
		    ".dsh-mem-select-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
		    // 下拉弹出面板：dsh MenuDropdown 同款——浮层 12 圆角 + menu 底 + lv3 投影，
		    // 选项行 10 圆角 + hover 底色 + 选中打勾（选项 active 由 data-active 标记）
		    ".dsh-mem-sel { position: relative; display: inline-flex; min-width: 0; vertical-align: top; }",
		    ".dsh-mem-sel-chev {",
		    "  width: 8px; height: 8px; flex: none; margin-right: 2px;",
		    "  border-right: 1.5px solid var(--dsh-mem-text-3); border-bottom: 1.5px solid var(--dsh-mem-text-3);",
		    "  transform: rotate(45deg); transition: transform .12s ease;",
		    "}",
		    ".dsh-mem-sel-chev-open { transform: rotate(225deg); }",
		    ".dsh-mem-pop {",
		    "  position: absolute; top: calc(100% + 6px); left: 0; z-index: 30;",
		    "  min-width: 100%; width: max-content; max-width: 340px; max-height: 264px;",
		    "  overflow-y: auto; overscroll-behavior: contain; padding: 4px;",
		    "  background: var(--dsh-mem-bg-pop); border: 1px solid var(--dsh-mem-border-pop);",
		    "  border-radius: 12px; box-shadow: var(--dsh-mem-shadow-pop);",
		    "}",
		    ".dsh-mem-pop-opt {",
		    "  display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;",
		    "  min-height: 32px; padding: 5px 10px; font: inherit; font-size: 13px; line-height: 20px;",
		    "  text-align: left; color: var(--dsh-mem-text-1); cursor: pointer;",
		    "  background: none; border: none; outline: none; border-radius: 10px;",
		    "}",
		    '.dsh-mem-pop-opt:hover, .dsh-mem-pop-opt[data-active="1"] { background: var(--dsh-mem-bg-hover); }',
		    ".dsh-mem-pop-opt-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
		    ".dsh-mem-pop-check { flex: none; font-size: 12px; color: var(--dsh-mem-text-1); }",
		    ".dsh-mem-pop-empty { padding: 10px; font-size: 13px; color: var(--dsh-mem-text-3); }",
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
		    // ── 场景卡折叠箭头：展开态旋转 90°（过渡只做反馈，进 reduced-motion 压制名单） ──
		    ".dsh-mem-scene-chev { display: inline-block; transition: transform .15s ease; color: var(--dsh-mem-text-3); }",
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
		    //（--dsh-mem-pill-tint 由 pill inline 给定；3% 保证档位色文字 AA，暗色智能档余量 4.63:1）
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
		    // ── 会话信息区（悬浮卡下半部）：分隔线 + 2×2 指标 + 状态行；纯静态 DOM，
		    // 不进粒子层 rAF 循环，轮询数据到达才触发本组件小树 re-render ──
		    ".dsh-mem-sinfo { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--dsh-mem-border); }",
		    ".dsh-mem-sinfo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }",
		    ".dsh-mem-sinfo-val { font-size: 13px; font-weight: 600; color: var(--dsh-mem-text-1); line-height: 18px; font-variant-numeric: tabular-nums; }",
		    ".dsh-mem-sinfo-label { font-size: 11px; color: var(--dsh-mem-text-3); line-height: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
		    ".dsh-mem-sinfo-warn { font-size: 11px; color: var(--dsh-mem-danger); line-height: 16px; margin-bottom: 6px; }",
		    ".dsh-mem-sinfo-note { font-size: 11px; color: var(--dsh-mem-text-3); line-height: 16px; margin-top: 8px; }",
		    ".dsh-mem-sinfo-sum { font-size: 11px; color: var(--dsh-mem-text-3); line-height: 16px; margin-top: 8px; }",
		    // reduced-motion 兜底放样式表末尾：同特异性下后置声明才能压过上面的组件类
		    "@media (prefers-reduced-motion: reduce) {",
		    "  .dsh-mem-root, .dsh-mem-root *, .dsh-mem-btn, .dsh-mem-input, .dsh-mem-select, .dsh-mem-rb-fill, .dsh-mem-scene-chev, .dsh-mem-sel-chev { transition: none; }",
		    "  .dsh-mem-flow { animation: none; }",
		    "}"
		  ].join("\n");
		  document.head.appendChild(el);
		}
		
		// client/src/tabs/CostTab.tsx
		var import_react2 = require("react");
		
		// client/src/ui/controls.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		function Switch(props) {
		  const on = !!props.checked;
		  const disabled = !!props.disabled;
		  const base = { ...S.switch, ...on ? S.switchOn : S.switchOff, ...disabled ? S.switchDisabled : null };
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    "div",
		    {
		      style: base,
		      onClick: () => {
		        if (!disabled && props.onChange) props.onChange(!on);
		      },
		      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...S.knob, left: on ? 18 : 2 } })
		    }
		  );
		}
		function SwitchRow(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.switchRow, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, { checked: props.checked, disabled: props.disabled, onChange: props.onChange }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.switchLabel, children: props.label }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.switchDesc, children: props.desc || "" })
		    ] })
		  ] });
		}
		function Segmented(props) {
		  const value = props.value;
		  const disabled = !!props.disabled;
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...S.seg, ...disabled ? S.switchDisabled : null }, children: props.options.map((opt, i) => {
		    const on = opt.key === value;
		    const optDisabled = disabled || !!opt.disabled;
		    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      "span",
		      {
		        title: opt.disabledTitle || "",
		        style: {
		          ...S.segBtn,
		          ...on ? S.segBtnOn : null,
		          ...i === props.options.length - 1 ? { borderRight: "none" } : null,
		          ...optDisabled ? { cursor: "not-allowed", opacity: 0.45 } : null
		        },
		        onClick: () => {
		          if (!optDisabled && !on && props.onChange) props.onChange(opt.key);
		        },
		        children: opt.label
		      },
		      opt.key
		    );
		  }) });
		}
		
		// client/src/ui/primitives.tsx
		var import_react = require("react");
		
		// client/src/env.ts
		function hostRequire(id) {
		  return require(id);
		}
		
		// client/src/ui/primitives.tsx
		var P = null;
		try {
		  P = hostRequire("@deepseek-ai/dsh-client-ui-primitives");
		} catch {
		  P = null;
		}
		function NButton(props) {
		  if (P && P.Button) return (0, import_react.createElement)(P.Button, { size: "sm", ...props });
		  const rest = { ...props };
		  delete rest.variant;
		  delete rest.icon;
		  rest.className = "dsh-mem-btn" + (rest.className ? " " + rest.className : "");
		  return (0, import_react.createElement)("button", rest);
		}
		function NInput(props) {
		  if (P && P.Input) {
		    const inner = { ...props };
		    const layoutStyle = inner.style;
		    delete inner.style;
		    return (0, import_react.createElement)("span", { style: layoutStyle }, (0, import_react.createElement)(P.Input, inner));
		  }
		  const rest = { ...props };
		  rest.className = "dsh-mem-input" + (rest.className ? " " + rest.className : "");
		  return (0, import_react.createElement)("input", rest);
		}
		function NModal(props) {
		  if (props.open === false) return null;
		  if (P && P.Modal) return (0, import_react.createElement)(P.Modal, { closeLabel: "关闭", ...props });
		  return (0, import_react.createElement)(
		    "div",
		    {
		      className: "dsh-mem-rb-overlay",
		      onClick: (e) => {
		        if (e.target === e.currentTarget && props.onClose) props.onClose();
		      }
		    },
		    (0, import_react.createElement)(
		      "div",
		      { className: "dsh-mem-rb-modal" },
		      props.title ? (0, import_react.createElement)("div", { style: { fontSize: 15, fontWeight: 600, marginBottom: 10 } }, props.title) : null,
		      props.children,
		      props.footer ? (0, import_react.createElement)(
		        "div",
		        { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 } },
		        props.footer
		      ) : null
		    )
		  );
		}
		
		// client/src/tabs/CostTab.tsx
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function renderCostChart(buckets, models, maxY, fmtDate, fmtInt, palette) {
		  const W = 600;
		  const H = 200;
		  const L = 46;
		  const R = 10;
		  const T = 10;
		  const B = 26;
		  const iw = W - L - R;
		  const ih = H - T - B;
		  const n = buckets.length;
		  const x = (i) => L + (n <= 1 ? iw / 2 : i / (n - 1) * iw);
		  const y = (v) => T + ih - v / maxY * ih;
		  const yTicks = [0, maxY / 2, maxY];
		  const xIdx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : [0];
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { viewBox: "0 0 " + W + " " + H, style: { width: "100%", height: "auto", display: "block" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("line", { x1: L, y1: y(0), x2: W - R, y2: y(0), stroke: "var(--dsh-mem-border)", strokeWidth: 1 }),
		    yTicks.map((v) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("text", { x: L - 6, y: y(v) + 4, textAnchor: "end", fontSize: 10, fill: "var(--dsh-mem-text-3)", children: fmtInt(v) }, "yt" + v);
		    }),
		    xIdx.map((i) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("text", { x: x(i), y: H - 8, textAnchor: "middle", fontSize: 10, fill: "var(--dsh-mem-text-3)", children: fmtDate(buckets[i] ? buckets[i].ts : 0) }, "xt" + i);
		    }),
		    models.map((m, mi) => {
		      const pts = buckets.map((b, i) => x(i) + "," + y(b.byModel[m] || 0)).join(" ");
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        "polyline",
		        {
		          points: pts,
		          fill: "none",
		          stroke: palette[mi % palette.length],
		          strokeWidth: 2,
		          strokeLinejoin: "round",
		          strokeLinecap: "round"
		        },
		        "pl" + m
		      );
		    })
		  ] });
		}
		var RANGE_LABELS = { day: "今日", week: "本周", month: "本月", all: "累计" };
		var LAYER_OPTS = [
		  { key: "", label: "全部" },
		  { key: "l1", label: "L1" },
		  { key: "l2", label: "L2" },
		  { key: "l3", label: "L3" }
		];
		var GRAN_OPTS = [
		  { key: "day", label: "日" },
		  { key: "week", label: "周" },
		  { key: "month", label: "月" }
		];
		var PALETTE = [
		  "var(--dsh-mem-chart-1)",
		  "var(--dsh-mem-chart-2)",
		  "var(--dsh-mem-chart-3)",
		  "var(--dsh-mem-chart-4)",
		  "var(--dsh-mem-chart-5)",
		  "var(--dsh-mem-chart-6)",
		  "var(--dsh-mem-chart-7)",
		  "var(--dsh-mem-chart-8)"
		];
		var RANGES = ["day", "week", "month", "all"];
		var thFirst = { fontSize: 12, fontWeight: 600, color: "var(--dsh-mem-text-3)", textAlign: "left", padding: "4px 10px", borderBottom: "1px solid var(--dsh-mem-border)" };
		var thStyle = { fontSize: 12, fontWeight: 600, color: "var(--dsh-mem-text-3)", textAlign: "right", padding: "4px 10px", borderBottom: "1px solid var(--dsh-mem-border)" };
		var tdFirst = { fontSize: 12.5, fontWeight: 600, color: "var(--dsh-mem-text-1)", textAlign: "left", padding: "4px 10px" };
		var tdStyle = { fontSize: 12.5, color: "var(--dsh-mem-text-1)", textAlign: "right", padding: "4px 10px", fontFamily: "ui-monospace, Consolas, monospace" };
		function CostTab(props) {
		  const rpc = props.rpc;
		  const [data, setData] = (0, import_react2.useState)(null);
		  const [error, setError] = (0, import_react2.useState)(null);
		  const [granularity, setGranularity] = (0, import_react2.useState)("day");
		  const [layer, setLayer] = (0, import_react2.useState)("");
		  const [rangeDays, setRangeDays] = (0, import_react2.useState)(0);
		  const [rangeOpen, setRangeOpen] = (0, import_react2.useState)(false);
		  const load = (0, import_react2.useCallback)(() => {
		    setError(null);
		    rpc("dsh-memory/token-cost", {
		      granularity,
		      rangeDays
		    }).then((r) => {
		      if (r && r.ok) setData(r.value);
		      else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		  }, [rpc, granularity, rangeDays]);
		  (0, import_react2.useEffect)(() => {
		    load();
		    const timer = setInterval(load, 5e3);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [load]);
		  const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		  const fmtModel = (p, m) => p ? p + "/" + m : m;
		  const fmtDate = (ts) => {
		    try {
		      const d = new Date(ts);
		      const g = data && data.trend ? data.trend.granularity : granularity;
		      if (g === "month") return d.getMonth() + 1 + "月";
		      return d.getMonth() + 1 + "/" + d.getDate();
		    } catch {
		      return "";
		    }
		  };
		  const windows = data && data.windows || [];
		  const byModel = data && data.byModel || [];
		  const byLayer = data && data.byLayer || [];
		  const trend = data && data.trend ? data.trend : null;
		  let buckets = [];
		  if (trend && trend.byLayer) {
		    if (layer === "l1" || layer === "l2" || layer === "l3") {
		      buckets = trend.byLayer[layer] || [];
		    } else {
		      const seqs = [trend.byLayer.l1 || [], trend.byLayer.l2 || [], trend.byLayer.l3 || []];
		      const n = seqs[0].length;
		      for (let i = 0; i < n; i++) {
		        const merged = { ts: 0, total: 0, byModel: {} };
		        for (let s = 0; s < seqs.length; s++) {
		          const seq = seqs[s];
		          if (seq && seq[i]) {
		            if (merged.ts === 0) merged.ts = seq[i].ts;
		            merged.total += seq[i].total;
		            Object.keys(seq[i].byModel).forEach((m) => {
		              merged.byModel[m] = (merged.byModel[m] || 0) + seq[i].byModel[m];
		            });
		          }
		        }
		        buckets.push(merged);
		      }
		    }
		  }
		  const models = [];
		  const seen = {};
		  buckets.forEach((b) => {
		    Object.keys(b.byModel).forEach((m) => {
		      if (!seen[m]) {
		        seen[m] = true;
		        models.push(m);
		      }
		    });
		  });
		  models.sort();
		  let maxY = 1;
		  buckets.forEach((b) => {
		    if (b.total > maxY) maxY = b.total;
		    models.forEach((m) => {
		      if ((b.byModel[m] || 0) > maxY) maxY = b.byModel[m];
		    });
		  });
		  const layerTable = byLayer.map((lc) => {
		    const win = {};
		    lc.windows.forEach((w) => {
		      win[w.range] = w;
		    });
		    return { layer: lc.layer, win };
		  });
		  const cell = (lc, r, pick) => {
		    const w = lc.win[r];
		    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { style: tdStyle, children: w ? fmtInt(pick(w)) : "0" }, r);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Segmented, { value: layer, options: LAYER_OPTS, onChange: setLayer }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Segmented, { value: granularity, options: GRAN_OPTS, onChange: setGranularity }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        NButton,
		        {
		          onClick: () => {
		            setRangeOpen(!rangeOpen);
		          },
		          children: rangeDays > 0 ? "近 " + rangeDays + " 天" : "近N天"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(NButton, { onClick: load, children: "刷新" })
		    ] }),
		    rangeOpen ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.muted, children: "展示近 N 天（正整数，清空=默认窗口；超出保留期后端自动回退）" }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        NInput,
		        {
		          value: rangeDays === 0 ? "" : String(rangeDays),
		          placeholder: "如 30",
		          style: { width: 90 },
		          onChange: (e) => {
		            const v = String(e.target.value || "").trim();
		            if (v === "") {
		              setRangeDays(0);
		              return;
		            }
		            const n = Number(v);
		            if (Number.isInteger(n) && n > 0 && n <= 3650) setRangeDays(n);
		          }
		        }
		      )
		    ] }) : null,
		    error ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.error, children: "成本读取失败：" + error }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "成本趋势（按模型）" }),
		    buckets.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
		      renderCostChart(buckets, models, maxY, fmtDate, fmtInt, PALETTE),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px 12px", margin: "6px 0 14px" }, children: models.map((m, mi) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		          "span",
		          {
		            style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--dsh-mem-text-2)" },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { width: 10, height: 10, borderRadius: 4, background: PALETTE[mi % PALETTE.length], display: "inline-block" } }),
		              m
		            ]
		          },
		          "lg" + m
		        );
		      }) })
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: S.muted, children: data ? "暂无成本数据（触发一次蒸馏后这里会出现趋势）。" : "加载中…" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "层级成本（输出 token）" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: thFirst, children: "层级" }),
		        RANGES.map((r) => {
		          return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: thStyle, children: RANGE_LABELS[r] }, r);
		        })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: layerTable.map((lc) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { style: tdFirst, children: lc.layer.toUpperCase() }),
		          RANGES.map((r) => cell(lc, r, (w) => w.outputTokens))
		        ] }, lc.layer);
		      }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "层级成本（单次 avg）" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: thFirst, children: "层级" }),
		        RANGES.map((r) => {
		          return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: thStyle, children: RANGE_LABELS[r] + "-avg" }, r);
		        })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: layerTable.map((lc) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { style: tdFirst, children: lc.layer.toUpperCase() }),
		          RANGES.map((r) => cell(lc, r, (w) => w.avgOutputTokens))
		        ] }, lc.layer);
		      }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "层级成本（单次 median）" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: thFirst, children: "层级" }),
		        RANGES.map((r) => {
		          return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: thStyle, children: RANGE_LABELS[r] + "-median" }, r);
		        })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: layerTable.map((lc) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { style: tdFirst, children: lc.layer.toUpperCase() }),
		          RANGES.map((r) => cell(lc, r, (w) => w.medianOutputTokens))
		        ] }, lc.layer);
		      }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "时间窗口总览" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.statGrid, children: windows.map((w) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-mem-card", style: S.statTile, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.statNum, children: fmtInt(w.outputTokens + w.reasoningTokens) }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.statLabel, children: RANGE_LABELS[w.range] + " · 总输出 token" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.muted, children: "文字 " + fmtInt(w.outputTokens) + " · 思考 " + fmtInt(w.reasoningTokens) + " · " + w.calls + " 次调用" })
		      ] }, w.range);
		    }) }),
		    byModel.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "按模型（累计）" }),
		      byModel.map((m) => {
		        const label = fmtModel(m.provider, m.model);
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.infoRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.infoKey, children: label }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.infoVal, children: m.calls + " 次 · 输出 " + fmtInt(m.outputTokens) + " · 思考 " + fmtInt(m.reasoningTokens) })
		        ] }, "m-" + label);
		      })
		    ] }) : null,
		    data ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: S.hint, children: "输入按字符、输出/思考按 token 计；趋势图 Y 轴为输出 token，上方可切换层级与颗粒度。" }) : null
		  ] });
		}
		
		// client/src/tabs/LogTab.tsx
		var import_react3 = require("react");
		var import_jsx_runtime3 = require("react/jsx-runtime");
		function LogTab(props) {
		  const rpc = props.rpc;
		  const [lines, setLines] = (0, import_react3.useState)(null);
		  const [error, setError] = (0, import_react3.useState)(null);
		  const preRef = (0, import_react3.useRef)(null);
		  const load = (0, import_react3.useCallback)(() => {
		    setError(null);
		    rpc("dsh-memory/log-tail", { lines: 200 }).then((r) => {
		      if (r && r.ok) setLines(r.value.lines);
		      else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		  }, [rpc]);
		  (0, import_react3.useEffect)(() => {
		    load();
		  }, [load]);
		  (0, import_react3.useEffect)(() => {
		    if (lines && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
		  }, [lines]);
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.muted, children: error ? "加载失败" : lines === null ? "加载中…" : "最近 " + lines.length + " 行（memory.log）" }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(NButton, { onClick: load, children: "刷新" })
		    ] }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.error, marginBottom: 10 }, children: "日志读取失败：" + error + "（点右上“刷新”重试）" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { style: S.pre, ref: preRef, children: (lines || []).join("\n") || "(暂无日志)" })
		  ] });
		}
		
		// client/src/tabs/OverviewTab.tsx
		var import_react10 = require("react");
		
		// client/src/format.ts
		var TYPE_LABELS = {
		  persona: "画像偏好",
		  episodic: "客观事件",
		  instruction: "全局指令",
		  work_fact: "工作事实",
		  work_task: "工作任务",
		  work_method: "工作方法",
		  work_artifact: "工作资产"
		};
		function fmtTime(iso) {
		  if (!iso) return "-";
		  try {
		    return new Date(iso).toLocaleString();
		  } catch {
		    return String(iso);
		  }
		}
		function fmtAgo(iso) {
		  if (!iso) return null;
		  try {
		    const t = new Date(iso).getTime();
		    if (!t) return null;
		    let s = Math.floor((Date.now() - t) / 1e3);
		    if (s < 0) s = 0;
		    if (s < 45) return "刚刚";
		    if (s < 3600) return Math.floor(s / 60) + " 分钟前";
		    if (s < 86400) return Math.floor(s / 3600) + " 小时前";
		    return Math.floor(s / 86400) + " 天前";
		  } catch {
		    return null;
		  }
		}
		function fmtMB(bytes) {
		  if (!bytes || bytes <= 0) return "0MB";
		  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + "KB";
		  return (bytes / (1024 * 1024)).toFixed(bytes < 100 * 1024 * 1024 ? 1 : 0) + "MB";
		}
		
		// client/src/pill/modes.ts
		var MODES = [
		  { key: "off", label: "关闭", color: "var(--dsh-mem-text-2)" },
		  { key: "chat", label: "日常", color: "var(--dsh-mem-mode-chat)" },
		  { key: "work", label: "工作", color: "var(--dsh-mem-mode-work)" },
		  { key: "auto", label: "智能", color: "var(--dsh-mem-mode-auto)" }
		];
		var TRACK_W = 200;
		var THUMB = 16;
		var RAIL_H = 22;
		var INNER_W = TRACK_W - THUMB;
		var FIELD_TIERS = [
		  { density: 0, alpha: 0, wave: 0, tempo: 1 },
		  { density: 0.34, alpha: 0.5, wave: 0, tempo: 1 },
		  // 日常：稀疏微光
		  { density: 0.55, alpha: 0.78, wave: 1, tempo: 1.15 },
		  // 工作：中强 + 水波纹
		  { density: 0.72, alpha: 1, wave: 1, tempo: 1.3 }
		  // 智能：满场最活跃
		];
		function smStep(a, b, x) {
		  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
		  return t * t * (3 - 2 * t);
		}
		function modeInfo(key) {
		  for (let i = 0; i < MODES.length; i++) if (MODES[i].key === key) return MODES[i];
		  return MODES[3];
		}
		function modeLabel(key) {
		  if (key === "auto") return "智能（双族）";
		  if (key === "chat") return "日常（个人）";
		  if (key === "work") return "工作（团队）";
		  return "关闭";
		}
		function modeIndex(key) {
		  for (let i = 0; i < MODES.length; i++) if (MODES[i].key === key) return i;
		  return 3;
		}
		
		// client/src/tabs/DistillSettings.tsx
		var import_react7 = require("react");
		
		// client/src/tabs/BudgetInputs.tsx
		var import_react4 = require("react");
		var import_jsx_runtime4 = require("react/jsx-runtime");
		var LAYERS = [
		  ["extract", "抽取"],
		  ["dedup", "去重"],
		  ["l2", "L2 场景"],
		  ["l3", "L3 画像"]
		];
		var SCOPE_KEYS = {
		  l1: ["extract", "dedup"],
		  l2: ["l2"],
		  l3: ["l3"]
		};
		function BudgetInputs(props) {
		  const rpc = props.rpc;
		  const disabled = !!props.disabled;
		  const data = props.data;
		  const setData = props.setData;
		  const onError = props.onError;
		  const scope = props.scope ?? "all";
		  const layers = scope === "all" || scope === "input" ? LAYERS : LAYERS.filter((l) => SCOPE_KEYS[scope].includes(l[0]));
		  const [draft, setDraft] = (0, import_react4.useState)(null);
		  if (!data || !data.budgets) return null;
		  const cur = data.budgets.current || {};
		  const def = data.budgets.defaults || {};
		  const eff = data.budgets.effective || {};
		  const ib = data.inputBudget || { current: 0, fallback: 0, effective: 0 };
		  const curIn = ib.current || 0;
		  const effIn = ib.effective || ib.fallback || 0;
		  const shown = (key) => {
		    if (draft && draft[key] !== void 0) return draft[key];
		    const c = key === "input" ? curIn : cur[key] || 0;
		    return c > 0 ? String(c) : "";
		  };
		  const commitPart = (keys, buildPayload, applyView) => {
		    if (!draft) return;
		    const values = {};
		    for (let i = 0; i < keys.length; i++) {
		      const key = keys[i];
		      const raw = (draft[key] !== void 0 ? draft[key] : shown(key)).trim();
		      const n = raw === "" ? 0 : Number(raw);
		      const max = key === "input" ? 1e6 : 1e6;
		      const min = key === "input" ? raw === "" ? 0 : 1e3 : 0;
		      if (!Number.isInteger(n) || n < min || n > max) {
		        onError(
		          key === "input" ? "输入预算须为 0 或 1000~1000000 的整数（留空或 0 = 跟随配置）" : "输出预算须为 0~1000000 的整数（留空或 0 = 跟随默认）"
		        );
		        setDraft(null);
		        return;
		      }
		      values[key] = n;
		    }
		    setDraft(null);
		    const prev = data;
		    setData(applyView(prev, values));
		    rpc("dsh-memory/settings-set", buildPayload(values)).then((r) => {
		      if (!r || !r.ok) {
		        setData(prev);
		        onError(r && r.error ? "预算写入失败：" + r.error.message : "预算写入失败");
		      } else {
		        onError(null);
		      }
		    }).catch((e) => {
		      setData(prev);
		      onError("预算写入失败：" + String(e && e.message || e));
		    });
		  };
		  const commitOutputs = () => {
		    commitPart(
		      ["extract", "dedup", "l2", "l3"],
		      (v) => ({ distillBudgets: v }),
		      (prev, v) => {
		        const effNext = {};
		        for (let j = 0; j < layers.length; j++) {
		          const k = layers[j][0];
		          effNext[k] = v[k] > 0 ? v[k] : def[k] || 0;
		        }
		        return {
		          ...prev,
		          settings: { ...prev.settings, distillBudgets: v },
		          budgets: {
		            ...prev.budgets,
		            current: v,
		            effective: effNext
		          }
		        };
		      }
		    );
		  };
		  const commitInput = () => {
		    commitPart(
		      ["input"],
		      (v) => ({ distillMaxInputChars: v.input }),
		      (prev, v) => {
		        return {
		          ...prev,
		          settings: { ...prev.settings, distillMaxInputChars: v.input },
		          inputBudget: {
		            ...prev.inputBudget || { current: 0, fallback: 0, effective: 0 },
		            current: v.input,
		            effective: v.input > 0 ? v.input : ib.fallback || 0
		          }
		        };
		      }
		    );
		  };
		  const dirty = (keys) => {
		    if (!draft) return false;
		    for (let i = 0; i < keys.length; i++) {
		      const key = keys[i];
		      const want = (draft[key] !== void 0 ? draft[key] : "").trim();
		      const was = key === "input" ? curIn > 0 ? String(curIn) : "" : (cur[key] || 0) > 0 ? String(cur[key]) : "";
		      if (want !== was) return true;
		    }
		    return false;
		  };
		  const inputBox = (key, _label, title, width, placeholder, onCommit) => {
		    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		      NInput,
		      {
		        type: "number",
		        min: 0,
		        max: 1e6,
		        style: { width },
		        title,
		        placeholder: String(placeholder || ""),
		        value: shown(key),
		        disabled,
		        onChange: (e) => {
		          const v = e.target.value;
		          const d = { ...draft || {} };
		          d[key] = v;
		          setDraft(d);
		        },
		        onBlur: () => {
		          if (dirty([key])) onCommit();
		        },
		        onKeyDown: (e) => {
		          if (e.key === "Enter" && dirty([key])) onCommit();
		        }
		      },
		      key
		    );
		  };
		  const showOutputs = scope !== "input";
		  const showInput = scope === "all" || scope === "input";
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		    showOutputs ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: S.switchRow, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { ...S.flexRow, gap: 6 }, children: layers.map((l) => {
		        return inputBox(
		          l[0],
		          l[1],
		          l[1] + " 输出预算（token，留空 = 默认 " + (def[l[0]] || "?") + "）",
		          92,
		          def[l[0]],
		          commitOutputs
		        );
		      }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: S.switchLabel, children: "输出预算" }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: S.switchDesc, children: scope === "all" ? "各蒸馏层单次输出的 token 上限（抽取/去重/L2/L3）；留空或 0 = 跟随默认（当前生效 " + layers.map((l) => eff[l[0]] || "?").join(" / ") + "）；思考档 high/xhigh/max 时实际限额自动 ×4" : "本层单次输出的 token 上限；留空或 0 = 跟随默认（当前生效 " + layers.map((l) => eff[l[0]] || "?").join(" / ") + "）；思考档 high/xhigh/max 时实际限额自动 ×4" })
		      ] })
		    ] }) : null,
		    showInput ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: S.switchRow, children: [
		      inputBox(
		        "input",
		        "输入",
		        "单次蒸馏输入字符上限（≈token，中文 1 字≈1 token；留空 = 跟随配置 " + (ib.fallback || "?") + "）",
		        120,
		        ib.fallback,
		        commitInput
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: S.switchLabel, children: "输入预算" }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: S.switchDesc, children: "单次蒸馏调用的输入字符上限（≈token）：L1 抽取按此分块、L2/L3 超限截断；留空或 0 = 跟随配置（当前生效 " + (effIn || "?") + "，来自 llm.maxInputChars）" })
		      ] })
		    ] }) : null
		  ] });
		}
		
		// client/src/tabs/RouteChainEditor.tsx
		var import_react6 = require("react");
		
		// client/src/ui/NSel.tsx
		var import_react5 = require("react");
		var import_jsx_runtime5 = require("react/jsx-runtime");
		function NSel(props) {
		  const options = props.options || [];
		  const value = props.value || "";
		  const disabled = !!props.disabled;
		  const [open, setOpen] = (0, import_react5.useState)(false);
		  const [idx, setIdx] = (0, import_react5.useState)(-1);
		  const wrapRef = (0, import_react5.useRef)(null);
		  const listRef = (0, import_react5.useRef)(null);
		  let selectedLabel = "";
		  for (let si = 0; si < options.length; si++) {
		    if (options[si].id === value) selectedLabel = options[si].label;
		  }
		  (0, import_react5.useEffect)(() => {
		    if (!open) return void 0;
		    const onDown = (e) => {
		      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
		    };
		    document.addEventListener("mousedown", onDown);
		    return () => {
		      document.removeEventListener("mousedown", onDown);
		    };
		  }, [open]);
		  (0, import_react5.useEffect)(() => {
		    if (!open || !listRef.current) return;
		    const el = listRef.current.querySelector('[data-active="1"]');
		    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
		  }, [open, idx]);
		  const indexOfValue = () => {
		    for (let i = 0; i < options.length; i++) if (options[i].id === value) return i;
		    return -1;
		  };
		  const closeMenu = (refocus) => {
		    setOpen(false);
		    setIdx(-1);
		    if (refocus && wrapRef.current) {
		      const btn = wrapRef.current.querySelector("button");
		      if (btn && btn.focus) btn.focus();
		    }
		  };
		  const pick = (id) => {
		    closeMenu(true);
		    if (id !== value && props.onChange) props.onChange(id);
		  };
		  const moveActive = (delta) => {
		    const n = options.length;
		    if (n === 0) return;
		    let cur = idx >= 0 ? idx : indexOfValue();
		    if (cur < 0) cur = delta > 0 ? -1 : 0;
		    setIdx(delta > 0 ? ((cur + 1) % n + n) % n : ((cur - 1) % n + n) % n);
		  };
		  const onKey = (e) => {
		    if (disabled) return;
		    if (e.key === "Escape") {
		      if (open) {
		        e.preventDefault();
		        closeMenu(true);
		      }
		      return;
		    }
		    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
		      e.preventDefault();
		      if (!open) {
		        setOpen(true);
		        setIdx(indexOfValue());
		      } else moveActive(e.key === "ArrowDown" ? 1 : -1);
		      return;
		    }
		    if (!open && (e.key === "Enter" || e.key === " ")) {
		      e.preventDefault();
		      setOpen(true);
		      setIdx(indexOfValue());
		      return;
		    }
		    if (open && e.key === "Enter") {
		      e.preventDefault();
		      let t = idx >= 0 ? idx : indexOfValue();
		      if (t < 0) t = 0;
		      if (options[t]) pick(options[t].id);
		    }
		  };
		  const onBlur = (e) => {
		    if (!open) return;
		    const to = e.relatedTarget;
		    if (!to || wrapRef.current && !wrapRef.current.contains(to)) setOpen(false);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-mem-sel", style: props.style, ref: wrapRef, onKeyDown: onKey, onBlur, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
		      "button",
		      {
		        type: "button",
		        className: "dsh-mem-select" + (open ? " dsh-mem-select-open" : ""),
		        disabled,
		        "aria-haspopup": "listbox",
		        "aria-expanded": open,
		        onClick: () => {
		          if (open) closeMenu(false);
		          else {
		            setOpen(true);
		            setIdx(-1);
		          }
		        },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-mem-select-label", children: selectedLabel || props.placeholder || "（请选择）" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-mem-sel-chev" + (open ? " dsh-mem-sel-chev-open" : ""), "aria-hidden": true })
		        ]
		      }
		    ),
		    open && !disabled ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-pop", ref: listRef, role: "listbox", children: options.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-pop-empty", children: "无选项" }) : options.map((o, i) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
		        "button",
		        {
		          type: "button",
		          className: "dsh-mem-pop-opt" + (o.id === value ? " dsh-mem-pop-opt-on" : ""),
		          role: "option",
		          "aria-selected": o.id === value,
		          "data-active": i === idx ? "1" : "0",
		          onMouseDown: (e) => {
		            if (e.preventDefault) e.preventDefault();
		          },
		          onClick: () => {
		            pick(o.id);
		          },
		          onMouseEnter: () => {
		            if (idx !== i) setIdx(i);
		          },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-mem-pop-opt-label", children: o.label }),
		            o.id === value ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-mem-pop-check", children: "✓" }) : null
		          ]
		        },
		        o.id
		      );
		    }) }) : null
		  ] });
		}
		
		// client/src/tabs/RouteChainEditor.tsx
		var import_jsx_runtime6 = require("react/jsx-runtime");
		var modelsCache = {};
		var EFFORT_VOCAB = ["", "off", "none", "minimal", "low", "medium", "high", "xhigh", "max"];
		var STY = {
		  wrap: { padding: "8px 0" },
		  row: { background: "var(--dsh-mem-bg-inset)", borderRadius: 8, padding: 8, marginBottom: 8, border: "1px solid transparent" },
		  rowErr: { border: "1px solid var(--dsh-mem-danger)" },
		  badge: { flexShrink: 0, width: 20, height: 18, borderRadius: 999, background: "var(--dsh-mem-accent-weak)", color: "var(--dsh-mem-accent-text)", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" },
		  // 控件行：供应商/模型/档位；flexWrap 兜底窄面板（放不下时档位自然折行）
		  line: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
		  // 操作按钮行：右下角对齐
		  actions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 6 },
		  ico: { padding: 0, width: 26, height: 26, minWidth: 26, fontSize: 13, lineHeight: "20px" },
		  add: { width: "100%", padding: "7px 0", fontSize: 12.5, color: "var(--dsh-mem-text-3)", background: "transparent", border: "1px dashed var(--dsh-mem-border-strong)", borderRadius: 8 },
		  ghost: { border: "none", background: "transparent", color: "var(--dsh-mem-text-3)" },
		  note: { fontSize: 11, color: "var(--dsh-mem-text-3)", marginTop: 6 },
		  warn: { fontSize: 11, color: "var(--dsh-mem-danger)", marginTop: 6 },
		  mono: { fontSize: 12.5, color: "var(--dsh-mem-text-1)", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
		  roRow: { display: "flex", alignItems: "center", gap: 8, background: "var(--dsh-mem-bg-inset)", borderRadius: 8, padding: "7px 10px", marginBottom: 6 }
		};
		var EMPTY_ROW = { provider: "", model: "", reasoningEffort: "" };
		function copyRow(e) {
		  return { provider: e.provider || "", model: e.model || "", reasoningEffort: e.reasoningEffort || "" };
		}
		function RouteChainEditor(props) {
		  const rpc = props.rpc;
		  const disabled = !!props.disabled;
		  const scope = props.scope ?? "global";
		  const isLayer = scope !== "global";
		  const [info, setInfo] = (0, import_react6.useState)(null);
		  const [rows, setRows] = (0, import_react6.useState)(null);
		  const [rowErrs, setRowErrs] = (0, import_react6.useState)({});
		  const [err, setErr] = (0, import_react6.useState)(null);
		  const [manual, setManual] = (0, import_react6.useState)({ idx: -1, text: "" });
		  const pendingWrites = (0, import_react6.useRef)(0);
		  function refreshInfo() {
		    rpc("dsh-memory/llm-providers", {}).then((r) => {
		      if (r && r.ok && pendingWrites.current === 0) setInfo(r.value);
		    }).catch(() => {
		    });
		  }
		  (0, import_react6.useEffect)(() => {
		    refreshInfo();
		    const timer = setInterval(refreshInfo, 5e3);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [rpc]);
		  (0, import_react6.useEffect)(() => {
		    if (!info || !info.providers) return;
		    info.providers.forEach((p) => {
		      if (!p.id || modelsCache[p.id]) return;
		      rpc("dsh-memory/llm-models", { provider: p.id }).then((r) => {
		        if (r && r.ok && r.value) modelsCache[p.id] = r.value.models || [];
		      }).catch(() => {
		      });
		    });
		  }, [rpc, info]);
		  const layerView = isLayer && info && info.layerChains ? info.layerChains[scope] : null;
		  const savedRows = isLayer ? layerView?.runtime ?? [] : info && info.chain ? info.chain.current : [];
		  (0, import_react6.useEffect)(() => {
		    if (rows === null && info && savedRows.length) {
		      setRows(savedRows.map(copyRow));
		    }
		  }, [info, rows, savedRows]);
		  function updateRow(i, patch) {
		    setRows(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
		    setRowErrs({});
		  }
		  function moveRow(i, dir) {
		    let next = rows.map(copyRow);
		    if (dir < 0 && i === 1) {
		      if (!next[0].provider) next = next.slice(1);
		      else {
		        const t = next[0];
		        next[0] = next[1];
		        next[1] = t;
		      }
		    } else if (dir < 0 && i > 1) {
		      const t2 = next[i - 1];
		      next[i - 1] = next[i];
		      next[i] = t2;
		    } else if (dir > 0 && i < next.length - 1 && !(i === 0 && !next[0].provider)) {
		      const t3 = next[i + 1];
		      next[i + 1] = next[i];
		      next[i] = t3;
		    }
		    setRows(next);
		    setRowErrs({});
		  }
		  function removeRow(i) {
		    if (i === 0) {
		      if (isLayer) setRows(rows.length > 1 ? rows.slice(1) : rows);
		      else setRows([EMPTY_ROW].concat(rows.slice(1)));
		    } else {
		      setRows(rows.slice(0, i).concat(rows.slice(i + 1)));
		    }
		    setRowErrs({});
		  }
		  function addRow() {
		    let defProv = rows[0] && rows[0].provider || "";
		    if (!defProv && info.providers && info.providers[0]) defProv = info.providers[0].id;
		    setRows(rows.concat([{ provider: defProv, model: "", reasoningEffort: "" }]));
		    setRowErrs({});
		  }
		  function forkStatic() {
		    if (isLayer) {
		      const st2 = layerView && layerView.static || [];
		      if (st2.length) setRows(st2.slice(0, 8).map(copyRow));
		      else {
		        const first = info.providers && info.providers[0] || { id: "" };
		        setRows([{ provider: first.id, model: "", reasoningEffort: "" }]);
		      }
		      setRowErrs({});
		      return;
		    }
		    const st = info.chain && info.chain.static || [];
		    setRows([EMPTY_ROW].concat(st.slice(0, 7).map(copyRow)));
		    setRowErrs({});
		  }
		  function save() {
		    const errs = {};
		    const seen = {};
		    if (isLayer && (!rows[0].provider || !rows[0].model)) {
		      errs[0] = "主路由行必须显式选择供应商与模型（层链不支持跟随默认模型）";
		    } else if (rows[0].provider && !rows[0].model || !rows[0].provider && rows[0].model) {
		      errs[0] = "主路由行供应商与模型须成对（双空 = 跟随默认模型）";
		    }
		    if (rows[0].provider && rows[0].model) seen[rows[0].provider + "::" + rows[0].model] = 0;
		    for (let i = 1; i < rows.length; i++) {
		      if (!rows[i].provider || !rows[i].model) {
		        errs[i] = "回退路由必须显式选择供应商与模型";
		        continue;
		      }
		      const key = rows[i].provider + "::" + rows[i].model;
		      if (seen[key] !== void 0) {
		        errs[i] = seen[key] === 0 ? "与主路由完全相同（运行时会跳过，请去重）" : "与第 " + (seen[key] + 1) + " 行重复";
		      } else {
		        seen[key] = i;
		      }
		    }
		    setRowErrs(errs);
		    if (rows.length > 8) {
		      setErr("路由链最多 8 行（含主路由行），请删除多余行");
		      return;
		    }
		    if (Object.keys(errs).length) return;
		    pendingWrites.current += 1;
		    if (isLayer && info && info.layerChains) {
		      setInfo({
		        ...info,
		        layerChains: {
		          ...info.layerChains,
		          [scope]: { ...info.layerChains[scope], runtime: rows.map(copyRow), source: "runtime" }
		        }
		      });
		    } else {
		      setInfo({
		        ...info,
		        chain: { ...info.chain, current: rows.map(copyRow), source: "runtime" }
		      });
		    }
		    const payload = isLayer ? { distillLayerChains: { [scope]: rows } } : { distillChain: rows };
		    rpc("dsh-memory/settings-set", payload).then((r) => {
		      pendingWrites.current -= 1;
		      setErr(!r || r.ok ? null : "路由链保存失败：" + (r && r.error && r.error.message || "未知错误"));
		      refreshInfo();
		    }).catch((e) => {
		      pendingWrites.current -= 1;
		      setErr("路由链保存失败：" + String(e && e.message || e));
		      refreshInfo();
		    });
		  }
		  function clearToFollow() {
		    pendingWrites.current += 1;
		    if (isLayer) {
		      rpc("dsh-memory/settings-set", { distillLayerChains: { [scope]: [] } }).then((r) => {
		        pendingWrites.current -= 1;
		        setRows(null);
		        setRowErrs({});
		        setErr(!r || r.ok ? null : "清空失败，请重试");
		        refreshInfo();
		      }).catch((e) => {
		        pendingWrites.current -= 1;
		        setErr("清空失败：" + String(e && e.message || e));
		        refreshInfo();
		      });
		      return;
		    }
		    rpc("dsh-memory/settings-set", { distillChain: [], distillProvider: "", distillModel: "", reasoningEffort: "" }).then((r) => {
		      pendingWrites.current -= 1;
		      setRows(null);
		      setRowErrs({});
		      setErr(!r || r.ok ? null : "清空失败，请重试");
		      refreshInfo();
		    }).catch((e) => {
		      pendingWrites.current -= 1;
		      setErr("清空失败：" + String(e && e.message || e));
		      refreshInfo();
		    });
		  }
		  if (!info) return null;
		  const providers = info.providers || [];
		  const providersById = {};
		  providers.forEach((p) => {
		    providersById[p.id] = p;
		  });
		  function roRow(e, i) {
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.roRow, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: STY.badge, children: i === 0 ? "主" : String(i + 1) }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: STY.mono, children: e.provider + " / " + e.model }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { marginLeft: "auto", flexShrink: 0, fontSize: 11, color: "var(--dsh-mem-text-3)" }, children: e.effort ? "档位 " + e.effort : "跟随部署配置" })
		    ] }, "ro" + i);
		  }
		  if (info.pinned) {
		    const effPin = isLayer ? layerView?.effectiveChain ?? [] : info.chain && info.chain.effectiveChain || [];
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.wrap, children: [
		      effPin.map(roRow),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: STY.note, children: isLayer ? "部署已锁定路由（pin）：本层运行时编辑只读；静态层链（若有）照常生效。调整请修改 profile cordis.patch.yml 中 llm 的配置。" : "部署已锁定路由（pin 优先于运行时链）；调整请修改 profile cordis.patch.yml 中 llm 的配置。" })
		    ] });
		  }
		  if (rows === null) {
		    if (isLayer) {
		      const lv = layerView;
		      const src = lv?.source ?? "global";
		      if (src === "static" && lv) {
		        return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.wrap, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { ...STY.note, marginBottom: 6 }, children: "当前生效 = 部署 YAML 层链（只读，下方行不可直接编辑）" }),
		          lv.static.map((e, i) => roRow({ provider: e.provider, model: e.model, effort: e.reasoningEffort || "" }, i)),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NButton, { onClick: forkStatic, disabled, children: "自定义本层链" }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: STY.note, children: "部署 YAML 层链生效；「自定义本层链」保存后，运行时层链将覆盖静态层链。" })
		        ] });
		      }
		      const previewRows = lv?.effectiveChain ?? [];
		      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.wrap, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { ...STY.note, marginBottom: 6 }, children: "当前生效 = 全局默认链（只读预览，下方行不可直接编辑）" }),
		        previewRows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: S.switchDesc, children: "本层跟随全局链，暂无可用路由。" }) : previewRows.map(roRow),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NButton, { onClick: forkStatic, disabled, children: "自定义本层链" }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: STY.note, children: "本层未单独配置，走「全局默认」范围的链；要调整本层请点上方按钮，要调整所有跟随层请去「全局默认」。" })
		      ] });
		    }
		    const effFollow = info.chain && info.chain.effectiveChain || [];
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.wrap, children: [
		      effFollow.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: S.switchDesc, children: "蒸馏跟随默认模型，未配置回退链。" }) : effFollow.map(roRow),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NButton, { onClick: forkStatic, disabled, children: "编辑为运行时链" }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: STY.note, children: "未配置运行时链时跟随部署配置；「编辑为运行时链」会拷贝部署回退链为草稿，保存起运行时链接管。" })
		    ] });
		  }
		  const capped = rows.length >= 8;
		  const dirty = JSON.stringify(rows) !== JSON.stringify(savedRows);
		  const rowEls = rows.map((row2, i) => {
		    const isPrimary = i === 0;
		    const known = !row2.provider || !!providersById[row2.provider];
		    const modelsLoaded = row2.provider ? Object.prototype.hasOwnProperty.call(modelsCache, row2.provider) : false;
		    const modelList = modelsLoaded ? modelsCache[row2.provider] : [];
		    const manualInput = modelsLoaded && modelList.length === 0;
		    let curEfforts = [];
		    for (let mi = 0; mi < modelList.length; mi++) {
		      if (modelList[mi].id === row2.model) {
		        curEfforts = modelList[mi].efforts || [];
		        break;
		      }
		    }
		    let providerOptions = providers.map((p) => {
		      return { id: p.id, label: p.name !== p.id ? p.name + "（" + p.id + "）" : p.id };
		    });
		    if (isPrimary && !isLayer) {
		      providerOptions = [
		        {
		          id: "",
		          label: info.default ? "跟随默认模型（" + info.default.provider + " / " + info.default.model + "）" : "跟随默认模型"
		        }
		      ].concat(providerOptions);
		    }
		    if (row2.provider && !providersById[row2.provider]) {
		      providerOptions.push({ id: row2.provider, label: row2.provider + "（已不在列表）" });
		    }
		    const modelOptions = modelList.map((m) => {
		      return { id: m.id, label: m.name !== m.id ? m.name + "（" + m.id + "）" : m.id };
		    });
		    if (row2.model && !modelList.some((m) => m.id === row2.model)) {
		      modelOptions.push({ id: row2.model, label: row2.model + "（已不在列表）" });
		    }
		    const effortOptions = [{ id: "", label: "跟随部署配置" }].concat(
		      curEfforts.filter((k) => EFFORT_VOCAB.indexOf(k) >= 0).map((k) => ({ id: k, label: k }))
		    );
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { ...STY.row, ...rowErrs[i] ? STY.rowErr : null }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.line, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: STY.badge, children: isPrimary ? "主" : String(i + 1) }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          NSel,
		          {
		            style: { flex: 1, minWidth: 150 },
		            options: providerOptions,
		            value: row2.provider,
		            disabled,
		            placeholder: isPrimary ? "跟随默认模型" : "供应商",
		            onChange: (v) => {
		              updateRow(i, { provider: v, model: "", reasoningEffort: "" });
		            }
		          }
		        ),
		        !row2.provider ? null : manualInput ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          NInput,
		          {
		            style: { flex: 1, minWidth: 150 },
		            placeholder: "模型 id（该供应商未提供列表，输入后回车）…",
		            value: manual.idx === i ? manual.text : row2.model,
		            onChange: (e) => {
		              setManual({ idx: i, text: e.target.value });
		            },
		            onKeyDown: (e) => {
		              if (e.key === "Enter") {
		                const v = (manual.idx === i ? manual.text : "").trim();
		                if (v) {
		                  updateRow(i, { model: v });
		                  setManual({ idx: -1, text: "" });
		                }
		              }
		            }
		          }
		        ) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          NSel,
		          {
		            style: { flex: 1, minWidth: 150 },
		            options: modelOptions,
		            value: row2.model,
		            disabled: disabled || !modelsLoaded,
		            placeholder: modelsLoaded ? isPrimary ? "（选择模型，可留空跟随默认）" : "（选择模型）" : "加载模型列表…",
		            onChange: (v) => {
		              updateRow(i, { model: v });
		            }
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          NSel,
		          {
		            style: { flexShrink: 0, width: 118 },
		            options: effortOptions,
		            value: row2.reasoningEffort,
		            disabled: disabled || !(row2.provider && row2.model),
		            placeholder: "跟随部署配置",
		            onChange: (v) => {
		              updateRow(i, { reasoningEffort: v });
		            }
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.actions, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          NButton,
		          {
		            style: STY.ico,
		            disabled: disabled || i === 0,
		            title: i === 1 ? "上移（与主路由互换/顶替为主路由）" : "上移",
		            onClick: () => {
		              moveRow(i, -1);
		            },
		            children: "↑"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          NButton,
		          {
		            style: STY.ico,
		            disabled: disabled || i === rows.length - 1 || i === 0 && !row2.provider,
		            title: "下移",
		            onClick: () => {
		              moveRow(i, 1);
		            },
		            children: "↓"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		          NButton,
		          {
		            style: STY.ico,
		            disabled,
		            title: isPrimary ? "重置为跟随默认" : "删除",
		            onClick: () => {
		              removeRow(i);
		            },
		            children: "✕"
		          }
		        )
		      ] }),
		      isPrimary && !row2.provider ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: STY.note, children: "跟随默认模型" + (info.default ? "：" + info.default.provider + " / " + info.default.model : "") + "（档位跟随部署配置，选定模型后可单独设置）" }) : null,
		      !known ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: STY.warn, children: "⚠ 供应商 " + row2.provider + " 已不在已注册路由中：该路由调用会失败并被链跳过（不阻止保存）。" }) : null,
		      rowErrs[i] ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: STY.warn, children: "✕ " + rowErrs[i] }) : null
		    ] }, "row" + i);
		  });
		  const effChain = isLayer ? layerView?.effectiveChain ?? [] : info.chain && info.chain.effectiveChain || [];
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.wrap, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { ...S.switchDesc, marginBottom: 8 }, children: isLayer ? "本层链按序尝试：第 1 行是主路由，失败后按序降级到本层回退（不落全局链）；每行档位独立，缺省跟随部署配置。" : "路由按序尝试：第 1 行是主路由，失败（报错 / 掐断 / 网络异常 / 空输出）后按序降级；每行档位独立，缺省跟随部署配置。" }),
		    rowEls,
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NButton, { style: STY.add, disabled: disabled || capped, onClick: addRow, children: capped ? "已达上限（8 条）" : "+ 添加回退路由" }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        NButton,
		        {
		          style: isLayer ? { ...STY.ghost, color: "var(--dsh-mem-danger)", border: "1px solid var(--dsh-mem-danger)" } : STY.ghost,
		          disabled,
		          onClick: clearToFollow,
		          children: isLayer ? "清除自定义 · 跟随全局" : "清空并跟随部署配置"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NButton, { variant: "primary", disabled, onClick: save, children: "保存" })
		    ] }),
		    err ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { ...STY.warn, marginTop: 8 }, children: "✕ " + err }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--dsh-mem-border)" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { fontSize: 11, color: "var(--dsh-mem-text-3)", marginBottom: 4 }, children: "实际链" + (dirty ? "（保存后更新；当前显示已保存值）" : "") }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        "div",
		        {
		          style: { fontSize: 12, color: "var(--dsh-mem-text-2)", wordBreak: "break-all", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" },
		          children: effChain.map((e) => e.provider + "/" + e.model + (e.effort ? "（" + e.effort + "）" : "")).join(" → ") || "（暂无可用路由）"
		        }
		      )
		    ] })
		  ] });
		}
		
		// client/src/tabs/DistillSettings.tsx
		var import_jsx_runtime7 = require("react/jsx-runtime");
		var STY2 = {
		  rel: {
		    display: "flex",
		    alignItems: "center",
		    gap: 6,
		    flexWrap: "wrap",
		    background: "var(--dsh-mem-accent-weak)",
		    borderRadius: 8,
		    padding: "7px 10px",
		    marginBottom: 8,
		    fontSize: 11.5,
		    color: "var(--dsh-mem-text-2)"
		  },
		  relB: { color: "var(--dsh-mem-accent-text)", fontWeight: 600 },
		  relArr: { color: "var(--dsh-mem-text-3)" },
		  legend: { fontSize: 11, color: "var(--dsh-mem-text-3)", margin: "0 0 8px" },
		  panelHead: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 },
		  panelTitle: { fontSize: 13.5, fontWeight: 650, color: "var(--dsh-mem-text-1)" },
		  chip: {
		    display: "inline-flex",
		    alignItems: "center",
		    borderRadius: 999,
		    padding: "1px 8px",
		    fontSize: 11,
		    fontWeight: 600,
		    lineHeight: "18px",
		    whiteSpace: "nowrap"
		  },
		  chipAccent: { background: "var(--dsh-mem-accent-weak)", color: "var(--dsh-mem-accent-text)" },
		  chipMuted: { background: "var(--dsh-mem-bg-inset)", color: "var(--dsh-mem-text-2)" },
		  panelDesc: { fontSize: 12, color: "var(--dsh-mem-text-3)", margin: "2px 0 8px" },
		  inUse: { fontSize: 11, color: "var(--dsh-mem-text-3)", margin: "6px 0 0" }
		};
		function Dot(props) {
		  const base = {
		    display: "inline-block",
		    width: 7,
		    height: 7,
		    borderRadius: "50%",
		    marginRight: 4,
		    verticalAlign: "middle",
		    flexShrink: 0
		  };
		  if (props.kind === "runtime") return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { ...base, background: "var(--dsh-mem-accent)" } });
		  if (props.kind === "static") return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { ...base, background: "transparent", border: "1.5px solid var(--dsh-mem-text-3)" } });
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { ...base, background: "var(--dsh-mem-track)" } });
		}
		var LAYER_META = {
		  l1: { seg: "L1", title: "L1 · 抽取 / 去重", desc: "高频结构化任务通常配便宜快稳的链；抽取与去重两个调用点共用本链" },
		  l2: { seg: "L2", title: "L2 · 场景摘要", desc: "中频较大输入，通常配平衡型链" },
		  l3: { seg: "L3", title: "L3 · 画像蒸馏", desc: "低频大输入长输出，可配强能力链（慢首包可容忍）" }
		};
		function DistillSettings(props) {
		  const rpc = props.rpc;
		  const disabled = !!props.disabled;
		  const [info, setInfo] = (0, import_react7.useState)(null);
		  const [tab, setTab] = (0, import_react7.useState)("g");
		  (0, import_react7.useEffect)(() => {
		    let alive = true;
		    const refresh = () => {
		      rpc("dsh-memory/llm-providers", {}).then((r) => {
		        if (alive && r && r.ok) setInfo(r.value);
		      }).catch(() => {
		      });
		    };
		    refresh();
		    const timer = setInterval(refresh, 5e3);
		    return () => {
		      alive = false;
		      clearInterval(timer);
		    };
		  }, [rpc]);
		  const layers = info?.layerChains;
		  const dotOf = (k) => layers?.[k]?.source ?? "global";
		  const users = ["l1", "l2", "l3"].filter((k) => dotOf(k) === "global");
		  const segOptions = [
		    { key: "g", label: "全局默认" },
		    ...["l1", "l2", "l3"].map((k) => ({
		      key: k,
		      label: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Dot, { kind: dotOf(k) }),
		        LAYER_META[k].seg
		      ] })
		    }))
		  ];
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: STY2.rel, children: [
		      "每层实际链 ",
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: STY2.relArr, children: "=" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: STY2.relB, children: "本层自定义" }),
		      "（本页可编辑）",
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: STY2.relArr, children: "→" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: STY2.relB, children: "部署 YAML 层链" }),
		      "（只读）",
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: STY2.relArr, children: "→" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: STY2.relB, children: "全局默认链" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { ...STY2.relArr, marginLeft: "auto" }, children: "逐级兜底 · pin 时运行时编辑只读" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Segmented, { value: tab, options: segOptions, onChange: (k) => setTab(k) }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: STY2.legend, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Dot, { kind: "runtime" }),
		      " 运行时自定义 · ",
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Dot, { kind: "static" }),
		      " 静态 YAML · ",
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Dot, { kind: "global" }),
		      " 跟随全局"
		    ] }),
		    tab === "g" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: STY2.panelHead, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: STY2.panelTitle, children: "全局默认链" }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { ...STY2.chip, ...STY2.chipAccent }, children: "运行时 · 可编辑" }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { ...STY2.inUse, marginLeft: "auto" }, children: users.length ? "在用：" + users.map((k) => LAYER_META[k].seg).join("、") : "当前无层使用" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { style: STY2.panelDesc, children: "未单独配置的层走这条链（当前：" + (users.length ? users.map((k) => LAYER_META[k].seg).join("、") : "无") + "）；配齐所有层后它自然闲置。" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(RouteChainEditor, { rpc, disabled }, "g"),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(BudgetInputs, { rpc, disabled, data: props.data, setData: props.setData, onError: props.onError, scope: "input" }, "g-budget")
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: STY2.panelHead, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: STY2.panelTitle, children: LAYER_META[tab].title }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { ...STY2.chip, ...dotOf(tab) === "runtime" ? STY2.chipAccent : STY2.chipMuted }, children: dotOf(tab) === "runtime" ? "运行时自定义" : dotOf(tab) === "static" ? "静态 · YAML" : "跟随全局" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { style: STY2.panelDesc, children: LAYER_META[tab].desc }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(RouteChainEditor, { rpc, disabled, scope: tab }, tab),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(BudgetInputs, { rpc, disabled, data: props.data, setData: props.setData, onError: props.onError, scope: tab }, tab + "-budget")
		    ] })
		  ] });
		}
		
		// client/src/tabs/EmbeddingSection.tsx
		var import_react8 = require("react");
		
		// client/src/rpc.ts
		function makeRpc(ctx) {
		  return (endpoint, payload) => {
		    if (!ctx.connection || !ctx.connection.rpc) return Promise.reject(new Error("connection 服务不可用"));
		    return ctx.connection.rpc.call("/rpc", endpoint, payload ?? {});
		  };
		}
		function asLoose(rpc) {
		  return rpc;
		}
		
		// client/src/tabs/EmbeddingSection.tsx
		var import_jsx_runtime8 = require("react/jsx-runtime");
		function EmbeddingSection(props) {
		  const rpc = props.rpc;
		  const loose = asLoose(rpc);
		  const [st, setSt] = (0, import_react8.useState)(null);
		  const [err, setErr] = (0, import_react8.useState)(null);
		  const busyPollRef = (0, import_react8.useRef)(null);
		  const load = (0, import_react8.useCallback)(() => {
		    rpc("dsh-memory/embedding-state-get", {}).then((r) => {
		      if (r && r.ok && r.value && r.value.supported !== false) {
		        const v = r.value;
		        if (busyPollRef.current) {
		          busyPollRef.current.v = !!(v.download && (v.download.phase === "downloading" || v.download.phase === "verifying") || v.apply.busy || v.reindex && v.reindex.running || v.runtime && v.runtime.phase === "installing");
		        }
		        setSt(v);
		        setErr(null);
		      } else if (r && r.ok && r.value && r.value.supported === false) {
		        setSt(null);
		        setErr("__unsupported__");
		      } else {
		        setErr(r && !r.ok ? r.error.message : "RPC error");
		      }
		    }).catch((e) => {
		      setErr(String(e && e.message || e));
		    });
		  }, [rpc]);
		  (0, import_react8.useEffect)(() => {
		    load();
		  }, [load]);
		  (0, import_react8.useEffect)(() => {
		    let stopped = false;
		    const busyFlag = { v: false };
		    busyPollRef.current = busyFlag;
		    const tick = () => {
		      if (stopped) return;
		      load();
		      timer = setTimeout(tick, busyFlag.v ? 1200 : 5e3);
		    };
		    let timer = setTimeout(tick, 1200);
		    return () => {
		      stopped = true;
		      clearTimeout(timer);
		      busyPollRef.current = null;
		    };
		  }, [load]);
		  const call = (endpoint, payload, confirmText) => {
		    if (confirmText && !window.confirm(confirmText)) return;
		    loose(endpoint, payload).then((r) => {
		      if (!r || !r.ok) setErr(r && r.error ? r.error.message : "操作失败");
		      else {
		        setErr(null);
		        load();
		      }
		    }).catch((e) => {
		      setErr(String(e && e.message || e));
		    });
		  };
		  if (err === "__unsupported__") {
		    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-mem-rb-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontWeight: 600, marginBottom: 4 }, children: "语义检索（嵌入）" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-muted", children: "存储处于降级状态，嵌入管理不可用。" })
		    ] });
		  }
		  if (!st) {
		    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-mem-rb-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-muted", children: err ? "嵌入状态读取失败：" + err : "嵌入状态读取中…" }),
		      err ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(NButton, { style: { marginTop: 8 }, onClick: load, children: "重试" }) : null
		    ] });
		  }
		  const switchConfirm = "切换嵌入源后将按新模型重建向量索引（期间语义检索暂退化为关键词匹配，不影响对话）。确定切换？";
		  const onSource = (key) => {
		    if (key === "local") {
		      const ready = [];
		      for (let i = 0; i < st.models.length; i++) if (st.models[i].state === "downloaded") ready.push(st.models[i].id);
		      if (ready.length === 0) {
		        setErr("请先在下方下载一个本地嵌入模型，再切换到本地档。");
		        return;
		      }
		      const current = st.activeModel && ready.indexOf(st.activeModel) >= 0 ? st.activeModel : ready[0];
		      call("dsh-memory/embedding-source-set", { source: "local", activeModel: current }, switchConfirm);
		      return;
		    }
		    call("dsh-memory/embedding-source-set", { source: key }, key === "remote" ? switchConfirm : null);
		  };
		  const dl = st.download;
		  const dlActive = dl && (dl.phase === "downloading" || dl.phase === "verifying");
		  const ap = st.apply;
		  const localInfo = st.local;
		  const rt = st.runtime;
		  let runtimeRow = null;
		  if (rt.phase === "installing") {
		    runtimeRow = /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { marginTop: 8, fontSize: 12 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: S.flexRow, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "安装推理运行时中… 已耗时 " + Math.round(rt.elapsedMs / 1e3) + "s（约 100~200MB，视网络）" }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: S.grow }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(NButton, { onClick: () => call("dsh-memory/embedding-runtime-cancel", {}), children: "取消" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("pre", { style: { ...S.pre, maxHeight: 68, marginTop: 6, fontSize: 11, opacity: 0.85 }, children: (rt.lastLines || []).join("\n") || "等待 npm 输出…" })
		    ] });
		  } else if (rt.phase === "error") {
		    runtimeRow = /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: "运行时安装失败：" + (rt.error || "未知") + "（重新切换嵌入源可重试）" });
		  } else if (rt.phase === "ready") {
		    runtimeRow = /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: "推理运行时就绪（transformers.js v" + rt.installedVersion + "）" });
		  } else if (st.source === "local") {
		    runtimeRow = /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: "首次启用本地嵌入时会自动安装推理运行时（约 100~200MB）。" });
		  }
		  let applyRow = null;
		  if (ap.phase === "warming") {
		    applyRow = /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: "加载嵌入模型中…（首次需数秒）" });
		  } else if (ap.phase === "switching") {
		    applyRow = /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: "切换嵌入源中…" });
		  } else if (ap.phase === "error") {
		    applyRow = /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: "切换失败：" + ap.message + "（已保存的嵌入源不变，重启后仍按原源运行）" });
		  } else if (st.reindex && st.reindex.running) {
		    const rj = st.reindex;
		    const rDone = rj.l1Done + rj.l0Done;
		    const rTotal = rj.l1Total + rj.l0Total;
		    const rPct = rTotal > 0 ? Math.round(rDone / rTotal * 100) : 0;
		    applyRow = /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { marginTop: 8 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: S.flexRow, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-mem-rb-muted", children: "重嵌入中 L1 " + rj.l1Done + "/" + rj.l1Total + " · L0 " + rj.l0Done + "/" + rj.l0Total + "（" + rPct + "%）" }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: S.grow }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(NButton, { onClick: () => call("dsh-memory/embedding-reindex-cancel", {}), children: "取消" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { ...S.flexRow, marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-bar", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-fill", style: { width: rPct + "%" } }) }) })
		    ] });
		  }
		  const modelCards = st.models.map((m) => {
		    const isActive = st.source === "local" && st.activeModel === m.id;
		    const mDl = dlActive && dl.modelId === m.id;
		    const pct = mDl && dl.overallTotal > 0 ? Math.round(dl.overallReceived / dl.overallTotal * 100) : 0;
		    let action = null;
		    if (mDl) {
		      action = /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { flex: 1, minWidth: 200 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: S.flexRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-mem-rb-muted", style: { whiteSpace: "nowrap" }, children: (dl.phase === "verifying" ? "校验中 " : "") + fmtMB(dl.overallReceived) + " / " + fmtMB(dl.overallTotal) + "（文件 " + dl.fileIndex + "/" + dl.fileCount + "，" + pct + "%" + (dl.speedBps > 0 && dl.phase === "downloading" ? "，" + fmtMB(dl.speedBps) + "/s" : "") + "）" }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: S.grow }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(NButton, { onClick: () => call("dsh-memory/embedding-download-cancel", {}), children: "取消" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { ...S.flexRow, marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-bar", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-fill", style: { width: pct + "%" } }) }) })
		      ] });
		    } else if (isActive) {
		      action = /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: S.flexRow, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-mem-tag dsh-mem-tag-work-task", children: "使用中" }),
		        localInfo && localInfo.state === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-mem-rb-muted", children: "模型加载中…" }) : null,
		        localInfo && localInfo.state === "failed" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: { fontSize: 12, color: "var(--dsh-mem-danger)" }, children: "加载失败：" + (localInfo.error || "") }) : null,
		        localInfo && localInfo.state === "ready" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-mem-rb-muted", children: "已就绪" }) : null
		      ] });
		    } else if (m.state === "downloaded") {
		      action = /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: S.flexRow, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          NButton,
		          {
		            disabled: ap.busy,
		            onClick: () => call("dsh-memory/embedding-source-set", { source: "local", activeModel: m.id }, switchConfirm),
		            children: "启用"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          NButton,
		          {
		            disabled: dlActive,
		            onClick: () => call("dsh-memory/embedding-model-delete", { modelId: m.id }, "删除已下载的 " + m.name + "（" + fmtMB(m.totalBytes) + "）？"),
		            children: "删除"
		          }
		        )
		      ] });
		    } else {
		      action = /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		        NButton,
		        {
		          disabled: dlActive || !st.ceilings.local,
		          title: !st.ceilings.local ? "部署已禁用本地嵌入模型" : "",
		          onClick: () => call("dsh-memory/embedding-download-start", { modelId: m.id }),
		          children: (m.state === "partial" ? "继续下载 " : "下载 ") + fmtMB(m.totalBytes)
		        }
		      );
		    }
		    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
		      "div",
		      {
		        style: { ...S.flexRow, padding: "8px 0", borderBottom: "1px solid var(--dsh-mem-border)", flexWrap: "wrap" },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { minWidth: 150 }, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontWeight: 600 }, children: m.name }),
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-muted", children: m.tags.join(" · ") + " · " + m.dims + " 维 · 上下文 " + m.contextTokens })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { flex: 1, minWidth: 180, fontSize: 12, color: "var(--dsh-mem-text-2)" }, children: m.description }),
		          action
		        ]
		      },
		      m.id
		    );
		  });
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-mem-rb-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: S.flexRow, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontWeight: 600, whiteSpace: "nowrap" }, children: "语义检索（嵌入源）" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		        Segmented,
		        {
		          value: st.source,
		          options: [
		            { key: "off", label: "关闭" },
		            { key: "local", label: "本地", disabled: !st.ceilings.local, disabledTitle: "部署已禁用本地嵌入模型" },
		            { key: "remote", label: "远程", disabled: !st.ceilings.remote, disabledTitle: "部署未配置远程嵌入（baseUrl/apiKey/model/dimensions）" }
		          ],
		          onChange: onSource
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 4 }, children: st.source === "off" ? "当前：关键词（BM25）检索，不做向量嵌入" : st.source === "remote" ? "当前：远程嵌入（" + (rt ? "" : "") + "模型由部署配置给定）" : "当前：本地嵌入" + (st.activeModel ? "（" + st.activeModel + "）" : "") }),
		    st.activeNote ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { marginTop: 4, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: st.activeNote }) : null,
		    err && err !== "__unsupported__" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { marginTop: 6, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: err }) : null,
		    dl && dl.phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { marginTop: 6, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: "下载失败：" + (dl.error || "") }) : null,
		    runtimeRow,
		    applyRow,
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: S.panelLabel, children: "本地模型目录（下载后离线可用，不随插件分发）" }),
		    modelCards
		  ] });
		}
		
		// client/src/tabs/RebuildPanel.tsx
		var import_react9 = require("react");
		var import_jsx_runtime9 = require("react/jsx-runtime");
		var RB_PHASE_LABEL = {
		  preparing: "准备中（归档旧数据 · 清空检索库）",
		  distilling: "分块蒸馏中",
		  finalizing: "收尾（强制 L2 场景 + L3 画像）"
		};
		function RebuildPanel(props) {
		  const rpc = props.rpc;
		  const [rbRaw, setRb] = (0, import_react9.useState)(null);
		  const [confirmOpen, setConfirmOpen] = (0, import_react9.useState)(false);
		  const [busy, setBusy] = (0, import_react9.useState)(false);
		  const [rbError, setRbError] = (0, import_react9.useState)(null);
		  const refresh = (0, import_react9.useCallback)(() => {
		    rpc("dsh-memory/rebuild-status", {}).then((r) => {
		      if (r && r.ok) setRb(r.value);
		    }).catch(() => {
		    });
		  }, [rpc]);
		  (0, import_react9.useEffect)(() => {
		    refresh();
		  }, [refresh]);
		  const running = !!(rbRaw && rbRaw.running);
		  (0, import_react9.useEffect)(() => {
		    if (!running) return;
		    const timer = setInterval(refresh, 1500);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [running, refresh]);
		  if (!rbRaw || rbRaw.supported === false) return null;
		  const rb = rbRaw;
		  ensureThemeStyle();
		  const start = () => {
		    setBusy(true);
		    setRbError(null);
		    rpc("dsh-memory/rebuild-start", {}).then((r) => {
		      setBusy(false);
		      if (r && r.ok) {
		        setConfirmOpen(false);
		        setRb(r.value);
		      } else {
		        setRbError(r && r.error ? r.error.message : "启动失败");
		      }
		    }).catch((e) => {
		      setBusy(false);
		      setRbError(String(e && e.message || e));
		    });
		  };
		  const cancel = () => {
		    setBusy(true);
		    rpc("dsh-memory/rebuild-cancel", {}).then((r) => {
		      setBusy(false);
		      if (r && r.ok) setRb(r.value);
		    }).catch(() => {
		      setBusy(false);
		    });
		  };
		  const empty = !running && (rb.messageCount === 0 || rb.estCalls === 0);
		  const pct = rb.total > 0 ? Math.round(rb.done / rb.total * 100) : 0;
		  let lastNote = null;
		  if (!running && rb.phase === "done") {
		    lastNote = "上次重建：完成（" + rb.done + "/" + rb.total + " 会话，产出 " + rb.recordsBuilt + " 条记录）" + (rb.finishedAt ? " · " + fmtTime(new Date(rb.finishedAt).toISOString()) : "");
		  } else if (!running && rb.phase === "cancelled") {
		    lastNote = "上次重建：已取消（完成 " + rb.done + "/" + rb.total + " 会话，已重建部分保留）";
		  } else if (!running && rb.phase === "failed") {
		    lastNote = "上次重建：失败：" + (rb.error || "未知错误");
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-mem-rb-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { fontWeight: 600, whiteSpace: "nowrap" }, children: "重建记忆" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-mem-rb-muted", style: { flex: 1, minWidth: 180 }, children: running ? (RB_PHASE_LABEL[rb.phase] || rb.phase) + " · " + rb.done + "/" + rb.total + " 会话（" + pct + "%）" : "从 L0 原始对话重新蒸馏 L1/L2/L3；旧数据先归档（不删除）" }),
		      running ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(NButton, { disabled: busy || rb.cancelRequested, onClick: cancel, children: rb.cancelRequested ? "取消中…" : "取消重建" }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        NButton,
		        {
		          disabled: busy || empty,
		          title: empty ? "L0 无消息，无可重建内容" : "重新蒸馏全部记忆",
		          style: { color: "var(--dsh-mem-danger)" },
		          onClick: () => {
		            setConfirmOpen(true);
		          },
		          children: busy ? "…" : "开始重建"
		        }
		      )
		    ] }),
		    running ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-mem-rb-bar", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-mem-rb-fill", style: { width: pct + "%" } }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-mem-rb-muted", style: { whiteSpace: "nowrap" }, children: "产出 " + rb.recordsBuilt + " 条" })
		    ] }) : null,
		    lastNote ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: lastNote }) : null,
		    rbError ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: rbError }) : null,
		    confirmOpen ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		      NModal,
		      {
		        open: true,
		        onClose: () => {
		          setConfirmOpen(false);
		        },
		        title: "确认重建全部记忆？",
		        footer: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		            NButton,
		            {
		              onClick: () => {
		                setConfirmOpen(false);
		              },
		              children: "取消"
		            },
		            "cancel"
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(NButton, { variant: "primary", disabled: busy, onClick: start, children: busy ? "启动中…" : "开始重建" }, "confirm")
		        ],
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
		            "将以 L0 原始对话为事实源重新蒸馏：",
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: rb.sessionCount + " 个会话 · " + rb.messageCount + " 条消息" }),
		            "，预计 ≥" + rb.estCalls + " 次蒸馏调用。"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { marginTop: 8 }, children: "现有 L1 记忆 / L2 场景 / L3 画像会整体归档（*.bak.时间戳，可手工找回），随后清空重建；重建期间可正常对话，新对话的蒸馏优先进行；中途可取消，已重建部分保留。" })
		        ]
		      }
		    ) : null
		  ] });
		}
		
		// client/src/tabs/OverviewTab.tsx
		var import_jsx_runtime10 = require("react/jsx-runtime");
		function OverviewTab(props) {
		  const rpc = props.rpc;
		  const [stats, setStats] = (0, import_react10.useState)(null);
		  const [settingsData, setSettingsData] = (0, import_react10.useState)(null);
		  const [error, setError] = (0, import_react10.useState)(null);
		  const load = (0, import_react10.useCallback)(() => {
		    rpc("dsh-memory/stats", {}).then((r) => {
		      if (r && r.ok) setStats(r.value);
		      else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		    rpc("dsh-memory/settings-get", {}).then((r) => {
		      if (r && r.ok) setSettingsData(r.value);
		    }).catch(() => {
		    });
		  }, [rpc]);
		  (0, import_react10.useEffect)(() => {
		    load();
		    const timer = setInterval(load, 5e3);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [load]);
		  const toggle = (key, value) => {
		    if (!settingsData) return;
		    const prev = settingsData;
		    const patch = { [key]: value };
		    const next = { ...prev, settings: { ...prev.settings, [key]: value } };
		    setSettingsData(next);
		    rpc("dsh-memory/settings-set", patch).then((r) => {
		      if (!r || !r.ok) {
		        setSettingsData(prev);
		        setError(r && r.error ? "开关写入失败：" + r.error.message : "开关写入失败");
		      } else {
		        setError(null);
		      }
		    }).catch((e) => {
		      setSettingsData(prev);
		      setError("开关写入失败：" + String(e && e.message || e));
		    });
		  };
		  const tiles = [];
		  const infos = [];
		  if (stats) {
		    const th = stats.thresholds || { l2MinNewMemories: 5, l3Interval: 20 };
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
		  const degraded = stats && stats.message && stats.message !== "running";
		  const master = settingsData && settingsData.settings ? settingsData.settings.enabled : true;
		  let ceilingNote = "";
		  if (settingsData && settingsData.ceilings) {
		    const off = [];
		    if (!settingsData.ceilings.capture) off.push("捕获");
		    if (!settingsData.ceilings.distill) off.push("蒸馏");
		    if (!settingsData.ceilings.recall) off.push("召回");
		    if (off.length > 0) ceilingNote = "注意：部署配置已停用 " + off.join("、") + "（运行时开关无法开启）";
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { children: [
		    settingsData && settingsData.supported === false ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: S.hint, children: "settings 服务不可用，记忆模式开关未启用（记忆保持全开）。" }) : settingsData ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { style: S.switchPanel, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.panelLabel, children: "记忆模式" }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		        SwitchRow,
		        {
		          label: "记忆模式",
		          desc: master ? "已开启：捕获对话并蒸馏记忆" : "已关闭：不捕获、不蒸馏、不注入（数据保留）",
		          checked: master,
		          onChange: (v) => {
		            toggle("enabled", v);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		        SwitchRow,
		        {
		          label: "捕获",
		          desc: "L0：记录原始对话（关闭后蒸馏也无输入）",
		          checked: settingsData.settings.capture,
		          disabled: !master,
		          onChange: (v) => {
		            toggle("capture", v);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		        SwitchRow,
		        {
		          label: "蒸馏",
		          desc: "L1 抽取 + L2 场景 + L3 画像",
		          checked: settingsData.settings.distill,
		          disabled: !master,
		          onChange: (v) => {
		            toggle("distill", v);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		        SwitchRow,
		        {
		          label: "召回",
		          desc: "对话时注入相关记忆与画像",
		          checked: settingsData.settings.recall,
		          disabled: !master,
		          onChange: (v) => {
		            toggle("recall", v);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.panelLabel, children: "蒸馏参数" }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(DistillSettings, { rpc, disabled: !master, data: settingsData, setData: setSettingsData, onError: setError }),
		      ceilingNote ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: S.hint, children: ceilingNote }) : null
		    ] }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(EmbeddingSection, { rpc }),
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(RebuildPanel, { rpc }),
		    degraded ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: { ...S.error, marginBottom: 10 }, children: "⚠ " + stats.message + "。上方数据为最后一次成功读取的值，记忆功能当前未工作。" }) : null,
		    error ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.error, children: "获取状态失败：" + error }) : !stats ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: S.intro, children: "正在读取记忆状态…" }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.panelLabel, children: "记忆概况" }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.statGrid, children: tiles.map((t) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-mem-card", style: S.statTile, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.statNum, children: t.num }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.statLabel, children: t.label })
		        ] }, t.label);
		      }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.panelLabel, children: "运行状态" }),
		      infos.map((row2) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { style: S.infoRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: S.infoKey, children: row2[0] }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: S.infoVal, children: row2[1] })
		        ] }, row2[0]);
		      })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: S.hint, children: "浏览各层记忆内容请切换上方 Tab；原始对话（L0）不入浏览器，可由模型侧 conversation_search 工具查询。" })
		  ] });
		}
		
		// client/src/tabs/PersonaTab.tsx
		var import_react11 = require("react");
		var import_jsx_runtime11 = require("react/jsx-runtime");
		function PersonaTab(props) {
		  const rpc = props.rpc;
		  const [content, setContent] = (0, import_react11.useState)(null);
		  const [error, setError] = (0, import_react11.useState)(null);
		  const load = (0, import_react11.useCallback)(() => {
		    setError(null);
		    rpc("dsh-memory/persona", {}).then((r) => {
		      if (r && r.ok) setContent(r.value.content);
		      else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		  }, [rpc]);
		  (0, import_react11.useEffect)(() => {
		    load();
		  }, [load]);
		  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: S.muted, children: error ? "加载失败" : content === null ? "加载中…" : content ? content.length + " 字符" : "未生成画像" }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(NButton, { onClick: load, children: "刷新" })
		    ] }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: { ...S.error, marginBottom: 10 }, children: "画像读取失败：" + error + "（点右上“刷新”重试）" }) : null,
		    content ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("pre", { style: S.pre, children: content }) : content === null ? null : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { style: S.intro, children: "画像尚未生成；蒸馏若干记忆后 L3 会自动产出。" })
		  ] });
		}
		
		// client/src/tabs/RecordsTab.tsx
		var import_react12 = require("react");
		var import_jsx_runtime12 = require("react/jsx-runtime");
		var TYPE_CHOICES = [
		  "persona",
		  "episodic",
		  "instruction",
		  "work_fact",
		  "work_task",
		  "work_method",
		  "work_artifact"
		];
		function RecordsTab(props) {
		  const rpc = props.rpc;
		  const limit = 50;
		  const [items, setItems] = (0, import_react12.useState)([]);
		  const [hasMore, setHasMore] = (0, import_react12.useState)(false);
		  const [total, setTotal] = (0, import_react12.useState)(null);
		  const [sceneOptions, setSceneOptions] = (0, import_react12.useState)([]);
		  const [loading, setLoading] = (0, import_react12.useState)(false);
		  const [truncated, setTruncated] = (0, import_react12.useState)(false);
		  const [error, setError] = (0, import_react12.useState)(null);
		  const [expandedId, setExpandedId] = (0, import_react12.useState)(null);
		  const [query, setQuery] = (0, import_react12.useState)("");
		  const [typeFilter, setTypeFilter] = (0, import_react12.useState)("");
		  const [sceneFilter, setSceneFilter] = (0, import_react12.useState)("");
		  const [last, setLast] = (0, import_react12.useState)({ query: "", type: "", scene: "" });
		  const seqRef = (0, import_react12.useRef)(0);
		  const fetchPage = (0, import_react12.useCallback)(
		    (conds, offset, append) => {
		      setLoading(true);
		      setError(null);
		      const token = ++seqRef.current;
		      const payload = { limit, offset };
		      if (conds.query) payload.query = conds.query;
		      if (conds.type) payload.type = conds.type;
		      if (conds.scene) payload.scene = conds.scene;
		      rpc("dsh-memory/list-records", payload).then((r) => {
		        if (token !== seqRef.current) return;
		        setLoading(false);
		        if (!r || !r.ok) {
		          setError(r && r.error ? r.error.message : "RPC error");
		          return;
		        }
		        const v = r.value;
		        setItems((prev) => append ? prev.concat(v.items) : v.items);
		        setHasMore(!!v.hasMore);
		        setTotal(v.total === void 0 || v.total === null ? null : v.total);
		        setTruncated(!!v.truncated);
		        if (v.scenes) setSceneOptions(v.scenes);
		      }).catch((e) => {
		        if (token !== seqRef.current) return;
		        setLoading(false);
		        setError(String(e && e.message || e));
		      });
		    },
		    [rpc]
		  );
		  const search = () => {
		    const conds = { query: query.trim(), type: typeFilter, scene: sceneFilter };
		    setLast(conds);
		    fetchPage(conds, 0, false);
		  };
		  (0, import_react12.useEffect)(() => {
		    fetchPage({ query: "", type: "", scene: "" }, 0, false);
		  }, [fetchPage]);
		  const countText = total !== null ? "共 " + total + " 条" : items.length + " 条" + (hasMore ? "+" : "");
		  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: S.toolbar, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
		        NInput,
		        {
		          style: { flex: 1, minWidth: 160 },
		          placeholder: "搜索记忆内容（BM25 关键词）…",
		          value: query,
		          onChange: (e) => {
		            setQuery(e.target.value);
		          },
		          onKeyDown: (e) => {
		            if (e.key === "Enter") search();
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
		        NSel,
		        {
		          style: { maxWidth: 200 },
		          options: [{ id: "", label: "全部类型" }].concat(
		            TYPE_CHOICES.map((t) => {
		              return { id: t, label: TYPE_LABELS[t] || t };
		            })
		          ),
		          value: typeFilter,
		          onChange: setTypeFilter
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
		        NSel,
		        {
		          style: { maxWidth: 220 },
		          options: [{ id: "", label: "全部情境" }].concat(
		            sceneOptions.map((s) => {
		              return { id: s, label: s.length > 24 ? s.slice(0, 24) + "…" : s };
		            })
		          ),
		          value: sceneFilter,
		          onChange: setSceneFilter
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(NButton, { onClick: search, children: "搜索" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: S.muted, children: loading ? "加载中…" : countText }),
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
		        NButton,
		        {
		          onClick: () => {
		            fetchPage(last, 0, false);
		          },
		          children: "刷新"
		        }
		      )
		    ] }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.error, children: error }) : null,
		    truncated ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.hint, children: "搜索分页已达检索上限（200 条），更早的结果未显示。请用更精确的关键词或类型/情境过滤。" }) : null,
		    items.length === 0 && !loading && !error ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { style: S.intro, children: "暂无记忆。对话几轮后，蒸馏管线会自动抽取记忆。" }) : items.map((m) => {
		      const open = expandedId === m.id;
		      return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
		        "div",
		        {
		          className: "dsh-mem-card dsh-mem-card-hover",
		          style: { ...S.card, cursor: "pointer" },
		          onClick: () => {
		            setExpandedId(open ? null : m.id);
		          },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: S.cardHead, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dsh-mem-tag dsh-mem-tag-" + m.type, children: TYPE_LABELS[m.type] || m.type }),
		              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: S.muted, children: "优先级 " + m.priority }),
		              m.score !== null && m.score !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: S.muted, children: "相关度 " + Number(m.score).toFixed(2) }) : null,
		              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.grow }),
		              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: S.muted, children: fmtTime(m.updatedAt) })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.content, children: m.content }),
		            open ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.detail, children: "id: " + m.id + "\n情境: " + (m.scene || "-") + "\n版本: v" + m.version + "（去重合并次数 " + m.version + "）\n创建: " + fmtTime(m.createdAt) + "\n活跃时间: " + (m.timestamps && m.timestamps.length > 0 ? m.timestamps.map(fmtTime).join(" → ") : "-") + "\n" + (m.sourceMessageIds && m.sourceMessageIds.length > 0 ? "来源消息: " + m.sourceMessageIds.join(", ") : "来源消息: -") }) : null
		          ]
		        },
		        m.id
		      );
		    }),
		    hasMore ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: S.flexRow, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
		        NButton,
		        {
		          disabled: loading,
		          onClick: () => {
		            if (!loading) fetchPage(last, items.length, true);
		          },
		          children: loading ? "加载中…" : "加载更多"
		        }
		      )
		    ] }) : null
		  ] });
		}
		
		// client/src/tabs/ScenesTab.tsx
		var import_react13 = require("react");
		var import_jsx_runtime13 = require("react/jsx-runtime");
		function SceneCard(props) {
		  const s = props.s;
		  const [open, setOpen] = (0, import_react13.useState)(false);
		  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dsh-mem-card dsh-mem-card-hover", style: S.card, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
		      "div",
		      {
		        style: { ...S.sceneHead, cursor: "pointer", userSelect: "none" },
		        onClick: () => {
		          setOpen(!open);
		        },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dsh-mem-scene-chev", style: { transform: open ? "rotate(90deg)" : "none" }, children: "▸" }),
		          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: S.sceneTitle, children: s.path }),
		          s.heat ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: S.muted, children: "热度 " + s.heat }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { style: S.grow }),
		          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: S.muted, children: "更新 " + fmtTime(s.updated) })
		        ]
		      }
		    ),
		    s.summary ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { style: { ...S.muted, marginBottom: 6 }, children: s.summary }) : null,
		    open ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("pre", { style: S.pre, children: s.content || "(空)" }) : null
		  ] });
		}
		function ScenesTab(props) {
		  const rpc = props.rpc;
		  const [items, setItems] = (0, import_react13.useState)(null);
		  const [error, setError] = (0, import_react13.useState)(null);
		  const load = (0, import_react13.useCallback)(() => {
		    rpc("dsh-memory/scenes", {}).then((r) => {
		      if (r && r.ok) {
		        setItems(r.value.items);
		        setError(null);
		      } else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		  }, [rpc]);
		  (0, import_react13.useEffect)(() => {
		    load();
		  }, [load]);
		  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: S.muted, children: items ? items.length + " 个场景块" : "加载中…" }),
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(NButton, { onClick: load, children: "刷新" })
		    ] }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { style: S.error, children: error }) : null,
		    items && items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { style: S.intro, children: "暂无场景块。累计 5 条新记忆后 L2 会自动整合出第一个场景。" }) : null,
		    (items || []).map((s) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(SceneCard, { s }, s.path);
		    })
		  ] });
		}
		
		// client/src/panel.tsx
		var import_jsx_runtime14 = require("react/jsx-runtime");
		var TABS = [
		  ["overview", "概览"],
		  ["records", "记忆"],
		  ["scenes", "场景"],
		  ["persona", "画像"],
		  ["cost", "成本"],
		  ["log", "日志"]
		];
		function MemoryPanel(props) {
		  const rpc = props.rpc;
		  const [tab, setTab] = (0, import_react14.useState)("overview");
		  ensureThemeStyle();
		  (0, import_react14.useEffect)(() => {
		    watchSidebarIcon();
		  }, []);
		  let body;
		  if (tab === "overview") body = /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(OverviewTab, { rpc });
		  else if (tab === "records") body = /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(RecordsTab, { rpc });
		  else if (tab === "scenes") body = /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(ScenesTab, { rpc });
		  else if (tab === "persona") body = /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(PersonaTab, { rpc });
		  else if (tab === "cost") body = /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(CostTab, { rpc });
		  else body = /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(LogTab, { rpc });
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dsh-mem-root", style: S.section, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { style: S.heading, children: "记忆 (Memory)" }),
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { style: S.intro, children: "L0~L3 分层蒸馏记忆：浏览被记住的内容，控制记忆模式开关。" }),
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: S.tabbar, children: TABS.map((t) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		        "button",
		        {
		          className: tab === t[0] ? "dsh-mem-tab dsh-mem-tab-on" : "dsh-mem-tab",
		          onClick: () => {
		            setTab(t[0]);
		          },
		          children: t[1]
		        },
		        t[0]
		      );
		    }) }),
		    body
		  ] });
		}
		
		// client/src/pill/MemoryModePill.tsx
		var import_react17 = require("react");
		
		// src/util/context-occupancy.ts
		var CONTEXT_METER_CIRCUMFERENCE = 34.55751918948772;
		function haloDashArray(occupancyRatio, circumference = CONTEXT_METER_CIRCUMFERENCE, minLen = 0) {
		  const clamped = Number.isFinite(occupancyRatio) ? Math.min(1, Math.max(0, occupancyRatio)) : 0;
		  const len = Math.max(clamped * circumference, clamped > 0 ? minLen : 0);
		  return `${len} ${circumference}`;
		}
		var RADIUS_EPSILON = 1e-6;
		function isContextMeterAnchor(sig) {
		  if (sig.ariaHasPopup !== "dialog") return false;
		  if (sig.viewBox !== "0 0 14 14") return false;
		  const radii = sig.circleRadii;
		  if (!Array.isArray(radii) || radii.length !== 2) return false;
		  return radii.every((r) => Math.abs(r - 5.5) < RADIUS_EPSILON);
		}
		
		// client/src/meter/occupancy-indicator.ts
		var statsCall = null;
		var snapshotBySession = /* @__PURE__ */ new Map();
		var activeSessionId = null;
		var panelListeners = /* @__PURE__ */ new Set();
		var panelWasOpen = false;
		var snapshotListeners = /* @__PURE__ */ new Set();
		function initOccupancyIndicator(call) {
		  statsCall = call;
		}
		function noteOccupancySession(sessionId) {
		  if (sessionId === activeSessionId) return;
		  activeSessionId = sessionId;
		  panelWasOpen = false;
		  if (sessionId !== null && !snapshotBySession.has(sessionId)) void fetchSnapshot(true);
		}
		function onMeterPanelOpen(listener) {
		  panelListeners.add(listener);
		  return () => panelListeners.delete(listener);
		}
		function onMeterSnapshotUpdate(listener) {
		  snapshotListeners.add(listener);
		  return () => snapshotListeners.delete(listener);
		}
		function effectiveView(snap) {
		  const recall = Math.max(snap?.backfillRecallTokens ?? 0, snap?.recallTokens ?? 0);
		  const ledgerProfile = snap?.profileTokens ?? 0;
		  const profile = ledgerProfile > 0 ? ledgerProfile : snap?.backfillProfileTokens ?? 0;
		  return { stock: recall + profile, recall, profile, window: snap?.contextWindowTokens ?? null };
		}
		function currentMeterSnapshot() {
		  const sid = activeSessionId;
		  if (sid === null) return null;
		  const snap = snapshotBySession.get(sid);
		  if (!snap) return null;
		  const v = effectiveView(snap);
		  return {
		    stockTokens: v.stock,
		    recallTokens: v.recall,
		    profileTokens: v.profile,
		    contextWindowTokens: v.window,
		    mode: snap.mode
		  };
		}
		function currentAnchor() {
		  return anchorCache?.button ?? null;
		}
		var FETCH_MIN_INTERVAL_MS = 2e3;
		var FETCH_FAILURE_REMOVE_AFTER = 3;
		var lastFetchStartedAt = 0;
		var fetchInFlight = false;
		var fetchFailureStreak = 0;
		async function fetchSnapshot(force = false) {
		  const sid = activeSessionId;
		  if (!statsCall || !sid || fetchInFlight) return;
		  if (!force && Date.now() - lastFetchStartedAt < FETCH_MIN_INTERVAL_MS) return;
		  fetchInFlight = true;
		  lastFetchStartedAt = Date.now();
		  try {
		    const res = await statsCall("dsh-memory/session-stats", { sessionId: sid });
		    const v = res && res.ok ? res.value : void 0;
		    if (!res || !res.ok) {
		      fetchFailureStreak++;
		      scheduleReconcile();
		      return;
		    }
		    if (sid !== activeSessionId) return;
		    snapshotBySession.set(sid, {
		      stockTokens: v?.supported && v.memoryOccupancy ? v.memoryOccupancy.stockTokens : null,
		      recallTokens: v?.supported && v.memoryOccupancy ? v.memoryOccupancy.recallTokens : null,
		      profileTokens: v?.supported && v.memoryOccupancy ? v.memoryOccupancy.profileTokens : null,
		      backfillRecallTokens: v?.supported ? v.occupancyBackfill?.recallTokens ?? null : null,
		      backfillProfileTokens: v?.supported ? v.occupancyBackfill?.profileTokens ?? null : null,
		      contextWindowTokens: v?.supported ? v.contextWindowTokens ?? null : null,
		      mode: v?.supported ? v.mode ?? null : null,
		      updatedAt: Date.now()
		    });
		    fetchFailureStreak = 0;
		    for (const l of snapshotListeners) l();
		    scheduleReconcile();
		  } catch {
		    fetchFailureStreak++;
		    scheduleReconcile();
		  } finally {
		    fetchInFlight = false;
		  }
		}
		var PARASITE_CLASS = "dsh-mem-parasite";
		var MIN_VISIBLE_ARC = 2;
		var observer = null;
		var reconcileScheduled = false;
		var anchorCache = null;
		function watchContextMeter() {
		  if (observer !== null || typeof document === "undefined" || !document.body) return;
		  observer = new MutationObserver(onMutations);
		  observer.observe(document.body, {
		    childList: true,
		    subtree: true,
		    attributes: true,
		    attributeFilter: ["stroke-dasharray", "aria-expanded", "aria-label"]
		  });
		  scheduleReconcile();
		}
		function onMutations(mutations) {
		  for (const m of mutations) {
		    const target = m.target;
		    if (target && typeof target.classList?.contains === "function" && target.classList.contains(PARASITE_CLASS)) {
		      continue;
		    }
		    scheduleReconcile();
		    return;
		  }
		}
		function scheduleReconcile() {
		  if (reconcileScheduled) return;
		  reconcileScheduled = true;
		  queueMicrotask(() => {
		    reconcileScheduled = false;
		    reconcile();
		  });
		}
		function findAnchor() {
		  const candidates = document.querySelectorAll('button[aria-haspopup="dialog"]');
		  for (let i = 0; i < candidates.length; i++) {
		    const button = candidates[i];
		    if (!button) continue;
		    const svg = button.querySelector("svg");
		    if (!svg) continue;
		    const circles = svg.querySelectorAll("circle");
		    const radii = [];
		    for (let c = 0; c < circles.length; c++) {
		      const r = parseFloat(circles[c]?.getAttribute("r") ?? "");
		      if (Number.isFinite(r)) radii.push(r);
		    }
		    if (isContextMeterAnchor({
		      ariaHasPopup: button.getAttribute("aria-haspopup"),
		      viewBox: svg.getAttribute("viewBox"),
		      circleRadii: radii
		    })) {
		      return { button, svg };
		    }
		  }
		  return null;
		}
		function reconcile() {
		  if (!anchorCache || !anchorCache.button.isConnected || !anchorCache.svg.isConnected) {
		    const found = document.body ? findAnchor() : null;
		    anchorCache = found ? found : null;
		  }
		  if (!anchorCache) return;
		  const open = anchorCache.button.getAttribute("aria-expanded") === "true";
		  if (open !== panelWasOpen) {
		    panelWasOpen = open;
		    for (const l of panelListeners) l(open);
		    if (open) void fetchSnapshot(true);
		  }
		  applyHalo();
		}
		function applyHalo() {
		  const svg = anchorCache?.svg;
		  if (!svg) return;
		  const snap = activeSessionId !== null ? snapshotBySession.get(activeSessionId) : void 0;
		  const failing = fetchFailureStreak >= FETCH_FAILURE_REMOVE_AFTER;
		  const view = failing ? { stock: 0, recall: 0, profile: 0, window: null } : effectiveView(snap);
		  const win = view.window;
		  const ratio = win !== null && win > 0 ? Math.min(1, Math.max(0, view.stock / win)) : null;
		  const existing = svg.querySelector(`circle.${PARASITE_CLASS}`);
		  if (ratio === null || ratio <= 0) {
		    existing?.remove();
		    return;
		  }
		  let halo = existing;
		  if (!halo) {
		    halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		    halo.setAttribute("class", PARASITE_CLASS);
		    halo.setAttribute("cx", "7");
		    halo.setAttribute("cy", "7");
		    halo.setAttribute("r", "6.4");
		    halo.setAttribute("fill", "none");
		    halo.setAttribute("stroke", "var(--dsh-mem-accent)");
		    halo.setAttribute("stroke-width", "0.85");
		    halo.setAttribute("transform", "rotate(-90 7 7)");
		    halo.style.filter = "drop-shadow(0 0 3px var(--dsh-mem-accent))";
		    halo.setAttribute("aria-hidden", "true");
		    halo.style.pointerEvents = "none";
		    svg.appendChild(halo);
		  }
		  halo.setAttribute(
		    "stroke-dasharray",
		    haloDashArray(ratio, CONTEXT_METER_CIRCUMFERENCE, MIN_VISIBLE_ARC)
		  );
		  const fill = svg.querySelector("circle:nth-of-type(2)");
		  const offKey = fill?.getAttribute("stroke-dasharray") ?? "";
		  if (svg.dataset.offKey !== void 0 && svg.dataset.offKey !== offKey) {
		    void fetchSnapshot();
		  }
		  svg.dataset.offKey = offKey;
		}
		
		// client/src/meter/panel-section.ts
		var SECTION_TAG = "dsh-mem-panel";
		var inited = false;
		var mounted = null;
		var panelOpen = false;
		function fmtTokens(n) {
		  if (n >= 1e6) {
		    const v = n / 1e6;
		    return `${v < 100 ? v.toFixed(1) : Math.round(v)}M`;
		  }
		  if (n >= 1e3) {
		    const v = n / 1e3;
		    return `${v < 100 ? v.toFixed(1) : Math.round(v)}K`;
		  }
		  return String(Math.round(n));
		}
		function initPanelSection(read) {
		  if (inited) return;
		  inited = true;
		  onMeterPanelOpen((open) => {
		    panelOpen = open;
		    if (!open) {
		      mounted?.remove();
		      mounted = null;
		      return;
		    }
		    tryMount(read);
		  });
		  onMeterSnapshotUpdate(() => {
		    if (panelOpen && !mounted) tryMount(read);
		  });
		}
		function tryMount(read) {
		  const view = read();
		  if (!view || view.stockTokens === null || view.stockTokens <= 0) return;
		  const anchor = currentAnchor();
		  if (!anchor || document.activeElement !== anchor) return;
		  const target = findDialogRoot();
		  if (!target) return;
		  mounted?.remove();
		  mounted = renderSection(view);
		  target.appendChild(mounted);
		}
		function findDialogRoot() {
		  const dialogs = document.querySelectorAll('[role="dialog"]');
		  for (let i = dialogs.length - 1; i >= 0; i--) {
		    const el = dialogs[i];
		    if (!el || !el.isConnected) continue;
		    if (el.querySelector(`[data-${SECTION_TAG}]`) || el.hasAttribute(`data-${SECTION_TAG}`)) continue;
		    const style = window.getComputedStyle(el);
		    if (style.display === "none" || style.visibility === "hidden") continue;
		    return el;
		  }
		  return null;
		}
		function row(dotColor, label, tokens) {
		  const div = document.createElement("div");
		  div.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px;";
		  const left = document.createElement("span");
		  left.style.cssText = `display:inline-flex;align-items:center;gap:6px;color:var(--dsh-mem-text-2);`;
		  const dot = document.createElement("i");
		  dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${dotColor};display:inline-block;`;
		  left.append(dot, document.createTextNode(label));
		  const right = document.createElement("span");
		  right.textContent = `~${fmtTokens(tokens)}`;
		  right.style.cssText = "font-variant-numeric:tabular-nums;color:var(--dsh-mem-text-1);";
		  div.append(left, right);
		  return div;
		}
		function renderSection(view) {
		  const section = document.createElement("section");
		  section.setAttribute(`data-${SECTION_TAG}`, "");
		  section.style.cssText = [
		    "border-top:1px solid var(--dsh-mem-border)",
		    "margin-top:6px",
		    "padding-top:8px",
		    "font-size:12px",
		    "line-height:1.5"
		  ].join(";");
		  const title = document.createElement("div");
		  title.textContent = "记忆占用";
		  title.style.cssText = "color:var(--dsh-mem-text-2);font-weight:600;margin-bottom:4px;";
		  section.append(title);
		  if (view.recallTokens !== null && view.recallTokens > 0) {
		    section.append(row("var(--dsh-mem-accent)", "召回片段", view.recallTokens));
		  }
		  if (view.profileTokens !== null && view.profileTokens > 0) {
		    section.append(row("var(--dsh-mem-accent)", "记忆稳定区", view.profileTokens));
		  }
		  if (view.mode === "off") {
		    const offNote = document.createElement("div");
		    offNote.textContent = "已停用 · 显示现存残留";
		    offNote.style.cssText = "color:var(--dsh-mem-text-3);padding-top:2px;";
		    section.append(offNote);
		  }
		  return section;
		}
		
		// client/src/pill/ModeSlider.tsx
		var import_react16 = require("react");
		
		// client/src/pill/SessionInfoArea.tsx
		var import_react15 = require("react");
		var import_jsx_runtime15 = require("react/jsx-runtime");
		function sinfoCell(val, label, title) {
		  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { title: title || void 0, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-sinfo-val", children: val }),
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-sinfo-label", children: label })
		  ] });
		}
		function SessionInfoArea(props) {
		  const rpc = props.rpc;
		  const sessionId = props.sessionId;
		  const [stats, setStats] = (0, import_react15.useState)(void 0);
		  const busyRef = (0, import_react15.useRef)(false);
		  (0, import_react15.useEffect)(() => {
		    if (!rpc || !sessionId) return void 0;
		    let alive = true;
		    let timer = null;
		    let seq = 0;
		    const tick = () => {
		      const token = ++seq;
		      rpc("dsh-memory/session-stats", { sessionId }).then((r) => {
		        if (!alive || token !== seq) return;
		        if (r && r.ok && r.value) {
		          if (r.value.supported === false) {
		            setStats(null);
		          } else {
		            const v = r.value;
		            setStats(v);
		            const d = v.distill || {};
		            const g = v.global || {};
		            busyRef.current = (d.pendingSlice || 0) > 0 || (d.parkedSlices || 0) > 0 || (g.pendingTotal || 0) > 0;
		          }
		        }
		      }).catch(() => {
		      }).then(() => {
		        if (alive) timer = setTimeout(tick, busyRef.current ? 2e3 : 5e3);
		      });
		    };
		    tick();
		    return () => {
		      alive = false;
		      if (timer) clearTimeout(timer);
		    };
		  }, [rpc, sessionId]);
		  if (stats === null) return null;
		  if (stats === void 0) {
		    return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-sinfo", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "dsh-mem-sinfo-grid", children: [
		      sinfoCell("…", "召回命中"),
		      sinfoCell("…", "攒批进度"),
		      sinfoCell("…", "本会话记忆"),
		      sinfoCell("…", "会话消息")
		    ] }) });
		  }
		  const rc = stats.recall || {};
		  const di = stats.distill || {};
		  const gl = stats.global || {};
		  const isOff = stats.mode === "off";
		  let rcVal;
		  let rcLabel;
		  let rcTitle;
		  if (rc.enabled === false) {
		    rcVal = "停用";
		    rcLabel = "召回命中";
		    rcTitle = "召回已停用（开关关闭 / 档位关闭 / 部署未启用）";
		  } else {
		    rcVal = (rc.hitTurns || 0) + "/" + (rc.injectedTurns || 0);
		    rcLabel = "召回命中 · " + (rc.totalHits || 0) + " 条";
		    rcTitle = "最近一轮命中 " + (rc.lastHits || 0) + " 条，耗时 " + (rc.lastDurationMs || 0) + "ms" + ((rc.timeouts || 0) > 0 ? "，超时跳过 " + rc.timeouts + " 次" : "");
		  }
		  let dVal;
		  let dLabel;
		  let dTitle;
		  if (isOff) {
		    dVal = String(di.parkedSlices || 0);
		    dLabel = "挂起切片";
		    dTitle = "档位关闭：未蒸馏切片挂起，切回档位后继续";
		  } else {
		    dVal = (di.pendingSlice || 0) + "/" + (di.threshold != null ? di.threshold : "-");
		    dLabel = (di.parkedSlices || 0) > 0 ? "攒批 · 挂起 " + di.parkedSlices : "攒批进度";
		    dTitle = "达到阈值后自动蒸馏（阈值随使用渐进爬坡到稳态）";
		  }
		  const pTitle = di.lastDistillAt ? "最近蒸馏 " + fmtTime(di.lastDistillAt) : "本会话尚未蒸馏";
		  const warn = gl.degraded ? "⚠ 存储不可用，记忆功能已停用" : null;
		  let note = null;
		  if (!gl.degraded) {
		    if (stats.retrieval === "keyword" && !isOff) note = "检索降级：纯关键词（向量不可用）";
		    else if (stats.retrieval === "none") note = "检索不可用（FTS 与向量均失效）";
		  }
		  const ago = fmtAgo(gl.lastExtractAt);
		  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "dsh-mem-sinfo", children: [
		    warn ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-sinfo-warn", children: warn }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "dsh-mem-sinfo-grid", children: [
		      sinfoCell(rcVal, rcLabel, rcTitle),
		      sinfoCell(dVal, dLabel, dTitle),
		      sinfoCell(String(di.producedRecords || 0), "本会话记忆", pTitle),
		      sinfoCell(stats.l0Count != null ? String(stats.l0Count) : "…", "会话消息")
		    ] }),
		    note ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-sinfo-note", children: note }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-sinfo-sum", children: "待蒸馏 " + (gl.pendingTotal || 0) + " · 上次蒸馏 " + (ago || "尚未蒸馏") })
		  ] });
		}
		
		// client/src/pill/ModeSlider.tsx
		var import_jsx_runtime16 = require("react/jsx-runtime");
		function ModeSlider(props) {
		  ensureThemeStyle();
		  const trackRef = (0, import_react16.useRef)(null);
		  const [drag, setDrag] = (0, import_react16.useState)(null);
		  const canvasRef = (0, import_react16.useRef)(null);
		  const geoRef = (0, import_react16.useRef)(null);
		  const clampX = (x) => {
		    if (x < 0) return 0;
		    if (x > INNER_W) return INNER_W;
		    return x;
		  };
		  const xFromClientX = (clientX) => {
		    const rect = trackRef.current.getBoundingClientRect();
		    return clampX(clientX - rect.left - THUMB / 2);
		  };
		  const onPointerDown = (e) => {
		    e.preventDefault();
		    e.currentTarget.setPointerCapture(e.pointerId);
		    setDrag({ x: xFromClientX(e.clientX), lastX: e.clientX, t: e.timeStamp, v: 0 });
		  };
		  const onPointerMove = (e) => {
		    if (drag === null) return;
		    const dt = e.timeStamp - drag.t;
		    const instV = dt > 0 ? (e.clientX - drag.lastX) / dt : drag.v;
		    setDrag({
		      x: xFromClientX(e.clientX),
		      lastX: e.clientX,
		      t: e.timeStamp,
		      v: drag.v * 0.7 + instV * 0.3
		      // EMA：瞬时抖动不放大，松手投影用
		    });
		  };
		  const onPointerUp = (e) => {
		    if (drag === null) return;
		    const projected = xFromClientX(e.clientX) + Math.max(-30, Math.min(30, drag.v * 120));
		    const idx = Math.round(clampX(projected) / INNER_W * (MODES.length - 1));
		    setDrag(null);
		    props.onCommit(MODES[idx].key);
		  };
		  const thumbLeft = drag !== null ? drag.x : modeIndex(props.mode) / (MODES.length - 1) * INNER_W;
		  const activeIdx = Math.min(MODES.length - 1, Math.max(0, Math.round(thumbLeft / INNER_W * (MODES.length - 1))));
		  const info = MODES[activeIdx];
		  geoRef.current = {
		    origin: thumbLeft + THUMB / 2,
		    // 密度/亮度中心 = 圆球中心
		    rightEdge: thumbLeft + THUMB,
		    // 粒子活动区右界 = 填充右缘（不越过圆球）
		    tier: activeIdx,
		    // 场强档位（与填充/气泡同源；拖拽预览即时升降级）
		    show: activeIdx > 0 || drag !== null,
		    // 与填充显隐同源
		    dragging: drag !== null
		  };
		  (0, import_react16.useEffect)(() => {
		    const canvas = canvasRef.current;
		    if (!canvas) return void 0;
		    const ctx = canvas.getContext && canvas.getContext("2d");
		    if (!ctx) return void 0;
		    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
		    let width = 1;
		    let height = 1;
		    let frame = 0;
		    let grid = [];
		    let cell = 5;
		    const gap = 1.1;
		    let fieldOn = false;
		    let fieldStart = 0;
		    let lastDrawn = 0;
		    const resize = () => {
		      const b = canvas.getBoundingClientRect();
		      const ratio = Math.min(window.devicePixelRatio || 1, 2);
		      width = Math.max(1, b.width);
		      height = Math.max(1, b.height);
		      canvas.width = Math.max(1, Math.round(width * ratio));
		      canvas.height = Math.max(1, Math.round(height * ratio));
		      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		      cell = width < 280 ? 5 : 6;
		      grid = [];
		      for (let row2 = 0; row2 * cell < height; row2++) {
		        for (let column = 0; column * cell < width; column++) {
		          grid.push({
		            x: column * cell,
		            y: row2 * cell,
		            base: Math.abs(Math.sin(column * 12.9898 + row2 * 78.233) * 43758.5453) % 1,
		            tempo: Math.abs(Math.sin(column * 7.13 + row2 * 19.41) * 19341.731) % 1,
		            phase: Math.abs(Math.sin(column * 31.17 + row2 * 11.93) * 28437.123) % 1
		          });
		        }
		      }
		    };
		    const draw = (time) => {
		      const st = geoRef.current || { origin: 0, rightEdge: 0, tier: 0, show: false, dragging: false };
		      ctx.clearRect(0, 0, width, height);
		      if (!st.show || st.rightEdge <= 0) {
		        fieldOn = false;
		        return;
		      }
		      if (!fieldOn) {
		        fieldOn = true;
		        fieldStart = time;
		      }
		      const dark = document.body.hasAttribute("data-ds-dark-theme");
		      const tier = FIELD_TIERS[st.tier] || FIELD_TIERS[1];
		      const elapsed = Math.max(0, time - fieldStart);
		      const reveal = reduced.matches ? 1 : smStep(0, 1, elapsed / 900);
		      const ripplePhase = elapsed % 1200 / 1200;
		      const tempo = tier.tempo * (st.dragging ? 2 : 1);
		      const dim = dark ? [124, 144, 250] : [61, 91, 224];
		      const hot = dark ? [214, 224, 255] : [126, 148, 250];
		      ctx.save();
		      ctx.beginPath();
		      if (ctx.roundRect) ctx.roundRect(0, 0, st.rightEdge, height, height / 2);
		      else ctx.rect(0, 0, st.rightEdge, height);
		      ctx.clip();
		      for (let i = 0; i < grid.length; i++) {
		        const c = grid[i];
		        const dx = Math.abs(c.x + cell * 0.5 - st.origin) / Math.max(1, st.rightEdge * 0.5);
		        if (dx > 1) continue;
		        const near = Math.min(1, Math.max(0, 1 - dx * 1.1));
		        if (c.base > tier.density - near * 0.3) continue;
		        const flicker = 0.5 + 0.5 * Math.sin(elapsed * 0.012 * tempo + c.tempo * 6.283 + c.phase * 6.283);
		        const wave = tier.wave ? 0.5 + 0.5 * Math.sin((dx * 2 - ripplePhase) * 6.283) : 0.62;
		        const revealA = smStep(0, 1, reveal * (1 - dx * 0.85) + dx * 0.15);
		        const alpha = Math.min(1, (0.26 + 0.44 * flicker + near * 0.28) * (0.28 + 0.72 * wave) * revealA * tier.alpha);
		        if (alpha < 0.02) continue;
		        const glowMix = Math.max(0, flicker * wave - 0.45) * 1.6;
		        ctx.fillStyle = "rgba(" + Math.round(dim[0] + (hot[0] - dim[0]) * glowMix) + "," + Math.round(dim[1] + (hot[1] - dim[1]) * glowMix) + "," + Math.round(dim[2] + (hot[2] - dim[2]) * glowMix) + "," + alpha.toFixed(3) + ")";
		        ctx.fillRect(c.x + gap * 0.5, c.y + gap * 0.5, cell - gap, cell - gap);
		      }
		      ctx.restore();
		    };
		    const loop = (time) => {
		      if (time - lastDrawn >= 33) {
		        lastDrawn = time;
		        draw(time);
		      }
		      frame = window.requestAnimationFrame(loop);
		    };
		    const redrawStatic = () => {
		      if (reduced.matches) draw(performance.now());
		    };
		    const ro = new ResizeObserver(() => {
		      resize();
		      redrawStatic();
		    });
		    const themeObs = new MutationObserver(() => {
		      redrawStatic();
		    });
		    ro.observe(canvas);
		    themeObs.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
		    resize();
		    draw(performance.now());
		    if (!reduced.matches) frame = window.requestAnimationFrame(loop);
		    return () => {
		      window.cancelAnimationFrame(frame);
		      ro.disconnect();
		      themeObs.disconnect();
		    };
		  }, []);
		  const stops = [];
		  for (let i = 0; i < MODES.length; i++) {
		    const stopLeft = i / (MODES.length - 1) * INNER_W + THUMB / 2;
		    stops.push(
		      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
		        "div",
		        {
		          style: {
		            position: "absolute",
		            left: stopLeft - 3,
		            top: (RAIL_H - 6) / 2,
		            width: 6,
		            height: 6,
		            borderRadius: "50%",
		            background: "var(--dsh-mem-dot)",
		            zIndex: 2,
		            pointerEvents: "none"
		          }
		        },
		        "stop" + i
		      )
		    );
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
		    "div",
		    {
		      style: {
		        position: "absolute",
		        bottom: "calc(100% + 8px)",
		        left: "50%",
		        transform: "translateX(-50%)",
		        zIndex: 1e3
		      },
		      children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(
		        "div",
		        {
		          className: "dsh-mem-popover",
		          style: { position: "relative", padding: "14px 16px" },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(
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
		                  cursor: drag === null ? "pointer" : "grabbing"
		                },
		                onPointerDown,
		                onPointerMove,
		                onPointerUp,
		                onPointerCancel: onPointerUp,
		                children: [
		                  activeIdx > 0 || drag !== null ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
		                    "div",
		                    {
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
		                        transition: drag === null ? "width 120ms ease" : "none"
		                      }
		                    }
		                  ) : null,
		                  stops,
		                  /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
		                    "canvas",
		                    {
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
		                        filter: drag !== null ? "saturate(1.45) brightness(1.28) contrast(1.06)" : "none"
		                      }
		                    }
		                  ),
		                  /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
		                    "div",
		                    {
		                      style: {
		                        position: "absolute",
		                        left: thumbLeft,
		                        top: (RAIL_H - THUMB) / 2,
		                        width: THUMB,
		                        height: THUMB,
		                        borderRadius: "50%",
		                        background: "var(--dsh-mem-thumb)",
		                        border: "1px solid var(--dsh-mem-accent)",
		                        boxShadow: drag !== null ? "0 2px 8px rgba(0,0,0,0.35)" : "0 1px 4px rgba(0,0,0,0.25)",
		                        pointerEvents: "none",
		                        transition: drag === null ? "left 120ms ease" : "none",
		                        zIndex: 3
		                      }
		                    }
		                  ),
		                  drag !== null ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dsh-mem-bubble", style: { left: thumbLeft + THUMB / 2, zIndex: 4 }, children: info.label }) : null
		                ]
		              }
		            ),
		            props.error ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { style: { fontSize: 11, color: "var(--dsh-mem-danger)", marginTop: 10, whiteSpace: "nowrap" }, children: props.error }) : null,
		            props.rpc && props.sessionId ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(SessionInfoArea, { rpc: props.rpc, sessionId: props.sessionId }) : null
		          ]
		        }
		      )
		    }
		  );
		}
		
		// client/src/pill/MemoryModePill.tsx
		var import_jsx_runtime17 = require("react/jsx-runtime");
		function MemoryModePill(props) {
		  const rpc = props.rpc;
		  const sessionId = props.sessionId || props.session && props.session.sessionId;
		  const [mode, setMode] = (0, import_react17.useState)(null);
		  const [error, setError] = (0, import_react17.useState)(null);
		  const [open, setOpen] = (0, import_react17.useState)(false);
		  const wrapRef = (0, import_react17.useRef)(null);
		  const seqRef = (0, import_react17.useRef)(0);
		  const load = (0, import_react17.useCallback)(() => {
		    if (!sessionId || !rpc) return;
		    const token = ++seqRef.current;
		    setError(null);
		    rpc("dsh-memory/session-mode-get", { sessionId }).then((r) => {
		      if (token !== seqRef.current) return;
		      if (r && r.ok && r.value) setMode(r.value.mode);
		      else setError(r && !r.ok ? r.error.message : "RPC error");
		    }).catch((e) => {
		      if (token !== seqRef.current) return;
		      setError(String(e && e.message || e));
		    });
		  }, [sessionId, rpc]);
		  (0, import_react17.useEffect)(() => {
		    load();
		  }, [load]);
		  (0, import_react17.useEffect)(() => {
		    watchSidebarIcon();
		  }, []);
		  (0, import_react17.useEffect)(() => {
		    initOccupancyIndicator(
		      (endpoint, payload) => rpc(endpoint, payload)
		    );
		    initPanelSection(currentMeterSnapshot);
		    watchContextMeter();
		    noteOccupancySession(sessionId ?? null);
		  }, [sessionId, rpc]);
		  (0, import_react17.useEffect)(() => {
		    if (!open) return;
		    const onDown = (e) => {
		      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
		    };
		    const onKey = (e) => {
		      if (e.key === "Escape") setOpen(false);
		    };
		    document.addEventListener("mousedown", onDown);
		    document.addEventListener("keydown", onKey);
		    return () => {
		      document.removeEventListener("mousedown", onDown);
		      document.removeEventListener("keydown", onKey);
		    };
		  }, [open]);
		  const commit = (next) => {
		    if (!rpc || next === mode) return;
		    const prev = mode;
		    setMode(next);
		    setError(null);
		    rpc("dsh-memory/session-mode-set", { sessionId, mode: next }).then((r) => {
		      if (!r || !r.ok) {
		        setMode(prev);
		        setError(r && r.error ? "档位写入失败：" + r.error.message : "档位写入失败");
		      }
		    }).catch((e) => {
		      setMode(prev);
		      setError("档位写入失败：" + String(e && e.message || e));
		    });
		  };
		  if (!sessionId || !rpc) return null;
		  const info = modeInfo(mode);
		  const loaded = mode !== null;
		  const isOff = loaded && mode === "off";
		  const isFlow = loaded && !isOff;
		  ensureThemeStyle();
		  const pillStyle = {
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
		    color: isFlow ? info.color : "var(--dsh-mem-text-2)"
		  };
		  if (isFlow) {
		    pillStyle.boxShadow = "0 0 12px color-mix(in srgb, " + info.color + " 30%, transparent)";
		    pillStyle["--dsh-mem-pill-tint"] = info.color;
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { ref: wrapRef, style: { position: "relative", display: "inline-flex" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
		      "button",
		      {
		        type: "button",
		        title: error ? "档位读取失败：" + error + "（点击重试）" : "本会话记忆档位（点击切换）",
		        onClick: () => {
		          if (error) load();
		          setOpen(!open);
		        },
		        className: isFlow ? "dsh-mem-flow" : "dsh-mem-pill-off",
		        style: pillStyle,
		        children: [
		          "记忆 · ",
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: loaded ? info.label : error ? "⚠" : "…" })
		        ]
		      }
		    ),
		    open ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(ModeSlider, { mode: mode || "auto", onCommit: commit, error, rpc, sessionId }) : null
		  ] });
		}
		
		// client/src/entry.tsx
		var inject = ["slots", "connection"];
		function apply(ctx) {
		  const rpc = makeRpc(ctx);
		  ctx.slots.inject("settings.section", () => {
		    return ctx.slots.register(
		      {
		        name: "settings.section",
		        id: "dsh-memory",
		        order: 200,
		        label: "记忆",
		        inject: () => ({ rpc })
		      },
		      MemoryPanel
		    );
		  });
		  ctx.slots.inject("conversation.input.left", () => {
		    return ctx.slots.register(
		      {
		        name: "conversation.input.left",
		        id: "dsh-memory-mode",
		        order: 100,
		        inject: (sessionId) => ({ sessionId, rpc })
		      },
		      MemoryModePill
		    );
		  });
		}
		
		// esbuild 对具名导出会整体替换 module.exports（__toCommonJS：getter + __esModule）；
		// 摊平回官方 bundle 同款的普通数据属性对象（含 toStringTag），loader 只按属性读取。
		var __flat = {};
		for (var __k in module.exports) __flat[__k] = module.exports[__k];
		Object.defineProperty(__flat, Symbol.toStringTag, { value: "Module" });
		return __flat;
	}
});
