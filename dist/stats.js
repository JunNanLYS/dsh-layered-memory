/**
 * 状态面板数据通道：Host 侧注册 /rpc 通道的 dsh-memory/stats 端点，
 * Client 设置页通过 ctx.connection.rpc.call('/rpc', 'dsh-memory/stats') 拉取。
 *
 * connection 是可选服务且可能晚于本插件就绪：先探测一次，未就绪则监听
 * internal/service，服务上线时再注册（服务消失又回来时也能重注册）。
 */
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDataDir } from './config.js';
const require = createRequire(import.meta.url);
export const PLUGIN_VERSION = require('../package.json').version;
/** 注册状态 RPC（web 侧 connection 服务可选，缺失时跳过，不影响插件主体）。 */
export function registerMemoryRpc(ctx, cfg, stores, logger, status, live, modes, dataDir, rebuild) {
    /** 当前是否持有一段有效注册（dispose 完成后清空，允许服务重上线时重注册）。 */
    let holding = false;
    const tryRegister = () => {
        if (holding)
            return;
        const connection = ctx.get('connection');
        if (!connection)
            return;
        holding = true;
        let active = true;
        // handle() 同步注册并返回异步 disposer（() => Promise<void>）。
        const dispose = connection.rpc.handle('/rpc', async (endpoint, payload) => {
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
            }
            catch (err) {
                return {
                    ok: false,
                    error: { code: 'internal', message: err instanceof Error ? err.message : String(err), details: {} },
                };
            }
        }, { authority: 'loopback' });
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
    const disposers = [];
    ctx.effect(() => {
        tryRegister();
        const off = ctx.on('internal/service', (name) => {
            if (name === 'connection')
                tryRegister();
        });
        return () => {
            off();
            for (const dispose of disposers.splice(0))
                dispose();
        };
    });
}
async function buildStats(cfg, stores, status) {
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
    const max = (a, b) => Math.max(a, b);
    const iso = (t) => (t ? new Date(t).toISOString() : null);
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
    };
}
async function handleEndpoint(endpoint, payload, deps) {
    const { cfg, stores, status, live, modes, dataDir, rebuild } = deps;
    switch (endpoint) {
        case 'dsh-memory/stats':
            return buildStats(cfg, stores, status);
        case 'dsh-memory/session-mode-get': {
            if (!modes)
                throw new Error('档位存储未初始化');
            const p = (payload ?? {});
            if (typeof p.sessionId !== 'string' || !p.sessionId)
                throw new Error('sessionId 缺失');
            return { sessionId: p.sessionId, mode: modes.get(p.sessionId), defaultMode: modes.default };
        }
        case 'dsh-memory/session-mode-set': {
            if (!modes)
                throw new Error('档位存储未初始化');
            const p = (payload ?? {});
            if (typeof p.sessionId !== 'string' || !p.sessionId)
                throw new Error('sessionId 缺失');
            const allowed = ['auto', 'chat', 'work', 'off'];
            if (typeof p.mode !== 'string' || !allowed.includes(p.mode)) {
                throw new Error(`非法档位: ${String(p.mode)}（允许 ${allowed.join('/')}）`);
            }
            modes.set(p.sessionId, p.mode);
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
            if (!live)
                throw new Error('开关通道未初始化');
            const patch = (payload ?? {});
            const clean = {};
            for (const key of ['enabled', 'capture', 'distill', 'recall']) {
                if (typeof patch[key] === 'boolean')
                    clean[key] = patch[key];
            }
            if (patch.reasoningEffort !== undefined) {
                const v = String(patch.reasoningEffort);
                if (!['', 'off', 'high', 'max'].includes(v)) {
                    throw new Error(`非法思考档位: ${v}（允许 ''/off/high/max）`);
                }
                clean.reasoningEffort = v;
            }
            if (Object.keys(clean).length === 0)
                throw new Error('开关更新载荷为空');
            await live.update(clean);
            deps.logger.info(`[memory] 设置更新：${JSON.stringify(clean)}`);
            return { ok: true, settings: live.get() };
        }
        case 'dsh-memory/list-records': {
            const p = (payload ?? {});
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
            for (const family of ['chat', 'work']) {
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
            const parts = [];
            if (chat)
                parts.push(`<!-- family: chat -->\n${chat}`);
            if (work)
                parts.push(`<!-- family: work -->\n${work}`);
            return { content: parts.join('\n\n---\n\n') };
        }
        case 'dsh-memory/log-tail': {
            const p = (payload ?? {});
            return { lines: readLogTail(join(dataDir, 'memory.log'), Math.min(Math.max(Number(p.lines) || 200, 1), 1000)) };
        }
        case 'dsh-memory/rebuild-status': {
            if (!rebuild)
                return { supported: false, running: false, phase: 'idle' };
            return rebuild.getStatus();
        }
        case 'dsh-memory/rebuild-start': {
            if (!rebuild)
                throw new Error('重建控制器未初始化（存储不可用）');
            if (status?.degraded())
                throw new Error('存储处于降级状态，无法重建');
            const s = live?.get();
            if (s && (!s.enabled || !s.distill))
                throw new Error('蒸馏开关已关闭，请先开启蒸馏再重建');
            if (!cfg.extract.enabled)
                throw new Error('部署配置已停用蒸馏（extract.enabled=false），无法重建');
            const result = rebuild.start();
            deps.logger.info('[memory] 收到重建指令（设置页按钮）');
            return result;
        }
        case 'dsh-memory/rebuild-cancel': {
            if (!rebuild)
                throw new Error('重建控制器未初始化');
            return rebuild.requestCancel();
        }
        default:
            throw new Error(`unknown endpoint: ${endpoint}`);
    }
}
/** 浏览器卡片字段（比 MemoryRecord 精简，去掉大 metadata）。 */
function hitToUiRecord(r) {
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
function readLogTail(logPath, maxLines) {
    try {
        void statSync(logPath);
        const lines = readFileSync(logPath, 'utf8').split('\n').filter((l) => l.length > 0);
        return lines.slice(-maxLines);
    }
    catch {
        return [];
    }
}
