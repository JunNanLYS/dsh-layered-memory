import { callLLM } from '../llm.js';
import { buildPersonaPrompt } from '../prompts/persona.js';
export async function runPersona(ctx, cfg, scenes, persona, state, logger, family) {
    if (!cfg.l3.enabled)
        return { generated: false, reason: 'l3 disabled' };
    // ── 触发判定（移植 persona-trigger） ──
    const existingPersona = await persona.read();
    let reason = '';
    if (state.personaRequestedReason) {
        reason = `主动请求: ${state.personaRequestedReason}`;
    }
    else if (!state.hasPersona || !existingPersona) {
        reason = '冷启动/恢复：首次生成或画像缺失';
    }
    else if (state.memoriesSinceL3 >= cfg.l3.interval) {
        reason = `达到阈值: ${state.memoriesSinceL3} >= ${cfg.l3.interval}`;
    }
    else {
        logger.debug?.(`[memory] L3 未触发（自上次蒸馏以来 ${state.memoriesSinceL3}/${cfg.l3.interval} 条新记忆）`);
        return { generated: false, reason: 'no trigger' };
    }
    // ── 收集变化场景（自上次蒸馏以来 updated 变化 / 首次则全部） ──
    const all = await scenes.list();
    const changed = state.hasPersona
        ? all.filter((s) => {
            const t = Date.parse(s.updated);
            return !Number.isNaN(t) && t > state.lastL3At;
        })
        : all;
    if (changed.length === 0 && state.hasPersona) {
        logger.debug?.('[memory] L3 触发但无变化场景，跳过');
        return { generated: false, reason: 'no changed scenes' };
    }
    const changedContents = [];
    for (const s of changed) {
        const content = await scenes.read(s.path);
        if (content)
            changedContents.push(`### 场景: ${s.path}\n\`\`\`markdown\n${content}\n\`\`\``);
    }
    const { systemPrompt, userPrompt } = buildPersonaPrompt({
        mode: existingPersona ? 'incremental' : 'first',
        family,
        currentTime: new Date().toISOString(),
        totalProcessed: state.totalExtracted,
        sceneCount: all.length,
        changedSceneCount: changed.length,
        changedScenesContent: changedContents.join('\n\n'),
        existingPersona,
        triggerInfo: reason,
    });
    const raw = await callLLM(ctx, cfg, { system: systemPrompt, user: userPrompt, logger });
    const body = unwrapFence(raw);
    if (!body) {
        logger.error(`[memory] L3 输出为空，原始输出前 400 字符: ${raw.slice(0, 400)}`);
        throw new Error('L3 输出为空');
    }
    await persona.write(body);
    state.hasPersona = true;
    state.lastL3At = Date.now();
    state.memoriesSinceL3 = 0;
    state.personaRequestedReason = undefined;
    logger.info(`[memory] L3 画像蒸馏完成（family=${family}，${reason}）：${body.length} 字符，场景 ${changed.length}/${all.length} 个`);
    return { generated: true, reason };
}
/** 剥掉可能的 ```markdown 围栏。 */
function unwrapFence(text) {
    let s = text.trim();
    if (s.startsWith('```')) {
        s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }
    return s;
}
