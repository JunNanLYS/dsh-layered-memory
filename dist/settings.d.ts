/**
 * 记忆模式运行时开关（官方 settings 服务，live 生效）。
 * 语义：静态 config（cordis.patch.yml，部署上限）AND 运行时开关，两者同时开才工作。
 * settings 服务缺失（如 headless）时退化为恒开——行为与无开关版本一致。
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { MemoryLogger } from './types.js';
import type { DistillChainEntry, MemoryLiveSettings } from './contract.js';
export type { DistillBudgets, DistillChainEntry, EffortChoice, MemoryLiveSettings } from './contract.js';
/**
 * 运行时统一路由链条目：[0] = 主路由（provider/model 双空 = 跟随默认模型），
 * [1..] = 回退链（按序降级）；reasoningEffort 为该路由的档位覆盖（'' = 跟随部署全局）。
 */
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
/**
 * settings-set 写入门校验：返回错误文案（null = 通过）。
 * opts.requireExplicitHead（#34 层链用）：头行必须 provider+model 双显式——层键出现
 * 即意图覆盖；"双空 = 跟随默认模型"是全局链独有语义（"默认模型 + 自定义回退"的
 * 诉求由全局 llm.fallbacks 承担），层链禁掉双空头，消除"层链头跟随哪套全局解析"的歧义。
 */
export declare function validateDistillChain(chain: unknown, opts?: {
    requireExplicitHead?: boolean;
}): string | null;
export interface LiveSettingsHandle {
    /** settings 服务是否可用（不可用时 UI 侧隐藏开关面板） */
    supported: boolean;
    get(): MemoryLiveSettings;
    /** UI 写入入口；不支持时抛错由 RPC 层转成业务错误 */
    update(patch: Partial<MemoryLiveSettings>): Promise<void>;
}
export declare function liveSettingsSchema(): Schema<MemoryLiveSettings>;
export declare function registerLiveSettings(ctx: Context, logger: MemoryLogger): LiveSettingsHandle;
