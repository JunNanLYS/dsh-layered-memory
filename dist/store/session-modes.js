/**
 * 会话记忆档位存储：sessionId → MemoryMode 的持久化映射。
 * 热路径（捕获 turn/end、召回 pre-step、工具 execute）需要同步读取，
 * 因此 init() 一次性载入内存 Map，set() 写穿。
 * 存储失败只降级为内存态（warn 不崩），与插件的存储降级不变量一致。
 */
import * as path from 'node:path';
import { errDetail } from '../util/filelog.js';
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
    /** 档位切换回调（index.ts 装配 runner 的同步动作：切片落袋/挂起，ADR-0003）。 */
    onModeChange;
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
            this.entries.set(sid, {
                mode: entry.mode,
                // 非布尔视为损坏丢弃（= 跟随全局）；旧文件无此键同款兼容
                recall: typeof entry.recall === 'boolean' ? entry.recall : undefined,
                // 恢复快照：scope 必须是非 off 档、recall 必须是布尔或 null，否则整块丢弃
                resume: entry.resume &&
                    ['auto', 'chat', 'work'].includes(entry.resume.scope) &&
                    (typeof entry.resume.recall === 'boolean' || entry.resume.recall === null)
                    ? { scope: entry.resume.scope, recall: entry.resume.recall }
                    : undefined,
                updatedAt: entry.updatedAt ?? now,
            });
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
    /** 会话级注入覆盖原始值（#38）：undefined = 未覆盖，跟随全局。 */
    getRecall(sessionId) {
        return this.entries.get(sessionId)?.recall;
    }
    /** 解析后的注入开关：会话覆盖 ?? 全局运行时开关（部署级 cfg.recall.enabled
     *  与主闸 s.enabled 不经此处，仍按既有硬门生效——覆盖打不穿部署上限）。 */
    resolvedRecall(sessionId, globalRecall) {
        return this.entries.get(sessionId)?.recall ?? globalRecall;
    }
    /** 设置会话级注入覆盖（#38；undefined = 清除覆盖跟随全局。写穿持久化）。 */
    setRecall(sessionId, recall) {
        const entry = this.entries.get(sessionId);
        this.entries.set(sessionId, {
            mode: entry?.mode ?? this.loaded,
            recall,
            resume: entry?.resume,
            updatedAt: Date.now(),
        });
        this.writeChain = this.writeChain.then(() => this.persist());
    }
    /** 注册档位切换回调（同步调用；回调异常只记日志不阻断写穿）。 */
    setModeChangeHandler(cb) {
        this.onModeChange = cb;
    }
    /** 暂停恢复快照（无则 null）。 */
    getResume(sessionId) {
        return this.entries.get(sessionId)?.resume ?? null;
    }
    /** 停用侧分布（工作台洞察，只读计数）：off = 档位暂停会话；wo = 注入覆盖只写
     *  （recall=false 且档位未停——两态互斥计数，与召回四因子短路序对齐）。 */
    countStates() {
        let off = 0;
        let wo = 0;
        for (const e of this.entries.values()) {
            if (e.mode === 'off')
                off++;
            else if (e.recall === false)
                wo++;
        }
        return { off, wo };
    }
    /** 设置会话档位（写穿持久化；持久化失败保持内存态生效）。
     *  暂停语义（UI 重构）：非 off → off 记录恢复快照（暂停前范围 + 当前注入覆盖）；
     *  off → 非 off 清空快照（恢复）。 */
    set(sessionId, mode) {
        const old = this.get(sessionId);
        // 已有注入覆盖跨切档保留（#38：档位与注入正交，切档不动覆盖）
        const prev = this.entries.get(sessionId);
        const recall = prev?.recall;
        let resume = prev?.resume;
        if (mode === 'off' && old !== 'off') {
            resume = { scope: old, recall: recall ?? null };
        }
        else if (mode !== 'off' && old === 'off') {
            resume = undefined;
        }
        this.entries.set(sessionId, { mode, recall, resume, updatedAt: Date.now() });
        this.writeChain = this.writeChain.then(() => this.persist());
        if (old !== mode && this.onModeChange) {
            try {
                this.onModeChange(sessionId, old, mode);
            }
            catch (err) {
                this.logger?.warn(`[memory] 档位切换回调失败: ${errDetail(err)}`);
            }
        }
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
