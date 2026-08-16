/**
 * 会话记忆档位存储：sessionId → MemoryMode 的持久化映射。
 * 热路径（捕获 turn/end、召回 pre-step、工具 execute）需要同步读取，
 * 因此 init() 一次性载入内存 Map，set() 写穿。
 * 存储失败只降级为内存态（warn 不崩），与插件的存储降级不变量一致。
 */
import * as path from 'node:path';
import { atomicWriteJson, ensureDir, readJsonIfExists } from './io.js';
const MODES = ['auto', 'chat', 'work', 'off'];
const PRUNE_MS = 90 * 24 * 3600_000;
const MAX_ENTRIES = 500;
export function isMemoryMode(v) {
    return typeof v === 'string' && MODES.includes(v);
}
export class SessionModeStore {
    defaultMode;
    logger;
    file;
    entries = new Map();
    loaded;
    persistFailed = false;
    /** 串行化持久化写（避免并发原子写撞临时文件名）。 */
    writeChain = Promise.resolve();
    constructor(dataDir, defaultMode, logger) {
        this.defaultMode = defaultMode;
        this.logger = logger;
        this.file = path.join(dataDir, 'session-modes.json');
        this.loaded = defaultMode;
    }
    /** 载入持久化映射（index.ts 启动时 await；失败降级内存态）。 */
    async init() {
        const data = await readJsonIfExists(this.file);
        if (!data?.sessions || typeof data.sessions !== 'object')
            return;
        const now = Date.now();
        let count = 0;
        for (const [sid, entry] of Object.entries(data.sessions)) {
            if (!isMemoryMode(entry?.mode))
                continue;
            if (now - (entry.updatedAt ?? 0) > PRUNE_MS)
                continue;
            this.entries.set(sid, { mode: entry.mode, updatedAt: entry.updatedAt ?? now });
            count++;
        }
        if (count > 0)
            this.logger?.info(`[memory] 会话档位载入 ${count} 条（默认档=${this.defaultMode}）`);
    }
    get default() {
        return this.loaded;
    }
    /** 同步读取：未设置过的会话返回默认档。 */
    get(sessionId) {
        return this.entries.get(sessionId)?.mode ?? this.loaded;
    }
    /** 设置会话档位（写穿持久化；持久化失败保持内存态生效）。 */
    set(sessionId, mode) {
        this.entries.set(sessionId, { mode, updatedAt: Date.now() });
        this.writeChain = this.writeChain.then(() => this.persist());
    }
    /** 等待在途持久化写完成（测试/停机用）。 */
    flush() {
        return this.writeChain;
    }
    async persist() {
        try {
            await ensureDir(path.dirname(this.file));
            await atomicWriteJson(this.file, this.serialize());
            this.persistFailed = false;
        }
        catch (err) {
            if (!this.persistFailed) {
                this.persistFailed = true;
                this.logger?.warn(`[memory] 会话档位持久化失败（降级内存态）: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    serialize() {
        const now = Date.now();
        // 超期清理 + 条数上限（按 updatedAt 淘汰最旧）
        for (const [sid, e] of this.entries) {
            if (now - e.updatedAt > PRUNE_MS)
                this.entries.delete(sid);
        }
        while (this.entries.size > MAX_ENTRIES) {
            let oldest;
            let oldestAt = Infinity;
            for (const [sid, e] of this.entries) {
                if (e.updatedAt < oldestAt) {
                    oldest = sid;
                    oldestAt = e.updatedAt;
                }
            }
            if (oldest === undefined)
                break;
            this.entries.delete(oldest);
        }
        const sessions = {};
        for (const [sid, e] of this.entries)
            sessions[sid] = e;
        return { version: 1, sessions };
    }
}
