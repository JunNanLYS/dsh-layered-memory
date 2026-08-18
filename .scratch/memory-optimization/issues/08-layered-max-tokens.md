# 08 — LLM 分层输出预算

**What to build:** 蒸馏各层显式传输出预算（L1 抽取 16k / L1 去重 8k / L2 场景整合 32k / L3 画像 16k）；思考档为 high/max 时各层预算自动 ×4（reasoning 吃预算的历史事故防线）；总闸默认 256_000 → 65_536 兜底。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 各蒸馏层调用显式传分层预算
- [ ] 思考档 high/max → 预算 ×4 规则（纯函数）
- [ ] `llm.maxTokens` 默认降至 65_536（仍高于全部分层值）
- [ ] 冒烟：×4 规则、配置默认值；现有各节保持通过
