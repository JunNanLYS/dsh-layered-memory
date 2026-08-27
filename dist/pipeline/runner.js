import { resolveDataDir } from '../config.js';
import { emptyPending, freshWarmup, groupPendingBySession, loadPending, PENDING_MODES, pendingPathFor, savePending, } from '../store/pending.js';
import { errDetail } from '../util/filelog.js';
import { advanceWarmupThreshold, effectiveExtractThreshold, extractionBackoffMs, idleSessionsToFlush, modeSwitchAction, pickSessionBackground, } from './trigger.js';
import { runExtraction } from './l1.js';
import { runSceneConsolidation } from './l2.js';
import { runPersona } from './l3.js';
/** 选取下一个要执行的任务下标：最早的 live 优先，否则队首（rebuild 分块让位）。 */
export function pickNextTaskIndex(tasks) {
    for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].kind === 'live')
            return i;
    }
    return 0;
}
/**
 * 运行时调参视图：设置页运行时链（distillChain）与旧单路由/档位键、分层输出预算
 * 可临时覆盖静态 config（空串/0 回退静态 config / 内置默认）。浅拷贝只覆盖 llm
 * 一层，其余键与原 cfg 共享只读引用；pipeline 全链继续收 cfg，无需感知。
 *
 * 蒸馏模型覆盖优先级：部署静态 pin（cfg.llm.provider+model 双字段齐）不可被
 * 运行时覆盖（部署可强制蒸馏走内网路由，防用户选择把对话外送）；未 pin 时
 * 运行时选择（distillProvider+distillModel 成对）生效；再退 agentDefaultModel。
 * 输出预算无部署上限语义：非零运行时值直接注入 cfg.llm.budgets（0/缺省不注入）。
 */
export function effectiveCfg(cfg, live) {
    const s = live?.get();
    // 思考档位：设置服务在场时运行时值整体接管——'' = 自动（按模型能力解析），
    // 不再回退静态配置（"跟随配置"选项已删）；静态值仅无 settings 服务的部署生效。
    // 统一路由链模式下（chain 非空）旧档位键不再参与：链内每条路由自带档位候选
    const eff = s?.reasoningEffort ?? '';
    // 可选链防御：smoke/测试缝构造的最小 cfg 可能没有 llm 字段
    const pinned = Boolean(cfg.llm?.provider && cfg.llm?.model);
    // 运行时统一路由链：**只认显式 distillChain**（非空即权威——主路由档位走
    // primaryEffort、条目档位随链注入 fallbacks、旧键与全局档位接管让位）；
    // 未配置链时旧键（distillProvider/distillModel/reasoningEffort）走下方完全
    // 不变的旧路径——旧存量值的语义一个比特都不动（projectDistillChain 只是
    // llm-providers 的 UI 展示视图，不参与生效逻辑）。
    // pinned 时链整体失效（部署锁定路由，链编辑器只读）
    const chain = s?.distillChain?.length ? s.distillChain : [];
    const chainMode = chain.length > 0 && !pinned;
    const chainEffort = chainMode && chain[0].reasoningEffort ? chain[0].reasoningEffort : null;
    // 链非空即整体接管：回退链以运行时链为准（slice(1)），**单行链 = 显式无回退**
    // （空数组覆盖静态 cfg.llm.fallbacks——"UI 所见即所跑"，审查修复的语义不对称：
    // 此前单显式行不清静态、单空主路由行清静态，同一意图两种表达）
    const chainFallbacks = chainMode
        ? chain.slice(1).map((e) => ({ provider: e.provider, model: e.model, reasoningEffort: e.reasoningEffort || '' }))
        : null;
    const override = chainMode && chain[0].provider && chain[0].model
        ? { provider: chain[0].provider, model: chain[0].model }
        : !chain.length && s && !pinned && s.distillProvider && s.distillModel
            ? { provider: s.distillProvider, model: s.distillModel }
            : null;
    const b = s?.distillBudgets;
    const budgets = b && (b.extract > 0 || b.dedup > 0 || b.l2 > 0 || b.l3 > 0)
        ? {
            ...(b.extract > 0 ? { extract: b.extract } : {}),
            ...(b.dedup > 0 ? { dedup: b.dedup } : {}),
            ...(b.l2 > 0 ? { l2: b.l2 } : {}),
            ...(b.l3 > 0 ? { l3: b.l3 } : {}),
        }
        : null;
    // 运行时按层路由链（#34）：非空层链逐层注入 layerChainsRuntime（解析侧层内第一
    // 优先级）；pinned = 部署锁，运行时层链与运行时全局链一并失效（同 chainMode 的
    // pinned 处理）；全部层为空 = 无注入（返回引用不变路径不受影响）
    const lc = s?.distillLayerChains;
    const layerChains = lc && !pinned && (lc.l1.length || lc.l2.length || lc.l3.length)
        ? {
            ...(lc.l1.length ? { l1: lc.l1 } : {}),
            ...(lc.l2.length ? { l2: lc.l2 } : {}),
            ...(lc.l3.length ? { l3: lc.l3 } : {}),
        }
        : null;
    const maxInput = s && s.distillMaxInputChars > 0 ? s.distillMaxInputChars : null;
    // 旧档位键的全局接管（含给静态回退条目盖章）：仅非链模式保留（旧存量值兼容）
    const fallbacksTakeover = !chainMode && eff && cfg.llm?.fallbacks?.length
        ? cfg.llm.fallbacks.map((f) => ({ ...f, reasoningEffort: eff }))
        : null;
    // 档位注入：链模式下不走全局接管（主路由档位走 primaryEffort、条目档位在链内，
    // 空档位条目回退的是静态全局而非运行时旧键）；非链模式保持旧整体接管语义
    const effortInject = live && !chainMode && (eff !== '' || Boolean(cfg.llm?.reasoningEffort))
        ? { reasoningEffort: eff }
        : null;
    if (!override && !budgets && !maxInput && !fallbacksTakeover && !chainEffort && !chainFallbacks && !effortInject && !layerChains)
        return cfg;
    return {
        ...cfg,
        llm: {
            ...cfg.llm,
            ...(effortInject ?? {}),
            ...(override ?? {}),
            ...(budgets ? { budgets } : {}),
            ...(maxInput ? { maxInputChars: maxInput } : {}),
            ...(fallbacksTakeover ? { fallbacks: fallbacksTakeover } : {}),
            ...(chainEffort ? { primaryEffort: chainEffort } : {}),
            ...(chainFallbacks ? { fallbacks: chainFallbacks } : {}),
            ...(layerChains ? { layerChainsRuntime: layerChains } : {}),
        },
    };
}
/** 单桶堆积上限（防无限堆积；重建分块不受限——历史会话需全量入桶蒸馏）。 */
const PENDING_BUCKET_CAP = 200;
/** 会话产出记账表容量上限（超出淘汰最久未蒸馏会话；悬浮卡信息区数据源防泄漏）。 */
const SESSION_PRODUCED_CAP = 400;
/** 启动补跑延迟：避开宿主启动期忙乱。 */
const STARTUP_RETRY_DELAY_MS = 20_000;
/** 闲置扫描 tick 粒度（实际落袋延迟 = idleSeconds + 至多一个 tick）。 */
const IDLE_TICK_MS = 30_000;
export class MemoryRunner {
    ctx;
    cfg;
    stores;
    logger;
    live;
    modes;
    tasks = [];
    draining = false;
    /** 停止标志（dispose 序置位）：不再取新任务；进行中任务自然收尾，其 DB 写入失败由各层兜底捕获。 */
    stopped = false;
    pending = emptyPending();
    /** 各档位桶渐进阈值（1 起步翻倍至稳态毕业；ADR-0003，随 pending.json 持久化）。 */
    warmup = freshWarmup();
    /** 每会话最后活动时间（闲置兜底判定用）。 */
    lastActivity = new Map();
    /** 每会话累计产出 L1 条数与最近蒸馏时间（session-stats 数据源；LRU 上限防泄漏）。 */
    sessionProduced = new Map();
    /** 抽取连续失败退避（瞬态，不持久化：重启后允许首试再退避）：
     *  sessionId → 连败次数与下次可自动重试时间（修闲置兜底×LLM 超时的重试风暴）。 */
    extractFailures = new Map();
    pendingFile;
    /** 分族 checkpoint（init 后可用；重建收尾也从这里读活引用）。 */
    states;
    afterRun;
    constructor(ctx, cfg, stores, logger, live, 
    /** 会话档位只读句柄（闲置扫描跳过 off 档会话；挂起语义）。 */
    modes) {
        this.ctx = ctx;
        this.cfg = cfg;
        this.stores = stores;
        this.logger = logger;
        this.live = live;
        this.modes = modes;
        this.pendingFile = pendingPathFor(resolveDataDir(cfg));
    }
    async init() {
        await this.stores.state.load();
        this.states = {
            chat: this.stores.state.forFamily('chat'),
            work: this.stores.state.forFamily('work'),
        };
        if (this.stores.state.didMigrate) {
            this.logger.info('[memory] state.json 已迁移为 v2 分族格式（旧数据归 chat 桶）');
            await this.stores.state.save();
        }
        // 恢复未蒸馏缓冲（上次进程退出前未蒸馏的消息，含失败待重试与攒阈值中途的）
        try {
            const { buckets: loaded, warmup } = await loadPending(this.pendingFile, this.logger);
            for (const key of PENDING_MODES) {
                if (loaded[key].length > PENDING_BUCKET_CAP)
                    loaded[key] = loaded[key].slice(-PENDING_BUCKET_CAP);
            }
            this.pending = loaded;
            this.warmup = warmup;
            if (this.pendingCount > 0) {
                this.logger.info(`[memory] 未蒸馏缓冲已恢复 ${this.pendingCount} 条（auto=${this.pending.auto.length}/chat=${this.pending.chat.length}/work=${this.pending.work.length}），${STARTUP_RETRY_DELAY_MS / 1000}s 后自动补跑`);
                this.scheduleStartupRetry();
            }
        }
        catch (err) {
            this.logger.warn(`[memory] 未蒸馏缓冲恢复失败（空桶起步）: ${errDetail(err)}`);
        }
    }
    /** 启动补跑：对每个非空桶的每个会话切片入队一次蒸馏尝试（受 live 开关与
     *  生效阈值约束；不足阈值的消息等用户继续或闲置兜底，失败不无限重试）。 */
    scheduleStartupRetry() {
        const modes = PENDING_MODES.filter((m) => this.pending[m].length > 0);
        this.ctx.effect(() => {
            const timer = setTimeout(() => {
                // 到点后按当前桶内容重新分组（期间可能有新轮次已消费切片）
                for (const mode of modes) {
                    for (const g of groupPendingBySession(this.pending[mode])) {
                        this.enqueue(g.sessionId, [], mode);
                    }
                }
            }, STARTUP_RETRY_DELAY_MS);
            return () => clearTimeout(timer);
        });
    }
    /** L1 抽取待重试的消息条数（状态面板用）。 */
    get pendingCount() {
        return this.pending.auto.length + this.pending.chat.length + this.pending.work.length;
    }
    /**
     * 会话级蒸馏视图（session-stats 端点数据源；纯内存读，零 I/O）。
     * pendingSlice = 当前档位桶中该会话的攒批切片条数（threshold 为生效阈值，含 warmup 爬坡）；
     * parkedSlices = 其余档位桶中的残留切片（换档遗留 / off 档挂起——ADR-0003 挂起语义）。
     */
    sessionView(sessionId, mode) {
        const count = (bucket) => bucket.reduce((n, m) => (m.sessionId === sessionId ? n + 1 : n), 0);
        const view = {
            pendingSlice: 0,
            parkedSlices: 0,
            threshold: null,
            producedRecords: 0,
            lastDistillAt: null,
        };
        const prod = this.sessionProduced.get(sessionId);
        if (prod) {
            view.producedRecords = prod.count;
            view.lastDistillAt = prod.lastAt;
        }
        const own = PENDING_MODES.includes(mode) ? mode : null;
        if (own) {
            view.pendingSlice = count(this.pending[own]);
            view.threshold = effectiveExtractThreshold(this.warmup[own], this.cfg.extract?.minMessages ?? 0);
        }
        for (const m of PENDING_MODES) {
            if (m !== own)
                view.parkedSlices += count(this.pending[m]);
        }
        return view;
    }
    /** 会话产出记账（切片成功消费时调用；LRU 淘汰最久未蒸馏会话防 Map 无界增长）。 */
    noteSessionDistill(sessionId, produced) {
        const now = Date.now();
        const cur = this.sessionProduced.get(sessionId);
        if (cur) {
            cur.count += produced;
            cur.lastAt = now;
        }
        else {
            this.sessionProduced.set(sessionId, { count: produced, lastAt: now });
        }
        if (this.sessionProduced.size > SESSION_PRODUCED_CAP) {
            let oldestKey = null;
            let oldestAt = Infinity;
            for (const [sid, v] of this.sessionProduced) {
                if (v.lastAt < oldestAt) {
                    oldestAt = v.lastAt;
                    oldestKey = sid;
                }
            }
            if (oldestKey)
                this.sessionProduced.delete(oldestKey);
        }
    }
    /** 管线跑完一轮后的回调（用于召回缓存失效）。 */
    setAfterRun(fn) {
        this.afterRun = fn;
    }
    /** 一轮对话结束后入队（L0 落盘由 capture 在 turn/end 即时完成，不排蒸馏队列）。 */
    enqueue(sessionId, messages, mode, opts) {
        this.pushTask({ kind: 'live', run: () => this.runTurn(sessionId, messages, mode, opts) });
    }
    /** 重建任务入队（低优先级：让位于正常轮次；由 RebuildController 分块驱动）。 */
    enqueueRebuildTask(run) {
        this.pushTask({ kind: 'rebuild', run });
    }
    /** 重建蒸馏轮：统一 auto 档，全量强制蒸馏（不受阈值约束——历史小会话也必须出记忆）、
     *  不受缓冲 200 上限（历史会话全量入桶，由 char 预算分块）。 */
    runRebuildTurn(sessionId, messages) {
        return this.runTurn(sessionId, messages, 'auto', { noBufferCap: true, force: true });
    }
    /** 停止取新任务（插件 dispose 序调用；进行中任务照常跑完但不 await——LLM 慢调用不拖住宿主卸载）。 */
    stop() {
        this.stopped = true;
    }
    /** 启动闲置兜底定时器（index.ts 装配；idleSeconds=0 关闭）。 */
    startIdleTimer() {
        const idleMs = (this.cfg.extract.idleSeconds ?? 0) * 1000;
        if (!(idleMs > 0))
            return;
        this.ctx.effect(() => {
            const timer = setInterval(() => this.flushIdleSlices(Date.now(), idleMs), IDLE_TICK_MS);
            return () => clearInterval(timer);
        });
    }
    /** 闲置扫描：静默达标且有切片的会话按捕获档位落袋（off 档会话挂起跳过）。 */
    flushIdleSlices(now, idleMs) {
        if (this.stopped)
            return;
        const liveNow = this.live.get();
        if (!(liveNow.enabled && liveNow.distill))
            return;
        // 聚合每会话跨桶切片（sessionId 全局唯一）
        const infos = new Map();
        for (const mode of PENDING_MODES) {
            for (const m of this.pending[mode]) {
                const info = infos.get(m.sessionId) ?? { sessionId: m.sessionId, count: 0, lastMessageAt: 0 };
                info.count++;
                info.lastMessageAt = Math.max(info.lastMessageAt, m.timestamp);
                infos.set(m.sessionId, info);
            }
        }
        if (infos.size === 0)
            return;
        const targets = idleSessionsToFlush([...infos.values()], this.lastActivity, now, idleMs, (sid) => this.modes?.get(sid) === 'off').filter((sid) => !this.inExtractBackoff(sid, now)); // 退避中的会话不入队（任务堆积源头）
        for (const sid of targets) {
            this.logger.info(`[memory] 闲置兜底：会话 ${sid} 静默达标，未蒸馏切片落袋`);
            this.enqueueSessionSlices(sid);
        }
    }
    /** 把某会话在各桶中的切片按捕获档位逐个入队强制蒸馏（闲置兜底 / 档位切换共用）。 */
    enqueueSessionSlices(sessionId) {
        for (const mode of PENDING_MODES) {
            if (this.pending[mode].some((m) => m.sessionId === sessionId)) {
                this.enqueue(sessionId, [], mode, { force: true });
            }
        }
    }
    /**
     * 档位切换同步（session-modes 的 set() 回调，ADR-0003）：
     * 非 off 间切换 → 该会话切片立即按捕获档位蒸馏（新档位从空切片起步）；
     * 切到 off → 挂起（切片留存，闲置扫描跳过）；从 off 切回 → 挂起片按捕获档位落袋。
     */
    onModeChange(sessionId, oldMode, newMode) {
        const action = modeSwitchAction(oldMode, newMode);
        if (action === 'none')
            return;
        if (action === 'park') {
            this.logger.info(`[memory] 档位切换 ${oldMode}→off：会话 ${sessionId} 未蒸馏切片挂起`);
            return;
        }
        this.logger.info(`[memory] 档位切换 ${oldMode}→${newMode}（${action}）：会话 ${sessionId} 切片按捕获档位落袋`);
        this.enqueueSessionSlices(sessionId);
    }
    pushTask(task) {
        if (this.stopped)
            return;
        this.tasks.push(task);
        void this.drain();
    }
    async drain() {
        if (this.draining)
            return;
        this.draining = true;
        try {
            while (!this.stopped && this.tasks.length > 0) {
                const [task] = this.tasks.splice(pickNextTaskIndex(this.tasks), 1);
                try {
                    await task.run();
                }
                catch (err) {
                    this.logger.warn(`[memory] 管线失败（已兜底）: ${errDetail(err)}`);
                }
            }
        }
        finally {
            this.draining = false;
        }
    }
    /** 该会话是否处于抽取退避窗口内。 */
    inExtractBackoff(sessionId, now = Date.now()) {
        const f = this.extractFailures.get(sessionId);
        return !!f && now < f.nextAt;
    }
    /** 缓冲落盘（每次蒸馏尝试后调用；失败只告警不阻断管线）。
     *  非重建轮持久化前按桶截断到上限：重建取消后的大桶不至于在后续每次
     *  蒸馏尝试时反复整量序列化落盘（多 MB 级 IO）；重建轮豁免维持。 */
    async persistPending(noBufferCap = false) {
        try {
            if (!noBufferCap) {
                for (const key of PENDING_MODES) {
                    const bucket = this.pending[key];
                    if (bucket.length > PENDING_BUCKET_CAP)
                        this.pending[key] = bucket.slice(-PENDING_BUCKET_CAP);
                }
            }
            await savePending(this.pendingFile, this.pending, this.warmup);
        }
        catch (err) {
            this.logger.warn(`[memory] 未蒸馏缓冲落盘失败: ${errDetail(err)}`);
        }
    }
    async runTurn(sessionId, messages, mode, opts) {
        const turnStart = Date.now();
        this.logger.info(`[memory] 蒸馏管线开始（session=${sessionId}，mode=${mode}，本轮 ${messages.length} 条消息，待重试 ${this.pendingCount} 条）`);
        // ── L0：原始对话已由 capture 在 turn/end 即时落盘（不排蒸馏队列，防慢 LLM 阻塞/退出丢消息） ──
        const cfg = effectiveCfg(this.cfg, this.live);
        // ── L1：抽取 + 去重（按档分桶、桶内按会话切片；失败按切片保留待重试） ──
        let newRecords = [];
        const liveNow = this.live.get();
        const distillOn = liveNow.enabled && liveNow.distill;
        if (cfg.extract.enabled && distillOn) {
            const bucket = this.pending[mode];
            // 入桶即携带会话标识（会话切片成员；ADR-0003：切片内永不跨会话混装）
            bucket.push(...messages.map((m) => ({ ...m, sessionId })));
            if (!opts?.noBufferCap && bucket.length > PENDING_BUCKET_CAP) {
                bucket.splice(0, bucket.length - PENDING_BUCKET_CAP);
            }
            if (messages.length > 0)
                this.lastActivity.set(sessionId, Date.now());
            // 按会话切片触发（ADR-0003）：只看本会话切片是否达到生效阈值（渐进爬坡），
            // 达标只抽取该切片——其余会话的切片继续攒，绝不跨会话混装。
            // force：重建轮全量蒸馏（历史小会话也必须出记忆，不受阈值约束）。
            const effective = effectiveExtractThreshold(this.warmup[mode], cfg.extract.minMessages);
            const sliceLen = bucket.reduce((n, m) => (m.sessionId === sessionId ? n + 1 : n), 0);
            // 抽取失败退避：重建轮（noBufferCap，用户显式动作、有自己的失败/取消 UI）豁免
            const backedOff = !opts?.noBufferCap && this.inExtractBackoff(sessionId);
            if ((opts?.force || sliceLen >= effective) && !backedOff) {
                newRecords = await this.extractSessionSlice(sessionId, mode, cfg, effective, opts);
            }
            else {
                this.logger.debug?.(backedOff
                    ? `[memory] 蒸馏退避中，本轮跳过抽取（session=${sessionId}，mode=${mode}）`
                    : `[memory] 会话切片攒批中（session=${sessionId}，mode=${mode}，${sliceLen}/${effective}）`);
                // 攒阈值中途也落盘：进程退出后切片与爬坡状态不丢
                await this.persistPending(opts?.noBufferCap);
            }
        }
        // ── L2/L3：按记录族各自判定与执行 ──
        if (cfg.l2.enabled && distillOn) {
            for (const family of ['chat', 'work']) {
                const familyRecords = newRecords.filter((r) => (r.family ?? 'chat') === family);
                if (familyRecords.length === 0)
                    continue;
                const fstate = this.states[family];
                if (fstate.newMemoriesSinceL2 >= cfg.l2.minNewMemories) {
                    try {
                        const t = Date.now();
                        const result = await runSceneConsolidation(this.ctx, cfg, this.stores.scenes[family], familyRecords, this.logger, family);
                        fstate.lastL2At = Date.now();
                        fstate.newMemoriesSinceL2 = 0;
                        if (result.personaRequestedReason)
                            fstate.personaRequestedReason = result.personaRequestedReason;
                        this.logger.info(`[memory] L2 阶段完成（family=${family}，${Date.now() - t}ms）`);
                    }
                    catch (err) {
                        this.logger.warn(`[memory] L2 场景整合失败（family=${family}）: ${errDetail(err)}`);
                    }
                }
                else {
                    this.logger.debug?.(`[memory] L2 跳过（family=${family}，本族新增 ${familyRecords.length} 条，累计未整合 ${fstate.newMemoriesSinceL2}/${cfg.l2.minNewMemories}）`);
                }
            }
        }
        if (cfg.l3.enabled && distillOn) {
            for (const family of ['chat', 'work']) {
                try {
                    await runPersona(this.ctx, cfg, this.stores.scenes[family], this.stores.persona[family], this.states[family], this.logger, family);
                }
                catch (err) {
                    this.logger.warn(`[memory] L3 画像蒸馏失败（family=${family}）: ${errDetail(err)}`);
                }
            }
        }
        // ── 持久化状态 ──
        try {
            await this.stores.state.save();
        }
        catch (err) {
            this.logger.warn(`[memory] 状态保存失败: ${errDetail(err)}`);
        }
        this.logger.info(`[memory] 蒸馏管线结束（本轮新增 ${newRecords.length} 条，总耗时 ${Date.now() - turnStart}ms）`);
        this.afterRun?.();
        return newRecords.length;
    }
    /**
     * 抽取并消费一个会话切片：成功才把切片移出桶并推进爬坡阈值；失败保留切片待重试。
     * 调用方已保证切片达到生效阈值（或 force）。背景参考按会话从 L0 现查并剔除切片
     * 自身（ADR-0003：会话间互不污染、重启不丢背景）。
     */
    async extractSessionSlice(sessionId, mode, cfg, effectiveThreshold, opts) {
        const bucket = this.pending[mode];
        const slice = bucket.filter((m) => m.sessionId === sessionId);
        if (slice.length === 0)
            return [];
        const rest = bucket.filter((m) => m.sessionId !== sessionId);
        try {
            // 背景参考：该会话最近消息（多取切片条数补偿被剔除者），剔除切片自身
            const background = this.stores.l0
                ? pickSessionBackground(await this.stores.l0.recentBySession(sessionId, cfg.extract.backgroundMessages + slice.length), new Set(slice.map((m) => m.id)), cfg.extract.backgroundMessages)
                : [];
            const t = Date.now();
            const result = await runExtraction(this.ctx, cfg, this.stores.l1, this.states, slice, background, this.logger, mode);
            if (!result.skipped) {
                this.pending[mode] = rest;
                // 重建轮（force）不是有机对话，不推进爬坡
                if (!opts?.force)
                    this.warmup[mode] = advanceWarmupThreshold(this.warmup[mode], cfg.extract.minMessages);
                // 会话产出记账（成功消费即记——零产出也算"蒸馏过"，lastAt 推进）
                this.noteSessionDistill(sessionId, result.newRecords.length);
                // 成功消费清零失败退避（切片已出桶，后续轮次恢复正常触发）
                this.extractFailures.delete(sessionId);
            }
            this.logger.info(`[memory] L1 阶段完成（session=${sessionId}，mode=${mode}，切片 ${slice.length} 条，背景 ${background.length} 条，阈值 ${effectiveThreshold}，${Date.now() - t}ms）`);
            // 缓冲与爬坡每次尝试后立即落盘：进程中途退出不丢待重试/攒阈值状态
            await this.persistPending(opts?.noBufferCap);
            // L1 计数推进后立即落盘：L2/L3 失败或进程中途退出不得回滚阈值进度
            // （记录已入库但计数丢失会让该族 L2 永远差一截，state 与 DB 脱节）
            try {
                await this.stores.state.save();
            }
            catch (err) {
                this.logger.warn(`[memory] 状态保存失败: ${errDetail(err)}`);
            }
            return result.newRecords;
        }
        catch (err) {
            // 保留切片下次重试（桶入口已裁到 ≤200，防无限堆积；重建轮不裁，量被会话规模约束）
            this.logger.warn(`[memory] L1 抽取失败（session=${sessionId}，mode=${mode}，切片 ${slice.length} 条）: ${errDetail(err)}`);
            // 指数退避：压制闲置兜底/补跑在 LLM 故障期间的连环重试（成功消费时清零）
            const streak = (this.extractFailures.get(sessionId)?.streak ?? 0) + 1;
            const delayMs = extractionBackoffMs(streak);
            this.extractFailures.set(sessionId, { streak, nextAt: Date.now() + delayMs });
            this.logger.info(`[memory] 蒸馏连续失败 ${streak} 次，${Math.round(delayMs / 1000)}s 内暂停该会话的自动重试`);
            await this.persistPending(opts?.noBufferCap).catch(() => { });
            return [];
        }
    }
}
