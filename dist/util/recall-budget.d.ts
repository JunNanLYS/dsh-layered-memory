/**
 * 召回预算与超时（ADR-0001 / 规格 A 节；机制移植自 MemoryCore auto-recall 的
 * applyRecallBudget，超时为 dsh 侧新增的总预算语义）。
 *
 * 预算：单条记忆截断上限 + 整轮总量上限——超限截断并以后缀引导模型用记忆工具
 * 查全文（截断是引流而不是损失：工具路径返回完整记录）；总量超限按融合排名丢尾部。
 * 超时：召回是增强能力，超时跳过本轮注入、绝不阻塞对话（CONTEXT.md「召回超时」语义
 * 在本模块以 raceTimeout 落地）。
 */
/** 截断后缀：显式告诉模型全文在工具侧（引导主动深挖，原版同款设计）。 */
export declare const RECALL_TRUNCATION_SUFFIX = "\u2026\uFF08\u5DF2\u622A\u65AD\uFF1B\u53EF\u7528 memory_search \u6216 conversation_search \u67E5\u770B\u8BE6\u60C5\uFF09";
export interface RecallBudgetLimits {
    /** 单条记忆注入长度上限（字符）；0 = 不限。 */
    maxCharsPerMemory: number;
    /** 整轮注入总量上限（字符）；0 = 不限。超限时低分（排名靠后）尾部先丢。 */
    maxTotalRecallChars: number;
}
/** 按 code point 计数截断（不劈开代理对），带引导后缀。 */
export declare function truncateRecallLine(line: string, maxChars: number): string;
/**
 * 对召回行施加预算：先逐条截断，再按总量预算装填——装不下的尾部整条丢弃。
 * 输入行应按相关性降序（低分先丢）。
 */
export declare function applyRecallBudget(lines: string[], limits: RecallBudgetLimits): string[];
/**
 * 召回总预算：超时返回 undefined（调用方跳过本轮注入），正常 resolve 返回原值。
 * resolve 为空结果（空数组）与超时（undefined）语义不同，调用方据此区分日志。
 */
export declare function raceRecallTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined>;
/** 召回路径远程嵌入 fetch 的内层钳制（固定值）：给 FTS 降级留出总预算内的时间。
 *  仅作用于远程 HTTP 调用；本地推理不受钳制（进程内 CPU 推理无挂起风险）。 */
export declare const RECALL_EMBED_CAP_MS = 3000;
