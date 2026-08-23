/**
 * 共享类型定义（移植自 MemoryCore 的会话/记忆数据模型，做 DSH 适配裁剪）。
 */
/** 记忆族标签推断：work_* 前缀 → work，其余（含 auto 档兜底）→ chat。 */
export function familyForType(type) {
    return type.startsWith('work') ? 'work' : 'chat';
}
/** 抽取输出的 family 字段归一：只认 chat|work，其余（缺省/非法值）交由调用方回落。 */
export function normExtractedFamily(raw) {
    return raw === 'chat' || raw === 'work' ? raw : undefined;
}
/** 记录族三级兜底链：会话档位强制（纯档）→ 抽取显式判定（auto）→ type 前缀推导（旧输出兜底）。 */
export function resolveRecordFamily(forced, extracted, type) {
    return forced ?? normExtractedFamily(extracted) ?? familyForType(type);
}
