/**
 * 客户端 i18n 层：探测宿主 locale 服务（可选依赖，缺失不阻塞），注册
 * `dsh-memory` 命名空间（zh/en 完整字典）；宿主缺失或注册失败时回退 zh 字面量。
 * 所有用户可见文案必须经 t()；UI 重构 spec v2 §11（双语随宿主 locale，不同屏并列）。
 */

const zh: Record<string, string> = {
  'scope.auto': '智能',
  'scope.chat': '日常',
  'scope.work': '工作',
  'flow.follow': '跟随全局',
  'flow.rw': '读写',
  'flow.wo': '只写',
  'flow.paused': '暂停',
  'row.scope': '记忆范围',
  'row.flow': '数据流',
  'chip.base': '记忆',
  'chip.wo': '只写',
  'chip.paused': '暂停',
  'chip.degraded': '降级',
  'chip.title': '本会话记忆（点击设置范围与数据流）',
  'err.load': '读取失败，点击重试',
};

const en: Record<string, string> = {
  'scope.auto': 'Auto',
  'scope.chat': 'Personal',
  'scope.work': 'Work',
  'flow.follow': 'Follow global',
  'flow.rw': 'Read & write',
  'flow.wo': 'Write only',
  'flow.paused': 'Paused',
  'row.scope': 'Memory scope',
  'row.flow': 'Data flow',
  'chip.base': 'Memory',
  'chip.wo': 'write-only',
  'chip.paused': 'paused',
  'chip.degraded': 'degraded',
  'chip.title': 'Session memory (click to configure)',
  'err.load': 'Load failed, click to retry',
};

const FALLBACK = zh;

let bound: ((key: string) => unknown) | null = null;
let inited = false;

/** 探测并接入宿主 locale 服务（幂等；失败静默回退 zh）。 */
export function initI18n(ctx: unknown): void {
  if (inited) return;
  inited = true;
  const get = (ctx as { get?: (name: string) => unknown } | null)?.get;
  if (typeof get !== 'function') return;
  let locale: unknown;
  try {
    locale = get.call(ctx, 'locale');
  } catch {
    return;
  }
  const l = locale as { register?: (ns: string, dicts: unknown) => unknown; bind?: (ns: string) => unknown } | null | undefined;
  if (!l || typeof l.register !== 'function' || typeof l.bind !== 'function') return;
  try {
    l.register('dsh-memory', { zh, en });
    const t = l.bind('dsh-memory');
    if (typeof t !== 'function') return;
    // 宿主 t 对缺键返回键名本身——回退 zh 字面量，绝不把键名漏到界面上
    bound = (key: string) => {
      const s = t(key);
      return typeof s === 'string' && s !== key && s !== '' ? s : (FALLBACK[key] ?? key);
    };
  } catch {
    bound = null; // 注册失败（重复注册等）→ zh 字面量
  }
}

/** 取文案：宿主 locale 优先，回退 zh。 */
export function t(key: string): string {
  if (bound) {
    const s = String(bound(key));
    if (s) return s;
  }
  return FALLBACK[key] ?? key;
}

/** 档位显示名（工作台概览等处使用；带族语义后缀，与芯片短标签区分）。 */
export function modeLabel(key: string | null | undefined): string {
  if (key === 'auto') return '智能（双族）';
  if (key === 'chat') return '日常（个人）';
  if (key === 'work') return '工作（团队）';
  return '关闭';
}
