# dsh-layered-memory

DeepSeek Harness 的 **L0~L3 分层蒸馏记忆插件**（持久组合插件）。移植自
[MemoryCore](https://github.com/TencentDB-Agent-Memory)（TencentDB Agent Memory）的
记忆管线设计：Prompt 原样保留，仅把"LLM 操作文件"的 L2/L3 流程适配为"LLM 输出、工程侧执行"。

## 分层模型

| 层 | 名称 | 内容 | 存储 |
| --- | --- | --- | --- |
| L0 | 原始对话 | 每轮 user/assistant 消息（清洗去噪、剥离代码块与注入标签） | `conversations/YYYY-MM-DD.jsonl` + SQLite 检索库 |
| L1 | 原子记忆 | LLM 情境切分 + 记忆提取（chat: persona/episodic/instruction；work: work_fact/work_task/work_method/work_artifact；自动档七类全开）+ 冲突检测去重合并，**每条带族标签** | `records/YYYY-MM-DD.jsonl` + SQLite 检索库（FTS5 + 可选向量，family 列） |
| L2 | 场景块 | LLM 把新记忆整合为 Markdown 场景文档（META 块、热度管理、合并上限、场景导航），**按族各自整合** | `scenes/chat/*.md`、`scenes/work/*.md` |
| L3 | 核心画像 | LLM 从变化场景蒸馏画像（chat: 用户画像 ≤2000 字；work: Team Operating Doctrine ≤1200 字），**每族一份** | `persona-chat.md`、`persona-work.md` |

## 工作流

```
session/event ──(turn/end)──▶ L0 落盘
                                 │
                                 ▼
                          L1 抽取 + 去重（ctx.llm）
                                 │
                                 ▼
                    ┌── L2 场景整合（阈值 newMemoriesSinceL2 ≥ minNewMemories）
                    └── L3 画像蒸馏（冷启动 / 间隔 / [PERSONA_UPDATE_REQUEST]）

agent/pre-step ──▶ L1 检索召回（FTS BM25 / 向量 / hybrid RRF，缓存）
agent 上下文注入 ──▶ <relevant-memories> + <user-persona> + <scene-navigation> + 工具指南
工具 ──▶ memory_search / conversation_search / memory_read_scene
```

- 所有蒸馏调用复用 DSH 自身的 `ctx.llm`（默认当前模型，可用 `llm.provider/model` 覆盖）。
- 所有管线阶段失败只记日志，绝不阻塞 Agent 循环。
- 召回注入使用标签包裹，capture 侧自动剥离，防止反馈循环。

## 会话记忆档位（0.4.0）

每个会话可独立选择记忆档位，**写入与召回同档**：

| 档位 | 蒸馏（写入） | 召回（注入） |
| --- | --- | --- |
| `自动`（默认） | 合并词表 prompt 单次抽取，个人三类 + 工作四类全开，每条记忆按 type 前缀落族标签 | 两族记忆全召回；画像/场景导航两族拼接 |
| `chat` | 窄 prompt 只提个人三类，只入 chat 族 | 只查 chat 记忆 + chat 画像/场景导航 |
| `work` | 窄 prompt 只提工作四类，只入 work 族 | 只查 work 记忆 + work 画像/场景导航 |
| `关闭` | 不写 L0、不蒸馏 | 不召回；三个记忆工具返回"已隐身"提示 |

- **控件**：输入栏内、模式选择器右侧的 pill（`记忆·自动`），点击在上方浮出
  macOS 风格滑动选择器——拖拽松手吸附最近档位；
- **默认档** = 配置 `family`（`auto|chat|work`，默认 `auto`）；每会话的选择按 sessionId
  持久化到 `session-modes.json`，重启/恢复会话不丢；
- 中途切档：下一轮蒸馏/召回生效，已提取记忆留在原族；与全局开关叠加（全局是总闸）；
- L2/L3 完全分族：场景、画像、阈值计数、情境链两族各自独立，间族内容不渗透。

## 安装

需要 Node ≥ 22.16 与已安装的 dsh CLI（dsh 是 pnpm 转发器，未装 pnpm 时先 `npm i -g pnpm`）。

```bash
# 从本仓库安装（GitHub）
dsh plugin --profile web add https://github.com/JunNanLYS/dsh-layered-memory

# 或从本地路径安装（开发/调试，link: 指向仓库，npm run build + 重启 dsh 即生效）
dsh plugin --profile web add /path/to/dsh-layered-memory
```

本包声明了 `dsh.bundle` 组合包层（`cordis.patch.yml`），安装后会**自动挂载插件行**——
不需要再手改 `$DSH_HOME/profiles/web/cordis.patch.yml`；要覆盖配置时，在 profile 自己的
`cordis.patch.yml` 里写**顶层裸 patch 条目**（直接 `id:`，不要包在 `insert:` 里——
insert 与 bundle 层同 id 追加会导致 `duplicate loader entry id` 启动失败）：

```yaml
- id: dsh-memory
  name: dsh-layered-memory
  config:                    # 键按行整体替换（不深合并），按需写全要保留的键
    family: auto             # 新会话默认档：auto | chat | work
    llm:                     # 蒸馏模型路由（不写则跟随当前默认模型）
      provider: ''
      model: ''
```

然后重启 DeepSeek Harness。验证方式：`~/.dsh/memory/` 下出现 `conversations/ records/ scenes/`
目录和 `memory.db`（含 `-wal` 文件）即说明插件 apply 成功（dsh 的插件日志走内部 sink，
stdout 一般看不到）；设置页出现"记忆"多 Tab 页面、输入栏出现记忆档位 pill 即 client 半边就绪。

> ⚠️ **安全提示**：安装插件 = 以你的权限运行第三方代码。本插件会读取会话内容、
> 在数据目录写文件、调用你配置的 LLM/embedding 服务；介意请先审查源码（`src/`）。

**卸载**：`dsh plugin --profile web remove dsh-layered-memory` + 重启。数据保留在
`~/.dsh/memory/`（含 `memory.db`、JSONL 事实源、画像/场景文件），不需要时手动删除整个目录即可。

## 从源码开发

```bash
git clone https://github.com/JunNanLYS/dsh-layered-memory
cd dsh-layered-memory
npm install && npm run build
dsh plugin --profile web add .        # link: 安装，改代码后 npm run build + 重启 dsh 即生效
npm run smoke                         # 冒烟测试（先重编：见下方命令）
npx tsc src/smoke.ts --outDir dist-smoke --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck --esModuleInterop
```

## 记忆浏览器与模式开关（UI）

Client 半边（`dist/client.js`，手写 bundle，无打包器）在 **设置 → 记忆** 注册了多 Tab 页面：

- **概览**：运行计数（L0 今日消息 / L1 记忆 / L2 场景 / L3 画像 / 各层最近运行时间，每 5 秒自动刷新）
  + **记忆模式开关面板**（总开关 + 捕获/蒸馏/召回三个分项；总开关关闭时分项置灰）；
- **记忆**：L1 记忆卡片列表——关键词搜索（BM25，与召回同源）+ 类型/情境筛选，
  点击卡片展开详情（时间戳链 / 版本 / 来源消息 id）；默认更新时间倒序，分页加载更多；
- **场景**：L2 场景块全文（含热度/摘要 META）；
- **画像**：L3 persona 全文；
- **日志**：`memory.log` 尾部 200 行。

**开关语义**：走官方 settings 服务（命名空间 `dsh-memory`，`applies: 'live'` 实时生效、
官方持久化，重启后保留）；页面 switch 经 loopback RPC 写入。
生效规则 = **静态 config（部署上限）AND 运行时开关**——`cordis.patch.yml` 里
`capture.enabled=false` 时运行时开关无法开启捕获。总开关关闭 = 不捕获、不蒸馏、不注入
（数据保留，重开后继续）。

数据通道：`connection.rpc.call('/rpc', 'dsh-memory/*')`，端点 `stats` / `settings-get` /
`settings-set` / `list-records` / `scenes` / `persona` / `log-tail` /
`session-mode-get` / `session-mode-set`（authority=loopback）。
RPC 不可达时页面显示错误而非空白，便于判断插件是否正常。

## 存储与检索（对齐 MemoryCore 官方双写架构）

- **双写**：JSONL 追加文件（`conversations/`、`records/` 按天分片）是备份/恢复的事实源，
  **只增不改**；`memory.db`（node:sqlite + WAL + FTS5 BM25 + sqlite-vec 余弦向量）是主检索引擎，
  去重合并的更新/删除只动检索库；
- **检索三策略**（`recall.strategy`）：`keyword`（FTS5 BM25）/ `embedding`（vec0 余弦 KNN）/
  `hybrid`（双路并行 + RRF k=60 融合，默认）；过度召回 ×3、召回分数阈值 `recall.scoreThreshold`（默认 0.3，
  含 FTS 小语料例外）；
- **向量能力可选**：默认关闭（等价官方 provider="none" 的纯 FTS 模式）。DSH 的 `ctx.llm` 无
  embeddings 端点，启用需自备任意 OpenAI 兼容 `/embeddings` 服务（配置 `embedding.*`）；
  配置变化（模型/维度）自动 drop 向量表并后台全量重嵌入；
- **降级链**：sqlite-vec 加载失败 → 纯 FTS；embedding 调用失败 → 该次检索降级 FTS 并告警一次；
  检索库初始化失败 → 记忆功能整体停用但 dsh 本体照常启动；
- **替换缝**：`L1Store.search()` 仍是唯一检索入口。

## 配置

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `family` | `auto` | 新会话默认记忆档位：`auto`（双族自动）\| `chat`（个人）\| `work`（工作）；会话内可用输入栏控件临时切换 |
| `dataDir` | `$DSH_HOME/memory` | 数据目录 |
| `capture.enabled` | `true` | L0 捕获 |
| `capture.stripCodeBlocks` | `true` | 助手消息剥离代码块 |
| `capture.maxMessageChars` | `4000` | 单条消息最大字符数 |
| `extract.enabled` | `true` | L1 抽取 |
| `extract.minMessages` | `1` | 攒够 N 条新消息跑一次 L1 抽取 |
| `extract.backgroundMessages` | `10` | 抽取时附带的背景消息条数 |
| `extract.candidatePool` | `5` | 去重候选池大小 |
| `l2.enabled` | `true` | L2 场景整合 |
| `l2.minNewMemories` | `5` | 距上次 L2 整合的新记忆阈值 |
| `l2.maxScenes` | `12` | 场景块数量上限 |
| `l2.sceneContextLimit` | `3` | L2 prompt 附带的相似场景全文上限 |
| `l3.enabled` | `true` | L3 画像蒸馏 |
| `l3.interval` | `20` | L3 蒸馏间隔（新记忆条数） |
| `recall.enabled` | `true` | 自动召回 |
| `recall.maxResults` | `5` | 每步召回注入的 L1 条数 |
| `recall.strategy` | `hybrid` | 检索策略：`keyword` / `embedding` / `hybrid` |
| `recall.scoreThreshold` | `0.3` | 召回分数阈值（低于不注入；仅 keyword/embedding 策略生效，hybrid 融合前不过滤；工具路径不过滤） |
| `embedding.enabled` | `false` | 向量检索开关；关闭即纯 FTS 运行 |
| `embedding.baseUrl` | 空 | OpenAI 兼容 /embeddings 地址（如 `https://api.siliconflow.cn/v1`） |
| `embedding.apiKey` | 空 | API Key |
| `embedding.model` | 空 | embedding 模型名 |
| `embedding.dimensions` | `0` | 向量维度（启用时必填，须与模型输出一致） |
| `llm.provider/model` | 空 | 蒸馏模型覆盖（默认用当前默认选择） |
| `llm.maxTokens` | `4096` | 单次蒸馏输出上限兜底（各阶段分设：L1 抽取/去重/L2=4096，L3=3000） |
| `llm.temperature` | `0.3` | 蒸馏温度 |
| `llm.maxInputChars` | `700000` | 单次蒸馏输入字符预算（模型上下文 1M，日常压 ~700k 使用；超限的 L1 输入自动分块抽取） |
| `tools` | `true` | 是否注册模型可调用的记忆工具 |

> 注：`conversation_search`（L0）也走 FTS+向量 hybrid 检索（与 L1 同款 RRF 融合）。

## 数据目录结构

```
memory/
├── memory.db              # SQLite 检索库（L0/L1 元数据 + FTS5 全文索引 + 可选向量表；L1 带 family 列）
├── conversations/2026-01-01.jsonl  # L0 原始对话事实源（每天一个文件，追加；不分族）
├── records/2026-01-01.jsonl        # L1 原子记忆事实源（每天一个文件，追加；记录含 family 字段）
├── scenes/chat/*.md       # L2 场景块（chat 族）
├── scenes/work/*.md       # L2 场景块（work 族）
├── persona-chat.md        # L3 画像（chat 族：用户画像）
├── persona-work.md        # L3 画像（work 族：Team Operating Doctrine）
├── state.json             # 管线 checkpoint（v2 分族：families.chat / families.work）
├── session-modes.json     # 会话档位映射（sessionId → 档位，>90 天自动清理）
└── memory.log             # 诊断日志（info+，超 2MB 轮转为 memory.log.1）
```

## 日志与排查

dsh 宿主只把插件日志打到控制台，插件将 info 及以上级别镜像到数据目录 `memory.log`。
出问题时先看这个文件，一轮对话的典型日志路径：

```
L0 捕获 turn=N …条（user=x/assistant=y）      ← 捕获层（user 丢失会先在这里断）
L0 落盘 N 条                                   ← turn/end 即时写（不排蒸馏队列）
蒸馏管线开始（session=…，mode=…，本轮 N 条，待重试 M 条）
LLM 调用 provider/model：输入 x → 输出 y 字符（z s）   ← 每次蒸馏调用一行
L1 去重判定：抽取 N 条 → 候选召回 M 条，决策 store=… update=… skip=…
L1 抽取完成（mode=…）：消息 N 条，抽取 X 条，去重后新增 Y 条
蒸馏管线结束（本轮新增 N 条，总耗时 x ms）
召回命中 N 条 L1（mode=…，query="…"）          ← 下一轮召回路径
```

JSON 解析失败会附带模型原始输出前 400 字符；所有失败 warn 携带错误堆栈首帧。
debug 级别（L2/L3 跳过原因等）只在宿主控制台输出，不落盘。

## 与 MemoryCore 的差异

- 内嵌完整管线（不依赖外部 Gateway），蒸馏复用 DSH 自己的 LLM；
- L2/L3 由"LLM 操作文件工具"改为"LLM 输出操作 JSON / 完整文档，工程侧执行"；
- 召回注入点在 `agent/pre-step` + agent 作用域 `systemPrompt.context`（DSH 原生事件/服务）；
- 存储/检索即官方 sqlite 后端的单机裁剪版（裁掉多租户隔离列、TCVDB 云后端、审计表；
  分词用自带 CJK 二元组替代 jieba，保持零原生依赖——仅 sqlite-vec 一个原生扩展，加载失败自动降级）。
