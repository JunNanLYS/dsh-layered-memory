/**
 * 召回 Hook：
 * 1. agent/pre-step（waterfall）：用进入步骤的用户消息做 L1 BM25 检索，缓存到该 agent 的槽位；
 *    必须调用并返回 next()（只观察，不改写步骤）。
 * 2. agent/created：在 agent 作用域注册动态上下文 provider（L1 召回 + L3 画像 + L2 场景导航 + 工具指南）。
 *
 * 注入内容使用 <relevant-memories> / <user-persona> / <scene-navigation> / <memory-tools-guide>
 * 标签包裹——capture 侧 sanitize 会剥离这些标签，防止反馈循环。
 * auto 档两族合并时在 <user-persona>/<scene-navigation> 内部用 <domain family="..."> 子块
 * 分域（子块只出现在外层标签内部，随外层一起被 sanitize 剥离，无泄漏风险）。
 *
 * 注意：PromptContext.text 是**同步**函数，画像/场景导航这类异步文件读取必须走内存缓存，
 * 由定时刷新 + 管线更新后的主动失效来更新。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryConfig } from '../config.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { L1Store } from '../store/l1.js';
import type { PersonaStore } from '../store/persona.js';
import type { SceneStore } from '../store/scenes.js';
import type { SessionModeStore } from '../store/session-modes.js';
import type { MemoryLogger } from '../types.js';
export interface RecallHooks {
    /** 管线更新后调用：画像/场景缓存立即失效并异步刷新。 */
    invalidateProfile(): void;
}
export declare function registerRecall(ctx: Context, cfg: MemoryConfig, stores: {
    l1: L1Store;
    scenes: Record<'chat' | 'work', SceneStore>;
    persona: Record<'chat' | 'work', PersonaStore>;
}, logger: MemoryLogger, live: LiveSettingsHandle, modes: SessionModeStore): RecallHooks;
