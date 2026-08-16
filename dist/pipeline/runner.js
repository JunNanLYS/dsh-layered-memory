import { runExtraction } from './l1.js';
import { runSceneConsolidation } from './l2.js';
import { runPersona } from './l3.js';
import { errDetail } from '../util/filelog.js';
export class MemoryRunner {
    ctx;
    cfg;
    stores;
    logger;
    live;
    queue = Promise.resolve();
    pending = { auto: [], chat: [], work: [] };
    background = [];
    states;
    afterRun;
    constructor(ctx, cfg, stores, logger, live) {
        this.ctx = ctx;
        this.cfg = cfg;
        this.stores = stores;
        this.logger = logger;
        this.live = live;
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
    }
    /** L1 抽取待重试的消息条数（状态面板用）。 */
    get pendingCount() {
        return this.pending.auto.length + this.pending.chat.length + this.pending.work.length;
    }
    /** 管线跑完一轮后的回调（用于召回缓存失效）。 */
    setAfterRun(fn) {
        this.afterRun = fn;
    }
    /** 一轮对话结束后入队（L0 落盘 + 蒸馏触发判定）。 */
    enqueue(sessionId, messages, mode) {
        this.queue = this.queue
            .then(() => this.runTurn(sessionId, messages, mode))
            .catch((err) => {
            this.logger.warn(`[memory] 管线失败（已兜底）: ${errDetail(err)}`);
        });
    }
    async runTurn(sessionId, messages, mode) {
        const turnStart = Date.now();
        this.logger.info(`[memory] 蒸馏管线开始（session=${sessionId}，mode=${mode}，本轮 ${messages.length} 条消息，待重试 ${this.pendingCount} 条）`);
        // ── L0：原始对话已由 capture 在 turn/end 即时落盘（不排蒸馏队列，防慢 LLM 阻塞/退出丢消息） ──
        // ── L1：抽取 + 去重（按档分桶，失败按桶保留待重试） ──
        let newRecords = [];
        const distillOn = this.live.get().enabled && this.live.get().distill;
        if (this.cfg.extract.enabled && distillOn) {
            const bucket = this.pending[mode];
            bucket.push(...messages);
            if (bucket.length > 200)
                bucket.splice(0, bucket.length - 200);
            try {
                const t = Date.now();
                const result = await runExtraction(this.ctx, this.cfg, this.stores.l1, this.states, bucket, this.background, this.logger, mode);
                if (!result.skipped)
                    this.pending[mode] = [];
                this.background = [...this.background.slice(-this.cfg.extract.backgroundMessages), ...messages];
                newRecords = result.newRecords;
                this.logger.info(`[memory] L1 阶段完成（${Date.now() - t}ms）`);
            }
            catch (err) {
                // 保留 pending，下次重试；但防止无限堆积
                if (this.pending[mode].length > 200)
                    this.pending[mode] = [];
                this.logger.warn(`[memory] L1 抽取失败（mode=${mode}，pending=${this.pending[mode].length}）: ${errDetail(err)}`);
            }
        }
        // ── L2/L3：按记录族各自判定与执行 ──
        if (this.cfg.l2.enabled && distillOn) {
            for (const family of ['chat', 'work']) {
                const familyRecords = newRecords.filter((r) => (r.family ?? 'chat') === family);
                if (familyRecords.length === 0)
                    continue;
                const fstate = this.states[family];
                if (fstate.newMemoriesSinceL2 >= this.cfg.l2.minNewMemories) {
                    try {
                        const t = Date.now();
                        const result = await runSceneConsolidation(this.ctx, this.cfg, this.stores.scenes[family], familyRecords, this.logger, family);
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
                    this.logger.debug?.(`[memory] L2 跳过（family=${family}，本族新增 ${familyRecords.length} 条，累计未整合 ${fstate.newMemoriesSinceL2}/${this.cfg.l2.minNewMemories}）`);
                }
            }
        }
        if (this.cfg.l3.enabled && distillOn) {
            for (const family of ['chat', 'work']) {
                try {
                    await runPersona(this.ctx, this.cfg, this.stores.scenes[family], this.stores.persona[family], this.states[family], this.logger, family);
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
    }
}
