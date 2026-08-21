<div align="center">

<img src="./assets/img/Hero.png" width="100%"
     alt="DeepSeek Harness hero 横幅：对话自动分层蒸馏成记忆，模型每步前自动召回注入——右侧对话气泡逐层溶解为三层渐亮光带，流入带发光圆球与渐变轨道的玻璃胶囊（下有 日常·工作·智能·关闭 四档刻度），光丝回流示意召回注入">

# dsh-layered-memory

**DeepSeek Harness 的分层蒸馏记忆插件：对话在后台自动完成 L0 捕获 → L1 原子记忆 → L2 场景整合 → L3 画像蒸馏，模型每一步前自动把相关记忆注入上下文。**

[English](README.en.md) · [最新发行版](https://github.com/JunNanLYS/dsh-layered-memory/releases/latest) · [反馈问题](https://github.com/JunNanLYS/dsh-layered-memory/issues)

[![npm version](https://img.shields.io/npm/v/dsh-layered-memory?color=6f83ff&style=flat-square&label=npm)](https://www.npmjs.com/package/dsh-layered-memory)
[![DSH 0.1.0-rc.8](https://img.shields.io/badge/DSH-0.1.0--rc.8-8b5cf6?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![MIT License](https://img.shields.io/badge/license-MIT-536990?style=flat-square)](LICENSE)

</div>

## 快速开始

需要 Node ≥ 22.16。两种调用方式任选（`npx` 前缀可替换下面任何 `dsh` 命令）：

```bash
# 方式一：npx 直接跑官方 CLI（无需预装 dsh；可 pin 版本，如 dsh-layered-memory@0.8.2）
npx -y @deepseek-ai/dsh plugin --profile web add dsh-layered-memory

# 方式二：已装 dsh CLI（dsh 是 pnpm 转发器，未装 pnpm 时先 npm i -g pnpm）
dsh plugin --profile web add dsh-layered-memory

# 包源备选：GitHub 仓库 / 本地路径（开发调试，link: 指向仓库，npm run build + 重启 dsh 即生效）
dsh plugin --profile web add https://github.com/JunNanLYS/dsh-layered-memory
dsh plugin --profile web add /path/to/dsh-layered-memory
```

### 让 Agent 安装（推荐）

如果当前 Agent 可以执行终端命令，把下面这段话完整发送给它：

```text
请为 DeepSeek Harness 的 web Profile 安装 dsh-layered-memory 插件。

只执行下面两条命令，不要修改其他 Profile：
dsh plugin --profile web add dsh-layered-memory
dsh --profile web --dump-config

确认输出中出现 dsh-layered-memory 后告诉我安装结果。
不要替我关闭或重启正在运行的 DSH；安装完成后提醒我手动重启 DSH Web Host。
```

Agent 应当返回安装结果，并明确告诉你配置中是否已经出现 `dsh-layered-memory`。

本包声明了 `dsh.bundle` 组合包层（`cordis.patch.yml`），安装后会**自动挂载插件行**——
不需要再手改 `$DSH_HOME/profiles/web/cordis.patch.yml`。然后重启 DeepSeek Harness，
验证：`~/.dsh/memory/` 下出现 `conversations/ records/ scenes/` 目录和 `memory.db`
即插件 apply 成功；设置页出现"记忆"页面、输入栏出现档位 pill 即 client 半边就绪。

**卸载**：`dsh plugin --profile web remove dsh-layered-memory` + 重启。数据保留在
`~/.dsh/memory/`，不需要时手动删除整个目录即可。

### 从源码开发

```bash
git clone https://github.com/JunNanLYS/dsh-layered-memory
cd dsh-layered-memory
npm install && npm run build
dsh plugin --profile web add .        # link: 安装，改代码后 npm run build + 重启 dsh 即生效
npm run smoke                         # 冒烟测试（先重编：见下方命令）
npx tsc src/smoke.ts --outDir dist-smoke --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck --esModuleInterop
```

## 运行时数据流

<p align="center">
  <img src="./assets/readme/flow.svg" width="100%"
       alt="dsh-layered-memory 运行时数据流：左侧 User 与 Assistant 的会话事件流入插件（L0 捕获、L1–L3 蒸馏、检索召回、记忆工具），插件经 agent/pre-step 把相关记忆注入右侧 DSH 核心；蒸馏复用核心的 ctx.llm，数据双写 ~/.dsh/memory/">
</p>

插件挂在 dsh 原生事件上（`session/event` 捕获、`agent/pre-step` 注入），蒸馏调用复用宿主 `ctx.llm`。召回以**消息侧注入**呈现：相关记忆作为一条合成消息排在用户新消息之前，会话流里显示为**"上下文注入 · memory"**行（点开看命中内容）——用户能直接看到"记忆生效了"；注入内容有长度预算与时间预算，超限截断/超时跳过，绝不拖慢对话。

**记忆工具(3):**
- memory_search
- conversation_search
- memory_read_scene

真机实录：召回注入与工具调用在对话里的样子——"上下文注入 · memory"行先带出相关记忆，模型再按需调 `memory_read_scene` 读取场景块，凭记忆直接作答：

<p align="center">
  <img src="./assets/img/MemoryTools.png" width="60%"
       alt="对话界面实录（浅色主题）：用户消息"我们最近要干什么？"上方可见"上下文注入 · memory"行；助手回答前列出 4 次 memory_read_scene 工具调用（参数为 scenes 场景块的 .md 文件名），随后凭记忆梳理近期目标与推进路线">
</p>

在只开放代码执行入口的受限会话中，模型经由 `run_code` 间接调用记忆工具（轨迹视图中的 SUBTOOL 嵌套）：

<p align="center">
  <img src="./assets/img/ToolTrajectory.png" width="80%"
       alt="工具调用轨迹视图：顶部彩色时间线与左侧步骤列表（SYSTEM/CONTEXT/USER/ASSISTANT/TOOL/SUBTOOL 彩色标签），run_code 工具步骤内嵌套 5 次 memory_read_scene 子工具调用（SUBTOOL 标记），右侧为所选步骤的详情面板">
</p>

## 分层记忆（L0–L3）

<p align="center">
  <img src="./assets/img/Layers.png" width="100%"
       alt="分层记忆四层（自左上向右下逐层精炼）：L0 原始对话（对话气泡）→ L1 原子记忆（发光事实粒子）→ L2 场景块（玻璃文档板）→ L3 核心画像（发光晶核）；层间由 LLM 提取/整合/蒸馏光束相连，宽度递减表示数据逐层精炼">
</p>

## 会话级记忆档位

<p align="center">
  <img src="./assets/img/Modes.png" width="100%"
       alt="会话级记忆档位：一条玻璃胶囊滑轨四个停点（日常·工作·智能·关闭），发光圆球停在智能（默认）档；各档上方微场景——日常为个人聊天气泡、工作为代码文档窗格、智能为双流合流最亮、关闭为暗淡虚线幽灵泡">
</p>

- **控件**：输入栏内、模式选择器右侧的 pill（`记忆·自动`），点击在上方浮出档位滑块深浅主题自适应；
- 每会话的选择按 sessionId 持久化到 `session-modes.json`，重启/恢复会话不丢；
  与全局开关叠加（全局是总闸）；L2/L3 完全分类，分类内容不渗透。

## 界面预览

<p align="center">
  <img src="./assets/img/ui-dark.jpg" width="49.5%"
       alt="深色主题下的设置页记忆浏览器概览：状态卡（插件版本、捕获/蒸馏/召回开关状态、FTS 与向量能力、L1 记忆计数、蒸馏模型）与统计瓦片，玻璃质感控件与冷蓝强调色">
  <img src="./assets/img/ui-light.jpg" width="49.5%"
       alt="浅色主题下的同一设置页记忆浏览器概览：同款布局与信息，浅色卡片底与同套强调色，主题切换无需重载">
</p>

## 实测对比（DSH-MemBench：自动化基准）

图文回答"长什么样"，这一节用**自动化基准**的实测数字回答"**开了到底有什么用**"（[`bench/`](./bench/)，一条命令可复现）。方法：同场景库、逐字相同输入，**A 组（记忆开）** 与 **B 组（记忆关）** 各跑 3 次取合并值；环境 DeepSeek 官方 `deepseek-v4-flash`、插件 0.8.0、Windows；题型设计借鉴 [LongMemEval](https://github.com/xiaowu0162/longmemeval) / [LoCoMo](https://snap-research.github.io/locomo/) / [AMB](https://github.com/vectorize-io/agent-memory-benchmark)。

### 对话赛道（15 场景 × 6 题型 × 3 次 = 270 题/组）：答得准吗

<p align="center">
  <img src="./assets/readme/bench-dialog.svg" width="100%"
       alt="DSH-MemBench 对话赛道 A/B 对照条形图：A 组（记忆开）总准确率 92.6%（250/270），B 组（记忆关）17.8%（48/270）；分题型各 45 题——抽取 A 45/45 对 B 3/45、多跳 A 45/45 对 B 0/45、时序 A 43/45 对 B 0/45、知识更新 A 31/45 对 B 0/45、场景回忆 A 41/45 对 B 0/45、拒答两组均 45/45 且 0 编造">
</p>

**召回双通道**（A 组）：被动注入召回率 **75.1%**（该题要点出现在召回注入中，169/225），其余多数由模型**主动调用记忆工具**查回——84 题主动查询、**60 题靠工具兜底答对**；端到端 92.6% 是两通道 + 模型利用的合成结果。记忆库跨场景全程累积下，探针召回注入混入其他场景记忆 144 次（已如实计数），总准确率仍稳在 92.6%——抗干扰能力经受住了膨胀记忆库的考验。

### 工作流赛道（4 场景 × 3 次，真实工具沙箱）：做得对、做得省吗

<p align="center">
  <img src="./assets/readme/bench-workflow.svg" width="100%"
       alt="DSH-MemBench 工作流赛道 A/B 对照图：任务完成度 A 组 24/33（72.7%）对 B 组 11/33（33.3%）；成本对比（B 组为满格基准）——步骤 125 对 186（B +49%）、工具调用 184 对 296（B +61%）、输入 token 1.30M 对 1.86M（B +43%）；向用户求助 A 0 次对 B 3 次；登录场景输入 token A 241k 对 B 453k（+88%）">
</p>

**登录场景特写**（凭据只存在于记忆，站点为本地服务、令牌不可伪造）：A 组三次全部**一轮直取**完成（6/6，241k 输入）；B 组每次都要**反问用户要凭据**（3 次求助、双倍轮次）才完成 5/6，输入 453k——**+88%**。这正是记忆的核心价值之一：**省掉的不是任务难度，是无谓的往返与重复教学**。

### 方法论与复现

```bash
node bench/harness/run.mjs --arm A --repeats 3 --provider deepseek-official --model deepseek-v4-flash
node bench/harness/run.mjs --arm B --repeats 3 --provider deepseek-official --model deepseek-v4-flash   # 对话赛道
node bench/harness/run.mjs --track workflow --arm A/B --repeats 3 ...                                  # 工作流赛道
node bench/harness/report.mjs --latest [dialog|workflow]                                               # 汇总报告
```

- 判分：`contains-all` 程序判 + 判卷模型按要点判（答案原文与判分理由全部留痕 `result.json` 可人工复核）；工作流完成度为产物文件 + 关键内容程序化校验；
- 指标全部来自供应商上报 usage（输入含缓存命中拆分）与会话事件折叠；**稳态缓存率**剔除每会话首请求（A 88.7% vs B 85.4%——记忆注入不伤缓存）；
- 回归用途：改插件前后各跑一遍，`compare.mjs` 出对比表（环境头校验 + B 组对照组漂移告警）；
- 局限（诚实声明）：单机 ×3 次合并、判卷模型与被测模型同源、作者自建场景库（倾向记忆优势场景，欢迎自行复现）；工具审计会标记越界访问（实测 Agent 偶发探测用户主目录，本基准场景答案不存于真实记忆库、数字不受影响）。

完整报告与逐题数据：[`bench/baseline/`](./bench/baseline/)。

## 存储布局

<p align="center">
  <img src="./assets/readme/storage.svg" width="100%"
       alt="存储布局：双写架构（JSONL 事实源只增不改 + memory.db 主检索库）；文件形态含 conversations/records/scenes/persona/state/pending/session-modes/embedding-source/模型目录/推理运行时/日志与重建归档；检索三策略 keyword/embedding/hybrid（RRF k=60）；降级链保证永不阻塞宿主">
</p>

向量能力默认关闭（纯 FTS）。DSH 的 `ctx.llm` 无 embeddings 端点，语义检索由
**三态嵌入源**提供（关闭 / 远程 / 本地），设置页可运行时切换——见下节。

## 语义检索（嵌入源）

设置页（记忆 → 概览 → 语义检索）选择嵌入源，即时生效、无需改配置重启：

<p align="center">
  <img src="./assets/img/EmbeddingSource.png" width="70%"
       alt="设置页语义检索（嵌入源）面板（浅色主题）：三态选择器（关闭/本地/远程，本地选中）显示当前嵌入源与首次启用自动安装运行时提示；下方本地模型目录列出 BGE small 中文（使用中/已就绪）、EmbeddingGemma 300M（下载 316MB）、BGE-M3（下载 560MB）三款模型的维度/上下文/体积/特点与下载入口">
</p>

三种嵌入源：**关闭**（默认，纯 BM25 关键词检索）、**远程**（自备任意 OpenAI 兼容
`/embeddings` 服务，`embedding.*` 四件套配齐才可选）、**本地**（内置模型目录选一款，
ONNX 量化 **CPU 推理**——无需 API Key，数据不出本机）。本地模型目录是插件内置
白名单（每款锁定 revision + 每文件 sha256，不可下载任意仓库）。

- **下载**：模型卡一键下载（默认镜像 `hf-mirror.com`，断点续传 + sha256 完整性
  校验；直连不可达时可走代理——默认自动探测 `HTTPS_PROXY`/`ALL_PROXY` 等环境
  变量，见 `embedding.proxy`）。单文件失败自动重试且换缓存键（`?dshmem-retry=N`，
  绕开镜像 CDN 偶发的坏缓存对象），校验失配从零重下、网络错误保留断点续传；
  落盘数据目录 `models/<id>/`，不用了随时在设置页删除；
- **按需运行时**：首次切换本地档才安装推理运行时（transformers.js，约 100~200MB，
  装进数据目录 `runtime/`——不进插件依赖树，不碰插件安装目录）；
- **活切换**：一键换源——自动后台全量重嵌（进度可见、可取消，期间检索自动降级
  关键词，不影响对话；维度变化时向量表按新维度重建）；切换失败保持旧源，重启仍按原源运行；
- **生效规则 = 部署上限 AND 运行时选择**：`embedding.allowLocalModels=false` 可整体
  禁用本地档、未配 `embedding.*` 四件套则远程档不可选（企业部署可收口），状态持久
  化在 `embedding-source.json`。

## 配置

覆盖配置写在 profile 自己的 `cordis.patch.yml`，用**顶层裸 patch 条目**（直接 `id:`，
不要包在 `insert:` 里——insert 与 bundle 层同 id 追加会导致 `duplicate loader entry id`
启动失败）：

```yaml
- id: dsh-memory
  name: dsh-layered-memory
  config:                    # 键按行整体替换（不深合并），按需写全要保留的键
    family: auto             # 新会话默认档：auto | chat | work
    llm:                     # 蒸馏模型静态路由（双字段齐 = 部署 pin，优先于设置页选择；
      provider: ''           # 留空则跟随设置页"蒸馏模型"选择器或当前默认模型）
      model: ''
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `family` | `auto` | 新会话默认记忆档位：`auto`（双族自动）\| `chat`（个人）\| `work`（工作）；会话内可用输入栏控件临时切换 |
| `dataDir` | `$DSH_HOME/memory` | 数据目录 |
| `capture.enabled` | `true` | L0 捕获 |
| `capture.stripCodeBlocks` | `true` | 助手消息剥离代码块 |
| `capture.maxMessageChars` | `4000` | 单条消息最大字符数 |
| `extract.enabled` | `true` | L1 抽取 |
| `extract.minMessages` | `6` | 稳态触发阈值：单会话攒够 N 条新消息跑一次 L1 抽取。起步阶段生效阈值从 1 翻倍爬坡到此值（首轮即出记忆，随后自动攒批省调用） |
| `extract.idleSeconds` | `300` | 闲置兜底：会话静默 N 秒后把未蒸馏切片落袋（接住"没攒够阈值用户就离开"）；`0` 关闭 |
| `extract.backgroundMessages` | `10` | 抽取时附带的背景消息条数（按会话从 L0 现查，会话间互不污染） |
| `extract.candidatePool` | `5` | 去重候选池大小 |
| `l2.enabled` | `true` | L2 场景整合 |
| `l2.minNewMemories` | `5` | 距上次 L2 整合的新记忆阈值 |
| `l2.maxScenes` | `12` | 场景块数量上限 |
| `l2.sceneContextLimit` | `3` | L2 prompt 附带的相似场景全文上限 |
| `l3.enabled` | `true` | L3 画像蒸馏 |
| `l3.interval` | `20` | L3 蒸馏间隔（新记忆条数） |
| `recall.enabled` | `true` | 自动召回 |
| `recall.maxResults` | `5` | 每条新用户消息前注入的 L1 条数上限 |
| `recall.maxCharsPerMemory` | `500` | 单条注入记忆的字符上限（超限截断并提示用记忆工具查全文）；`0` 不限 |
| `recall.maxTotalRecallChars` | `2000` | 整轮注入总字符上限（超限按相关性丢尾部）；`0` 不限 |
| `recall.timeoutMs` | `5000` | 召回总预算（ms）：超时跳过本轮注入、不阻塞对话；`0` 不限时 |
| `recall.includePersona` | `true` | 系统提示注入画像上下文（`<user-persona>`，稳定区） |
| `recall.includeSceneNav` | `true` | 系统提示注入场景导航（`<scene-navigation>`，稳定区） |
| `recall.strategy` | `hybrid` | 检索策略：`keyword` / `embedding` / `hybrid` |
| `recall.scoreThreshold` | `0.3` | 召回分数阈值（低于不注入；仅 keyword/embedding 策略生效，hybrid 融合前不过滤；工具路径不过滤） |
| `embedding.enabled` | `false` | 向量检索开关；关闭即纯 FTS 运行 |
| `embedding.baseUrl` | 空 | OpenAI 兼容 /embeddings 地址（如 `https://api.siliconflow.cn/v1`） |
| `embedding.apiKey` | 空 | API Key |
| `embedding.model` | 空 | embedding 模型名 |
| `embedding.dimensions` | `0` | 向量维度（启用时必填，须与模型输出一致） |
| `embedding.maxInputChars` | `5000` | 单条文本最大字符数（超长截断） |
| `embedding.timeoutMs` | `10000` | 单次 embedding 调用超时（ms） |
| `embedding.allowLocalModels` | `true` | 允许本地嵌入档（部署上限：关闭后设置页不能下载模型、不能切本地档） |
| `embedding.mirror` | `https://hf-mirror.com` | 本地模型下载镜像根地址（可改回官方 `https://huggingface.co`） |
| `embedding.proxy` | `''` | 模型下载代理三态：`''`（默认）= 自动探测代理环境变量（`HTTPS_PROXY`/`ALL_PROXY` 等，尊重 `NO_PROXY`）；`none` = 禁用强制直连；其他值 = 代理 URL（如 `http://127.0.0.1:7890`）。镜像直连在国内网络间歇不可达（直连超时与污染字节交替出现过），开代理的机器建议保持默认自动探测 |
| `llm.provider/model` | 空 | 蒸馏模型静态路由（部署 pin）：provider 与 model **双字段齐**时锁定蒸馏路由，优先于设置页的运行时选择与默认模型（部署可强制蒸馏走指定路由）；留空则跟随"设置页选择 → 默认模型"。运行时可在设置页 → 记忆 → 概览的"蒸馏模型"选择器从**已配置的供应商**（含 dsh 设置 → 模型里添加的自定义供应商）中切换，即时生效无需重启 |
| `llm.maxTokens` | `65536` | 未分层调用的兜底输出总闸。各蒸馏层有独立预算（抽取 16k / 去重 8k / L2 32k / L3 16k；思考档 high/xhigh/max 时自动 ×4，防 reasoning 吃光预算），分层预算可在设置页 → 记忆 → 概览 → 蒸馏参数运行时调整（留空/0 = 跟随内置默认） |
| `llm.reasoningEffort` | 空 | 蒸馏思考档位：空串 = **自动**（按模型能力解析：模型默认档 → `high`）；显式值（`off`/`none`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`）仅在该模型声明支持时发送——跨供应商 effort 词汇表不同（deepseek 认 `off`，OpenAI 系是 `none`，未声明档位的模型不传），不支持的档位自动降级为不传并告警一次；思考档 high/xhigh/max 时输出预算自动 ×4。运行时在设置页 → 记忆 → 概览切换，可选档位表跟随当前模型实时显示 |
| `llm.temperature` | `0.3` | 蒸馏温度 |
| `llm.maxInputChars` | `700000` | 单次蒸馏输入字符预算（超限的 L1 输入自动分块抽取）；运行时可在设置页 → 蒸馏参数 → 输入预算调整（留空/0 = 跟随本值） |
| `llm.timeoutMs` | `120000` | 单次蒸馏调用超时（ms） |
| `tools` | `true` | 是否注册模型可调用的记忆工具 |

## 日志与故障排查

dsh 宿主把插件日志打到控制台；插件另把 info 级以上镜像到数据目录的 `memory.log`。
一轮对话的典型日志路径：`L0 捕获` → `L0 落盘` → `蒸馏管线开始` → `LLM 调用（输入/输出
字符数、耗时）` → `L1 阶段完成` → `管线结束`；下一轮开头是 `召回注入 N 条 L1`。LLM 空输出
带完整诊断（finish reason / token 计数 / reasoning 摘录）；JSON 解析失败记录模型原始输出
前 400 字符；所有失败告警带堆栈首帧。JSONL 事实源按轮次追加、依赖操作系统写回（不做逐条
fsync），断电等极端崩溃最多丢最后一小段尾部，检索库可用「重建记忆」从事实源全量重导。

## 与 MemoryCore 的差异

- 内嵌完整管线（不依赖外部 Gateway），蒸馏复用 DSH 自己的 LLM；
- L2/L3 由"LLM 操作文件工具"改为"LLM 输出操作 JSON / 完整文档，工程侧执行"；
- 召回注入点在 `agent/pre-step`（消息侧合成消息，官方 pre-step 替换语义）+ agent 作用域 `systemPrompt.context`（画像/导航稳定区，DSH 原生事件/服务）；
- 存储/检索即官方 sqlite 后端的单机裁剪版（裁掉多租户隔离列、TCVDB 云后端、审计表；
  分词与官方一致用 jieba——@node-rs/jieba 预编译二进制 + CJK 二元组并集，
  词元供 BM25 精确整词命中、二元组保子词召回；加载失败自动回退纯二元组，
  FTS 索引按分词器版本戳自动重建）。

## 路线图

以下为规划中的功能，欢迎在 [Issues](https://github.com/JunNanLYS/dsh-layered-memory/issues) 反馈需求与优先级：

- [ ] **Git 分支感知**：记忆与当前 git 分支关联，召回可按分支过滤/加权（与现有记忆档位正交）
- [ ] **Claude Code / Codex 记忆导入**：一键迁移既有记忆资产（`CLAUDE.md`、Claude Code 记忆文件、Codex `AGENTS.md` 等），导入后进入分层蒸馏管线

## 致谢

记忆核心能力（分层蒸馏管线、Prompt 设计、双写存储架构）参考自
[TencentCloud/TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory)
项目中的 **MemoryCore**，感谢原项目开放的设计与实现。

## License

[MIT](LICENSE)
