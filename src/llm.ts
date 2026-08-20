/**
 * LLM 桥：用 DSH 自身的 llm 服务跑蒸馏调用。
 */
import type { Context } from '@deepseek-ai/cordis';
// 纯类型导入：拉入 dsh-agent-default-model 的 Context.agentDefaultModel 声明合并。
import type {} from '@deepseek-ai/dsh-agent-default-model';
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { MemoryConfig } from './config.js';
import type { MemoryLogger } from './types.js';
import { errDetail } from './util/filelog.js';

export interface LlmCallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** 诊断日志（缺失时静默，不影响调用） */
  logger?: MemoryLogger;
}

// ── 分层输出预算（规格 C 节）：结构化蒸馏远用不到总闸级预算，逐层设护栏；
//    模型跑偏时单次损失有界。数值"先试跑"状态，按线上截断率调整。
/** L1 抽取（大输入块的 JSON 记忆数组输出）。 */
export const LAYER_MAX_TOKENS_EXTRACT = 16_000;
/** L1 去重（合并决策数组，输出比抽取短）。 */
export const LAYER_MAX_TOKENS_DEDUP = 8_000;
/** L2 场景整合（完整场景 Markdown 文件输出，输出最重的层）。 */
export const LAYER_MAX_TOKENS_L2 = 32_000;
/** L3 画像（完整 persona 文档）。 */
export const LAYER_MAX_TOKENS_L3 = 16_000;

/** 分层输出预算键（运行时设置 / UI 与内置默认共用同一套键名）。 */
export type DistillBudgetLayer = 'extract' | 'dedup' | 'l2' | 'l3';

/** 各层内置默认预算（设置页"0 = 跟随默认"的默认值来源）。 */
export const LAYER_DEFAULT_BUDGETS: Record<DistillBudgetLayer, number> = {
  extract: LAYER_MAX_TOKENS_EXTRACT,
  dedup: LAYER_MAX_TOKENS_DEDUP,
  l2: LAYER_MAX_TOKENS_L2,
  l3: LAYER_MAX_TOKENS_L3,
};

/**
 * 解析某蒸馏层的生效输出预算：运行时覆盖（cfg.llm.budgets，由 effectiveCfg 从
 * 设置页 distillBudgets 注入，0/缺省 = 跟随）→ 内置默认 → 思考档放大
 * （high/max ×4，reasoning 计入输出预算的历史事故防线）。
 */
export function resolveLayerTokens(cfg: { llm: { reasoningEffort: string; budgets?: Partial<Record<DistillBudgetLayer, number>> } }, layer: DistillBudgetLayer): number {
  const override = cfg.llm.budgets?.[layer];
  return layerMaxTokens(override && override > 0 ? override : LAYER_DEFAULT_BUDGETS[layer], cfg.llm.reasoningEffort);
}

/**
 * 思考档预算放大：reasoning 计入输出预算（v4-flash 事故：high 思考可吃光全部
 * 预算致正文 0 字符）——effort 为 high/max 时分层预算 ×4。
 */
export function layerMaxTokens(base: number, reasoningEffort: string): number {
  return reasoningEffort === 'high' || reasoningEffort === 'max' ? base * 4 : base;
}

/** 解析蒸馏用的 provider/model：配置优先，其次当前默认选择。 */
export async function resolveModelRoute(
  ctx: Context,
  cfg: MemoryConfig,
): Promise<{ provider: string; model: string }> {
  if (cfg.llm.provider && cfg.llm.model) {
    return { provider: cfg.llm.provider, model: cfg.llm.model };
  }
  // agentDefaultModel 是可选服务（dsh-agent-default-model 提供），缺失时不得抛错。
  const defaults = ctx.get('agentDefaultModel');
  const sel = defaults?.currentSelection?.();
  if (sel?.provider && sel?.model) {
    return { provider: cfg.llm.provider || sel.provider, model: cfg.llm.model || sel.model };
  }
  throw new Error(
    '无法解析蒸馏模型路由：请在插件 config 中配置 llm.provider / llm.model，或确保存在默认模型选择',
  );
}

/**
 * 一次完整蒸馏调用：流式收集文本，返回最终字符串。
 * 失败（error/aborted finish）抛错，由调用方兜底。
 *
 * 文本只从 block-end（协议保证携带**组装完成的整块**）取；text-delta 仅在
 * 适配器异常地没有发 block-end 时兜底。两者都累计会把输出翻倍。
 */
export async function callLLM(ctx: Context, cfg: MemoryConfig, opts: LlmCallOptions): Promise<string> {
  const { provider, model } = await resolveModelRoute(ctx, cfg);
  const signal = opts.signal ?? AbortSignal.timeout(cfg.llm.timeoutMs);

  // 输入预算兜底：任何蒸馏调用的用户 prompt 不超过 maxInputChars
  // （L1 已在数据层分块，这里是 L2/L3 与异常场景的最后一道网）
  const user =
    opts.user.length > cfg.llm.maxInputChars
      ? `${opts.user.slice(0, cfg.llm.maxInputChars)}\n\n[输入超出 ${cfg.llm.maxInputChars} 字符预算，已截断]`
      : opts.user;

  const stream = ctx.llm.stream({
    provider,
    model,
    system: opts.system,
    messages: [createUserMessage({ content: [{ type: 'text', text: user }], source: { kind: 'user' } })],
    temperature: opts.temperature ?? cfg.llm.temperature,
    maxTokens: opts.maxTokens ?? cfg.llm.maxTokens,
    // 默认 off：蒸馏是结构化抽取，high 思考可吃光全部输出预算致正文 0 字符；空串不传（非推理模型）
    ...(cfg.llm.reasoningEffort
      ? { reasoningEffort: ReasoningEffortId(cfg.llm.reasoningEffort) }
      : {}),
    signal,
  });

  const startedAt = Date.now();
  let deltaText = '';
  let blockText = '';
  // 块级统计：空输出诊断的唯一现场（finish reason / token 计数 / reasoning 是否吃光预算）
  let finishKind = '';
  let outputTokens = 0;
  let reasoningTokens = 0;
  let deltaBlocks = 0;
  let reasoningChars = 0;
  let reasoningHead = '';
  const blockEndTypes = new Map<string, number>();
  try {
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        deltaBlocks++;
        deltaText += chunk.text;
      } else if (chunk.type === 'reasoning-delta') {
        reasoningChars += chunk.text.length;
        if (reasoningHead.length < 300) reasoningHead += chunk.text.slice(0, 300 - reasoningHead.length);
      } else if (chunk.type === 'block-end') {
        blockEndTypes.set(chunk.block.type, (blockEndTypes.get(chunk.block.type) ?? 0) + 1);
        if (chunk.block.type === 'text') blockText += chunk.block.text;
      } else if (chunk.type === 'usage') {
        outputTokens = chunk.usage.outputTokens;
        reasoningTokens = chunk.usage.reasoningTokens ?? 0;
      } else if (chunk.type === 'finish') {
        finishKind = chunk.reason.kind;
        if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
          const failure = (chunk.reason as { failure?: { message?: string } }).failure;
          throw new Error(`llm ${chunk.reason.kind}: ${failure?.message ?? 'unknown failure'}`);
        }
      }
    }
  } catch (err) {
    opts.logger?.warn(
      `[memory] LLM 调用失败 ${provider}/${model}（${((Date.now() - startedAt) / 1000).toFixed(1)}s）: ${errDetail(err)}`,
    );
    throw err;
  }
  const out = (blockText || deltaText).trim();
  if (out.length === 0) {
    // 空输出是最难排查的失败：流正常结束但一个字没吐。必须记录 finish 原因、
    // token 计数与块分布，才能区分"模型只产出了 reasoning"vs"服务端返回空响应"。
    opts.logger?.warn(
      `[memory] LLM 空输出 ${provider}/${model}（${((Date.now() - startedAt) / 1000).toFixed(1)}s，finish=${finishKind || '无 finish 块'}` +
        `，输出 tokens=${outputTokens}${reasoningTokens > 0 ? `/reasoning ${reasoningTokens}` : ''}，` +
        `text-delta ${deltaBlocks} 块/${deltaText.length} 字符，reasoning ${reasoningChars} 字符，` +
        `block-end: ${[...blockEndTypes.entries()].map(([t, n]) => `${t}×${n}`).join(', ') || '无'}）` +
        (reasoningHead ? `，reasoning 摘录: ${reasoningHead}…` : ''),
    );
  }
  opts.logger?.info(
    `[memory] LLM 调用 ${provider}/${model}：输入 ${user.length} 字符 → 输出 ${out.length} 字符（${((Date.now() - startedAt) / 1000).toFixed(1)}s，finish=${finishKind || '无'}）`,
  );
  return out;
}

/** 带诊断日志的 parseJson：解析失败时记录原始输出摘录（模型输出异常排查的关键信息）。 */
export function parseJsonLogged<T>(raw: string, what: string, logger?: MemoryLogger): T {
  try {
    return parseJson<T>(raw);
  } catch (err) {
    logger?.error(
      `[memory] ${what} JSON 解析失败（${errDetail(err)}），原始输出前 400 字符: ${raw.slice(0, 400)}`,
    );
    throw new Error(`${what} 输出无法解析为 JSON`);
  }
}

/** 容错地解析 LLM 输出的 JSON（剥掉可能的 ```json 围栏）。 */
export function parseJson<T>(raw: string): T {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }
  const start = s.indexOf('[');
  const brace = s.indexOf('{');
  let begin = -1;
  if (start === -1) begin = brace;
  else if (brace === -1) begin = start;
  else begin = Math.min(start, brace);
  if (begin > 0) s = s.slice(begin);
  const end = s.lastIndexOf(']') > s.lastIndexOf('}') ? s.lastIndexOf(']') + 1 : s.lastIndexOf('}') + 1;
  if (end > 0) s = s.slice(0, end);
  return JSON.parse(s) as T;
}
