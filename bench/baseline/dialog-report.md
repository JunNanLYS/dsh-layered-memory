# DSH-MemBench 结果报告

生成时间：2026-08-20T08:35:45.239Z

## 环境
```
A 组 bench/results/run-A-2026-08-20T07-35-32/rep-1：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，15 场景）
A 组 bench/results/run-A-2026-08-20T07-35-32/rep-2：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，15 场景）
A 组 bench/results/run-A-2026-08-20T07-35-32/rep-3：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，15 场景）
B 组 bench/results/run-B-2026-08-20T08-14-29/rep-1：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，15 场景）
B 组 bench/results/run-B-2026-08-20T08-14-29/rep-2：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，15 场景）
B 组 bench/results/run-B-2026-08-20T08-14-29/rep-3：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，15 场景）
```

## 总表（准确率 = 探题答对 / 总题数，多次运行合并）

| 组 | 次数 | 题数 | 总准确率 | 抽取 | 多跳 | 时序 | 更新 | 场景 | 拒答 | 更新专项 | 拒答失败 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A 组（记忆开） | 3 | 270 | **92.6%** | 45/45 | 45/45 | 43/45 | 31/45 | 41/45 | 45/45 | 31/45 | 0 |
| B 组（记忆关） | 3 | 270 | **17.8%** | 3/45 | 0/45 | 0/45 | 0/45 | 0/45 | 45/45 | 0/45 | 0 |

> 拒答失败 = 拒答题未通过数（编造或未否认）；更新专项直接考核记忆去重更新（答出旧信息计 0）。
>
> **记忆生命周期**：一个 rep 的记忆库从第一次蒸馏起全程保留、跨场景累积（rep 结束才废弃）——越靠后的场景记忆越多，检索干扰越大。
>
> ⚠ **跨场景污染**（探针召回注入里出现其他场景的 marker）：A 组 144 次——chat-food ← chat-entertainment(尘封十三载)、chat-language ← chat-family(襄阳)、chat-language ← chat-fitness(可调哑铃)、chat-personal-basic ← chat-fitness(可调哑铃)、chat-personal-basic ← chat-language(大家的日语) 等。

## 效率次表（每场景均值，教学+变更+探针全会话合计；输入含缓存命中）

| 组 | 场景数 | 轮次/场景 | 步骤/场景 | 输入 token/场景 | 输出 token/场景 | 稳态缓存率 |
|---|---|---|---|---|---|---|
| A 组 | 45 | 9.0 | 12.3 | 63355 | 2178 | 88.7% |
| B 组 | 45 | 9.0 | 9.0 | 6398 | 1122 | 85.4% |

> 输入/输出 token 为供应商上报值（usage 事件）；输入 = 非缓存 inputTokens + 缓存命中 cacheReadTokens。稳态缓存率剔除每会话首请求（新会话首问的前缀天然未命中，不代表引擎健康度；跨会话前缀缓存共享还受跑序影响）。

## 召回分析（双通道分离）

| 组 | 探针注入次数 | 注入召回率（gold 要点在该题注入中） | 主动调记忆工具的题数 | 其中工具兜底答对 |
|---|---|---|---|---|
| A 组 | 259/270 | **75.1%**（169/225） | 84 | 60 |
| B 组 | 0/270 | **0.0%**（0/225） | 0 | 0 |

> 被动通道 = 消息侧召回注入（`<relevant-memories>`）；主动通道 = 模型按需调用 memory_search / conversation_search。注入召回率量的是检索+注入管线本身；端到端准确率 = 两通道 + 模型利用的合成结果。工具兜底答对 = 注入未命中但靠记忆工具查回并答对的题数。

