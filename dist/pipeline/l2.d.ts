/**
 * L2 场景整合：把新记忆交给 LLM，输出文件操作 JSON，工程侧执行。
 * 移植 MemoryCore scene runner 的语义（UPDATE 优先 / MERGE / 上限预警 / heat 管理）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryConfig } from '../config.js';
import type { SceneStore } from '../store/scenes.js';
import type { MemoryFamily, MemoryLogger, MemoryRecord } from '../types.js';
export interface SceneResult {
    changed: number;
    personaRequestedReason?: string;
}
export declare function runSceneConsolidation(ctx: Context, cfg: MemoryConfig, scenes: SceneStore, newMemories: MemoryRecord[], logger: MemoryLogger, family: MemoryFamily): Promise<SceneResult>;
