/**
 * 共享类型定义（移植自 MemoryCore 的会话/记忆数据模型，做 DSH 适配裁剪）。
 */

/** 蒸馏 Prompt 家族：chat = 个人记忆（persona/episodic/instruction + 用户画像），work = 工作记忆（work_fact/work_task/work_method/work_artifact + Team Operating Doctrine）。 */
export type MemoryFamily = 'chat' | 'work';

/** 会话记忆档位：auto = 双族自动判定 | chat/work = 单族 | off = 本会话对记忆系统隐身。 */
export type MemoryMode = 'auto' | 'chat' | 'work' | 'off';

/** 蒸馏可用的档位（off 在捕获侧被拦截，永远到不了管线）。 */
export type ExtractMode = 'auto' | 'chat' | 'work';

/** 记忆族标签推断：work_* 前缀 → work，其余（含 auto 档兜底）→ chat。 */
export function familyForType(type: string): MemoryFamily {
  return type.startsWith('work') ? 'work' : 'chat';
}

/** 日志接口（适配 ctx.logger）。 */
export interface MemoryLogger {
  debug?(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** L0 会话消息（与 MemoryCore 的 ConversationMessage 对齐）。 */
export interface ConversationMessage {
  /** 唯一消息 ID（L1 prompt 的 source_message_ids 追踪用）。 */
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** epoch ms */
  timestamp: number;
}

/** L0 JSONL 记录（一条消息一行）。 */
export interface L0MessageRecord {
  sessionId: string;
  recordedAt: string;
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/** L1 抽取产出（LLM 返回的记忆条目，尚未分配 record id）。 */
export interface ExtractedMemory {
  content: string;
  type: string;
  priority: number;
  source_message_ids: string[];
  metadata: Record<string, unknown>;
  /** 所属情境名（L1 抽取的情境切分结果）。 */
  scene_name: string;
  /** auto 档抽取输出的显式族判定（chat|work；纯档 Prompt 无此字段）。
   *  语境归族、形状不归族——修复"个人计划性事实被 work_* 形状吸走"的族错标
   *  （2026-08-23 lifecycle 赛道实测发现）。 */
  family?: string;
}

/** 抽取输出的 family 字段归一：只认 chat|work，其余（缺省/非法值）交由调用方回落。 */
export function normExtractedFamily(raw: unknown): MemoryFamily | undefined {
  return raw === 'chat' || raw === 'work' ? raw : undefined;
}

/** 记录族三级兜底链：会话档位强制（纯档）→ 抽取显式判定（auto）→ type 前缀推导（旧输出兜底）。 */
export function resolveRecordFamily(forced: MemoryFamily | undefined, extracted: unknown, type: string): MemoryFamily {
  return forced ?? normExtractedFamily(extracted) ?? familyForType(type);
}

/** L1 持久化记录（字段对齐 MemoryCore；version/source_message_ids/metadata 由写入侧补默认）。 */
export interface MemoryRecord {
  id: string;
  content: string;
  type: string;
  priority: number;
  scene_name: string;
  /** 合并/更新时保留的时间戳并集。 */
  timestamps: number[];
  createdAt: number;
  updatedAt: number;
  /** 每次 update/merge 合并 +1（官方语义）。 */
  version?: number;
  /** 来源消息 id（JSONL 事实源保留；检索库不存储该列）。 */
  source_message_ids?: string[];
  /** 类型附加信息（episodic 的活动起止时间等）。 */
  metadata?: Record<string, unknown>;
  /** 来源会话（缺省 default；跨会话记忆共享）。 */
  sessionId?: string;
  /** 所属族（写入时缺省由 familyForType(type) 回填；召回/浏览/去重候选按族过滤的唯一依据）。 */
  family?: MemoryFamily;
}

/** L2 场景块摘要（META 解析结果）。 */
export interface SceneSummary {
  path: string;
  created: string;
  updated: string;
  summary: string;
  heat: number;
}

/** L1 检索命中。 */
export interface L1Hit {
  id: string;
  content: string;
  type: string;
  scene_name: string;
  score: number;
  priority?: number;
  family?: MemoryFamily;
}
