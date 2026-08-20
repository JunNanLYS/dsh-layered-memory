/**
 * 记忆模式运行时开关（官方 settings 服务，live 生效）。
 * 语义：静态 config（cordis.patch.yml，部署上限）AND 运行时开关，两者同时开才工作。
 * settings 服务缺失（如 headless）时退化为恒开——行为与无开关版本一致。
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { DistillBudgetLayer } from './llm.js';
import type { MemoryLogger } from './types.js';
/** 蒸馏思考档位可选项：'' = 跟随静态 config（部署默认）。 */
export type EffortChoice = '' | 'off' | 'high' | 'max';
/** 分层输出预算（与 llm.ts 的 DistillBudgetLayer 同键；0 = 跟随内置默认）。 */
export type DistillBudgets = Record<DistillBudgetLayer, number>;
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
    /** 分层输出预算运行时覆盖（token）：extract/dedup/l2/l3 四层，0 = 跟随内置默认；
     *  思考档 high/max 的 ×4 放大在覆盖值之上照常生效。 */
    distillBudgets: DistillBudgets;
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
