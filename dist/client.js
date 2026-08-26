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
		var import_react13 = require("react");
		
		// client/src/sidebar-icon.ts
		var BOOK_ICON_SVG = '<svg data-mem-icon="1" viewBox="0 0 16 16" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0"><path d="M8 3.4C6.6 2.5 4.6 2.4 2.9 3.1v9.3c1.7-.7 3.7-.6 5.1.3 1.4-.9 3.4-1 5.1-.3V3.1C11.4 2.4 9.4 2.5 8 3.4Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 3.4v9.3" stroke="currentColor" stroke-width="1.2"/></svg>';
		function patchSidebarIcon() {
		  try {
		    const buttons = document.querySelectorAll("button");
		    for (let i = 0; i < buttons.length; i++) {
		      const b = buttons[i];
		      const span = b.querySelector("span");
		      const svg = b.querySelector("svg");
		      if (span && svg && span.textContent && span.textContent.trim() === "\u8BB0\u5FC6" && svg.getAttribute("data-mem-icon") !== "1") {
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
		    ".dsh-mem-flow:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset:  1px; }",
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
		  if (P && P.Modal) return (0, import_react.createElement)(P.Modal, { closeLabel: "\u5173\u95ED", ...props });
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
		var RANGE_LABELS = { day: "\u4ECA\u65E5", week: "\u672C\u5468", month: "\u672C\u6708", all: "\u7D2F\u8BA1" };
		var LAYER_OPTS = [
		  { key: "", label: "\u5168\u90E8" },
		  { key: "l1", label: "L1" },
		  { key: "l2", label: "L2" },
		  { key: "l3", label: "L3" }
		];
		var GRAN_OPTS = [
		  { key: "day", label: "\u65E5" },
		  { key: "week", label: "\u5468" },
		  { key: "month", label: "\u6708" }
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
		      if (g === "month") return d.getMonth() + 1 + "\u6708";
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
		    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { children: w ? fmtInt(pick(w)) : "0" }, r);
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
		          children: rangeDays > 0 ? "\u8FD1 " + rangeDays + " \u5929" : "\u8FD1N\u5929"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(NButton, { onClick: load, children: "\u5237\u65B0" })
		    ] }),
		    rangeOpen ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.muted, children: "\u5C55\u793A\u8FD1 N \u5929\uFF08\u6B63\u6574\u6570\uFF0C\u6E05\u7A7A=\u9ED8\u8BA4\u7A97\u53E3\uFF1B\u8D85\u51FA\u4FDD\u7559\u671F\u540E\u7AEF\u81EA\u52A8\u56DE\u9000\uFF09" }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        NInput,
		        {
		          value: rangeDays === 0 ? "" : String(rangeDays),
		          placeholder: "\u5982 30",
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
		    error ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.error, children: "\u6210\u672C\u8BFB\u53D6\u5931\u8D25\uFF1A" + error }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "\u6210\u672C\u8D8B\u52BF\uFF08\u6309\u6A21\u578B\uFF09" }),
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
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: S.muted, children: data ? "\u6682\u65E0\u6210\u672C\u6570\u636E\uFF08\u89E6\u53D1\u4E00\u6B21\u84B8\u998F\u540E\u8FD9\u91CC\u4F1A\u51FA\u73B0\u8D8B\u52BF\uFF09\u3002" : "\u52A0\u8F7D\u4E2D\u2026" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "\u5C42\u7EA7\u6210\u672C\uFF08\u8F93\u51FA token\uFF09" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: thFirst, children: "\u5C42\u7EA7" }),
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
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "\u5C42\u7EA7\u6210\u672C\uFF08\u5355\u6B21 avg\uFF09" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: thFirst, children: "\u5C42\u7EA7" }),
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
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "\u5C42\u7EA7\u6210\u672C\uFF08\u5355\u6B21 median\uFF09" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { style: thFirst, children: "\u5C42\u7EA7" }),
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
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "\u65F6\u95F4\u7A97\u53E3\u603B\u89C8" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.statGrid, children: windows.map((w) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-mem-card", style: S.statTile, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.statNum, children: fmtInt(w.outputTokens + w.reasoningTokens) }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.statLabel, children: RANGE_LABELS[w.range] + " \xB7 \u603B\u8F93\u51FA token" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.muted, children: "\u6587\u5B57 " + fmtInt(w.outputTokens) + " \xB7 \u601D\u8003 " + fmtInt(w.reasoningTokens) + " \xB7 " + w.calls + " \u6B21\u8C03\u7528" })
		      ] }, w.range);
		    }) }),
		    byModel.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.panelLabel, children: "\u6309\u6A21\u578B\uFF08\u7D2F\u8BA1\uFF09" }),
		      byModel.map((m) => {
		        const label = fmtModel(m.provider, m.model);
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.infoRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.infoKey, children: label }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.infoVal, children: m.calls + " \u6B21 \xB7 \u8F93\u51FA " + fmtInt(m.outputTokens) + " \xB7 \u601D\u8003 " + fmtInt(m.reasoningTokens) })
		        ] }, "m-" + label);
		      })
		    ] }) : null,
		    data ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: S.hint, children: "\u8F93\u5165\u6309\u5B57\u7B26\u3001\u8F93\u51FA/\u601D\u8003\u6309 token \u8BA1\uFF1B\u8D8B\u52BF\u56FE Y \u8F74\u4E3A\u8F93\u51FA token\uFF0C\u4E0A\u65B9\u53EF\u5207\u6362\u5C42\u7EA7\u4E0E\u9897\u7C92\u5EA6\u3002" }) : null
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
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.muted, children: error ? "\u52A0\u8F7D\u5931\u8D25" : lines === null ? "\u52A0\u8F7D\u4E2D\u2026" : "\u6700\u8FD1 " + lines.length + " \u884C\uFF08memory.log\uFF09" }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(NButton, { onClick: load, children: "\u5237\u65B0" })
		    ] }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.error, marginBottom: 10 }, children: "\u65E5\u5FD7\u8BFB\u53D6\u5931\u8D25\uFF1A" + error + "\uFF08\u70B9\u53F3\u4E0A\u201C\u5237\u65B0\u201D\u91CD\u8BD5\uFF09" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { style: S.pre, ref: preRef, children: (lines || []).join("\n") || "(\u6682\u65E0\u65E5\u5FD7)" })
		  ] });
		}
		
		// client/src/tabs/OverviewTab.tsx
		var import_react9 = require("react");
		
		// client/src/format.ts
		var TYPE_LABELS = {
		  persona: "\u753B\u50CF\u504F\u597D",
		  episodic: "\u5BA2\u89C2\u4E8B\u4EF6",
		  instruction: "\u5168\u5C40\u6307\u4EE4",
		  work_fact: "\u5DE5\u4F5C\u4E8B\u5B9E",
		  work_task: "\u5DE5\u4F5C\u4EFB\u52A1",
		  work_method: "\u5DE5\u4F5C\u65B9\u6CD5",
		  work_artifact: "\u5DE5\u4F5C\u8D44\u4EA7"
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
		    if (s < 45) return "\u521A\u521A";
		    if (s < 3600) return Math.floor(s / 60) + " \u5206\u949F\u524D";
		    if (s < 86400) return Math.floor(s / 3600) + " \u5C0F\u65F6\u524D";
		    return Math.floor(s / 86400) + " \u5929\u524D";
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
		  { key: "off", label: "\u5173\u95ED", color: "var(--dsh-mem-text-2)" },
		  { key: "chat", label: "\u65E5\u5E38", color: "var(--dsh-mem-mode-chat)" },
		  { key: "work", label: "\u5DE5\u4F5C", color: "var(--dsh-mem-mode-work)" },
		  { key: "auto", label: "\u667A\u80FD", color: "var(--dsh-mem-mode-auto)" }
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
		  if (key === "auto") return "\u667A\u80FD\uFF08\u53CC\u65CF\uFF09";
		  if (key === "chat") return "\u65E5\u5E38\uFF08\u4E2A\u4EBA\uFF09";
		  if (key === "work") return "\u5DE5\u4F5C\uFF08\u56E2\u961F\uFF09";
		  return "\u5173\u95ED";
		}
		function modeIndex(key) {
		  for (let i = 0; i < MODES.length; i++) if (MODES[i].key === key) return i;
		  return 3;
		}
		
		// client/src/tabs/BudgetInputs.tsx
		var import_react4 = require("react");
		var import_jsx_runtime4 = require("react/jsx-runtime");
		var LAYERS = [
		  ["extract", "\u62BD\u53D6"],
		  ["dedup", "\u53BB\u91CD"],
		  ["l2", "L2 \u573A\u666F"],
		  ["l3", "L3 \u753B\u50CF"]
		];
		function BudgetInputs(props) {
		  const rpc = props.rpc;
		  const disabled = !!props.disabled;
		  const data = props.data;
		  const setData = props.setData;
		  const onError = props.onError;
		  const layers = LAYERS;
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
		          key === "input" ? "\u8F93\u5165\u9884\u7B97\u987B\u4E3A 0 \u6216 1000~1000000 \u7684\u6574\u6570\uFF08\u7559\u7A7A\u6216 0 = \u8DDF\u968F\u914D\u7F6E\uFF09" : "\u8F93\u51FA\u9884\u7B97\u987B\u4E3A 0~1000000 \u7684\u6574\u6570\uFF08\u7559\u7A7A\u6216 0 = \u8DDF\u968F\u9ED8\u8BA4\uFF09"
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
		        onError(r && r.error ? "\u9884\u7B97\u5199\u5165\u5931\u8D25\uFF1A" + r.error.message : "\u9884\u7B97\u5199\u5165\u5931\u8D25");
		      } else {
		        onError(null);
		      }
		    }).catch((e) => {
		      setData(prev);
		      onError("\u9884\u7B97\u5199\u5165\u5931\u8D25\uFF1A" + String(e && e.message || e));
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
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: S.switchRow, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { ...S.flexRow, gap: 6 }, children: layers.map((l) => {
		        return inputBox(
		          l[0],
		          l[1],
		          l[1] + " \u8F93\u51FA\u9884\u7B97\uFF08token\uFF0C\u7559\u7A7A = \u9ED8\u8BA4 " + (def[l[0]] || "?") + "\uFF09",
		          92,
		          def[l[0]],
		          commitOutputs
		        );
		      }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: S.switchLabel, children: "\u8F93\u51FA\u9884\u7B97" }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: S.switchDesc, children: "\u5404\u84B8\u998F\u5C42\u5355\u6B21\u8F93\u51FA\u7684 token \u4E0A\u9650\uFF08\u62BD\u53D6/\u53BB\u91CD/L2/L3\uFF09\uFF1B\u7559\u7A7A\u6216 0 = \u8DDF\u968F\u9ED8\u8BA4\uFF08\u5F53\u524D\u751F\u6548 " + layers.map((l) => eff[l[0]] || "?").join(" / ") + "\uFF09\uFF1B\u601D\u8003\u6863 high/xhigh/max \u65F6\u5B9E\u9645\u9650\u989D\u81EA\u52A8 \xD74" })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: S.switchRow, children: [
		      inputBox(
		        "input",
		        "\u8F93\u5165",
		        "\u5355\u6B21\u84B8\u998F\u8F93\u5165\u5B57\u7B26\u4E0A\u9650\uFF08\u2248token\uFF0C\u4E2D\u6587 1 \u5B57\u22481 token\uFF1B\u7559\u7A7A = \u8DDF\u968F\u914D\u7F6E " + (ib.fallback || "?") + "\uFF09",
		        120,
		        ib.fallback,
		        commitInput
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: S.switchLabel, children: "\u8F93\u5165\u9884\u7B97" }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: S.switchDesc, children: "\u5355\u6B21\u84B8\u998F\u8C03\u7528\u7684\u8F93\u5165\u5B57\u7B26\u4E0A\u9650\uFF08\u2248token\uFF09\uFF1AL1 \u62BD\u53D6\u6309\u6B64\u5206\u5757\u3001L2/L3 \u8D85\u9650\u622A\u65AD\uFF1B\u7559\u7A7A\u6216 0 = \u8DDF\u968F\u914D\u7F6E\uFF08\u5F53\u524D\u751F\u6548 " + (effIn || "?") + "\uFF0C\u6765\u81EA llm.maxInputChars\uFF09" })
		      ] })
		    ] })
		  ] });
		}
		
		// client/src/tabs/EmbeddingSection.tsx
		var import_react5 = require("react");
		
		// client/src/rpc.ts
		function makeRpc(ctx) {
		  return (endpoint, payload) => {
		    if (!ctx.connection) return Promise.reject(new Error("connection \u670D\u52A1\u4E0D\u53EF\u7528"));
		    return ctx.connection.rpc.call("/rpc", endpoint, payload ?? {});
		  };
		}
		function asLoose(rpc) {
		  return rpc;
		}
		
		// client/src/tabs/EmbeddingSection.tsx
		var import_jsx_runtime5 = require("react/jsx-runtime");
		function EmbeddingSection(props) {
		  const rpc = props.rpc;
		  const loose = asLoose(rpc);
		  const [st, setSt] = (0, import_react5.useState)(null);
		  const [err, setErr] = (0, import_react5.useState)(null);
		  const busyPollRef = (0, import_react5.useRef)(null);
		  const load = (0, import_react5.useCallback)(() => {
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
		  (0, import_react5.useEffect)(() => {
		    load();
		  }, [load]);
		  (0, import_react5.useEffect)(() => {
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
		      if (!r || !r.ok) setErr(r && r.error ? r.error.message : "\u64CD\u4F5C\u5931\u8D25");
		      else {
		        setErr(null);
		        load();
		      }
		    }).catch((e) => {
		      setErr(String(e && e.message || e));
		    });
		  };
		  if (err === "__unsupported__") {
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-mem-rb-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontWeight: 600, marginBottom: 4 }, children: "\u8BED\u4E49\u68C0\u7D22\uFF08\u5D4C\u5165\uFF09" }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-muted", children: "\u5B58\u50A8\u5904\u4E8E\u964D\u7EA7\u72B6\u6001\uFF0C\u5D4C\u5165\u7BA1\u7406\u4E0D\u53EF\u7528\u3002" })
		    ] });
		  }
		  if (!st) {
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-mem-rb-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-muted", children: err ? "\u5D4C\u5165\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF1A" + err : "\u5D4C\u5165\u72B6\u6001\u8BFB\u53D6\u4E2D\u2026" }),
		      err ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NButton, { style: { marginTop: 8 }, onClick: load, children: "\u91CD\u8BD5" }) : null
		    ] });
		  }
		  const switchConfirm = "\u5207\u6362\u5D4C\u5165\u6E90\u540E\u5C06\u6309\u65B0\u6A21\u578B\u91CD\u5EFA\u5411\u91CF\u7D22\u5F15\uFF08\u671F\u95F4\u8BED\u4E49\u68C0\u7D22\u6682\u9000\u5316\u4E3A\u5173\u952E\u8BCD\u5339\u914D\uFF0C\u4E0D\u5F71\u54CD\u5BF9\u8BDD\uFF09\u3002\u786E\u5B9A\u5207\u6362\uFF1F";
		  const onSource = (key) => {
		    if (key === "local") {
		      const ready = [];
		      for (let i = 0; i < st.models.length; i++) if (st.models[i].state === "downloaded") ready.push(st.models[i].id);
		      if (ready.length === 0) {
		        setErr("\u8BF7\u5148\u5728\u4E0B\u65B9\u4E0B\u8F7D\u4E00\u4E2A\u672C\u5730\u5D4C\u5165\u6A21\u578B\uFF0C\u518D\u5207\u6362\u5230\u672C\u5730\u6863\u3002");
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
		    runtimeRow = /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 8, fontSize: 12 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.flexRow, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u5B89\u88C5\u63A8\u7406\u8FD0\u884C\u65F6\u4E2D\u2026 \u5DF2\u8017\u65F6 " + Math.round(rt.elapsedMs / 1e3) + "s\uFF08\u7EA6 100~200MB\uFF0C\u89C6\u7F51\u7EDC\uFF09" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.grow }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NButton, { onClick: () => call("dsh-memory/embedding-runtime-cancel", {}), children: "\u53D6\u6D88" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("pre", { style: { ...S.pre, maxHeight: 68, marginTop: 6, fontSize: 11, opacity: 0.85 }, children: (rt.lastLines || []).join("\n") || "\u7B49\u5F85 npm \u8F93\u51FA\u2026" })
		    ] });
		  } else if (rt.phase === "error") {
		    runtimeRow = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: "\u8FD0\u884C\u65F6\u5B89\u88C5\u5931\u8D25\uFF1A" + (rt.error || "\u672A\u77E5") + "\uFF08\u91CD\u65B0\u5207\u6362\u5D4C\u5165\u6E90\u53EF\u91CD\u8BD5\uFF09" });
		  } else if (rt.phase === "ready") {
		    runtimeRow = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: "\u63A8\u7406\u8FD0\u884C\u65F6\u5C31\u7EEA\uFF08transformers.js v" + rt.installedVersion + "\uFF09" });
		  } else if (st.source === "local") {
		    runtimeRow = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: "\u9996\u6B21\u542F\u7528\u672C\u5730\u5D4C\u5165\u65F6\u4F1A\u81EA\u52A8\u5B89\u88C5\u63A8\u7406\u8FD0\u884C\u65F6\uFF08\u7EA6 100~200MB\uFF09\u3002" });
		  }
		  let applyRow = null;
		  if (ap.phase === "warming") {
		    applyRow = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: "\u52A0\u8F7D\u5D4C\u5165\u6A21\u578B\u4E2D\u2026\uFF08\u9996\u6B21\u9700\u6570\u79D2\uFF09" });
		  } else if (ap.phase === "switching") {
		    applyRow = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: "\u5207\u6362\u5D4C\u5165\u6E90\u4E2D\u2026" });
		  } else if (ap.phase === "error") {
		    applyRow = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: "\u5207\u6362\u5931\u8D25\uFF1A" + ap.message + "\uFF08\u5DF2\u4FDD\u5B58\u7684\u5D4C\u5165\u6E90\u4E0D\u53D8\uFF0C\u91CD\u542F\u540E\u4ECD\u6309\u539F\u6E90\u8FD0\u884C\uFF09" });
		  } else if (st.reindex && st.reindex.running) {
		    const rj = st.reindex;
		    const rDone = rj.l1Done + rj.l0Done;
		    const rTotal = rj.l1Total + rj.l0Total;
		    const rPct = rTotal > 0 ? Math.round(rDone / rTotal * 100) : 0;
		    applyRow = /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 8 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.flexRow, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-mem-rb-muted", children: "\u91CD\u5D4C\u5165\u4E2D L1 " + rj.l1Done + "/" + rj.l1Total + " \xB7 L0 " + rj.l0Done + "/" + rj.l0Total + "\uFF08" + rPct + "%\uFF09" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.grow }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NButton, { onClick: () => call("dsh-memory/embedding-reindex-cancel", {}), children: "\u53D6\u6D88" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...S.flexRow, marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-bar", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-fill", style: { width: rPct + "%" } }) }) })
		    ] });
		  }
		  const modelCards = st.models.map((m) => {
		    const isActive = st.source === "local" && st.activeModel === m.id;
		    const mDl = dlActive && dl.modelId === m.id;
		    const pct = mDl && dl.overallTotal > 0 ? Math.round(dl.overallReceived / dl.overallTotal * 100) : 0;
		    let action = null;
		    if (mDl) {
		      action = /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { flex: 1, minWidth: 200 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.flexRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-mem-rb-muted", style: { whiteSpace: "nowrap" }, children: (dl.phase === "verifying" ? "\u6821\u9A8C\u4E2D " : "") + fmtMB(dl.overallReceived) + " / " + fmtMB(dl.overallTotal) + "\uFF08\u6587\u4EF6 " + dl.fileIndex + "/" + dl.fileCount + "\uFF0C" + pct + "%" + (dl.speedBps > 0 && dl.phase === "downloading" ? "\uFF0C" + fmtMB(dl.speedBps) + "/s" : "") + "\uFF09" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.grow }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NButton, { onClick: () => call("dsh-memory/embedding-download-cancel", {}), children: "\u53D6\u6D88" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...S.flexRow, marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-bar", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-fill", style: { width: pct + "%" } }) }) })
		      ] });
		    } else if (isActive) {
		      action = /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.flexRow, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-mem-tag dsh-mem-tag-work-task", children: "\u4F7F\u7528\u4E2D" }),
		        localInfo && localInfo.state === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-mem-rb-muted", children: "\u6A21\u578B\u52A0\u8F7D\u4E2D\u2026" }) : null,
		        localInfo && localInfo.state === "failed" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 12, color: "var(--dsh-mem-danger)" }, children: "\u52A0\u8F7D\u5931\u8D25\uFF1A" + (localInfo.error || "") }) : null,
		        localInfo && localInfo.state === "ready" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-mem-rb-muted", children: "\u5DF2\u5C31\u7EEA" }) : null
		      ] });
		    } else if (m.state === "downloaded") {
		      action = /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.flexRow, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		          NButton,
		          {
		            disabled: ap.busy,
		            onClick: () => call("dsh-memory/embedding-source-set", { source: "local", activeModel: m.id }, switchConfirm),
		            children: "\u542F\u7528"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		          NButton,
		          {
		            disabled: dlActive,
		            onClick: () => call("dsh-memory/embedding-model-delete", { modelId: m.id }, "\u5220\u9664\u5DF2\u4E0B\u8F7D\u7684 " + m.name + "\uFF08" + fmtMB(m.totalBytes) + "\uFF09\uFF1F"),
		            children: "\u5220\u9664"
		          }
		        )
		      ] });
		    } else {
		      action = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		        NButton,
		        {
		          disabled: dlActive || !st.ceilings.local,
		          title: !st.ceilings.local ? "\u90E8\u7F72\u5DF2\u7981\u7528\u672C\u5730\u5D4C\u5165\u6A21\u578B" : "",
		          onClick: () => call("dsh-memory/embedding-download-start", { modelId: m.id }),
		          children: (m.state === "partial" ? "\u7EE7\u7EED\u4E0B\u8F7D " : "\u4E0B\u8F7D ") + fmtMB(m.totalBytes)
		        }
		      );
		    }
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
		      "div",
		      {
		        style: { ...S.flexRow, padding: "8px 0", borderBottom: "1px solid var(--dsh-mem-border)", flexWrap: "wrap" },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { minWidth: 150 }, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontWeight: 600 }, children: m.name }),
		            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-muted", children: m.tags.join(" \xB7 ") + " \xB7 " + m.dims + " \u7EF4 \xB7 \u4E0A\u4E0B\u6587 " + m.contextTokens })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { flex: 1, minWidth: 180, fontSize: 12, color: "var(--dsh-mem-text-2)" }, children: m.description }),
		          action
		        ]
		      },
		      m.id
		    );
		  });
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-mem-rb-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.flexRow, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontWeight: 600, whiteSpace: "nowrap" }, children: "\u8BED\u4E49\u68C0\u7D22\uFF08\u5D4C\u5165\u6E90\uFF09" }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		        Segmented,
		        {
		          value: st.source,
		          options: [
		            { key: "off", label: "\u5173\u95ED" },
		            { key: "local", label: "\u672C\u5730", disabled: !st.ceilings.local, disabledTitle: "\u90E8\u7F72\u5DF2\u7981\u7528\u672C\u5730\u5D4C\u5165\u6A21\u578B" },
		            { key: "remote", label: "\u8FDC\u7A0B", disabled: !st.ceilings.remote, disabledTitle: "\u90E8\u7F72\u672A\u914D\u7F6E\u8FDC\u7A0B\u5D4C\u5165\uFF08baseUrl/apiKey/model/dimensions\uFF09" }
		          ],
		          onChange: onSource
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 4 }, children: st.source === "off" ? "\u5F53\u524D\uFF1A\u5173\u952E\u8BCD\uFF08BM25\uFF09\u68C0\u7D22\uFF0C\u4E0D\u505A\u5411\u91CF\u5D4C\u5165" : st.source === "remote" ? "\u5F53\u524D\uFF1A\u8FDC\u7A0B\u5D4C\u5165\uFF08" + (rt ? "" : "") + "\u6A21\u578B\u7531\u90E8\u7F72\u914D\u7F6E\u7ED9\u5B9A\uFF09" : "\u5F53\u524D\uFF1A\u672C\u5730\u5D4C\u5165" + (st.activeModel ? "\uFF08" + st.activeModel + "\uFF09" : "") }),
		    st.activeNote ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 4, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: st.activeNote }) : null,
		    err && err !== "__unsupported__" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 6, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: err }) : null,
		    dl && dl.phase === "error" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 6, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: "\u4E0B\u8F7D\u5931\u8D25\uFF1A" + (dl.error || "") }) : null,
		    runtimeRow,
		    applyRow,
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.panelLabel, children: "\u672C\u5730\u6A21\u578B\u76EE\u5F55\uFF08\u4E0B\u8F7D\u540E\u79BB\u7EBF\u53EF\u7528\uFF0C\u4E0D\u968F\u63D2\u4EF6\u5206\u53D1\uFF09" }),
		    modelCards
		  ] });
		}
		
		// client/src/tabs/RebuildPanel.tsx
		var import_react6 = require("react");
		var import_jsx_runtime6 = require("react/jsx-runtime");
		var RB_PHASE_LABEL = {
		  preparing: "\u51C6\u5907\u4E2D\uFF08\u5F52\u6863\u65E7\u6570\u636E \xB7 \u6E05\u7A7A\u68C0\u7D22\u5E93\uFF09",
		  distilling: "\u5206\u5757\u84B8\u998F\u4E2D",
		  finalizing: "\u6536\u5C3E\uFF08\u5F3A\u5236 L2 \u573A\u666F + L3 \u753B\u50CF\uFF09"
		};
		function RebuildPanel(props) {
		  const rpc = props.rpc;
		  const [rb, setRb] = (0, import_react6.useState)(null);
		  const [confirmOpen, setConfirmOpen] = (0, import_react6.useState)(false);
		  const [busy, setBusy] = (0, import_react6.useState)(false);
		  const [rbError, setRbError] = (0, import_react6.useState)(null);
		  const refresh = (0, import_react6.useCallback)(() => {
		    rpc("dsh-memory/rebuild-status", {}).then((r) => {
		      if (r && r.ok) setRb(r.value);
		    }).catch(() => {
		    });
		  }, [rpc]);
		  (0, import_react6.useEffect)(() => {
		    refresh();
		  }, [refresh]);
		  const running = !!(rb && "running" in rb && rb.running);
		  (0, import_react6.useEffect)(() => {
		    if (!running) return;
		    const timer = setInterval(refresh, 1500);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [running, refresh]);
		  if (!rb || "supported" in rb) return null;
		  const start = () => {
		    setBusy(true);
		    setRbError(null);
		    rpc("dsh-memory/rebuild-start", {}).then((r) => {
		      setBusy(false);
		      if (r && r.ok) {
		        setConfirmOpen(false);
		        setRb(r.value);
		      } else {
		        setRbError(r && r.error ? r.error.message : "\u542F\u52A8\u5931\u8D25");
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
		    lastNote = "\u4E0A\u6B21\u91CD\u5EFA\uFF1A\u5B8C\u6210\uFF08" + rb.done + "/" + rb.total + " \u4F1A\u8BDD\uFF0C\u4EA7\u51FA " + rb.recordsBuilt + " \u6761\u8BB0\u5F55\uFF09" + (rb.finishedAt ? " \xB7 " + fmtTime(new Date(rb.finishedAt).toISOString()) : "");
		  } else if (!running && rb.phase === "cancelled") {
		    lastNote = "\u4E0A\u6B21\u91CD\u5EFA\uFF1A\u5DF2\u53D6\u6D88\uFF08\u5B8C\u6210 " + rb.done + "/" + rb.total + " \u4F1A\u8BDD\uFF0C\u5DF2\u91CD\u5EFA\u90E8\u5206\u4FDD\u7559\uFF09";
		  } else if (!running && rb.phase === "failed") {
		    lastNote = "\u4E0A\u6B21\u91CD\u5EFA\uFF1A\u5931\u8D25\uFF1A" + (rb.error || "\u672A\u77E5\u9519\u8BEF");
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-mem-rb-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { fontWeight: 600, whiteSpace: "nowrap" }, children: "\u91CD\u5EFA\u8BB0\u5FC6" }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-mem-rb-muted", style: { flex: 1, minWidth: 180 }, children: running ? (RB_PHASE_LABEL[rb.phase] || rb.phase) + " \xB7 " + rb.done + "/" + rb.total + " \u4F1A\u8BDD\uFF08" + pct + "%\uFF09" : "\u4ECE L0 \u539F\u59CB\u5BF9\u8BDD\u91CD\u65B0\u84B8\u998F L1/L2/L3\uFF1B\u65E7\u6570\u636E\u5148\u5F52\u6863\uFF08\u4E0D\u5220\u9664\uFF09" }),
		      running ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NButton, { disabled: busy || rb.cancelRequested, onClick: cancel, children: rb.cancelRequested ? "\u53D6\u6D88\u4E2D\u2026" : "\u53D6\u6D88\u91CD\u5EFA" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        NButton,
		        {
		          disabled: busy || empty,
		          title: empty ? "L0 \u65E0\u6D88\u606F\uFF0C\u65E0\u53EF\u91CD\u5EFA\u5185\u5BB9" : "\u91CD\u65B0\u84B8\u998F\u5168\u90E8\u8BB0\u5FC6",
		          style: { color: "var(--dsh-mem-danger)" },
		          onClick: () => {
		            setConfirmOpen(true);
		          },
		          children: busy ? "\u2026" : "\u5F00\u59CB\u91CD\u5EFA"
		        }
		      )
		    ] }),
		    running ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-mem-rb-bar", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-mem-rb-fill", style: { width: pct + "%" } }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-mem-rb-muted", style: { whiteSpace: "nowrap" }, children: "\u4EA7\u51FA " + rb.recordsBuilt + " \u6761" })
		    ] }) : null,
		    lastNote ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: lastNote }) : null,
		    rbError ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: rbError }) : null,
		    confirmOpen ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
		      NModal,
		      {
		        open: true,
		        onClose: () => {
		          setConfirmOpen(false);
		        },
		        title: "\u786E\u8BA4\u91CD\u5EFA\u5168\u90E8\u8BB0\u5FC6\uFF1F",
		        footer: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		            NButton,
		            {
		              onClick: () => {
		                setConfirmOpen(false);
		              },
		              children: "\u53D6\u6D88"
		            },
		            "cancel"
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NButton, { variant: "primary", disabled: busy, onClick: start, children: busy ? "\u542F\u52A8\u4E2D\u2026" : "\u5F00\u59CB\u91CD\u5EFA" }, "confirm")
		        ],
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
		            "\u5C06\u4EE5 L0 \u539F\u59CB\u5BF9\u8BDD\u4E3A\u4E8B\u5B9E\u6E90\u91CD\u65B0\u84B8\u998F\uFF1A",
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: rb.sessionCount + " \u4E2A\u4F1A\u8BDD \xB7 " + rb.messageCount + " \u6761\u6D88\u606F" }),
		            "\uFF0C\u9884\u8BA1 \u2265" + rb.estCalls + " \u6B21\u84B8\u998F\u8C03\u7528\u3002"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { marginTop: 8 }, children: "\u73B0\u6709 L1 \u8BB0\u5FC6 / L2 \u573A\u666F / L3 \u753B\u50CF\u4F1A\u6574\u4F53\u5F52\u6863\uFF08*.bak.\u65F6\u95F4\u6233\uFF0C\u53EF\u624B\u5DE5\u627E\u56DE\uFF09\uFF0C\u968F\u540E\u6E05\u7A7A\u91CD\u5EFA\uFF1B\u91CD\u5EFA\u671F\u95F4\u53EF\u6B63\u5E38\u5BF9\u8BDD\uFF0C\u65B0\u5BF9\u8BDD\u7684\u84B8\u998F\u4F18\u5148\u8FDB\u884C\uFF1B\u4E2D\u9014\u53EF\u53D6\u6D88\uFF0C\u5DF2\u91CD\u5EFA\u90E8\u5206\u4FDD\u7559\u3002" })
		        ]
		      }
		    ) : null
		  ] });
		}
		
		// client/src/tabs/RouteChainEditor.tsx
		var import_react8 = require("react");
		
		// client/src/ui/NSel.tsx
		var import_react7 = require("react");
		var import_jsx_runtime7 = require("react/jsx-runtime");
		function NSel(props) {
		  const options = props.options || [];
		  const value = props.value || "";
		  const disabled = !!props.disabled;
		  const [open, setOpen] = (0, import_react7.useState)(false);
		  const [idx, setIdx] = (0, import_react7.useState)(-1);
		  const wrapRef = (0, import_react7.useRef)(null);
		  const listRef = (0, import_react7.useRef)(null);
		  let selectedLabel = "";
		  for (let si = 0; si < options.length; si++) {
		    if (options[si].id === value) selectedLabel = options[si].label;
		  }
		  (0, import_react7.useEffect)(() => {
		    if (!open) return void 0;
		    const onDown = (e) => {
		      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
		    };
		    document.addEventListener("mousedown", onDown);
		    return () => {
		      document.removeEventListener("mousedown", onDown);
		    };
		  }, [open]);
		  (0, import_react7.useEffect)(() => {
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
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-mem-sel", style: props.style, ref: wrapRef, onKeyDown: onKey, onBlur, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dsh-mem-select-label", children: selectedLabel || props.placeholder || "\uFF08\u8BF7\u9009\u62E9\uFF09" }),
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dsh-mem-sel-chev" + (open ? " dsh-mem-sel-chev-open" : ""), "aria-hidden": true })
		        ]
		      }
		    ),
		    open && !disabled ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-mem-pop", ref: listRef, role: "listbox", children: options.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-mem-pop-empty", children: "\u65E0\u9009\u9879" }) : options.map((o, i) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dsh-mem-pop-opt-label", children: o.label }),
		            o.id === value ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dsh-mem-pop-check", children: "\u2713" }) : null
		          ]
		        },
		        o.id
		      );
		    }) }) : null
		  ] });
		}
		
		// client/src/tabs/RouteChainEditor.tsx
		var import_jsx_runtime8 = require("react/jsx-runtime");
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
		  const [info, setInfo] = (0, import_react8.useState)(null);
		  const [rows, setRows] = (0, import_react8.useState)(null);
		  const [rowErrs, setRowErrs] = (0, import_react8.useState)({});
		  const [err, setErr] = (0, import_react8.useState)(null);
		  const [manual, setManual] = (0, import_react8.useState)({ idx: -1, text: "" });
		  const pendingWrites = (0, import_react8.useRef)(0);
		  function refreshInfo() {
		    rpc("dsh-memory/llm-providers", {}).then((r) => {
		      if (r && r.ok && pendingWrites.current === 0) setInfo(r.value);
		    }).catch(() => {
		    });
		  }
		  (0, import_react8.useEffect)(() => {
		    refreshInfo();
		    const timer = setInterval(refreshInfo, 5e3);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [rpc]);
		  (0, import_react8.useEffect)(() => {
		    if (!info || !info.providers) return;
		    info.providers.forEach((p) => {
		      if (!p.id || modelsCache[p.id]) return;
		      rpc("dsh-memory/llm-models", { provider: p.id }).then((r) => {
		        if (r && r.ok && r.value) modelsCache[p.id] = r.value.models || [];
		      }).catch(() => {
		      });
		    });
		  }, [rpc, info]);
		  (0, import_react8.useEffect)(() => {
		    if (rows === null && info && info.chain && info.chain.current.length) {
		      setRows(info.chain.current.map(copyRow));
		    }
		  }, [info, rows]);
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
		    if (i === 0) setRows([EMPTY_ROW].concat(rows.slice(1)));
		    else setRows(rows.slice(0, i).concat(rows.slice(i + 1)));
		    setRowErrs({});
		  }
		  function addRow() {
		    let defProv = rows[0] && rows[0].provider || "";
		    if (!defProv && info.providers && info.providers[0]) defProv = info.providers[0].id;
		    setRows(rows.concat([{ provider: defProv, model: "", reasoningEffort: "" }]));
		    setRowErrs({});
		  }
		  function forkStatic() {
		    const st = info.chain && info.chain.static || [];
		    setRows([EMPTY_ROW].concat(st.slice(0, 7).map(copyRow)));
		    setRowErrs({});
		  }
		  function save() {
		    const errs = {};
		    const seen = {};
		    if (rows[0].provider && !rows[0].model || !rows[0].provider && rows[0].model) {
		      errs[0] = "\u4E3B\u8DEF\u7531\u884C\u4F9B\u5E94\u5546\u4E0E\u6A21\u578B\u987B\u6210\u5BF9\uFF08\u53CC\u7A7A = \u8DDF\u968F\u9ED8\u8BA4\u6A21\u578B\uFF09";
		    }
		    if (rows[0].provider && rows[0].model) seen[rows[0].provider + "::" + rows[0].model] = 0;
		    for (let i = 1; i < rows.length; i++) {
		      if (!rows[i].provider || !rows[i].model) {
		        errs[i] = "\u56DE\u9000\u8DEF\u7531\u5FC5\u987B\u663E\u5F0F\u9009\u62E9\u4F9B\u5E94\u5546\u4E0E\u6A21\u578B";
		        continue;
		      }
		      const key = rows[i].provider + "::" + rows[i].model;
		      if (seen[key] !== void 0) {
		        errs[i] = seen[key] === 0 ? "\u4E0E\u4E3B\u8DEF\u7531\u5B8C\u5168\u76F8\u540C\uFF08\u8FD0\u884C\u65F6\u4F1A\u8DF3\u8FC7\uFF0C\u8BF7\u53BB\u91CD\uFF09" : "\u4E0E\u7B2C " + (seen[key] + 1) + " \u884C\u91CD\u590D";
		      } else {
		        seen[key] = i;
		      }
		    }
		    setRowErrs(errs);
		    if (rows.length > 8) {
		      setErr("\u8DEF\u7531\u94FE\u6700\u591A 8 \u884C\uFF08\u542B\u4E3B\u8DEF\u7531\u884C\uFF09\uFF0C\u8BF7\u5220\u9664\u591A\u4F59\u884C");
		      return;
		    }
		    if (Object.keys(errs).length) return;
		    pendingWrites.current += 1;
		    setInfo({
		      ...info,
		      chain: { ...info.chain, current: rows.map(copyRow), source: "runtime" }
		    });
		    rpc("dsh-memory/settings-set", { distillChain: rows }).then((r) => {
		      pendingWrites.current -= 1;
		      setErr(!r || r.ok ? null : "\u8DEF\u7531\u94FE\u4FDD\u5B58\u5931\u8D25\uFF1A" + (r && r.error && r.error.message || "\u672A\u77E5\u9519\u8BEF"));
		      refreshInfo();
		    }).catch((e) => {
		      pendingWrites.current -= 1;
		      setErr("\u8DEF\u7531\u94FE\u4FDD\u5B58\u5931\u8D25\uFF1A" + String(e && e.message || e));
		      refreshInfo();
		    });
		  }
		  function clearToFollow() {
		    pendingWrites.current += 1;
		    rpc("dsh-memory/settings-set", { distillChain: [], distillProvider: "", distillModel: "", reasoningEffort: "" }).then((r) => {
		      pendingWrites.current -= 1;
		      setRows(null);
		      setRowErrs({});
		      setErr(!r || r.ok ? null : "\u6E05\u7A7A\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
		      refreshInfo();
		    }).catch((e) => {
		      pendingWrites.current -= 1;
		      setErr("\u6E05\u7A7A\u5931\u8D25\uFF1A" + String(e && e.message || e));
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
		    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: STY.roRow, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: STY.badge, children: i === 0 ? "\u4E3B" : String(i + 1) }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: STY.mono, children: e.provider + " / " + e.model }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: { marginLeft: "auto", flexShrink: 0, fontSize: 11, color: "var(--dsh-mem-text-3)" }, children: e.effort ? "\u6863\u4F4D " + e.effort : "\u8DDF\u968F\u90E8\u7F72\u914D\u7F6E" })
		    ] }, "ro" + i);
		  }
		  if (info.pinned) {
		    const effPin = info.chain && info.chain.effectiveChain || [];
		    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: STY.wrap, children: [
		      effPin.map(roRow),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: STY.note, children: "\u90E8\u7F72\u5DF2\u9501\u5B9A\u8DEF\u7531\uFF08pin \u4F18\u5148\u4E8E\u8FD0\u884C\u65F6\u94FE\uFF09\uFF1B\u8C03\u6574\u8BF7\u4FEE\u6539 profile cordis.patch.yml \u4E2D llm \u7684\u914D\u7F6E\u3002" })
		    ] });
		  }
		  if (rows === null) {
		    const effFollow = info.chain && info.chain.effectiveChain || [];
		    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: STY.wrap, children: [
		      effFollow.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: S.switchDesc, children: "\u84B8\u998F\u8DDF\u968F\u9ED8\u8BA4\u6A21\u578B\uFF0C\u672A\u914D\u7F6E\u56DE\u9000\u94FE\u3002" }) : effFollow.map(roRow),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(NButton, { onClick: forkStatic, disabled, children: "\u7F16\u8F91\u4E3A\u8FD0\u884C\u65F6\u94FE" }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: STY.note, children: "\u672A\u914D\u7F6E\u8FD0\u884C\u65F6\u94FE\u65F6\u8DDF\u968F\u90E8\u7F72\u914D\u7F6E\uFF1B\u300C\u7F16\u8F91\u4E3A\u8FD0\u884C\u65F6\u94FE\u300D\u4F1A\u62F7\u8D1D\u90E8\u7F72\u56DE\u9000\u94FE\u4E3A\u8349\u7A3F\uFF0C\u4FDD\u5B58\u8D77\u8FD0\u884C\u65F6\u94FE\u63A5\u7BA1\u3002" })
		    ] });
		  }
		  const capped = rows.length >= 8;
		  const dirty = JSON.stringify(rows) !== JSON.stringify(info.chain && info.chain.current || []);
		  const rowEls = rows.map((row, i) => {
		    const isPrimary = i === 0;
		    const known = !row.provider || !!providersById[row.provider];
		    const modelsLoaded = row.provider ? Object.prototype.hasOwnProperty.call(modelsCache, row.provider) : false;
		    const modelList = modelsLoaded ? modelsCache[row.provider] : [];
		    const manualInput = modelsLoaded && modelList.length === 0;
		    let curEfforts = [];
		    for (let mi = 0; mi < modelList.length; mi++) {
		      if (modelList[mi].id === row.model) {
		        curEfforts = modelList[mi].efforts || [];
		        break;
		      }
		    }
		    let providerOptions = providers.map((p) => {
		      return { id: p.id, label: p.name !== p.id ? p.name + "\uFF08" + p.id + "\uFF09" : p.id };
		    });
		    if (isPrimary) {
		      providerOptions = [
		        {
		          id: "",
		          label: info.default ? "\u8DDF\u968F\u9ED8\u8BA4\u6A21\u578B\uFF08" + info.default.provider + " / " + info.default.model + "\uFF09" : "\u8DDF\u968F\u9ED8\u8BA4\u6A21\u578B"
		        }
		      ].concat(providerOptions);
		    }
		    if (row.provider && !providersById[row.provider]) {
		      providerOptions.push({ id: row.provider, label: row.provider + "\uFF08\u5DF2\u4E0D\u5728\u5217\u8868\uFF09" });
		    }
		    const modelOptions = modelList.map((m) => {
		      return { id: m.id, label: m.name !== m.id ? m.name + "\uFF08" + m.id + "\uFF09" : m.id };
		    });
		    if (row.model && !modelList.some((m) => m.id === row.model)) {
		      modelOptions.push({ id: row.model, label: row.model + "\uFF08\u5DF2\u4E0D\u5728\u5217\u8868\uFF09" });
		    }
		    const effortOptions = [{ id: "", label: "\u8DDF\u968F\u90E8\u7F72\u914D\u7F6E" }].concat(
		      curEfforts.filter((k) => EFFORT_VOCAB.indexOf(k) >= 0).map((k) => ({ id: k, label: k }))
		    );
		    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { ...STY.row, ...rowErrs[i] ? STY.rowErr : null }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: STY.line, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: STY.badge, children: isPrimary ? "\u4E3B" : String(i + 1) }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          NSel,
		          {
		            style: { flex: 1, minWidth: 150 },
		            options: providerOptions,
		            value: row.provider,
		            disabled,
		            placeholder: isPrimary ? "\u8DDF\u968F\u9ED8\u8BA4\u6A21\u578B" : "\u4F9B\u5E94\u5546",
		            onChange: (v) => {
		              updateRow(i, { provider: v, model: "", reasoningEffort: "" });
		            }
		          }
		        ),
		        !row.provider ? null : manualInput ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          NInput,
		          {
		            style: { flex: 1, minWidth: 150 },
		            placeholder: "\u6A21\u578B id\uFF08\u8BE5\u4F9B\u5E94\u5546\u672A\u63D0\u4F9B\u5217\u8868\uFF0C\u8F93\u5165\u540E\u56DE\u8F66\uFF09\u2026",
		            value: manual.idx === i ? manual.text : row.model,
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
		        ) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          NSel,
		          {
		            style: { flex: 1, minWidth: 150 },
		            options: modelOptions,
		            value: row.model,
		            disabled: disabled || !modelsLoaded,
		            placeholder: modelsLoaded ? isPrimary ? "\uFF08\u9009\u62E9\u6A21\u578B\uFF0C\u53EF\u7559\u7A7A\u8DDF\u968F\u9ED8\u8BA4\uFF09" : "\uFF08\u9009\u62E9\u6A21\u578B\uFF09" : "\u52A0\u8F7D\u6A21\u578B\u5217\u8868\u2026",
		            onChange: (v) => {
		              updateRow(i, { model: v });
		            }
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          NSel,
		          {
		            style: { flexShrink: 0, width: 118 },
		            options: effortOptions,
		            value: row.reasoningEffort,
		            disabled: disabled || !(row.provider && row.model),
		            placeholder: "\u8DDF\u968F\u90E8\u7F72\u914D\u7F6E",
		            onChange: (v) => {
		              updateRow(i, { reasoningEffort: v });
		            }
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: STY.actions, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          NButton,
		          {
		            style: STY.ico,
		            disabled: disabled || i === 0,
		            title: i === 1 ? "\u4E0A\u79FB\uFF08\u4E0E\u4E3B\u8DEF\u7531\u4E92\u6362/\u9876\u66FF\u4E3A\u4E3B\u8DEF\u7531\uFF09" : "\u4E0A\u79FB",
		            onClick: () => {
		              moveRow(i, -1);
		            },
		            children: "\u2191"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          NButton,
		          {
		            style: STY.ico,
		            disabled: disabled || i === rows.length - 1 || i === 0 && !row.provider,
		            title: "\u4E0B\u79FB",
		            onClick: () => {
		              moveRow(i, 1);
		            },
		            children: "\u2193"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          NButton,
		          {
		            style: STY.ico,
		            disabled,
		            title: isPrimary ? "\u91CD\u7F6E\u4E3A\u8DDF\u968F\u9ED8\u8BA4" : "\u5220\u9664",
		            onClick: () => {
		              removeRow(i);
		            },
		            children: "\u2715"
		          }
		        )
		      ] }),
		      isPrimary && !row.provider ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: STY.note, children: "\u8DDF\u968F\u9ED8\u8BA4\u6A21\u578B" + (info.default ? "\uFF1A" + info.default.provider + " / " + info.default.model : "") + "\uFF08\u6863\u4F4D\u8DDF\u968F\u90E8\u7F72\u914D\u7F6E\uFF0C\u9009\u5B9A\u6A21\u578B\u540E\u53EF\u5355\u72EC\u8BBE\u7F6E\uFF09" }) : null,
		      !known ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: STY.warn, children: "\u26A0 \u4F9B\u5E94\u5546 " + row.provider + " \u5DF2\u4E0D\u5728\u5DF2\u6CE8\u518C\u8DEF\u7531\u4E2D\uFF1A\u8BE5\u8DEF\u7531\u8C03\u7528\u4F1A\u5931\u8D25\u5E76\u88AB\u94FE\u8DF3\u8FC7\uFF08\u4E0D\u963B\u6B62\u4FDD\u5B58\uFF09\u3002" }) : null,
		      rowErrs[i] ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: STY.warn, children: "\u2715 " + rowErrs[i] }) : null
		    ] }, "row" + i);
		  });
		  const effChain = info.chain && info.chain.effectiveChain || [];
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: STY.wrap, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { ...S.switchDesc, marginBottom: 8 }, children: "\u8DEF\u7531\u6309\u5E8F\u5C1D\u8BD5\uFF1A\u7B2C 1 \u884C\u662F\u4E3B\u8DEF\u7531\uFF0C\u5931\u8D25\uFF08\u62A5\u9519 / \u6390\u65AD / \u7F51\u7EDC\u5F02\u5E38 / \u7A7A\u8F93\u51FA\uFF09\u540E\u6309\u5E8F\u964D\u7EA7\uFF1B\u6BCF\u884C\u6863\u4F4D\u72EC\u7ACB\uFF0C\u7F3A\u7701\u8DDF\u968F\u90E8\u7F72\u914D\u7F6E\u3002" }),
		    rowEls,
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(NButton, { style: STY.add, disabled: disabled || capped, onClick: addRow, children: capped ? "\u5DF2\u8FBE\u4E0A\u9650\uFF088 \u6761\uFF09" : "+ \u6DFB\u52A0\u56DE\u9000\u8DEF\u7531" }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(NButton, { style: STY.ghost, disabled, onClick: clearToFollow, children: "\u6E05\u7A7A\u5E76\u8DDF\u968F\u90E8\u7F72\u914D\u7F6E" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(NButton, { variant: "primary", disabled, onClick: save, children: "\u4FDD\u5B58" })
		    ] }),
		    err ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { ...STY.warn, marginTop: 8 }, children: "\u2715 " + err }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--dsh-mem-border)" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontSize: 11, color: "var(--dsh-mem-text-3)", marginBottom: 4 }, children: "\u5B9E\u9645\u94FE" + (dirty ? "\uFF08\u4FDD\u5B58\u540E\u66F4\u65B0\uFF1B\u5F53\u524D\u663E\u793A\u5DF2\u4FDD\u5B58\u503C\uFF09" : "") }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		        "div",
		        {
		          style: { fontSize: 12, color: "var(--dsh-mem-text-2)", wordBreak: "break-all", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" },
		          children: effChain.map((e) => e.provider + "/" + e.model + (e.effort ? "\uFF08" + e.effort + "\uFF09" : "")).join(" \u2192 ") || "\uFF08\u6682\u65E0\u53EF\u7528\u8DEF\u7531\uFF09"
		        }
		      )
		    ] })
		  ] });
		}
		
		// client/src/tabs/OverviewTab.tsx
		var import_jsx_runtime9 = require("react/jsx-runtime");
		function OverviewTab(props) {
		  const rpc = props.rpc;
		  const [stats, setStats] = (0, import_react9.useState)(null);
		  const [settingsData, setSettingsData] = (0, import_react9.useState)(null);
		  const [error, setError] = (0, import_react9.useState)(null);
		  const load = (0, import_react9.useCallback)(() => {
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
		  (0, import_react9.useEffect)(() => {
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
		    const next = { ...prev, settings: { ...prev.settings, ...patch } };
		    setSettingsData(next);
		    rpc("dsh-memory/settings-set", patch).then((r) => {
		      if (!r || !r.ok) {
		        setSettingsData(prev);
		        setError(r && r.error ? "\u5F00\u5173\u5199\u5165\u5931\u8D25\uFF1A" + r.error.message : "\u5F00\u5173\u5199\u5165\u5931\u8D25");
		      } else {
		        setError(null);
		      }
		    }).catch((e) => {
		      setSettingsData(prev);
		      setError("\u5F00\u5173\u5199\u5165\u5931\u8D25\uFF1A" + String(e && e.message || e));
		    });
		  };
		  const tiles = [];
		  const infos = [];
		  if (stats) {
		    const th = stats.thresholds || { l2MinNewMemories: 5, l3Interval: 20 };
		    tiles.push({ num: String(stats.l0Today), label: "L0 \u4ECA\u65E5\u6D88\u606F" });
		    tiles.push({ num: String(stats.l1Count), label: "L1 \u539F\u5B50\u8BB0\u5FC6" });
		    tiles.push({ num: String(stats.sceneCount), label: "L2 \u573A\u666F\u5757" });
		    tiles.push({ num: String(stats.pendingExtract), label: "\u5F85\u91CD\u8BD5\u6D88\u606F" });
		    infos.push(["\u6570\u636E\u76EE\u5F55", stats.dataDir]);
		    infos.push(["\u63D2\u4EF6\u7248\u672C", "v" + stats.version]);
		    infos.push(["\u9ED8\u8BA4\u6863", modeLabel(stats.family)]);
		    infos.push(["L1 \u7D2F\u8BA1\u62BD\u53D6", String(stats.l1TotalExtracted)]);
		    infos.push(["L3 \u753B\u50CF", stats.personaChars > 0 ? stats.personaChars + " \u5B57\u7B26" : "\u672A\u751F\u6210"]);
		    infos.push(["\u4E0A\u6B21 L1 \u62BD\u53D6", fmtTime(stats.lastExtractAt)]);
		    infos.push(["\u4E0A\u6B21 L2 \u6574\u5408", fmtTime(stats.lastL2At)]);
		    infos.push(["\u4E0A\u6B21 L3 \u84B8\u998F", fmtTime(stats.lastL3At)]);
		    infos.push(["\u5F85 L2 \u65B0\u8BB0\u5FC6", stats.memoriesSinceL2 + " / " + (th.l2MinNewMemories != null ? th.l2MinNewMemories : 5)]);
		    infos.push(["\u5F85 L3 \u65B0\u8BB0\u5FC6", stats.memoriesSinceL3 + " / " + (th.l3Interval != null ? th.l3Interval : 20)]);
		  }
		  const degraded = stats && stats.message && stats.message !== "running";
		  const master = settingsData && settingsData.settings ? settingsData.settings.enabled : true;
		  let ceilingNote = "";
		  if (settingsData && settingsData.ceilings) {
		    const off = [];
		    if (!settingsData.ceilings.capture) off.push("\u6355\u83B7");
		    if (!settingsData.ceilings.distill) off.push("\u84B8\u998F");
		    if (!settingsData.ceilings.recall) off.push("\u53EC\u56DE");
		    if (off.length > 0) ceilingNote = "\u6CE8\u610F\uFF1A\u90E8\u7F72\u914D\u7F6E\u5DF2\u505C\u7528 " + off.join("\u3001") + "\uFF08\u8FD0\u884C\u65F6\u5F00\u5173\u65E0\u6CD5\u5F00\u542F\uFF09";
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
		    settingsData && settingsData.supported === false ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { style: S.hint, children: "settings \u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u8BB0\u5FC6\u6A21\u5F0F\u5F00\u5173\u672A\u542F\u7528\uFF08\u8BB0\u5FC6\u4FDD\u6301\u5168\u5F00\uFF09\u3002" }) : settingsData ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: S.switchPanel, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: S.panelLabel, children: "\u8BB0\u5FC6\u6A21\u5F0F" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        SwitchRow,
		        {
		          label: "\u8BB0\u5FC6\u6A21\u5F0F",
		          desc: master ? "\u5DF2\u5F00\u542F\uFF1A\u6355\u83B7\u5BF9\u8BDD\u5E76\u84B8\u998F\u8BB0\u5FC6" : "\u5DF2\u5173\u95ED\uFF1A\u4E0D\u6355\u83B7\u3001\u4E0D\u84B8\u998F\u3001\u4E0D\u6CE8\u5165\uFF08\u6570\u636E\u4FDD\u7559\uFF09",
		          checked: master,
		          onChange: (v) => {
		            toggle("enabled", v);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        SwitchRow,
		        {
		          label: "\u6355\u83B7",
		          desc: "L0\uFF1A\u8BB0\u5F55\u539F\u59CB\u5BF9\u8BDD\uFF08\u5173\u95ED\u540E\u84B8\u998F\u4E5F\u65E0\u8F93\u5165\uFF09",
		          checked: settingsData.settings.capture,
		          disabled: !master,
		          onChange: (v) => {
		            toggle("capture", v);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        SwitchRow,
		        {
		          label: "\u84B8\u998F",
		          desc: "L1 \u62BD\u53D6 + L2 \u573A\u666F + L3 \u753B\u50CF",
		          checked: settingsData.settings.distill,
		          disabled: !master,
		          onChange: (v) => {
		            toggle("distill", v);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        SwitchRow,
		        {
		          label: "\u53EC\u56DE",
		          desc: "\u5BF9\u8BDD\u65F6\u6CE8\u5165\u76F8\u5173\u8BB0\u5FC6\u4E0E\u753B\u50CF",
		          checked: settingsData.settings.recall,
		          disabled: !master,
		          onChange: (v) => {
		            toggle("recall", v);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: S.panelLabel, children: "\u84B8\u998F\u53C2\u6570" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(RouteChainEditor, { rpc, disabled: !master }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(BudgetInputs, { rpc, disabled: !master, data: settingsData, setData: setSettingsData, onError: setError }),
		      ceilingNote ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { style: S.hint, children: ceilingNote }) : null
		    ] }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(EmbeddingSection, { rpc }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(RebuildPanel, { rpc }),
		    degraded ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { ...S.error, marginBottom: 10 }, children: "\u26A0 " + stats.message + "\u3002\u4E0A\u65B9\u6570\u636E\u4E3A\u6700\u540E\u4E00\u6B21\u6210\u529F\u8BFB\u53D6\u7684\u503C\uFF0C\u8BB0\u5FC6\u529F\u80FD\u5F53\u524D\u672A\u5DE5\u4F5C\u3002" }) : null,
		    error ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: S.error, children: "\u83B7\u53D6\u72B6\u6001\u5931\u8D25\uFF1A" + error }) : !stats ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { style: S.intro, children: "\u6B63\u5728\u8BFB\u53D6\u8BB0\u5FC6\u72B6\u6001\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: S.panelLabel, children: "\u8BB0\u5FC6\u6982\u51B5" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: S.statGrid, children: tiles.map((t) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-mem-card", style: S.statTile, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: S.statNum, children: t.num }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: S.statLabel, children: t.label })
		        ] }, t.label);
		      }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: S.panelLabel, children: "\u8FD0\u884C\u72B6\u6001" }),
		      infos.map((row) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: S.infoRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: S.infoKey, children: row[0] }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: S.infoVal, children: row[1] })
		        ] }, row[0]);
		      })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { style: S.hint, children: "\u6D4F\u89C8\u5404\u5C42\u8BB0\u5FC6\u5185\u5BB9\u8BF7\u5207\u6362\u4E0A\u65B9 Tab\uFF1B\u539F\u59CB\u5BF9\u8BDD\uFF08L0\uFF09\u4E0D\u5165\u6D4F\u89C8\u5668\uFF0C\u53EF\u7531\u6A21\u578B\u4FA7 conversation_search \u5DE5\u5177\u67E5\u8BE2\u3002" })
		  ] });
		}
		
		// client/src/tabs/PersonaTab.tsx
		var import_react10 = require("react");
		var import_jsx_runtime10 = require("react/jsx-runtime");
		function PersonaTab(props) {
		  const rpc = props.rpc;
		  const [content, setContent] = (0, import_react10.useState)(null);
		  const [error, setError] = (0, import_react10.useState)(null);
		  const load = (0, import_react10.useCallback)(() => {
		    setError(null);
		    rpc("dsh-memory/persona", {}).then((r) => {
		      if (r && r.ok) setContent(r.value.content);
		      else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		  }, [rpc]);
		  (0, import_react10.useEffect)(() => {
		    load();
		  }, [load]);
		  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: S.muted, children: error ? "\u52A0\u8F7D\u5931\u8D25" : content === null ? "\u52A0\u8F7D\u4E2D\u2026" : content ? content.length + " \u5B57\u7B26" : "\u672A\u751F\u6210\u753B\u50CF" }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(NButton, { onClick: load, children: "\u5237\u65B0" })
		    ] }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: { ...S.error, marginBottom: 10 }, children: "\u753B\u50CF\u8BFB\u53D6\u5931\u8D25\uFF1A" + error + "\uFF08\u70B9\u53F3\u4E0A\u201C\u5237\u65B0\u201D\u91CD\u8BD5\uFF09" }) : null,
		    content ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("pre", { style: S.pre, children: content }) : content === null ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: S.intro, children: "\u753B\u50CF\u5C1A\u672A\u751F\u6210\uFF1B\u84B8\u998F\u82E5\u5E72\u8BB0\u5FC6\u540E L3 \u4F1A\u81EA\u52A8\u4EA7\u51FA\u3002" })
		  ] });
		}
		
		// client/src/tabs/RecordsTab.tsx
		var import_react11 = require("react");
		var import_jsx_runtime11 = require("react/jsx-runtime");
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
		  const [items, setItems] = (0, import_react11.useState)([]);
		  const [hasMore, setHasMore] = (0, import_react11.useState)(false);
		  const [total, setTotal] = (0, import_react11.useState)(null);
		  const [sceneOptions, setSceneOptions] = (0, import_react11.useState)([]);
		  const [loading, setLoading] = (0, import_react11.useState)(false);
		  const [truncated, setTruncated] = (0, import_react11.useState)(false);
		  const [error, setError] = (0, import_react11.useState)(null);
		  const [expandedId, setExpandedId] = (0, import_react11.useState)(null);
		  const [query, setQuery] = (0, import_react11.useState)("");
		  const [typeFilter, setTypeFilter] = (0, import_react11.useState)("");
		  const [sceneFilter, setSceneFilter] = (0, import_react11.useState)("");
		  const [last, setLast] = (0, import_react11.useState)({ query: "", type: "", scene: "" });
		  const seqRef = (0, import_react11.useRef)(0);
		  const fetchPage = (0, import_react11.useCallback)(
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
		  (0, import_react11.useEffect)(() => {
		    fetchPage({ query: "", type: "", scene: "" }, 0, false);
		  }, [fetchPage]);
		  const countText = total !== null ? "\u5171 " + total + " \u6761" : items.length + " \u6761" + (hasMore ? "+" : "");
		  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: S.toolbar, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		        NInput,
		        {
		          style: { flex: 1, minWidth: 160 },
		          placeholder: "\u641C\u7D22\u8BB0\u5FC6\u5185\u5BB9\uFF08BM25 \u5173\u952E\u8BCD\uFF09\u2026",
		          value: query,
		          onChange: (e) => {
		            setQuery(e.target.value);
		          },
		          onKeyDown: (e) => {
		            if (e.key === "Enter") search();
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		        NSel,
		        {
		          style: { maxWidth: 200 },
		          options: [{ id: "", label: "\u5168\u90E8\u7C7B\u578B" }].concat(
		            TYPE_CHOICES.map((t) => {
		              return { id: t, label: TYPE_LABELS[t] || t };
		            })
		          ),
		          value: typeFilter,
		          onChange: setTypeFilter
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		        NSel,
		        {
		          style: { maxWidth: 220 },
		          options: [{ id: "", label: "\u5168\u90E8\u60C5\u5883" }].concat(
		            sceneOptions.map((s) => {
		              return { id: s, label: s.length > 24 ? s.slice(0, 24) + "\u2026" : s };
		            })
		          ),
		          value: sceneFilter,
		          onChange: setSceneFilter
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(NButton, { onClick: search, children: "\u641C\u7D22" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: S.muted, children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : countText }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		        NButton,
		        {
		          onClick: () => {
		            fetchPage(last, 0, false);
		          },
		          children: "\u5237\u65B0"
		        }
		      )
		    ] }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.error, children: error }) : null,
		    truncated ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.hint, children: "\u641C\u7D22\u5206\u9875\u5DF2\u8FBE\u68C0\u7D22\u4E0A\u9650\uFF08200 \u6761\uFF09\uFF0C\u66F4\u65E9\u7684\u7ED3\u679C\u672A\u663E\u793A\u3002\u8BF7\u7528\u66F4\u7CBE\u786E\u7684\u5173\u952E\u8BCD\u6216\u7C7B\u578B/\u60C5\u5883\u8FC7\u6EE4\u3002" }) : null,
		    items.length === 0 && !loading && !error ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { style: S.intro, children: "\u6682\u65E0\u8BB0\u5FC6\u3002\u5BF9\u8BDD\u51E0\u8F6E\u540E\uFF0C\u84B8\u998F\u7BA1\u7EBF\u4F1A\u81EA\u52A8\u62BD\u53D6\u8BB0\u5FC6\u3002" }) : items.map((m) => {
		      const open = expandedId === m.id;
		      return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
		        "div",
		        {
		          className: "dsh-mem-card dsh-mem-card-hover",
		          style: { ...S.card, cursor: "pointer" },
		          onClick: () => {
		            setExpandedId(open ? null : m.id);
		          },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: S.cardHead, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-mem-tag dsh-mem-tag-" + m.type, children: TYPE_LABELS[m.type] || m.type }),
		              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: S.muted, children: "\u4F18\u5148\u7EA7 " + m.priority }),
		              m.score !== null && m.score !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: S.muted, children: "\u76F8\u5173\u5EA6 " + Number(m.score).toFixed(2) }) : null,
		              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.grow }),
		              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: S.muted, children: fmtTime(m.updatedAt) })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.content, children: m.content }),
		            open ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.detail, children: "id: " + m.id + "\n\u60C5\u5883: " + (m.scene || "-") + "\n\u7248\u672C: v" + m.version + "\uFF08\u53BB\u91CD\u5408\u5E76\u6B21\u6570 " + m.version + "\uFF09\n\u521B\u5EFA: " + fmtTime(m.createdAt) + "\n\u6D3B\u8DC3\u65F6\u95F4: " + (m.timestamps && m.timestamps.length > 0 ? m.timestamps.map(fmtTime).join(" \u2192 ") : "-") + "\n" + (m.sourceMessageIds && m.sourceMessageIds.length > 0 ? "\u6765\u6E90\u6D88\u606F: " + m.sourceMessageIds.join(", ") : "\u6765\u6E90\u6D88\u606F: -") }) : null
		          ]
		        },
		        m.id
		      );
		    }),
		    hasMore ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: S.flexRow, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		        NButton,
		        {
		          disabled: loading,
		          onClick: () => {
		            if (!loading) fetchPage(last, items.length, true);
		          },
		          children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u52A0\u8F7D\u66F4\u591A"
		        }
		      )
		    ] }) : null
		  ] });
		}
		
		// client/src/tabs/ScenesTab.tsx
		var import_react12 = require("react");
		var import_jsx_runtime12 = require("react/jsx-runtime");
		function SceneCard(props) {
		  const s = props.s;
		  const [open, setOpen] = (0, import_react12.useState)(false);
		  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsh-mem-card dsh-mem-card-hover", style: S.card, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
		      "div",
		      {
		        style: { ...S.sceneHead, cursor: "pointer", userSelect: "none" },
		        onClick: () => {
		          setOpen(!open);
		        },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dsh-mem-scene-chev", style: { transform: open ? "rotate(90deg)" : "none" }, children: "\u25B8" }),
		          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: S.sceneTitle, children: s.path }),
		          s.heat ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: S.muted, children: "\u70ED\u5EA6 " + s.heat }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.grow }),
		          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: S.muted, children: "\u66F4\u65B0 " + fmtTime(s.updated) })
		        ]
		      }
		    ),
		    s.summary ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: { ...S.muted, marginBottom: 6 }, children: s.summary }) : null,
		    open ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("pre", { style: S.pre, children: s.content || "(\u7A7A)" }) : null
		  ] });
		}
		function ScenesTab(props) {
		  const rpc = props.rpc;
		  const [items, setItems] = (0, import_react12.useState)(null);
		  const [error, setError] = (0, import_react12.useState)(null);
		  const load = (0, import_react12.useCallback)(() => {
		    rpc("dsh-memory/scenes", {}).then((r) => {
		      if (r && r.ok) {
		        setItems(r.value.items);
		        setError(null);
		      } else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		  }, [rpc]);
		  (0, import_react12.useEffect)(() => {
		    load();
		  }, [load]);
		  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: S.muted, children: items ? items.length + " \u4E2A\u573A\u666F\u5757" : "\u52A0\u8F7D\u4E2D\u2026" }),
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(NButton, { onClick: load, children: "\u5237\u65B0" })
		    ] }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.error, children: error }) : null,
		    items && items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { style: S.intro, children: "\u6682\u65E0\u573A\u666F\u5757\u3002\u7D2F\u8BA1 5 \u6761\u65B0\u8BB0\u5FC6\u540E L2 \u4F1A\u81EA\u52A8\u6574\u5408\u51FA\u7B2C\u4E00\u4E2A\u573A\u666F\u3002" }) : null,
		    (items || []).map((s) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(SceneCard, { s }, s.path);
		    })
		  ] });
		}
		
		// client/src/panel.tsx
		var import_jsx_runtime13 = require("react/jsx-runtime");
		var TABS = [
		  ["overview", "\u6982\u89C8"],
		  ["records", "\u8BB0\u5FC6"],
		  ["scenes", "\u573A\u666F"],
		  ["persona", "\u753B\u50CF"],
		  ["cost", "\u6210\u672C"],
		  ["log", "\u65E5\u5FD7"]
		];
		function MemoryPanel(props) {
		  const rpc = props.rpc;
		  const [tab, setTab] = (0, import_react13.useState)("overview");
		  ensureThemeStyle();
		  (0, import_react13.useEffect)(() => {
		    watchSidebarIcon();
		  }, []);
		  let body;
		  if (tab === "overview") body = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(OverviewTab, { rpc });
		  else if (tab === "records") body = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(RecordsTab, { rpc });
		  else if (tab === "scenes") body = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(ScenesTab, { rpc });
		  else if (tab === "persona") body = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(PersonaTab, { rpc });
		  else if (tab === "cost") body = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(CostTab, { rpc });
		  else body = /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(LogTab, { rpc });
		  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dsh-mem-root", style: S.section, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h2", { style: S.heading, children: "\u8BB0\u5FC6 (Memory)" }),
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { style: S.intro, children: "L0~L3 \u5206\u5C42\u84B8\u998F\u8BB0\u5FC6\uFF1A\u6D4F\u89C8\u88AB\u8BB0\u4F4F\u7684\u5185\u5BB9\uFF0C\u63A7\u5236\u8BB0\u5FC6\u6A21\u5F0F\u5F00\u5173\u3002" }),
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { style: S.tabbar, children: TABS.map((t) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
		var import_react16 = require("react");
		
		// client/src/pill/ModeSlider.tsx
		var import_react15 = require("react");
		
		// client/src/pill/SessionInfoArea.tsx
		var import_react14 = require("react");
		var import_jsx_runtime14 = require("react/jsx-runtime");
		function sinfoCell(val, label, title) {
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { title: title || void 0, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dsh-mem-sinfo-val", children: val }),
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dsh-mem-sinfo-label", children: label })
		  ] });
		}
		function SessionInfoArea(props) {
		  const rpc = props.rpc;
		  const sessionId = props.sessionId;
		  const [stats, setStats] = (0, import_react14.useState)(void 0);
		  const busyRef = (0, import_react14.useRef)(false);
		  (0, import_react14.useEffect)(() => {
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
		    return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dsh-mem-sinfo", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dsh-mem-sinfo-grid", children: [
		      sinfoCell("\u2026", "\u53EC\u56DE\u547D\u4E2D"),
		      sinfoCell("\u2026", "\u6512\u6279\u8FDB\u5EA6"),
		      sinfoCell("\u2026", "\u672C\u4F1A\u8BDD\u8BB0\u5FC6"),
		      sinfoCell("\u2026", "\u4F1A\u8BDD\u6D88\u606F")
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
		    rcVal = "\u505C\u7528";
		    rcLabel = "\u53EC\u56DE\u547D\u4E2D";
		    rcTitle = "\u53EC\u56DE\u5DF2\u505C\u7528\uFF08\u5F00\u5173\u5173\u95ED / \u6863\u4F4D\u5173\u95ED / \u90E8\u7F72\u672A\u542F\u7528\uFF09";
		  } else {
		    rcVal = (rc.hitTurns || 0) + "/" + (rc.injectedTurns || 0);
		    rcLabel = "\u53EC\u56DE\u547D\u4E2D \xB7 " + (rc.totalHits || 0) + " \u6761";
		    rcTitle = "\u6700\u8FD1\u4E00\u8F6E\u547D\u4E2D " + (rc.lastHits || 0) + " \u6761\uFF0C\u8017\u65F6 " + (rc.lastDurationMs || 0) + "ms" + ((rc.timeouts || 0) > 0 ? "\uFF0C\u8D85\u65F6\u8DF3\u8FC7 " + rc.timeouts + " \u6B21" : "");
		  }
		  let dVal;
		  let dLabel;
		  let dTitle;
		  if (isOff) {
		    dVal = String(di.parkedSlices || 0);
		    dLabel = "\u6302\u8D77\u5207\u7247";
		    dTitle = "\u6863\u4F4D\u5173\u95ED\uFF1A\u672A\u84B8\u998F\u5207\u7247\u6302\u8D77\uFF0C\u5207\u56DE\u6863\u4F4D\u540E\u7EE7\u7EED";
		  } else {
		    dVal = (di.pendingSlice || 0) + "/" + (di.threshold != null ? di.threshold : "-");
		    dLabel = (di.parkedSlices || 0) > 0 ? "\u6512\u6279 \xB7 \u6302\u8D77 " + di.parkedSlices : "\u6512\u6279\u8FDB\u5EA6";
		    dTitle = "\u8FBE\u5230\u9608\u503C\u540E\u81EA\u52A8\u84B8\u998F\uFF08\u9608\u503C\u968F\u4F7F\u7528\u6E10\u8FDB\u722C\u5761\u5230\u7A33\u6001\uFF09";
		  }
		  const pTitle = di.lastDistillAt ? "\u6700\u8FD1\u84B8\u998F " + fmtTime(di.lastDistillAt) : "\u672C\u4F1A\u8BDD\u5C1A\u672A\u84B8\u998F";
		  const warn = gl.degraded ? "\u26A0 \u5B58\u50A8\u4E0D\u53EF\u7528\uFF0C\u8BB0\u5FC6\u529F\u80FD\u5DF2\u505C\u7528" : null;
		  let note = null;
		  if (!gl.degraded) {
		    if (stats.retrieval === "keyword" && !isOff) note = "\u68C0\u7D22\u964D\u7EA7\uFF1A\u7EAF\u5173\u952E\u8BCD\uFF08\u5411\u91CF\u4E0D\u53EF\u7528\uFF09";
		    else if (stats.retrieval === "none") note = "\u68C0\u7D22\u4E0D\u53EF\u7528\uFF08FTS \u4E0E\u5411\u91CF\u5747\u5931\u6548\uFF09";
		  }
		  const ago = fmtAgo(gl.lastExtractAt);
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dsh-mem-sinfo", children: [
		    warn ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dsh-mem-sinfo-warn", children: warn }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dsh-mem-sinfo-grid", children: [
		      sinfoCell(rcVal, rcLabel, rcTitle),
		      sinfoCell(dVal, dLabel, dTitle),
		      sinfoCell(String(di.producedRecords || 0), "\u672C\u4F1A\u8BDD\u8BB0\u5FC6", pTitle),
		      sinfoCell(stats.l0Count != null ? String(stats.l0Count) : "\u2026", "\u4F1A\u8BDD\u6D88\u606F")
		    ] }),
		    note ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dsh-mem-sinfo-note", children: note }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dsh-mem-sinfo-sum", children: "\u5F85\u84B8\u998F " + (gl.pendingTotal || 0) + " \xB7 \u4E0A\u6B21\u84B8\u998F " + (ago || "\u5C1A\u672A\u84B8\u998F") })
		  ] });
		}
		
		// client/src/pill/ModeSlider.tsx
		var import_jsx_runtime15 = require("react/jsx-runtime");
		function ModeSlider(props) {
		  ensureThemeStyle();
		  const trackRef = (0, import_react15.useRef)(null);
		  const [drag, setDrag] = (0, import_react15.useState)(null);
		  const canvasRef = (0, import_react15.useRef)(null);
		  const geoRef = (0, import_react15.useRef)(null);
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
		  (0, import_react15.useEffect)(() => {
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
		      for (let row = 0; row * cell < height; row++) {
		        for (let column = 0; column * cell < width; column++) {
		          grid.push({
		            x: column * cell,
		            y: row * cell,
		            base: Math.abs(Math.sin(column * 12.9898 + row * 78.233) * 43758.5453) % 1,
		            tempo: Math.abs(Math.sin(column * 7.13 + row * 19.41) * 19341.731) % 1,
		            phase: Math.abs(Math.sin(column * 31.17 + row * 11.93) * 28437.123) % 1
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
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
		  return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		    "div",
		    {
		      style: {
		        position: "absolute",
		        bottom: "calc(100% + 8px)",
		        left: "50%",
		        transform: "translateX(-50%)",
		        zIndex: 1e3
		      },
		      children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
		        "div",
		        {
		          className: "dsh-mem-popover",
		          style: { position: "relative", padding: "14px 16px" },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
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
		                  activeIdx > 0 || drag !== null ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
		                  drag !== null ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-bubble", style: { left: thumbLeft + THUMB / 2, zIndex: 4 }, children: info.label }) : null
		                ]
		              }
		            ),
		            props.error ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { style: { fontSize: 11, color: "var(--dsh-mem-danger)", marginTop: 10, whiteSpace: "nowrap" }, children: props.error }) : null,
		            props.rpc && props.sessionId ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(SessionInfoArea, { rpc: props.rpc, sessionId: props.sessionId }) : null
		          ]
		        }
		      )
		    }
		  );
		}
		
		// client/src/pill/MemoryModePill.tsx
		var import_jsx_runtime16 = require("react/jsx-runtime");
		function MemoryModePill(props) {
		  const rpc = props.rpc;
		  const sessionId = props.sessionId || props.session && props.session.sessionId;
		  const [mode, setMode] = (0, import_react16.useState)(null);
		  const [error, setError] = (0, import_react16.useState)(null);
		  const [open, setOpen] = (0, import_react16.useState)(false);
		  const wrapRef = (0, import_react16.useRef)(null);
		  const seqRef = (0, import_react16.useRef)(0);
		  const load = (0, import_react16.useCallback)(() => {
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
		  (0, import_react16.useEffect)(() => {
		    load();
		  }, [load]);
		  (0, import_react16.useEffect)(() => {
		    watchSidebarIcon();
		  }, []);
		  (0, import_react16.useEffect)(() => {
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
		        setError(r && r.error ? "\u6863\u4F4D\u5199\u5165\u5931\u8D25\uFF1A" + r.error.message : "\u6863\u4F4D\u5199\u5165\u5931\u8D25");
		      }
		    }).catch((e) => {
		      setMode(prev);
		      setError("\u6863\u4F4D\u5199\u5165\u5931\u8D25\uFF1A" + String(e && e.message || e));
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
		  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { ref: wrapRef, style: { position: "relative", display: "inline-flex" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(
		      "button",
		      {
		        type: "button",
		        title: error ? "\u6863\u4F4D\u8BFB\u53D6\u5931\u8D25\uFF1A" + error + "\uFF08\u70B9\u51FB\u91CD\u8BD5\uFF09" : "\u672C\u4F1A\u8BDD\u8BB0\u5FC6\u6863\u4F4D\uFF08\u70B9\u51FB\u5207\u6362\uFF09",
		        onClick: () => {
		          if (error) load();
		          setOpen(!open);
		        },
		        className: isFlow ? "dsh-mem-flow" : "dsh-mem-pill-off",
		        style: pillStyle,
		        children: [
		          "\u8BB0\u5FC6 \xB7 ",
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: loaded ? info.label : error ? "\u26A0" : "\u2026" })
		        ]
		      }
		    ),
		    open ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ModeSlider, { mode: mode || "auto", onCommit: commit, error, rpc, sessionId }) : null
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
		        label: "\u8BB0\u5FC6",
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
		
		return module.exports;
	}
});
