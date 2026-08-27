/**
 * 明细面板「记忆」分项小节（寄生组件二）：官方 ContextMeter 点开的 dialog 底部
 * 追加一块自渲染的占用明细。只增不改——不触碰官方三桶行；关闭随容器销毁，
 * 打开期数字静止（零运行时工作）。
 *
 * 定位策略（locale 无关优先，失配静默放弃）：
 * 1. aria-expanded 翻转（观察器分发）后，取当前可见的 [role="dialog"] 中
 *    不含本组件标记且非锚点宿主的最近一个；
 * 2. 在其根上追加独立 <section data-dsh-mem-panel>；
 * 3. 找不到目标即本轮放弃（下轮开合重试），绝不写进错误容器。
 *
 * 可见性规则（component-design C2）：召回/稳定区行按各自份额>0 显示；
 * 占比行仅在有官方窗口分母时出现；OFF 态追加「已停用」注记行。
 */
import { onMeterPanelOpen, type MeterSnapshotView } from './occupancy-indicator.js';

const SECTION_TAG = 'dsh-mem-panel';
let inited = false;
/** 当前挂载的小节（关闭时主动摘除，防容器复用残留）。 */
let mounted: HTMLElement | null = null;

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
    if (!open) {
      mounted?.remove();
      mounted = null;
      return;
    }
    const view = read();
    if (!view) return;
    // 打开是一次离散用户动作：此处允许一次性的可见性探测（不属于巡检热路径）
    const target = findDialogRoot();
    if (!target) return; // 容器未就绪/结构变更：静默放弃，下轮重试
    target.appendChild(renderSection(view));
  });
}

/** 找官方明细 dialog 根：可见、不含自家标记、不是锚点按钮自身的宿主。 */
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
  mounted?.remove(); // 理论不可达（容器去重），防御重复挂载
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

  if (view.stockTokens !== null && view.contextWindowTokens !== null && view.contextWindowTokens > 0) {
    const pct = Math.min(100, Math.max(0, (view.stockTokens / view.contextWindowTokens) * 100));
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
