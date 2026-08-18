/**
 * 召回预算与超时（ADR-0001 / 规格 A 节；机制移植自 MemoryCore auto-recall 的
 * applyRecallBudget，超时为 dsh 侧新增的总预算语义）。
 *
 * 预算：单条记忆截断上限 + 整轮总量上限——超限截断并以后缀引导模型用记忆工具
 * 查全文（截断是引流而不是损失：工具路径返回完整记录）；总量超限按融合排名丢尾部。
 * 超时：召回是增强能力，超时跳过本轮注入、绝不阻塞对话（CONTEXT.md「召回超时」语义
 * 在本模块以 raceTimeout 落地）。
 */

/** 截断后缀：显式告诉模型全文在工具侧（引导主动深挖，原版同款设计）。 */
export const RECALL_TRUNCATION_SUFFIX =
  '…（已截断；可用 memory_search 或 conversation_search 查看详情）';

/** 剩余预算小于该值时整条丢弃（截出比后缀还短的行没有意义）。 */
const MIN_TRUNCATED_RECALL_LINE_CHARS = 40;

export interface RecallBudgetLimits {
  /** 单条记忆注入长度上限（字符）；0 = 不限。 */
  maxCharsPerMemory: number;
  /** 整轮注入总量上限（字符）；0 = 不限。超限时低分（排名靠后）尾部先丢。 */
  maxTotalRecallChars: number;
}

function normalizeLimit(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

/** 按 code point 计数截断（不劈开代理对），带引导后缀。 */
export function truncateRecallLine(line: string, maxChars: number): string {
  const cps = Array.from(line);
  if (cps.length <= maxChars) return line;
  if (maxChars <= RECALL_TRUNCATION_SUFFIX.length) {
    return cps.slice(0, maxChars).join('');
  }
  return `${cps.slice(0, maxChars - RECALL_TRUNCATION_SUFFIX.length).join('').trimEnd()}${RECALL_TRUNCATION_SUFFIX}`;
}

/**
 * 对召回行施加预算：先逐条截断，再按总量预算装填——装不下的尾部整条丢弃。
 * 输入行应按相关性降序（低分先丢）。
 */
export function applyRecallBudget(lines: string[], limits: RecallBudgetLimits): string[] {
  const maxCharsPerMemory = normalizeLimit(limits.maxCharsPerMemory);
  const maxTotalRecallChars = normalizeLimit(limits.maxTotalRecallChars);
  if (!maxCharsPerMemory && !maxTotalRecallChars) return lines;

  const budgeted: string[] = [];
  let usedChars = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const perBounded = maxCharsPerMemory ? truncateRecallLine(line, maxCharsPerMemory) : line;

    if (!maxTotalRecallChars) {
      budgeted.push(perBounded);
      continue;
    }

    const separatorChars = budgeted.length > 0 ? 1 : 0; // 行间换行符计入预算
    const remaining = maxTotalRecallChars - usedChars - separatorChars;
    if (remaining <= 0) break;
    if (perBounded.length > remaining) {
      const canFit = remaining >= MIN_TRUNCATED_RECALL_LINE_CHARS;
      if (canFit) budgeted.push(truncateRecallLine(perBounded, remaining));
      break;
    }
    budgeted.push(perBounded);
    usedChars += separatorChars + perBounded.length;
  }

  return budgeted;
}

/**
 * 召回总预算：超时返回 undefined（调用方跳过本轮注入），正常 resolve 返回原值。
 * resolve 为空结果（空数组）与超时（undefined）语义不同，调用方据此区分日志。
 */
export async function raceRecallTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 召回路径远程嵌入 fetch 的内层钳制（固定值）：给 FTS 降级留出总预算内的时间。
 *  仅作用于远程 HTTP 调用；本地推理不受钳制（进程内 CPU 推理无挂起风险）。 */
export const RECALL_EMBED_CAP_MS = 3_000;
