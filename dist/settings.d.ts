/**
 * 记忆模式运行时开关（官方 settings 服务，live 生效）。
 * 语义：静态 config（cordis.patch.yml，部署上限）AND 运行时开关，两者同时开才工作。
 * settings 服务缺失（如 headless）时退化为恒开——行为与无开关版本一致。
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { MemoryLogger } from './types.js';
export interface MemoryLiveSettings {
    /** 总开关：关 = 捕获/蒸馏/召回注入全停（数据保留） */
    enabled: boolean;
    /** L0 捕获（原始对话落盘） */
    capture: boolean;
    /** L1 抽取 + L2/L3 蒸馏 */
    distill: boolean;
    /** 召回注入（画像/记忆上下文） */
    recall: boolean;
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
