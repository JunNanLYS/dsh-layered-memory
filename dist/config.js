/**
 * 插件配置：Schemastery schema + 类型。
 *
 * 默认数据目录：$DSH_HOME/memory（用官方 dshHomePath 解析，DSH_HOME 缺省 ~/.dsh）。
 */
import Schema from '@deepseek-ai/schemastery';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
/**
 * 蒸馏思考档位全词汇表（唯一事实源）：'' = 自动（模型默认档 → high），
 * 其余为各适配器通用档位词汇表（deepseek 认 'off'，OpenAI 系是 'none'）。
 * schema（config/settings）、运行时解析（settings.resolveSettings）与 RPC
 * 写入门（stats.settings-set）共用，勿在别处再抄字面量表。
 */
// satisfies 反向锁定：词汇表扩词必须同步契约的 EffortChoice 联合（host 与 TS 化的 client 共用）
export const EFFORT_CHOICES = ['', 'off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
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
        // 时效衰减（#29）：乘法软加权 + 地板 0.5（老记忆最多损失一半排序分），只轮转
        // 相关度相近候选的名次；0=关（bench 基线可比性可 pin 0）
        decayHalfLifeDays: Schema.number().min(0).max(3650).default(30),
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
        // 回退链（#31）：主路由失败后按序降级；每条路由各享全额 timeoutMs（慢 TTFT 模型的
        // 回退位正是要给它留足首包时间，共享预算会让回退链失效）；条目档位经能力钳制后发送
        fallbacks: Schema.array(Schema.object({
            provider: Schema.string().default(''),
            model: Schema.string().default(''),
            reasoningEffort: Schema.union([...EFFORT_CHOICES]).default(''),
        })).default([]),
        // 推理模型（如 v4-flash）的 reasoning 计入输出预算：预算不足会被思考吃光导致正文 0 字符。
        // 0.8.0 起各蒸馏层显式传分层预算（见 llm.ts LAYER_MAX_TOKENS_*），本值为未分层调用的兜底总闸
        maxTokens: Schema.number().min(1024).max(1_000_000).default(65_536),
        // 蒸馏思考档位：'' = 自动（按模型能力解析：模型默认档 → high，见 llm.ts decideSendableEffort）；
        // 显式值仅在该模型声明支持时发送（跨供应商 effort 词汇表不同：deepseek 认 'off'，
        // openai 系是 'none'，未声明档位的模型不传）。旧默认 'off' 在非 deepseek 模型上必炸（400/本地拒绝）
        reasoningEffort: Schema.union([...EFFORT_CHOICES]).default(''),
        temperature: Schema.number().min(0).max(2).default(0.3),
        // 模型上下文 1M token，日常压到 ~700k 使用（中文按 1 字≈1 token 保守折算）
        maxInputChars: Schema.number().min(1000).max(1_000_000).default(700_000),
        timeoutMs: Schema.number().min(1000).max(600_000).default(120_000),
    }),
    // token_cost 明细保留期（写入时滚动清理；0 = 永久保留）。成本看板的「近 N 天」窗口上限也取此值
    tokenCost: Schema.object({
        retentionDays: Schema.number().min(0).max(3650).default(365),
    }),
    tools: Schema.boolean().default(true),
    benchControl: Schema.boolean().default(false),
});
export function resolveDataDir(cfg) {
    if (cfg.dataDir)
        return cfg.dataDir;
    return dshHomePath('memory');
}
