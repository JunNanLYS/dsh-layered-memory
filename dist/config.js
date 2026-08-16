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
        maxMessageChars: Schema.number().default(4000),
    }),
    extract: Schema.object({
        enabled: Schema.boolean().default(true),
        minMessages: Schema.number().default(1),
        backgroundMessages: Schema.number().default(10),
        candidatePool: Schema.number().default(5),
    }),
    l2: Schema.object({
        enabled: Schema.boolean().default(true),
        minNewMemories: Schema.number().default(5),
        maxScenes: Schema.number().default(12),
        sceneContextLimit: Schema.number().default(3),
    }),
    l3: Schema.object({
        enabled: Schema.boolean().default(true),
        interval: Schema.number().default(20),
    }),
    recall: Schema.object({
        enabled: Schema.boolean().default(true),
        maxResults: Schema.number().default(5),
        includePersona: Schema.boolean().default(true),
        includeSceneNav: Schema.boolean().default(true),
        strategy: Schema.union(['keyword', 'embedding', 'hybrid']).default('hybrid'),
        scoreThreshold: Schema.number().default(0.3),
    }),
    embedding: Schema.object({
        enabled: Schema.boolean().default(false),
        baseUrl: Schema.string().default(''),
        apiKey: Schema.string().default(''),
        model: Schema.string().default(''),
        dimensions: Schema.number().default(0),
        maxInputChars: Schema.number().default(5000),
        timeoutMs: Schema.number().default(10_000),
    }),
    llm: Schema.object({
        provider: Schema.string().default(''),
        model: Schema.string().default(''),
        // 推理模型（如 v4-flash）的 reasoning 计入输出预算：预算不足会被思考吃光导致正文 0 字符
        maxTokens: Schema.number().default(20_000),
        temperature: Schema.number().default(0.3),
        // 模型上下文 1M token，日常压到 ~700k 使用（中文按 1 字≈1 token 保守折算）
        maxInputChars: Schema.number().default(700_000),
        timeoutMs: Schema.number().default(120_000),
    }),
    tools: Schema.boolean().default(true),
});
export function resolveDataDir(cfg) {
    if (cfg.dataDir)
        return cfg.dataDir;
    return dshHomePath('memory');
}
