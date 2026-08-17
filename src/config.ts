/**
 * 插件配置：Schemastery schema + 类型。
 *
 * 默认数据目录：$DSH_HOME/memory（用官方 dshHomePath 解析，DSH_HOME 缺省 ~/.dsh）。
 */
import Schema from '@deepseek-ai/schemastery';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import type { ExtractMode } from './types.js';

export interface MemoryConfig {
  /** 数据目录；留空则用 $DSH_HOME/memory。 */
  dataDir: string;
  /** 新会话的默认记忆档位：auto（双族自动）| chat（个人）| work（工作）。 */
  family: ExtractMode;
  capture: {
    enabled: boolean;
    /** 助手消息是否剥离代码块（减少嵌入噪声）。 */
    stripCodeBlocks: boolean;
    /** 单条消息内容最大字符数。 */
    maxMessageChars: number;
  };
  extract: {
    enabled: boolean;
    /** 至少攒够多少条新消息才跑一次 L1 抽取（省 token）。 */
    minMessages: number;
    /** L1 抽取时的背景消息条数（供上下文推断，不参与提取）。 */
    backgroundMessages: number;
    /** 去重候选池大小（每条新记忆的相似候选数）。 */
    candidatePool: number;
  };
  l2: {
    enabled: boolean;
    /** 距上次 L2 整合的新记忆达到该数量才触发。 */
    minNewMemories: number;
    /** 场景块数量上限。 */
    maxScenes: number;
    /** L2 prompt 里附带的相似场景全文数量上限。 */
    sceneContextLimit: number;
  };
  l3: {
    enabled: boolean;
    /** 距上次 L3 蒸馏的新记忆数量阈值。 */
    interval: number;
  };
  recall: {
    enabled: boolean;
    /** 每步自动召回注入的 L1 条数。 */
    maxResults: number;
    includePersona: boolean;
    includeSceneNav: boolean;
    /** 检索策略：keyword（FTS5 BM25）| embedding（向量）| hybrid（双路 + RRF 融合）。 */
    strategy: 'keyword' | 'embedding' | 'hybrid';
    /** 召回路径分数阈值（0~1，低于该分不注入；工具路径不过滤）。 */
    scoreThreshold: number;
  };
  embedding: {
    /** 向量检索总开关；关闭时纯 FTS 运行（官方 provider="none" 同款）。 */
    enabled: boolean;
    /** OpenAI 兼容 /embeddings 服务地址，如 https://api.siliconflow.cn/v1。 */
    baseUrl: string;
    apiKey: string;
    model: string;
    /** 向量维度（启用时必填，须与模型输出一致；vec0 建表需要固定维度）。 */
    dimensions: number;
    /** 单条文本最大字符数（超长截断）。 */
    maxInputChars: number;
    /** 单次调用超时（ms）。 */
    timeoutMs: number;
    /** 允许本地嵌入模型档（部署上限：公司环境可禁下载与本地推理）。 */
    allowLocalModels: boolean;
    /** 模型下载镜像根地址（默认国内可达的 hf-mirror.com，可改回官方）。 */
    mirror: string;
  };
  llm: {
    /** 蒸馏用的 provider 路由；留空用当前默认选择。 */
    provider: string;
    /** 蒸馏用的模型；留空用当前默认选择。 */
    model: string;
    /** 单次蒸馏调用的输出 token 上限（推理模型的 reasoning 与正文共享该预算）。 */
    maxTokens: number;
    /** 蒸馏调用的思考档位；空串不传（跟随模型默认）。 */
    reasoningEffort: string;
    temperature: number;
    /** 单次蒸馏调用的用户 prompt 字符预算（≈token 数，按中文 1 字≈1 token 保守估算）。 */
    maxInputChars: number;
    /** 单次蒸馏调用超时（ms）。 */
    timeoutMs: number;
  };
  /** 是否注册模型可调用的记忆工具。 */
  tools: boolean;
}

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
    minMessages: Schema.number().min(1).max(100).default(1),
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
  }),
  llm: Schema.object({
    provider: Schema.string().default(''),
    model: Schema.string().default(''),
    // 推理模型（如 v4-flash）的 reasoning 计入输出预算：预算不足会被思考吃光导致正文 0 字符
    maxTokens: Schema.number().min(1024).max(1_000_000).default(256_000),
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

export function resolveDataDir(cfg: MemoryConfig): string {
  if (cfg.dataDir) return cfg.dataDir;
  return dshHomePath('memory');
}
