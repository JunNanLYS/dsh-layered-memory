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
		
		// client/src/chat/MemoryChip.tsx
		var import_react = require("react");
		
		// src/util/context-occupancy.ts
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
		var lastFetchStartedAt = 0;
		var fetchInFlight = false;
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
		    for (const l of snapshotListeners) l();
		    scheduleReconcile();
		  } catch {
		    scheduleReconcile();
		  } finally {
		    fetchInFlight = false;
		  }
		}
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
		function onMutations() {
		  scheduleReconcile();
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
		  applyT2Clock();
		}
		function applyT2Clock() {
		  const svg = anchorCache?.svg;
		  if (!svg) return;
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
		
		// client/src/i18n.ts
		var zh = {
		  "scope.auto": "智能",
		  "scope.chat": "日常",
		  "scope.work": "工作",
		  "flow.follow": "跟随全局",
		  "flow.rw": "读写",
		  "flow.wo": "只写",
		  "flow.paused": "暂停",
		  "row.scope": "记忆范围",
		  "row.flow": "数据流",
		  "chip.base": "记忆",
		  "chip.wo": "只写",
		  "chip.paused": "暂停",
		  "chip.degraded": "降级",
		  "chip.title": "本会话记忆（点击设置范围与数据流）",
		  "err.load": "读取失败，点击重试",
		  // ── 工作台外壳 ──
		  "ws.title": "记忆工作台",
		  "ws.tab.overview": "总览",
		  "ws.tab.library": "记忆库",
		  "ws.tab.automation": "自动化",
		  "ws.tab.insights": "洞察",
		  "ws.tab.maintenance": "维护",
		  "ws.refresh": "刷新",
		  "ws.retry": "重试",
		  "ws.loading": "正在读取…",
		  "ws.loadFail": "数据加载失败",
		  "ws.copy": "复制",
		  "ws.copied": "已复制",
		  "ws.copyFail": "复制失败",
		  "ws.all": "全部",
		  "ago.now": "刚刚",
		  "ago.min": "{n} 分钟前",
		  "ago.hour": "{n} 小时前",
		  "ago.day": "{n} 天前",
		  // ── 总览 ──
		  "ov.runningOk": "运行正常",
		  "ov.runningWarn": "检索降级",
		  "ov.runningDown": "存储不可用，记忆功能已停用",
		  "ov.subsys.store": "存储",
		  "ov.subsys.fts": "全文检索",
		  "ov.subsys.vec": "向量检索",
		  "ov.subsys.queue": "蒸馏队列",
		  "ov.sys.ok": "正常",
		  "ov.sys.keyword": "降级 · 仅关键词",
		  "ov.sys.vectorOnly": "降级 · 仅向量",
		  "ov.sys.none": "未启用",
		  "ov.sys.pending": "待处理 {n}",
		  "ov.sys.idle": "空闲",
		  "ov.attention": "需要关注",
		  "ov.attn.pending": "待蒸馏 {n} 条",
		  "ov.attn.vector": "向量检索降级",
		  "ov.attn.degraded": "存储降级，功能已停用",
		  "ov.recent": "最近活动",
		  "ov.kg.l1": "记忆资产",
		  "ov.kg.scenes": "场景",
		  "ov.kg.week": "本周蒸馏输出",
		  "ov.kg.weekSub": "{n} 次调用",
		  "ov.kg.lastDistill": "上次蒸馏",
		  "ov.kg.never": "尚未发生",
		  "ov.goto.library": "打开记忆库",
		  "ov.goto.automation": "自动化设置",
		  "ov.goto.insights": "查看洞察",
		  "ov.goto.maintenance": "维护",
		  "ov.empty.title": "还没有形成记忆",
		  "ov.empty.body": "开始一次对话，插件会先捕获内容，再在后台蒸馏为可召回的记忆。",
		  "ov.empty.capture": "捕获",
		  "ov.empty.distill": "蒸馏",
		  "ov.empty.recall": "召回",
		  "ov.empty.capOk": "三项能力当前均可用。",
		  // ── 记忆库（只读资产活动流） ──
		  "lib.search": "搜索记忆、场景与画像…",
		  "lib.filter.type": "类型",
		  "lib.filter.scope": "范围",
		  "lib.filter.time": "时间",
		  "lib.time.today": "今天",
		  "lib.time.d7": "7 天",
		  "lib.time.d30": "30 天",
		  "lib.count": "{n} 条结果",
		  "lib.countFiltered": "{n} 条结果 · 已筛选",
		  "lib.empty": "没有匹配的记忆资产",
		  "lib.emptyHint": "调整筛选条件，或继续对话产生新记忆。",
		  "lib.truncated": "搜索已达检索上限（200 条），更早的结果未显示。",
		  "lib.more": "加载更多",
		  "lib.loadingMore": "加载中…",
		  "kind.l1": "记忆",
		  "kind.l2": "场景",
		  "kind.l3": "画像",
		  "type.persona": "画像偏好",
		  "type.episodic": "客观事件",
		  "type.instruction": "全局指令",
		  "type.work_fact": "工作事实",
		  "type.work_task": "工作任务",
		  "type.work_method": "工作方法",
		  "type.work_artifact": "工作资产",
		  "verb.new": "新增",
		  "verb.upd": "更新",
		  "lib.meta.type": "类型",
		  "lib.meta.created": "创建",
		  "lib.meta.updated": "更新",
		  "lib.meta.version": "版本",
		  "lib.meta.source": "来源会话",
		  "lib.meta.scene": "情境",
		  // ── 自动化 ──
		  "au.basic": "基础控制",
		  "au.sw.master": "记忆总闸",
		  "au.sw.masterOn": "已开启：捕获对话并蒸馏记忆",
		  "au.sw.masterOff": "已关闭：不捕获、不蒸馏、不注入（数据保留）",
		  "au.sw.capture": "捕获",
		  "au.sw.captureD": "对话内容写入 L0 原始记录",
		  "au.sw.distill": "蒸馏",
		  "au.sw.distillD": "后台把 L0 提炼为记忆、场景与画像",
		  "au.sw.recall": "召回",
		  "au.sw.recallD": "对话时注入相关记忆（全局）",
		  "au.emb": "语义检索",
		  "au.emb.remote": "远程 · {m}",
		  "au.emb.local": "本地 · {m}",
		  "au.emb.off": "关闭",
		  "au.route": "蒸馏路由",
		  "au.route.cur": "{m} · 回退 {n} 条",
		  "au.route.follow": "跟随默认模型",
		  "au.ceiling": "部署配置已停用：{s}（运行时开关无法开启）",
		  "au.advTitle": "高级路由与预算",
		  "au.advHint": "部署锁定项显示为只读",
		  "au.embTitle": "嵌入模型",
		  "au.unsupported": "设置服务不可用，运行时开关未启用（记忆保持全开）。",
		  // ── 洞察 ──
		  "in.tab.cost": "成本",
		  "in.tab.activity": "活动",
		  "in.tab.recall": "召回",
		  "in.act.chart": "近 7 天资产活动",
		  "in.act.byLayer": "蒸馏调用与失败（本次运行累计）",
		  "in.act.layer": "层级",
		  "in.act.calls": "调用",
		  "in.act.fail": "失败",
		  "in.act.l1x": "L1 抽取",
		  "in.act.l1d": "L1 去重",
		  "in.act.l2": "L2 场景",
		  "in.act.l3": "L3 画像",
		  "in.rc.turns": "注入轮次",
		  "in.rc.sessions": "有检索的会话",
		  "in.rc.hits": "注入记忆条数",
		  "in.rc.hitTurns": "命中轮次",
		  "in.rc.timeouts": "召回超时",
		  "in.rc.suppressed": "去重压制",
		  "in.rc.disabled": "停用分布",
		  "in.rc.globalOn": "全局注入已开启",
		  "in.rc.globalOff": "全局注入已关闭",
		  "in.rc.modeOff": "档位暂停会话",
		  "in.rc.wo": "只写覆盖会话",
		  "in.rc.empty": "本次运行尚无召回数据（统计在进程内累计，重启归零）。",
		  // ── 维护 ──
		  "mt.health": "运行健康",
		  "mt.store.down": "不可用（降级）",
		  "mt.retrieval.hybrid": "全文 + 向量",
		  "mt.unknown": "未知",
		  "mt.row.dataDir": "数据目录",
		  "mt.row.version": "插件版本",
		  "mt.row.l0": "今日捕获",
		  "mt.log": "诊断日志",
		  "mt.danger": "危险操作"
		};
		var en = {
		  "scope.auto": "Auto",
		  "scope.chat": "Personal",
		  "scope.work": "Work",
		  "flow.follow": "Follow global",
		  "flow.rw": "Read & write",
		  "flow.wo": "Write only",
		  "flow.paused": "Paused",
		  "row.scope": "Memory scope",
		  "row.flow": "Data flow",
		  "chip.base": "Memory",
		  "chip.wo": "write-only",
		  "chip.paused": "paused",
		  "chip.degraded": "degraded",
		  "chip.title": "Session memory (click to configure)",
		  "err.load": "Load failed, click to retry",
		  // ── Workspace shell ──
		  "ws.title": "Memory Workspace",
		  "ws.tab.overview": "Overview",
		  "ws.tab.library": "Library",
		  "ws.tab.automation": "Automation",
		  "ws.tab.insights": "Insights",
		  "ws.tab.maintenance": "Maintenance",
		  "ws.refresh": "Refresh",
		  "ws.retry": "Retry",
		  "ws.loading": "Loading…",
		  "ws.loadFail": "Failed to load data",
		  "ws.copy": "Copy",
		  "ws.copied": "Copied",
		  "ws.copyFail": "Copy failed",
		  "ws.all": "All",
		  "ago.now": "just now",
		  "ago.min": "{n} min ago",
		  "ago.hour": "{n} h ago",
		  "ago.day": "{n} d ago",
		  // ── Overview ──
		  "ov.runningOk": "Running normally",
		  "ov.runningWarn": "Retrieval degraded",
		  "ov.runningDown": "Storage unavailable, memory disabled",
		  "ov.subsys.store": "Storage",
		  "ov.subsys.fts": "Full-text",
		  "ov.subsys.vec": "Vector",
		  "ov.subsys.queue": "Distill queue",
		  "ov.sys.ok": "OK",
		  "ov.sys.keyword": "Degraded · keyword only",
		  "ov.sys.vectorOnly": "Degraded · vector only",
		  "ov.sys.none": "Disabled",
		  "ov.sys.pending": "{n} pending",
		  "ov.sys.idle": "Idle",
		  "ov.attention": "Needs attention",
		  "ov.attn.pending": "{n} pending distill",
		  "ov.attn.vector": "Vector retrieval degraded",
		  "ov.attn.degraded": "Storage degraded, memory disabled",
		  "ov.recent": "Recent activity",
		  "ov.kg.l1": "Memories",
		  "ov.kg.scenes": "Scenes",
		  "ov.kg.week": "Output this week",
		  "ov.kg.weekSub": "{n} calls",
		  "ov.kg.lastDistill": "Last distill",
		  "ov.kg.never": "Not yet",
		  "ov.goto.library": "Open library",
		  "ov.goto.automation": "Automation",
		  "ov.goto.insights": "Insights",
		  "ov.goto.maintenance": "Maintenance",
		  "ov.empty.title": "No memories yet",
		  "ov.empty.body": "Start a conversation. Content is captured first, then distilled in the background into recallable memories.",
		  "ov.empty.capture": "Capture",
		  "ov.empty.distill": "Distill",
		  "ov.empty.recall": "Recall",
		  "ov.empty.capOk": "All three capabilities are enabled.",
		  // ── Library (read-only asset feed) ──
		  "lib.search": "Search memories, scenes and personas…",
		  "lib.filter.type": "Type",
		  "lib.filter.scope": "Scope",
		  "lib.filter.time": "Time",
		  "lib.time.today": "Today",
		  "lib.time.d7": "7d",
		  "lib.time.d30": "30d",
		  "lib.count": "{n} results",
		  "lib.countFiltered": "{n} results · filtered",
		  "lib.empty": "No matching memory assets",
		  "lib.emptyHint": "Adjust filters, or keep chatting to create new memories.",
		  "lib.truncated": "Search hit the retrieval cap (200); older results are not shown.",
		  "lib.more": "Load more",
		  "lib.loadingMore": "Loading…",
		  "kind.l1": "Memory",
		  "kind.l2": "Scene",
		  "kind.l3": "Persona",
		  "type.persona": "Persona",
		  "type.episodic": "Episodic",
		  "type.instruction": "Instruction",
		  "type.work_fact": "Work fact",
		  "type.work_task": "Work task",
		  "type.work_method": "Work method",
		  "type.work_artifact": "Artifact",
		  "verb.new": "New",
		  "verb.upd": "Updated",
		  "lib.meta.type": "Type",
		  "lib.meta.created": "Created",
		  "lib.meta.updated": "Updated",
		  "lib.meta.version": "Version",
		  "lib.meta.source": "Source session",
		  "lib.meta.scene": "Scene",
		  // ── Automation ──
		  "au.basic": "Basic controls",
		  "au.sw.master": "Master switch",
		  "au.sw.masterOn": "On: capture and distill memories",
		  "au.sw.masterOff": "Off: no capture, distillation or recall (data kept)",
		  "au.sw.capture": "Capture",
		  "au.sw.captureD": "Write conversations to L0",
		  "au.sw.distill": "Distill",
		  "au.sw.distillD": "Distill L0 into memories, scenes and personas",
		  "au.sw.recall": "Recall",
		  "au.sw.recallD": "Inject relevant memories (global)",
		  "au.emb": "Semantic retrieval",
		  "au.emb.remote": "Remote · {m}",
		  "au.emb.local": "Local · {m}",
		  "au.emb.off": "Off",
		  "au.route": "Distill route",
		  "au.route.cur": "{m} · {n} fallbacks",
		  "au.route.follow": "Follows the default model",
		  "au.ceiling": "Disabled by deployment: {s} (runtime switches cannot enable it)",
		  "au.advTitle": "Advanced routing and budgets",
		  "au.advHint": "Deployment-locked entries render read-only",
		  "au.embTitle": "Embedding models",
		  "au.unsupported": "Settings service unavailable; runtime switches inactive (memory stays on).",
		  // ── Insights ──
		  "in.tab.cost": "Cost",
		  "in.tab.activity": "Activity",
		  "in.tab.recall": "Recall",
		  "in.act.chart": "Asset activity, 7 days",
		  "in.act.byLayer": "Distill calls and failures (this run)",
		  "in.act.layer": "Layer",
		  "in.act.calls": "Calls",
		  "in.act.fail": "Failures",
		  "in.act.l1x": "L1 extract",
		  "in.act.l1d": "L1 dedup",
		  "in.act.l2": "L2 scenes",
		  "in.act.l3": "L3 persona",
		  "in.rc.turns": "Injected turns",
		  "in.rc.sessions": "Sessions with retrieval",
		  "in.rc.hits": "Memories injected",
		  "in.rc.hitTurns": "Hit turns",
		  "in.rc.timeouts": "Recall timeouts",
		  "in.rc.suppressed": "Suppressed by dedupe",
		  "in.rc.disabled": "Disabled distribution",
		  "in.rc.globalOn": "Global recall on",
		  "in.rc.globalOff": "Global recall off",
		  "in.rc.modeOff": "Sessions paused",
		  "in.rc.wo": "Write-only sessions",
		  "in.rc.empty": "No recall data this run (counters are in-process, reset on restart).",
		  // ── Maintenance ──
		  "mt.health": "Health",
		  "mt.store.down": "Unavailable (degraded)",
		  "mt.retrieval.hybrid": "Full-text + vector",
		  "mt.unknown": "Unknown",
		  "mt.row.dataDir": "Data directory",
		  "mt.row.version": "Plugin version",
		  "mt.row.l0": "Captured today",
		  "mt.log": "Diagnostic log",
		  "mt.danger": "Danger zone"
		};
		var FALLBACK = zh;
		var bound = null;
		var inited2 = false;
		function initI18n(ctx) {
		  if (inited2) return;
		  inited2 = true;
		  const get = ctx?.get;
		  if (typeof get !== "function") return;
		  let locale;
		  try {
		    locale = get.call(ctx, "locale");
		  } catch {
		    return;
		  }
		  const l = locale;
		  if (!l || typeof l.register !== "function" || typeof l.bind !== "function") return;
		  try {
		    l.register("dsh-memory", { zh, en });
		    const t2 = l.bind("dsh-memory");
		    if (typeof t2 !== "function") return;
		    bound = (key) => {
		      const s = t2(key);
		      return typeof s === "string" && s !== key && s !== "" ? s : FALLBACK[key] ?? key;
		    };
		  } catch {
		    bound = null;
		  }
		}
		function t(key) {
		  if (bound) {
		    const s = String(bound(key));
		    if (s) return s;
		  }
		  return FALLBACK[key] ?? key;
		}
		function tpl(key, params) {
		  let s = t(key);
		  for (const [k, v] of Object.entries(params)) {
		    s = s.split(`{${k}}`).join(String(v));
		  }
		  return s;
		}
		function fmtAgoLocal(iso) {
		  if (!iso) return null;
		  const time = new Date(iso).getTime();
		  if (!time) return null;
		  let s = Math.floor((Date.now() - time) / 1e3);
		  if (s < 0) s = 0;
		  if (s < 45) return t("ago.now");
		  if (s < 3600) return tpl("ago.min", { n: Math.floor(s / 60) });
		  if (s < 86400) return tpl("ago.hour", { n: Math.floor(s / 3600) });
		  return tpl("ago.day", { n: Math.floor(s / 86400) });
		}
		function typeLabel(key) {
		  const k = "type." + key;
		  const s = t(k);
		  return s === k ? key : s;
		}
		
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
		    "  --dsh-mem-warn: #a8821c;",
		    "  --dsh-mem-ok: #1f9d55;",
		    // 原生芯片 chevron 图标色（Sh0Q9G_chevron 源码：var(--dsw-alias-label-caption)；
		    // fallback 为双主题真机实测值：浅 #ADB2B8 / 暗 #81858C）
		    "  --dsh-mem-chev: var(--dsw-alias-label-caption, #adb2b8);",
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
		    "  --dsh-mem-warn: #d9b23c;",
		    "  --dsh-mem-ok: #52c98d;",
		    "  --dsh-mem-chev: var(--dsw-alias-label-caption, #81858c);",
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
		    // ── 工作台五区任务导航（设置侧，spec v2 §5）：sticky 胶囊分段 + aria-selected，
		    //    箭头键巡游在 panel 侧（roving tabindex） ──
		    ".dsh-mem-ws-tabs {",
		    "  position: sticky; top: 0; z-index: 10; display: flex; gap: 2px; margin: 12px 0 14px; padding: 3px;",
		    "  background: var(--dsh-mem-bg-card); border: 1px solid var(--dsh-mem-border);",
		    "  border-radius: 10px; box-shadow: var(--dsh-mem-shadow-card); overflow-x: auto;",
		    "}",
		    ".dsh-mem-ws-tab {",
		    "  flex: 1; min-width: 64px; height: 32px; border-radius: 8px; font: inherit; font-size: 12.5px;",
		    "  display: flex; align-items: center; justify-content: center; white-space: nowrap;",
		    "  color: var(--dsh-mem-text-2); background: none; border: none; cursor: pointer;",
		    "}",
		    ".dsh-mem-ws-tab:hover { background: var(--dsh-mem-bg-hover); }",
		    '.dsh-mem-ws-tab[aria-selected="true"] { background: var(--dsh-mem-accent-weak); color: var(--dsh-mem-accent-text); font-weight: 600; }',
		    ".dsh-mem-ws-tab:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: -2px; }",
		    // ── 资产活动流行（记忆库/总览最近活动）：行内原位展开 ──
		    ".dsh-mem-feed-row { border-bottom: 1px solid var(--dsh-mem-border); }",
		    ".dsh-mem-feed-row:last-child { border-bottom: none; }",
		    ".dsh-mem-feed-head {",
		    "  display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;",
		    "  padding: 9px 4px; text-align: left; font: inherit; font-size: 12.5px;",
		    "  color: var(--dsh-mem-text-1); background: none; border: none; cursor: pointer;",
		    "}",
		    ".dsh-mem-feed-head:hover { background: var(--dsh-mem-bg-hover); border-radius: 8px; }",
		    ".dsh-mem-feed-head:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: -2px; border-radius: 8px; }",
		    ".dsh-mem-feed-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }",
		    ".dsh-mem-feed-time { color: var(--dsh-mem-text-3); font-size: 11px; flex: none; font-variant-numeric: tabular-nums; }",
		    ".dsh-mem-feed-chev { color: var(--dsh-mem-text-3); flex: none; transition: transform .15s ease; display: inline-block; }",
		    ".dsh-mem-feed-row.open .dsh-mem-feed-chev { transform: rotate(90deg); }",
		    // 动词/类型/族小标（4px 小圆角刻度感；tint 底不描边）
		    ".dsh-mem-vtag {",
		    "  flex: none; font-size: 11px; line-height: 16px; border-radius: 4px; padding: 0 5px;",
		    "  color: var(--dsh-mem-vtag-c, var(--dsh-mem-text-2));",
		    "  background: color-mix(in srgb, var(--dsh-mem-vtag-c, #8a93a1) 12%, transparent);",
		    "}",
		    ".dsh-mem-vtag-new { --dsh-mem-vtag-c: var(--dsh-mem-ok); }",
		    ".dsh-mem-vtag-upd { --dsh-mem-vtag-c: var(--dsh-mem-accent-text); }",
		    ".dsh-mem-typetag {",
		    "  flex: none; font-size: 11px; line-height: 16px; border-radius: 4px; padding: 0 5px;",
		    "  color: var(--dsh-mem-text-2); background: var(--dsh-mem-bg-inset);",
		    "}",
		    // ── 披露头（自动化高级区/嵌入模型、维护日志）：点击展开，chev 旋转 ──
		    ".dsh-mem-disc {",
		    "  display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;",
		    "  padding: 10px 2px; font: inherit; font-size: 13px; font-weight: 600; text-align: left;",
		    "  color: var(--dsh-mem-text-1); background: none; border: none; cursor: pointer;",
		    "}",
		    ".dsh-mem-disc:hover { color: var(--dsh-mem-accent-text); }",
		    ".dsh-mem-disc:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: 2px; border-radius: 8px; }",
		    ".dsh-mem-disc-chev { color: var(--dsh-mem-text-3); transition: transform .15s ease; display: inline-block; }",
		    '.dsh-mem-disc[aria-expanded="true"] .dsh-mem-disc-chev { transform: rotate(90deg); }',
		    // ── 维护危险区（error 色淡描边容器） ──
		    ".dsh-mem-danger { border-color: color-mix(in srgb, var(--dsh-mem-danger) 35%, transparent); }",
		    // ── 语义 chip（总览子系统/注意区）：tint 底 + 语义色，--dsh-mem-chip-c 由修饰类给定 ──
		    ".dsh-mem-chip {",
		    "  display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 1px 9px;",
		    "  font-size: 11px; line-height: 16px; white-space: nowrap;",
		    "  color: var(--dsh-mem-chip-c, var(--dsh-mem-text-2));",
		    "  background: color-mix(in srgb, var(--dsh-mem-chip-c, #8a93a1) 10%, transparent);",
		    "}",
		    ".dsh-mem-chip-ok { --dsh-mem-chip-c: var(--dsh-mem-ok); }",
		    ".dsh-mem-chip-warn { --dsh-mem-chip-c: var(--dsh-mem-warn); }",
		    ".dsh-mem-chip-err { --dsh-mem-chip-c: var(--dsh-mem-danger); }",
		    ".dsh-mem-chip-biz { --dsh-mem-chip-c: var(--dsh-mem-accent-text); }",
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
		    // ── 触屏隐形热区（手机端适配）：触点目标补足 44px 标准（iOS HIG）。
		    // 伪元素不参与布局（浮层/输入栏几何零变化），指针事件落在宿主元素上。
		    // 全端统一不做 pointer:coarse 分端（桌面点中目标变大是纯收益）。
		    // pill：视觉高 24px，::after 上下各外扩 10px；只上下不左右——左右是宿主输入栏
		    // 邻位控件（模式选择器），外扩制造误触重叠带。
		    // 滑轨：视觉轨 22px，::before 上下各外扩 11px；touch-action:none 已随轨声明，
		    // 伪元素区的触摸同样命中轨元素。两处 px 值改须与注释口径同步 ──
		    ".dsh-mem-pill-hit::after {",
		    "  content: ''; position: absolute; left: 0; right: 0; top: -10px; bottom: -10px;",
		    "}",
		    ".dsh-mem-hitband::before {",
		    "  content: ''; position: absolute; left: 0; right: 0; top: -11px; bottom: -11px;",
		    "}",
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
		    // ── 会话记忆芯片（分散式，spec v2 §4.1）：逐字对齐原生访问模式触发钮
		    //    （dsh-client-ui-conversation 源码 .Sh0Q9G_trigger）：13px/500/r24/padding 8·4/
		    //    gap4/label-secondary/透明底/min-width 0/max-width 220；原生无 hover 与展开底色
		    //    （仅 chevron 旋转反馈），故此处同样不加；focus-visible 环是键盘无障碍超集，保留 ──
		    ".dsh-mem-mchip {",
		    "  display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 4px 0 8px;",
		    "  min-width: 0; max-width: 220px;",
		    "  border: none; background: transparent; border-radius: 24px; cursor: pointer;",
		    "  color: var(--dsh-mem-text-2); font: inherit; font-size: 13px; font-weight: 500; line-height: 20px; white-space: nowrap;",
		    "}",
		    ".dsh-mem-mchip .mc-label { text-overflow: ellipsis; white-space: nowrap; min-width: 0; overflow: hidden; }",
		    ".dsh-mem-mchip:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: 1px; }",
		    ".dsh-mem-mchip-chev { display: inline-flex; flex: none; color: var(--dsh-mem-chev); transition: transform .12s ease; }",
		    // 展开态箭头翻转 180°（原生 .Sh0Q9G_chevronOpen 源码：rotate(180deg)，transition transform .12s）
		    '.dsh-mem-mchip[aria-expanded="true"] .dsh-mem-mchip-chev { transform: rotate(180deg); }',
		    ".dsh-mem-mchip-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsh-mem-track); flex: none; }",
		    ".dsh-mem-mchip-dot.warn { background: var(--dsh-mem-warn); }",
		    // ── 级联菜单（芯片点击展开，向上、左缘对齐芯片）：dsh 原生菜单同配方浮层；
		    //    行复用 .dsh-mem-pop-opt；行尾当前值 + › 展开指示。
		    //    间距 4px / min-width 218 对齐原生下拉实测；行尺寸 14px·40px·padding 8/10·
		    //    圆角 10（原生菜单条目实测，settings 页 NSel 下拉不受影响——作用域限定在菜单内） ──
		    ".dsh-mem-menu {",
		    "  position: absolute; bottom: calc(100% + 4px); left: 0; z-index: 1000; min-width: 218px; max-width: 360px; padding: 4px;",
		    "  background: var(--dsh-mem-bg-pop); border: 1px solid var(--dsh-mem-border-pop);",
		    "  border-radius: 12px; box-shadow: var(--dsh-mem-shadow-pop); color: var(--dsh-mem-text-1);",
		    "}",
		    ".dsh-mem-menu .dsh-mem-pop-opt, .dsh-mem-sub .dsh-mem-pop-opt {",
		    "  font-size: 14px; line-height: 22px; min-height: 40px; padding: 8px 10px;",
		    "}",
		    ".dsh-mem-menu .dsh-mem-pop-opt-label, .dsh-mem-sub .dsh-mem-pop-opt-label { line-height: 22px; }",
		    ".dsh-mem-subval { margin-left: auto; color: var(--dsh-mem-text-3); margin-right: 8px; font-variant-numeric: tabular-nums; }",
		    ".dsh-mem-subchev { color: var(--dsh-mem-text-3); font-size: 10px; transition: transform .15s ease; display: inline-block; }",
		    ".dsh-mem-sl-row.on .dsh-mem-subchev { transform: rotate(90deg); }",
		    // ── hover 二级子面板：仅 hover 展开（点击不固定）；::before 桥接热区盖住
		    //    行与子卡片之间的空隙，慢速移动不断悬停链（10px 宽 > 6px 间隙 + 2px 重叠） ──
		    ".dsh-mem-subwrap { position: relative; }",
		    ".dsh-mem-sub {",
		    "  position: absolute; display: none; top: -5px; left: calc(100% + 6px); min-width: 150px; z-index: 5; padding: 4px;",
		    "  background: var(--dsh-mem-bg-pop); border: 1px solid var(--dsh-mem-border-pop);",
		    "  border-radius: 12px; box-shadow: var(--dsh-mem-shadow-pop);",
		    "}",
		    ".dsh-mem-sub::before {",
		    "  content: ''; position: absolute; left: -10px; top: 0; width: 10px; height: 100%;",
		    "}",
		    ".dsh-mem-subwrap:hover .dsh-mem-sub, .dsh-mem-subwrap:focus-within .dsh-mem-sub { display: block; }",
		    '.dsh-mem-subwrap .dsh-mem-pop-opt[aria-hidden="true"] { cursor: default; }',
		    // ── 记忆滑条（Codex 式内联展开，spec v2 §4.3）：grid-rows 0fr→1fr 原地长高；
		    //    灰胶囊轨 + accent-fill 填充 + 白圆钮 + 三停点 + 上方档位标签 ──
		    ".dsh-mem-sl-reveal {",
		    "  display: grid; grid-template-rows: 0fr; opacity: 0; visibility: hidden;",
		    "  transition: grid-template-rows .26s cubic-bezier(.2,.7,.3,1), opacity .2s ease, visibility .26s;",
		    "}",
		    ".dsh-mem-sl-reveal.open { grid-template-rows: 1fr; opacity: 1; visibility: visible; }",
		    ".dsh-mem-sl-inner { overflow: hidden; min-height: 0; }",
		    ".dsh-mem-sl-labels { display: flex; justify-content: space-between; font-size: 11px; color: var(--dsh-mem-text-3); padding: 10px 10px 6px; }",
		    ".dsh-mem-sl-track { position: relative; height: 26px; border-radius: 999px; background: var(--dsh-mem-bg-inset); cursor: pointer; margin: 0 10px 12px; touch-action: none; }",
		    ".dsh-mem-sl-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: var(--dsh-mem-accent-fill); transition: width .18s ease; }",
		    ".dsh-mem-sl-dot { position: absolute; top: 50%; width: 4px; height: 4px; border-radius: 50%; background: var(--dsh-mem-dot); transform: translate(-50%,-50%); }",
		    ".dsh-mem-sl-thumb { position: absolute; top: 50%; width: 22px; height: 22px; border-radius: 50%; background: var(--dsh-mem-thumb); transform: translate(-50%,-50%); box-shadow: 0 1px 4px rgba(0,0,0,.28); cursor: grab; transition: left .18s ease; }",
		    ".dsh-mem-sl-thumb.dragging { transition: none; cursor: grabbing; box-shadow: 0 2px 10px rgba(0,0,0,.35); }",
		    ".dsh-mem-sl-thumb:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: 2px; }",
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
		    "  .dsh-mem-root, .dsh-mem-root *, .dsh-mem-btn, .dsh-mem-input, .dsh-mem-select, .dsh-mem-rb-fill, .dsh-mem-sel-chev, .dsh-mem-sl-reveal, .dsh-mem-sl-fill, .dsh-mem-sl-thumb, .dsh-mem-subchev, .dsh-mem-feed-chev, .dsh-mem-disc-chev, .dsh-mem-mchip-chev { transition: none; }",
		    "  .dsh-mem-flow { animation: none; }",
		    "}"
		  ].join("\n");
		  document.head.appendChild(el);
		}
		
		// client/src/env.ts
		function hostRequire(id) {
		  return require(id);
		}
		
		// client/src/chat/MemoryChip.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		var PRIMS = (() => {
		  try {
		    return hostRequire("@deepseek-ai/dsh-client-ui-primitives");
		  } catch {
		    return null;
		  }
		})();
		var SLIDER_SCOPES = ["chat", "work", "auto"];
		var FLOW_KEYS = ["follow", "rw", "wo", "paused"];
		var scopeLabel = (k) => t("scope." + k);
		var flowLabel = (k) => t("flow." + k);
		function useMaxHeightFallback(ref, cap, signal) {
		  const [mh, setMh] = (0, import_react.useState)(cap);
		  (0, import_react.useLayoutEffect)(() => {
		    const fit = () => {
		      const el = ref.current;
		      if (!el) return;
		      setMh(Math.min(cap, Math.max(0, el.getBoundingClientRect().bottom - 12)));
		    };
		    fit();
		    window.addEventListener("resize", fit);
		    window.addEventListener("scroll", fit, true);
		    return () => {
		      window.removeEventListener("resize", fit);
		      window.removeEventListener("scroll", fit, true);
		    };
		  }, [ref, cap, signal]);
		  return mh;
		}
		var useMenuMaxHeight = PRIMS?.useAnchoredMaxHeight ?? useMaxHeightFallback;
		function MemoryChip(props) {
		  const rpc = props.rpc;
		  const sessionId = props.sessionId || props.session && props.session.sessionId;
		  const [mode, setMode] = (0, import_react.useState)(null);
		  const [recall, setRecall] = (0, import_react.useState)(null);
		  const [recallResolved, setRecallResolved] = (0, import_react.useState)(true);
		  const [resumeScope, setResumeScope] = (0, import_react.useState)(null);
		  const [error, setError] = (0, import_react.useState)(null);
		  const [menuOpen, setMenuOpen] = (0, import_react.useState)(false);
		  const [sliderOpen, setSliderOpen] = (0, import_react.useState)(false);
		  const [previewScope, setPreviewScope] = (0, import_react.useState)(null);
		  const wrapRef = (0, import_react.useRef)(null);
		  const menuRef = (0, import_react.useRef)(null);
		  const seqRef = (0, import_react.useRef)(0);
		  const load = (0, import_react.useCallback)(() => {
		    if (!sessionId || !rpc) return;
		    const token = ++seqRef.current;
		    setError(null);
		    rpc("dsh-memory/session-mode-get", { sessionId }).then((r) => {
		      if (token !== seqRef.current) return;
		      if (r && r.ok && r.value) {
		        setMode(r.value.mode);
		        setRecall(r.value.recall);
		        setRecallResolved(r.value.recallResolved);
		        const resume = r.value.resume;
		        setResumeScope(resume ? resume.scope : null);
		      } else setError(r && !r.ok ? r.error.message : "RPC error");
		    }).catch((e) => {
		      if (token !== seqRef.current) return;
		      setError(String(e && e.message || e));
		    });
		  }, [sessionId, rpc]);
		  (0, import_react.useEffect)(() => {
		    load();
		  }, [load]);
		  (0, import_react.useEffect)(() => {
		    watchSidebarIcon();
		  }, []);
		  (0, import_react.useEffect)(() => {
		    initOccupancyIndicator(
		      (endpoint, payload) => rpc(endpoint, payload)
		    );
		    initPanelSection(currentMeterSnapshot);
		    watchContextMeter();
		    noteOccupancySession(sessionId ?? null);
		  }, [sessionId, rpc]);
		  (0, import_react.useEffect)(() => {
		    if (!menuOpen) return;
		    const onDown = (e) => {
		      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
		        setMenuOpen(false);
		        setSliderOpen(false);
		      }
		    };
		    const onKey = (e) => {
		      if (e.key === "Escape") {
		        setMenuOpen(false);
		        setSliderOpen(false);
		      }
		    };
		    document.addEventListener("pointerdown", onDown);
		    document.addEventListener("keydown", onKey);
		    return () => {
		      document.removeEventListener("pointerdown", onDown);
		      document.removeEventListener("keydown", onKey);
		    };
		  }, [menuOpen]);
		  const commitMode = (next) => {
		    if (!rpc || !sessionId || mode === null || next === mode) return;
		    const prev = mode;
		    const token = seqRef.current;
		    setMode(next);
		    setError(null);
		    rpc("dsh-memory/session-mode-set", { sessionId, mode: next }).then((r) => {
		      if (token !== seqRef.current) return;
		      if (!r || !r.ok) {
		        setMode(prev);
		        setError((r && r.error ? r.error.message : "") || "mode set failed");
		      } else {
		        setResumeScope(r.value.resume ? r.value.resume.scope : null);
		      }
		    }).catch((e) => {
		      if (token !== seqRef.current) return;
		      setMode(prev);
		      setError(String(e && e.message || e));
		    });
		  };
		  const applyFlow = (k) => {
		    if (!rpc || !sessionId || mode === null) return;
		    if (k === "paused") {
		      commitMode("off");
		      return;
		    }
		    const targetScope = paused ? resumeScope ?? "auto" : mode;
		    const recallVal = k === "rw" ? true : k === "wo" ? false : null;
		    if (!paused && recallVal === recall) return;
		    const prevMode = mode;
		    const prevRecall = recall;
		    const prevResolved = recallResolved;
		    const token = seqRef.current;
		    setMode(targetScope);
		    setRecall(recallVal);
		    if (recallVal !== null) setRecallResolved(recallVal);
		    setError(null);
		    rpc("dsh-memory/session-mode-set", { sessionId, mode: targetScope, recall: recallVal }).then((r) => {
		      if (token !== seqRef.current) return;
		      if (!r || !r.ok) {
		        setMode(prevMode);
		        setRecall(prevRecall);
		        setRecallResolved(prevResolved);
		        setError((r && r.error ? r.error.message : "") || "flow set failed");
		      } else {
		        setRecall(r.value.recall);
		        setRecallResolved(r.value.recallResolved);
		        const resume = r.value.resume;
		        setResumeScope(resume ? resume.scope : null);
		      }
		    }).catch((e) => {
		      if (token !== seqRef.current) return;
		      setMode(prevMode);
		      setRecall(prevRecall);
		      setRecallResolved(prevResolved);
		      setError(String(e && e.message || e));
		    });
		  };
		  if (!sessionId || !rpc) return null;
		  ensureThemeStyle();
		  const paused = mode === "off";
		  const scope = paused ? resumeScope ?? "auto" : mode ?? "auto";
		  const flow = paused ? "paused" : recall === false ? "wo" : recall === true ? "rw" : "follow";
		  const shownScope = previewScope ?? scope;
		  const label = paused ? `${t("chip.base")} · ${t("chip.paused")}` : `${t("chip.base")} · ${t("scope." + shownScope)}${recallResolved ? "" : " · " + t("chip.wo")}`;
		  const toggleMenu = () => {
		    if (error) load();
		    setSliderOpen(false);
		    setMenuOpen(!menuOpen);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: wrapRef, style: { position: "relative", display: "inline-flex" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		      "button",
		      {
		        type: "button",
		        className: "dsh-mem-mchip",
		        "aria-haspopup": "menu",
		        "aria-expanded": menuOpen,
		        title: error ? t("err.load") : t("chip.title"),
		        onClick: toggleMenu,
		        children: [
		          paused ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-mem-mchip-dot", "aria-hidden": true }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mc-label", children: label }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-mem-mchip-chev", "aria-hidden": true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "path",
		            {
		              d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
		              fill: "currentColor"
		            }
		          ) }) })
		        ]
		      }
		    ),
		    menuOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-mem-menu", ref: menuRef, role: "menu", "aria-label": t("chip.base"), children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		        "button",
		        {
		          type: "button",
		          className: "dsh-mem-pop-opt dsh-mem-sl-row" + (sliderOpen ? " on" : ""),
		          disabled: paused,
		          "aria-expanded": sliderOpen,
		          onClick: () => setSliderOpen(!sliderOpen),
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-mem-pop-opt-label", children: t("row.scope") }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-mem-subval", children: scopeLabel(shownScope) }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-mem-subchev", "aria-hidden": true, children: "›" })
		          ]
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-mem-sl-reveal" + (sliderOpen ? " open" : ""), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-mem-sl-inner", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-mem-sl-labels", "aria-hidden": true, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: scopeLabel("chat") }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: scopeLabel("work") }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: scopeLabel("auto") })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          ScopeSlider,
		          {
		            scope,
		            disabled: paused,
		            onPreview: (k) => setPreviewScope(k),
		            onCommit: (k) => {
		              setPreviewScope(null);
		              commitMode(k);
		            }
		          }
		        )
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-mem-subwrap", hidden: sliderOpen, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "button",
		          {
		            type: "button",
		            className: "dsh-mem-pop-opt",
		            tabIndex: 0,
		            "aria-haspopup": "menu",
		            onMouseDown: (e) => {
		              e.preventDefault();
		            },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-mem-pop-opt-label", children: t("row.flow") }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-mem-subval", children: flowLabel(flow) }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-mem-subchev", "aria-hidden": "true", children: "›" })
		            ]
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-mem-sub", role: "menu", "aria-label": t("row.flow"), children: FLOW_KEYS.map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "button",
		          {
		            type: "button",
		            role: "menuitemradio",
		            "aria-checked": flow === k,
		            className: "dsh-mem-pop-opt" + (flow === k ? " on" : ""),
		            onClick: () => {
		              applyFlow(k);
		              setMenuOpen(false);
		              setSliderOpen(false);
		            },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-mem-pop-opt-label", children: flowLabel(k) }),
		              flow === k ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-mem-pop-check", children: "✓" }) : null
		            ]
		          },
		          k
		        )) })
		      ] })
		    ] }) : null,
		    error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { role: "alert", style: { position: "absolute", top: "100%", left: 0, fontSize: 11, color: "var(--dsh-mem-danger)", whiteSpace: "nowrap", zIndex: 2 }, children: t("err.load") }) : null
		  ] });
		}
		function ScopeSlider(props) {
		  ensureThemeStyle();
		  const trackRef = (0, import_react.useRef)(null);
		  const thumbRef = (0, import_react.useRef)(null);
		  const fillRef = (0, import_react.useRef)(null);
		  const [dragging, setDragging] = (0, import_react.useState)(false);
		  const idx = Math.max(0, SLIDER_SCOPES.indexOf(props.scope));
		  const place = (i) => {
		    const f = i / (SLIDER_SCOPES.length - 1);
		    if (thumbRef.current) thumbRef.current.style.left = `calc((100% - 22px) * ${f} + 11px)`;
		    if (fillRef.current) fillRef.current.style.width = `calc((100% - 22px) * ${f} + 22px)`;
		  };
		  (0, import_react.useLayoutEffect)(() => {
		    if (!dragging) place(idx);
		  });
		  const startDrag = (e) => {
		    if (props.disabled || dragging) return;
		    e.preventDefault();
		    e.currentTarget.setPointerCapture(e.pointerId);
		    setDragging(true);
		    const rect = trackRef.current.getBoundingClientRect();
		    const max = rect.width - 22;
		    let last = idx;
		    const onMove = (ev) => {
		      const x = Math.max(11, Math.min(11 + max, ev.clientX - rect.left));
		      if (thumbRef.current) thumbRef.current.style.left = x + "px";
		      if (fillRef.current) fillRef.current.style.width = x + 11 + "px";
		      const ni = Math.round((x - 11) / max * (SLIDER_SCOPES.length - 1));
		      if (ni !== last) {
		        last = ni;
		        props.onPreview(SLIDER_SCOPES[ni]);
		      }
		    };
		    const onUp = (ev) => {
		      thumbRef.current?.releasePointerCapture(e.pointerId);
		      window.removeEventListener("pointermove", onMove);
		      window.removeEventListener("pointerup", onUp);
		      setDragging(false);
		      const x = Math.max(11, Math.min(11 + max, ev.clientX - rect.left));
		      props.onCommit(SLIDER_SCOPES[Math.round((x - 11) / max * (SLIDER_SCOPES.length - 1))]);
		    };
		    window.addEventListener("pointermove", onMove);
		    window.addEventListener("pointerup", onUp);
		  };
		  const onKeyDown = (e) => {
		    if (props.disabled) return;
		    let next = null;
		    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, idx - 1);
		    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(SLIDER_SCOPES.length - 1, idx + 1);
		    else if (e.key === "Home") next = 0;
		    else if (e.key === "End") next = SLIDER_SCOPES.length - 1;
		    if (next === null) return;
		    e.preventDefault();
		    props.onCommit(SLIDER_SCOPES[next]);
		  };
		  const dots = SLIDER_SCOPES.map((_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    "span",
		    {
		      className: "dsh-mem-sl-dot",
		      style: { left: `calc((100% - 22px) * ${i / (SLIDER_SCOPES.length - 1)} + 11px)` }
		    },
		    i
		  ));
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		    "div",
		    {
		      ref: trackRef,
		      className: "dsh-mem-sl-track",
		      style: props.disabled ? { opacity: 0.45, cursor: "default" } : void 0,
		      onPointerDown: startDrag,
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: fillRef, className: "dsh-mem-sl-fill" }),
		        dots,
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "div",
		          {
		            ref: thumbRef,
		            className: "dsh-mem-sl-thumb" + (dragging ? " dragging" : ""),
		            role: "slider",
		            tabIndex: props.disabled ? -1 : 0,
		            "aria-label": t("row.scope"),
		            "aria-valuemin": 0,
		            "aria-valuemax": SLIDER_SCOPES.length - 1,
		            "aria-valuenow": idx,
		            "aria-valuetext": scopeLabel(SLIDER_SCOPES[idx]),
		            onKeyDown,
		            children: dragging ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-mem-bubble", style: { left: "50%" }, children: scopeLabel(SLIDER_SCOPES[idx]) }) : null
		          }
		        )
		      ]
		    }
		  );
		}
		
		// client/src/chat/stats-segment.tsx
		var import_react2 = require("react");
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function StatsSegment(props) {
		  const rpc = props.rpc;
		  const sessionId = props.sessionId;
		  const [stats, setStats] = (0, import_react2.useState)(null);
		  const busyRef = (0, import_react2.useRef)(false);
		  (0, import_react2.useEffect)(() => {
		    if (!rpc || !sessionId) return void 0;
		    let alive = true;
		    let timer = null;
		    let seq = 0;
		    const tick = () => {
		      const token = ++seq;
		      rpc("dsh-memory/session-stats", { sessionId }).then((r) => {
		        if (!alive || token !== seq) return;
		        if (r && r.ok && r.value && r.value.supported) {
		          const v = r.value;
		          setStats(v);
		          const d = v.distill || {};
		          const g = v.global || {};
		          busyRef.current = (d.pendingSlice || 0) > 0 || (d.parkedSlices || 0) > 0 || (g.pendingTotal || 0) > 0;
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
		  if (!stats) return null;
		  const di = stats.distill || {};
		  const pending = (di.pendingSlice || 0) + (di.parkedSlices || 0);
		  if (pending <= 0) return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		    "div",
		    {
		      style: {
		        fontSize: 12,
		        lineHeight: "20px",
		        color: "var(--dsh-mem-text-3)",
		        textAlign: "center",
		        padding: "0 0 2px",
		        fontVariantNumeric: "tabular-nums"
		      },
		      title: "本会话待蒸馏切片（含暂停挂起）",
		      children: [
		        "待蒸馏 ",
		        pending
		      ]
		    }
		  );
		}
		
		// client/src/panel.tsx
		var import_react17 = require("react");
		
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
		
		// client/src/workspace/Automation.tsx
		var import_react9 = require("react");
		
		// client/src/ui/controls.tsx
		var import_jsx_runtime3 = require("react/jsx-runtime");
		function Switch(props) {
		  const on = !!props.checked;
		  const disabled = !!props.disabled;
		  const base = { ...S.switch, ...on ? S.switchOn : S.switchOff, ...disabled ? S.switchDisabled : null };
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		    "div",
		    {
		      style: base,
		      onClick: () => {
		        if (!disabled && props.onChange) props.onChange(!on);
		      },
		      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...S.knob, left: on ? 18 : 2 } })
		    }
		  );
		}
		function SwitchRow(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.switchRow, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Switch, { checked: props.checked, disabled: props.disabled, onChange: props.onChange }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.switchLabel, children: props.label }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.switchDesc, children: props.desc || "" })
		    ] })
		  ] });
		}
		function Segmented(props) {
		  const value = props.value;
		  const disabled = !!props.disabled;
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.seg, ...disabled ? S.switchDisabled : null }, children: props.options.map((opt, i) => {
		    const on = opt.key === value;
		    const optDisabled = disabled || !!opt.disabled;
		    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		      "span",
		      {
		        title: opt.disabledTitle || opt.title || "",
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
		
		// client/src/tabs/DistillSettings.tsx
		var import_react7 = require("react");
		
		// client/src/tabs/BudgetInputs.tsx
		var import_react4 = require("react");
		
		// client/src/ui/primitives.tsx
		var import_react3 = require("react");
		var P = null;
		try {
		  P = hostRequire("@deepseek-ai/dsh-client-ui-primitives");
		} catch {
		  P = null;
		}
		function NButton(props) {
		  if (P && P.Button) return (0, import_react3.createElement)(P.Button, { size: "sm", ...props });
		  const rest = { ...props };
		  delete rest.variant;
		  delete rest.icon;
		  rest.className = "dsh-mem-btn" + (rest.className ? " " + rest.className : "");
		  return (0, import_react3.createElement)("button", rest);
		}
		function NInput(props) {
		  if (P && P.Input) {
		    const inner = { ...props };
		    const layoutStyle = inner.style;
		    delete inner.style;
		    return (0, import_react3.createElement)("span", { style: layoutStyle }, (0, import_react3.createElement)(P.Input, inner));
		  }
		  const rest = { ...props };
		  rest.className = "dsh-mem-input" + (rest.className ? " " + rest.className : "");
		  return (0, import_react3.createElement)("input", rest);
		}
		function NModal(props) {
		  if (props.open === false) return null;
		  if (P && P.Modal) return (0, import_react3.createElement)(P.Modal, { closeLabel: "关闭", ...props });
		  return (0, import_react3.createElement)(
		    "div",
		    {
		      className: "dsh-mem-rb-overlay",
		      onClick: (e) => {
		        if (e.target === e.currentTarget && props.onClose) props.onClose();
		      }
		    },
		    (0, import_react3.createElement)(
		      "div",
		      { className: "dsh-mem-rb-modal" },
		      props.title ? (0, import_react3.createElement)("div", { style: { fontSize: 15, fontWeight: 600, marginBottom: 10 } }, props.title) : null,
		      props.children,
		      props.footer ? (0, import_react3.createElement)(
		        "div",
		        { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 } },
		        props.footer
		      ) : null
		    )
		  );
		}
		
		// client/src/tabs/BudgetInputs.tsx
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
		  const effNote = layers.map((l) => eff[l[0]] || "?").join(" / ");
		  const rowLabel = (key) => key === "extract" ? "抽取输出" : key === "dedup" ? "去重输出" : key === "l2" ? "L2 输出" : "L3 输出";
		  const rowStyle = { display: "flex", alignItems: "center", gap: 8 };
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		    showOutputs ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginTop: 12 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		        "div",
		        {
		          style: S.switchLabel,
		          title: (scope === "l1" ? "L1 的抽取与去重是两次独立调用，输出限额各自设置（路由共用同一条链）。" : "") + "留空或 0 = 跟随默认（当前生效 " + effNote + "）；思考档 high/xhigh/max 时实际限额自动 ×4",
		          children: "输出预算"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }, children: layers.map((l) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: rowStyle, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { width: 68, flexShrink: 0, fontSize: 12, color: "var(--dsh-mem-text-2)" }, children: rowLabel(l[0]) }),
		        inputBox(
		          l[0],
		          l[1],
		          l[1] + " 输出预算（token，留空 = 默认 " + (def[l[0]] || "?") + "）",
		          110,
		          def[l[0]],
		          commitOutputs
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 11, color: "var(--dsh-mem-text-3)" }, children: "token" })
		      ] }, l[0])) })
		    ] }) : null,
		    showInput ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginTop: 12 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		        "div",
		        {
		          style: S.switchLabel,
		          title: "单次蒸馏调用的输入字符上限（≈token）：L1 抽取按此分块、L2/L3 超限截断；留空或 0 = 跟随配置（当前生效 " + (effIn || "?") + "，来自 llm.maxInputChars）",
		          children: "输入预算"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: rowStyle, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { width: 68, flexShrink: 0, fontSize: 12, color: "var(--dsh-mem-text-2)" }, children: "单次输入" }),
		        inputBox(
		          "input",
		          "输入",
		          "单次蒸馏输入字符上限（≈token，中文 1 字≈1 token；留空 = 跟随配置 " + (ib.fallback || "?") + "）",
		          110,
		          ib.fallback,
		          commitInput
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 11, color: "var(--dsh-mem-text-3)" }, children: "字符" })
		      ] }) })
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
		      let t2 = idx >= 0 ? idx : indexOfValue();
		      if (t2 < 0) t2 = 0;
		      if (options[t2]) pick(options[t2].id);
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
		        const t2 = next[0];
		        next[0] = next[1];
		        next[1] = t2;
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
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { ...STY.mono, color: "var(--dsh-mem-text-2)" }, children: e.provider + " / " + e.model }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { marginLeft: "auto", flexShrink: 0, fontSize: 11, color: "var(--dsh-mem-text-3)" }, children: e.effort ? "档位 " + e.effort : "跟随部署配置" })
		    ] }, "ro" + i);
		  }
		  if (info.pinned) {
		    const effPin = isLayer ? layerView?.effectiveChain ?? [] : info.chain && info.chain.effectiveChain || [];
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.wrap, children: [
		      effPin.map(roRow),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: STY.note, children: "部署已锁定路由（pin），调整请修改 cordis.patch.yml 中 llm 的配置。" })
		    ] });
		  }
		  if (rows === null) {
		    if (isLayer) {
		      const lv = layerView;
		      const src = lv?.source ?? "global";
		      if (src === "static" && lv) {
		        return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.wrap, children: [
		          lv.static.map((e, i) => roRow({ provider: e.provider, model: e.model, effort: e.reasoningEffort || "" }, i)),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NButton, { onClick: forkStatic, disabled, children: "自定义本层链" }) })
		        ] });
		      }
		      const previewRows = lv?.effectiveChain ?? [];
		      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.wrap, children: [
		        previewRows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: S.switchDesc, children: "本层跟随全局链，暂无可用路由。" }) : previewRows.map(roRow),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NButton, { onClick: forkStatic, disabled, children: "自定义本层链" }) })
		      ] });
		    }
		    const effFollow = info.chain && info.chain.effectiveChain || [];
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: STY.wrap, children: [
		      effFollow.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: S.switchDesc, children: "蒸馏跟随默认模型，未配置回退链。" }) : effFollow.map(roRow),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NButton, { onClick: forkStatic, disabled, children: "编辑为运行时链" }) })
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
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		      "div",
		      {
		        style: { ...S.switchDesc, marginBottom: 8 },
		        title: isLayer ? "本层链失败只在层内降级，绝不落到全局链；每行档位独立" : "第 1 行主路由；失败（报错/掐断/网络异常/空输出）按序降级；每行档位独立",
		        children: isLayer ? "主路由失败，只降级到本层回退" : "主路由失败，按序降级"
		      }
		    ),
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
		  hint: { fontSize: 11, color: "var(--dsh-mem-text-3)", margin: "0 0 8px" },
		  panelHead: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 },
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
		  l1: { seg: "L1", title: "L1 · 抽取 / 去重" },
		  l2: { seg: "L2", title: "L2 · 场景摘要" },
		  l3: { seg: "L3", title: "L3 · 画像蒸馏" }
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
		    { key: "g", label: "全局默认", title: "未单独配置的层走这条链（当前在用：" + (users.length ? users.map((k) => LAYER_META[k].seg).join("、") : "无") + "）" },
		    ...["l1", "l2", "l3"].map((k) => ({
		      key: k,
		      title: LAYER_META[k].title + " · " + (dotOf(k) === "runtime" ? "运行时自定义" : dotOf(k) === "static" ? "部署 YAML 层链（只读）" : "跟随全局"),
		      label: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Dot, { kind: dotOf(k) }),
		        LAYER_META[k].seg
		      ] })
		    }))
		  ];
		  const chipTitle = (k) => dotOf(k) === "runtime" ? "本层走设置页自定义链" : dotOf(k) === "static" ? "本层走部署 YAML 层链（UI 只读，自定义可覆盖）" : "本层未单独配置，走全局默认链";
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Segmented, { value: tab, options: segOptions, onChange: (k) => setTab(k) }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: STY2.hint, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Dot, { kind: "runtime" }),
		      " 自定义 · ",
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Dot, { kind: "static" }),
		      " 部署 YAML · ",
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Dot, { kind: "global" }),
		      " 跟随全局",
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { title: "每层实际链：运行时自定义 → 部署 YAML 层链 → 全局默认链，逐级兜底；部署 pin 时运行时编辑只读", children: "（层链优先于全局）" })
		    ] }),
		    tab === "g" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: STY2.panelHead, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: STY2.panelTitle, children: "全局默认链" }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { ...STY2.chip, ...STY2.chipAccent }, children: "运行时 · 可编辑" }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { ...STY2.inUse, marginLeft: "auto" }, children: users.length ? "在用：" + users.map((k) => LAYER_META[k].seg).join("、") : "当前无层使用" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(RouteChainEditor, { rpc, disabled }, "g"),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(BudgetInputs, { rpc, disabled, data: props.data, setData: props.setData, onError: props.onError, scope: "input" }, "g-budget")
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: STY2.panelHead, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: STY2.panelTitle, children: LAYER_META[tab].title }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { ...STY2.chip, ...dotOf(tab) === "runtime" ? STY2.chipAccent : STY2.chipMuted }, title: chipTitle(tab), children: dotOf(tab) === "runtime" ? "运行时自定义" : dotOf(tab) === "static" ? "静态 · YAML" : "跟随全局" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(RouteChainEditor, { rpc, disabled, scope: tab }, tab),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(BudgetInputs, { rpc, disabled, data: props.data, setData: props.setData, onError: props.onError, scope: tab }, tab + "-budget")
		    ] })
		  ] });
		}
		
		// client/src/tabs/EmbeddingSection.tsx
		var import_react8 = require("react");
		
		// client/src/format.ts
		function fmtTime(iso) {
		  if (!iso) return "-";
		  try {
		    return new Date(iso).toLocaleString();
		  } catch {
		    return String(iso);
		  }
		}
		function fmtMB(bytes) {
		  if (!bytes || bytes <= 0) return "0MB";
		  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + "KB";
		  return (bytes / (1024 * 1024)).toFixed(bytes < 100 * 1024 * 1024 ? 1 : 0) + "MB";
		}
		
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
		
		// client/src/workspace/common.tsx
		var import_jsx_runtime9 = require("react/jsx-runtime");
		var TITLE_BASE = {
		  fontSize: 15,
		  fontWeight: 600,
		  lineHeight: "22px",
		  margin: "20px 0 10px",
		  color: "var(--dsh-mem-text-1)"
		};
		function SectionTitle(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { ...TITLE_BASE, ...props.first ? { marginTop: 0 } : null }, children: props.children });
		}
		function ErrorBlock(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		    "div",
		    {
		      className: "dsh-mem-card",
		      style: { ...S.card, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 16 },
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { style: { color: "var(--dsh-mem-danger)" }, children: t("ws.loadFail") }),
		        props.msg ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: S.muted, children: props.msg }) : null,
		        props.onRetry ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		          NButton,
		          {
		            onClick: () => {
		              props.onRetry?.();
		            },
		            children: t("ws.retry")
		          }
		        ) : null
		      ]
		    }
		  );
		}
		function fmtTokensCompact(n) {
		  if (!Number.isFinite(n) || n <= 0) return "0";
		  if (n < 1e3) return String(Math.round(n));
		  if (n < 1e6) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0) + "K";
		  return (n / 1e6).toFixed(1) + "M";
		}
		function VerbTag(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-mem-vtag " + (props.verb === "new" ? "dsh-mem-vtag-new" : "dsh-mem-vtag-upd"), children: t("verb." + props.verb) });
		}
		function KindTag(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-mem-typetag", children: t("kind." + props.kind) });
		}
		function FamilyTag(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-mem-typetag", children: t("scope." + props.family) });
		}
		function Chevron() {
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-mem-feed-chev", "aria-hidden": "true", children: "›" });
		}
		
		// client/src/workspace/Automation.tsx
		var import_jsx_runtime10 = require("react/jsx-runtime");
		var POLL_MS = 1e4;
		function Automation(props) {
		  const rpc = props.rpc;
		  const [settingsData, setSettingsData] = (0, import_react9.useState)(null);
		  const [error, setError] = (0, import_react9.useState)(null);
		  const [routeInfo, setRouteInfo] = (0, import_react9.useState)(null);
		  const [emb, setEmb] = (0, import_react9.useState)(null);
		  const [advOpen, setAdvOpen] = (0, import_react9.useState)(false);
		  const [embOpen, setEmbOpen] = (0, import_react9.useState)(false);
		  const writeBusy = (0, import_react9.useRef)(false);
		  const load = (0, import_react9.useCallback)(() => {
		    rpc("dsh-memory/settings-get", {}).then((r) => {
		      if (writeBusy.current) return;
		      if (r && r.ok) {
		        setSettingsData(r.value);
		        setError(null);
		      } else if (!r || !r.ok) {
		        setError(r && r.error ? r.error.message : "RPC error");
		      }
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		    rpc("dsh-memory/llm-providers", {}).then((r) => {
		      if (r && r.ok) setRouteInfo(r.value);
		    }).catch(() => {
		    });
		    rpc("dsh-memory/embedding-state-get", {}).then((r) => {
		      if (r && r.ok) setEmb(r.value);
		    }).catch(() => {
		    });
		  }, [rpc]);
		  (0, import_react9.useEffect)(() => {
		    load();
		    const timer = setInterval(load, POLL_MS);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [load]);
		  const toggle = (key, value) => {
		    if (!settingsData) return;
		    const prev = settingsData;
		    const patch = { [key]: value };
		    setSettingsData({ ...prev, settings: { ...prev.settings, [key]: value } });
		    writeBusy.current = true;
		    rpc("dsh-memory/settings-set", patch).then((r) => {
		      writeBusy.current = false;
		      if (!r || !r.ok) {
		        setSettingsData(prev);
		        setError(r && r.error ? r.error.message : "settings-set failed");
		      } else {
		        setError(null);
		      }
		    }).catch((e) => {
		      writeBusy.current = false;
		      setSettingsData(prev);
		      setError(String(e && e.message || e));
		    });
		  };
		  const master = settingsData?.settings.enabled ?? true;
		  let ceilingNote = "";
		  if (settingsData?.ceilings) {
		    const off = [];
		    if (!settingsData.ceilings.capture) off.push(t("au.sw.capture"));
		    if (!settingsData.ceilings.distill) off.push(t("au.sw.distill"));
		    if (!settingsData.ceilings.recall) off.push(t("au.sw.recall"));
		    if (off.length > 0) ceilingNote = tpl("au.ceiling", { s: off.join(" / ") });
		  }
		  let embSummary = "…";
		  if (emb && emb.supported !== false) {
		    if (emb.source === "remote") embSummary = tpl("au.emb.remote", { m: emb.activeModel ?? "-" });
		    else if (emb.source === "local") embSummary = tpl("au.emb.local", { m: emb.activeModel ?? "-" });
		    else embSummary = t("au.emb.off");
		  }
		  let routeSummary = "…";
		  const chain = routeInfo?.chain.effectiveChain ?? [];
		  if (routeInfo) {
		    if (chain.length > 0) {
		      const head = chain[0];
		      const headName = (head.provider ? head.provider + "/" : "") + head.model;
		      routeSummary = chain.length > 1 ? tpl("au.route.cur", { m: headName, n: chain.length - 1 }) : headName;
		    } else {
		      routeSummary = t("au.route.follow");
		    }
		  }
		  const summaryRow = (label, value) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { style: { ...S.switchRow, justifyContent: "space-between" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.switchLabel, children: label }),
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: S.muted, children: value })
		  ] });
		  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(SectionTitle, { first: true, children: t("au.basic") }),
		    settingsData && settingsData.supported === false ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: S.hint, children: t("au.unsupported") }) : settingsData ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { style: S.switchPanel, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		        SwitchRow,
		        {
		          label: t("au.sw.master"),
		          desc: master ? t("au.sw.masterOn") : t("au.sw.masterOff"),
		          checked: master,
		          onChange: (v) => {
		            toggle("enabled", v);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		        SwitchRow,
		        {
		          label: t("au.sw.capture"),
		          desc: t("au.sw.captureD"),
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
		          label: t("au.sw.distill"),
		          desc: t("au.sw.distillD"),
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
		          label: t("au.sw.recall"),
		          desc: t("au.sw.recallD"),
		          checked: settingsData.settings.recall,
		          disabled: !master,
		          onChange: (v) => {
		            toggle("recall", v);
		          }
		        }
		      ),
		      summaryRow(t("au.emb"), embSummary),
		      summaryRow(t("au.route"), routeSummary),
		      ceilingNote ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: S.hint, children: ceilingNote }) : null,
		      error ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: S.error, children: error }) : null
		    ] }) : error ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ErrorBlock, { msg: error, onRetry: load }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: S.intro, children: t("ws.loading") }),
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("button", { className: "dsh-mem-disc", "aria-expanded": advOpen, onClick: () => {
		      setAdvOpen(!advOpen);
		    }, style: { marginTop: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dsh-mem-disc-chev", "aria-hidden": "true", children: "›" }),
		      t("au.advTitle"),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { style: { ...S.hint, marginLeft: "auto", fontWeight: 400 }, children: t("au.advHint") })
		    ] }),
		    advOpen && settingsData ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(DistillSettings, { rpc, disabled: !master, data: settingsData, setData: setSettingsData, onError: setError }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("button", { className: "dsh-mem-disc", "aria-expanded": embOpen, onClick: () => {
		      setEmbOpen(!embOpen);
		    }, style: { marginTop: 12 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dsh-mem-disc-chev", "aria-hidden": "true", children: "›" }),
		      t("au.embTitle")
		    ] }),
		    embOpen ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(EmbeddingSection, { rpc }) : null
		  ] });
		}
		
		// client/src/workspace/Insights.tsx
		var import_react11 = require("react");
		
		// client/src/tabs/CostTab.tsx
		var import_react10 = require("react");
		var import_jsx_runtime11 = require("react/jsx-runtime");
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
		  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("svg", { viewBox: "0 0 " + W + " " + H, style: { width: "100%", height: "auto", display: "block" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("line", { x1: L, y1: y(0), x2: W - R, y2: y(0), stroke: "var(--dsh-mem-border)", strokeWidth: 1 }),
		    yTicks.map((v) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("text", { x: L - 6, y: y(v) + 4, textAnchor: "end", fontSize: 10, fill: "var(--dsh-mem-text-3)", children: fmtInt(v) }, "yt" + v);
		    }),
		    xIdx.map((i) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("text", { x: x(i), y: H - 8, textAnchor: "middle", fontSize: 10, fill: "var(--dsh-mem-text-3)", children: fmtDate(buckets[i] ? buckets[i].ts : 0) }, "xt" + i);
		    }),
		    models.map((m, mi) => {
		      const pts = buckets.map((b, i) => x(i) + "," + y(b.byModel[m] || 0)).join(" ");
		      return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
		  const [data, setData] = (0, import_react10.useState)(null);
		  const [error, setError] = (0, import_react10.useState)(null);
		  const [granularity, setGranularity] = (0, import_react10.useState)("day");
		  const [layer, setLayer] = (0, import_react10.useState)("");
		  const [rangeDays, setRangeDays] = (0, import_react10.useState)(0);
		  const [rangeOpen, setRangeOpen] = (0, import_react10.useState)(false);
		  const load = (0, import_react10.useCallback)(() => {
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
		  (0, import_react10.useEffect)(() => {
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
		    return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { style: tdStyle, children: w ? fmtInt(pick(w)) : "0" }, r);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Segmented, { value: layer, options: LAYER_OPTS, onChange: setLayer }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Segmented, { value: granularity, options: GRAN_OPTS, onChange: setGranularity }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		        NButton,
		        {
		          onClick: () => {
		            setRangeOpen(!rangeOpen);
		          },
		          children: rangeDays > 0 ? "近 " + rangeDays + " 天" : "近N天"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(NButton, { onClick: load, children: "刷新" })
		    ] }),
		    rangeOpen ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: S.muted, children: "展示近 N 天（正整数，清空=默认窗口；超出保留期后端自动回退）" }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
		    error ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.error, children: "成本读取失败：" + error }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.panelLabel, children: "成本趋势（按模型）" }),
		    buckets.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
		      renderCostChart(buckets, models, maxY, fmtDate, fmtInt, PALETTE),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px 12px", margin: "6px 0 14px" }, children: models.map((m, mi) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
		          "span",
		          {
		            style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--dsh-mem-text-2)" },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: { width: 10, height: 10, borderRadius: 4, background: PALETTE[mi % PALETTE.length], display: "inline-block" } }),
		              m
		            ]
		          },
		          "lg" + m
		        );
		      }) })
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { style: S.muted, children: data ? "暂无成本数据（触发一次蒸馏后这里会出现趋势）。" : "加载中…" }),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.panelLabel, children: "层级成本（输出 token）" }),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { style: thFirst, children: "层级" }),
		        RANGES.map((r) => {
		          return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { style: thStyle, children: RANGE_LABELS[r] }, r);
		        })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("tbody", { children: layerTable.map((lc) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { style: tdFirst, children: lc.layer.toUpperCase() }),
		          RANGES.map((r) => cell(lc, r, (w) => w.outputTokens))
		        ] }, lc.layer);
		      }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.panelLabel, children: "层级成本（单次 avg）" }),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { style: thFirst, children: "层级" }),
		        RANGES.map((r) => {
		          return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { style: thStyle, children: RANGE_LABELS[r] + "-avg" }, r);
		        })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("tbody", { children: layerTable.map((lc) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { style: tdFirst, children: lc.layer.toUpperCase() }),
		          RANGES.map((r) => cell(lc, r, (w) => w.avgOutputTokens))
		        ] }, lc.layer);
		      }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.panelLabel, children: "层级成本（单次 median）" }),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { style: thFirst, children: "层级" }),
		        RANGES.map((r) => {
		          return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { style: thStyle, children: RANGE_LABELS[r] + "-median" }, r);
		        })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("tbody", { children: layerTable.map((lc) => {
		        return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { style: tdFirst, children: lc.layer.toUpperCase() }),
		          RANGES.map((r) => cell(lc, r, (w) => w.medianOutputTokens))
		        ] }, lc.layer);
		      }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.panelLabel, children: "时间窗口总览" }),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.statGrid, children: windows.map((w) => {
		      return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-mem-card", style: S.statTile, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.statNum, children: fmtInt(w.outputTokens + w.reasoningTokens) }),
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.statLabel, children: RANGE_LABELS[w.range] + " · 总输出 token" }),
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.muted, children: "文字 " + fmtInt(w.outputTokens) + " · 思考 " + fmtInt(w.reasoningTokens) + " · " + w.calls + " 次调用" })
		      ] }, w.range);
		    }) }),
		    byModel.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { style: S.panelLabel, children: "按模型（累计）" }),
		      byModel.map((m) => {
		        const label = fmtModel(m.provider, m.model);
		        return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: S.infoRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: S.infoKey, children: label }),
		          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: S.infoVal, children: m.calls + " 次 · 输出 " + fmtInt(m.outputTokens) + " · 思考 " + fmtInt(m.reasoningTokens) })
		        ] }, "m-" + label);
		      })
		    ] }) : null,
		    data ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { style: S.hint, children: "输入按字符、输出/思考按 token 计；趋势图 Y 轴为输出 token，上方可切换层级与颗粒度。" }) : null
		  ] });
		}
		
		// client/src/workspace/Insights.tsx
		var import_jsx_runtime12 = require("react/jsx-runtime");
		var POLL_MS2 = 15e3;
		var LAYER_LABEL_KEY = {
		  "l1-extract": "in.act.l1x",
		  "l1-dedup": "in.act.l1d",
		  l2: "in.act.l2",
		  l3: "in.act.l3"
		};
		function Insights(props) {
		  const rpc = props.rpc;
		  const [sub, setSub] = (0, import_react11.useState)("cost");
		  const [data, setData] = (0, import_react11.useState)(null);
		  const [error, setError] = (0, import_react11.useState)(null);
		  const load = (0, import_react11.useCallback)(() => {
		    setError(null);
		    rpc("dsh-memory/runtime-insights", {}).then((r) => {
		      if (r && r.ok) setData(r.value);
		      else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		  }, [rpc]);
		  (0, import_react11.useEffect)(() => {
		    load();
		    const timer = setInterval(load, POLL_MS2);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [load]);
		  if (sub === "cost") {
		    return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(InsightTabs, { sub, setSub }),
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(CostTab, { rpc }) })
		    ] });
		  }
		  if (!data) {
		    return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(InsightTabs, { sub, setSub }),
		      error ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ErrorBlock, { msg: error, onRetry: load }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { style: S.intro, children: t("ws.loading") })
		    ] });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(InsightTabs, { sub, setSub }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: { ...S.error, marginTop: 8 }, children: error }) : null,
		    sub === "activity" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ActivityView, { data }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(RecallView, { data })
		  ] });
		}
		function InsightTabs(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
		    Segmented,
		    {
		      value: props.sub,
		      options: [
		        { key: "cost", label: t("in.tab.cost") },
		        { key: "activity", label: t("in.tab.activity") },
		        { key: "recall", label: t("in.tab.recall") }
		      ],
		      onChange: (k) => {
		        props.setSub(k);
		      }
		    }
		  );
		}
		function ActivityView(props) {
		  const days = props.data.activityDays;
		  const max = Math.max(1, ...days.map((d) => d.l1 + d.l2 + d.l3));
		  const barLabel = (day) => {
		    const m = day.slice(5, 7);
		    const d = day.slice(8, 10);
		    return `${Number(m)}/${Number(d)}`;
		  };
		  const thL = { fontSize: 12, fontWeight: 600, color: "var(--dsh-mem-text-3)", textAlign: "left", padding: "4px 10px", borderBottom: "1px solid var(--dsh-mem-border)" };
		  const thR = { ...thL, textAlign: "right" };
		  const tdL = { fontSize: 12.5, fontWeight: 600, color: "var(--dsh-mem-text-1)", padding: "5px 10px" };
		  const tdR = { fontSize: 12.5, color: "var(--dsh-mem-text-1)", textAlign: "right", padding: "5px 10px", fontVariantNumeric: "tabular-nums" };
		  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(SectionTitle, { first: true, children: t("in.act.chart") }),
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dsh-mem-card", style: S.card, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: { display: "flex", alignItems: "flex-end", gap: 6, height: 110, marginTop: 8 }, children: days.map((d) => {
		      const total = d.l1 + d.l2 + d.l3;
		      return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4, height: "100%" }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
		          "div",
		          {
		            title: `${d.day} · L1 ${d.l1} / L2 ${d.l2} / L3 ${d.l3}`,
		            style: {
		              height: Math.max(2, Math.round(total / max * 80)),
		              borderRadius: 4,
		              background: "var(--dsh-mem-accent-fill)",
		              opacity: 0.85
		            }
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: { textAlign: "center", fontSize: 10, color: "var(--dsh-mem-text-3)", fontVariantNumeric: "tabular-nums" }, children: barLabel(d.day) })
		      ] }, d.day);
		    }) }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(SectionTitle, { children: t("in.act.byLayer") }),
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dsh-mem-card", style: { ...S.card, padding: "4px 10px" }, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("th", { style: thL, children: t("in.act.layer") }),
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("th", { style: thR, children: t("in.act.calls") }),
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("th", { style: thR, children: t("in.act.fail") })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("tbody", { children: props.data.distill.map((row2) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("td", { style: tdL, children: t(LAYER_LABEL_KEY[row2.layer] ?? "") || row2.layer }),
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("td", { style: tdR, children: row2.calls }),
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("td", { style: { ...tdR, color: row2.failures > 0 ? "var(--dsh-mem-danger)" : void 0 }, children: row2.failures })
		      ] }, row2.layer)) })
		    ] }) })
		  ] });
		}
		function RecallView(props) {
		  const r = props.data.recall;
		  const row2 = (label, value) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { ...S.switchRow, justifyContent: "space-between" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: S.switchLabel, children: label }),
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("b", { style: { color: "var(--dsh-mem-text-1)", fontVariantNumeric: "tabular-nums" }, children: value })
		  ] }, label);
		  const disabledRow = (cls, label) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dsh-mem-chip " + cls, children: label }, label);
		  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { children: [
		    r.sessions === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dsh-mem-card", style: { ...S.card, padding: "26px 10px", textAlign: "center" }, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { style: S.hint, children: t("in.rc.empty") }) }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsh-mem-card", style: { ...S.switchPanel, marginTop: 14 }, children: [
		      row2(t("in.rc.sessions"), String(r.sessions)),
		      row2(t("in.rc.turns"), String(r.injectedTurns)),
		      row2(t("in.rc.hitTurns"), String(r.hitTurns)),
		      row2(t("in.rc.hits"), String(r.totalHits)),
		      row2(t("in.rc.timeouts"), String(r.timeouts)),
		      row2(t("in.rc.suppressed"), String(r.suppressedRecalls))
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(SectionTitle, { children: t("in.rc.disabled") }),
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dsh-mem-card", style: S.card, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: [
		      disabledRow(r.globalRecall ? "dsh-mem-chip-ok" : "dsh-mem-chip-warn", r.globalRecall ? t("in.rc.globalOn") : t("in.rc.globalOff")),
		      disabledRow("dsh-mem-chip", `${t("in.rc.modeOff")} · ${r.sessionsModeOff}`),
		      disabledRow("dsh-mem-chip", `${t("in.rc.wo")} · ${r.sessionsWriteOnly}`)
		    ] }) })
		  ] });
		}
		
		// client/src/workspace/Library.tsx
		var import_react12 = require("react");
		var import_jsx_runtime13 = require("react/jsx-runtime");
		var PAGE_LIMIT = 30;
		var DEBOUNCE_MS = 300;
		function sinceFor(time) {
		  if (time === "today") {
		    const d = /* @__PURE__ */ new Date();
		    d.setHours(0, 0, 0, 0);
		    return d.getTime();
		  }
		  if (time === "d7") return Date.now() - 7 * 24 * 36e5;
		  if (time === "d30") return Date.now() - 30 * 24 * 36e5;
		  return 0;
		}
		function Library(props) {
		  const rpc = props.rpc;
		  const [items, setItems] = (0, import_react12.useState)([]);
		  const [cursor, setCursor] = (0, import_react12.useState)(null);
		  const [truncated, setTruncated] = (0, import_react12.useState)(false);
		  const [loading, setLoading] = (0, import_react12.useState)(true);
		  const [loadingMore, setLoadingMore] = (0, import_react12.useState)(false);
		  const [error, setError] = (0, import_react12.useState)(null);
		  const [expandedId, setExpandedId] = (0, import_react12.useState)(null);
		  const [copiedId, setCopiedId] = (0, import_react12.useState)(null);
		  const [query, setQuery] = (0, import_react12.useState)("");
		  const [kind, setKind] = (0, import_react12.useState)("");
		  const [family, setFamily] = (0, import_react12.useState)("");
		  const [time, setTime] = (0, import_react12.useState)("");
		  const seqRef = (0, import_react12.useRef)(0);
		  const fetchPage = (0, import_react12.useCallback)(
		    (append, cur) => {
		      const token = ++seqRef.current;
		      if (append) setLoadingMore(true);
		      else setLoading(true);
		      setError(null);
		      const payload = { limit: PAGE_LIMIT, cursor: cur ?? void 0 };
		      if (query.trim()) payload.query = query.trim();
		      if (kind) payload.kind = kind;
		      if (family) payload.family = family;
		      const since = sinceFor(time);
		      if (since > 0) payload.since = since;
		      rpc("dsh-memory/asset-activity", payload).then((r) => {
		        if (token !== seqRef.current) return;
		        if (append) setLoadingMore(false);
		        else setLoading(false);
		        if (!r || !r.ok) {
		          setError(r && r.error ? r.error.message : "RPC error");
		          return;
		        }
		        setItems((prev) => append ? prev.concat(r.value.items) : r.value.items);
		        setCursor(r.value.nextCursor);
		        setTruncated(!!r.value.truncated);
		      }).catch((e) => {
		        if (token !== seqRef.current) return;
		        if (append) setLoadingMore(false);
		        else setLoading(false);
		        setError(String(e && e.message || e));
		      });
		    },
		    [rpc, query, kind, family, time]
		  );
		  (0, import_react12.useEffect)(() => {
		    const h = setTimeout(() => {
		      fetchPage(false, null);
		    }, query ? DEBOUNCE_MS : 0);
		    return () => {
		      clearTimeout(h);
		    };
		  }, [fetchPage]);
		  const filtered = !!(query.trim() || kind || family || time);
		  const copy = (item) => {
		    const text = item.title + "\n" + item.content;
		    const done = () => {
		      setCopiedId(item.id);
		      setTimeout(() => {
		        setCopiedId((cur) => cur === item.id ? null : cur);
		      }, 2e3);
		    };
		    if (navigator.clipboard?.writeText) {
		      navigator.clipboard.writeText(text).then(done).catch(() => {
		        setCopiedId(null);
		      });
		    }
		  };
		  const metaRow = (label, value) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: { display: "contents" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("dt", { style: { color: "var(--dsh-mem-text-3)", fontSize: 12 }, children: label }),
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("dd", { style: { color: "var(--dsh-mem-text-2)", fontSize: 12, margin: 0, wordBreak: "break-all" }, children: value })
		  ] }, label);
		  const row2 = (item) => {
		    const open = expandedId === item.id;
		    return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dsh-mem-feed-row" + (open ? " open" : ""), children: [
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
		        "button",
		        {
		          className: "dsh-mem-feed-head",
		          "aria-expanded": open,
		          onClick: () => {
		            setExpandedId(open ? null : item.id);
		          },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(VerbTag, { verb: item.verb }),
		            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(KindTag, { kind: item.kind }),
		            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dsh-mem-feed-title", children: item.title }),
		            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dsh-mem-feed-time", children: fmtAgoLocal(item.updatedAt) ?? "-" }),
		            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Chevron, {})
		          ]
		        }
		      ),
		      open ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: { padding: "2px 2px 12px", display: "flex", flexDirection: "column", gap: 8 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		          "div",
		          {
		            style: {
		              background: "var(--dsh-mem-bg-inset)",
		              border: "1px solid var(--dsh-mem-border)",
		              borderRadius: 10,
		              padding: "10px 12px",
		              fontSize: 12.5,
		              lineHeight: "20px",
		              whiteSpace: "pre-wrap",
		              wordBreak: "break-word",
		              color: "var(--dsh-mem-text-1)",
		              maxHeight: 320,
		              overflowY: "auto"
		            },
		            children: item.content
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("dl", { style: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 14px", margin: 0 }, children: [
		          item.kind === "l1" && item.scene ? metaRow(t("lib.meta.scene"), item.scene) : null,
		          item.kind === "l1" && item.l1Type ? metaRow(t("lib.meta.type"), typeLabel(item.l1Type)) : null,
		          metaRow(t("lib.meta.created"), fmtAgoLocal(item.createdAt) ?? "-"),
		          metaRow(t("lib.meta.updated"), fmtAgoLocal(item.updatedAt) ?? "-"),
		          item.version !== null ? metaRow(t("lib.meta.version"), "v" + item.version) : null,
		          item.sourceSession ? metaRow(t("lib.meta.source"), item.sourceSession) : null
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: { ...S.flexRow }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(FamilyTag, { family: item.family }),
		          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { style: S.grow }),
		          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(NButton, { onClick: () => {
		            copy(item);
		          }, children: copiedId === item.id ? t("ws.copied") : t("ws.copy") })
		        ] })
		      ] }) : null
		    ] }, item.id);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: S.toolbar, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		        NInput,
		        {
		          style: { flex: 1, minWidth: 160 },
		          placeholder: t("lib.search"),
		          value: query,
		          onChange: (e) => {
		            setQuery(e.target.value);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		        NButton,
		        {
		          onClick: () => {
		            fetchPage(false, null);
		          },
		          children: t("ws.refresh")
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: { ...S.toolbar, marginBottom: 8 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		        Segmented,
		        {
		          value: kind,
		          options: [
		            { key: "", label: t("ws.all") },
		            { key: "l1", label: t("kind.l1") },
		            { key: "l2", label: t("kind.l2") },
		            { key: "l3", label: t("kind.l3") }
		          ],
		          onChange: (k) => {
		            setKind(k);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		        Segmented,
		        {
		          value: family,
		          options: [
		            { key: "", label: t("ws.all") },
		            { key: "chat", label: t("scope.chat") },
		            { key: "work", label: t("scope.work") }
		          ],
		          onChange: (k) => {
		            setFamily(k);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		        Segmented,
		        {
		          value: time,
		          options: [
		            { key: "", label: t("ws.all") },
		            { key: "today", label: t("lib.time.today") },
		            { key: "d7", label: t("lib.time.d7") },
		            { key: "d30", label: t("lib.time.d30") }
		          ],
		          onChange: (k) => {
		            setTime(k);
		          }
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { style: { ...S.flexRow, marginBottom: 8 }, children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: S.muted, children: loading ? t("ws.loading") : tpl(filtered ? "lib.countFiltered" : "lib.count", { n: items.length }) }) }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: { ...S.flexRow, justifyContent: "space-between", marginTop: 0, marginBottom: 8 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: { color: "var(--dsh-mem-danger)", fontSize: 13 }, children: error }),
		      items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		        NButton,
		        {
		          onClick: () => {
		            fetchPage(false, null);
		          },
		          children: t("ws.retry")
		        }
		      ) : null
		    ] }) : null,
		    truncated ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { style: { ...S.hint, marginTop: 0 }, children: t("lib.truncated") }) : null,
		    items.length === 0 && !loading && !error ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dsh-mem-card", style: { ...S.card, padding: "30px 10px", textAlign: "center" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h3", { style: { fontSize: 14, fontWeight: 600, marginBottom: 4, color: "var(--dsh-mem-text-1)" }, children: t("lib.empty") }),
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { style: S.hint, children: t("lib.emptyHint") })
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "dsh-mem-card", style: { ...S.card, padding: "2px 10px" }, children: items.map(row2) }),
		    cursor ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: S.flexRow, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		        NButton,
		        {
		          disabled: loadingMore,
		          onClick: () => {
		            if (!loadingMore) fetchPage(true, cursor);
		          },
		          children: loadingMore ? t("lib.loadingMore") : t("lib.more")
		        }
		      )
		    ] }) : null
		  ] });
		}
		
		// client/src/workspace/Maintenance.tsx
		var import_react15 = require("react");
		
		// client/src/tabs/LogTab.tsx
		var import_react13 = require("react");
		var import_jsx_runtime14 = require("react/jsx-runtime");
		function LogTab(props) {
		  const rpc = props.rpc;
		  const [lines, setLines] = (0, import_react13.useState)(null);
		  const [error, setError] = (0, import_react13.useState)(null);
		  const preRef = (0, import_react13.useRef)(null);
		  const load = (0, import_react13.useCallback)(() => {
		    setError(null);
		    rpc("dsh-memory/log-tail", { lines: 200 }).then((r) => {
		      if (r && r.ok) setLines(r.value.lines);
		      else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		  }, [rpc]);
		  (0, import_react13.useEffect)(() => {
		    load();
		  }, [load]);
		  (0, import_react13.useEffect)(() => {
		    if (lines && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
		  }, [lines]);
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: { ...S.flexRow, marginBottom: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: S.muted, children: error ? "加载失败" : lines === null ? "加载中…" : "最近 " + lines.length + " 行（memory.log）" }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: S.grow }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(NButton, { onClick: load, children: "刷新" })
		    ] }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: { ...S.error, marginBottom: 10 }, children: "日志读取失败：" + error + "（点右上“刷新”重试）" }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("pre", { style: S.pre, ref: preRef, children: (lines || []).join("\n") || "(暂无日志)" })
		  ] });
		}
		
		// client/src/tabs/RebuildPanel.tsx
		var import_react14 = require("react");
		var import_jsx_runtime15 = require("react/jsx-runtime");
		var RB_PHASE_LABEL = {
		  preparing: "准备中（归档旧数据 · 清空检索库）",
		  distilling: "分块蒸馏中",
		  finalizing: "收尾（强制 L2 场景 + L3 画像）"
		};
		function RebuildPanel(props) {
		  const rpc = props.rpc;
		  const [rbRaw, setRb] = (0, import_react14.useState)(null);
		  const [confirmOpen, setConfirmOpen] = (0, import_react14.useState)(false);
		  const [busy, setBusy] = (0, import_react14.useState)(false);
		  const [rbError, setRbError] = (0, import_react14.useState)(null);
		  const refresh = (0, import_react14.useCallback)(() => {
		    rpc("dsh-memory/rebuild-status", {}).then((r) => {
		      if (r && r.ok) setRb(r.value);
		    }).catch(() => {
		    });
		  }, [rpc]);
		  (0, import_react14.useEffect)(() => {
		    refresh();
		  }, [refresh]);
		  const running = !!(rbRaw && rbRaw.running);
		  (0, import_react14.useEffect)(() => {
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
		  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "dsh-mem-rb-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { style: { fontWeight: 600, whiteSpace: "nowrap" }, children: "重建记忆" }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-rb-muted", style: { flex: 1, minWidth: 180 }, children: running ? (RB_PHASE_LABEL[rb.phase] || rb.phase) + " · " + rb.done + "/" + rb.total + " 会话（" + pct + "%）" : "从 L0 原始对话重新蒸馏 L1/L2/L3；旧数据先归档（不删除）" }),
		      running ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(NButton, { disabled: busy || rb.cancelRequested, onClick: cancel, children: rb.cancelRequested ? "取消中…" : "取消重建" }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
		    running ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-rb-bar", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-rb-fill", style: { width: pct + "%" } }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "dsh-mem-rb-muted", style: { whiteSpace: "nowrap" }, children: "产出 " + rb.recordsBuilt + " 条" })
		    ] }) : null,
		    lastNote ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dsh-mem-rb-muted", style: { marginTop: 8 }, children: lastNote }) : null,
		    rbError ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { style: { marginTop: 8, fontSize: 12, color: "var(--dsh-mem-danger)" }, children: rbError }) : null,
		    confirmOpen ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
		      NModal,
		      {
		        open: true,
		        onClose: () => {
		          setConfirmOpen(false);
		        },
		        title: "确认重建全部记忆？",
		        footer: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            NButton,
		            {
		              onClick: () => {
		                setConfirmOpen(false);
		              },
		              children: "取消"
		            },
		            "cancel"
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(NButton, { variant: "primary", disabled: busy, onClick: start, children: busy ? "启动中…" : "开始重建" }, "confirm")
		        ],
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { children: [
		            "将以 L0 原始对话为事实源重新蒸馏：",
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("b", { children: rb.sessionCount + " 个会话 · " + rb.messageCount + " 条消息" }),
		            "，预计 ≥" + rb.estCalls + " 次蒸馏调用。"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { style: { marginTop: 8 }, children: "现有 L1 记忆 / L2 场景 / L3 画像会整体归档（*.bak.时间戳，可手工找回），随后清空重建；重建期间可正常对话，新对话的蒸馏优先进行；中途可取消，已重建部分保留。" })
		        ]
		      }
		    ) : null
		  ] });
		}
		
		// client/src/workspace/Maintenance.tsx
		var import_jsx_runtime16 = require("react/jsx-runtime");
		var POLL_MS3 = 15e3;
		function Maintenance(props) {
		  const rpc = props.rpc;
		  const [ov, setOv] = (0, import_react15.useState)(null);
		  const [stats, setStats] = (0, import_react15.useState)(null);
		  const [error, setError] = (0, import_react15.useState)(null);
		  const [logOpen, setLogOpen] = (0, import_react15.useState)(false);
		  const load = (0, import_react15.useCallback)(() => {
		    setError(null);
		    rpc("dsh-memory/workspace-overview", {}).then((r) => {
		      if (r && r.ok) setOv(r.value);
		      else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		    rpc("dsh-memory/stats", {}).then((r) => {
		      if (r && r.ok) setStats(r.value);
		    }).catch(() => {
		    });
		  }, [rpc]);
		  (0, import_react15.useEffect)(() => {
		    load();
		    const timer = setInterval(load, POLL_MS3);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [load]);
		  if (!ov && !stats) {
		    return error ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ErrorBlock, { msg: error, onRetry: load }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { style: S.intro, children: t("ws.loading") });
		  }
		  const retrievalText = () => {
		    if (ov?.retrieval === "hybrid") return { text: t("ov.sys.ok"), tone: "ok" };
		    if (ov?.retrieval === "keyword") return { text: t("ov.sys.keyword"), tone: "warn" };
		    if (ov?.retrieval === "vector") return { text: t("ov.sys.vectorOnly"), tone: "warn" };
		    if (ov?.retrieval === "none") return { text: t("ov.sys.none"), tone: "warn" };
		    return { text: t("mt.unknown"), tone: "ok" };
		  };
		  const ret = retrievalText();
		  const degraded = ov?.degraded ?? (stats ? stats.message !== "running" : false);
		  const healthRow = (name, dot, ev) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--dsh-mem-border)" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { "aria-hidden": "true", style: { width: 8, height: 8, borderRadius: "50%", flex: "none", background: dot } }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: { fontWeight: 500, width: 96, flex: "none", color: "var(--dsh-mem-text-1)" }, children: name }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: { flex: 1, minWidth: 0, color: "var(--dsh-mem-text-2)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: ev })
		  ] }, name);
		  const infoRow = (label, value) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { style: S.infoRow, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: S.infoKey, children: label }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { style: S.infoVal, children: value })
		  ] }, label);
		  const pending = ov?.pendingExtract ?? stats?.pendingExtract ?? 0;
		  const l0Today = ov?.l0Today ?? stats?.l0Today ?? 0;
		  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(SectionTitle, { first: true, children: t("mt.health") }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsh-mem-card", style: S.card, children: [
		      healthRow(t("ov.subsys.store"), degraded ? "var(--dsh-mem-danger)" : "var(--dsh-mem-ok)", degraded ? t("mt.store.down") : t("ov.sys.ok")),
		      healthRow(t("ov.subsys.vec"), ret.tone === "ok" ? "var(--dsh-mem-ok)" : "var(--dsh-mem-warn)", ret.text),
		      healthRow(
		        t("ov.subsys.queue"),
		        pending > 0 ? "var(--dsh-mem-accent)" : "var(--dsh-mem-ok)",
		        pending > 0 ? tpl("ov.sys.pending", { n: pending }) : t("ov.sys.idle")
		      ),
		      stats ? infoRow(t("mt.row.l0"), String(l0Today)) : null,
		      stats ? infoRow(t("mt.row.dataDir"), stats.dataDir) : null,
		      stats ? infoRow(t("mt.row.version"), "v" + stats.version) : null
		    ] }),
		    error ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { style: S.error, children: error }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("button", { className: "dsh-mem-disc", "aria-expanded": logOpen, onClick: () => {
		      setLogOpen(!logOpen);
		    }, style: { marginTop: 14 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "dsh-mem-disc-chev", "aria-hidden": "true", children: "›" }),
		      t("mt.log")
		    ] }),
		    logOpen ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { style: { marginTop: 4 }, children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(LogTab, { rpc }) }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(SectionTitle, { children: t("mt.danger") }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dsh-mem-card dsh-mem-danger", style: S.card, children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(RebuildPanel, { rpc }) })
		  ] });
		}
		
		// client/src/workspace/Overview.tsx
		var import_react16 = require("react");
		var import_jsx_runtime17 = require("react/jsx-runtime");
		var POLL_MS4 = 15e3;
		function Overview(props) {
		  const rpc = props.rpc;
		  const [data, setData] = (0, import_react16.useState)(null);
		  const [error, setError] = (0, import_react16.useState)(null);
		  const load = (0, import_react16.useCallback)(() => {
		    setError(null);
		    rpc("dsh-memory/workspace-overview", {}).then((r) => {
		      if (r && r.ok) setData(r.value);
		      else setError(r && r.error ? r.error.message : "RPC error");
		    }).catch((e) => {
		      setError(String(e && e.message || e));
		    });
		  }, [rpc]);
		  (0, import_react16.useEffect)(() => {
		    load();
		    const timer = setInterval(load, POLL_MS4);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [load]);
		  if (!data) {
		    return error ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(ErrorBlock, { msg: error, onRetry: load }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { style: S.intro, children: t("ws.loading") });
		  }
		  if (data.empty) {
		    const step = (label) => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
		      "div",
		      {
		        style: {
		          display: "flex",
		          flexDirection: "column",
		          alignItems: "center",
		          gap: 6,
		          width: 110,
		          fontSize: 12,
		          color: "var(--dsh-mem-text-2)"
		        },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
		            "span",
		            {
		              style: {
		                width: 34,
		                height: 34,
		                borderRadius: 10,
		                display: "grid",
		                placeItems: "center",
		                background: "var(--dsh-mem-accent-weak)",
		                color: "var(--dsh-mem-accent-text)",
		                fontWeight: 600
		              },
		              children: label.slice(0, 1)
		            }
		          ),
		          label
		        ]
		      }
		    );
		    const arrow = /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { style: { alignSelf: "center", color: "var(--dsh-mem-text-3)", paddingBottom: 20 }, children: "→" });
		    return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "dsh-mem-card", style: { ...S.card, padding: "34px 10px", textAlign: "center" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h3", { style: { fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--dsh-mem-text-1)" }, children: t("ov.empty.title") }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { style: { ...S.hint, maxWidth: 380, margin: "0 auto" }, children: t("ov.empty.body") }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { style: { display: "flex", justifyContent: "center", margin: "18px 0 14px" }, children: [
		        step(t("ov.empty.capture")),
		        arrow,
		        step(t("ov.empty.distill")),
		        arrow,
		        step(t("ov.empty.recall"))
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { style: S.hint, children: t("ov.empty.capOk") })
		    ] });
		  }
		  const vectorDegraded = data.retrieval === "keyword";
		  const warn = data.degraded || vectorDegraded;
		  const attn = [];
		  if (data.pendingExtract > 0) attn.push({ key: tpl("ov.attn.pending", { n: data.pendingExtract }), cls: "dsh-mem-chip-warn" });
		  if (vectorDegraded) attn.push({ key: t("ov.attn.vector"), cls: "dsh-mem-chip-warn" });
		  if (data.degraded) attn.push({ key: t("ov.attn.degraded"), cls: "dsh-mem-chip-err" });
		  const chip = (label, cls) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "dsh-mem-chip " + cls, children: label });
		  const retrievalChip = () => {
		    if (data.retrieval === null) return null;
		    if (data.retrieval === "hybrid") return chip(t("ov.subsys.vec") + " · " + t("mt.retrieval.hybrid"), "dsh-mem-chip-ok");
		    if (data.retrieval === "keyword") return chip(t("ov.subsys.vec") + " · " + t("ov.sys.keyword"), "dsh-mem-chip-warn");
		    if (data.retrieval === "vector") return chip(t("ov.subsys.vec") + " · " + t("ov.sys.vectorOnly"), "dsh-mem-chip-warn");
		    return chip(t("ov.subsys.vec") + " · " + t("ov.sys.none"), "dsh-mem-chip-warn");
		  };
		  const actRow = (item, i) => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < data.recent.length - 1 ? "1px solid var(--dsh-mem-border)" : "none", fontSize: 12.5 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(VerbTag, { verb: item.verb }),
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(KindTag, { kind: item.kind }),
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--dsh-mem-text-1)" }, children: item.title }),
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { style: { marginLeft: "auto", color: "var(--dsh-mem-text-3)", fontSize: 11, flex: "none", fontVariantNumeric: "tabular-nums" }, children: fmtAgoLocal(item.updatedAt) ?? "-" })
		  ] }, item.id);
		  const kg = (label, value, sub) => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "dsh-mem-card", style: { ...S.statTile, padding: "10px 14px" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { style: S.statLabel, children: label }),
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { style: { ...S.statNum, fontSize: 18, lineHeight: "26px" }, children: value }),
		    sub ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { style: S.statLabel, children: sub }) : null
		  ] }, label);
		  const weekOut = data.week ? data.week.outputTokens + data.week.reasoningTokens : 0;
		  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "dsh-mem-card", style: { ...S.card, display: "flex", alignItems: "flex-start", gap: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
		        "span",
		        {
		          "aria-hidden": "true",
		          style: { width: 8, height: 8, borderRadius: "50%", marginTop: 6, flex: "none", background: warn ? "var(--dsh-mem-warn)" : "var(--dsh-mem-ok)" }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h3", { style: { fontSize: 14, fontWeight: 600, color: "var(--dsh-mem-text-1)" }, children: data.degraded ? t("ov.runningDown") : warn ? t("ov.runningWarn") : t("ov.runningOk") }),
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }, children: [
		          chip(t("ov.subsys.store") + " · " + (data.degraded ? t("mt.store.down") : t("ov.sys.ok")), data.degraded ? "dsh-mem-chip-err" : "dsh-mem-chip-ok"),
		          retrievalChip(),
		          chip(
		            t("ov.subsys.queue") + " · " + (data.pendingExtract > 0 ? tpl("ov.sys.pending", { n: data.pendingExtract }) : t("ov.sys.idle")),
		            data.pendingExtract > 0 ? "dsh-mem-chip-biz" : "dsh-mem-chip-ok"
		          )
		        ] }),
		        attn.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }, children: attn.map((a) => chip("● " + a.key, a.cls)) }) : null
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(NButton, { onClick: load, children: t("ws.refresh") })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(SectionTitle, { children: t("ov.recent") }),
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "dsh-mem-card", style: S.card, children: data.recent.length > 0 ? data.recent.map(actRow) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { style: S.muted, children: "-" }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { style: { ...S.statGrid, marginTop: 16 }, children: [
		      kg(t("ov.kg.l1"), String(data.l1Count)),
		      kg(t("ov.kg.scenes"), String(data.sceneCount)),
		      kg(t("ov.kg.week"), fmtTokensCompact(weekOut), data.week ? tpl("ov.kg.weekSub", { n: data.week.calls }) : void 0),
		      kg(t("ov.kg.lastDistill"), fmtAgoLocal(data.lastExtractAt) ?? t("ov.kg.never"))
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { style: { ...S.flexRow, marginTop: 10 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(NButton, { onClick: () => {
		        props.onNavigate("library");
		      }, children: t("ov.goto.library") }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(NButton, { onClick: () => {
		        props.onNavigate("automation");
		      }, children: t("ov.goto.automation") }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(NButton, { onClick: () => {
		        props.onNavigate("insights");
		      }, children: t("ov.goto.insights") }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(NButton, { onClick: () => {
		        props.onNavigate("maintenance");
		      }, children: t("ov.goto.maintenance") })
		    ] })
		  ] });
		}
		
		// client/src/panel.tsx
		var import_jsx_runtime18 = require("react/jsx-runtime");
		var WS_TABS = ["overview", "library", "automation", "insights", "maintenance"];
		function MemoryPanel(props) {
		  const rpc = props.rpc;
		  const [tab, setTab] = (0, import_react17.useState)("overview");
		  const tabRefs = (0, import_react17.useRef)([]);
		  ensureThemeStyle();
		  (0, import_react17.useEffect)(() => {
		    watchSidebarIcon();
		  }, []);
		  const onKeyDown = (e) => {
		    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
		    e.preventDefault();
		    const idx = WS_TABS.indexOf(tab);
		    const next = e.key === "ArrowRight" ? (idx + 1) % WS_TABS.length : (idx - 1 + WS_TABS.length) % WS_TABS.length;
		    setTab(WS_TABS[next]);
		    tabRefs.current[next]?.focus();
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "dsh-mem-root", style: S.section, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("h2", { style: S.heading, children: t("ws.title") }),
		    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "dsh-mem-ws-tabs", role: "tablist", "aria-label": t("ws.title"), onKeyDown, children: WS_TABS.map((k, i) => /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
		      "button",
		      {
		        ref: (el) => {
		          tabRefs.current[i] = el;
		        },
		        role: "tab",
		        "aria-selected": tab === k,
		        tabIndex: tab === k ? 0 : -1,
		        className: "dsh-mem-ws-tab",
		        onClick: () => {
		          setTab(k);
		        },
		        children: t("ws.tab." + k)
		      },
		      k
		    )) }),
		    tab === "overview" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Overview, { rpc, onNavigate: setTab }) : null,
		    tab === "library" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Library, { rpc }) : null,
		    tab === "automation" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Automation, { rpc }) : null,
		    tab === "insights" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Insights, { rpc }) : null,
		    tab === "maintenance" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Maintenance, { rpc }) : null
		  ] });
		}
		
		// client/src/entry.tsx
		var inject = ["slots", "connection"];
		function apply(ctx) {
		  const rpc = makeRpc(ctx);
		  initI18n(ctx);
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
		      MemoryChip
		    );
		  });
		  ctx.slots.inject("conversation.composer.dock", () => {
		    return ctx.slots.register(
		      {
		        name: "conversation.composer.dock",
		        id: "dsh-memory-telemetry",
		        order: 5,
		        inject: (sessionId) => ({ sessionId, rpc })
		      },
		      StatsSegment
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
