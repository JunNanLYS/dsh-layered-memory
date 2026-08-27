import type { Context } from '@deepseek-ai/cordis';
import { type MemoryConfig } from './config.js';
import { type RecallSessionStats } from './hooks/recall.js';
import type { RebuildController } from './pipeline/rebuild.js';
import { type LiveSettingsHandle } from './settings.js';
import type { L0Store } from './store/l0.js';
import type { L1Store } from './store/l1.js';
import type { PersonaStore } from './store/persona.js';
import type { SceneStore } from './store/scenes.js';
import type { SessionModeStore } from './store/session-modes.js';
import type { EmbeddingManager } from './store/embedding-source.js';
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
/**
 * 会话级统计数据源（悬浮卡信息区；index.ts 注入）。
 * 硬规则：本端点按"打开期间 2~5s 轮询"设计，实现只允许内存注册表读取与
 * 索引化 SQL 点查——禁止任何文件读/目录扫描（scenes.list()/persona.read()
 * 级别的 I/O 会把每次轮询变成数十毫秒的全量读，见 slider-spec 数据策略节）。
 */
export interface SessionInfoSource {
    /** 召回统计（recall.ts 注册表；未发生检索的会话返回 undefined）。 */
    recallStats(sessionId: string): RecallSessionStats | undefined;
    /** 记忆上下文占用账本（context-occupancy 唯一权威实例；未注入过的会话返回 null）。 */
    memoryOccupancy(sessionId: string): MemoryOccupancy | null;
    /** 稳定区份额估算（旧会话回填用；缺省 = 装配未提供，回填隐藏）。 */
    profileEstimate?(sessionId: string): number;
    /** 召回份额回填（live surface 现扫，miss 读盘上日志；缺省 = null）。 */
    recallEstimate?(sessionId: string): Promise<number | null> | number | null;
    /** 蒸馏管线会话视图（runner：攒批进度/挂起切片/会话产出）。 */
    runnerView(sessionId: string, mode: string): {
        pendingSlice: number;
        parkedSlices: number;
        threshold: number | null;
        producedRecords: number;
        lastDistillAt: number | null;
    };
    /** L0 该会话已捕获消息数（索引 COUNT）。 */
    l0Count(sessionId: string): Promise<number>;
    /** 检索能力位（hybrid / keyword 降级判定）。 */
    capabilities(): {
        ftsSearch: boolean;
        vectorSearch: boolean;
    };
}
import type { MemoryOccupancy } from './contract.js';
export type { MemoryStats } from './contract.js';
/** 注册状态 RPC（web 侧 connection 服务可选，缺失时跳过，不影响插件主体）。 */
export declare function registerMemoryRpc(ctx: Context, cfg: MemoryConfig, stores: {
    l0: L0Store;
    l1: L1Store;
    scenes: Record<MemoryFamily, SceneStore>;
    persona: Record<MemoryFamily, PersonaStore>;
    state: StateStore;
}, logger: MemoryLogger, status?: MemoryStatusSource, live?: LiveSettingsHandle, modes?: SessionModeStore, dataDir?: string, rebuild?: RebuildController, embedManager?: EmbeddingManager, sessionInfo?: SessionInfoSource): void;
