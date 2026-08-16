/**
 * L3 画像蒸馏：把变化场景交给 LLM，直接产出 persona.md 完整内容。
 * 触发条件移植自 MemoryCore persona-trigger（主动请求 / 冷启动 / 恢复 / 间隔阈值）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryConfig } from '../config.js';
import type { PersonaStore } from '../store/persona.js';
import type { SceneStore } from '../store/scenes.js';
import type { MemoryState } from '../store/state.js';
import type { MemoryFamily, MemoryLogger } from '../types.js';
export interface PersonaResult {
    generated: boolean;
    reason: string;
}
export declare function runPersona(ctx: Context, cfg: MemoryConfig, scenes: SceneStore, persona: PersonaStore, state: MemoryState, logger: MemoryLogger, family: MemoryFamily): Promise<PersonaResult>;
