/**
 * 管线 Runner：串行执行 L0 → L1 → L2 → L3。
 * 所有阶段失败只记日志，绝不向 Agent 循环抛错（失败兜底）。
 *
 * 会话档位：enqueue 带 mode（off 在捕获侧已被拦截）；L1 待重试缓冲按档分桶；
 * L2/L3 按记录族各自跑各自的场景/画像存储与阈值计数（分族隔离不变量）。
 *
 * 调度：内部是带优先级的任务列表——正常对话轮次（live）优先于重建分块（rebuild），
 * 重建期间用户照常聊天，新轮次的蒸馏最多等一个重建块。任务串行，同一时刻至多一个在跑。
 *
 * 未蒸馏缓冲：pending 三桶持久化在 pending.json，进程重启不丢；init 恢复后延迟补跑一次
 * （受 live 开关与 minMessages 阈值约束，失败维持"等下一轮同档对话"的现状语义）。
 */
import type { Context } from '@deepseek-ai/cordis';
import { resolveDataDir, type MemoryConfig } from '../config.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { L0Store } from '../store/l0.js';
import type { L1Store } from '../store/l1.js';
import {
  emptyPending,
  freshWarmup,
  groupPendingBySession,
  loadPending,
  PENDING_MODES,
  pendingPathFor,
  savePending,
  type PendingBuckets,
  type PendingMessage,
  type WarmupState,
} from '../store/pending.js';
import type { PersonaStore } from '../store/persona.js';
import type { SceneStore } from '../store/scenes.js';
import type { StateStore } from '../store/state.js';
import type { ConversationMessage, ExtractMode, MemoryFamily, MemoryLogger } from '../types.js';
import { errDetail } from '../util/filelog.js';
import {
  advanceWarmupThreshold,
  effectiveExtractThreshold,
  idleSessionsToFlush,
  modeSwitchAction,
  pickSessionBackground,
  type IdleSliceInfo,
} from './trigger.js';
import { runExtraction } from './l1.js';
import type { FamilyStates } from './l1.js';
import { runSceneConsolidation } from './l2.js';
import { runPersona } from './l3.js';

export interface MemoryStores {
  l0: L0Store;
  l1: L1Store;
  scenes: Record<MemoryFamily, SceneStore>;
  persona: Record<MemoryFamily, PersonaStore>;
  state: StateStore;
}

/** 管线任务（优先级调度：live 优先于 rebuild）。 */
export interface PipelineTask {
  kind: 'live' | 'rebuild';
  run: () => Promise<unknown>;
}

/** 选取下一个要执行的任务下标：最早的 live 优先，否则队首（rebuild 分块让位）。 */
export function pickNextTaskIndex(tasks: PipelineTask[]): number {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].kind === 'live') return i;
  }
  return 0;
}

/**
 * 运行时调参视图：UI 选择器可临时覆盖蒸馏思考档位（空串回退静态 config 默认）。
 * 浅拷贝只覆盖 llm 一层，其余键与原 cfg 共享只读引用；pipeline 全链继续收 cfg，无需感知。
 */
export function effectiveCfg(cfg: MemoryConfig, live: LiveSettingsHandle): MemoryConfig {
  const eff = live.get().reasoningEffort;
  return eff ? { ...cfg, llm: { ...cfg.llm, reasoningEffort: eff } } : cfg;
}

/** 单桶堆积上限（防无限堆积；重建分块不受限——历史会话需全量入桶蒸馏）。 */
const PENDING_BUCKET_CAP = 200;
/** 启动补跑延迟：避开宿主启动期忙乱。 */
const STARTUP_RETRY_DELAY_MS = 20_000;
/** 闲置扫描 tick 粒度（实际落袋延迟 = idleSeconds + 至多一个 tick）。 */
const IDLE_TICK_MS = 30_000;

export class MemoryRunner {
  private tasks: PipelineTask[] = [];
  private draining = false;
  /** 停止标志（dispose 序置位）：不再取新任务；进行中任务自然收尾，其 DB 写入失败由各层兜底捕获。 */
  private stopped = false;
  private pending: PendingBuckets = emptyPending();
  /** 各档位桶渐进阈值（1 起步翻倍至稳态毕业；ADR-0003，随 pending.json 持久化）。 */
  private warmup: WarmupState = freshWarmup();
  /** 每会话最后活动时间（闲置兜底判定用）。 */
  private lastActivity = new Map<string, number>();
  private readonly pendingFile: string;
  /** 分族 checkpoint（init 后可用；重建收尾也从这里读活引用）。 */
  states!: FamilyStates;
  private afterRun: (() => void) | undefined;

  constructor(
    private readonly ctx: Context,
    private readonly cfg: MemoryConfig,
    private readonly stores: MemoryStores,
    private readonly logger: MemoryLogger,
    private readonly live: LiveSettingsHandle,
    /** 会话档位只读句柄（闲置扫描跳过 off 档会话；挂起语义）。 */
    private readonly modes?: { get(sessionId: string): string },
  ) {
    this.pendingFile = pendingPathFor(resolveDataDir(cfg));
  }

  async init(): Promise<void> {
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
        if (loaded[key].length > PENDING_BUCKET_CAP) loaded[key] = loaded[key].slice(-PENDING_BUCKET_CAP);
      }
      this.pending = loaded;
      this.warmup = warmup;
      if (this.pendingCount > 0) {
        this.logger.info(
          `[memory] 未蒸馏缓冲已恢复 ${this.pendingCount} 条（auto=${this.pending.auto.length}/chat=${this.pending.chat.length}/work=${this.pending.work.length}），${STARTUP_RETRY_DELAY_MS / 1000}s 后自动补跑`,
        );
        this.scheduleStartupRetry();
      }
    } catch (err) {
      this.logger.warn(`[memory] 未蒸馏缓冲恢复失败（空桶起步）: ${errDetail(err)}`);
    }
  }

  /** 启动补跑：对每个非空桶的每个会话切片入队一次蒸馏尝试（受 live 开关与
   *  生效阈值约束；不足阈值的消息等用户继续或闲置兜底，失败不无限重试）。 */
  private scheduleStartupRetry(): void {
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
  get pendingCount(): number {
    return this.pending.auto.length + this.pending.chat.length + this.pending.work.length;
  }

  /** 管线跑完一轮后的回调（用于召回缓存失效）。 */
  setAfterRun(fn: () => void): void {
    this.afterRun = fn;
  }

  /** 一轮对话结束后入队（L0 落盘由 capture 在 turn/end 即时完成，不排蒸馏队列）。 */
  enqueue(sessionId: string, messages: ConversationMessage[], mode: ExtractMode, opts?: { force?: boolean }): void {
    this.pushTask({ kind: 'live', run: () => this.runTurn(sessionId, messages, mode, opts) });
  }

  /** 重建任务入队（低优先级：让位于正常轮次；由 RebuildController 分块驱动）。 */
  enqueueRebuildTask(run: () => Promise<unknown>): void {
    this.pushTask({ kind: 'rebuild', run });
  }

  /** 重建蒸馏轮：统一 auto 档，全量强制蒸馏（不受阈值约束——历史小会话也必须出记忆）、
   *  不受缓冲 200 上限（历史会话全量入桶，由 char 预算分块）。 */
  runRebuildTurn(sessionId: string, messages: ConversationMessage[]): Promise<number> {
    return this.runTurn(sessionId, messages, 'auto', { noBufferCap: true, force: true });
  }

  /** 停止取新任务（插件 dispose 序调用；进行中任务照常跑完但不 await——LLM 慢调用不拖住宿主卸载）。 */
  stop(): void {
    this.stopped = true;
  }

  /** 启动闲置兜底定时器（index.ts 装配；idleSeconds=0 关闭）。 */
  startIdleTimer(): void {
    const idleMs = (this.cfg.extract.idleSeconds ?? 0) * 1000;
    if (!(idleMs > 0)) return;
    this.ctx.effect(() => {
      const timer = setInterval(() => this.flushIdleSlices(Date.now(), idleMs), IDLE_TICK_MS);
      return () => clearInterval(timer);
    });
  }

  /** 闲置扫描：静默达标且有切片的会话按捕获档位落袋（off 档会话挂起跳过）。 */
  private flushIdleSlices(now: number, idleMs: number): void {
    if (this.stopped) return;
    const liveNow = this.live.get();
    if (!(liveNow.enabled && liveNow.distill)) return;
    // 聚合每会话跨桶切片（sessionId 全局唯一）
    const infos = new Map<string, IdleSliceInfo>();
    for (const mode of PENDING_MODES) {
      for (const m of this.pending[mode]) {
        const info = infos.get(m.sessionId) ?? { sessionId: m.sessionId, count: 0, lastMessageAt: 0 };
        info.count++;
        info.lastMessageAt = Math.max(info.lastMessageAt, m.timestamp);
        infos.set(m.sessionId, info);
      }
    }
    if (infos.size === 0) return;
    const targets = idleSessionsToFlush(
      [...infos.values()],
      this.lastActivity,
      now,
      idleMs,
      (sid) => this.modes?.get(sid) === 'off',
    );
    for (const sid of targets) {
      this.logger.info(`[memory] 闲置兜底：会话 ${sid} 静默达标，未蒸馏切片落袋`);
      for (const mode of PENDING_MODES) {
        if (this.pending[mode].some((m) => m.sessionId === sid)) {
          this.enqueue(sid, [], mode, { force: true });
        }
      }
    }
  }

  /**
   * 档位切换同步（session-modes 的 set() 回调，ADR-0003）：
   * 非 off 间切换 → 该会话切片立即按捕获档位蒸馏（新档位从空切片起步）；
   * 切到 off → 挂起（切片留存，闲置扫描跳过）；从 off 切回 → 挂起片按捕获档位落袋。
   */
  onModeChange(sessionId: string, oldMode: string, newMode: string): void {
    const action = modeSwitchAction(oldMode, newMode);
    if (action === 'none') return;
    if (action === 'park') {
      this.logger.info(`[memory] 档位切换 ${oldMode}→off：会话 ${sessionId} 未蒸馏切片挂起`);
      return;
    }
    this.logger.info(`[memory] 档位切换 ${oldMode}→${newMode}（${action}）：会话 ${sessionId} 切片按捕获档位落袋`);
    for (const mode of PENDING_MODES) {
      if (this.pending[mode].some((m) => m.sessionId === sessionId)) {
        this.enqueue(sessionId, [], mode, { force: true });
      }
    }
  }

  private pushTask(task: PipelineTask): void {
    if (this.stopped) return;
    this.tasks.push(task);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.stopped && this.tasks.length > 0) {
        const [task] = this.tasks.splice(pickNextTaskIndex(this.tasks), 1);
        try {
          await task.run();
        } catch (err) {
          this.logger.warn(`[memory] 管线失败（已兜底）: ${errDetail(err)}`);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /** 缓冲落盘（每次蒸馏尝试后调用；失败只告警不阻断管线）。
   *  非重建轮持久化前按桶截断到上限：重建取消后的大桶不至于在后续每次
   *  蒸馏尝试时反复整量序列化落盘（多 MB 级 IO）；重建轮豁免维持。 */
  private async persistPending(noBufferCap = false): Promise<void> {
    try {
      if (!noBufferCap) {
        for (const key of PENDING_MODES) {
          const bucket = this.pending[key];
          if (bucket.length > PENDING_BUCKET_CAP) this.pending[key] = bucket.slice(-PENDING_BUCKET_CAP);
        }
      }
      await savePending(this.pendingFile, this.pending, this.warmup);
    } catch (err) {
      this.logger.warn(`[memory] 未蒸馏缓冲落盘失败: ${errDetail(err)}`);
    }
  }

  private async runTurn(
    sessionId: string,
    messages: ConversationMessage[],
    mode: ExtractMode,
    opts?: { noBufferCap?: boolean; force?: boolean },
  ): Promise<number> {
    const turnStart = Date.now();
    this.logger.info(
      `[memory] 蒸馏管线开始（session=${sessionId}，mode=${mode}，本轮 ${messages.length} 条消息，待重试 ${this.pendingCount} 条）`,
    );

    // ── L0：原始对话已由 capture 在 turn/end 即时落盘（不排蒸馏队列，防慢 LLM 阻塞/退出丢消息） ──

    const cfg = effectiveCfg(this.cfg, this.live);

    // ── L1：抽取 + 去重（按档分桶、桶内按会话切片；失败按切片保留待重试） ──
    let newRecords: Awaited<ReturnType<typeof runExtraction>>['newRecords'] = [];
    const liveNow = this.live.get();
    const distillOn = liveNow.enabled && liveNow.distill;
    if (cfg.extract.enabled && distillOn) {
      const bucket = this.pending[mode];
      // 入桶即携带会话标识（会话切片成员；ADR-0003：切片内永不跨会话混装）
      bucket.push(...messages.map((m): PendingMessage => ({ ...m, sessionId })));
      if (!opts?.noBufferCap && bucket.length > PENDING_BUCKET_CAP) {
        bucket.splice(0, bucket.length - PENDING_BUCKET_CAP);
      }
      if (messages.length > 0) this.lastActivity.set(sessionId, Date.now());
      // 按会话切片触发（ADR-0003）：只看本会话切片是否达到生效阈值（渐进爬坡），
      // 达标只抽取该切片——其余会话的切片继续攒，绝不跨会话混装。
      // force：重建轮全量蒸馏（历史小会话也必须出记忆，不受阈值约束）。
      const effective = effectiveExtractThreshold(this.warmup[mode], cfg.extract.minMessages);
      const sliceLen = bucket.reduce((n, m) => (m.sessionId === sessionId ? n + 1 : n), 0);
      if (opts?.force || sliceLen >= effective) {
        newRecords = await this.extractSessionSlice(sessionId, mode, cfg, effective, opts);
      } else {
        this.logger.debug?.(
          `[memory] 会话切片攒批中（session=${sessionId}，mode=${mode}，${sliceLen}/${effective}）`,
        );
        // 攒阈值中途也落盘：进程退出后切片与爬坡状态不丢
        await this.persistPending(opts?.noBufferCap);
      }
    }

    // ── L2/L3：按记录族各自判定与执行 ──
    if (cfg.l2.enabled && distillOn) {
      for (const family of ['chat', 'work'] as const) {
        const familyRecords = newRecords.filter((r) => (r.family ?? 'chat') === family);
        if (familyRecords.length === 0) continue;
        const fstate = this.states[family];
        if (fstate.newMemoriesSinceL2 >= cfg.l2.minNewMemories) {
          try {
            const t = Date.now();
            const result = await runSceneConsolidation(this.ctx, cfg, this.stores.scenes[family], familyRecords, this.logger, family);
            fstate.lastL2At = Date.now();
            fstate.newMemoriesSinceL2 = 0;
            if (result.personaRequestedReason) fstate.personaRequestedReason = result.personaRequestedReason;
            this.logger.info(`[memory] L2 阶段完成（family=${family}，${Date.now() - t}ms）`);
          } catch (err) {
            this.logger.warn(`[memory] L2 场景整合失败（family=${family}）: ${errDetail(err)}`);
          }
        } else {
          this.logger.debug?.(
            `[memory] L2 跳过（family=${family}，本族新增 ${familyRecords.length} 条，累计未整合 ${fstate.newMemoriesSinceL2}/${cfg.l2.minNewMemories}）`,
          );
        }
      }
    }

    if (cfg.l3.enabled && distillOn) {
      for (const family of ['chat', 'work'] as const) {
        try {
          await runPersona(this.ctx, cfg, this.stores.scenes[family], this.stores.persona[family], this.states[family], this.logger, family);
        } catch (err) {
          this.logger.warn(`[memory] L3 画像蒸馏失败（family=${family}）: ${errDetail(err)}`);
        }
      }
    }

    // ── 持久化状态 ──
    try {
      await this.stores.state.save();
    } catch (err) {
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
  private async extractSessionSlice(
    sessionId: string,
    mode: ExtractMode,
    cfg: MemoryConfig,
    effectiveThreshold: number,
    opts?: { noBufferCap?: boolean; force?: boolean },
  ): Promise<Awaited<ReturnType<typeof runExtraction>>['newRecords']> {
    const bucket = this.pending[mode];
    const slice = bucket.filter((m) => m.sessionId === sessionId);
    if (slice.length === 0) return [];
    const rest = bucket.filter((m) => m.sessionId !== sessionId);
    try {
      // 背景参考：该会话最近消息（多取切片条数补偿被剔除者），剔除切片自身
      const background = this.stores.l0
        ? pickSessionBackground(
            await this.stores.l0.recentBySession(sessionId, cfg.extract.backgroundMessages + slice.length),
            new Set(slice.map((m) => m.id)),
            cfg.extract.backgroundMessages,
          )
        : [];
      const t = Date.now();
      const result = await runExtraction(this.ctx, cfg, this.stores.l1, this.states, slice, background, this.logger, mode);
      if (!result.skipped) {
        this.pending[mode] = rest;
        // 重建轮（force）不是有机对话，不推进爬坡
        if (!opts?.force) this.warmup[mode] = advanceWarmupThreshold(this.warmup[mode], cfg.extract.minMessages);
      }
      this.logger.info(
        `[memory] L1 阶段完成（session=${sessionId}，mode=${mode}，切片 ${slice.length} 条，背景 ${background.length} 条，阈值 ${effectiveThreshold}，${Date.now() - t}ms）`,
      );
      // 缓冲与爬坡每次尝试后立即落盘：进程中途退出不丢待重试/攒阈值状态
      await this.persistPending(opts?.noBufferCap);
      // L1 计数推进后立即落盘：L2/L3 失败或进程中途退出不得回滚阈值进度
      // （记录已入库但计数丢失会让该族 L2 永远差一截，state 与 DB 脱节）
      try {
        await this.stores.state.save();
      } catch (err) {
        this.logger.warn(`[memory] 状态保存失败: ${errDetail(err)}`);
      }
      return result.newRecords;
    } catch (err) {
      // 保留切片下次重试（桶入口已裁到 ≤200，防无限堆积；重建轮不裁，量被会话规模约束）
      this.logger.warn(`[memory] L1 抽取失败（session=${sessionId}，mode=${mode}，切片 ${slice.length} 条）: ${errDetail(err)}`);
      await this.persistPending(opts?.noBufferCap).catch(() => {});
      return [];
    }
  }
}
