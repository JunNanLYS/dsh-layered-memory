# DSH-MemBench — dsh-layered-memory 自动化记忆准确率基准

纯对话记忆场景库 + 无头自动驱动 + 程序/LLM 双级判分。对话赛道只跑 A 组（记忆开）出准确率硬数字；工作流赛道跑「A 组（记忆开）vs B 组（记忆关）」同输入对照（完成度 / 反问 / token 成本）。题型设计借鉴 [LongMemEval](https://github.com/xiaowu0162/longmemeval) / [LoCoMo](https://snap-research.github.io/locomo/) / [AMB](https://github.com/vectorize-io/agent-memory-benchmark)，0.8.5 起参照 [MemoryAgentBench](https://arxiv.org/abs/2507.05257) / [GoodAI LTM](https://github.com/GoodAI/goodai-ltm-benchmark) / BEAM 扩了四种题型与检索层离线指标。

## 结构

```
bench/
├─ scenarios/            # 20 个对话场景（chat×11 + work×9），前 15 个 6 题、新 5 个 10 题（共 140 题）
├─ scenarios-workflow/   # 8 个工作流场景（任务延续 ×4 / 流程更新 / 双胞胎消歧 / 风格规范 / 前瞻记忆）
├─ harness/
│  ├─ dsh-bench-runner/  # cordis 驱动包（装入 bench profile，apply 即跑）
│  ├─ patch-arm-on.yml   # A 组：记忆开 + 蒸馏提速 + 无工具面 + 基准 persona
│  ├─ patch-arm-lifecycle.yml # lifecycle 赛道：arm-on + benchControl（进程内控制服务）
│  ├─ patch-arm-off.yml  # B 组：插件整行禁用（同输入对照）
│  ├─ run.mjs            # 运行包装（AB 并行编排 + 启动清扫 + 链接守卫 + git SHA）
│  ├─ report.mjs         # 汇总 → markdown 总表（总分/分题型/更新专项/效率/探针段完成度/检索层/生命周期/规模位置）
│  ├─ compare.mjs        # 基线 vs 新跑回归对比（环境校验 + B 组漂移告警 + 检索层指标对比）
│  ├─ retrieval-metrics.mjs # 检索层离线指标库（recall@5/MRR 受控复现 + 注入精度 + --flood 灌水曲线）
│  ├─ fillers.json       # 噪声填充会话库（--noise 用；25 会话，主题域与场景错开、避开全部 marker）
│  └─ fixtures/          # 冒烟场景（dialog/ 与 workflow/ 分赛道子目录）
└─ results/              # 运行产物（gitignore；正式基线另存 baseline/）
```

## 一次性准备

```bash
# 1. 构建（bench profile 以 link: 指向本仓库，改代码后 build + 重跑即生效）
npm run build

# 2. 初始化 bench profile 并安装两个本地包（dsh rc.8 起全局安装、直接 `dsh`；
#    老布局可用 DSH_BIN 覆盖入口路径）
dsh plugin --profile bench add D:\Project\dsh-memory
dsh plugin --profile bench add D:\Project\dsh-memory\bench\harness\dsh-bench-runner

# 3. 场景库校验（可挂 CI）
node bench/harness/validate-scenarios.mjs bench/scenarios
```

## 模型与网关配置（bench.env）

被测 / 判卷 / 蒸馏三个模型角色可集中在 `bench/harness/bench.env` 配置——从模板复制后本地填写（**该文件含 API key，已被 .gitignore 排除，绝不入库**）：

```bash
cp bench/harness/bench.env.example bench/harness/bench.env
```

- **三个角色**：`BENCH_PROVIDER/BENCH_MODEL`（被测 Agent）、`BENCH_JUDGE_*`（判卷，缺省同被测）、`BENCH_DISTILL_*`（A 组蒸馏，缺省 deepseek-official/deepseek-v4-flash）；每个角色另有思考强度键 `*_REASONING_EFFORT`（词表由适配器持有：off/low/medium/high/xhigh/max…，OpenAI 系为 none；留空 = 不传跟随 provider 默认，蒸馏缺省 `off`）。对应的命令行参数（`--provider/--model/--effort/--judge-*/--distill-*`）优先于 env 文件。
- **自定义 OpenAI 兼容网关**：填 `BENCH_TEST_BASE_URL + BENCH_TEST_API_KEY`（判卷走独立网关再加 `BENCH_JUDGE_*` 一对）后，run.mjs 自动生成临时 patch 把网关注册为 `bench-gw` / `bench-judge-gw`（llm-pi-ai providers），并把 API key 注入本次运行的子进程环境（凭据服务从继承环境读取）。注意 providers 键整行替换——**配置网关后本次运行的自定义供应商完全由 bench.env 决定**（用户 settings.yaml 的自定义网关不参与；deepseek-official 等内置路由不受影响）；patch 随 `bench/results/.gw-*.patch.yml` 留痕。
- 被测模型缺省回落已移除：不配 `--provider/--model` 也不配 bench.env 会直接拒跑（原回落会命中 settings.yaml 默认模型、bench profile 无 adapter 时启动即炸，现在启动前拦截并给出可操作的提示）。

注意：系统 `settings.yaml` 的 `agent-default-model`（如 deepseek-vision）在 bench profile 里可能没有 adapter——**被测模型必须显式配置**（`--provider/--model` 或 bench.env；缺省回落已移除，未配置直接拒跑）。当前验证可用：deepseek-official / deepseek-v4-flash。

## 跑基准

跑基准时**自动拉起实时进度面板**并打开浏览器（`http://127.0.0.1:4173`，端口占用自动顺延）：A/B 双臂卡片、当前场景/阶段（教学/改版/蒸馏/探针/判分）、消息粒度 token 与工具数、场景清单、事件尾巴、累计成本。两个新鲜度指标直答"是不是卡了"——**心跳**（runner 每 5s 落一次；停止 = 进程退出/崩溃）与**活动**（最后一次状态更新；超 5min 变黄 = 长回复或疑似卡住）。

```bash
# 关闭自动面板：--no-panel（或环境变量 DSH_BENCH_NO_PANEL=1）
node bench/harness/run.mjs --no-panel ...

# 手动启动（盯历史/进行中的运行；--no-open 不弹浏览器）
node bench/harness/panel.mjs [--root <results目录>] [--port 4173] [--no-open]
```

数据面：`run.mjs` 启动时写 `run-*/plan.json`（arm/repeats/场景清单/模型指纹），bench-runner 向 `rep-N/progress.json` 原子增量写进度（≥1s 节流 + 5s 心跳）。面板只读这两个文件、只绑 127.0.0.1；progress.json 在结果目录不在沙箱内，被测 Agent 读不到，不影响指标。

## 对话赛道（准确率主表，只跑 A 组）

对话赛道**只运行 A 组**（记忆开）：Harness 里每个会话彼此独立，无记忆的 B 组探针必然失败（历史实测 17.8% ≈ 地板），对照无信息量；B 组对照保留在工作流赛道（那里的重新探索/反问代价是有效测量目标）。

```bash
# 冒烟（单场景快速验证管线；fixtures 已按赛道分子目录）
node bench/harness/run.mjs --arm A --provider deepseek-official --model deepseek-v4-flash \
  --scenarios bench/harness/fixtures/dialog

# 正式：3 次重复
node bench/harness/run.mjs --arm A --repeats 3 --provider deepseek-official --model deepseek-v4-flash
```

### 题型（6 核心 + 4 扩展）

每个场景必含 6 道核心题型（各恰 1 题）：`extraction`（抽取）/ `multihop`（多跳）/ `temporal`（时序）/ `update`（单步更新，考去重合并）/ `scene`（场景回忆，考 L2）/ `abstention`（拒答防编造）。

0.8.5起新增 4 道扩展题型（新场景各 1 题，老场景可逐步补齐）；承载它们的场景可带 **reinforce 补强教学会话**（0~2 个，夹在 teach 与 change 之间，被拆碎的 facts 跨会话投放）：

| 题型 | 考法 | 结构要求 |
|---|---|---|
| `accretive`（增量积累） | 一个完整事实拆到 teach/reinforce/change 多个会话各说一角，探针考拼装全貌——蒸馏是各存一份碎片还是合并成完整事实，一试便知 | 需 reinforce |
| `update-chain`（连锁更新） | 同一事实 v1→v2→v3 三次改口（gold=v3、stale=v1/v2），考多次去重合并的最终状态正确性；含"改回去"的回摆链（work-perm）最难 | 需 reinforce |
| `ordering`（事件排序） | 两个（或三个）时点事件分置不同会话，问先后顺序——考记忆的时间戳归属而非单点时间提取 | 事件跨会话 |
| `paraphrase`（同义改写） | 教学用原词、探针全程同义改写（如教"顶楼没电梯"问"楼层上有什么硬伤"），压测 FTS 二元组与向量路混合检索的词法缺口 | 无 |

校验器（validate-scenarios.mjs）强制：探题 6~10 道、六核心各恰 1 题、扩展各至多 1 题、`update`/`update-chain` 必须带 stale、reinforce 位于 teach 与 change 之间（碎片次序是题型语义的一部分）。

## 工作流赛道（复杂任务延续：省 token / 少探索的对照，A/B 双组）

```bash
# 冒烟（单场景）
node bench/harness/run.mjs --track workflow --arm A --provider deepseek-official --model deepseek-v4-flash \
  --scenarios bench/harness/fixtures/workflow

# 正式：两组并行（互不依赖，双进程并发，收尾自动出联合报告）
# --repeats 只作用于 A 组；B 组固定只跑 1 次（成本护栏：无记忆的长任务
# 每场景实测 1.81M 输入 token，多 rep 消耗过高）
node bench/harness/run.mjs --track workflow --arm AB --repeats 3 --provider deepseek-official --model deepseek-v4-flash

# 也可单组跑（自动配对另一组最新运行出报告）
node bench/harness/run.mjs --track workflow --arm A --provider deepseek-official --model deepseek-v4-flash
```

> 注意：**并行只能用 `--arm AB`**——手动开两个终端分别跑单组 A/B 时，后启动者的启动清扫会删掉前者的活跃 workspace（AB 模式有父进程统一清扫的守卫，手动并行没有）。

- 场景在 `bench/scenarios-workflow/`：教学会话讲清工作流约定并完成首批（工具在沙箱目录内真实执行）；探针会话给模糊延续任务（"再发一版"），**此前沙箱会重置到原始状态**（防 B 组从教学产物"考古"出流程）；
- 场景四类考法：**任务延续** ×4（事故处置 / 发版步骤 / 报表管线 / 站点登录取数）；**流程知识更新**（`wf-heap-update`：教学 v1 → 变更会话宣布改版 v2 → 探针考"现在生效的流程"——答出旧流程即旧产物复活，是 L1 去重更新的操作化度量）；**消歧与规范**（`wf-twin-runbook` 双胞胎 runbook，改错服务的配置由负检查判负；`wf-report-style` 考命名 / 结构 / 千分位 / 页脚等风格约定跨会话落地）；**前瞻记忆**（`wf-preflight`：教学时立下"每次生成前先写预检文件"的常设约定 + 首轮演练，探针只给模糊延续任务——A 组须凭记忆主动补预检步骤，B 组拿不到约定必然跳过；reteach 只重述任务机制、不含常设约定，防 B 组被救）；
- 完成度校验四型判据（`checks.js`）：`contains`（正检查）/ `notContains`（禁词，防误改）/ `absent`（旧流程专属产物不得复活）/ `exists`（只看有无）；流程更新场景用可选 `change` 会话（教学后同沙箱追加"改版"教学，重置只发生在探针前）；
- 指标：完成度校验（产物文件+关键内容，程序化）+ 反问次数 + 输入/输出 token / 步骤（供应商上报，含缓存命中拆分）；
- 工具面仅开 bash/fs/fs-search，权限 `bench-sandbox`（写限定沙箱、免审批）；runner 记录全部工具调用审计，疑似越出沙箱读记忆库会打 `snoopSuspect` 标记。

## 生命周期赛道（分族门控 / off 捕获 / rebuild 保真 / 遗忘请求，只跑 A 组）

考只有这套架构能测的东西——别人的基准没有 L0~L3 管线、分族档位与全量重建。复用对话场景库（默认取文件序前 2 chat + 前 2 work，`--scenarios` 可覆盖），零新场景文件：

```bash
node bench/harness/run.mjs --track lifecycle --arm A --provider deepseek-official --model deepseek-v4-flash \
  --scenarios <子集目录>   # 可选；库中须同时含 chat 族与 work 族场景
```

流程：主循环（教学 + 探针轮 1）之后追加四阶段，结果进 result.json 的 `lifecycle` 块（report 自动渲染）：

- **分族门控**：chat 档会话问 chat 题（阳性对照，应答对）+ work 题（阴性，应答不出）；work 档镜像。**异族泄漏非 0 = "写入与召回同档"不变量被打破**。抽题=每场景前 2 道有 gold 的题，阴性题强制 abstain-llm 判分；
- **off 档捕获**：off 会话教 2 条含唯一 nonce 的事实（`88417`/`SH-0921`）→ **双断言**——行为（auto 探针须拒答）+ 数据（records/conversations JSONL 全文不得出现 nonce，off 会话连 L0 都不该写）；rebuild 后复验（L0 未动 → 仍应缺席）；
- **rebuild 保真**：经 bench 控制服务触发 `rebuild-start`（从 L0 重导全部派生层）→ 探针轮 2 全量重问 → **准确率差（probe-2 − probe-1）**，显著回退即 rebuild 链路丢信息；
- **遗忘请求**（自然对话，考 L1 冲突检测的删除路径）：选首个 chat 场景一道 contains-all 题 → 遗忘会话要求删掉该记忆 → 蒸馏去重应作废旧记录 → 原题重问须拒答且不复述旧值。**注意现状语义：rebuild 从 L0 重导会复活旧事实（L0 只增不改）**——这是已知边界，不是 bug 判定。

**机制依赖**：patch 用 `patch-arm-lifecycle.yml`（= arm-on + 插件配置 `benchControl: true`）。插件据此注册进程内服务 `dsh-memory-bench`（rebuild 触发/状态轮询/会话档位设置——宿主侧 `connection.rpc` 只有 handle 没有 call，cordis 服务是唯一干净通道）；生产部署不开此配置，零表面积。compare 不覆盖 lifecycle（指标是赛道内对照，无跨运行基线语义）。

**门控泄漏的归因须知**（2026-08-23 修复前后实测）：被动通道（recall 注入/画像/场景导航）按档过滤，修复族标签后已干净；**`conversation_search` 工具通道查 L0 原文检索，L0 按设计不分族**——模型被工具指南引导主动调用时，异族事实仍可经原始对话查回（runner 记 `usedMemoryTool` 供归因）。这是「L0 不分族」设计的已知语义，是否给工具加档位过滤属待定的产品决策；泄漏非 0 时先看该标记再下结论。

## 规模退化（记忆库变大后还顶不顶得住）

两条互补路线：

1. **离线灌水（主，零运行成本）**：拿基准跑自己的库（教学蒸馏产物）复制一份，往副本灌 N 条确定性合成记录、重算 recall@k：

   ```bash
   node bench/harness/retrieval-metrics.mjs bench/results/run-A-<时间戳> --flood 100,400,1600
   ```

   合成记录主题域与场景库错开、全文零数字（防误撞数值型 gold）；每档独立复制原库，原库不动。0.8.3 存档库实测：36 条 → +400 条时 recall@5 70.2% → 65.8%。

2. **运行时噪声（辅，`--noise k`）**：对话赛道每个场景探针后插入 k 个填充会话（`fillers.json` 25 会话轮转，装载期断言不撞任何场景 marker——防假污染计数），测**端到端**准确率/污染随库容膨胀的退化；report 出「规模位置分析」节（前/中/后段三桶）。填充不是场景文件 → scenarioFiles 清单不变 → 跨 noise 档 compare 不触发环境告警，正好做 0/k 对照回归。成本提示：每个填充会话 = 2 条真实 LLM 轮次，k=5 × 20 场景 ≈ +200 轮/rep。



## 汇总

```bash
node bench/harness/report.mjs bench/results/run-A-<时间戳> bench/results/run-B-<时间戳> [--out bench/baseline/report.md]
# 工作流赛道
node bench/harness/report.mjs bench/results/run-wf-A-<时间戳> bench/results/run-wf-B-<时间戳>
```
报告含：准确率总表（分题型/更新专项/编造计数）、效率表（**输入 token 含缓存命中 + 输出 token + 轮次 + 步骤**，供应商上报值）、工作流完成度表、蒸馏超时与越界审计告警、**检索层指标**（见下），以及 lifecycle 跑的**生命周期赛道**节与对话跑的**规模位置分析**节。

### 检索层指标（离线确定性，零额外 LLM 成本）

report/compare 自动计算，也可独立跑 `node bench/harness/retrieval-metrics.mjs <runDir...>`（加 `--flood N1,N2` 出灌水曲线，见「规模退化」节）；数据源是各 rep 的 `memory/memory.db` 与 runner 落盘的 `recall.lines`（0.8.5 起）：

- **recall@5 / gold 覆盖 / MRR（分题型）**：用探针问题原文在 rep 最终记忆库上**受控复现** keyword 检索——SQL 形态、候选池 ×3、阈值 0.3 + 小语料例外、slice 5 与运行时逐项一致，查询构造与索引分词共用 dist 的 search-utils（token 对齐）；看 top5 里有没有 gold 要点、排第几。
- **注入精度（行级）**：实际注入的记忆行里含当题 gold 要点的占比；另计**注入含已作废信息**题数（update 类 stale 出现在注入行——更新失败在注入层直接可见，不用等判卷）。
- compare 的检索层对比表不依赖判卷与被测模型采样，是检索/注入管线改动（分词、阈值、融合、注入预算）的第一信号——比端到端钝器敏感。

口径边界（读数字前必知）：recall@5 是**受控复现**而非逐字复刻（运行时查询是会话尾部 8 条消息窗口，此处用探针原文；记忆库取 rep 结束态，全场景累积，跨运行同口径）；该跑启用向量时运行时走 hybrid，此处 FTS-only 为近似（报告自动标注）；注入行经预算截断（单条 ≤500 字符），gold 落在截断尾巴时注入精度被低估。

### 记忆开销（效率三角：注入延迟 / 注入占比 / 蒸馏记账）

「记忆的开销」三角，与工作流赛道已测的"记忆节省"（B 组重新探索 token）配成完整 ROI。report 自动计算（0.8.5 起 runner 采集；旧运行自动跳过该节）：

- **注入开销**：事件时间戳在步骤派发时统一落盘（recall 与 user 消息同毫秒），**注入钩子自身耗时不可观测**——开销用「注入轮 vs 无注入轮的轮次响应差分」表达（轮次响应 = user 消息 → 首个 assistant 流式事件），A 组内自成基线，无需 B 组；
- **注入占比**：探针轮的注入字符 / 该轮输入 token（usage 折叠）——中文按仓库口径 1 字 ≈ 1 token 保守折算，报告标注近似；
- **蒸馏记账**：插件常开计数器（`src/llm-usage.ts`）按层累计蒸馏调用的输入字符/输出/思考 token，runner 经 bench 控制服务收尾读取（patch-arm-on / arm-lifecycle 均已开 `benchControl`），**摊到每条捕获消息**（runner 统计的 user+assistant 驱动消息数）。输入侧记字符是因为 dsh llm 流的 usage 块不含输入 token；lifecycle 跑另有 rebuild 前后差分的专属用量。

> 模型说明：默认 `deepseek-official/deepseek-v4-flash`（稳定）。自定义 OpenAI 兼容网关走 `bench.env` 的 `BENCH_TEST/JUDGE_BASE_URL + API_KEY`（见上节，自动注册临时 provider 并注入 key）；系统 settings.yaml 里配置的自有网关**不参与**被测/判卷路由（配置网关后本次运行的自定义供应商完全由 bench.env 决定），正式基线建议官方直连。

## 回归对比（改插件后）

```bash
# 改动前基线（首次正式跑的结果存 bench/baseline/）
# ……修改插件、npm run build……
node bench/harness/run.mjs --arm A --repeats 3 --provider deepseek-official --model deepseek-v4-flash
node bench/harness/compare.mjs bench/baseline/run-A bench/results/run-A-<新> [基线B 新B] --out compare.md
```

compare 的判定规则：环境头一致 + A 组总分提升超 ±5pp 噪声带 + 无题型单项回归 → **正向**；B 组漂移 >10pp → 疑似环境漂移而非插件改动。注意 compare 只覆盖对话赛道的题型准确率（工作流赛道人工比 report 的完成度 / 反问 / token 表）；扩场景库后与旧基线 compare 会因场景清单不一致告警"环境不一致"——此时重跑基线，或用 `--scenarios` 指向同子集目录对比。

## 运行机制（关键事实）

- **A/B 组切换与记忆隔离**：同一场景库、逐字相同教学输入；A 组插件全开（dataDir 指向本次运行专属目录，未设置直接启动失败防误写日常库），B 组插件整行 `disabled: true`（无捕获/无蒸馏/无召回/无工具注入）。组间与用户日常记忆库三层互不可见。对话赛道只跑 A 组（见上）；工作流赛道支持 `--arm AB` 双进程并行。
- **记忆生命周期（rep 粒度）**：一个 rep 的记忆库**从第一次蒸馏起全程保留、跨场景累积，rep 结束才废弃**——越靠后的场景记忆越多、检索干扰越大，抗干扰能力由 contamination 指标量化（每个场景埋唯一 `marker` 词，探针召回注入里出现**其他场景**的 marker 即计污染，report 汇总；工作流探针同样实测）。rep 之间换新库：重复测量的独立性要求每次都从"新用户从零积累"起步。
- **仓库外 workspace + 运行前清扫**：对话会话与工作流沙箱的 cwd 都在系统临时目录的干净 workspace（`%TEMP%/dsh-mem-bench/<run>-rep<N>/`），斩断宿主 agent-instructions 沿父链读取仓库 AGENTS.md 的路径（曾使每个会话首请求多 19KB 注入）。每次运行开始前清扫历史残留（跨运行"考古"通道）：`%TEMP%/dsh-mem-bench/` 全部旧沙箱与 `~/.dsh/sessions` 里 projectKey 含 `dsh-mem-bench` 的会话目录——只匹配 bench 命名空间，用户自己的会话与数据不受影响；AB 并行模式清扫只在父进程做一次。
- **代码指纹与链接守卫**：结果头 environment 记 `pluginVersion` + `gitSha`（版本号反映不了"实际加载的代码"）；run.mjs 启动时校验 bench profile 的 `dsh-layered-memory` / `dsh-bench-runner` 链接指向被测仓库，指向别的工作树（旧代码）直接拒绝运行——2026-08-21 实测被旧 runner 静默咬过（change 会话整段缺失、判据空过）。
- **越界读取双档审计**（工作流赛道）：权限模型只限写不限读，硬防线在审计——严格档（参数出现 `~/.dsh`、`memory.db`、records/conversations/scenes 存储路径）命中即**该场景全部检查判负**并逐条写明原因；宽松档（`.dsh` 泛匹配等）仅提示人工复核。合法主动召回通道（memory_search / conversation_search / memory_read_scene 的调用）不进审计，防误判。
- **无工具面**（对话赛道）：patch 禁掉全部面向模型的工具行（bash/fs/web/subagent…），并注入基准 persona——否则 Agent 会拿 shell 翻真实 `~/.dsh/memory` 作弊/污染（冒烟期实测踩过）。`tools` 运行时服务本身保留（记忆插件硬依赖）。
- **蒸馏等待**：A 组 patch 设 `extract.minMessages=1, idleSeconds=30`；runner 轮询 `records/*.jsonl` 行数稳定后进探针，超时标记 `distillTimeout` 不中断。
- **判分两级**：`contains-all`（gold 关键词全中且 stale 不中，程序判）与 `llm`/`abstain-llm`（判卷模型按要点判，答案全文留痕于 result.json 供人工抽检）。工作流完成度四型判据（`checks.js`）：`contains`/`notContains`/`absent`/`exists`；report 对工作流另出**探针段完成度**单列（教学/变更段两臂都有现场上下文，探针段才是纯记忆窗口）。
- **指标来源**：全部从会话事件流折叠（steps/输出 token/轮次错误原因），不依赖 zstd 会话落盘。
- **模型钉死**：`--provider/--model` 走 runner 侧 agentOptions，绕开 settings.yaml 对默认模型的热替换；结果头部记录环境（含 gitSha），report/compare 校验一致性。判卷模型默认同被测模型（自判偏置），正式跑建议 `--judge-provider/--judge-model` 换模型。

## 已知边界

- 单次运行有噪声（LLM 采样 + 判卷），正式结论需 ≥3 次重复取均值；
- 端到端准确率是钝器：检索层改动可能不翻题（模型靠鲁棒性兜底）——已补确定性检索层指标（recall@5 / 注入精度，见「汇总」节），但它复现的是 keyword 路：启用向量的跑是 FTS-only 近似，且注入精度受预算截断影响；向量路离线复现需要重嵌入查询，暂不做；
- 扩展题型样本量小（每题型每 rep 5 题），只用于暴露粗缺陷与定向对比，不做精细百分比结论——扩样本=给更多场景补扩展题（校验器已放行 6~10 题）；
- 生命周期赛道单 rep 即可读（指标是赛道内对照：门控矩阵/双断言/轮间差），多 rep 只对遗忘与门控的抽样噪声有帮助；灌水曲线是确定性计算，无采样噪声；
- 判卷人即作者，fixture 的 gold 可被人工抽检复核（result.json 里有每题答案原文）。
