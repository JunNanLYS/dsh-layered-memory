/**
 * 召回 Hook（消息侧注入版，ADR-0001）：
 * 1. agent/pre-step（waterfall，prepend 注册）：有新的用户来源消息到达的步骤
 *    （轮首 claim 或 steering 插话）→ 检索 L1 → 以合成消息形式注入到用户消息之前。
 *    注入消息携带插件来源（form: 'recall'），对用户可见、随会话历史持久累积——
 *    这就是"记忆生效"的显式提示（dsh-time-context 同款官方范式）。
 *    纯工具步透传；召回超时（recall.timeoutMs 总预算）跳过本轮，绝不阻塞对话。
 * 2. agent/created：在 agent 作用域注册动态上下文 provider（L3 画像 + L2 场景导航 +
 *    工具指南——系统提示只保留稳定内容；指南三条件门控：工具开启 && 有内容）。
 *
 * 注入内容使用 <relevant-memories> 标签包裹（模型侧语义边界 + 助手回显剥离锚点），
 * 召回预算（单条/整轮）超限截断并引导模型用记忆工具查全文。
 * L0 防污染零成本：capture 侧只收 source.kind === 'user' 的消息，注入消息天然被排除。
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
/**
 * 从会话消息构建召回查询（纯函数）：末尾 N 条 + 总长截断，空输入返回空串。
 * 全史拼接会让 MATCH 表达式随会话长度线性膨胀（整会话累计二次方成本）。
 */
export declare function buildRecallQuery(messages: Array<{
    content: unknown;
}>, tailMessages?: number, maxChars?: number): string;
export interface RecallHooks {
    /** 管线更新后调用：画像/场景缓存立即失效并异步刷新。 */
    invalidateProfile(): void;
}
export declare function registerRecall(ctx: Context, cfg: MemoryConfig, stores: {
    l1: L1Store;
    scenes: Record<'chat' | 'work', SceneStore>;
    persona: Record<'chat' | 'work', PersonaStore>;
}, logger: MemoryLogger, live: LiveSettingsHandle, modes: SessionModeStore): RecallHooks;
