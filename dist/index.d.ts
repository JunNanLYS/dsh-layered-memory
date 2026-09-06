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
export declare const Config: import("@deepseek-ai/schemastery").default<any, MemoryConfig>;
export declare function apply(ctx: Context, config: MemoryConfig): Promise<void>;
