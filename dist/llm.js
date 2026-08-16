import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { errDetail } from './util/filelog.js';
/** 解析蒸馏用的 provider/model：配置优先，其次当前默认选择。 */
export async function resolveModelRoute(ctx, cfg) {
    if (cfg.llm.provider && cfg.llm.model) {
        return { provider: cfg.llm.provider, model: cfg.llm.model };
    }
    // agentDefaultModel 是可选服务（dsh-agent-default-model 提供），缺失时不得抛错。
    const defaults = ctx.get('agentDefaultModel');
    const sel = defaults?.currentSelection?.();
    if (sel?.provider && sel?.model) {
        return { provider: cfg.llm.provider || sel.provider, model: cfg.llm.model || sel.model };
    }
    throw new Error('无法解析蒸馏模型路由：请在插件 config 中配置 llm.provider / llm.model，或确保存在默认模型选择');
}
/**
 * 一次完整蒸馏调用：流式收集文本，返回最终字符串。
 * 失败（error/aborted finish）抛错，由调用方兜底。
 *
 * 文本只从 block-end（协议保证携带**组装完成的整块**）取；text-delta 仅在
 * 适配器异常地没有发 block-end 时兜底。两者都累计会把输出翻倍。
 */
export async function callLLM(ctx, cfg, opts) {
    const { provider, model } = await resolveModelRoute(ctx, cfg);
    const signal = opts.signal ?? AbortSignal.timeout(cfg.llm.timeoutMs);
    // 输入预算兜底：任何蒸馏调用的用户 prompt 不超过 maxInputChars
    // （L1 已在数据层分块，这里是 L2/L3 与异常场景的最后一道网）
    const user = opts.user.length > cfg.llm.maxInputChars
        ? `${opts.user.slice(0, cfg.llm.maxInputChars)}\n\n[输入超出 ${cfg.llm.maxInputChars} 字符预算，已截断]`
        : opts.user;
    const stream = ctx.llm.stream({
        provider,
        model,
        system: opts.system,
        messages: [createUserMessage({ content: [{ type: 'text', text: user }], source: { kind: 'user' } })],
        temperature: opts.temperature ?? cfg.llm.temperature,
        maxTokens: opts.maxTokens ?? cfg.llm.maxTokens,
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
    const blockEndTypes = new Map();
    try {
        for await (const chunk of stream) {
            if (chunk.type === 'text-delta') {
                deltaBlocks++;
                deltaText += chunk.text;
            }
            else if (chunk.type === 'reasoning-delta') {
                reasoningChars += chunk.text.length;
                if (reasoningHead.length < 300)
                    reasoningHead += chunk.text.slice(0, 300 - reasoningHead.length);
            }
            else if (chunk.type === 'block-end') {
                blockEndTypes.set(chunk.block.type, (blockEndTypes.get(chunk.block.type) ?? 0) + 1);
                if (chunk.block.type === 'text')
                    blockText += chunk.block.text;
            }
            else if (chunk.type === 'usage') {
                outputTokens = chunk.usage.outputTokens;
                reasoningTokens = chunk.usage.reasoningTokens ?? 0;
            }
            else if (chunk.type === 'finish') {
                finishKind = chunk.reason.kind;
                if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
                    const failure = chunk.reason.failure;
                    throw new Error(`llm ${chunk.reason.kind}: ${failure?.message ?? 'unknown failure'}`);
                }
            }
        }
    }
    catch (err) {
        opts.logger?.warn(`[memory] LLM 调用失败 ${provider}/${model}（${((Date.now() - startedAt) / 1000).toFixed(1)}s）: ${errDetail(err)}`);
        throw err;
    }
    const out = (blockText || deltaText).trim();
    if (out.length === 0) {
        // 空输出是最难排查的失败：流正常结束但一个字没吐。必须记录 finish 原因、
        // token 计数与块分布，才能区分"模型只产出了 reasoning"vs"服务端返回空响应"。
        opts.logger?.warn(`[memory] LLM 空输出 ${provider}/${model}（${((Date.now() - startedAt) / 1000).toFixed(1)}s，finish=${finishKind || '无 finish 块'}` +
            `，输出 tokens=${outputTokens}${reasoningTokens > 0 ? `/reasoning ${reasoningTokens}` : ''}，` +
            `text-delta ${deltaBlocks} 块/${deltaText.length} 字符，reasoning ${reasoningChars} 字符，` +
            `block-end: ${[...blockEndTypes.entries()].map(([t, n]) => `${t}×${n}`).join(', ') || '无'}）` +
            (reasoningHead ? `，reasoning 摘录: ${reasoningHead}…` : ''));
    }
    opts.logger?.info(`[memory] LLM 调用 ${provider}/${model}：输入 ${user.length} 字符 → 输出 ${out.length} 字符（${((Date.now() - startedAt) / 1000).toFixed(1)}s，finish=${finishKind || '无'}）`);
    return out;
}
/** 带诊断日志的 parseJson：解析失败时记录原始输出摘录（模型输出异常排查的关键信息）。 */
export function parseJsonLogged(raw, what, logger) {
    try {
        return parseJson(raw);
    }
    catch (err) {
        logger?.error(`[memory] ${what} JSON 解析失败（${errDetail(err)}），原始输出前 400 字符: ${raw.slice(0, 400)}`);
        throw new Error(`${what} 输出无法解析为 JSON`);
    }
}
/** 容错地解析 LLM 输出的 JSON（剥掉可能的 ```json 围栏）。 */
export function parseJson(raw) {
    let s = raw.trim();
    if (s.startsWith('```')) {
        s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }
    const start = s.indexOf('[');
    const brace = s.indexOf('{');
    let begin = -1;
    if (start === -1)
        begin = brace;
    else if (brace === -1)
        begin = start;
    else
        begin = Math.min(start, brace);
    if (begin > 0)
        s = s.slice(begin);
    const end = s.lastIndexOf(']') > s.lastIndexOf('}') ? s.lastIndexOf(']') + 1 : s.lastIndexOf('}') + 1;
    if (end > 0)
        s = s.slice(0, end);
    return JSON.parse(s);
}
