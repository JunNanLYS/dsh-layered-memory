/**
 * 共享类型定义（移植自 MemoryCore 的会话/记忆数据模型，做 DSH 适配裁剪）。
 */
/** 记忆族标签推断：work_* 前缀 → work，其余（含 auto 档兜底）→ chat。 */
export function familyForType(type) {
    return type.startsWith('work') ? 'work' : 'chat';
}
