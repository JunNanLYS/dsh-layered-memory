/**
 * 记忆模式运行时开关（官方 settings 服务，live 生效）。
 * 语义：静态 config（cordis.patch.yml，部署上限）AND 运行时开关，两者同时开才工作。
 * settings 服务缺失（如 headless）时退化为恒开——行为与无开关版本一致。
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { EFFORT_CHOICES } from './config.js';
import type { DistillBudgetLayer } from './llm.js';
import type { MemoryLogger } from './types.js';
/** 蒸馏思考档位：'' = 自动（模型默认档 → high）；词汇表单源于 config.ts 的 EFFORT_CHOICES。 */
export type EffortChoice = (typeof EFFORT_CHOICES)[number];
/** 分层输出预算（与 llm.ts 的 DistillBudgetLayer 同键；0 = 跟随内置默认）。 */
export type DistillBudgets = Record<DistillBudgetLayer, number>;
/**
 * 运行时统一路由链条目：[0] = 主路由（provider/model 双空 = 跟随默认模型），
 * [1..] = 回退链（按序降级）；reasoningEffort 为该路由的档位覆盖（'' = 跟随部署全局）。
 */
export interface DistillChainEntry {
    provider: string;
    model: string;
    reasoningEffort: EffortChoice;
}
/** 运行时路由链上限（写入门与 UI 同限，防误粘贴巨数组撑爆 settings 存储）。 */
export declare const DISTILL_CHAIN_MAX = 8;
/**
 * 运行时统一路由链的**展示投影**（llm-providers 的 chain.current 数据源）：
 * distillChain 非空即原样返回；为空时投影旧运行时键（distillProvider/distillModel
 * 成对 → 单行主路由，旧档位 reasoningEffort 作为该主路由的档位——旧语义里它
 * 作用的就是当时唯一的路由）。注意：生效逻辑（effectiveCfg）只认显式
 * distillChain、不走本投影——旧键路径在未配链时按旧语义原样生效。
 */
export declare function projectDistillChain(s: Partial<MemoryLiveSettings> | undefined): DistillChainEntry[];
/** settings-set 写入门校验：返回错误文案（null = 通过）。 */
export declare function validateDistillChain(chain: unknown): string | null;
export interface MemoryLiveSettings {
    /** 总开关：关 = 捕获/蒸馏/召回注入全停（数据保留） */
    enabled: boolean;
    /** L0 捕获（原始对话落盘） */
    capture: boolean;
    /** L1 抽取 + L2/L3 蒸馏 */
    distill: boolean;
    /** 召回注入（画像/记忆上下文） */
    recall: boolean;
    /** 蒸馏思考档位运行时覆盖：'' = 跟随静态 config（llm.reasoningEffort） */
    reasoningEffort: EffortChoice;
    /** 蒸馏模型运行时覆盖（供应商 id，用户已配置的路由）：'' = 跟随静态 config/默认选择。
     *  与 distillModel 成对生效（单字段不算）；部署静态 pin（provider+model 双字段）优先。 */
    distillProvider: string;
    /** 蒸馏模型运行时覆盖（模型 id）：'' = 跟随静态 config/默认选择。 */
    distillModel: string;
    /** 运行时统一路由链（统一列表 UI 的存储形态，见 DistillChainEntry）；
     *  非空即权威（旧 distillProvider/distillModel/reasoningEffort 不再参与），
     *  空数组 = 跟随部署静态配置与默认模型。 */
    distillChain: DistillChainEntry[];
    /** 分层输出预算运行时覆盖（token）：extract/dedup/l2/l3 四层，0 = 跟随内置默认；
     *  思考档 high/max 的 ×4 放大在覆盖值之上照常生效。 */
    distillBudgets: DistillBudgets;
    /** 输入预算运行时覆盖（字符，≈token）：单次蒸馏调用的输入上限，L1 按此分块、
     *  超限截断；0 = 跟随静态配置 llm.maxInputChars。 */
    distillMaxInputChars: number;
}
export interface LiveSettingsHandle {
    /** settings 服务是否可用（不可用时 UI 侧隐藏开关面板） */
    supported: boolean;
    get(): MemoryLiveSettings;
    /** UI 写入入口；不支持时抛错由 RPC 层转成业务错误 */
    update(patch: Partial<MemoryLiveSettings>): Promise<void>;
}
export declare function liveSettingsSchema(): Schema<MemoryLiveSettings>;
export declare function registerLiveSettings(ctx: Context, logger: MemoryLogger): LiveSettingsHandle;
