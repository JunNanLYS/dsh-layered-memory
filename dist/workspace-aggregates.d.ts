/**
 * 工作台只读聚合（UI 重构分散式）：总览快照、资产活动流、运行洞察三个端点的
 * 数据装配层。全部只读，不触碰蒸馏/召回语义。
 *
 * 数据源纪律：本组端点按「设置页打开期间低频拉取」设计（非 session-stats
 * 热路径）——L1 走 SQL 索引（idx_l1_updated 范围扫描 / FTS 检索唯一缝）；
 * L2 场景与 L3 画像是文件级小数据（dsh-memory/scenes、/persona 端点同款读法）。
 */
import type { AssetActivityResponse, MemoryStats, RuntimeInsightsResponse, WorkspaceOverviewResponse } from './contract.js';
import type { L1Store } from './store/l1.js';
import type { PersonaStore } from './store/persona.js';
import type { SceneStore } from './store/scenes.js';
import type { SessionModeStore } from './store/session-modes.js';
import type { MemoryFamily } from './types.js';
import type { SessionInfoSource } from './stats.js';
import type { LiveSettingsHandle } from './settings.js';
/** 工作台可见的分族存储聚合（与 registerMemoryRpc 的 stores 同形）。 */
export type WorkspaceStores = {
    l1: L1Store;
    scenes: Record<MemoryFamily, SceneStore>;
    persona: Record<MemoryFamily, PersonaStore>;
};
export interface ActivityQuery {
    query: string;
    kind: '' | 'l1' | 'l2' | 'l3';
    family: '' | 'chat' | 'work';
    sinceMs: number;
    limit: number;
    offset: number;
}
export declare function decodeCursor(cursor: string | null | undefined): number;
/**
 * 混排资产活动流：L1（索引列表/检索缝）+ L2（场景摘要，页内补读正文）+
 * L3（画像 + mtime），按 updatedAt 倒序统一排序后游标切片。
 */
export declare function collectAssetActivity(stores: WorkspaceStores, q: ActivityQuery): Promise<AssetActivityResponse>;
/** 总览聚合：buildStats 既有字段 + 本周成本（token-cost 周窗口）+ 最近活动前 5 条。 */
export declare function buildWorkspaceOverview(stores: WorkspaceStores, base: MemoryStats, week: {
    calls: number;
    outputTokens: number;
    reasoningTokens: number;
} | null, retrieval: 'hybrid' | 'vector' | 'keyword' | 'none' | null): Promise<WorkspaceOverviewResponse>;
/** 洞察聚合：近 7 天逐日资产活动 + 蒸馏调用计数器 + 召回全量累计与停用分布。 */
export declare function buildRuntimeInsights(stores: WorkspaceStores, sessionInfo: SessionInfoSource | undefined, modes: SessionModeStore | undefined, live: LiveSettingsHandle | undefined): Promise<RuntimeInsightsResponse>;
