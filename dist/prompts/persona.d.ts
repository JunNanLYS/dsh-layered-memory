/**
 * L3 画像蒸馏 Prompt（移植自 MemoryCore src/core/prompts/persona-generation.ts）。
 *
 * 关键适配：原版让 LLM 用 write/edit 文件工具写 persona.md；DSH 插件内改为要求
 * LLM **直接返回 persona.md 的完整内容**（工程侧负责写入与导航段拼接）。
 */
import type { MemoryFamily } from '../types.js';
export interface PersonaPromptParams {
    mode: 'first' | 'incremental';
    family: MemoryFamily;
    currentTime: string;
    totalProcessed: number;
    sceneCount: number;
    changedSceneCount: number;
    changedScenesContent: string;
    existingPersona?: string;
    triggerInfo?: string;
}
export interface PersonaPromptResult {
    systemPrompt: string;
    userPrompt: string;
}
export declare function buildPersonaPrompt(params: PersonaPromptParams): PersonaPromptResult;
