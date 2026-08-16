/**
 * L0 捕获文本清洗（移植自 MemoryCore openclaw-plugin/src/sanitize.ts）。
 * 保证：清除我们注入的召回标签（防反馈循环）、框架元数据块、媒体标记等。
 */
/** 剥离注入的记忆标签 + 框架元数据块 + 媒体标记。 */
export function sanitizeText(text) {
    let cleaned = text;
    // 注入的记忆上下文标签（防止再捕获时反馈循环）
    cleaned = cleaned.replace(/<relevant-memories>[\s\S]*?<\/relevant-memories>/g, '');
    cleaned = cleaned.replace(/<user-persona>[\s\S]*?<\/user-persona>/g, '');
    cleaned = cleaned.replace(/<relevant-scenes>[\s\S]*?<\/relevant-scenes>/g, '');
    cleaned = cleaned.replace(/<scene-navigation>[\s\S]*?<\/scene-navigation>/g, '');
    cleaned = cleaned.replace(/<memory-tools-guide>[\s\S]*?<\/memory-tools-guide>/g, '');
    // 任务上下文注入块
    cleaned = cleaned.replace(/<current_task_context>[\s\S]*?<\/current_task_context>/g, '');
    cleaned = cleaned.replace(/<history_task_context[\s\S]*?<\/history_task_context>/g, '');
    // 框架注入的入站元数据块（label + ```json ... ```）
    cleaned = cleaned.replace(/(?:Conversation info|Sender|Thread starter|Replied message|Forwarded message context|Chat history since last reply)\s*\(untrusted[\s\S]*?\):\s*```json\s*[\s\S]*?```/g, '');
    // 旧版会话元数据 JSON 块
    cleaned = cleaned.replace(/```json\s*\{[\s\S]*?"session[\s\S]*?\}\s*```/g, '');
    // 回复指令标签
    cleaned = cleaned.replace(/\[\[reply_to[^\]]*\]\]\s*/g, '');
    // Skill 选择包裹符
    cleaned = cleaned.replace(/¥¥\[[\s\S]*?\]¥¥/g, '');
    // 行首时间戳
    cleaned = cleaned.replace(/^\[[\w\d\-:+ ]+\]\s*/gm, '');
    // 媒体附件标记
    cleaned = cleaned.replace(/\[media attached:[^\]]*\]\s*/g, '');
    // 图片回复指令
    cleaned = cleaned.replace(/To send an image back,[\s\S]*?(?:Keep caption in the text body\.)\s*/g, '');
    // 系统执行块
    cleaned = cleaned.replace(/^System:\s*\[[\s\S]*?$/gm, '');
    // 内联 base64 图片
    cleaned = cleaned.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/gi, '');
    // 空字符 + 折叠空白
    cleaned = cleaned.replace(/\0/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return cleaned;
}
/** 剥离助手回复中的围栏代码块（保留解释性文本）。 */
export function stripCodeBlocks(text) {
    return text.replace(/```[^\n]*\n[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
/** L0 捕获过滤——宽松：只丢弃结构性无用消息。 */
export function shouldCaptureL0(text) {
    if (!text || !text.trim())
        return false;
    if (isFrameworkNoise(text))
        return false;
    if (text.startsWith('/'))
        return false;
    return true;
}
function isFrameworkNoise(text) {
    const t = text.trim();
    if (t === '(session bootstrap)')
        return true;
    if (t.startsWith('A new session was started via'))
        return true;
    if (/^✅\s*New session started/.test(t))
        return true;
    if (t.startsWith('Pre-compaction memory flush'))
        return true;
    if (/^NO_REPLY\s*$/.test(t))
        return true;
    return false;
}
