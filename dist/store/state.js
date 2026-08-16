/**
 * 管线 checkpoint 状态（移植 MemoryCore checkpoint/trigger 语义的精简版）。
 * 持久化在 <dataDir>/state.json。
 *
 * v2 起按族分桶（L2/L3 分族隔离后阈值计数、情境链各自独立）；
 * 旧平铺格式（v1）在 load 时整体迁入 chat 桶（历史数据由 chat 档蒸馏产出）。
 */
import * as path from 'node:path';
import { atomicWriteJson, readJsonIfExists } from './io.js';
export function defaultState() {
    return {
        lastExtractAt: 0,
        lastSceneName: '',
        totalExtracted: 0,
        newMemoriesSinceL2: 0,
        lastL2At: 0,
        memoriesSinceL3: 0,
        lastL3At: 0,
        hasPersona: false,
    };
}
export class StateStore {
    file;
    // 声明即初始化：forFamily 在 load 完成前也安全（stats 面板可能早于 runner.init 拉取）
    buckets = { chat: defaultState(), work: defaultState() };
    migrated = false;
    constructor(file) {
        this.file = file;
    }
    async load() {
        const raw = await readJsonIfExists(this.file);
        if (!raw)
            return;
        if (raw.version === 2 && raw.families && typeof raw.families === 'object') {
            // v2：逐族宽容合并（新字段自动带默认值）
            this.buckets = {
                chat: { ...defaultState(), ...(raw.families.chat ?? {}) },
                work: { ...defaultState(), ...(raw.families.work ?? {}) },
            };
        }
        else {
            // v1 平铺 → 整体迁入 chat 桶（历史数据是 chat 档蒸馏产出）
            this.buckets = { chat: { ...defaultState(), ...raw }, work: defaultState() };
            this.migrated = true;
        }
    }
    /** v1 → v2 迁移发生时为 true（调用方记日志/落盘）。 */
    get didMigrate() {
        return this.migrated;
    }
    /** 取某族的 checkpoint（活引用——改字段后 save 生效）。 */
    forFamily(family) {
        return this.buckets[family];
    }
    /**
     * 重建用：两族 checkpoint 重置为默认值。
     * 必须原地突变（Object.assign）——runner.states 等处持有桶对象的活引用，
     * 换新对象会让引用指向已废弃的桶，后续计数写到内存孤儿上。
     */
    reset() {
        for (const family of ['chat', 'work']) {
            Object.assign(this.buckets[family], defaultState());
            this.buckets[family].personaRequestedReason = undefined;
        }
    }
    async save() {
        const file = { version: 2, families: this.buckets };
        await atomicWriteJson(this.file, file);
    }
    static pathFor(dataDir) {
        return path.join(dataDir, 'state.json');
    }
}
