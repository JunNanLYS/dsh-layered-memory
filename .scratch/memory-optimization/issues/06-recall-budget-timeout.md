# 06 — 召回预算与超时纯函数层

**What to build:** 召回注入的长度约束（单条 500 / 整轮 2000 字符，超限截断并提示用记忆工具查全文、低分尾部先丢）与时间约束（总预算 5s、远程嵌入 fetch 内层钳 3s、超时跳过本轮）作为纯函数与配置落地——为消息侧注入通道提供直接输入。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 预算函数：单条截断（code point 安全）+ 总量预算 + 截断后缀 + 尾部丢弃
- [ ] 超时：召回总预算 5s（Promise.race，超时返回空）；远程嵌入调用内层钳 3000ms（固定值）；本地推理不钳
- [ ] 新配置：`recall.maxCharsPerMemory`=500、`recall.maxTotalRecallChars`=2000、`recall.timeoutMs`=5000（0=关闭预算）
- [ ] 冒烟：截断语义、后缀文案、超时行为、配置默认值
