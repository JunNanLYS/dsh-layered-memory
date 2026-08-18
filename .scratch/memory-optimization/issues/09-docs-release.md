# 09 — 文档同步与 0.8.0 发版收尾

**What to build:** 行为变化与新配置全部落进文档并 bump 版本——README 中英双语同步、CHANGELOG 记录、AGENTS.md 增补新架构铁律、版本号 0.8.0。

**Blocked by:** 01–08 全部

**Status:** ready-for-agent

- [ ] README.md / README.en.md：新配置表（预算/超时/闲置时长/稳态阈值语义）、行为变化说明（注入可见化、触发节奏）
- [ ] CHANGELOG：注入通道、默认值变化、会话隔离修复、FTS 写路径修复
- [ ] AGENTS.md 架构边界新铁律：切片永不跨会话/档位混装；注入消息必须带插件来源与 recall 形态；FTS 防御删除必须先点查
- [ ] package.json 版本 0.8.0
