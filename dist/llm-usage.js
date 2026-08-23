/**
 * 蒸馏用量追踪（进程内累计计数器，常开——纯内存累加，无 IO）：
 * callLLM 按层（l1-extract/l1-dedup/l2/l3）累计调用数、输入字符、输出/思考 token。
 *
 * 用途：基准的「记忆开销」记账（效率三角之一）——L1/L2/L3 蒸馏消耗摊到每条
 * 捕获消息，与工作流赛道已测的"记忆节省"（B 组重新探索的 token）配成完整 ROI。
 * 暴露面：bench 控制服务 getDistillUsage()（config.benchControl 门控）。
 *
 * 输入侧说明：dsh llm 流的 usage 块只携带 output/reasoning token，输入 token
 * 拿不到——按仓库既有口径记输入**字符**（中文 1 字 ≈ 1 token 保守折算，
 * 见 config.ts maxInputChars 注释），报告侧如实标注。
 */
const counters = new Map();
function bucketOf(layer) {
    let b = counters.get(layer);
    if (!b) {
        b = { calls: 0, failures: 0, inputChars: 0, outputTokens: 0, reasoningTokens: 0 };
        counters.set(layer, b);
    }
    return b;
}
/** 单次调用用量累计（callLLM 出口调用；inputChars 为实际发送的用户 prompt 字符）。 */
export function recordDistillCall(layer, inputChars, outputTokens, reasoningTokens, failed) {
    const b = bucketOf(layer);
    b.calls++;
    if (failed)
        b.failures++;
    b.inputChars += Math.max(0, Math.round(inputChars));
    b.outputTokens += Math.max(0, Math.round(outputTokens));
    b.reasoningTokens += Math.max(0, Math.round(reasoningTokens));
}
/** 深拷贝快照（消费方拿到后不受后续累计影响）。 */
export function snapshotDistillUsage() {
    const layers = {};
    for (const [layer, b] of counters) {
        layers[layer] = { ...b };
    }
    return { layers };
}
