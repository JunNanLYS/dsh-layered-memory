/**
 * 上下文占用指示器（寄生组件）：官方 ContextMeter SVG 的外圈记忆光晕弧。
 *
 * 铁律与机制（设计契约见 .scratch/memory-occupancy-feasibility/component-design.md）：
 * - **只增不改**：官方节点一个属性不碰；移除本模块注入的节点后界面逐比特还原原生。
 * - 数据分母与官方同源（宿主经 agentDefaultModel + resolveModelInfo 下发声明窗口），
 *   本模块禁止自估窗口大小；占用分子来自 session-stats RPC（host 唯一权威账本）。
 * - 触发源全部离散：结构时钟（锚点出现/重建）、T2 时钟（官方 fill dasharray 变化，
 *   兼作节流后的数据重取信号）、冷启动（无缓存即取）、用户动作（会话切换）。
 *   零定时器零轮询；光晕静态无动效。
 * - 性能纪律：回调内禁布局读取；自写记录按类名过滤防回声环；锚点存活期不做全文档查询；
 *   巡检结果微任务合并。
 */
import {
  CONTEXT_METER_CIRCUMFERENCE,
  haloDashArray,
  isContextMeterAnchor,
} from '../../../src/util/context-occupancy.js';

/** 占用快照（每会话一份内存缓存；字段与 session-stats 响应对齐）。 */
interface OccupancySnapshot {
  stockTokens: number | null;
  /** 分通道存量（面板分项行展示）。 */
  recallTokens: number | null;
  profileTokens: number | null;
  contextWindowTokens: number | null;
  /** 旧会话回填（票08）：host 侧估出的双通道份额（会话 surface 现扫 + 当前组词）。 */
  backfillRecallTokens: number | null;
  backfillProfileTokens: number | null;
  /** 会话档位（OFF 态注记行依据）。 */
  mode: string | null;
  updatedAt: number;
}

/** 面板小节消费的只读视图（避免反向依赖缓存内部结构）。 */
export interface MeterSnapshotView {
  stockTokens: number | null;
  recallTokens: number | null;
  profileTokens: number | null;
  contextWindowTokens: number | null;
  mode: string | null;
}

type StatsCall = (endpoint: string, payload?: unknown) => Promise<unknown>;

/** 宿主 RPC 调用通道（pill 挂载时注入一次；connection 可选服务可能晚到）。 */
let statsCall: StatsCall | null = null;

/** 每会话占用缓存：命中即同帧绘制，冷启动才走一次网络。 */
const snapshotBySession = new Map<string, OccupancySnapshot>();
/** 当前活跃会话（pill 生命周期随 sessionId 切换上报）。 */
let activeSessionId: string | null = null;

/* ── 面板开合监听（票05 消费；此处只负责观测分发） ── */
type PanelOpenListener = (open: boolean) => void;
const panelListeners = new Set<PanelOpenListener>();
let panelWasOpen = false;

/* ── 快照更新监听（面板冷启动错过后的补挂时机） ── */
const snapshotListeners = new Set<() => void>();

/** 注入数据通道（幂等；后到的调用覆盖前值）。 */
export function initOccupancyIndicator(call: StatsCall): void {
  statsCall = call;
}

/** pill 生命周期随 sessionId 上报当前会话；切会话即冷启动检查。 */
export function noteOccupancySession(sessionId: string | null): void {
  if (sessionId === activeSessionId) return;
  activeSessionId = sessionId;
  panelWasOpen = false;
  if (sessionId !== null && !snapshotBySession.has(sessionId)) void fetchSnapshot(true); // T3 冷启动不吃 T2 节流
}

/** 订阅官方明细面板开合（返回退订函数）。 */
export function onMeterPanelOpen(listener: PanelOpenListener): () => void {
  panelListeners.add(listener);
  return () => panelListeners.delete(listener);
}

/** 订阅缓存更新（每次成功取数后触发；面板冷启动补挂消费）。 */
export function onMeterSnapshotUpdate(listener: () => void): () => void {
  snapshotListeners.add(listener);
  return () => snapshotListeners.delete(listener);
}

/**
 * 有效占用（票08 host 回填合并）：召回 = max(host surface 扫描, 账本)——surface 扫描
 * 是"窗口内全部注入"的最好估计（官方环同数、压缩折叠自动出局）；账本补 live 会话
 * 不在 store 的场景。稳定区 = 账本非零优先（实测值），否则按当前组词估算。
 */
function effectiveView(
  snap: OccupancySnapshot | undefined,
): { stock: number; recall: number; profile: number; window: number | null } {
  const recall = Math.max(snap?.backfillRecallTokens ?? 0, snap?.recallTokens ?? 0);
  const ledgerProfile = snap?.profileTokens ?? 0;
  const profile = ledgerProfile > 0 ? ledgerProfile : snap?.backfillProfileTokens ?? 0;
  return { stock: recall + profile, recall, profile, window: snap?.contextWindowTokens ?? null };
}

/** 当前会话占用只读视图（无活跃会话或无缓存时为 null；面板挂载时机消费）。 */
export function currentMeterSnapshot(): MeterSnapshotView | null {
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
    mode: snap.mode,
  };
}

/** 结构签名单例当前命中的官方环触发按钮（面板定位用它做从属校验）。 */
export function currentAnchor(): HTMLButtonElement | null {
  return anchorCache?.button ?? null;
}

/* ── 数据获取 ── */

const FETCH_MIN_INTERVAL_MS = 2_000;
/** 连续失败达到该次数 ⇒ 视为数据不可信，弧退回原生外观（契约 C1 视觉状态表）。 */
const FETCH_FAILURE_REMOVE_AFTER = 3;
let lastFetchStartedAt = 0;
let fetchInFlight = false;
let fetchFailureStreak = 0;

/**
 * 拉 session-stats 更新当前会话缓存。T2 时钟触发时受最小间隔节流——
 * 数字只在轮次边界变化，2s 内连发的官方刷新不必逐次跟取。
 */
async function fetchSnapshot(force = false): Promise<void> {
  const sid = activeSessionId;
  if (!statsCall || !sid || fetchInFlight) return;
  if (!force && Date.now() - lastFetchStartedAt < FETCH_MIN_INTERVAL_MS) return;
  fetchInFlight = true;
  lastFetchStartedAt = Date.now();
  try {
    const res = (await statsCall('dsh-memory/session-stats', { sessionId: sid })) as {
      ok?: boolean;
      value?: {
        supported?: boolean;
        memoryOccupancy?: { stockTokens: number; recallTokens: number; profileTokens: number } | null;
        occupancyBackfill?: { recallTokens: number | null; profileTokens: number } | null;
        contextWindowTokens?: number | null;
        mode?: string;
      };
    };
    const v = res && res.ok ? res.value : undefined;
    if (!res || !res.ok) {
      // RPC 错误信封走与传输层 throw 同途（信封是 resolve 非 reject，pill 的 load()
      // 先例证明宿主侧瞬时错误以 ok:false 抵达）：保留旧缓存、计入连败，
      // 达阈值由 applyHalo 走退场路径——spec「偶发失败保留旧缓存」的完整语义。
      fetchFailureStreak++;
      scheduleReconcile();
      return;
    }
    if (sid !== activeSessionId) return; // 快速切会话：过期响应丢弃
    snapshotBySession.set(sid, {
      stockTokens: v?.supported && v.memoryOccupancy ? v.memoryOccupancy.stockTokens : null,
      recallTokens: v?.supported && v.memoryOccupancy ? v.memoryOccupancy.recallTokens : null,
      profileTokens: v?.supported && v.memoryOccupancy ? v.memoryOccupancy.profileTokens : null,
      backfillRecallTokens: v?.supported ? v.occupancyBackfill?.recallTokens ?? null : null,
      backfillProfileTokens: v?.supported ? v.occupancyBackfill?.profileTokens ?? null : null,
      contextWindowTokens: v?.supported ? (v.contextWindowTokens ?? null) : null,
      mode: v?.supported ? (v.mode ?? null) : null,
      updatedAt: Date.now(),
    });
    fetchFailureStreak = 0;
    for (const l of snapshotListeners) l();
    scheduleReconcile();
  } catch {
    // 失败保留旧缓存；连续失败达阈值 ⇒ 弧退场（静默，无红错），下一轮官方时钟自然重试
    fetchFailureStreak++;
    scheduleReconcile();
  } finally {
    fetchInFlight = false;
  }
}

/* ── DOM 寄生层 ── */

/** 寄生圆类名（同时是回声环过滤标记）。 */
const PARASITE_CLASS = 'dsh-mem-parasite';

let observer: MutationObserver | null = null;
let reconcileScheduled = false;
/** 锚点缓存：存活期内巡检走父链校验，不做全文档查询（高变动期降频纪律）。 */
let anchorCache: { button: HTMLButtonElement; svg: SVGSVGElement } | null = null;

/** 启动观察器（body 级全局单例，多实例幂等；常驻 pill 驱动启动）。 */
export function watchContextMeter(): void {
  if (observer !== null || typeof document === 'undefined' || !document.body) return;
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['stroke-dasharray', 'aria-expanded', 'aria-label'],
  });
  scheduleReconcile();
}

function onMutations(mutations: ReadonlyArray<MutationRecord>): void {
  for (const m of mutations) {
    const target = m.target as Element | null;
    // 回声环过滤：自家寄生节点或其属性变化不调度巡检
    if (target && typeof target.classList?.contains === 'function' && target.classList.contains(PARASITE_CLASS)) {
      continue;
    }
    scheduleReconcile();
    return;
  }
}

function scheduleReconcile(): void {
  if (reconcileScheduled) return;
  reconcileScheduled = true;
  queueMicrotask(() => {
    reconcileScheduled = false;
    reconcile();
  });
}

/** 结构签名定位官方环按钮（locale 无关主锚）。 */
function findAnchor(): { button: HTMLButtonElement; svg: SVGSVGElement } | null {
  const candidates = document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]');
  for (let i = 0; i < candidates.length; i++) {
    const button = candidates[i];
    if (!button) continue;
    const svg = button.querySelector('svg');
    if (!svg) continue;
    const circles = svg.querySelectorAll('circle');
    const radii: number[] = [];
    for (let c = 0; c < circles.length; c++) {
      const r = parseFloat(circles[c]?.getAttribute('r') ?? '');
      if (Number.isFinite(r)) radii.push(r);
    }
    if (
      isContextMeterAnchor({
        ariaHasPopup: button.getAttribute('aria-haspopup'),
        viewBox: svg.getAttribute('viewBox'),
        circleRadii: radii,
      })
    ) {
      return { button, svg };
    }
  }
  return null;
}

function reconcile(): void {
  // 锚点缓存仍连接 ⇒ 直接沿用（流式输出高频 mutation 不再做文档查询）；失联才重扫
  if (!anchorCache || !anchorCache.button.isConnected || !anchorCache.svg.isConnected) {
    const found = document.body ? findAnchor() : null;
    anchorCache = found ? found : null;
  }
  if (!anchorCache) return;

  // 面板开合检测（aria-expanded 属性变更驱动）
  const open = anchorCache.button.getAttribute('aria-expanded') === 'true';
  if (open !== panelWasOpen) {
    panelWasOpen = open;
    for (const l of panelListeners) l(open);
    if (open) void fetchSnapshot(true); // 用户动作时刻：强制取最新权威账（绕过节流）
  }

  applyHalo();
}

/** 按"官方 fill dasharray 变化 ⇒ 占用数值已变"在本地重写自家弧长并按需节流重取。 */
function applyHalo(): void {
  const svg = anchorCache?.svg;
  if (!svg) return;
  const snap = activeSessionId !== null ? snapshotBySession.get(activeSessionId) : undefined;
  const failing = fetchFailureStreak >= FETCH_FAILURE_REMOVE_AFTER;
  const view = failing ? { stock: 0, recall: 0, profile: 0, window: null } : effectiveView(snap);
  const win = view.window;
  const ratio = win !== null && win > 0 ? Math.min(1, Math.max(0, view.stock / win)) : null;

  const existing = svg.querySelector(`circle.${PARASITE_CLASS}`);
  if (ratio === null || ratio <= 0) {
    existing?.remove(); // 无有效占比 ⇒ 退场，SVG 与原生形态一致（OFF/空账同理）
    return;
  }

  let halo = existing as SVGCircleElement | null;
  if (!halo) {
    halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    halo.setAttribute('class', PARASITE_CLASS);
    halo.setAttribute('cx', '7');
    halo.setAttribute('cy', '7');
    halo.setAttribute('r', '6.4'); // 外圈：永不遮盖官方 r=5.5 双弧（约束①的结构性保证）
    halo.setAttribute('fill', 'none');
    halo.setAttribute('stroke', 'var(--dsh-mem-accent)');
    halo.setAttribute('stroke-width', '0.85');
    halo.setAttribute('transform', 'rotate(-90 7 7)');
    halo.style.filter = 'drop-shadow(0 0 3px var(--dsh-mem-accent))'; // 光晕仅挂自身，不插官方 defs
    halo.setAttribute('aria-hidden', 'true');
    halo.style.pointerEvents = 'none';
    svg.appendChild(halo); // 寄生动作本体：追加第三条 circle
  }
  halo.setAttribute('stroke-dasharray', haloDashArray(ratio, CONTEXT_METER_CIRCUMFERENCE));

  // T2 时钟：官方 fill 的 dasharray 与上次记录不同 ⇒ 官方数字变了 ⇒ 节流重取权威账。
  // （首次记录不触发——冷启动取数由 noteOccupancySession 负责，这里只对"变化"响应。）
  const fill = svg.querySelector('circle:nth-of-type(2)');
  const offKey = fill?.getAttribute('stroke-dasharray') ?? '';
  if (svg.dataset.offKey !== undefined && svg.dataset.offKey !== offKey) {
    void fetchSnapshot();
  }
  svg.dataset.offKey = offKey;
}
