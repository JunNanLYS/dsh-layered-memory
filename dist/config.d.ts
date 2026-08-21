/**
 * 插件配置：Schemastery schema + 类型。
 *
 * 默认数据目录：$DSH_HOME/memory（用官方 dshHomePath 解析，DSH_HOME 缺省 ~/.dsh）。
 */
import Schema from '@deepseek-ai/schemastery';
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
        budgets?: Partial<{
            extract: number;
            dedup: number;
            l2: number;
            l3: number;
        }>;
    };
    /** 是否注册模型可调用的记忆工具。 */
    tools: boolean;
}
export declare const memorySchema: Schema<Schemastery.ObjectS<{
    dataDir: Schema<string, string>;
    family: Schema<"chat" | "work" | "auto", "chat" | "work" | "auto">;
    capture: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        stripCodeBlocks: Schema<boolean, boolean>;
        maxMessageChars: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        stripCodeBlocks: Schema<boolean, boolean>;
        maxMessageChars: Schema<number, number>;
    }>>;
    extract: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        minMessages: Schema<number, number>;
        idleSeconds: Schema<number, number>;
        backgroundMessages: Schema<number, number>;
        candidatePool: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        minMessages: Schema<number, number>;
        idleSeconds: Schema<number, number>;
        backgroundMessages: Schema<number, number>;
        candidatePool: Schema<number, number>;
    }>>;
    l2: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        minNewMemories: Schema<number, number>;
        maxScenes: Schema<number, number>;
        sceneContextLimit: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        minNewMemories: Schema<number, number>;
        maxScenes: Schema<number, number>;
        sceneContextLimit: Schema<number, number>;
    }>>;
    l3: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        interval: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        interval: Schema<number, number>;
    }>>;
    recall: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        maxResults: Schema<number, number>;
        maxCharsPerMemory: Schema<number, number>;
        maxTotalRecallChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
        includePersona: Schema<boolean, boolean>;
        includeSceneNav: Schema<boolean, boolean>;
        strategy: Schema<"keyword" | "embedding" | "hybrid", "keyword" | "embedding" | "hybrid">;
        scoreThreshold: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        maxResults: Schema<number, number>;
        maxCharsPerMemory: Schema<number, number>;
        maxTotalRecallChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
        includePersona: Schema<boolean, boolean>;
        includeSceneNav: Schema<boolean, boolean>;
        strategy: Schema<"keyword" | "embedding" | "hybrid", "keyword" | "embedding" | "hybrid">;
        scoreThreshold: Schema<number, number>;
    }>>;
    embedding: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        baseUrl: Schema<string, string>;
        apiKey: Schema<string, string>;
        model: Schema<string, string>;
        dimensions: Schema<number, number>;
        maxInputChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
        allowLocalModels: Schema<boolean, boolean>;
        mirror: Schema<string, string>;
        proxy: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        baseUrl: Schema<string, string>;
        apiKey: Schema<string, string>;
        model: Schema<string, string>;
        dimensions: Schema<number, number>;
        maxInputChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
        allowLocalModels: Schema<boolean, boolean>;
        mirror: Schema<string, string>;
        proxy: Schema<string, string>;
    }>>;
    llm: Schema<Schemastery.ObjectS<{
        provider: Schema<string, string>;
        model: Schema<string, string>;
        maxTokens: Schema<number, number>;
        reasoningEffort: Schema<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        temperature: Schema<number, number>;
        maxInputChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        provider: Schema<string, string>;
        model: Schema<string, string>;
        maxTokens: Schema<number, number>;
        reasoningEffort: Schema<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        temperature: Schema<number, number>;
        maxInputChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
    }>>;
    tools: Schema<boolean, boolean>;
}>, Schemastery.ObjectT<{
    dataDir: Schema<string, string>;
    family: Schema<"chat" | "work" | "auto", "chat" | "work" | "auto">;
    capture: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        stripCodeBlocks: Schema<boolean, boolean>;
        maxMessageChars: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        stripCodeBlocks: Schema<boolean, boolean>;
        maxMessageChars: Schema<number, number>;
    }>>;
    extract: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        minMessages: Schema<number, number>;
        idleSeconds: Schema<number, number>;
        backgroundMessages: Schema<number, number>;
        candidatePool: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        minMessages: Schema<number, number>;
        idleSeconds: Schema<number, number>;
        backgroundMessages: Schema<number, number>;
        candidatePool: Schema<number, number>;
    }>>;
    l2: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        minNewMemories: Schema<number, number>;
        maxScenes: Schema<number, number>;
        sceneContextLimit: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        minNewMemories: Schema<number, number>;
        maxScenes: Schema<number, number>;
        sceneContextLimit: Schema<number, number>;
    }>>;
    l3: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        interval: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        interval: Schema<number, number>;
    }>>;
    recall: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        maxResults: Schema<number, number>;
        maxCharsPerMemory: Schema<number, number>;
        maxTotalRecallChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
        includePersona: Schema<boolean, boolean>;
        includeSceneNav: Schema<boolean, boolean>;
        strategy: Schema<"keyword" | "embedding" | "hybrid", "keyword" | "embedding" | "hybrid">;
        scoreThreshold: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        maxResults: Schema<number, number>;
        maxCharsPerMemory: Schema<number, number>;
        maxTotalRecallChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
        includePersona: Schema<boolean, boolean>;
        includeSceneNav: Schema<boolean, boolean>;
        strategy: Schema<"keyword" | "embedding" | "hybrid", "keyword" | "embedding" | "hybrid">;
        scoreThreshold: Schema<number, number>;
    }>>;
    embedding: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        baseUrl: Schema<string, string>;
        apiKey: Schema<string, string>;
        model: Schema<string, string>;
        dimensions: Schema<number, number>;
        maxInputChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
        allowLocalModels: Schema<boolean, boolean>;
        mirror: Schema<string, string>;
        proxy: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        baseUrl: Schema<string, string>;
        apiKey: Schema<string, string>;
        model: Schema<string, string>;
        dimensions: Schema<number, number>;
        maxInputChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
        allowLocalModels: Schema<boolean, boolean>;
        mirror: Schema<string, string>;
        proxy: Schema<string, string>;
    }>>;
    llm: Schema<Schemastery.ObjectS<{
        provider: Schema<string, string>;
        model: Schema<string, string>;
        maxTokens: Schema<number, number>;
        reasoningEffort: Schema<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        temperature: Schema<number, number>;
        maxInputChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        provider: Schema<string, string>;
        model: Schema<string, string>;
        maxTokens: Schema<number, number>;
        reasoningEffort: Schema<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        temperature: Schema<number, number>;
        maxInputChars: Schema<number, number>;
        timeoutMs: Schema<number, number>;
    }>>;
    tools: Schema<boolean, boolean>;
}>>;
export declare function resolveDataDir(cfg: MemoryConfig): string;
