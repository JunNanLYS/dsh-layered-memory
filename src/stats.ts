/**
 * 状态面板数据通道：Host 侧注册 /rpc 通道的 dsh-memory/stats 端点，
 * Client 设置页通过 ctx.connection.rpc.call('/rpc', 'dsh-memory/stats') 拉取。
 *
 * connection 是可选服务且可能晚于本插件就绪：先探测一次，未就绪则监听
 * internal/service（事件携带 (name, impl)，impl=undefined 即下线），服务
 * 上线、下线、替换实例三种迁移都会正确释放/重挂 RPC 注册。
 */
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
// 纯类型导入：把 dsh-client-connection 的 Context.connection 声明合并拉进编译，
// 使 ctx.get('connection') 拿到 HostConnectionHandle 类型（编译后无运行时依赖）。
import type {} from '@deepseek-ai/dsh-client-connection';
import { resolveDataDir, type MemoryConfig } from './config.js';
import type { RebuildController } from './pipeline/rebuild.js';
import type { LiveSettingsHandle } from './settings.js';
import type { L0Store } from './store/l0.js';
import type { L1Store } from './store/l1.js';
import type { PersonaStore } from './store/persona.js';
import type { SceneStore } from './store/scenes.js';
import type { SessionModeStore } from './store/session-modes.js';
import type { StateStore } from './store/state.js';
import type { MemoryFamily, MemoryLogger, MemoryMode } from './types.js';

const require = createRequire(import.meta.url);
export const PLUGIN_VERSION = (require('../package.json') as { version: string }).version;

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
  thresholds: { l2MinNewMemories: number; l3Interval: number };
}

/** 分族存储聚合（浏览器保持混合视图：两族拼接展示）。 */
type FamilyStores = {
  scenes: Record<MemoryFamily, SceneStore>;
  persona: Record<MemoryFamily, PersonaStore>;
};

/** 注册状态 RPC（web 侧 connection 服务可选，缺失时跳过，不影响插件主体）。 */
export function registerMemoryRpc(
  ctx: Context,
  cfg: MemoryConfig,
  stores: {
    l0: L0Store;
    l1: L1Store;
    scenes: Record<MemoryFamily, SceneStore>;
    persona: Record<MemoryFamily, PersonaStore>;
    state: StateStore;
  },
  logger: MemoryLogger,
  status?: MemoryStatusSource,
  live?: LiveSettingsHandle,
  modes?: SessionModeStore,
  dataDir?: string,
  rebuild?: RebuildController,
): void {
  /** 当前是否持有一段有效注册（dispose 完成后清空，允许服务重上线时重注册）。 */
  let holding = false;
  /** 当前 handle 绑定的 connection 实例（internal/service 第二参；用于识别实例替换）。 */
  let registeredImpl: unknown;

  const tryRegister = (): void => {
    if (holding) return;
    const connection = ctx.get('connection');
    if (!connection) return;
    holding = true;
    let active = true;
    // handle() 同步注册并返回异步 disposer（() => Promise<void>）。
    const dispose = connection.rpc.handle(
      '/rpc',
      async (endpoint, payload) => {
        try {
          const value = await handleEndpoint(endpoint, payload, {
            cfg,
            stores,
            status,
            live,
            modes,
            dataDir: dataDir ?? resolveDataDir(cfg),
            logger,
            rebuild,
          });
          return { ok: true, value };
        } catch (err) {
          return {
            ok: false,
            error: { code: 'internal', message: err instanceof Error ? err.message : String(err), details: {} },
          };
        }
      },
      { authority: 'loopback' },
    );
    registeredImpl = connection;
    if (!active) {
      void dispose();
      return;
    }
    logger.debug?.('[memory] 状态 RPC 已注册（/rpc → dsh-memory/*）');
    disposers.push(() => {
      active = false;
      holding = false;
      void dispose();
    });
  };

  /** 释放全部持有注册（handle 随旧服务实例失效，holding 复位以允许重挂）。 */
  const release = (): void => {
    for (const dispose of disposers.splice(0)) dispose();
  };

  const disposers: Array<() => void> = [];

  ctx.effect(() => {
    tryRegister();
    const off = ctx.on('internal/service', (name: string, impl: unknown) => {
      if (name !== 'connection') return;
      if (!impl) {
        // 服务下线：旧 handle 已随旧服务实例失效——主动释放并复位，
        // 服务恢复时本事件再触发即可重挂（否则 holding 恒真 → RPC 永久失联）
        release();
        registeredImpl = undefined;
        logger.debug?.('[memory] connection 服务下线，RPC 注册已释放（待恢复重挂）');
        return;
      }
      if (impl !== registeredImpl) {
        // 实例替换：旧 handle 失效，换新实例重挂
        release();
        registeredImpl = undefined;
      }
      tryRegister();
    });
    return () => {
      off();
      release();
    };
  });
}

async function buildStats(
  cfg: MemoryConfig,
  stores: { l0: L0Store; l1: L1Store; state: StateStore } & FamilyStores,
  status?: MemoryStatusSource,
): Promise<MemoryStats> {
  // 两族 checkpoint 聚合（浏览器混合视图：总量求和、时间取最新）
  const chat = stores.state.forFamily('chat');
  const work = stores.state.forFamily('work');
  const [chatScenes, workScenes, chatPersona, workPersona] = await Promise.all([
    stores.scenes.chat.list(),
    stores.scenes.work.list(),
    stores.persona.chat.read(),
    stores.persona.work.read(),
  ]);
  const degraded = status?.degraded() ?? false;
  const personaChars = (chatPersona?.length ?? 0) + (workPersona?.length ?? 0);
  const max = (a: number, b: number): number => Math.max(a, b);
  const iso = (t: number): string | null => (t ? new Date(t).toISOString() : null);
  return {
    ok: true,
    dataDir: resolveDataDir(cfg),
    family: cfg.family,
    version: PLUGIN_VERSION,
    l0Today: await stores.l0.countToday(),
    l1Count: stores.l1.size,
    l1TotalExtracted: chat.totalExtracted + work.totalExtracted,
    sceneCount: chatScenes.length + workScenes.length,
    personaChars,
    hasPersona: chat.hasPersona || work.hasPersona,
    lastExtractAt: iso(max(chat.lastExtractAt, work.lastExtractAt)),
    lastL2At: iso(max(chat.lastL2At, work.lastL2At)),
    lastL3At: iso(max(chat.lastL3At, work.lastL3At)),
    memoriesSinceL2: chat.newMemoriesSinceL2 + work.newMemoriesSinceL2,
    memoriesSinceL3: chat.memoriesSinceL3 + work.memoriesSinceL3,
    pendingExtract: status?.pending() ?? 0,
    message: degraded ? 'degraded：存储不可用，记忆功能已停用' : 'running',
    thresholds: { l2MinNewMemories: cfg.l2.minNewMemories, l3Interval: cfg.l3.interval },
  };
}

// ============================================================
// 端点分发（记忆浏览器 + 开关面板数据通道）
// ============================================================

interface EndpointDeps {
  cfg: MemoryConfig;
  stores: {
    l0: L0Store;
    l1: L1Store;
    scenes: Record<MemoryFamily, SceneStore>;
    persona: Record<MemoryFamily, PersonaStore>;
    state: StateStore;
  };
  status?: MemoryStatusSource;
  live?: LiveSettingsHandle;
  modes?: SessionModeStore;
  dataDir: string;
  logger: MemoryLogger;
  rebuild?: RebuildController;
}

async function handleEndpoint(endpoint: string, payload: unknown, deps: EndpointDeps): Promise<unknown> {
  const { cfg, stores, status, live, modes, dataDir, rebuild } = deps;
  switch (endpoint) {
    case 'dsh-memory/stats':
      return buildStats(cfg, stores, status);

    case 'dsh-memory/session-mode-get': {
      if (!modes) throw new Error('档位存储未初始化');
      const p = (payload ?? {}) as { sessionId?: string };
      if (typeof p.sessionId !== 'string' || !p.sessionId) throw new Error('sessionId 缺失');
      return { sessionId: p.sessionId, mode: modes.get(p.sessionId), defaultMode: modes.default };
    }

    case 'dsh-memory/session-mode-set': {
      if (!modes) throw new Error('档位存储未初始化');
      const p = (payload ?? {}) as { sessionId?: string; mode?: string };
      if (typeof p.sessionId !== 'string' || !p.sessionId) throw new Error('sessionId 缺失');
      const allowed: MemoryMode[] = ['auto', 'chat', 'work', 'off'];
      if (typeof p.mode !== 'string' || !allowed.includes(p.mode as MemoryMode)) {
        throw new Error(`非法档位: ${String(p.mode)}（允许 ${allowed.join('/')}）`);
      }
      modes.set(p.sessionId, p.mode as MemoryMode);
      deps.logger.info(`[memory] 会话档位设置 session=${p.sessionId} mode=${p.mode}`);
      return { sessionId: p.sessionId, mode: p.mode };
    }

    case 'dsh-memory/settings-get': {
      const s = live?.get();
      return {
        supported: live?.supported ?? false,
        settings: s ?? { enabled: true, capture: true, distill: true, recall: true, reasoningEffort: '' },
        // 静态部署上限（cordis.patch.yml）：运行时开关与它取 AND
        ceilings: { capture: cfg.capture.enabled, distill: cfg.extract.enabled, recall: cfg.recall.enabled },
        // 蒸馏思考档位：current 是运行时覆盖（'' = 跟随配置），effective 是实际生效值
        effort: {
          current: s?.reasoningEffort ?? '',
          effective: s?.reasoningEffort || cfg.llm.reasoningEffort,
          fallback: cfg.llm.reasoningEffort,
        },
      };
    }

    case 'dsh-memory/settings-set': {
      if (!live) throw new Error('开关通道未初始化');
      const patch = (payload ?? {}) as Record<string, unknown>;
      const clean: Record<string, boolean | string> = {};
      for (const key of ['enabled', 'capture', 'distill', 'recall'] as const) {
        if (typeof patch[key] === 'boolean') clean[key] = patch[key] as boolean;
      }
      if (patch.reasoningEffort !== undefined) {
        const v = String(patch.reasoningEffort);
        if (!['', 'off', 'high', 'max'].includes(v)) {
          throw new Error(`非法思考档位: ${v}（允许 ''/off/high/max）`);
        }
        clean.reasoningEffort = v;
      }
      if (Object.keys(clean).length === 0) throw new Error('开关更新载荷为空');
      await live.update(clean);
      deps.logger.info(`[memory] 设置更新：${JSON.stringify(clean)}`);
      return { ok: true, settings: live.get() };
    }

    case 'dsh-memory/list-records': {
      const p = (payload ?? {}) as { query?: string; type?: string; scene?: string; limit?: number; offset?: number };
      const limit = Math.min(Math.max(Number(p.limit) || 50, 1), 200);
      const offset = Math.max(Number(p.offset) || 0, 0);
      // 关键词路径：复用检索唯一缝（与召回同源），取回后做场景过滤 + 手工分页
      if (p.query && p.query.trim()) {
        const hits = await stores.l1.search(p.query, Math.min(offset + limit + 1, 200), { type: p.type || undefined });
        const filtered = p.scene ? hits.filter((h) => h.scene_name === p.scene) : hits;
        return {
          items: filtered.slice(offset, offset + limit).map(hitToUiRecord),
          hasMore: filtered.length > offset + limit,
          total: null,
          scenes: offset === 0 ? stores.l1.distinctScenes() : undefined,
        };
      }
      const { items, total } = stores.l1.list({ type: p.type || undefined, scene: p.scene || undefined, limit, offset });
      return {
        items: items.map(hitToUiRecord),
        hasMore: offset + items.length < total,
        total,
        scenes: offset === 0 ? stores.l1.distinctScenes() : undefined,
      };
    }

    case 'dsh-memory/scenes': {
      // 两族拼接展示（浏览器保持混合视图；路径冲突时后写入的族覆盖显示名，读取仍各自独立）
      const items = [];
      for (const family of ['chat', 'work'] as const) {
        const summaries = await stores.scenes[family].list();
        for (const s of summaries) {
          items.push({ path: s.path, family, summary: s.summary, updated: s.updated, heat: s.heat, content: (await stores.scenes[family].read(s.path)) ?? '' });
        }
      }
      items.sort((a, b) => (a.updated < b.updated ? 1 : -1));
      return { items };
    }

    case 'dsh-memory/persona': {
      const [chat, work] = await Promise.all([stores.persona.chat.read(), stores.persona.work.read()]);
      const parts: string[] = [];
      if (chat) parts.push(`<!-- family: chat -->\n${chat}`);
      if (work) parts.push(`<!-- family: work -->\n${work}`);
      return { content: parts.join('\n\n---\n\n') };
    }

    case 'dsh-memory/log-tail': {
      const p = (payload ?? {}) as { lines?: number };
      return { lines: readLogTail(join(dataDir, 'memory.log'), Math.min(Math.max(Number(p.lines) || 200, 1), 1000)) };
    }

    case 'dsh-memory/rebuild-status': {
      if (!rebuild) return { supported: false, running: false, phase: 'idle' };
      return rebuild.getStatus();
    }

    case 'dsh-memory/rebuild-start': {
      if (!rebuild) throw new Error('重建控制器未初始化（存储不可用）');
      if (status?.degraded()) throw new Error('存储处于降级状态，无法重建');
      const s = live?.get();
      if (s && (!s.enabled || !s.distill)) throw new Error('蒸馏开关已关闭，请先开启蒸馏再重建');
      if (!cfg.extract.enabled) throw new Error('部署配置已停用蒸馏（extract.enabled=false），无法重建');
      const result = rebuild.start();
      deps.logger.info('[memory] 收到重建指令（设置页按钮）');
      return result;
    }

    case 'dsh-memory/rebuild-cancel': {
      if (!rebuild) throw new Error('重建控制器未初始化');
      return rebuild.requestCancel();
    }

    default:
      throw new Error(`unknown endpoint: ${endpoint}`);
  }
}

/** 浏览器卡片字段（比 MemoryRecord 精简，去掉大 metadata）。 */
function hitToUiRecord(r: { id: string; content: string; type: string; priority?: number; scene_name: string; timestamps?: number[]; createdAt?: number; updatedAt?: number; version?: number; source_message_ids?: string[]; score?: number; family?: string }): Record<string, unknown> {
  return {
    id: r.id,
    content: r.content,
    type: r.type,
    priority: r.priority ?? 60,
    scene: r.scene_name,
    family: r.family ?? null,
    timestamps: (r.timestamps ?? []).map((t) => new Date(t).toISOString()),
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    version: r.version ?? 0,
    sourceMessageIds: r.source_message_ids ?? [],
    score: r.score ?? null,
  };
}

/** 读日志尾部（文件有 2MB 轮转上限，全量读后取尾部即可）。 */
function readLogTail(logPath: string, maxLines: number): string[] {
  try {
    void statSync(logPath);
    const lines = (readFileSync(logPath, 'utf8') as string).split('\n').filter((l) => l.length > 0);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}
