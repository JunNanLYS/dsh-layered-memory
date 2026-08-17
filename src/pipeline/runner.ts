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
import { emptyPending, loadPending, PENDING_MODES, pendingPathFor, savePending, type PendingBuckets } from '../store/pending.js';
import type { PersonaStore } from '../store/persona.js';
import type { SceneStore } from '../store/scenes.js';
import type { StateStore } from '../store/state.js';
import type { ConversationMessage, ExtractMode, MemoryFamily, MemoryLogger } from '../types.js';
import { errDetail } from '../util/filelog.js';
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

export class MemoryRunner {
  private tasks: PipelineTask[] = [];
  private draining = false;
  /** 停止标志（dispose 序置位）：不再取新任务；进行中任务自然收尾，其 DB 写入失败由各层兜底捕获。 */
  private stopped = false;
  private pending: PendingBuckets = emptyPending();
  private readonly pendingFile: string;
  private background: ConversationMessage[] = [];
  /** 分族 checkpoint（init 后可用；重建收尾也从这里读活引用）。 */
  states!: FamilyStates;
  private afterRun: (() => void) | undefined;

  constructor(
    private readonly ctx: Context,
    private readonly cfg: MemoryConfig,
    private readonly stores: MemoryStores,
    private readonly logger: MemoryLogger,
    private readonly live: LiveSettingsHandle,
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
      const loaded = await loadPending(this.pendingFile, this.logger);
      for (const key of PENDING_MODES) {
        if (loaded[key].length > PENDING_BUCKET_CAP) loaded[key] = loaded[key].slice(-PENDING_BUCKET_CAP);
      }
      this.pending = loaded;
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

  /** 启动补跑：对每个非空桶入队一次蒸馏尝试（受 live 开关与阈值约束，失败不无限重试）。 */
  private scheduleStartupRetry(): void {
    const modes = PENDING_MODES.filter((m) => this.pending[m].length > 0);
    this.ctx.effect(() => {
      const timer = setTimeout(() => {
        for (const mode of modes) this.enqueue('startup-retry', [], mode);
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
  enqueue(sessionId: string, messages: ConversationMessage[], mode: ExtractMode): void {
    this.pushTask({ kind: 'live', run: () => this.runTurn(sessionId, messages, mode) });
  }

  /** 重建任务入队（低优先级：让位于正常轮次；由 RebuildController 分块驱动）。 */
  enqueueRebuildTask(run: () => Promise<unknown>): void {
    this.pushTask({ kind: 'rebuild', run });
  }

  /** 重建蒸馏轮：统一 auto 档，不受缓冲 200 上限（历史会话全量入桶，由 char 预算分块）。 */
  runRebuildTurn(sessionId: string, messages: ConversationMessage[]): Promise<number> {
    return this.runTurn(sessionId, messages, 'auto', { noBufferCap: true });
  }

  /** 停止取新任务（插件 dispose 序调用；进行中任务照常跑完但不 await——LLM 慢调用不拖住宿主卸载）。 */
  stop(): void {
    this.stopped = true;
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
      await savePending(this.pendingFile, this.pending);
    } catch (err) {
      this.logger.warn(`[memory] 未蒸馏缓冲落盘失败: ${errDetail(err)}`);
    }
  }

  private async runTurn(
    sessionId: string,
    messages: ConversationMessage[],
    mode: ExtractMode,
    opts?: { noBufferCap?: boolean },
  ): Promise<number> {
    const turnStart = Date.now();
    this.logger.info(
      `[memory] 蒸馏管线开始（session=${sessionId}，mode=${mode}，本轮 ${messages.length} 条消息，待重试 ${this.pendingCount} 条）`,
    );

    // ── L0：原始对话已由 capture 在 turn/end 即时落盘（不排蒸馏队列，防慢 LLM 阻塞/退出丢消息） ──

    const cfg = effectiveCfg(this.cfg, this.live);

    // ── L1：抽取 + 去重（按档分桶，失败按桶保留待重试） ──
    let newRecords: Awaited<ReturnType<typeof runExtraction>>['newRecords'] = [];
    const liveNow = this.live.get();
    const distillOn = liveNow.enabled && liveNow.distill;
    if (cfg.extract.enabled && distillOn) {
      const bucket = this.pending[mode];
      bucket.push(...messages);
      if (!opts?.noBufferCap && bucket.length > PENDING_BUCKET_CAP) {
        bucket.splice(0, bucket.length - PENDING_BUCKET_CAP);
      }
      try {
        const t = Date.now();
        const result = await runExtraction(this.ctx, cfg, this.stores.l1, this.states, bucket, this.background, this.logger, mode);
        if (!result.skipped) this.pending[mode] = [];
        this.background = [...this.background.slice(-cfg.extract.backgroundMessages), ...messages];
        newRecords = result.newRecords;
        this.logger.info(`[memory] L1 阶段完成（${Date.now() - t}ms）`);
      } catch (err) {
        // 保留 pending 下次重试（runTurn 入口已裁到 ≤200，防无限堆积；重建轮不裁，量被会话规模约束）
        this.logger.warn(`[memory] L1 抽取失败（mode=${mode}，pending=${this.pending[mode].length}）: ${errDetail(err)}`);
      }
      // 缓冲每次尝试后立即落盘：进程中途退出不丢待重试/攒阈值状态
      await this.persistPending(opts?.noBufferCap);
      // L1 计数推进后立即落盘：L2/L3 失败或进程中途退出不得回滚阈值进度
      // （记录已入库但计数丢失会让该族 L2 永远差一截，state 与 DB 脱节）
      try {
        await this.stores.state.save();
      } catch (err) {
        this.logger.warn(`[memory] 状态保存失败: ${errDetail(err)}`);
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
}
