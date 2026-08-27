/**
 * LLM 桥：用 DSH 自身的 llm 服务跑蒸馏调用。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryConfig } from './config.js';
import type { MemoryLogger } from './types.js';
import { type DistillLayer } from './llm-usage.js';
export interface LlmCallOptions {
    system: string;
    user: string;
    /** 蒸馏层标签（用量记账用，缺省 'l1-extract' 之外的兜底为 unknown 不计——四层调用点都应传）。 */
    layer?: DistillLayer;
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
/** 分层输出预算键（已迁入契约 src/contract.ts；import type 供本地使用，re-export 不断裂既有引用）。 */
import type { DistillBudgetLayer, LayerRouteKey, StaticFallbackEntry } from './contract.js';
export type { DistillBudgetLayer } from './contract.js';
/** 各层内置默认预算（设置页"0 = 跟随默认"的默认值来源）。 */
export declare const LAYER_DEFAULT_BUDGETS: Record<DistillBudgetLayer, number>;
/** resolveLayerTokens/layerEffortTrigger 需要的最小 cfg 视图（smoke 决策表用窄对象即可构造）。 */
export interface LayerRouteCfgView {
    llm: {
        reasoningEffort: string;
        primaryEffort?: string;
        layerRoutes?: Partial<Record<LayerRouteKey, StaticFallbackEntry[]>>;
        layerChainsRuntime?: Partial<Record<LayerRouteKey, StaticFallbackEntry[]>>;
        budgets?: Partial<Record<DistillBudgetLayer, number>>;
    };
}
/**
 * 解析某蒸馏层的生效输出预算：运行时覆盖（cfg.llm.budgets，由 effectiveCfg 从
 * 设置页 distillBudgets 注入，0/缺省 = 跟随）→ 内置默认 → 思考档放大
 * （high/xhigh/max ×4，reasoning 计入输出预算的历史事故防线）。放大触发档位
 * 跟层走（#34 D8）：层链头档位候选 > 全局主路由档位候选（primaryEffort > 静态全局）。
 */
export declare function resolveLayerTokens(cfg: LayerRouteCfgView, layer: DistillBudgetLayer): number;
/**
 * 高思考档集合（输出预算 ×4 的档位）：阶段侧 layerMaxTokens 与 callLLM 的
 * 自动档防线共用同一张表——此前两处字面量表分叉（防线漏 xhigh），显式 xhigh
 * 配置被双重放大 ×16。勿再在别处抄写该列表。
 */
export declare const HIGH_EFFORT_TIERS: readonly ["high", "xhigh", "max"];
/**
 * 思考档预算放大：reasoning 计入输出预算（v4-flash 事故：high 思考可吃光全部
 * 预算致正文 0 字符）——effort 为 high/xhigh/max 时分层预算 ×4。
 */
export declare function layerMaxTokens(base: number, reasoningEffort: string): number;
/** 解析蒸馏用的 provider/model：配置优先，其次当前默认选择。 */
export declare function resolveModelRoute(ctx: Context, cfg: MemoryConfig): Promise<{
    provider: string;
    model: string;
}>;
/** 回退链条目（配置形态；reasoningEffort 为该路由的档位覆盖，'' = 跟随全局）。 */
export interface FallbackRouteEntry {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** 链上单条路由（档位候选已解析：条目非空 > 全局静态；发送前仍过能力钳制）。 */
export interface DistillRoute {
    provider: string;
    model: string;
    effort: string;
}
/**
 * 组装蒸馏路由链（纯决策，smoke 决策表缝）：主路由在前、回退条目按配置顺序在后。
 * provider/model 缺失的条目剔除；与主路由或先前条目完全相同（provider+model）的
 * 条目跳过——注定失败的重复尝试不值得占位。每条路由携带生效档位候选：
 * 主路由可带显式档位（运行时统一链注入 primaryEffort），条目档位非空覆盖全局。
 */
export declare function buildRouteChain(primary: {
    provider: string;
    model: string;
    effort?: string;
}, fallbacks: FallbackRouteEntry[] | undefined, globalEffort: string): DistillRoute[];
/** DistillLayer（调用点四键）→ 路由层键（三键）：l1-extract/l1-dedup 同属 l1。 */
export declare function layerKeyFor(layer: DistillLayer): LayerRouteKey;
/** 该层的预算放大触发档位（D8）：层链头档位候选 > 全局主路由档位候选（primaryEffort > 静态全局）。 */
export declare function layerEffortTrigger(cfg: LayerRouteCfgView, key: LayerRouteKey): string;
/**
 * 解析某次蒸馏调用的实际路由链（callLLM 入口）：有层标签且该层配了层链 → 层链
 * 完整替换（buildRouteChain 复用：头行在前、条目去重、档位三级候选）；否则现行
 * 全局解析（主路由既有优先级 + fallbacks，语义一个比特不动）。layer 缺省
 * （bench/测试缝）= 全局解析。
 */
export declare function resolveLayerRoutes(ctx: Context, cfg: MemoryConfig, layer?: DistillLayer): Promise<DistillRoute[]>;
/** 层链解析的同步半边（llm-providers 视图与 resolveLayerRoutes 共用一条真值路径）：
 *  该层配了有效层链 → 完整链；null = 该层跟随全局解析。 */
export declare function layerChainOrNull(cfg: LayerRouteCfgView, key: LayerRouteKey): DistillRoute[] | null;
export interface ModelEffortInfo {
    /** 模型可设置的思考档位 id（适配器声明；空 = 未声明/不可设置） */
    efforts: string[];
    /** 适配器配置的默认档位（省略 effort 时的请求值） */
    defaultEffort?: string;
}
/** 清空能力缓存（llm/adapters-updated 时调用：供应商增删/改配置后重新探询）。 */
export declare function invalidateEffortCache(): void;
/** 探询某模型的思考档位能力；失败返回 null（调用方保持旧发送行为，不改判）。 */
export declare function resolveModelEfforts(ctx: Context, provider: string, model: string): Promise<ModelEffortInfo | null>;
/**
 * 探询某模型的上下文窗口容量（adapter 声明的 provider-owned capacity）。
 * 与 effortCache 同源同失效策略（invalidateEffortCache 一并清空）；
 * 仅用于占用指示器的分母展示——分母必须与官方环同源（模型声明值），禁止 client 自估。
 */
export declare function resolveModelContextWindow(ctx: Context, provider: string, model: string): Promise<number | null>;
export type EffortDecisionReason = 'supported' | 'auto-default' | 'auto-high' | 'alias-none' | 'unsupported' | 'no-efforts' | 'no-capability';
export interface EffortDecision {
    /** 实际发送的档位；'' = 不发送（跟随模型默认） */
    effort: string;
    reason: EffortDecisionReason;
}
/** 纯决策：配置档位 + 模型能力 → 实际发送值（callLLM 与 settings-get 共用）。 */
export declare function decideSendableEffort(cap: ModelEffortInfo | null, cfgEffort: string): EffortDecision;
/** 探询 + 决策 + 一次性告警（不支持/未声明时提示降级，不刷屏）。 */
export declare function planDistillEffort(ctx: Context, provider: string, model: string, cfgEffort: string, logger?: MemoryLogger): Promise<EffortDecision>;
/**
 * 一次完整蒸馏调用（带回退链，ADR-0004）：按路由链（主路由 + llm.fallbacks）逐条
 * 尝试，返回首个成功路由的输出。失败（error/aborted finish、网络异常、空输出）
 * 降级下一条；调用方主动取消（signal 已中止）原样上抛不降级；全部失败抛最后一个
 * 错误，由调用方兜底（runner 的按会话指数退避接管重试节奏）。
 *
 * 文本只从 block-end（协议保证携带**组装完成的整块**）取；text-delta 仅在
 * 适配器异常地没有发 block-end 时兜底。两者都累计会把输出翻倍。
 */
export declare function callLLM(ctx: Context, cfg: MemoryConfig, opts: LlmCallOptions): Promise<string>;
/** 带诊断日志的 parseJson：解析失败时记录原始输出摘录（模型输出异常排查的关键信息）。 */
export declare function parseJsonLogged<T>(raw: string, what: string, logger?: MemoryLogger): T;
/** 容错地解析 LLM 输出的 JSON（剥掉可能的 ```json 围栏）。 */
export declare function parseJson<T>(raw: string): T;
