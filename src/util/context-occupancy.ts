/**
 * 上下文占用账本：插件注入内容在当前会话上下文窗口中的启发式 token 存量。
 *
 * 本模块是全部占用数字的**唯一算术来源**（host 记账与 client 渲染共用，esbuild
 * 将其内联进 client bundle），任何一侧不得另写算法。口径与官方
 * @deepseek-ai/dsh-token-meter/estimate 的固定密度启发式同式：
 *
 *   - text 块 = ceil(chars / 4) + 4（块开销）；
 *   - 整条 user 消息（召回注入体的形态）再叠加 role overhead 4；
 *   - 系统提示里的稳定区**子片**计入时不加任何 overhead——那 +8 是官方对整段
 *     消息/整体系统提示的结构成本，切片重复计会与官方总数对不上；
 *   - 字符数一律 JS `.length`（UTF-16 单元），与官方产出严格可比。
 */

/** 固定文本密度：每 4 字符记 1 token（官方 CHARS_PER_TOKEN 同值）。 */
export const CHARS_PER_TOKEN = 4;

const BLOCK_OVERHEAD = 4;
const ROLE_OVERHEAD = 4;

/** 召回注入体（单 text 块 user message）的启发式 token 数。 */
export function estimateInjectedMessageTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN) + BLOCK_OVERHEAD + ROLE_OVERHEAD;
}

/** 稳定区子片的启发式 token 数（不加结构开销，见模块头注释）。 */
export function estimateStableSectionTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * 单会话占用账本（权威账本只存在于 host 侧；client 仅消费展示）。
 * stockTokens = recallTokens + profileTokens 恒等式由三个迁移函数共同维护。
 */
export interface OccupancyLedger {
  /** 当前估算仍在上下文窗口内的记忆存量（token）。 */
  stockTokens: number;
  /** 累计召回注入存留份额。 */
  recallTokens: number;
  /** 系统提示稳定区当前份额（OFF 使 text() 返回空时即时清零）。 */
  profileTokens: number;
  /** 最近一轮召回注入的增量（悬浮卡/面板"最近一次"语义）。 */
  lastInjectTokens: number;
  updatedAt: number;
}

export function emptyOccupancyLedger(now = Date.now()): OccupancyLedger {
  return { stockTokens: 0, recallTokens: 0, profileTokens: 0, lastInjectTokens: 0, updatedAt: now };
}

/** 召回注入成功后的入账（失败跳过的轮次不调用——账目零扰动）。 */
export function recordRecallInjection(l: OccupancyLedger, chars: number, now = Date.now()): void {
  const tokens = estimateInjectedMessageTokens(chars);
  l.recallTokens += tokens;
  l.stockTokens += tokens;
  l.lastInjectTokens = tokens;
  l.updatedAt = now;
}

/**
 * 稳定区份额随每次实际组进的文本同步（含切回非 OFF 的重新计入）：
 * 增量记账保证重复调用不双算，清零后重设即可净额回补。
 */
export function recordProfileShare(l: OccupancyLedger, chars: number, now = Date.now()): void {
  const tokens = estimateStableSectionTokens(chars);
  l.stockTokens += tokens - l.profileTokens;
  l.profileTokens = tokens;
  l.updatedAt = now;
}

/** OFF 边界：稳定区随下一次请求组装物理离场，账目同边界清零（宁低勿高）。 */
export function clearProfileShare(l: OccupancyLedger, now = Date.now()): void {
  l.stockTokens -= l.profileTokens;
  l.profileTokens = 0;
  l.updatedAt = now;
}

/**
 * compaction 复位：v1 采用"清零重新累积"的低估近似——被压缩掉的注入以整数轮粒度
 * 退出账本，幸存的摘要行不重复认领（已知限制，方向宁低勿高；事件级精确对齐留待 v2）。
 */
export function resetForCompaction(l: OccupancyLedger, now = Date.now()): void {
  l.stockTokens = 0;
  l.recallTokens = 0;
  l.profileTokens = 0;
  l.lastInjectTokens = 0;
  l.updatedAt = now;
}

/* ── 渲染侧纯函数（client 寄生组件用；宿主 smoke 一并断言，数字唯一来源在此） ── */

/**
 * 官方上下文环周长：viewBox 14 内 r=5.5 圆（2π×5.5 ≈ 34.55751918948772），
 * 与真机反推的官方 fill dasharray 分母逐字一致。
 */
export const CONTEXT_METER_CIRCUMFERENCE = 34.55751918948772;

/**
 * 光晕弧 stroke-dasharray：形状沿用官方 fill（len + 全周长 gap）。
 * @param occupancyRatio 占窗口比 0..1（越界钳制）。
 * @param minLen 最小可见弧长（单位=-viewBox 坐标；14px 渲染下 <1 单位即亚像素不可见，
 *  真实占比常低至 0.6%≈0.2 单位——指示灯语义需要"存在即可见"，精确数字归面板）。
 */
export function haloDashArray(
  occupancyRatio: number,
  circumference: number = CONTEXT_METER_CIRCUMFERENCE,
  minLen = 0,
): string {
  const clamped = Number.isFinite(occupancyRatio) ? Math.min(1, Math.max(0, occupancyRatio)) : 0;
  const len = Math.max(clamped * circumference, clamped > 0 ? minLen : 0);
  return `${len} ${circumference}`;
}

/** 官方环触发按钮的结构签名（locale 无关定位依据；见组件设计 C1 锚点节）。 */
export interface ContextMeterAnchorSignature {
  ariaHasPopup?: string | null;
  viewBox?: string | null;
  circleRadii?: ReadonlyArray<number>;
}

/** 半径比对容差：吞掉渲染库对属性值的无害浮点噪声。 */
const RADIUS_EPSILON = 1e-6;

export function isContextMeterAnchor(sig: ContextMeterAnchorSignature): boolean {
  if (sig.ariaHasPopup !== 'dialog') return false;
  if (sig.viewBox !== '0 0 14 14') return false;
  const radii = sig.circleRadii;
  if (!Array.isArray(radii) || radii.length !== 2) return false;
  return radii.every((r) => Math.abs(r - 5.5) < RADIUS_EPSILON);
}
