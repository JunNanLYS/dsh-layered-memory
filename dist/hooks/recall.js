import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { applyRecallBudget, raceRecallTimeout, RECALL_EMBED_CAP_MS } from '../util/recall-budget.js';
import { errDetail } from '../util/filelog.js';
import { blocksToText } from '../util/text.js';
const PROFILE_TTL = 60_000;
/** 召回查询只取会话末尾 N 条消息（长会话每步把全史拼进 FTS MATCH 会让检索成本线性上涨）。 */
const RECALL_QUERY_TAIL_MESSAGES = 8;
/** 召回查询总字符上限（保留末尾——最新语境权重最高）。 */
const RECALL_QUERY_MAX_CHARS = 2_000;
/**
 * 从会话消息构建召回查询（纯函数）：末尾 N 条 + 总长截断，空输入返回空串。
 * 全史拼接会让 MATCH 表达式随会话长度线性膨胀（整会话累计二次方成本）。
 */
export function buildRecallQuery(messages, tailMessages = RECALL_QUERY_TAIL_MESSAGES, maxChars = RECALL_QUERY_MAX_CHARS) {
    const tail = messages.slice(-tailMessages);
    let text = tail.map((m) => blocksToText(m.content)).join(' ').trim();
    if (text.length > maxChars)
        text = text.slice(-maxChars);
    return text;
}
const MEMORY_TOOLS_GUIDE = `<memory-tools-guide>
## 记忆工具调用指南

当上方注入的记忆片段不足以回答用户问题时，可主动调用以下工具获取更多信息：

- **memory_search**：搜索结构化记忆（L1），适用于回忆用户偏好、历史事件、项目事实、任务、规则等。
- **conversation_search**：搜索原始对话（L0），适用于查找具体消息原文、时间线、上下文细节。
- **memory_read_scene**：读取记忆文件详情（L2 场景块，如场景目录下的 .md 文件；也可读 persona.md）。

### ⚠️ 调用次数限制
每轮对话中，memory_search 和 conversation_search **合计最多调用 3 次**。
- 首次搜索无结果时，可换关键词或换工具重试，但总调用次数不要超过 3 次。
- 若 3 次搜索后仍无结果，说明该信息不在记忆中，请直接根据已有信息回复用户。

注：若当前环境限制直接调用工具（如仅允许代码执行入口），请经由该环境的工具调用机制
（如 run_code 程序内）使用以上记忆工具。
</memory-tools-guide>`;
/** 新建零值统计（首次出现的会话）。 */
export function emptyRecallStats(now = Date.now()) {
    return { injectedTurns: 0, hitTurns: 0, totalHits: 0, timeouts: 0, lastHits: 0, lastDurationMs: 0, updatedAt: now };
}
export function registerRecall(ctx, cfg, stores, logger, live, modes) {
    /** 每 agent 召回统计（工具指南门控读 lastHits；悬浮卡信息区读全量计数）。 */
    const recallStats = new Map();
    const statFor = (id) => {
        let s = recallStats.get(id);
        if (!s) {
            s = emptyRecallStats();
            recallStats.set(id, s);
        }
        return s;
    };
    // 画像/场景导航按族缓存（分族隔离：注入时按会话档位选族）
    const profileCache = {
        chat: { persona: '', nav: '' },
        work: { persona: '', nav: '' },
    };
    const refreshProfile = async () => {
        try {
            const [chat, work] = await Promise.all([
                loadProfileParts(stores, cfg, 'chat'),
                loadProfileParts(stores, cfg, 'work'),
            ]);
            profileCache.chat = chat;
            profileCache.work = work;
        }
        catch (err) {
            logger.warn(`[memory] 画像/场景缓存刷新失败: ${errDetail(err)}`);
        }
    };
    // 初始刷新 + 定时刷新（TTL）
    void refreshProfile();
    ctx.effect(() => {
        const timer = setInterval(() => void refreshProfile(), PROFILE_TTL);
        return () => clearInterval(timer);
    });
    const invalidateProfile = () => {
        void refreshProfile();
    };
    // agent 销毁时清掉召回统计槽
    ctx.on('agent/disposed', (payload) => {
        recallStats.delete(payload.agent.id);
    });
    // ── 1. pre-step 消息侧注入：记忆先行于每一条新的用户输入（ADR-0001） ──
    // prepend 注册 + 先 next() 再改写：不劫持其他监听器（dsh-time-context 官方范式）。
    if (cfg.recall.enabled) {
        ctx.on('agent/pre-step', async (payload, next) => {
            const decision = await next();
            if (decision.kind === 'reject' || payload.signal.aborted)
                return decision;
            try {
                const s = live.get();
                const mode = modes.get(payload.agent.id);
                if (!s.enabled || !s.recall || mode === 'off')
                    return decision;
                // 只在有新的用户来源消息的步骤注入（轮首 claim 或 steering 插话）；纯工具步透传
                const hasNewUserMessage = decision.messages.some((m) => m.source?.kind === 'user');
                if (!hasNewUserMessage)
                    return decision;
                const query = buildRecallQuery(payload.messages);
                // 空查询是退化轮（无用户文本），重置命中信号但不计入统计
                if (!query) {
                    const degenerate = statFor(payload.agent.id);
                    degenerate.lastHits = 0;
                    return decision;
                }
                const st = statFor(payload.agent.id);
                st.injectedTurns++;
                st.lastHits = 0;
                st.updatedAt = Date.now();
                const searchStart = Date.now();
                const hits = await raceRecallTimeout(stores.l1.search(query, cfg.recall.maxResults, {
                    scoreThreshold: cfg.recall.scoreThreshold,
                    family: mode === 'auto' ? undefined : mode,
                    // 远程嵌入 fetch 内层钳制：给 FTS 降级留出总预算内的时间（本地推理不钳）
                    embeddingTimeoutMs: RECALL_EMBED_CAP_MS,
                }), cfg.recall.timeoutMs);
                st.updatedAt = Date.now();
                if (hits === undefined) {
                    st.timeouts++;
                    logger.warn('[memory] 召回超时，跳过本轮注入（不阻塞对话）');
                    return decision;
                }
                st.lastDurationMs = Date.now() - searchStart;
                st.lastHits = hits.length;
                if (hits.length > 0) {
                    st.hitTurns++;
                    st.totalHits += hits.length;
                }
                if (hits.length === 0)
                    return decision;
                const lines = applyRecallBudget(hits.map((h) => `- [${h.scene_name ? `${h.type}|${h.scene_name}` : h.type}] ${h.content}`), { maxCharsPerMemory: cfg.recall.maxCharsPerMemory, maxTotalRecallChars: cfg.recall.maxTotalRecallChars });
                if (lines.length === 0)
                    return decision;
                const text = [
                    '<relevant-memories>',
                    '以下是当前对话召回的相关记忆，不代表当前任务进程，仅作为参考：',
                    '',
                    ...lines,
                    '',
                    '</relevant-memories>',
                ].join('\n');
                logger.info(`[memory] 召回注入 ${lines.length} 条 L1（mode=${mode}，query="${query.slice(0, 30).replace(/\n/g, ' ')}…"，agent=${payload.agent.id}，消息侧）`);
                const injection = createUserMessage({
                    content: [{ type: 'text', text }],
                    // plugin 字段是宿主 UI 的署名后缀（"上下文注入 · memory"）——用展示友好的
                    // 子系统名，不用 cordis id（dsh-memory）；kind:'plugin' 的标题恒为通用
                    // "上下文注入"（专用"跨会话召回"标题仅留给 session-reference 来源）
                    source: { kind: 'plugin', plugin: 'memory', form: 'recall' },
                });
                // 注入消息排在用户新消息之前（原版 prepend 语义：先线索后问题）
                return { kind: 'enter', messages: [injection, ...decision.messages] };
            }
            catch (err) {
                logger.warn(`[memory] 召回注入失败（跳过本轮）: ${errDetail(err)}`);
                return decision;
            }
        }, { prepend: true });
    }
    // ── 2. agent 作用域上下文 provider（系统提示稳定区：画像 + 导航 + 门控指南） ──
    // 插件可能在默认 agent 创建之后才加载（组合顺序由依赖决定），
    // 因此除了监听 agent/created，还要给已存在的 agent 补注册。
    const registered = new WeakSet();
    // context() 的 disposer 必须挂到插件自身生命周期：agent.ctx 比插件实例活得久，
    // 不主动清理会导致热重载后旧注册泄漏、新实例撞名（"already registered"）
    const contextDisposers = [];
    const registerForAgent = (agent) => {
        if (registered.has(agent))
            return;
        registered.add(agent);
        try {
            contextDisposers.push(agent.ctx.systemPrompt.context({
                name: 'memory:profile',
                order: 510,
                text: () => {
                    const s = live.get();
                    if (!s.enabled || !s.recall)
                        return '';
                    const mode = modes.get(agent.id);
                    if (mode === 'off')
                        return '';
                    // auto 档：两族按类别归组（画像/导航各一个标签，域内 <domain> 分块）；纯档：单族原格式
                    const body = mode === 'auto'
                        ? formatProfileAuto(profileCache.chat, profileCache.work)
                        : formatProfileSingle(profileCache[mode]);
                    const hasRecallHit = (recallStats.get(agent.id)?.lastHits ?? 0) > 0;
                    // 指南三条件门控：工具已注册（cfg.tools）&&（稳定内容 ∥ 本轮召回命中）——
                    // 空库用户与关闭工具的用户不付这份固定 token（原版 auto-recall 同款语义）
                    if (!cfg.tools)
                        return body;
                    if (!body && !hasRecallHit)
                        return '';
                    return body ? `${body}\n\n${MEMORY_TOOLS_GUIDE}` : MEMORY_TOOLS_GUIDE;
                },
            }));
        }
        catch (err) {
            logger.warn(`[memory] 召回上下文注册失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    };
    const agents = ctx.get('agents');
    if (agents) {
        for (const agent of agents.list())
            registerForAgent(agent);
    }
    ctx.on('agent/created', (payload) => {
        registerForAgent(payload.agent);
    });
    ctx.effect(() => () => {
        for (const dispose of contextDisposers.splice(0)) {
            try {
                dispose();
            }
            catch {
                /* agent 可能已先一步销毁 */
            }
        }
    });
    return { invalidateProfile, stats: (id) => recallStats.get(id) };
}
/** auto 档 <user-persona> 内的域说明：让模型理解分块结构与两域的独立性。 */
const DOMAIN_HINT = '以下内容按记忆域分块：chat=用户个人画像（User Narrative Profile），work=团队工作准则（Team Operating Doctrine）。' +
    '两域独立蒸馏与更新，请按当前对话语境参考对应域，不要把一域的内容当作另一域的事实。';
function wrapDomain(family, content) {
    const label = family === 'chat' ? '用户个人画像' : '团队工作准则';
    return `<domain family="${family}" label="${label}">\n${content.trim()}\n</domain>`;
}
/** 纯档注入：单族画像 + 场景导航（沿用原有格式）。 */
function formatProfileSingle(parts) {
    const segments = [];
    if (parts.persona)
        segments.push(`<user-persona>\n${parts.persona}\n</user-persona>`);
    if (parts.nav)
        segments.push(`<scene-navigation>\n${parts.nav}\n</scene-navigation>`);
    return segments.join('\n\n');
}
/** auto 档注入：两族按类别归组——画像共用一个 <user-persona>、导航共用一个 <scene-navigation>，域内 <domain> 分块。 */
function formatProfileAuto(chat, work) {
    const segments = [];
    const personas = [
        ['chat', chat.persona],
        ['work', work.persona],
    ];
    const personaBlocks = personas.filter(([, p]) => p.trim()).map(([f, p]) => wrapDomain(f, p));
    if (personaBlocks.length > 0) {
        segments.push(`<user-persona>\n${DOMAIN_HINT}\n\n${personaBlocks.join('\n\n')}\n</user-persona>`);
    }
    const navs = [
        ['chat', chat.nav],
        ['work', work.nav],
    ];
    const navBlocks = navs.filter(([, n]) => n.trim()).map(([f, n]) => wrapDomain(f, n));
    if (navBlocks.length > 0) {
        segments.push(`<scene-navigation>\n${navBlocks.join('\n\n')}\n</scene-navigation>`);
    }
    // 注意：工具指南由注入侧统一附加一次（auto 档不重复）
    return segments.join('\n\n');
}
async function loadProfileParts(stores, cfg, family) {
    const persona = cfg.recall.includePersona ? ((await stores.persona[family].read()) ?? '') : '';
    const nav = cfg.recall.includeSceneNav ? ((await stores.scenes[family].navigation()) ?? '').trim() : '';
    return { persona, nav };
}
