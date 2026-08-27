import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { errDetail } from './util/filelog.js';
import { recordDistillCall } from './llm-usage.js';
import { recordCostCall } from './token-cost.js';
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
/** 各层内置默认预算（设置页"0 = 跟随默认"的默认值来源）。 */
export const LAYER_DEFAULT_BUDGETS = {
    extract: LAYER_MAX_TOKENS_EXTRACT,
    dedup: LAYER_MAX_TOKENS_DEDUP,
    l2: LAYER_MAX_TOKENS_L2,
    l3: LAYER_MAX_TOKENS_L3,
};
/**
 * 解析某蒸馏层的生效输出预算：运行时覆盖（cfg.llm.budgets，由 effectiveCfg 从
 * 设置页 distillBudgets 注入，0/缺省 = 跟随）→ 内置默认 → 思考档放大
 * （high/xhigh/max ×4，reasoning 计入输出预算的历史事故防线）。放大触发档位
 * 跟层走（#34 D8）：层链头档位候选 > 全局主路由档位候选（primaryEffort > 静态全局）。
 */
export function resolveLayerTokens(cfg, layer) {
    const override = cfg.llm.budgets?.[layer];
    const key = layer === 'l2' ? 'l2' : layer === 'l3' ? 'l3' : 'l1';
    return layerMaxTokens(override && override > 0 ? override : LAYER_DEFAULT_BUDGETS[layer], layerEffortTrigger(cfg, key));
}
/**
 * 高思考档集合（输出预算 ×4 的档位）：阶段侧 layerMaxTokens 与 callLLM 的
 * 自动档防线共用同一张表——此前两处字面量表分叉（防线漏 xhigh），显式 xhigh
 * 配置被双重放大 ×16。勿再在别处抄写该列表。
 */
export const HIGH_EFFORT_TIERS = ['high', 'xhigh', 'max'];
/**
 * 思考档预算放大：reasoning 计入输出预算（v4-flash 事故：high 思考可吃光全部
 * 预算致正文 0 字符）——effort 为 high/xhigh/max 时分层预算 ×4。
 */
export function layerMaxTokens(base, reasoningEffort) {
    return HIGH_EFFORT_TIERS.includes(reasoningEffort) ? base * 4 : base;
}
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
 * 组装蒸馏路由链（纯决策，smoke 决策表缝）：主路由在前、回退条目按配置顺序在后。
 * provider/model 缺失的条目剔除；与主路由或先前条目完全相同（provider+model）的
 * 条目跳过——注定失败的重复尝试不值得占位。每条路由携带生效档位候选：
 * 主路由可带显式档位（运行时统一链注入 primaryEffort），条目档位非空覆盖全局。
 */
export function buildRouteChain(primary, fallbacks, globalEffort) {
    const routes = [{ ...primary, effort: primary.effort || globalEffort }];
    const seen = new Set([`${primary.provider}::${primary.model}`]);
    for (const f of fallbacks ?? []) {
        if (!f.provider || !f.model)
            continue;
        const key = `${f.provider}::${f.model}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        routes.push({ provider: f.provider, model: f.model, effort: f.reasoningEffort || globalEffort });
    }
    return routes;
}
// ── 按层独立路由（#34 / ADR-0005）：层内三级 运行时层链 > 静态层链 > 全局解析 ──
// 层链非空即完整替换该层解析（该层主路由与回退都归层链管，全局链对该层不参与）；
// 档位是全局偏好轴：层链空档位条目/头行仍回退全局档位（primaryEffort 之后的
// cfg.llm.reasoningEffort 语义照旧）。pin 只废运行时侧（effectiveCfg 不注入），
// 静态层链天然穿透——与回退链"静态配置不构成 pin 绕过"先例同源。
/** DistillLayer（调用点四键）→ 路由层键（三键）：l1-extract/l1-dedup 同属 l1。 */
export function layerKeyFor(layer) {
    return layer === 'l2' ? 'l2' : layer === 'l3' ? 'l3' : 'l1';
}
/**
 * 取某层的生效层链（运行时优先）。头行残缺（provider/model 缺失——手写 YAML 错误
 * 或防御性解析后的空链头）视为该层未配置、回退全局解析：路由配置错误不致该层
 * 蒸馏失产，与回退链"条目缺失剔除"同一防御姿态。
 */
function layerChainOf(cfg, key) {
    const rt = cfg.llm.layerChainsRuntime?.[key];
    if (rt?.length && rt[0].provider && rt[0].model)
        return rt;
    const st = cfg.llm.layerRoutes?.[key];
    if (st?.length && st[0].provider && st[0].model)
        return st;
    return undefined;
}
/** 该层的预算放大触发档位（D8）：层链头档位候选 > 全局主路由档位候选（primaryEffort > 静态全局）。 */
export function layerEffortTrigger(cfg, key) {
    const chain = layerChainOf(cfg, key);
    return chain
        ? chain[0].reasoningEffort || cfg.llm.primaryEffort || cfg.llm.reasoningEffort
        : cfg.llm.primaryEffort || cfg.llm.reasoningEffort;
}
/**
 * 解析某次蒸馏调用的实际路由链（callLLM 入口）：有层标签且该层配了层链 → 层链
 * 完整替换（buildRouteChain 复用：头行在前、条目去重、档位三级候选）；否则现行
 * 全局解析（主路由既有优先级 + fallbacks，语义一个比特不动）。layer 缺省
 * （bench/测试缝）= 全局解析。
 */
export async function resolveLayerRoutes(ctx, cfg, layer) {
    if (layer) {
        const chain = layerChainOf(cfg, layerKeyFor(layer));
        if (chain) {
            return buildRouteChain({ provider: chain[0].provider, model: chain[0].model, effort: chain[0].reasoningEffort || '' }, chain.slice(1), cfg.llm.reasoningEffort);
        }
    }
    const primary = await resolveModelRoute(ctx, cfg);
    return buildRouteChain(
    // 主路由显式档位来自运行时统一链（primaryEffort，'' = 跟随全局静态）
    { provider: primary.provider, model: primary.model, effort: cfg.llm.primaryEffort || '' }, cfg.llm.fallbacks, cfg.llm.reasoningEffort);
}
/** 单路由持续失败的一次性告警去重表（effortWarned 同款；拓扑变化随能力缓存一起失效）。 */
const routeDeadWarned = new Set();
function warnRouteDeadOnce(route, logger) {
    if (!logger)
        return;
    const key = `${route.provider}::${route.model}`;
    if (routeDeadWarned.has(key))
        return;
    routeDeadWarned.add(key);
    logger.warn(`[memory] 蒸馏路由 ${route.provider}/${route.model} 失败（每路由仅告警一次；逐次失败原因与降级去向见后续日志）`);
}
const effortCache = new Map();
/** 清空能力缓存（llm/adapters-updated 时调用：供应商增删/改配置后重新探询）。 */
export function invalidateEffortCache() {
    effortCache.clear();
    contextWindowCache.clear();
    effortWarned.clear();
    routeDeadWarned.clear();
}
/** 探询某模型的思考档位能力；失败返回 null（调用方保持旧发送行为，不改判）。 */
export async function resolveModelEfforts(ctx, provider, model) {
    const key = `${provider}::${model}`;
    const hit = effortCache.get(key);
    if (hit)
        return hit;
    try {
        if (typeof ctx.llm?.resolveModelInfo !== 'function')
            return null;
        const info = await ctx.llm.resolveModelInfo(provider, model);
        const efforts = (info.reasoning?.efforts ?? [])
            .map((e) => String(e.id))
            .filter((id) => id.length > 0);
        const cap = {
            efforts,
            ...(info.reasoning?.defaultEffort ? { defaultEffort: String(info.reasoning.defaultEffort) } : {}),
        };
        effortCache.set(key, cap);
        return cap;
    }
    catch {
        return null; // 不缓存失败：路由尚未注册等瞬时态，下次调用重试
    }
}
/** (provider, model) → 上下文窗口 token 数；advisory，未声明/失败为 null。 */
const contextWindowCache = new Map();
/**
 * 探询某模型的上下文窗口容量（adapter 声明的 provider-owned capacity）。
 * 与 effortCache 同源同失效策略（invalidateEffortCache 一并清空）；
 * 仅用于占用指示器的分母展示——分母必须与官方环同源（模型声明值），禁止 client 自估。
 */
export async function resolveModelContextWindow(ctx, provider, model) {
    const key = `${provider}::${model}`;
    if (contextWindowCache.has(key))
        return contextWindowCache.get(key) ?? null;
    try {
        if (typeof ctx.llm?.resolveModelInfo !== 'function')
            return null;
        const info = await ctx.llm.resolveModelInfo(provider, model);
        const win = info.context?.contextWindow;
        const val = typeof win === 'number' && Number.isFinite(win) && win > 0 ? Math.floor(win) : null;
        contextWindowCache.set(key, val);
        return val;
    }
    catch {
        return null; // 不缓存失败：下次调用重试
    }
}
/** 纯决策：配置档位 + 模型能力 → 实际发送值（callLLM 与 settings-get 共用）。 */
export function decideSendableEffort(cap, cfgEffort) {
    if (!cap)
        return { effort: cfgEffort, reason: 'no-capability' };
    if (cfgEffort) {
        if (cap.efforts.includes(cfgEffort))
            return { effort: cfgEffort, reason: 'supported' };
        if (cfgEffort === 'off' && cap.efforts.includes('none'))
            return { effort: 'none', reason: 'alias-none' };
        if (cap.efforts.length === 0)
            return { effort: '', reason: 'no-efforts' };
        return { effort: '', reason: 'unsupported' };
    }
    // 空配置 = 自动：模型默认档 → 无默认取 high（用户规则：未声明/无默认一律 high）→ 仍无则不传
    if (cap.defaultEffort && cap.efforts.includes(cap.defaultEffort)) {
        return { effort: cap.defaultEffort, reason: 'auto-default' };
    }
    if (cap.efforts.includes('high'))
        return { effort: 'high', reason: 'auto-high' };
    return { effort: '', reason: 'no-efforts' };
}
const effortWarned = new Set();
/** 探询 + 决策 + 一次性告警（不支持/未声明时提示降级，不刷屏）。 */
export async function planDistillEffort(ctx, provider, model, cfgEffort, logger) {
    const cap = await resolveModelEfforts(ctx, provider, model);
    const d = decideSendableEffort(cap, cfgEffort);
    if ((d.reason === 'unsupported' || d.reason === 'no-efforts') && logger) {
        const key = `${provider}::${model}::${cfgEffort}::${d.reason}`;
        if (!effortWarned.has(key)) {
            effortWarned.add(key);
            logger.warn(`[memory] 蒸馏思考档位 ${cfgEffort || '(auto)'} 不被 ${provider}/${model} 支持` +
                (d.reason === 'no-efforts'
                    ? '（模型未声明思考档位）'
                    : `（支持: ${cap?.efforts.join('/')}）`) +
                '，本次调用不传档位（跟随模型默认）');
        }
    }
    return d;
}
/**
 * 一次完整蒸馏调用（带回退链，ADR-0004）：按路由链（主路由 + llm.fallbacks）逐条
 * 尝试，返回首个成功路由的输出。失败（error/aborted finish、网络异常、空输出）
 * 降级下一条；调用方主动取消（signal 已中止）原样上抛不降级；全部失败抛最后一个
 * 错误，由调用方兜底（runner 的按会话指数退避接管重试节奏）。
 *
 * 文本只从 block-end（协议保证携带**组装完成的整块**）取；text-delta 仅在
 * 适配器异常地没有发 block-end 时兜底。两者都累计会把输出翻倍。
 */
export async function callLLM(ctx, cfg, opts) {
    // 按层路由（#34）：opts.layer 配了层链的层走层链完整替换，其余走全局解析
    const routes = await resolveLayerRoutes(ctx, cfg, opts.layer);
    let lastErr;
    for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        try {
            return await callRoute(ctx, cfg, opts, route);
        }
        catch (err) {
            // 调用方主动取消（重建取消/进程关闭）不是路由失败——不降级，原样上抛
            if (opts.signal?.aborted)
                throw err;
            lastErr = err;
            warnRouteDeadOnce(route, opts.logger);
            const next = routes[i + 1];
            if (next) {
                opts.logger?.info(`[memory] 蒸馏路由降级 ${route.provider}/${route.model} → ${next.provider}/${next.model}（${errDetail(err)}）`);
            }
        }
    }
    throw lastErr;
}
/** 单路由一次尝试（callLLM 循环体；每路由新建超时信号 = 各享全额 timeoutMs）。 */
async function callRoute(ctx, cfg, opts, route) {
    const { provider, model } = route;
    const signal = opts.signal ?? AbortSignal.timeout(cfg.llm.timeoutMs);
    // 档位按模型能力决策（跨供应商 effort 兼容）：不支持的档位不传 + 告警一次，
    // 空配置 = 自动（模型默认 → high）；路由的档位候选已在链解析时定好（条目 > 全局）
    const effort = await planDistillEffort(ctx, provider, model, route.effort, opts.logger);
    // 输入预算兜底：任何蒸馏调用的用户 prompt 不超过 maxInputChars
    // （L1 已在数据层分块，这里是 L2/L3 与异常场景的最后一道网）
    const user = opts.user.length > cfg.llm.maxInputChars
        ? `${opts.user.slice(0, cfg.llm.maxInputChars)}\n\n[输入超出 ${cfg.llm.maxInputChars} 字符预算，已截断]`
        : opts.user;
    // 输出预算 ×4 防线跟随【实际发送】的档位：阶段侧已按该层放大触发档位
    // （layerEffortTrigger：层链头候选 > 全局主路由候选）放大过，这里只补自动档
    // （'' → 模型默认/高档）解析出高档时的欠放大缺口——两侧共用一张表与同一触发值，
    // 配置本身就是高档时不再放大（防 ×16 双乘）
    const baseMaxTokens = opts.maxTokens ?? cfg.llm.maxTokens;
    const highTiers = HIGH_EFFORT_TIERS;
    const triggerEffort = opts.layer
        ? layerEffortTrigger(cfg, layerKeyFor(opts.layer))
        : cfg.llm.primaryEffort || cfg.llm.reasoningEffort;
    const maxTokens = highTiers.includes(effort.effort) && !highTiers.includes(triggerEffort)
        ? layerMaxTokens(baseMaxTokens, 'high')
        : baseMaxTokens;
    const stream = ctx.llm.stream({
        provider,
        model,
        system: opts.system,
        messages: [createUserMessage({ content: [{ type: 'text', text: user }], source: { kind: 'user' } })],
        temperature: opts.temperature ?? cfg.llm.temperature,
        maxTokens,
        // 档位只在能力决策给出非空值时传；空串不传（跟随模型默认）
        ...(effort.effort ? { reasoningEffort: ReasoningEffortId(effort.effort) } : {}),
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
        // 记账含失败路径（failures 计数；tokens 尽当时流内已到的 usage）
        if (opts.layer)
            recordDistillCall(opts.layer, user.length, outputTokens, reasoningTokens, true);
        if (opts.layer)
            recordCostCall(provider, model, opts.layer, user.length, outputTokens, reasoningTokens);
        opts.logger?.warn(`[memory] LLM 调用失败 ${provider}/${model}（${((Date.now() - startedAt) / 1000).toFixed(1)}s）: ${errDetail(err)}`);
        throw err;
    }
    const out = (blockText || deltaText).trim();
    if (out.length === 0) {
        // 空输出是最难排查的失败：流正常结束但一个字没吐。必须记录 finish 原因、
        // token 计数与块分布，才能区分"模型只产出了 reasoning"vs"服务端返回空响应"。
        if (opts.layer)
            recordDistillCall(opts.layer, user.length, outputTokens, reasoningTokens, true);
        if (opts.layer)
            recordCostCall(provider, model, opts.layer, user.length, outputTokens, reasoningTokens);
        opts.logger?.warn(`[memory] LLM 空输出 ${provider}/${model}（${((Date.now() - startedAt) / 1000).toFixed(1)}s，finish=${finishKind || '无 finish 块'}` +
            `，输出 tokens=${outputTokens}${reasoningTokens > 0 ? `/reasoning ${reasoningTokens}` : ''}，` +
            `text-delta ${deltaBlocks} 块/${deltaText.length} 字符，reasoning ${reasoningChars} 字符，` +
            `block-end: ${[...blockEndTypes.entries()].map(([t, n]) => `${t}×${n}`).join(', ') || '无'}）` +
            (reasoningHead ? `，reasoning 摘录: ${reasoningHead}…` : ''));
        // 空输出按路由失败处理（#31）：交给回退链降级或上抛——原先返回空串只是把失败
        // 推迟到下游 JSON/Markdown 解析，诊断信息更差
        throw new Error(`llm empty output: ${provider}/${model} 流正常结束但输出 0 字符`);
    }
    if (opts.layer)
        recordDistillCall(opts.layer, user.length, outputTokens, reasoningTokens, false);
    if (opts.layer)
        recordCostCall(provider, model, opts.layer, user.length, outputTokens, reasoningTokens);
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
