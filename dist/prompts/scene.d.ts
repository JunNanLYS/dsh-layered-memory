/**
 * L2 场景整合 Prompt（移植自 MemoryCore src/core/prompts/scene-extraction.ts）。
 *
 * 关键适配：MemoryCore 原版让 LLM 通过文件工具（read/write/edit）操作场景文件；
 * DSH 插件内 LLM 无文件工具，因此改为要求 LLM 直接输出"文件操作 JSON 数组"，
 * 由插件工程侧执行写入/删除。其余规则（命名、上限、heat、模板、合并优先级）原样保留。
 */
import type { MemoryFamily, SceneSummary } from '../types.js';
export interface ScenePromptParams {
    memoriesJson: string;
    sceneSummaries: string;
    sceneContents: string;
    currentTimestamp: string;
    existingSceneFiles: string[];
    maxScenes: number;
    family: MemoryFamily;
}
export interface ScenePromptResult {
    systemPrompt: string;
    userPrompt: string;
}
/** 文件操作 JSON 契约（LLM 输出 → 工程侧执行）。 */
export interface SceneOp {
    op: 'write' | 'delete';
    path: string;
    content?: string;
}
/**
 * 组装 L2 prompt。sceneSummaries 为摘要文本；sceneContents 为"文件名 + 完整内容"文本块。
 */
export declare function buildScenePrompt(params: ScenePromptParams): ScenePromptResult;
/** 场景摘要文本（供 L2 prompt 与场景导航）。 */
export declare function formatSceneSummaries(scenes: SceneSummary[]): string;
