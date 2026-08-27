/**
 * 记忆占用流水存储：sessionId → OccupancyLedger 的持久化映射。
 *
 * 动机（2026-08-27 票07）：占用账本是进程内存态，dsh 重启后历史会话"窗口里明明
 * 有记忆、账面却为零"，指示器对重启前注入的存量失明。本存储让账目跨进程复生：
 * - 每次账本迁移后写穿（recall-dedupe 同款：串行化原子写 + 失败降级内存态）；
 * - 查询热路径仍是同步内存读——文件只在迁移时刻与启动载入时触碰；
 * - stock 归零的条目不落盘（compaction 复位即天然删除）；
 * - agent 销毁不删记录（持久化语义与召回去重一致：会话恢复后账目继续）；
 * - 90 天未更新过期清理 + 会话条目上限（session-modes/dedupe 同款量级）。
 */
import * as path from 'node:path';
import { errDetail } from '../util/filelog.js';
import { atomicWriteJson, ensureDir, readJsonIfExists } from './io.js';
/** 会话条目上限（按 updatedAt 淘汰最旧；防文件无限增长）。 */
export const OCCUPANCY_SESSION_CAP = 200;
/** 条目过期清理（90 天未更新即丢弃，与 session-modes/dedupe 同款量级）。 */
const PRUNE_MS = 90 * 24 * 3600_000;
export class OccupancyStore {
    logger;
    file;
    entries = new Map();
    persistFailed = false;
    /** 串行化持久化写（避免并发原子写撞临时文件名）；init 链最前（先载入再落盘，防丢更新）。 */
    writeChain;
    constructor(dataDir, logger) {
        this.logger = logger;
        this.file = path.join(dataDir, 'occupancy.json');
        this.writeChain = this.init();
    }
    /** 载入持久化账目（合并进内存——构造与载入之间发生的 save 不丢）；失败降级内存态。 */
    async init() {
        const data = await readJsonIfExists(this.file);
        if (!data?.sessions || typeof data.sessions !== 'object')
            return;
        const now = Date.now();
        let count = 0;
        for (const [sid, entry] of Object.entries(data.sessions)) {
            if (typeof entry?.stockTokens !== 'number')
                continue;
            if (now - (entry.updatedAt ?? 0) > PRUNE_MS)
                continue;
            const existing = this.entries.get(sid);
            if (existing) {
                if (entry.updatedAt > existing.updatedAt)
                    this.entries.set(sid, { ...entry });
            }
            else {
                this.entries.set(sid, { ...entry });
            }
            count++;
        }
        if (count > 0)
            this.logger?.info(`[memory] 记忆占用账目载入 ${count} 个会话`);
    }
    /**
     * 该会话的持久化账目（热路径同步读；从未注入/已复位返回 null）。
     * 返回**浅拷贝**——调用方（ledgerFor 复生）会在其上做迁移；若交出内部引用，
     * 原地修改会让 save() 的 prev/ledger 恒等比较误判“数值未变”而跳过写穿（实测踩坑）。
     */
    load(sessionId) {
        const e = this.entries.get(sessionId);
        return e ? { ...e } : null;
    }
    /**
     * 迁移后写穿。数值未变只刷新内存时间戳不落盘（profile 稳定区每次请求组装都
     * 触发迁移，但内容不变时不应产生文件写）；stock 归零即删除条目。
     */
    save(sessionId, ledger) {
        const prev = this.entries.get(sessionId);
        const sameNumbers = prev !== undefined &&
            prev.stockTokens === ledger.stockTokens &&
            prev.recallTokens === ledger.recallTokens &&
            prev.profileTokens === ledger.profileTokens &&
            prev.lastInjectTokens === ledger.lastInjectTokens;
        if (sameNumbers) {
            prev.updatedAt = ledger.updatedAt;
            return;
        }
        if (ledger.stockTokens <= 0) {
            if (prev === undefined)
                return;
            this.entries.delete(sessionId);
        }
        else {
            this.entries.set(sessionId, { ...ledger });
        }
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
                this.logger?.warn(`[memory] 记忆占用持久化失败（降级内存态）: ${errDetail(err)}`);
            }
        }
    }
    serialize() {
        const now = Date.now();
        for (const [sid, e] of this.entries) {
            if (now - e.updatedAt > PRUNE_MS && e.updatedAt > 0)
                this.entries.delete(sid);
        }
        while (this.entries.size > OCCUPANCY_SESSION_CAP) {
            let oldest;
            let oldestAt = Infinity;
            for (const [sid, e] of this.entries) {
                if (e.updatedAt > 0 && e.updatedAt < oldestAt) {
                    oldest = sid;
                    oldestAt = e.updatedAt;
                }
            }
            if (oldest === undefined)
                break;
            this.entries.delete(oldest);
        }
        const sessions = {};
        for (const [sid, e] of this.entries) {
            if (e.stockTokens <= 0)
                continue; // 归零条目不落盘
            sessions[sid] = { ...e };
        }
        return { version: 1, sessions };
    }
}
