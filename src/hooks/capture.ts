/**
 * L0 捕获 Hook：订阅 session/event，按轮次缓冲 user/assistant 消息，
 * turn/end 时清洗并交给 Runner 落盘 + 触发蒸馏。
 *
 * 冷启动保护：插件激活时间之前的事件不捕获（防止恢复会话时倾倒全部历史）。
 */
import { randomBytes } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { AssistantMessage, UserMessage } from '@deepseek-ai/dsh-llm';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import type { MemoryConfig } from '../config.js';
import type { MemoryRunner } from '../pipeline/runner.js';
import type { SessionModeStore } from '../store/session-modes.js';
import type { L0Store } from '../store/l0.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { ConversationMessage, MemoryLogger } from '../types.js';
import { blocksToText } from '../util/text.js';
import { sanitizeText, shouldCaptureL0, stripCodeBlocks } from '../util/sanitize.js';

/**
 * 需要进缓冲的事件类型。流式 chunk（text-delta/reasoning 等）一秒钟可达数百条，
 * 缓冲它们会把 MAX_BUFFER 撑爆、把轮次头部（turn/start + user 消息）裁掉——
 * 2026-08-16 真实事故：长回复轮次丢失 user 消息。
 */
const RELEVANT_TYPES = new Set(['user/message', 'assistant/message', 'turn/start', 'turn/end']);

export function isCaptureRelevant(type: string): boolean {
  return RELEVANT_TYPES.has(type);
}

const MAX_BUFFER = 500;

/**
 * 按会话缓冲轮次事件。turn 被消费后剩余前缀为空即删除 Map 条目——
 * 条目随会话数累积是慢泄漏（每会话残留一个数组引用，宿主长跑不释放）。
 */
export class CaptureBuffers {
  private readonly map = new Map<string, SessionEvent[]>();

  /** 活跃缓冲条目数（诊断/冒烟用）。 */
  get size(): number {
    return this.map.size;
  }

  push(sid: string, event: SessionEvent): void {
    let buf = this.map.get(sid);
    if (!buf) {
      buf = [];
      this.map.set(sid, buf);
    }
    buf.push(event);
    trimBuffer(buf);
  }

  /** 取出该 turn 的全部事件（不含 turn/start 自身）；无匹配 start 时返回整个缓冲。 */
  takeTurn(sid: string, turn: number): SessionEvent[] {
    const buf = this.map.get(sid);
    if (!buf) return [];
    const startIdx = findTurnStart(buf, turn);
    const turnEvents = startIdx === -1 ? buf : buf.slice(startIdx + 1);
    const rest = startIdx === -1 ? [] : buf.slice(0, startIdx);
    if (rest.length === 0) this.map.delete(sid);
    else this.map.set(sid, rest);
    return turnEvents;
  }
}

/**
 * 注册 L0 捕获。返回 L0 串行链的冲刷函数（dispose 序在关库前 await，
 * 排队中的 turn 消息先落盘）；capture 关闭时返回 undefined。
 */
export function registerCapture(
  ctx: Context,
  cfg: MemoryConfig,
  runner: MemoryRunner,
  l0: L0Store,
  logger: MemoryLogger,
  live: LiveSettingsHandle,
  modes: SessionModeStore,
): (() => Promise<void>) | undefined {
  if (!cfg.capture.enabled) return;
  const startFloor = Date.now();
  const buffers = new CaptureBuffers();
  // L0 即时落盘链：turn/end 立刻写，不被蒸馏队列（慢 LLM 调用）阻塞；
  // 串行化保证同轮次顺序与单次写入（进程退出时排队中的 L0 不再依赖蒸馏完成）
  let l0Queue: Promise<void> = Promise.resolve();

  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    try {
      const s = live.get();
      if (!s.enabled || !s.capture) return;
      const sid = String(session.id ?? session);
      // off 档：本会话对记忆系统完全隐身（不缓冲、不写 L0、不蒸馏）
      if (modes.get(sid) === 'off') return;
      if (!isCaptureRelevant(event.type)) return;
      if (event.time < startFloor) {
        // 冷启动保护拦截的 user 消息记 info（罕见，但正是"整轮只剩 assistant"现象的线索）
        if (event.type === 'user/message') {
          logger.info(
            `[memory] L0 跳过早于插件启动的 user 消息（冷启动保护，早 ${startFloor - event.time}ms）`,
          );
        }
        return;
      }
      buffers.push(sid, event);

      if (event.type === 'turn/end') {
        const turn = event.data.turn;
        const turnEvents = buffers.takeTurn(sid, turn);
        const messages = turnEventsToMessages(turnEvents, cfg, logger);
        if (messages.length > 0) {
          const roles = messages.reduce<Record<string, number>>((acc, m) => {
            acc[m.role] = (acc[m.role] ?? 0) + 1;
            return acc;
          }, {});
          // 轮末档位生效（中途切档：本轮按 turn/end 时的档位蒸馏）
          const mode = modes.get(sid);
          if (mode === 'off') {
            logger.info(`[memory] turn=${turn} 结束时档位为关闭，本轮不落盘不蒸馏（session=${sid}）`);
            return;
          }
          logger.info(
            `[memory] L0 捕获 turn=${turn} ${messages.length} 条（${Object.entries(roles)
              .map(([k, v]) => `${k}=${v}`)
              .join('/')}，session=${sid}，mode=${mode}）`,
          );
          // L0 立刻落盘（不等蒸馏）
          const n = messages.length;
          l0Queue = l0Queue
            .then(() => l0.append(sid, messages))
            .then(() => logger.info(`[memory] L0 落盘 ${n} 条`))
            .catch((err) =>
              logger.warn(`[memory] L0 落盘失败: ${err instanceof Error ? err.message : String(err)}`),
            );
          runner.enqueue(sid, messages, mode);
        }
      }
    } catch (err) {
      logger.warn(`[memory] session/event 处理失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // 冲刷 = 等待串行链排空（链上每环自带 catch，永不 reject）。
  // 注：极小概率在 await 期间又入队的新消息会落到链尾——其 JSONL 事实源照写、
  // DB 写入由 upsert 内部兜底（关库后 warn），下次重建自愈。
  return () => l0Queue;
}

/**
 * 缓冲上限裁剪（防御性；RELEVANT_TYPES 过滤后基本不可达）。
 * 铁律：进行中轮次（turn/start 之后、turn/end 之前）的事件绝不裁——
 * 只裁最早一个未闭合 turn/start 之前的已完成前缀。
 */
export function trimBuffer(buf: SessionEvent[]): void {
  if (buf.length <= MAX_BUFFER) return;
  let openStart = -1;
  let closed = true;
  for (let i = 0; i < buf.length; i++) {
    const t = buf[i].type;
    if (t === 'turn/start' && closed) {
      openStart = i;
      closed = false;
    } else if (t === 'turn/end') {
      closed = true;
      openStart = -1;
    }
  }
  const floorIdx = openStart === -1 ? Math.max(0, buf.length - MAX_BUFFER) : openStart;
  if (floorIdx > 0) buf.splice(0, floorIdx);
}

/** 找到与 turn/end 同 turn 的最后一个 turn/start 的索引（含自身）。 */
function findTurnStart(buf: SessionEvent[], turn: number): number {
  for (let i = buf.length - 1; i >= 0; i--) {
    const e = buf[i];
    if (e.type === 'turn/start' && e.data.turn === turn) return i;
  }
  return -1;
}

/** 把轮次事件转成 L0 消息（仅真实 user 消息 + assistant 消息，清洗过滤）。 */
function turnEventsToMessages(
  events: SessionEvent[],
  cfg: MemoryConfig,
  logger: MemoryLogger,
): ConversationMessage[] {
  const out: ConversationMessage[] = [];
  for (const event of events) {
    if (event.type === 'user/message') {
      const msg = event.data as UserMessage;
      // 只捕获真实用户输入（source.kind === 'user'），跳过插件注入上下文
      if (msg.source?.kind !== 'user') {
        logger.info(`[memory] L0 跳过非用户来源消息（source.kind=${msg.source?.kind ?? 'none'}）`);
        continue;
      }
      const content = sanitizeText(blocksToText(msg.content));
      if (shouldCaptureL0(content)) {
        out.push(makeMessage('user', content, event.time, cfg.capture.maxMessageChars));
      }
    } else if (event.type === 'assistant/message') {
      const data = event.data as { message: AssistantMessage };
      let content = sanitizeText(blocksToText(data.message?.content));
      if (cfg.capture.stripCodeBlocks) content = stripCodeBlocks(content);
      if (shouldCaptureL0(content)) {
        out.push(makeMessage('assistant', content, event.time, cfg.capture.maxMessageChars));
      }
    }
  }
  if (out.length > 0) {
    logger.debug?.(`[memory] 轮次消息 ${events.length} 事件 → ${out.length} 条（清洗过滤后）`);
  }
  return out;
}

function makeMessage(
  role: 'user' | 'assistant',
  content: string,
  timestamp: number,
  maxChars: number,
): ConversationMessage {
  return {
    id: `msg_${Date.now()}_${randomBytes(3).toString('hex')}`,
    role,
    content: content.slice(0, maxChars),
    timestamp,
  };
}
