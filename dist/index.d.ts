import type { Context } from '@deepseek-ai/cordis';
import { type MemoryConfig } from './config.js';
export declare const name = "dsh-memory-plugin";
/** 硬依赖：蒸馏要用 llm，工具注册要用 tools，召回注入要用 systemPrompt。 */
export declare const inject: string[];
/**
 * 插件配置 schema。导出名必须是 `Config`——cordis 运行时只读 plugin.Config
 * （Standard Schema 接口）做校验与默认值填充；导出 `schema` 会被静默忽略，
 * 导致 config 里嵌套对象为 undefined、apply 抛错、fiber FAILED 拖垮宿主启动。
 */
export declare const Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
    dataDir: import("@deepseek-ai/schemastery").default<string, string>;
    family: import("@deepseek-ai/schemastery").default<"chat" | "work" | "auto", "chat" | "work" | "auto">;
    capture: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        stripCodeBlocks: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        maxMessageChars: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        stripCodeBlocks: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        maxMessageChars: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    extract: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        minMessages: import("@deepseek-ai/schemastery").default<number, number>;
        idleSeconds: import("@deepseek-ai/schemastery").default<number, number>;
        backgroundMessages: import("@deepseek-ai/schemastery").default<number, number>;
        candidatePool: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        minMessages: import("@deepseek-ai/schemastery").default<number, number>;
        idleSeconds: import("@deepseek-ai/schemastery").default<number, number>;
        backgroundMessages: import("@deepseek-ai/schemastery").default<number, number>;
        candidatePool: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    l2: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        minNewMemories: import("@deepseek-ai/schemastery").default<number, number>;
        maxScenes: import("@deepseek-ai/schemastery").default<number, number>;
        sceneContextLimit: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        minNewMemories: import("@deepseek-ai/schemastery").default<number, number>;
        maxScenes: import("@deepseek-ai/schemastery").default<number, number>;
        sceneContextLimit: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    l3: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        interval: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        interval: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    recall: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        maxResults: import("@deepseek-ai/schemastery").default<number, number>;
        maxCharsPerMemory: import("@deepseek-ai/schemastery").default<number, number>;
        maxTotalRecallChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
        includePersona: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        includeSceneNav: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        strategy: import("@deepseek-ai/schemastery").default<"hybrid" | "keyword" | "embedding", "hybrid" | "keyword" | "embedding">;
        scoreThreshold: import("@deepseek-ai/schemastery").default<number, number>;
        decayHalfLifeDays: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        maxResults: import("@deepseek-ai/schemastery").default<number, number>;
        maxCharsPerMemory: import("@deepseek-ai/schemastery").default<number, number>;
        maxTotalRecallChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
        includePersona: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        includeSceneNav: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        strategy: import("@deepseek-ai/schemastery").default<"hybrid" | "keyword" | "embedding", "hybrid" | "keyword" | "embedding">;
        scoreThreshold: import("@deepseek-ai/schemastery").default<number, number>;
        decayHalfLifeDays: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    embedding: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        baseUrl: import("@deepseek-ai/schemastery").default<string, string>;
        apiKey: import("@deepseek-ai/schemastery").default<string, string>;
        model: import("@deepseek-ai/schemastery").default<string, string>;
        dimensions: import("@deepseek-ai/schemastery").default<number, number>;
        maxInputChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
        allowLocalModels: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        mirror: import("@deepseek-ai/schemastery").default<string, string>;
        proxy: import("@deepseek-ai/schemastery").default<string, string>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        baseUrl: import("@deepseek-ai/schemastery").default<string, string>;
        apiKey: import("@deepseek-ai/schemastery").default<string, string>;
        model: import("@deepseek-ai/schemastery").default<string, string>;
        dimensions: import("@deepseek-ai/schemastery").default<number, number>;
        maxInputChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
        allowLocalModels: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        mirror: import("@deepseek-ai/schemastery").default<string, string>;
        proxy: import("@deepseek-ai/schemastery").default<string, string>;
    }>>;
    llm: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        provider: import("@deepseek-ai/schemastery").default<string, string>;
        model: import("@deepseek-ai/schemastery").default<string, string>;
        fallbacks: import("@deepseek-ai/schemastery").default<({
            provider?: string | null | undefined;
            model?: string | null | undefined;
            reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
            provider: import("@deepseek-ai/schemastery").default<string, string>;
            model: import("@deepseek-ai/schemastery").default<string, string>;
            reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        }>[]>;
        layerRoutes: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            l1: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l2: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l3: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
        }>, Schemastery.ObjectT<{
            l1: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l2: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l3: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
        }>>;
        maxTokens: import("@deepseek-ai/schemastery").default<number, number>;
        reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        temperature: import("@deepseek-ai/schemastery").default<number, number>;
        maxInputChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        provider: import("@deepseek-ai/schemastery").default<string, string>;
        model: import("@deepseek-ai/schemastery").default<string, string>;
        fallbacks: import("@deepseek-ai/schemastery").default<({
            provider?: string | null | undefined;
            model?: string | null | undefined;
            reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
            provider: import("@deepseek-ai/schemastery").default<string, string>;
            model: import("@deepseek-ai/schemastery").default<string, string>;
            reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        }>[]>;
        layerRoutes: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            l1: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l2: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l3: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
        }>, Schemastery.ObjectT<{
            l1: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l2: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l3: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
        }>>;
        maxTokens: import("@deepseek-ai/schemastery").default<number, number>;
        reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        temperature: import("@deepseek-ai/schemastery").default<number, number>;
        maxInputChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    tokenCost: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        retentionDays: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        retentionDays: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    tools: import("@deepseek-ai/schemastery").default<boolean, boolean>;
    benchControl: import("@deepseek-ai/schemastery").default<boolean, boolean>;
}>, Schemastery.ObjectT<{
    dataDir: import("@deepseek-ai/schemastery").default<string, string>;
    family: import("@deepseek-ai/schemastery").default<"chat" | "work" | "auto", "chat" | "work" | "auto">;
    capture: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        stripCodeBlocks: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        maxMessageChars: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        stripCodeBlocks: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        maxMessageChars: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    extract: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        minMessages: import("@deepseek-ai/schemastery").default<number, number>;
        idleSeconds: import("@deepseek-ai/schemastery").default<number, number>;
        backgroundMessages: import("@deepseek-ai/schemastery").default<number, number>;
        candidatePool: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        minMessages: import("@deepseek-ai/schemastery").default<number, number>;
        idleSeconds: import("@deepseek-ai/schemastery").default<number, number>;
        backgroundMessages: import("@deepseek-ai/schemastery").default<number, number>;
        candidatePool: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    l2: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        minNewMemories: import("@deepseek-ai/schemastery").default<number, number>;
        maxScenes: import("@deepseek-ai/schemastery").default<number, number>;
        sceneContextLimit: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        minNewMemories: import("@deepseek-ai/schemastery").default<number, number>;
        maxScenes: import("@deepseek-ai/schemastery").default<number, number>;
        sceneContextLimit: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    l3: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        interval: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        interval: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    recall: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        maxResults: import("@deepseek-ai/schemastery").default<number, number>;
        maxCharsPerMemory: import("@deepseek-ai/schemastery").default<number, number>;
        maxTotalRecallChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
        includePersona: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        includeSceneNav: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        strategy: import("@deepseek-ai/schemastery").default<"hybrid" | "keyword" | "embedding", "hybrid" | "keyword" | "embedding">;
        scoreThreshold: import("@deepseek-ai/schemastery").default<number, number>;
        decayHalfLifeDays: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        maxResults: import("@deepseek-ai/schemastery").default<number, number>;
        maxCharsPerMemory: import("@deepseek-ai/schemastery").default<number, number>;
        maxTotalRecallChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
        includePersona: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        includeSceneNav: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        strategy: import("@deepseek-ai/schemastery").default<"hybrid" | "keyword" | "embedding", "hybrid" | "keyword" | "embedding">;
        scoreThreshold: import("@deepseek-ai/schemastery").default<number, number>;
        decayHalfLifeDays: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    embedding: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        baseUrl: import("@deepseek-ai/schemastery").default<string, string>;
        apiKey: import("@deepseek-ai/schemastery").default<string, string>;
        model: import("@deepseek-ai/schemastery").default<string, string>;
        dimensions: import("@deepseek-ai/schemastery").default<number, number>;
        maxInputChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
        allowLocalModels: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        mirror: import("@deepseek-ai/schemastery").default<string, string>;
        proxy: import("@deepseek-ai/schemastery").default<string, string>;
    }>, Schemastery.ObjectT<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        baseUrl: import("@deepseek-ai/schemastery").default<string, string>;
        apiKey: import("@deepseek-ai/schemastery").default<string, string>;
        model: import("@deepseek-ai/schemastery").default<string, string>;
        dimensions: import("@deepseek-ai/schemastery").default<number, number>;
        maxInputChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
        allowLocalModels: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        mirror: import("@deepseek-ai/schemastery").default<string, string>;
        proxy: import("@deepseek-ai/schemastery").default<string, string>;
    }>>;
    llm: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        provider: import("@deepseek-ai/schemastery").default<string, string>;
        model: import("@deepseek-ai/schemastery").default<string, string>;
        fallbacks: import("@deepseek-ai/schemastery").default<({
            provider?: string | null | undefined;
            model?: string | null | undefined;
            reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
            provider: import("@deepseek-ai/schemastery").default<string, string>;
            model: import("@deepseek-ai/schemastery").default<string, string>;
            reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        }>[]>;
        layerRoutes: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            l1: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l2: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l3: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
        }>, Schemastery.ObjectT<{
            l1: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l2: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l3: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
        }>>;
        maxTokens: import("@deepseek-ai/schemastery").default<number, number>;
        reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        temperature: import("@deepseek-ai/schemastery").default<number, number>;
        maxInputChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        provider: import("@deepseek-ai/schemastery").default<string, string>;
        model: import("@deepseek-ai/schemastery").default<string, string>;
        fallbacks: import("@deepseek-ai/schemastery").default<({
            provider?: string | null | undefined;
            model?: string | null | undefined;
            reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
            provider: import("@deepseek-ai/schemastery").default<string, string>;
            model: import("@deepseek-ai/schemastery").default<string, string>;
            reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        }>[]>;
        layerRoutes: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            l1: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l2: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l3: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
        }>, Schemastery.ObjectT<{
            l1: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l2: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
            l3: import("@deepseek-ai/schemastery").default<({
                provider?: string | null | undefined;
                model?: string | null | undefined;
                reasoningEffort?: "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<{
                provider: import("@deepseek-ai/schemastery").default<string, string>;
                model: import("@deepseek-ai/schemastery").default<string, string>;
                reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
            }>[]>;
        }>>;
        maxTokens: import("@deepseek-ai/schemastery").default<number, number>;
        reasoningEffort: import("@deepseek-ai/schemastery").default<"" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", "" | "off" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
        temperature: import("@deepseek-ai/schemastery").default<number, number>;
        maxInputChars: import("@deepseek-ai/schemastery").default<number, number>;
        timeoutMs: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    tokenCost: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        retentionDays: import("@deepseek-ai/schemastery").default<number, number>;
    }>, Schemastery.ObjectT<{
        retentionDays: import("@deepseek-ai/schemastery").default<number, number>;
    }>>;
    tools: import("@deepseek-ai/schemastery").default<boolean, boolean>;
    benchControl: import("@deepseek-ai/schemastery").default<boolean, boolean>;
}>>;
export declare function apply(ctx: Context, config: MemoryConfig): Promise<void>;
