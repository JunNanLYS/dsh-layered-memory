/**
 * 重建控制器：从 L0 事实源重新推导 L1/L2/L3（用户主动动作，设置页按钮触发）。
 *
 * 语义（CONTEXT.md「重建」）：
 * - L0 永不改动；旧派生层归档保留（records/ scenes/ persona-*.md → *.bak.<ts>，不硬删）；
 * - 检索库 L1 三表清空、checkpoint 原地重置；
 * - 统一按 auto 档、按会话分块重蒸馏；分块经 runner 的低优先级队列让位于正常轮次；
 * - 收尾强制一轮 L2（各族残余记录）+ L3（重建后 hasPersona=false → 冷启动触发）。
 *
 * 失败语义：准备/归档任一步失败 → phase=failed，绝不拖垮宿主；
 * 单块蒸馏失败继续下一块（消息留在未蒸馏缓冲，下轮对话/重启补跑自愈）。
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { resolveDataDir, type MemoryConfig } from '../config.js';
import type { L1Store } from '../store/l1.js';
import type { PersonaStore } from '../store/persona.js';
import type { SceneStore } from '../store/scenes.js';
import type { StateStore } from '../store/state.js';
import type { MemoryDb } from '../store/sqlite.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { ConversationMessage, L0MessageRecord, MemoryFamily, MemoryLogger, MemoryRecord } from '../types.js';
import { errDetail } from '../util/filelog.js';
import { runSceneConsolidation } from './l2.js';
import { runPersona } from './l3.js';
import { effectiveCfg, type MemoryRunner } from './runner.js';

/** 重建所需的存储子集（l0 不需要——快照直接走 db）。 */
export interface RebuildStores {
  l1: L1Store;
  scenes: Record<MemoryFamily, SceneStore>;
  persona: Record<MemoryFamily, PersonaStore>;
  state: StateStore;
}

export type RebuildPhase = 'idle' | 'preparing' | 'distilling' | 'finalizing' | 'done' | 'cancelled' | 'failed';

export interface RebuildStatus {
  running: boolean;
  phase: RebuildPhase;
  /** 已完成的会话块数 / 总块数。 */
  done: number;
  total: number;
  /** L0 体量（idle 时为实时预估，运行中为快照值）。 */
  sessionCount: number;
  messageCount: number;
  /** 预计 LLM 抽取调用次数（下界估算：块数与字符预算取大）。 */
  estCalls: number;
  /** 重建产出的 L1 记录累计条数。 */
  recordsBuilt: number;
  cancelRequested: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  /** 归档产物名（提示用户可手工找回）。 */
  archiveNote: string | null;
}

export interface RebuildChunk {
  sessionId: string;
  messages: ConversationMessage[];
}

export function groupL0Sessions(records: L0MessageRecord[]): RebuildChunk[] {
  const bySession = new Map<string, ConversationMessage[]>();
  for (const r of records) {
    if (!r || typeof r.id !== 'string' || typeof r.content !== 'string') continue;
    if (r.role !== 'user' && r.role !== 'assistant') continue;
    if (!r.content.trim()) continue;
    const key = r.sessionId || 'default';
    const arr = bySession.get(key) ?? [];
    arr.push({ id: r.id, role: r.role, content: r.content, timestamp: r.timestamp ?? 0 });
    bySession.set(key, arr);
  }
  const chunks: RebuildChunk[] = [];
  for (const [sessionId, messages] of bySession) {
    messages.sort((a, b) => a.timestamp - b.timestamp);
    chunks.push({ sessionId, messages });
  }
  // 会话按首条消息时间升序：情境链按时间顺序衔接（与原始发生顺序一致）
  chunks.sort((a, b) => a.messages[0].timestamp - b.messages[0].timestamp);
  return chunks;
}

/** 抽取调用数下界估算（与 l1.ts 的 perChunk 同式；会话数与字符预算取大）。 */
export function estimateCalls(sessions: number, messages: number, chars: number, maxInputChars: number): number {
  if (messages === 0) return 0;
  const perChunk = Math.max(20_000, maxInputChars - 42_000);
  return Math.max(sessions, Math.ceil((chars + 64 * messages) / perChunk));
}

function idleStatus(): RebuildStatus {
  return {
    running: false,
    phase: 'idle',
    done: 0,
    total: 0,
    sessionCount: 0,
    messageCount: 0,
    estCalls: 0,
    recordsBuilt: 0,
    cancelRequested: false,
    startedAt: null,
    finishedAt: null,
    error: null,
    archiveNote: null,
  };
}

/** 时间戳后缀（归档命名，秒级防撞）。 */
function stamp(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export class RebuildController {
  private status: RebuildStatus = idleStatus();
  private chunks: RebuildChunk[] = [];
  private cancelRequested = false;
  /** 快照时刻（收尾时按它区分重建产物与重建后新对话的记录）。 */
  private rebuildStartMs = 0;

  constructor(
    private readonly ctx: Context,
    private readonly cfg: MemoryConfig,
    private readonly stores: RebuildStores,
    private readonly db: MemoryDb,
    private readonly runner: Pick<MemoryRunner, 'enqueueRebuildTask' | 'runRebuildTurn' | 'states'>,
    private readonly logger: MemoryLogger,
    private readonly live: LiveSettingsHandle,
  ) {}

  /** 状态快照（idle 时附带实时 L0 预估，供确认弹窗显示成本）。 */
  getStatus(): RebuildStatus {
    if (this.status.phase === 'idle') {
      const est = this.db.l0RebuildEstimate();
      return {
        ...this.status,
        sessionCount: est.sessions,
        messageCount: est.messages,
        estCalls: estimateCalls(est.sessions, est.messages, est.chars, effectiveCfg(this.cfg, this.live).llm.maxInputChars),
      };
    }
    return { ...this.status };
  }

  /** 内存中尚未处理的会话快照块数（收尾后应为 0——快照即弃，诊断/冒烟用）。 */
  get chunkCount(): number {
    return this.chunks.length;
  }

  /** 启动重建（校验后入队准备任务；真正的清库/归档在管线队列里串行执行，避开并发竞态）。 */
  start(): RebuildStatus {
    if (this.status.running) throw new Error('重建已在进行中');
    const est = this.db.l0RebuildEstimate();
    if (est.messages === 0) throw new Error('L0 无任何消息，无需重建');
    this.cancelRequested = false;
    this.chunks = [];
    this.status = {
      ...idleStatus(),
      running: true,
      phase: 'preparing',
      sessionCount: est.sessions,
      messageCount: est.messages,
      estCalls: estimateCalls(est.sessions, est.messages, est.chars, effectiveCfg(this.cfg, this.live).llm.maxInputChars),
      startedAt: Date.now(),
    };
    this.runner.enqueueRebuildTask(() => this.prepare());
    this.logger.info(`[memory] 重建开始：${est.sessions} 个会话 / ${est.messages} 条 L0 消息（预计 ≥${this.status.estCalls} 次抽取调用）`);
    return { ...this.status };
  }

  /** 请求取消：当前块完成后停止，已重建部分保留并照常收尾 L2/L3。 */
  requestCancel(): RebuildStatus {
    if (!this.status.running) return this.getStatus();
    this.cancelRequested = true;
    this.status.cancelRequested = true;
    this.logger.info('[memory] 重建取消已请求（当前块完成后停止）');
    return { ...this.status };
  }

  private async prepare(): Promise<void> {
    try {
      // 快照：从检索库读全量 L0（事务一致；重建期间新捕获的消息走正常轮次，天然不重不漏）
      this.rebuildStartMs = Date.now();
      this.chunks = groupL0Sessions(this.db.listL0All());
      if (this.chunks.length === 0) {
        this.finish('failed', 'L0 快照为空');
        return;
      }
      this.status.total = this.chunks.length;

      // 归档旧派生层（改名不硬删；任一失败即终止——半清半留会破坏"全量重导"语义）
      const archiveNote = await this.archiveDerived();
      this.status.archiveNote = archiveNote ?? null;

      // 清检索库 + 重置 checkpoint；归档后重建空目录（records/ 由 appendNew 自动重建）
      if (!this.db.clearL1()) throw new Error('L1 检索库清空失败');
      this.stores.state.reset();
      await this.stores.state.save();
      await Promise.all([
        this.stores.scenes.chat.init(),
        this.stores.scenes.work.init(),
        this.stores.persona.chat.init(),
        this.stores.persona.work.init(),
      ]);

      this.status.phase = 'distilling';
      this.logger.info(`[memory] 重建准备完成（归档：${archiveNote ?? '无旧产物'}，${this.chunks.length} 个会话块）`);
      this.scheduleChunk(0);
    } catch (err) {
      this.finish('failed', `准备阶段失败: ${errDetail(err)}`);
    }
  }

  /** 分块链：一次只挂一个重建块，跑完再挂下一块——正常轮次可随时插队。 */
  private scheduleChunk(i: number): void {
    if (this.cancelRequested || i >= this.chunks.length) {
      this.runner.enqueueRebuildTask(() => this.finalize());
      return;
    }
    const chunk = this.chunks[i];
    this.runner.enqueueRebuildTask(async () => {
      // 入队后开跑前可能已收到取消（等待插队的正常轮次期间），直接跳到收尾
      if (this.cancelRequested) {
        this.runner.enqueueRebuildTask(() => this.finalize());
        return;
      }
      try {
        const n = await this.runner.runRebuildTurn(chunk.sessionId, chunk.messages);
        this.status.recordsBuilt += n;
      } catch (err) {
        this.logger.warn(`[memory] 重建块失败（session=${chunk.sessionId}，跳过继续）: ${errDetail(err)}`);
      }
      this.status.done = i + 1;
      this.scheduleChunk(i + 1);
    });
  }

  private async finalize(): Promise<void> {
    try {
      this.status.phase = 'finalizing';
      const cfg = effectiveCfg(this.cfg, this.live);
      const liveNow = this.live.get();
      const distillOn = liveNow.enabled && liveNow.distill;

      // 强制 L2：把重建窗口内该族尚未整合的残余记录补一轮（正常轮次语义里差几条
      // 不触发是常态，但"重建"应把已有记录全部落进场景）
      if (cfg.l2.enabled && distillOn) {
        for (const family of ['chat', 'work'] as const) {
          const fstate = this.runner.states[family];
          if (fstate.newMemoriesSinceL2 <= 0) continue;
          const leftovers = this.collectRebuildRecords(family);
          if (leftovers.length === 0) continue;
          try {
            const t = Date.now();
            const result = await runSceneConsolidation(this.ctx, cfg, this.stores.scenes[family], leftovers, this.logger, family);
            fstate.lastL2At = Date.now();
            fstate.newMemoriesSinceL2 = 0;
            if (result.personaRequestedReason) fstate.personaRequestedReason = result.personaRequestedReason;
            this.logger.info(`[memory] 重建收尾 L2 完成（family=${family}，${Date.now() - t}ms，${leftovers.length} 条残余记录）`);
          } catch (err) {
            this.logger.warn(`[memory] 重建收尾 L2 失败（family=${family}）: ${errDetail(err)}`);
          }
        }
      }

      // 强制 L3：checkpoint 已重置（hasPersona=false）→ 冷启动触发；无场景的族跳过
      if (cfg.l3.enabled && distillOn) {
        for (const family of ['chat', 'work'] as const) {
          try {
            const scenes = await this.stores.scenes[family].list();
            if (scenes.length === 0) continue;
            await runPersona(this.ctx, cfg, this.stores.scenes[family], this.stores.persona[family], this.runner.states[family], this.logger, family);
          } catch (err) {
            this.logger.warn(`[memory] 重建收尾 L3 失败（family=${family}）: ${errDetail(err)}`);
          }
        }
      }

      await this.stores.state.save();
      this.finish(this.cancelRequested ? 'cancelled' : 'done', null);
    } catch (err) {
      this.finish('failed', `收尾失败: ${errDetail(err)}`);
    }
  }

  /**
   * 收集重建窗口内某族的记录：重建产物全部是新插入（updated==created），
   * 按 updated_time 倒序翻页、越过 rebuildStartMs 即停。
   */
  private collectRebuildRecords(family: MemoryFamily): MemoryRecord[] {
    const out: MemoryRecord[] = [];
    const PAGE = 200;
    for (let offset = 0; ; offset += PAGE) {
      const { items } = this.stores.l1.list({ family, limit: PAGE, offset });
      if (items.length === 0) break;
      let beyond = 0;
      for (const r of items) {
        if (r.createdAt >= this.rebuildStartMs) out.push(r);
        else beyond++;
      }
      if (beyond > 0 || items.length < PAGE) break;
    }
    return out;
  }

  private finish(phase: RebuildPhase, error: string | null): void {
    this.status.running = false;
    this.status.phase = phase;
    this.status.error = error;
    this.status.finishedAt = Date.now();
    // 快照即弃：全量 L0 消息（可能几十 MB）在重建结束/取消/失败后必须释放，
    // 不能滞留到下一次 start() 覆盖（M6——宿主长跑内存只增不减）
    this.chunks = [];
    const cost = this.status.finishedAt - (this.status.startedAt ?? this.status.finishedAt);
    this.logger.info(
      `[memory] 重建结束（${phase}）：${this.status.done}/${this.status.total} 会话，产出 ${this.status.recordsBuilt} 条记录，耗时 ${Math.round(cost / 1000)}s` +
        (error ? `，错误：${error}` : ''),
    );
  }

  /** 归档旧派生层：records/ scenes/ persona-*.md 改名 .bak.<ts>。不存在则跳过。 */
  private async archiveDerived(): Promise<string | undefined> {
    const dataDir = resolveDataDir(this.cfg);
    const ts = stamp();
    const items: Array<[string, string]> = [
      [path.join(dataDir, 'records'), path.join(dataDir, `records.bak.${ts}`)],
      [path.join(dataDir, 'scenes'), path.join(dataDir, `scenes.bak.${ts}`)],
      [path.join(dataDir, 'persona-chat.md'), path.join(dataDir, `persona-chat.md.bak.${ts}`)],
      [path.join(dataDir, 'persona-work.md'), path.join(dataDir, `persona-work.md.bak.${ts}`)],
    ];
    const archived: string[] = [];
    for (const [from, to] of items) {
      try {
        await fs.access(from);
      } catch {
        continue;
      }
      await fs.rename(from, to);
      archived.push(path.basename(to));
    }
    return archived.length > 0 ? archived.join(', ') : undefined;
  }
}
