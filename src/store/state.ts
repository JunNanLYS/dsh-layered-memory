/**
 * 管线 checkpoint 状态（移植 MemoryCore checkpoint/trigger 语义的精简版）。
 * 持久化在 <dataDir>/state.json。
 *
 * v2 起按族分桶（L2/L3 分族隔离后阈值计数、情境链各自独立）；
 * 旧平铺格式（v1）在 load 时整体迁入 chat 桶（历史数据由 chat 档蒸馏产出）。
 */
import * as path from 'node:path';
import type { MemoryFamily } from '../types.js';
import { atomicWriteJson, readJsonIfExists } from './io.js';

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

export function defaultState(): MemoryState {
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

interface StateFile {
  version: 2;
  families: Record<MemoryFamily, MemoryState>;
}

export class StateStore {
  // 声明即初始化：forFamily 在 load 完成前也安全（stats 面板可能早于 runner.init 拉取）
  private buckets: Record<MemoryFamily, MemoryState> = { chat: defaultState(), work: defaultState() };
  private migrated = false;

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    const raw = await readJsonIfExists<Partial<MemoryState> & { version?: number; families?: Record<string, Partial<MemoryState>> }>(this.file);
    if (!raw) return;
    if (raw.version === 2 && raw.families && typeof raw.families === 'object') {
      // v2：逐族宽容合并（新字段自动带默认值）
      this.buckets = {
        chat: { ...defaultState(), ...(raw.families.chat ?? {}) },
        work: { ...defaultState(), ...(raw.families.work ?? {}) },
      };
    } else {
      // v1 平铺 → 整体迁入 chat 桶（历史数据是 chat 档蒸馏产出）
      this.buckets = { chat: { ...defaultState(), ...raw }, work: defaultState() };
      this.migrated = true;
    }
  }

  /** v1 → v2 迁移发生时为 true（调用方记日志/落盘）。 */
  get didMigrate(): boolean {
    return this.migrated;
  }

  /** 取某族的 checkpoint（活引用——改字段后 save 生效）。 */
  forFamily(family: MemoryFamily): MemoryState {
    return this.buckets[family];
  }

  async save(): Promise<void> {
    const file: StateFile = { version: 2, families: this.buckets };
    await atomicWriteJson(this.file, file);
  }

  static pathFor(dataDir: string): string {
    return path.join(dataDir, 'state.json');
  }
}
