/**
 * 状态面板数据通道：Host 侧注册 /rpc 通道的 dsh-memory/stats 端点，
 * Client 设置页通过 ctx.connection.rpc.call('/rpc', 'dsh-memory/stats') 拉取。
 *
 * connection 是可选服务且可能晚于本插件就绪：先探测一次，未就绪则监听
 * internal/service（事件携带 (name, impl)，impl=undefined 即下线），服务
 * 上线、下线、替换实例三种迁移都会正确释放/重挂 RPC 注册。
 */
import { createRequire } from 'node:module';
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EFFORT_CHOICES, resolveDataDir } from './config.js';
import { effectiveCfg } from './pipeline/runner.js';
import { emptyRecallStats } from './hooks/recall.js';
import { buildRouteChain, decideSendableEffort, LAYER_DEFAULT_BUDGETS, resolveModelContextWindow, resolveModelEfforts, resolveModelRoute } from './llm.js';
import { projectDistillChain, validateDistillChain } from './settings.js';
import { errDetail } from './util/filelog.js';
import { snapshotTokenCost } from './token-cost.js';
const require = createRequire(import.meta.url);
export const PLUGIN_VERSION = require('../package.json').version;
/** 注册状态 RPC（web 侧 connection 服务可选，缺失时跳过，不影响插件主体）。 */
export function registerMemoryRpc(ctx, cfg, stores, logger, status, live, modes, dataDir, rebuild, embedManager, sessionInfo) {
    /** 当前是否持有一段有效注册（dispose 完成后清空，允许服务重上线时重注册）。 */
    let holding = false;
    /** 当前 handle 绑定的 connection 实例（internal/service 第二参；用于识别实例替换）。 */
    let registeredImpl;
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
                    ctx,
                    cfg,
                    stores,
                    status,
                    live,
                    modes,
                    dataDir: dataDir ?? resolveDataDir(cfg),
                    logger,
                    rebuild,
                    embedManager,
                    sessionInfo,
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
    const release = () => {
        for (const dispose of disposers.splice(0))
            dispose();
    };
    const disposers = [];
    ctx.effect(() => {
        tryRegister();
        const off = ctx.on('internal/service', (name, impl) => {
            if (name !== 'connection')
                return;
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
        thresholds: { l2MinNewMemories: cfg.l2.minNewMemories, l3Interval: cfg.l3.interval },
    };
}
/** RPC 字符串入参上限校验：防 loopback 面畸形超长载荷
 *  （超长 sessionId 持久化进 session-modes.json / 超长 query 触发 jieba 全量分词 CPU 峰值）。 */
function expectSessionId(v) {
    if (typeof v !== 'string' || !v)
        throw new Error('sessionId 缺失');
    if (v.length > 512)
        throw new Error('sessionId 过长（≤512 字符）');
    return v;
}
async function handleEndpoint(endpoint, payload, deps) {
    const { cfg, stores, status, live, modes, dataDir, rebuild, embedManager, sessionInfo } = deps;
    switch (endpoint) {
        case 'dsh-memory/stats':
            return buildStats(cfg, stores, status);
        case 'dsh-memory/token-cost': {
            const p = (payload ?? {});
            const granularity = p.granularity === 'week' || p.granularity === 'month' ? p.granularity : 'day';
            // rangeDays 须为正整数且不超过明细保留期（tokenCost.retentionDays，0=永久保留则放行 1~3650），否则回退默认窗口
            const retention = cfg.tokenCost.retentionDays;
            const upper = retention > 0 ? retention : 3650;
            const rawDays = p.rangeDays;
            const rangeDays = typeof rawDays === 'number' && Number.isInteger(rawDays) && rawDays > 0 && rawDays <= upper ? rawDays : 0;
            return snapshotTokenCost(granularity, rangeDays);
        }
        case 'dsh-memory/session-mode-get': {
            if (!modes)
                throw new Error('档位存储未初始化');
            const p = (payload ?? {});
            const sessionId = expectSessionId(p.sessionId);
            const v = { sessionId, mode: modes.get(sessionId), defaultMode: modes.default };
            return v;
        }
        case 'dsh-memory/session-mode-set': {
            if (!modes)
                throw new Error('档位存储未初始化');
            const p = (payload ?? {});
            const sessionId = expectSessionId(p.sessionId);
            const allowed = ['auto', 'chat', 'work', 'off'];
            if (typeof p.mode !== 'string' || !allowed.includes(p.mode)) {
                throw new Error(`非法档位: ${String(p.mode)}（允许 ${allowed.join('/')}）`);
            }
            modes.set(sessionId, p.mode);
            deps.logger.info(`[memory] 会话档位设置 session=${sessionId} mode=${p.mode}`);
            const v = { sessionId, mode: p.mode };
            return v;
        }
        // ── 会话级统计（悬浮卡信息区；热路径端点，见 SessionInfoSource 的零 I/O 硬规则） ──
        case 'dsh-memory/session-stats': {
            if (!sessionInfo)
                return { supported: false };
            const p = (payload ?? {});
            const sessionId = expectSessionId(p.sessionId);
            const mode = modes ? modes.get(sessionId) : 'auto';
            const caps = sessionInfo.capabilities();
            const l0Count = await sessionInfo.l0Count(sessionId);
            const s = live?.get();
            const recallOn = cfg.recall.enabled && (s?.recall ?? true) && mode !== 'off';
            const view = sessionInfo.runnerView(sessionId, mode);
            // lastDistillAt 统一转 ISO（与 global.lastExtractAt 口径一致，client 直接 fmtAgo）
            const distillView = { ...view, lastDistillAt: view.lastDistillAt ? new Date(view.lastDistillAt).toISOString() : null };
            const chat = stores.state.forFamily('chat');
            const work = stores.state.forFamily('work');
            const lastAt = Math.max(chat.lastExtractAt, work.lastExtractAt);
            // 主对话模型的官方声明窗口（占用指示器分母；advisory 查询读本地快照且有缓存，
            // 轮询热路径下稳态为 Map 命中——遵守本端点"只许内存注册表读取"的硬规则口径。
            // race 封顶防第三方适配器 resolveModelInfo 挂起拖死轮询——llm-models 端点同款先例）
            let contextWindowTokens = null;
            try {
                const sel = deps.ctx.get('agentDefaultModel')?.currentSelection?.();
                if (sel?.provider && sel?.model) {
                    contextWindowTokens = await Promise.race([
                        resolveModelContextWindow(deps.ctx, sel.provider, sel.model),
                        new Promise((resolve) => setTimeout(() => resolve(null), 3_000)),
                    ]);
                }
            }
            catch {
                /* 可选服务缺失/解析失败 = 分母未知，UI 降级 */
            }
            const v = {
                supported: true,
                sessionId,
                mode,
                defaultMode: modes?.default ?? cfg.family,
                recall: { enabled: recallOn, ...(sessionInfo.recallStats(sessionId) ?? emptyRecallStats()) },
                memoryOccupancy: sessionInfo.memoryOccupancy(sessionId),
                contextWindowTokens,
                distill: distillView,
                l0Count,
                retrieval: caps.vectorSearch ? (caps.ftsSearch ? 'hybrid' : 'vector') : caps.ftsSearch ? 'keyword' : 'none',
                global: {
                    degraded: status?.degraded() ?? false,
                    pendingTotal: status?.pending() ?? 0,
                    lastExtractAt: lastAt ? new Date(lastAt).toISOString() : null,
                },
            };
            return v;
        }
        case 'dsh-memory/settings-get': {
            const s = live?.get();
            const budgets = s?.distillBudgets ?? { extract: 0, dedup: 0, l2: 0, l3: 0 };
            // 蒸馏思考档位：current 是运行时值（'' = 自动）；effective 是能力探询后实际发送值
            // （'' = 不传，跟随模型默认）；options 是当前生效模型声明的档位表（空声明 → 只显示
            // high，用户规则：无声明默认 high），fallback 是静态部署值。注：旧「蒸馏思考」
            // 选择器已删，本块保留给旧 client 版本与 smoke 兼容；新 UI（路由链编辑器）
            // 的逐行档位词表走 llm-models 的 efforts 字段
            let effortEffective = s?.reasoningEffort || cfg.llm.reasoningEffort;
            let effortOptions = ['high'];
            let effortRoute = null;
            try {
                const ecfg = effectiveCfg(cfg, live);
                effortRoute = await resolveModelRoute(deps.ctx, ecfg);
                const cap = await resolveModelEfforts(deps.ctx, effortRoute.provider, effortRoute.model);
                if (cap) {
                    effortEffective = decideSendableEffort(cap, ecfg.llm.reasoningEffort).effort;
                    if (cap.efforts.length > 0)
                        effortOptions = cap.efforts;
                }
            }
            catch {
                /* 路由解析/探询失败保持占位（effective 用运行时||静态值） */
            }
            const resp = {
                supported: live?.supported ?? false,
                settings: s ?? {
                    enabled: true, capture: true, distill: true, recall: true,
                    reasoningEffort: '', distillProvider: '', distillModel: '', distillChain: [],
                    distillBudgets: { extract: 0, dedup: 0, l2: 0, l3: 0 }, distillMaxInputChars: 0,
                },
                // 静态部署上限（cordis.patch.yml）：运行时开关与它取 AND
                ceilings: { capture: cfg.capture.enabled, distill: cfg.extract.enabled, recall: cfg.recall.enabled },
                effort: {
                    current: s?.reasoningEffort ?? '',
                    // 静态 schema 与 settings-set 写入门都以 EFFORT_CHOICES 白名单校验，这里断言回窄类型
                    effective: effortEffective,
                    fallback: cfg.llm.reasoningEffort,
                    options: effortOptions,
                    ...(effortRoute ? { route: effortRoute } : {}),
                },
                // 分层输出预算：current 是运行时覆盖（0 = 跟随默认），defaults 是内置默认（UI 占位/提示用）
                budgets: {
                    current: budgets,
                    defaults: { ...LAYER_DEFAULT_BUDGETS },
                    effective: {
                        extract: budgets.extract > 0 ? budgets.extract : LAYER_DEFAULT_BUDGETS.extract,
                        dedup: budgets.dedup > 0 ? budgets.dedup : LAYER_DEFAULT_BUDGETS.dedup,
                        l2: budgets.l2 > 0 ? budgets.l2 : LAYER_DEFAULT_BUDGETS.l2,
                        l3: budgets.l3 > 0 ? budgets.l3 : LAYER_DEFAULT_BUDGETS.l3,
                    },
                },
                // 输入预算（字符）：current 是运行时覆盖（0 = 跟随配置），fallback 是静态配置值
                inputBudget: {
                    current: s?.distillMaxInputChars ?? 0,
                    fallback: cfg.llm.maxInputChars,
                    effective: s && s.distillMaxInputChars > 0 ? s.distillMaxInputChars : cfg.llm.maxInputChars,
                },
            };
            return resp;
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
            // 运行时统一路由链：结构校验后整体写入（空数组 = 回到跟随部署配置）
            if (patch.distillChain !== undefined) {
                const err = validateDistillChain(patch.distillChain);
                if (err)
                    throw new Error(err);
                clean.distillChain = patch.distillChain;
            }
            if (patch.reasoningEffort !== undefined) {
                const v = String(patch.reasoningEffort);
                // 白名单与 schema/settings 同源（config.ts EFFORT_CHOICES）——此前此处漏扩词表，
                // 设置页新词汇（none/minimal/low/medium/xhigh）被拒并回滚
                if (!EFFORT_CHOICES.includes(v)) {
                    throw new Error(`非法思考档位: ${v}（允许 '' 或 ${EFFORT_CHOICES.filter((x) => x !== '').join('/')}）`);
                }
                clean.reasoningEffort = v;
            }
            // 蒸馏模型运行时覆盖：供应商/模型 id 原样接受（不在此校验存在性——
            // 供应商可被用户随后删除，解析侧按存在性回退并提示）
            for (const key of ['distillProvider', 'distillModel']) {
                if (patch[key] !== undefined) {
                    const v = String(patch[key]);
                    if (v.length > 200)
                        throw new Error(`${key} 过长（≤200 字符）`);
                    clean[key] = v;
                }
            }
            // 分层输出预算：四键一起校验，非负整数 ≤ 100 万；0 = 跟随内置默认
            if (patch.distillBudgets !== undefined) {
                const raw = (patch.distillBudgets ?? {});
                const budgets = {};
                for (const key of ['extract', 'dedup', 'l2', 'l3']) {
                    const n = Number(raw[key] ?? 0);
                    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
                        throw new Error(`distillBudgets.${key} 须为 0~1000000 的整数（0 = 跟随默认）`);
                    }
                    budgets[key] = n;
                }
                clean.distillBudgets = budgets;
            }
            // 输入预算（字符）：0 = 跟随静态配置；正值须落在静态 schema 同款范围（1000~100 万）
            if (patch.distillMaxInputChars !== undefined) {
                const n = Number(patch.distillMaxInputChars);
                if (!Number.isInteger(n) || n < 0 || n > 1_000_000 || (n > 0 && n < 1000)) {
                    throw new Error('distillMaxInputChars 须为 0 或 1000~1000000 的整数（0 = 跟随配置）');
                }
                clean.distillMaxInputChars = n;
            }
            if (Object.keys(clean).length === 0)
                throw new Error('开关更新载荷为空');
            await live.update(clean);
            deps.logger.info(`[memory] 设置更新：${JSON.stringify(clean)}`);
            const v = { ok: true, settings: live.get() };
            return v;
        }
        case 'dsh-memory/list-records': {
            const p = (payload ?? {});
            if (p.query !== undefined && p.query.length > 4096)
                throw new Error('query 过长（≤4096 字符）');
            const limit = Math.min(Math.max(Number(p.limit) || 50, 1), 200);
            const offset = Math.min(Math.max(Number(p.offset) || 0, 0), 1_000_000);
            // 关键词路径：复用检索唯一缝（与召回同源），取回后做场景过滤 + 手工分页。
            // 检索侧单次上限 200：分页窗口触达上限时显式标记 truncated（结果可能不完整），
            // 不再静默返回空结果让用户误以为"没有更多"等于"不存在更多"。
            if (p.query && p.query.trim()) {
                const SEARCH_CAP = 200;
                const wanted = offset + limit + 1;
                const hits = await stores.l1.search(p.query, Math.min(wanted, SEARCH_CAP), { type: p.type || undefined });
                const filtered = p.scene ? hits.filter((h) => h.scene_name === p.scene) : hits;
                const resp = {
                    items: filtered.slice(offset, offset + limit).map(hitToUiRecord),
                    hasMore: filtered.length > offset + limit,
                    total: null,
                    truncated: wanted > SEARCH_CAP,
                    scenes: offset === 0 ? stores.l1.distinctScenes() : undefined,
                };
                return resp;
            }
            const { items, total } = stores.l1.list({ type: p.type || undefined, scene: p.scene || undefined, limit, offset });
            const resp = {
                items: items.map(hitToUiRecord),
                hasMore: offset + items.length < total,
                total,
                truncated: false,
                scenes: offset === 0 ? stores.l1.distinctScenes() : undefined,
            };
            return resp;
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
            if (!rebuild) {
                const v = { supported: false, running: false, phase: 'idle' };
                return v;
            }
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
        // ── 蒸馏模型选择器（用户已配置的供应商路由） ──
        case 'dsh-memory/llm-providers': {
            // 供应商目录（已注册适配器的活动路由）+ 默认选择 + 当前覆盖与实际生效路由
            // ——蒸馏路由链编辑器的数据源（供应商下拉/默认模型展示/链状态 chain 块）
            let providers = [];
            try {
                providers = deps.ctx.llm.listProviders();
            }
            catch (err) {
                deps.logger.warn(`[memory] 供应商列表读取失败: ${errDetail(err)}`);
            }
            let def = null;
            try {
                const sel = deps.ctx.get('agentDefaultModel')?.currentSelection?.();
                if (sel?.provider && sel?.model)
                    def = { provider: sel.provider, model: sel.model };
            }
            catch {
                /* 可选服务缺失 = 无默认选择 */
            }
            const s = live?.get();
            const current = { provider: s?.distillProvider ?? '', model: s?.distillModel ?? '' };
            // 统一路由链块：current = 运行时链（含旧键投影）；static = 部署静态回退链；
            // effective = buildRouteChain 语义的实际链（主路由 + 有效条目去重，每条带档位候选）；
            // source 标记当前链来自运行时还是部署静态（UI 的跟随态/接管态判定）
            const chainCurrent = projectDistillChain(s);
            let effectiveChain = [];
            let effective = null;
            try {
                const cfgView = effectiveCfg(cfg, live);
                effective = await resolveModelRoute(deps.ctx, cfgView);
                effectiveChain = buildRouteChain({ provider: effective.provider, model: effective.model, effort: cfgView.llm.primaryEffort || '' }, cfgView.llm.fallbacks, cfgView.llm.reasoningEffort);
            }
            catch {
                effective = null; // 无法解析（无默认选择且未覆盖）时 UI 显示占位
            }
            const resp = {
                supported: true,
                providers,
                default: def,
                // 部署静态 pin（provider+model 双字段）优先于运行时选择，UI 据此禁用选择器
                pinned: Boolean(cfg.llm.provider && cfg.llm.model),
                current,
                // 所选供应商是否仍在已注册路由中（用户删掉供应商后提示回退）
                currentRegistered: current.provider === '' || providers.some((p) => p.id === current.provider),
                effective,
                chain: {
                    current: chainCurrent,
                    static: cfg.llm.fallbacks ?? [],
                    effectiveChain,
                    source: chainCurrent.length ? 'runtime' : 'static',
                },
            };
            return resp;
        }
        case 'dsh-memory/llm-models': {
            const p = (payload ?? {});
            if (typeof p.provider !== 'string' || !p.provider)
                throw new Error('provider 缺失');
            if (p.provider.length > 200)
                throw new Error('provider 过长（≤200 字符）');
            // 两个内置适配器（deepseek/pi-ai）的 listModels 都读本地快照不触网；
            // 仍加超时兜底，防第三方适配器实现为远端查询拖死 RPC 轮询
            const models = await Promise.race([
                deps.ctx.llm.listModels(p.provider),
                new Promise((_, reject) => setTimeout(() => reject(new Error('模型列表查询超时')), 8000)),
            ]);
            // 每个模型附思考档位能力表（resolveModelInfo 复用 effortCache，本地快照不触
            // 网）：统一路由链编辑器的逐行档位下拉数据源。整体限时限流——第三方适配器的
            // resolveModelInfo 若为远端查询会拖死端点（client 5s 轮询放大），超时降级空表
            // （探询失败/未声明同样 → 空表，UI 只显示「跟随部署配置」）
            const baseModels = models.map((m) => ({ id: m.id, name: m.name, description: m.description ?? null, efforts: [] }));
            const providerId = p.provider;
            const withEfforts = await Promise.race([
                (async () => {
                    const out = [];
                    for (const m of models) {
                        let efforts = [];
                        try {
                            efforts = (await resolveModelEfforts(deps.ctx, providerId, m.id))?.efforts ?? [];
                        }
                        catch {
                            efforts = [];
                        }
                        out.push({ id: m.id, name: m.name, description: m.description ?? null, efforts });
                    }
                    return out;
                })(),
                new Promise((resolve) => setTimeout(() => resolve(baseModels), 4000)),
            ]);
            const resp = { provider: p.provider, models: withEfforts };
            return resp;
        }
        // ── 嵌入源（远程/本地/关闭 三态）与模型管理 ──
        case 'dsh-memory/embedding-state-get': {
            if (!embedManager) {
                const v = { supported: false };
                return v;
            }
            const v = { supported: true, ...(await embedManager.snapshot()) };
            return v;
        }
        case 'dsh-memory/embedding-source-set': {
            if (!embedManager)
                throw new Error('嵌入管理器未初始化（存储不可用）');
            const p = (payload ?? {});
            if (p.source !== 'remote' && p.source !== 'local' && p.source !== 'off') {
                throw new Error('source 必须是 remote | local | off');
            }
            if (typeof p.activeModel === 'string' && p.activeModel.length > 200) {
                throw new Error('activeModel 过长（≤200 字符）');
            }
            const r = embedManager.requestSource({ source: p.source, activeModel: p.activeModel ?? null });
            if (!r.accepted)
                throw new Error(r.error ?? '切换请求被拒绝');
            deps.logger.info(`[memory] 收到嵌入源切换指令（source=${p.source}${p.activeModel ? '，model=' + p.activeModel : ''}）`);
            return { accepted: true };
        }
        case 'dsh-memory/embedding-download-start': {
            if (!embedManager)
                throw new Error('嵌入管理器未初始化（存储不可用）');
            const p = (payload ?? {});
            if (typeof p.modelId !== 'string' || !p.modelId)
                throw new Error('modelId 缺失');
            const r = embedManager.startDownload(p.modelId);
            if (!r.ok)
                throw new Error(r.error ?? '下载请求被拒绝');
            deps.logger.info(`[memory] 收到模型下载指令（${p.modelId}）`);
            return { accepted: true };
        }
        case 'dsh-memory/embedding-download-cancel': {
            if (!embedManager)
                throw new Error('嵌入管理器未初始化');
            return { cancelled: embedManager.cancelDownload() };
        }
        case 'dsh-memory/embedding-model-delete': {
            if (!embedManager)
                throw new Error('嵌入管理器未初始化');
            const p = (payload ?? {});
            if (typeof p.modelId !== 'string' || !p.modelId)
                throw new Error('modelId 缺失');
            return embedManager.deleteModel(p.modelId);
        }
        case 'dsh-memory/embedding-runtime-cancel': {
            if (!embedManager)
                throw new Error('嵌入管理器未初始化');
            return { cancelled: embedManager.cancelRuntimeInstall() };
        }
        case 'dsh-memory/embedding-reindex-cancel': {
            if (!embedManager)
                throw new Error('嵌入管理器未初始化');
            return { cancelled: embedManager.cancelReindex() };
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
/**
 * 从文件尾反向分块读取最后 N 行：不整读全文件（轮转上限 2MB，整读会
 * 阻塞事件循环数毫秒）。原始 Buffer 拼接后再解码——分块边界可能切在
 * UTF-8 多字节字符中间，先 toString 再拼接会产生乱码替换符。
 */
function readLogTail(logPath, maxLines) {
    let fd;
    try {
        fd = openSync(logPath, 'r');
        const { size } = statSync(logPath);
        const CHUNK = 64 * 1024;
        const bufs = [];
        let newlines = 0;
        let pos = size;
        while (pos > 0) {
            const read = Math.min(CHUNK, pos);
            pos -= read;
            const buf = Buffer.alloc(read);
            readSync(fd, buf, 0, read, pos);
            bufs.unshift(buf);
            // \n 是完整单字节，绝不会出现在 UTF-8 续字节里——按字节计数跨块安全
            for (let i = 0; i < buf.length; i++)
                if (buf[i] === 0x0a)
                    newlines++;
            if (newlines > maxLines)
                break;
        }
        const lines = Buffer.concat(bufs).toString('utf8').split('\n').filter((l) => l.length > 0);
        return lines.slice(-maxLines);
    }
    catch {
        return [];
    }
    finally {
        if (fd !== undefined) {
            try {
                closeSync(fd);
            }
            catch {
                /* ignore */
            }
        }
    }
}
