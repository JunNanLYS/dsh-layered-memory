/**
 * LLM 桥：用 DSH 自身的 llm 服务跑蒸馏调用。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryConfig } from './config.js';
import type { MemoryLogger } from './types.js';
export interface LlmCallOptions {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
    /** 诊断日志（缺失时静默，不影响调用） */
    logger?: MemoryLogger;
}
/** 解析蒸馏用的 provider/model：配置优先，其次当前默认选择。 */
export declare function resolveModelRoute(ctx: Context, cfg: MemoryConfig): Promise<{
    provider: string;
    model: string;
}>;
/**
 * 一次完整蒸馏调用：流式收集文本，返回最终字符串。
 * 失败（error/aborted finish）抛错，由调用方兜底。
 *
 * 文本只从 block-end（协议保证携带**组装完成的整块**）取；text-delta 仅在
 * 适配器异常地没有发 block-end 时兜底。两者都累计会把输出翻倍。
 */
export declare function callLLM(ctx: Context, cfg: MemoryConfig, opts: LlmCallOptions): Promise<string>;
/** 带诊断日志的 parseJson：解析失败时记录原始输出摘录（模型输出异常排查的关键信息）。 */
export declare function parseJsonLogged<T>(raw: string, what: string, logger?: MemoryLogger): T;
/** 容错地解析 LLM 输出的 JSON（剥掉可能的 ```json 围栏）。 */
export declare function parseJson<T>(raw: string): T;
