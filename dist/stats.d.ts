import type { Context } from '@deepseek-ai/cordis';
import { type MemoryConfig } from './config.js';
import type { RebuildController } from './pipeline/rebuild.js';
import type { LiveSettingsHandle } from './settings.js';
import type { L0Store } from './store/l0.js';
import type { L1Store } from './store/l1.js';
import type { PersonaStore } from './store/persona.js';
import type { SceneStore } from './store/scenes.js';
import type { SessionModeStore } from './store/session-modes.js';
import type { StateStore } from './store/state.js';
import type { MemoryFamily, MemoryLogger } from './types.js';
export declare const PLUGIN_VERSION: string;
/** 运行态来源（index.ts 注入）：避免 stats 撒谎字段。 */
export interface MemoryStatusSource {
    /** 存储是否处于降级态（数据目录/检索库不可用）。 */
    degraded(): boolean;
    /** L1 抽取待重试的消息条数。 */
    pending(): number;
}
export interface MemoryStats {
    ok: boolean;
    dataDir: string;
    /** 新会话默认记忆档位（auto/chat/work）。 */
    family: string;
    version: string;
    l0Today: number;
    l1Count: number;
    l1TotalExtracted: number;
    sceneCount: number;
    personaChars: number;
    hasPersona: boolean;
    lastExtractAt: string | null;
    lastL2At: string | null;
    lastL3At: string | null;
    memoriesSinceL2: number;
    memoriesSinceL3: number;
    pendingExtract: number;
    message: string;
    /** 实际生效的阈值（概览进度分母用，避免 UI 硬编码与部署配置脱节）。 */
    thresholds: {
        l2MinNewMemories: number;
        l3Interval: number;
    };
}
/** 注册状态 RPC（web 侧 connection 服务可选，缺失时跳过，不影响插件主体）。 */
export declare function registerMemoryRpc(ctx: Context, cfg: MemoryConfig, stores: {
    l0: L0Store;
    l1: L1Store;
    scenes: Record<MemoryFamily, SceneStore>;
    persona: Record<MemoryFamily, PersonaStore>;
    state: StateStore;
}, logger: MemoryLogger, status?: MemoryStatusSource, live?: LiveSettingsHandle, modes?: SessionModeStore, dataDir?: string, rebuild?: RebuildController): void;
