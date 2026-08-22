# DSH-MemBench — dsh-layered-memory 自动化记忆准确率基准

纯对话记忆场景库 + 无头自动驱动 + 程序/LLM 双级判分。对话赛道只跑 A 组（记忆开）出准确率硬数字；工作流赛道跑「A 组（记忆开）vs B 组（记忆关）」同输入对照（完成度 / 反问 / token 成本）。题型设计借鉴 [LongMemEval](https://github.com/xiaowu0162/longmemeval) / [LoCoMo](https://snap-research.github.io/locomo/) / [AMB](https://github.com/vectorize-io/agent-memory-benchmark)。

## 结构

```
bench/
├─ scenarios/            # 15 个对话场景（chat×8 + work×7），每场景 6 题共 90 题
├─ scenarios-workflow/   # 7 个工作流场景（任务延续 ×4 / 流程更新 / 双胞胎消歧 / 风格规范）
├─ harness/
│  ├─ dsh-bench-runner/  # cordis 驱动包（装入 bench profile，apply 即跑）
│  ├─ patch-arm-on.yml   # A 组：记忆开 + 蒸馏提速 + 无工具面 + 基准 persona
│  ├─ patch-arm-off.yml  # B 组：插件整行禁用（同输入对照）
│  ├─ run.mjs            # 运行包装（AB 并行编排 + 启动清扫 + 链接守卫 + git SHA）
│  ├─ report.mjs         # 汇总 → markdown 总表（总分/分题型/更新专项/效率/探针段完成度）
│  ├─ compare.mjs        # 基线 vs 新跑回归对比（环境校验 + B 组漂移告警）
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

## 对话赛道（准确率主表，只跑 A 组）

对话赛道**只运行 A 组**（记忆开）：Harness 里每个会话彼此独立，无记忆的 B 组探针必然失败（历史实测 17.8% ≈ 地板），对照无信息量；B 组对照保留在工作流赛道（那里的重新探索/反问代价是有效测量目标）。

```bash
# 冒烟（单场景快速验证管线；fixtures 已按赛道分子目录）
node bench/harness/run.mjs --arm A --provider deepseek-official --model deepseek-v4-flash \
  --scenarios bench/harness/fixtures/dialog

# 正式：3 次重复
node bench/harness/run.mjs --arm A --repeats 3 --provider deepseek-official --model deepseek-v4-flash
```

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
- 场景三类考法：**任务延续** ×4（事故处置 / 发版步骤 / 报表管线 / 站点登录取数）；**流程知识更新**（`wf-heap-update`：教学 v1 → 变更会话宣布改版 v2 → 探针考"现在生效的流程"——答出旧流程即旧产物复活，是 L1 去重更新的操作化度量）；**消歧与规范**（`wf-twin-runbook` 双胞胎 runbook，改错服务的配置由负检查判负；`wf-report-style` 考命名 / 结构 / 千分位 / 页脚等风格约定跨会话落地）；
- 完成度校验四型判据（`checks.js`）：`contains`（正检查）/ `notContains`（禁词，防误改）/ `absent`（旧流程专属产物不得复活）/ `exists`（只看有无）；流程更新场景用可选 `change` 会话（教学后同沙箱追加"改版"教学，重置只发生在探针前）；
- 指标：完成度校验（产物文件+关键内容，程序化）+ 反问次数 + 输入/输出 token / 步骤（供应商上报，含缓存命中拆分）；
- 工具面仅开 bash/fs/fs-search，权限 `bench-sandbox`（写限定沙箱、免审批）；runner 记录全部工具调用审计，疑似越出沙箱读记忆库会打 `snoopSuspect` 标记。

## 汇总

```bash
node bench/harness/report.mjs bench/results/run-A-<时间戳> bench/results/run-B-<时间戳> [--out bench/baseline/report.md]
# 工作流赛道
node bench/harness/report.mjs bench/results/run-wf-A-<时间戳> bench/results/run-wf-B-<时间戳>
```

报告含：准确率总表（分题型/更新专项/编造计数）、效率表（**输入 token 含缓存命中 + 输出 token + 轮次 + 步骤**，供应商上报值）、工作流完成度表、蒸馏超时与越界审计告警。

> 模型说明：默认 `deepseek-official/deepseek-v4-flash`（稳定）。自有网关（settings.yaml 的 llm-pi-ai providers，如 my-ai-gateway/Auto-Free）经验证可用——凭据走 dsh 凭据服务解析，仓库不落任何密钥——但免费档实测有流式空闲超时抖动，正式基线建议官方直连。

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
- 端到端准确率是钝器：检索层改动可能不翻题（模型靠鲁棒性兜底）——结果 JSON 已结构化，后续可加确定性检索层指标（recall@k）；
- 判卷人即作者，fixture 的 gold 可被人工抽检复核（result.json 里有每题答案原文）。
