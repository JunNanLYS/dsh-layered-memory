/**
 * 管线 Runner：串行执行 L0 → L1 → L2 → L3。
 * 所有阶段失败只记日志，绝不向 Agent 循环抛错（失败兜底）。
 *
 * 会话档位：enqueue 带 mode（off 在捕获侧已被拦截）；L1 待重试缓冲按档分桶；
 * L2/L3 按记录族各自跑各自的场景/画像存储与阈值计数（分族隔离不变量）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryConfig } from '../config.js';
import { runExtraction } from './l1.js';
import type { FamilyStates } from './l1.js';
import { runSceneConsolidation } from './l2.js';
import { runPersona } from './l3.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { L0Store } from '../store/l0.js';
import type { L1Store } from '../store/l1.js';
import type { PersonaStore } from '../store/persona.js';
import type { SceneStore } from '../store/scenes.js';
import type { StateStore } from '../store/state.js';
import type { ConversationMessage, ExtractMode, MemoryFamily, MemoryLogger } from '../types.js';
import { errDetail } from '../util/filelog.js';

export interface MemoryStores {
  l0: L0Store;
  l1: L1Store;
  scenes: Record<MemoryFamily, SceneStore>;
  persona: Record<MemoryFamily, PersonaStore>;
  state: StateStore;
}

/** L1 抽取待重试的消息分桶（按档；失败重试语义按桶保留）。 */
interface PendingBuckets {
  auto: ConversationMessage[];
  chat: ConversationMessage[];
  work: ConversationMessage[];
}

export class MemoryRunner {
  private queue: Promise<void> = Promise.resolve();
  private pending: PendingBuckets = { auto: [], chat: [], work: [] };
  private background: ConversationMessage[] = [];
  private states!: FamilyStates;
  private afterRun: (() => void) | undefined;

  constructor(
    private readonly ctx: Context,
    private readonly cfg: MemoryConfig,
    private readonly stores: MemoryStores,
    private readonly logger: MemoryLogger,
    private readonly live: LiveSettingsHandle,
  ) {}

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
  }

  /** L1 抽取待重试的消息条数（状态面板用）。 */
  get pendingCount(): number {
    return this.pending.auto.length + this.pending.chat.length + this.pending.work.length;
  }

  /** 管线跑完一轮后的回调（用于召回缓存失效）。 */
  setAfterRun(fn: () => void): void {
    this.afterRun = fn;
  }

  /** 一轮对话结束后入队（L0 落盘 + 蒸馏触发判定）。 */
  enqueue(sessionId: string, messages: ConversationMessage[], mode: ExtractMode): void {
    this.queue = this.queue
      .then(() => this.runTurn(sessionId, messages, mode))
      .catch((err) => {
        this.logger.warn(`[memory] 管线失败（已兜底）: ${errDetail(err)}`);
      });
  }

  private async runTurn(sessionId: string, messages: ConversationMessage[], mode: ExtractMode): Promise<void> {
    const turnStart = Date.now();
    this.logger.info(
      `[memory] 蒸馏管线开始（session=${sessionId}，mode=${mode}，本轮 ${messages.length} 条消息，待重试 ${this.pendingCount} 条）`,
    );

    // ── L0：原始对话已由 capture 在 turn/end 即时落盘（不排蒸馏队列，防慢 LLM 阻塞/退出丢消息） ──

    // ── 运行时调参视图：UI 选择器可临时覆盖蒸馏思考档位（空串回退静态 config 默认）。
    // 浅拷贝只覆盖 llm 一层，其余键与 this.cfg 共享只读引用；pipeline 全链继续收 cfg，无需感知。 ──
    const liveNow = this.live.get();
    const cfg = liveNow.reasoningEffort
      ? { ...this.cfg, llm: { ...this.cfg.llm, reasoningEffort: liveNow.reasoningEffort } }
      : this.cfg;

    // ── L1：抽取 + 去重（按档分桶，失败按桶保留待重试） ──
    let newRecords: Awaited<ReturnType<typeof runExtraction>>['newRecords'] = [];
    const distillOn = liveNow.enabled && liveNow.distill;
    if (cfg.extract.enabled && distillOn) {
      const bucket = this.pending[mode];
      bucket.push(...messages);
      if (bucket.length > 200) bucket.splice(0, bucket.length - 200);
      try {
        const t = Date.now();
        const result = await runExtraction(this.ctx, cfg, this.stores.l1, this.states, bucket, this.background, this.logger, mode);
        if (!result.skipped) this.pending[mode] = [];
        this.background = [...this.background.slice(-cfg.extract.backgroundMessages), ...messages];
        newRecords = result.newRecords;
        this.logger.info(`[memory] L1 阶段完成（${Date.now() - t}ms）`);
      } catch (err) {
        // 保留 pending，下次重试；但防止无限堆积
        if (this.pending[mode].length > 200) this.pending[mode] = [];
        this.logger.warn(`[memory] L1 抽取失败（mode=${mode}，pending=${this.pending[mode].length}）: ${errDetail(err)}`);
      }
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
  }
}
