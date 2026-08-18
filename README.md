<div align="center">

<img src="./assets/img/Hero.png" width="100%"
     alt="DeepSeek Harness hero 横幅：对话自动分层蒸馏成记忆，模型每步前自动召回注入——右侧对话气泡逐层溶解为三层渐亮光带，流入带发光圆球与渐变轨道的玻璃胶囊（下有 日常·工作·智能·关闭 四档刻度），光丝回流示意召回注入">

# dsh-layered-memory

**DeepSeek Harness 的分层蒸馏记忆插件：对话在后台自动完成 L0 捕获 → L1 原子记忆 → L2 场景整合 → L3 画像蒸馏，模型每一步前自动把相关记忆注入上下文。**

[English](README.en.md) · [最新发行版](https://github.com/JunNanLYS/dsh-layered-memory/releases/latest) · [反馈问题](https://github.com/JunNanLYS/dsh-layered-memory/issues)

[![main 0.7.1](https://img.shields.io/badge/main-0.7.1-6f83ff?style=flat-square)](https://github.com/JunNanLYS/dsh-layered-memory/tree/main)
[![DSH 0.1.0-rc.6](https://img.shields.io/badge/DSH-0.1.0--rc.6-8b5cf6?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![MIT License](https://img.shields.io/badge/license-MIT-536990?style=flat-square)](LICENSE)

</div>

## 快速开始

需要 Node ≥ 22.16。两种调用方式任选（`npx` 前缀可替换下面任何 `dsh` 命令）：

```bash
# 方式一：npx 直接跑官方 CLI（无需预装 dsh；可 pin 版本，如 dsh-layered-memory@0.7.1）
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

插件挂在 dsh 原生事件上（`session/event` 捕获、`agent/pre-step` 注入），蒸馏调用复用宿主 `ctx.llm`。召回以**消息侧注入**呈现：相关记忆作为一条带插件署名的合成消息排在用户新消息之前，用户在会话流里能直接看到"记忆生效了"；注入内容有长度预算与时间预算，超限截断/超时跳过，绝不拖慢对话。

**记忆工具(3):**
- memory_search
- conversation_search
- memory_read_scene

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
  <img src="./assets/img/EmbeddingSource.png" width="100%"
       alt="设置页语义检索（嵌入源）面板（浅色主题）：三态选择器（关闭/本地/远程，本地选中）显示当前嵌入源与首次启用自动安装运行时提示；下方本地模型目录列出 BGE small 中文（使用中/已就绪）、EmbeddingGemma 300M（下载 316MB）、BGE-M3（下载 560MB）三款模型的维度/上下文/体积/特点与下载入口">
</p>

三种嵌入源：**关闭**（默认，纯 BM25 关键词检索）、**远程**（自备任意 OpenAI 兼容
`/embeddings` 服务，`embedding.*` 四件套配齐才可选）、**本地**（内置模型目录选一款，
ONNX 量化 **CPU 推理**——无需 API Key，数据不出本机）。本地模型目录是插件内置
白名单（每款锁定 revision + 每文件 sha256，不可下载任意仓库）。

- **下载**：模型卡一键下载（默认镜像 `hf-mirror.com`，断点续传 + sha256 完整性
  校验），落盘数据目录 `models/<id>/`，不用了随时在设置页删除；
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
    llm:                     # 蒸馏模型路由（不写则跟随当前默认模型）
      provider: ''
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
| `llm.provider/model` | 空 | 蒸馏模型覆盖（默认用当前默认选择） |
| `llm.maxTokens` | `65536` | 未分层调用的兜底输出总闸。各蒸馏层有独立预算（抽取 16k / 去重 8k / L2 32k / L3 16k；思考档 high/max 时自动 ×4，防 reasoning 吃光预算） |
| `llm.reasoningEffort` | `off` | 蒸馏思考档位（部署默认）：`off` / `high` / `max`，空串不传（跟随模型默认）。蒸馏是结构化抽取任务，默认关思考——推理模型（如 v4-flash）默认 high 档的思考可把任意输出预算全部吃光导致正文 0 字符；非推理模型不认识 effort 时需设为空串。运行时可在设置页 → 记忆 → 概览临时切换（选"跟随配置"即回退本值） |
| `llm.temperature` | `0.3` | 蒸馏温度 |
| `llm.maxInputChars` | `700000` | 单次蒸馏输入字符预算（超限的 L1 输入自动分块抽取） |
| `llm.timeoutMs` | `120000` | 单次蒸馏调用超时（ms） |
| `tools` | `true` | 是否注册模型可调用的记忆工具 |

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
