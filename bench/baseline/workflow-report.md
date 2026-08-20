# DSH-MemBench 结果报告

生成时间：2026-08-20T09:52:57.201Z

## 环境
```
A 组 bench/results/run-wf-A-2026-08-20T08-28-55/rep-1：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，4 场景）
A 组 bench/results/run-wf-A-2026-08-20T08-28-55/rep-2：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，4 场景）
A 组 bench/results/run-wf-A-2026-08-20T08-28-55/rep-3：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，4 场景）
B 组 bench/results/run-wf-B-2026-08-20T08-58-26/rep-1：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，4 场景）
B 组 bench/results/run-wf-B-2026-08-20T08-58-26/rep-2：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，4 场景）
B 组 bench/results/run-wf-B-2026-08-20T08-58-26/rep-3：deepseek-official/deepseek-v4-flash（判卷 deepseek-official/deepseek-v4-flash，插件 0.8.0，4 场景）
```

## 总表（准确率 = 探题答对 / 总题数，多次运行合并）

| 组 | 次数 | 题数 | 总准确率 | 抽取 | 多跳 | 时序 | 更新 | 场景 | 拒答 | 更新专项 | 拒答失败 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A 组（记忆开） | 3 | 0 | **0.0%** | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0 |
| B 组（记忆关） | 3 | 0 | **0.0%** | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0 |

> 拒答失败 = 拒答题未通过数（编造或未否认）；更新专项直接考核记忆去重更新（答出旧信息计 0）。
>
> **记忆生命周期**：一个 rep 的记忆库从第一次蒸馏起全程保留、跨场景累积（rep 结束才废弃）——越靠后的场景记忆越多，检索干扰越大。
>
> 跨场景污染：A 组 0 次（探针召回未引入其他场景的记忆）。

## 效率次表（每场景均值，教学+变更+探针全会话合计；输入含缓存命中）

| 组 | 场景数 | 轮次/场景 | 步骤/场景 | 输入 token/场景 | 输出 token/场景 | 稳态缓存率 |
|---|---|---|---|---|---|---|
| A 组 | 12 | 2.0 | 21.2 | 232128 | 14550 | 96.8% |
| B 组 | 12 | 2.3 | 37.3 | 2190707 | 29553 | 99.1% |

> 输入/输出 token 为供应商上报值（usage 事件）；输入 = 非缓存 inputTokens + 缓存命中 cacheReadTokens。稳态缓存率剔除每会话首请求（新会话首问的前缀天然未命中，不代表引擎健康度；跨会话前缀缓存共享还受跑序影响）。

## 工作流赛道（复杂任务延续：完成度校验 + 反问次数）

| 组 | 场景数 | 完成度校验 | 探针反问次数 |
|---|---|---|---|
| A 组 | 12 | 46/57 | 0 |
| B 组 | 12 | 35/57 | 3 |

> ⚠ 疑似越出沙箱读取记忆库的运行：A、B 组（见 result.json 的 toolAudit）
> 完成度 = 产物文件与关键内容校验（程序化）；反问 = 探针会话中 agent 向用户求助次数（补发固定重述，token 如实计入）。

