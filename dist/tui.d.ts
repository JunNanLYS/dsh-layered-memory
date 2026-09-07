/**
 * TUI 形态原生接入（dsh-tui / 官方 TUI 宿主）——软探测、静默降级，绝不拖垮宿主。
 *
 * 接缝出处：dsh-ecosystem-spec《终端交互生态插件准入与开发指南》（dsh-TUI 生态）。
 * web/headless profile 缺这些服务时全部 no-op；服务形状走内联结构类型，不引
 * 第三方包依赖（与 sessions/connection 的鸭子探测同款纪律——tsc 抓不到运行时
 * 漂移，升级 dsh-tui 后须真机复验）。
 * - tuiSettingsSections：/settings 声明式设置区块（settings 命名空间 dsh-memory 的编辑面）；
 * - tuiStatus：提示框上方键控状态行（当前会话记忆档位；清理是调用者责任，挂 ctx.effect）；
 * - tuiDialogs：托管单选弹窗（/memory 无参数时的档位选择）；
 * - commands（dsh-base 服务，全形态存在）：/memory 命令——TUI/web 均可派发，headless 无 UI 自然闲置。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { LiveSettingsHandle } from './settings.js';
import type { SessionModeStore } from './store/session-modes.js';
import type { MemoryLogger } from './types.js';
export interface TuiSurfaceDeps {
    logger: MemoryLogger;
    live: LiveSettingsHandle;
    modes: SessionModeStore;
}
export declare function registerTuiSurface(ctx: Context, deps: TuiSurfaceDeps): void;
