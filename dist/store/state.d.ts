import type { MemoryFamily } from '../types.js';
export interface MemoryState {
    /** 上次 L1 抽取时间（epoch ms）。 */
    lastExtractAt: number;
    /** 上次 L1 抽取得到的最后一个情境名（情境连续性用）。 */
    lastSceneName: string;
    /** L1 累计抽取条数。 */
    totalExtracted: number;
    /** 自上次 L2 整合以来的新记忆数。 */
    newMemoriesSinceL2: number;
    /** 上次 L2 整合时间。 */
    lastL2At: number;
    /** 自上次 L3 蒸馏以来的新记忆数。 */
    memoriesSinceL3: number;
    /** 上次 L3 蒸馏时间。 */
    lastL3At: number;
    /** L3 是否已生成过（冷启动判定）。 */
    hasPersona: boolean;
    /** L2 输出请求的 L3 更新原因（[PERSONA_UPDATE_REQUEST]）。 */
    personaRequestedReason?: string;
}
export declare function defaultState(): MemoryState;
export declare class StateStore {
    private readonly file;
    private buckets;
    private migrated;
    constructor(file: string);
    load(): Promise<void>;
    /** v1 → v2 迁移发生时为 true（调用方记日志/落盘）。 */
    get didMigrate(): boolean;
    /** 取某族的 checkpoint（活引用——改字段后 save 生效）。 */
    forFamily(family: MemoryFamily): MemoryState;
    /**
     * 重建用：两族 checkpoint 重置为默认值。
     * 必须原地突变（Object.assign）——runner.states 等处持有桶对象的活引用，
     * 换新对象会让引用指向已废弃的桶，后续计数写到内存孤儿上。
     */
    reset(): void;
    save(): Promise<void>;
    static pathFor(dataDir: string): string;
}
