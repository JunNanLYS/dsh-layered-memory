import { defineTool } from '@deepseek-ai/dsh-tools';
const OFF_NOTICE = '本会话的记忆档位为"关闭"：该会话对记忆系统完全隐身，不读取也不写入记忆。';
const WRITE_ONLY_NOTICE = '本会话为只写模式：记忆照常沉淀，但不读取。';
export function registerMemoryTools(ctx, cfg, stores, logger, modes, live) {
    if (!cfg.tools)
        return;
    /**
     * 调用会话的检索族（auto → undefined 不过滤；off/只写 → null 表示整体禁用）。
     * fail-open：exec.agent 缺失（宿主调用路径未带 agent 标识）按全族检索放行——
     * 档位隔离依赖宿主正确传递 exec.agent.id，缺失只告警一次不拒绝工具调用。
     */
    let warnedNoAgent = false;
    const familyOfCaller = (agentId) => {
        if (agentId === undefined) {
            if (!warnedNoAgent) {
                warnedNoAgent = true;
                logger.warn('[memory] 工具调用缺少 agent 标识（exec.agent 未传递），档位过滤退化为全族检索');
            }
            return undefined;
        }
        const mode = modes.get(agentId);
        if (mode === 'off')
            return null;
        // 只写会话拒读（#38，T2 裁决）：与注入同属读维度，不拒则"不注入"从工具路径漏风
        if (!modes.resolvedRecall(agentId, live.get().recall))
            return null;
        return mode === 'auto' ? undefined : mode;
    };
    /** 拒读时的区分文案（familyOfCaller 判 null 后重查一次内存 Map，成本可忽略）。 */
    const blockNoticeOf = (agentId) => {
        if (agentId !== undefined && modes.get(agentId) !== 'off' && !modes.resolvedRecall(agentId, live.get().recall)) {
            return WRITE_ONLY_NOTICE;
        }
        return OFF_NOTICE;
    };
    // ── memory_search: L1 结构化记忆 ──
    ctx.tools.register(defineTool({
        name: 'memory_search',
        description: '搜索结构化记忆（L1 原子记忆）。返回与查询相关的记忆片段：用户偏好、历史事件、项目事实、任务、规则、工作方法等。',
        parameters: {
            query: { type: 'string', required: true, description: '搜索查询文本（自然语言）' },
            limit: { type: 'number', description: '最大返回条数（默认 5）' },
            type: { type: 'string', description: '按记忆类型过滤（如 persona/episodic/instruction/work_fact/work_task/work_method/work_artifact）' },
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                content: { type: 'string' },
                                type: { type: 'string' },
                                scene_name: { type: 'string' },
                                score: { type: 'number' },
                            },
                            additionalProperties: false,
                        },
                    },
                    notice: { type: 'string', description: '非搜索结果的状态提示（如本会话记忆已关闭）' },
                },
                additionalProperties: false,
            },
            render: (_args, value) => [
                { type: 'text', text: value.notice ?? renderMemoryItems(value.items ?? []) },
            ],
        },
        execute: async (args, exec) => {
            const family = familyOfCaller(exec.agent?.id);
            if (family === null)
                return { items: [], notice: blockNoticeOf(exec.agent?.id) };
            const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
            const hits = await stores.l1.search(args.query, limit, { type: args.type || undefined, family: family ?? undefined });
            return {
                items: hits.map((h) => ({
                    content: h.content,
                    type: h.type,
                    scene_name: h.scene_name,
                    score: Math.round(h.score * 100) / 100,
                })),
            };
        },
    }));
    // ── conversation_search: L0 原始对话 ──
    ctx.tools.register(defineTool({
        name: 'conversation_search',
        description: '搜索原始对话历史（L0）。返回带时间戳的原始消息，适用于查找具体消息原文、时间线、上下文细节。',
        parameters: {
            query: { type: 'string', required: true, description: '搜索查询文本' },
            limit: { type: 'number', description: '最大返回条数（默认 5）' },
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                session_id: { type: 'string' },
                                role: { type: 'string' },
                                content: { type: 'string' },
                                timestamp: { type: 'number' },
                            },
                            additionalProperties: false,
                        },
                    },
                    notice: { type: 'string', description: '非搜索结果的状态提示（如本会话记忆已关闭）' },
                },
                additionalProperties: false,
            },
            render: (_args, value) => [
                { type: 'text', text: value.notice ?? renderConversationItems(value.items ?? []) },
            ],
        },
        execute: async (args, exec) => {
            if (familyOfCaller(exec.agent?.id) === null)
                return { items: [], notice: blockNoticeOf(exec.agent?.id) };
            const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
            const records = await stores.l0.search(args.query, limit);
            return {
                items: records.map((r) => ({
                    session_id: r.sessionId,
                    role: r.role,
                    content: r.content,
                    timestamp: r.timestamp,
                })),
            };
        },
    }));
    // ── memory_read_scene: 读取 L2 场景块 / L3 画像 ──
    ctx.tools.register(defineTool({
        name: 'memory_read_scene',
        description: '读取记忆文件详情：L2 场景块（场景目录下的 .md 文件）或 L3 画像（persona-chat.md / persona-work.md）。返回文件完整内容。',
        parameters: {
            path: { type: 'string', required: true, description: '场景文件名，或 persona-chat.md / persona-work.md' },
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: '文件内容（不存在则为空字符串）' },
                },
                additionalProperties: false,
            },
            render: (_args, value) => [
                { type: 'text', text: value.content ? `\`\`\`markdown\n${value.content}\n\`\`\`` : '（文件不存在或为空）' },
            ],
        },
        execute: async (args, exec) => {
            if (familyOfCaller(exec.agent?.id) === null)
                return { content: blockNoticeOf(exec.agent?.id) };
            const p = args.path.trim();
            let content;
            if (p === 'persona.md' || p === 'persona-chat.md' || p === 'persona' || p === 'persona-chat') {
                content = await stores.persona.chat.read();
            }
            else if (p === 'persona-work.md' || p === 'persona-work') {
                content = await stores.persona.work.read();
            }
            else {
                // 场景文件在两族目录里按名查找（先本族后另一族）
                const primary = familyOfCaller(exec.agent?.id) ?? 'chat';
                const other = primary === 'chat' ? 'work' : 'chat';
                content =
                    (await stores.scenes[primary].read(p)) ?? (await stores.scenes[other].read(p));
            }
            return { content: content ?? '' };
        },
    }));
    logger.info('[memory] 工具已注册: memory_search / conversation_search / memory_read_scene');
}
function renderMemoryItems(items) {
    if (!items || items.length === 0)
        return '（没有找到相关记忆）';
    return items
        .map((it, i) => `${i + 1}. [${it.type ?? ''}]${it.scene_name ? ` (${it.scene_name})` : ''} ${it.content ?? ''}`)
        .join('\n');
}
function renderConversationItems(items) {
    if (!items || items.length === 0)
        return '（没有找到相关对话）';
    return items
        .map((it, i) => {
        const time = it.timestamp ? new Date(it.timestamp).toISOString() : '';
        return `${i + 1}. [${it.role ?? ''}]${time ? ` ${time}` : ''} (session=${it.session_id ?? ''})\n${it.content ?? ''}`;
    })
        .join('\n\n');
}
