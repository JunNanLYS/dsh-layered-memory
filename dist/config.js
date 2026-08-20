/**
 * 插件配置：Schemastery schema + 类型。
 *
 * 默认数据目录：$DSH_HOME/memory（用官方 dshHomePath 解析，DSH_HOME 缺省 ~/.dsh）。
 */
import Schema from '@deepseek-ai/schemastery';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
export const memorySchema = Schema.object({
    dataDir: Schema.string().default(''),
    family: Schema.union(['auto', 'chat', 'work']).default('auto'),
    capture: Schema.object({
        enabled: Schema.boolean().default(true),
        stripCodeBlocks: Schema.boolean().default(true),
        maxMessageChars: Schema.number().min(200).max(200_000).default(4000),
    }),
    extract: Schema.object({
        enabled: Schema.boolean().default(true),
        minMessages: Schema.number().min(1).max(100).default(6),
        idleSeconds: Schema.number().min(0).max(86_400).default(300),
        backgroundMessages: Schema.number().min(0).max(50).default(10),
        candidatePool: Schema.number().min(1).max(20).default(5),
    }),
    l2: Schema.object({
        enabled: Schema.boolean().default(true),
        minNewMemories: Schema.number().min(1).max(100).default(5),
        maxScenes: Schema.number().min(1).max(100).default(12),
        sceneContextLimit: Schema.number().min(0).max(20).default(3),
    }),
    l3: Schema.object({
        enabled: Schema.boolean().default(true),
        interval: Schema.number().min(1).max(200).default(20),
    }),
    recall: Schema.object({
        enabled: Schema.boolean().default(true),
        maxResults: Schema.number().min(1).max(20).default(5),
        // 预算与超时（ADR-0001 / 规格 A 节）：截断是引流——工具路径返回全文
        maxCharsPerMemory: Schema.number().min(0).max(100_000).default(500),
        maxTotalRecallChars: Schema.number().min(0).max(100_000).default(2000),
        timeoutMs: Schema.number().min(0).max(60_000).default(5000),
        includePersona: Schema.boolean().default(true),
        includeSceneNav: Schema.boolean().default(true),
        strategy: Schema.union(['keyword', 'embedding', 'hybrid']).default('hybrid'),
        scoreThreshold: Schema.number().min(0).max(1).default(0.3),
    }),
    embedding: Schema.object({
        enabled: Schema.boolean().default(false),
        baseUrl: Schema.string().default(''),
        apiKey: Schema.string().default(''),
        model: Schema.string().default(''),
        // 0 = 纯 FTS 模式（合法值，勿设 min>0）
        dimensions: Schema.number().min(0).max(8192).default(0),
        maxInputChars: Schema.number().min(100).max(100_000).default(5000),
        timeoutMs: Schema.number().min(1000).max(300_000).default(10_000),
        allowLocalModels: Schema.boolean().default(true),
        mirror: Schema.string().default('https://hf-mirror.com'),
        proxy: Schema.string().default(''),
    }),
    llm: Schema.object({
        provider: Schema.string().default(''),
        model: Schema.string().default(''),
        // 推理模型（如 v4-flash）的 reasoning 计入输出预算：预算不足会被思考吃光导致正文 0 字符。
        // 0.8.0 起各蒸馏层显式传分层预算（见 llm.ts LAYER_MAX_TOKENS_*），本值为未分层调用的兜底总闸
        maxTokens: Schema.number().min(1024).max(1_000_000).default(65_536),
        // 蒸馏是结构化抽取任务，默认关思考（off）：v4-flash 默认 high 档的思考可把任意 maxTokens
        // 预算全部吃光导致正文 0 字符；非推理模型不认识 effort 时会报 UNSUPPORTED_REASONING_EFFORT，设空串跳过
        reasoningEffort: Schema.union(['', 'off', 'high', 'max']).default('off'),
        temperature: Schema.number().min(0).max(2).default(0.3),
        // 模型上下文 1M token，日常压到 ~700k 使用（中文按 1 字≈1 token 保守折算）
        maxInputChars: Schema.number().min(1000).max(1_000_000).default(700_000),
        timeoutMs: Schema.number().min(1000).max(600_000).default(120_000),
    }),
    tools: Schema.boolean().default(true),
});
export function resolveDataDir(cfg) {
    if (cfg.dataDir)
        return cfg.dataDir;
    return dshHomePath('memory');
}
