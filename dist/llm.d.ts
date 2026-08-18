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
/** L1 抽取（大输入块的 JSON 记忆数组输出）。 */
export declare const LAYER_MAX_TOKENS_EXTRACT = 16000;
/** L1 去重（合并决策数组，输出比抽取短）。 */
export declare const LAYER_MAX_TOKENS_DEDUP = 8000;
/** L2 场景整合（完整场景 Markdown 文件输出，输出最重的层）。 */
export declare const LAYER_MAX_TOKENS_L2 = 32000;
/** L3 画像（完整 persona 文档）。 */
export declare const LAYER_MAX_TOKENS_L3 = 16000;
/**
 * 思考档预算放大：reasoning 计入输出预算（v4-flash 事故：high 思考可吃光全部
 * 预算致正文 0 字符）——effort 为 high/max 时分层预算 ×4。
 */
export declare function layerMaxTokens(base: number, reasoningEffort: string): number;
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
