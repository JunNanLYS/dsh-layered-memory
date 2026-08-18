/**
 * 会话记忆档位存储：sessionId → MemoryMode 的持久化映射。
 * 热路径（捕获 turn/end、召回 pre-step、工具 execute）需要同步读取，
 * 因此 init() 一次性载入内存 Map，set() 写穿。
 * 存储失败只降级为内存态（warn 不崩），与插件的存储降级不变量一致。
 */
import * as path from 'node:path';
import type { MemoryLogger, MemoryMode } from '../types.js';
import { atomicWriteJson, ensureDir, readJsonIfExists } from './io.js';

const MODES: readonly MemoryMode[] = ['auto', 'chat', 'work', 'off'];
const PRUNE_MS = 90 * 24 * 3600_000;
const MAX_ENTRIES = 500;

interface ModeEntry {
  mode: MemoryMode;
  updatedAt: number;
}

interface ModeFile {
  version: 1;
  sessions: Record<string, ModeEntry>;
}

export function isMemoryMode(v: unknown): v is MemoryMode {
  return typeof v === 'string' && (MODES as readonly string[]).includes(v);
}

export class SessionModeStore {
  private readonly file: string;
  private readonly entries = new Map<string, ModeEntry>();
  private readonly loaded: MemoryMode;
  private persistFailed = false;
  /** 档位切换回调（index.ts 装配 runner 的同步动作：切片落袋/挂起，ADR-0003）。 */
  private onModeChange?: (sessionId: string, oldMode: MemoryMode, newMode: MemoryMode) => void;
  /** 串行化持久化写（避免并发原子写撞临时文件名）。 */
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    dataDir: string,
    private readonly defaultMode: Extract<MemoryMode, 'auto' | 'chat' | 'work'>,
    private readonly logger?: MemoryLogger,
  ) {
    this.file = path.join(dataDir, 'session-modes.json');
    this.loaded = defaultMode;
  }

  /** 载入持久化映射（index.ts 启动时 await；失败降级内存态）。 */
  async init(): Promise<void> {
    const data = await readJsonIfExists<Partial<ModeFile>>(this.file);
    if (!data?.sessions || typeof data.sessions !== 'object') return;
    const now = Date.now();
    let count = 0;
    for (const [sid, entry] of Object.entries(data.sessions)) {
      if (!isMemoryMode(entry?.mode)) continue;
      if (now - (entry.updatedAt ?? 0) > PRUNE_MS) continue;
      this.entries.set(sid, { mode: entry.mode, updatedAt: entry.updatedAt ?? now });
      count++;
    }
    if (count > 0) this.logger?.info(`[memory] 会话档位载入 ${count} 条（默认档=${this.defaultMode}）`);
  }

  get default(): MemoryMode {
    return this.loaded;
  }

  /** 同步读取：未设置过的会话返回默认档。 */
  get(sessionId: string): MemoryMode {
    return this.entries.get(sessionId)?.mode ?? this.loaded;
  }

  /** 注册档位切换回调（同步调用；回调异常只记日志不阻断写穿）。 */
  setModeChangeHandler(cb: (sessionId: string, oldMode: MemoryMode, newMode: MemoryMode) => void): void {
    this.onModeChange = cb;
  }

  /** 设置会话档位（写穿持久化；持久化失败保持内存态生效）。 */
  set(sessionId: string, mode: MemoryMode): void {
    const old = this.get(sessionId);
    this.entries.set(sessionId, { mode, updatedAt: Date.now() });
    this.writeChain = this.writeChain.then(() => this.persist());
    if (old !== mode && this.onModeChange) {
      try {
        this.onModeChange(sessionId, old, mode);
      } catch (err) {
        this.logger?.warn(
          `[memory] 档位切换回调失败: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /** 等待在途持久化写完成（测试/停机用）。 */
  flush(): Promise<void> {
    return this.writeChain;
  }

  private async persist(): Promise<void> {
    try {
      await ensureDir(path.dirname(this.file));
      await atomicWriteJson(this.file, this.serialize());
      this.persistFailed = false;
    } catch (err) {
      if (!this.persistFailed) {
        this.persistFailed = true;
        this.logger?.warn(`[memory] 会话档位持久化失败（降级内存态）: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private serialize(): ModeFile {
    const now = Date.now();
    // 超期清理 + 条数上限（按 updatedAt 淘汰最旧）
    for (const [sid, e] of this.entries) {
      if (now - e.updatedAt > PRUNE_MS) this.entries.delete(sid);
    }
    while (this.entries.size > MAX_ENTRIES) {
      let oldest: string | undefined;
      let oldestAt = Infinity;
      for (const [sid, e] of this.entries) {
        if (e.updatedAt < oldestAt) {
          oldest = sid;
          oldestAt = e.updatedAt;
        }
      }
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    const sessions: Record<string, ModeEntry> = {};
    for (const [sid, e] of this.entries) sessions[sid] = e;
    return { version: 1, sessions };
  }
}
