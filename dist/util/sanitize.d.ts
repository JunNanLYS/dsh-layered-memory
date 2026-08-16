/**
 * L0 捕获文本清洗（移植自 MemoryCore openclaw-plugin/src/sanitize.ts）。
 * 保证：清除我们注入的召回标签（防反馈循环）、框架元数据块、媒体标记等。
 */
/** 剥离注入的记忆标签 + 框架元数据块 + 媒体标记。 */
export declare function sanitizeText(text: string): string;
/** 剥离助手回复中的围栏代码块（保留解释性文本）。 */
export declare function stripCodeBlocks(text: string): string;
/** L0 捕获过滤——宽松：只丢弃结构性无用消息。 */
export declare function shouldCaptureL0(text: string): boolean;
