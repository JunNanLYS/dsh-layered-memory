import { callLLM, layerMaxTokens, LAYER_MAX_TOKENS_L2, parseJsonLogged } from '../llm.js';
import { buildScenePrompt, formatSceneSummaries } from '../prompts/scene.js';
import { Bm25Index } from '../store/bm25.js';
const REQUEST_RE = /\[PERSONA_UPDATE_REQUEST\]\s*reason:\s*([\s\S]*?)\[\/PERSONA_UPDATE_REQUEST\]/;
export async function runSceneConsolidation(ctx, cfg, scenes, newMemories, logger, family) {
    if (!cfg.l2.enabled || newMemories.length === 0) {
        return { changed: 0 };
    }
    const summaries = await scenes.list();
    // ── 组装 prompt ──
    const memoriesJson = JSON.stringify(newMemories.map((m) => ({
        record_id: m.id,
        content: m.content,
        type: m.type,
        priority: m.priority,
        scene_name: m.scene_name,
        timestamps: m.timestamps.map((t) => new Date(t).toISOString()),
    })), null, 2);
    const sceneSummaries = formatSceneSummaries(summaries);
    const sceneContents = await pickSceneContents(scenes, summaries, newMemories, cfg.l2.sceneContextLimit);
    const { systemPrompt, userPrompt } = buildScenePrompt({
        memoriesJson,
        sceneSummaries,
        sceneContents,
        currentTimestamp: new Date().toISOString(),
        existingSceneFiles: summaries.map((s) => s.path),
        maxScenes: cfg.l2.maxScenes,
        family,
    });
    const raw = await callLLM(ctx, cfg, {
        system: systemPrompt,
        user: userPrompt,
        maxTokens: layerMaxTokens(LAYER_MAX_TOKENS_L2, cfg.llm.reasoningEffort),
        logger,
    });
    // ── 解析：先取 PERSONA_UPDATE_REQUEST 标记，再解析操作数组 ──
    const reqMatch = REQUEST_RE.exec(raw);
    const personaRequestedReason = reqMatch?.[1]?.trim() || undefined;
    const opsRaw = reqMatch ? raw.replace(REQUEST_RE, '') : raw;
    const ops = parseJsonLogged(opsRaw, 'L2 场景操作', logger);
    if (!Array.isArray(ops))
        throw new Error('L2 输出不是操作数组');
    let changed = 0;
    for (const op of ops) {
        if (!op || typeof op.path !== 'string')
            continue;
        try {
            if (op.op === 'write' && typeof op.content === 'string') {
                await scenes.write(op.path, op.content);
                changed++;
                logger.debug?.(`[memory] L2 写入场景 ${op.path} (${op.content.length} 字符)`);
            }
            else if (op.op === 'delete') {
                await scenes.write(op.path, '[DELETED]');
                changed++;
                logger.debug?.(`[memory] L2 删除场景 ${op.path}`);
            }
        }
        catch (err) {
            logger.warn(`[memory] L2 操作失败 ${op.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    logger.info(`[memory] L2 场景整合完成（family=${family}）：${newMemories.length} 条新记忆 → ${changed} 个文件操作（场景总数 ${summaries.length}）` +
        (personaRequestedReason ? `，请求 L3 更新：${personaRequestedReason}` : ''));
    return { changed, personaRequestedReason };
}
/** 选出与本次新记忆最相关的场景全文（供 LLM 参考，避免全量塞入）。 */
async function pickSceneContents(scenes, summaries, newMemories, limit) {
    if (summaries.length === 0 || limit <= 0)
        return '';
    const index = new Bm25Index();
    index.rebuild(summaries.map((s) => ({ id: s.path, text: `${s.summary} ${s.path}` })));
    const query = newMemories.map((m) => m.content).join(' ');
    const hits = index.search(query, limit);
    const parts = [];
    for (const h of hits) {
        const content = await scenes.read(h.id);
        if (content)
            parts.push(`### 文件: ${h.id}\n\`\`\`markdown\n${content}\n\`\`\``);
    }
    return parts.join('\n\n');
}
