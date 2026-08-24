/**
 * 插件配置：Schemastery schema + 类型。
 *
 * 默认数据目录：$DSH_HOME/memory（用官方 dshHomePath 解析，DSH_HOME 缺省 ~/.dsh）。
 */
import Schema from '@deepseek-ai/schemastery';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import type { ExtractMode } from './types.js';

/**
 * 蒸馏思考档位全词汇表（唯一事实源）：'' = 自动（模型默认档 → high），
 * 其余为各适配器通用档位词汇表（deepseek 认 'off'，OpenAI 系是 'none'）。
 * schema（config/settings）、运行时解析（settings.resolveSettings）与 RPC
 * 写入门（stats.settings-set）共用，勿在别处再抄字面量表。
 */
export const EFFORT_CHOICES = ['', 'off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

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
    /** 稳态触发阈值：单会话攒够多少条新消息才跑一次 L1 抽取（省 token）。
     *  起步阶段生效阈值从 1 翻倍爬坡到此值（渐进阈值，ADR-0003）。 */
    minMessages: number;
    /** 闲置兜底：会话静默多少秒后把未蒸馏切片落袋（接住"没攒够阈值用户就离开"）；0 = 关闭。 */
    idleSeconds: number;
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
    /** 单条注入记忆的字符上限（超限截断并提示用工具查全文）；0 = 不限。 */
    maxCharsPerMemory: number;
    /** 整轮注入总字符上限（超限按相关性丢尾部）；0 = 不限。 */
    maxTotalRecallChars: number;
    /** 召回总预算（ms）：超时跳过本轮注入、不阻塞对话；0 = 不限时。 */
    timeoutMs: number;
    includePersona: boolean;
    includeSceneNav: boolean;
    /** 检索策略：keyword（FTS5 BM25）| embedding（向量）| hybrid（双路 + RRF 融合）。 */
    strategy: 'keyword' | 'embedding' | 'hybrid';
    /** 召回路径分数阈值（0~1，低于该分不注入；工具路径不过滤）。 */
    scoreThreshold: number;
    /** 时效衰减半衰期（天，0=关）：召回排序的 freshness 加权——score × max(0.5, 0.5^(Δ天/半衰期))，
     *  只影响相关度相近候选间的名次（老记忆最多损失一半排序分，不淘汰）。 */
    decayHalfLifeDays: number;
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
    /** 模型下载代理三态：''（默认）= 探测代理环境变量（HTTPS_PROXY/ALL_PROXY 等）；
     *  'none' = 禁用强制直连；其他值 = 代理 URL（如 http://127.0.0.1:7890）。 */
    proxy: string;
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
    /** 分层输出预算运行时覆盖（设置页 distillBudgets 经 effectiveCfg 注入；
     *  0/缺省 = 用内置默认。不属于静态 schema——预算无部署上限语义，只有运行时偏好）。 */
    budgets?: Partial<{ extract: number; dedup: number; l2: number; l3: number }>;
  };
  /** 是否注册模型可调用的记忆工具。 */
  tools: boolean;
  /** 注册 bench 控制服务（dsh-memory-bench，进程内 rebuild 触发面）。
   *  仅供基准/调试部署（bench profile 的 lifecycle 赛道），默认关——生产零表面积。 */
  benchControl: boolean;
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
  tools: Schema.boolean().default(true),
  benchControl: Schema.boolean().default(false),
});

export function resolveDataDir(cfg: MemoryConfig): string {
  if (cfg.dataDir) return cfg.dataDir;
  return dshHomePath('memory');
}
