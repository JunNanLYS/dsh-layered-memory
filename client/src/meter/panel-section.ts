/**
 * 明细面板「记忆」分项小节（寄生组件二）：官方 ContextMeter 点开的 dialog 底部
 * 追加一块自渲染的占用明细。只增不改——不触碰官方三桶行；关闭随容器销毁，
 * 打开期数字静止（零运行时工作）。
 *
 * 挂载规则：
 * - 零存量/无快照 ⇒ 整节不出现（开局即 OFF 与"从未注入"等价，无既定事实可显示）；
 * - OFF 且有残留存量 ⇒ 正常分项 + 「已停用 · 显示现存残留」注记；
 * - 定位需满足"焦点仍在锚点按钮上 + 容器可见且无自家标记"，失配静默放弃
 *   （下一次开合或快照更新时自动重试，见 update 订阅）。
 */
import {
  currentAnchor,
  onMeterPanelOpen,
  onMeterSnapshotUpdate,
  type MeterSnapshotView,
} from './occupancy-indicator.js';

const SECTION_TAG = 'dsh-mem-panel';
let inited = false;
/** 当前挂载的小节（关闭时主动摘除，防容器复用残留）。 */
let mounted: HTMLElement | null = null;
/** 面板当前是否处于打开期（快照更新补挂只在打开期生效）。 */
let panelOpen = false;

/** 官方 formatTokens 风格的数量级压缩（K/M 一位小数内）。 */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return String(Math.round(n));
}

/**
 * 启动面板挂载监听（幂等单例；由常驻 pill 的 init 链驱动一次）。
 * 快照读取器由指示器模块提供（避免本模块反向依赖其内部缓存）。
 */
export function initPanelSection(read: () => MeterSnapshotView | null): void {
  if (inited) return;
  inited = true;
  onMeterPanelOpen((open) => {
    panelOpen = open;
    if (!open) {
      mounted?.remove();
      mounted = null;
      return;
    }
    // 打开是一次离散用户动作：此处允许一次性的可见性探测（不属于巡检热路径）
    tryMount(read);
  });
  onMeterSnapshotUpdate(() => {
    // 冷启动竞态补偿：开面板瞬间无数据、稍后到账 ⇒ 立即补挂而非等下次开合
    if (panelOpen && !mounted) tryMount(read);
  });
}

/** 尝试挂载：有可显示数据且定位成功才落 DOM。 */
function tryMount(read: () => MeterSnapshotView | null): void {
  const view = read();
  if (!view || view.stockTokens === null || view.stockTokens <= 0) return; // 无既定事实 ⇒ 无显示
  const anchor = currentAnchor();
  if (!anchor || document.activeElement !== anchor) return; // 从属校验失败：静默放弃
  const target = findDialogRoot();
  if (!target) return;
  mounted?.remove(); // 容器去重防御：同容器二次尝试先摘旧节
  mounted = renderSection(view);
  target.appendChild(mounted);
}

/** 找官方明细 dialog 根：可见、不含自家标记。 */
function findDialogRoot(): HTMLElement | null {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  for (let i = dialogs.length - 1; i >= 0; i--) {
    const el = dialogs[i];
    if (!el || !el.isConnected) continue;
    if (el.querySelector(`[data-${SECTION_TAG}]`) || el.hasAttribute(`data-${SECTION_TAG}`)) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    return el;
  }
  return null;
}

function row(dotColor: string, label: string, tokens: number): HTMLDivElement {
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px;';
  const left = document.createElement('span');
  left.style.cssText = `display:inline-flex;align-items:center;gap:6px;color:var(--dsh-mem-text-2);`;
  const dot = document.createElement('i');
  dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${dotColor};display:inline-block;`;
  left.append(dot, document.createTextNode(label));
  const right = document.createElement('span');
  right.textContent = `${fmtTokens(tokens)} tok`;
  right.style.cssText = 'font-variant-numeric:tabular-nums;color:var(--dsh-mem-text-2);';
  div.append(left, right);
  return div;
}

function renderSection(view: MeterSnapshotView): HTMLElement {
  const section = document.createElement('section');
  section.setAttribute(`data-${SECTION_TAG}`, '');
  section.style.cssText = [
    'border-top:1px solid var(--dsh-mem-border)',
    'margin-top:6px',
    'padding-top:8px',
    'font-size:12px',
    'line-height:1.5',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = '记忆 · 本插件占用';
  title.style.cssText = 'color:var(--dsh-mem-text-2);font-weight:600;margin-bottom:4px;';
  section.append(title);

  if (view.recallTokens !== null && view.recallTokens > 0) {
    section.append(row('var(--dsh-mem-accent)', '召回片段', view.recallTokens));
  }
  if (view.profileTokens !== null && view.profileTokens > 0) {
    section.append(row('var(--dsh-mem-accent)', '记忆稳定区', view.profileTokens));
  }

  if (view.contextWindowTokens !== null && view.contextWindowTokens > 0) {
    const pct = Math.min(100, Math.max(0, ((view.stockTokens ?? 0) / view.contextWindowTokens) * 100));
    const share = document.createElement('div');
    share.style.cssText = 'color:var(--dsh-mem-text-3);padding-top:2px;';
    share.textContent = `合计约占当前上下文 ${pct < 0.1 ? '<0.1' : pct.toFixed(1)}%`;
    section.append(share);
  }

  if (view.mode === 'off') {
    const offNote = document.createElement('div');
    offNote.textContent = '已停用 · 显示现存残留';
    offNote.style.cssText = 'color:var(--dsh-mem-text-3);padding-top:2px;';
    section.append(offNote);
  }

  const note = document.createElement('div');
  note.textContent = '近似估算 · 与官方同一算法';
  note.style.cssText = 'color:var(--dsh-mem-text-3);opacity:.75;padding-top:2px;font-size:11px;';
  section.append(note);
  return section;
}
