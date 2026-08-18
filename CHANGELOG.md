# 更新日志（Changelog）

本文件记录 dsh-layered-memory（0.5.0 前名为 dsh-memory-plugin）的显著变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.8.0] — 2026-08-18

记忆优化包（规格 `docs/spec-2026-08-18-memory-optimization.md`，决策记录 ADR-0001/0002/0003）：
召回消息侧注入 + 蒸馏触发改造（渐进阈值 + 全链路会话隔离）+ 分层输出预算 + FTS 写路径修复。

### 新增

- **召回消息侧注入**（ADR-0001）：相关记忆以带插件署名的合成消息（`form: 'recall'`）
  排在每条新的用户消息之前注入会话流——用户能直接看到"记忆生效了"。`<relevant-memories>`
  标签 + "仅供参考"引导语；纯工具步 / reject 决策透传；只在有新用户消息的步骤触发
  （轮首 + steering 插话）。系统提示只保留稳定内容（画像/导航/门控指南），
  `memory:recall` 动态槽撤除；
- **召回预算**：`recall.maxCharsPerMemory`（默认 500）/ `recall.maxTotalRecallChars`
  （默认 2000）——超限截断并以 `…（已截断；可用 memory_search 或 conversation_search
  查看详情）` 引导模型用工具查全文（截断是引流：工具路径返回完整记录）；总量超限丢
  低分尾部；code point 安全截断；
- **召回超时**：`recall.timeoutMs`（默认 5000，0 不限时）总预算，超时跳过本轮注入；
  远程嵌入 fetch 内层钳制 3000ms（给 FTS 降级留时间），本地推理不钳；
- **蒸馏渐进阈值**（ADR-0003）：生效阈值 1→2→4→稳态爬坡（`extract.minMessages` 语义
  升级为稳态阈值，默认 1→6）——新用户首轮即出记忆，稳态攒批省调用；爬坡状态随
  pending.json 持久化；
- **闲置兜底**：`extract.idleSeconds`（默认 300，0 关闭）——会话静默达标后未蒸馏切片
  自动落袋，off 档会话挂起跳过；
- **档位切换切片同步**：非 off 档间切换 → 该会话切片立即按捕获档位蒸馏；切到 off →
  挂起；从 off 切回 → 挂起片按捕获档位落袋（切片永不跨档位混装）；
- **分层输出预算**：抽取 16k / 去重 8k / L2 32k / L3 16k；思考档 high/max 自动 ×4
  （reasoning 吃光预算的历史事故防线）；`llm.maxTokens` 默认 256k→65536 降为兜底总闸。

### 修复

- **跨会话污染**（现存缺陷）：抽取背景消息原为全局内存数组（A 会话内容给 B 会话当
  背景且重启即丢），现按会话从 L0 现查（走会话索引）并剔除切片自身；蒸馏触发按会话
  切片计数、只抽取达标会话的切片——五条通道（阈值/idle/背景/档位切换/重试残留）
  全部会话隔离（ADR-0003）；
- **FTS 写路径 O(N²) 放大**：防御性 FTS 删除改主表存在性点查预判（record_id 在 FTS
  表 UNINDEXED，按 id DELETE 是全表扫描——重建/重嵌/导入等全新增路径原为每条记录白付
  一次全扫）。外部行为逐项不变（ADR-0002；rowid 映射方案因陈旧映射静默错删风险否决）。

### 变更

- 工具指南改三条件门控（`tools 开启 && 画像 ∥ 导航 ∥ 本轮召回命中`）：空库用户与
  关闭工具的用户不再每步支付这份固定 token；
- pending.json 持久化条目增加 `sessionId` 字段（旧格式自动归入 legacy 会话组），
  另随桶持久化渐进阈值状态；
- 启动补跑改为按会话切片分组入队；
- **中文检索分词从 CJK 二元组升级为 jieba 词级分词**（与 MemoryCore 官方实现对齐）：
  `@node-rs/jieba`（Rust napi 预编译二进制）产出 **jieba 词元 ∪ 拉丁词 ∪ CJK 二元组**
  有序去重并集——词元给 BM25 高 idf 整词命中，二元组保子词召回底线；加载失败自动回退
  纯二元组（进程内模式定死不漂移）；FTS 分词器版本戳（`fts_tokenizer`：`jieba-v1` /
  `bigram-v1`）戳不符时自动 drop 重建回灌，无戳旧库视同 `bigram-v1` 首启自动迁移。

## [0.7.1] — 2026-08-17

全量审查（2026-08-17）修复批次：文档补正 + 存储性能 + 运行时安装供应链加固。

### 性能

- **`PRAGMA synchronous=NORMAL`**（WAL 官方推荐档）：批量写从每事务一次 fsync 降为每
  checkpoint 一次，重嵌入/导入提速；代价仅是断电时丢最后若干已提交事务（只丢不损）；
- **reindex 向量写事务化**：L1/L0 重嵌入的逐行裸写改为按块（16/32 行）单事务批量
  （整批失败回退逐条，好行不丢），配合上一条大幅缩短大库重嵌耗时。

### 安全

- **本地嵌入运行时改 `npm ci` + 随包 lockfile**：`resources/runtime-package-lock.json`
  （构建期拷入 dist/）把 `@huggingface/transformers` 的完整传递依赖树冻结在作者侧——
  原 `npm install pkg@精确版本` 只锁直接依赖，传递依赖按 semver 浮动，registry 端后续
  发布/投毒会随安装时间漂移。ci 失败（lock 漂移等）自动回退 install（可用性优先）。

### 文档

- CHANGELOG 补 [0.5.3] / [0.5.4] 条目（此前缺失，npm 已发版）；
- README 中英配置表补 5 项：`recall.includePersona` / `recall.includeSceneNav` /
  `embedding.maxInputChars` / `embedding.timeoutMs` / `llm.timeoutMs`；
- 修正中文版"间族"错别字（应为"跨族"）；开发经验文档的旧存储布局路径
  （`l0/ l1/` → `conversations/ records/`）；CONTEXT.md 的 persona 文件名更新为分族形态。

## [0.7.0] — 2026-08-17

本地嵌入模型与活切换（最大特性）、Light/Dark 双主题、全量代码审查修复（issue #1-#24）。

### 新增

- **本地嵌入模型**（#20-#24）：**三态嵌入源**（关闭 / 远程 / 本地）运行时可切，
  状态持久化 `embedding-source.json`，生效 = 部署上限 AND 运行时选择；
  - **内置模型目录**（白名单，锁定 revision + 每文件 sha256）：BGE small 中文
    （512 维 / ~25MB）、EmbeddingGemma 300M（768 维 / ~330MB，上游 MemoryCore 同款）、
    BGE-M3（1024 维 / ~590MB，8192 上下文）；默认镜像 `hf-mirror.com` 可配
    （`embedding.mirror`），`.part` 断点续传 + 下载后流式 sha256 校验；
  - **按需推理运行时**（transformers.js 4.2.0）：首次切本地档才 npm 安装进数据目录
    `runtime/`（自带 package.json 锚定，不进插件依赖树）；模型落盘 `models/<id>/`，
    设置页可删（使用中的模型受保护）；
  - **活切换链**：预热加载 → 换服务 + swapProvider（维度变化 DROP 向量表）→
    meta 立即同步 → 后台全量重嵌（L1/L0 计数进度、可取消）→ 成功才持久化状态；
    失败保持旧源（重启仍按原源），重嵌取消/部分失败由 30 分钟周期 backfill 补齐；
  - 新配置：`embedding.allowLocalModels`（部署禁本地档）、`embedding.mirror`；
- **设置页与输入栏 Light/Dark 双主题适配**（#15-#19）：两层令牌（链 dsw 宿主别名 +
  自有语义令牌整组覆盖），主题切换 CSS 变量就地换值无需 React 重渲染；
- **档位选择器 UI 重做**：档位中文化（日常 / 工作 / 智能 / 关闭）、悬浮板重做、
  滑块填充（左浅右深、拖拽恒显）、拖动气泡（倒三角双叠尖角）、**粒子层**
  （点阵粒子场，档位分级场强：日常稀疏 / 工作水波 / 智能满场，浅色 multiply 混合）；
  设计系统落档 `design/` 目录（global / pill / slider / settings 四份 spec）。

### 修复（全量代码审查 #1-#14 + 独立复审 F1-F4 + 装配缝）

- store：FTS 写入失败随事务整体回滚（杜绝静默索引空洞，#2）；嵌入补齐改增量 +
  零向量记 skipped（修复每 30 分钟全量重嵌死循环，#3）；批量失败回退逐条 +
  语句缓存随 DROP 失效 + skip 集上限（F2-F4）；
- 生命周期：停机顺序先停任务/冲刷 L0 链再关库（#5）；捕获缓冲/重建快照/pending
  三处引用释放（#4）；
- recall：查询只取末尾 8 条 + 2000 字上限，空查询清缓存（#6）；
- settings：fiber 重启复用进程内 scope，开关不再被静默忽略（#8）；按服务实例判活
  缓存 scope，服务重启自动重挂（F1）；
- rpc：connection 服务下线/替换后自动重挂 RPC 注册（#9）；
- client：三面板错误态 + 概览降级 badge（#7）；列表请求序列号丢弃过期响应（#10）；
- tools：off 档三工具统一返回提示；搜索分页显式截断标记（#11）；
- log：log-tail 反向分块读 + 轮转连续失败截断兜底（#12）；
- config：数值边界 + pending 持久化截断 + 扩展开关复位（#13）；
- **stats 装配缝**：`/rpc` handler deps 漏传 `embedManager`——嵌入管理 UI 恒显示
  "存储降级"（可选字段缺失 TS/冒烟均无法拦截，已修复）。

### 性能

- 检索热路径预编译语句复用 + IN 分块 + L1 批量事务（#14）。

### 文档

- README 大改：新增"语义检索（嵌入源）"章节（三态表 / 模型目录表 / 下载与活切换）；
  Hero / 分层记忆 / 会话档位换用 image2 生成图；新增界面预览（深浅双主题真实截图）；
  storage.svg 补嵌入源三态与新文件形态；配置表补两行；
- 开发上下文补"嵌入与检索"术语表；归档 2026-08-17 全量代码审查报告。

## [0.6.1] — 2026-08-17

- `llm.maxTokens` 默认 20000 → **256000**：v4-flash 默认 high 思考档可吃光任意
  输出预算导致正文 0 字符，给足预算配合思考档位默认 off。

## [0.6.0] — 2026-08-17

蒸馏思考档位 + 记忆选择器 UI 重做 + 可靠性补强。

### 新增

- **蒸馏思考档位**：`llm.reasoningEffort` 配置（`off`/`high`/`max`/空串，默认 `off`）
  + 设置页概览 Tab 运行时切换（选"跟随配置"回退部署默认，走 settings 服务持久化）；
  推理模型默认思考可吃光输出预算致正文 0 字符，故蒸馏默认关思考；
- **未蒸馏缓冲持久化**：失败待重试 + 攒阈值中途的消息按档分桶暂存 `pending.json`
  （每次蒸馏尝试后原子落盘），重启不丢，启动 20 秒后自动补跑；
- **记忆全量重建**（设置页 → 记忆 → 概览 → 重建记忆）：以 L0 为事实源重导全部派生层，
  旧产物整体归档不删除，低优先级分块（让位正常对话），带确认弹窗/进度/取消；
  统一按智能档（auto）重蒸馏、按会话分块（会话按首条时间排序），重建期间新对话走正常轮次。

### 变更

- 记忆选择器 UI 重做：auto 档边缘 conic 冷蓝流光、Apple 玻璃浮层（三层结构修
  Chromium backdrop-filter 采样失效）、滑块拖拽 1:1 跟手 + 松手动量投影吸附；
  线/停点/标签颜色主题化。

## [0.5.4] — 2026-08-16

发布工程化：npm Trusted Publishing（GitHub Actions OIDC）上线——push `v*` tag 自动发布，
免 token / 免 2FA；tag 与 package.json 版本一致性校验仅 tag 触发时生效（`workflow_dispatch`
手动试跑可走到 publish 鉴权链路，用于验证 OIDC）。无用户可见变更。

## [0.5.3] — 2026-08-16

### 修复

- L1 抽取后立即持久化阈值计数（进程中途退出不回滚，重启不重复抽取）；
- 蒸馏输出预算统一走 `llm.maxTokens`（默认 20000，防推理模型的 reasoning 吃光预算致正文 0 字符）。

### 新增

- auto 档画像/场景导航注入结构化：按类别归组 + `<domain family>` 分域标签，替代两族粗暴拼接。

### 文档

- README 安装方式改为 npm 优先（GitHub / 本地路径为备选），`files` 附 hero 资源。

## [0.5.2] — 2026-08-16

修复 Linux/macOS 上"任何工具调用都报
`Cannot read properties of undefined (reading 'prepare')"`的严重 bug
（WSL 真实事故：bash 工具一调就崩，turn 级失败）。

### 根因

插件把宿主运行时包（`@deepseek-ai/cordis`、`dsh-tools` 等）声明成了普通
`dependencies`——安装器为插件装入**私有拷贝**，与宿主自己的模块图形成
**双 `dsh-tools` 实例**。`ToolRuntime` 服务由插件侧拷贝实例化，而
`dsh-agent-loop` 用宿主侧拷贝的 `Symbol(@deepseek-ai/dsh-tools.scheduler)`
去读调度器——Symbol 身份不等（同名不同实例），读取落空 → 每次工具调用
在 `scheduler.prepare` 处抛 TypeError。Windows 上恰好两图解析顺序一致而
侥幸可用，Linux（pnpm hoisted + symlink 布局）必现。

### 修复

- **宿主运行时包改为 `peerDependencies`**（对齐官方插件约定，如
  `dsh-bash-local`：cordis / dsh-agent / dsh-home-paths / dsh-llm /
  dsh-session / dsh-settings / dsh-system-prompt / dsh-tools，`^` 范围），
  安装不再产生私有拷贝，插件与宿主共享同一模块图；
- 本地开发所需版本移入 `devDependencies`（构建/冒烟不受影响）；
- 纯库依赖保留 `dependencies`（schemastery、sqlite-vec）。

## [0.5.1] — 2026-08-16

修复 0.5.0 改名的客户端注册 bug（真实事故：从 GitHub 安装后浏览器端报
`client-modules: bundle ... loaded without registering "dsh-layered-memory"`，
设置页与输入栏记忆控件全部不可用）。

### 修复

- **client bundle 注册 id 随包名更新**：`client/client.js` 的
  `window.__ModuleLoader__.load({ id: ... })` 从旧名 `dsh-memory-plugin` 改为
  `dsh-layered-memory`——0.5.0 改名时只改了 host 侧与打包声明，漏掉浏览器半边，
  导致 loader 条目名与注册名不一致、bundle 加载即失败。host 侧插件名
  `dsh-memory-plugin`、配置键 `dsh-memory`、RPC 端点 `dsh-memory/*` 均保持不动
  （改它们会破坏既有配置与数据通道）。

### 文档

- README 视觉美化（beautify-github-readme）：新增项目原生 hero（`assets/readme/hero.svg`，
  L0→L3 分层管线 SVG，宽度递减表数据精炼）；重排为"价值 → 机制 → 首步使用 → 细节"
  顺序，合并重复段落，嵌入方式 `<p align="center"><img width="100%">`。

## [0.5.0] — 2026-08-16

公开发布改造：包更名为 **`dsh-layered-memory`**（旧名 `dsh-memory-plugin` 在 npm 已被
同类插件占用），并按官方组合包（bundle）规范完成打包。

### 变更

- **声明 `dsh.bundle`**（根目录新增 `cordis.patch.yml`）：`dsh plugin --profile <name> add`
  一条命令安装后**自动挂载插件行**，不再需要手改 profile 的 patch.yml；
  `files` 同步补入该文件；
- **依赖去本机化**：`@deepseek-ai/*` 从 `file:` 绝对路径（指向本机 profile）全部改为
  npm 精确版本（`0.1.0-rc.6` 一档、cordis `4.0.1`、schemastery `3.18.1`）——任何机器
  `npm install` / `dsh plugin add` 均可解析（rc.6 挂在 `next` dist-tag，勿用 `^` 范围）；
- 仓库卫生：MIT LICENSE、`.gitignore`（忽略 `node_modules/`、`dist-smoke/`、`.zcode/`）、
  README 安装段重写（一条命令安装 + 卸载 + 安全提示 + 源码开发），修正重复标题。

## [0.4.2] — 2026-08-16

蒸馏 LLM 空输出诊断增强（真实事故：L1 去重/抽取连续两轮输出 0 字符，日志只有
`原始输出前 400 字符:` 空摘录，无任何现场证据）。

### 根因排查价值

`callLLM` 原先只记输入/输出字符数；流"正常结束但一个字没吐"时无法区分
"模型只产出了 reasoning（text 为空）" vs "服务端返回空响应"。失败的那两次
（35~38s、0 字符、输入 1.3 万字符）远未到超时（120s）与 maxTokens（4096）预算。

### 变更

- `callLLM` 收集流内**块级统计**：finish 原因（stop/max-tokens/tool-calls/error/aborted）、
  usage token 计数（outputTokens/reasoningTokens）、text-delta 块数与字符数、
  reasoning-delta 字符数（带 300 字符摘录）、各 block-end 类型分布；
- **输出为空时打 warn 诊断日志**，携带上述全部统计——下次再空输出可直接判定
  reasoning 是否吃光预算、finish 原因、服务端是否空响应；
- 常规 `LLM 调用` 日志追加 finish 原因（非空输出时零额外开销）。

## [0.4.1] — 2026-08-16

修复长回复轮次丢失 user 消息的 L0 捕获缺陷（真实事故：4 轮对话中第 3 轮丢 user 消息、第 4 轮丢 user + 首条 assistant）。

### 根因

导出的 session.jsonl 是**压缩后**的日志；实时 `session/event` 流里每个流式响应还携带大量
text-delta/reasoning chunk 事件。长回复轮次（长文本 + 推理 + 联网搜索）的实时事件数超过
捕获缓冲的 `MAX_BUFFER=500`，头部队列裁剪（`splice(0, len-500)`）把一轮中**最早**的
`turn/start` 和 user 消息裁掉了——`findTurnStart` 找不到轮次起点，捕获退化为
"整段缓冲当本轮"，只剩轮次尾部消息。短回复轮次事件数不达上限，故 1、2 轮完整。

### 修复

- **缓冲只收 4 类事件**（user/message、assistant/message、turn/start、turn/end），
  流式 chunk 在入口直接丢弃（`isCaptureRelevant`）——缓冲量从数百/轮降到个位数/轮；
- **裁剪铁律**：进行中轮次（未闭合 turn/start 之后）的事件绝不裁，只裁其之前的已完成前缀
  （`trimBuffer`，防御性、基本不可达）；
- **L0 即时落盘**：turn/end 立刻经独立串行链写入（`capture.ts`），不再排蒸馏队列——
  原先 L0 会被慢 LLM 调用阻塞（实测延迟 26s），dsh 在蒸馏中途退出时排队中的 L0 直接丢失；
  runner 不再负责 L0 落盘。

### 验证

- smoke 新增第 12 节：4 类事件白名单、chunk 排除、600 事件 + 进行中轮次的裁剪场景
  （turn/start + user 不丢）、无进行中轮次按 500 上限、未超限不裁。

## [0.4.0] — 2026-08-16

会话级记忆档位：四态控件（自动/chat/work/关闭）+ 写入召回同档隔离 + L2/L3 分族存储。

### 新增（UI）

- **输入栏档位控件**（`conversation.input.left`，模式选择器右侧）：pill 显示当前档
  （`记忆·自动` 等，按档着色），点击在上方浮出 **macOS 风格滑动选择器**——
  横向轨道 + 四个停靠点（关闭 · chat · work · 自动），线条从圆球中心穿过，
  拖拽圆头（带阴影）、**松手吸附最近停靠点**后经 RPC 乐观提交（失败回滚 + 红提示）；
  当前档由下方标签高亮指示（上方无文字）；点停靠点标签直接跳档，点外部/Esc 关闭；
  会话切换组件自动重挂载并拉取该会话档位；
- 设置页浏览器保持两族**混合视图**（场景/画像端点拼接展示），概览的"Prompt 家族"
  改为"默认档"。

### 新增（语义：写入与召回同档）

- **档位四态**（`MemoryMode = auto | chat | work | off`），每会话独立，按 sessionId
  持久化到 `session-modes.json`（>90 天/超 500 条自动清理，写串行化）：
  - `chat` / `work`：窄 prompt 蒸馏本族 → 只入本族库；召回只查本族记忆 + 本族画像/场景导航；
  - `auto`（**新会话默认**）：合并词表 prompt 单次抽取（个人三类 + 工作四类，7 类全开），
    每条记忆按 type 前缀落族标签；召回两族全开（画像/导航两族拼接）；
  - `off`：本会话对记忆系统完全隐身——不写 L0、不蒸馏、不召回，三个模型工具返回提示；
- 新会话默认档 = 配置 `family`（union 扩为 `auto|chat|work`，默认 `auto`，语义降级为
  "默认档"；旧部署显式配置的 chat/work 仍有效）；中途切档下一轮生效，已提取记忆留在原族；
- 与全局开关叠加：全局开关是总闸，会话档位在总闸之下细分。

### 变更（存储分族隔离）

- **memory.db 仍是单库**：`l1_records`/`l1_fts` 加 `family` 列（存量按 type 前缀回填，
  FTS 表自动重建）；检索三策略（FTS/向量/hybrid）全部支持族过滤（vec 路径过度召回 + 回查过滤）；
- **L2/L3 拆分族文件**：`scenes/chat|work/`（旧 `scenes/*.md` 自动迁入 chat）、
  `persona-chat.md` / `persona-work.md`（旧 `persona.md` 自动改名）、`state.json` 升 v2
  分族 checkpoint（旧平铺内容归 chat 桶）；L2/L3 阈值计数、情境链、prompt 变体各自独立；
- 去重候选只在同族内召回（去重永不跨族）；L1 待重试缓冲按档分桶；
- 模型工具按调用会话的档位过滤（`exec.agent.id === sessionId`）；
  `memory_read_scene` 在两族目录按名查找，persona 参数改 `persona-chat.md|persona-work.md`。

### 新增（RPC）

- `dsh-memory/session-mode-get {sessionId} → {mode, defaultMode}`、
  `dsh-memory/session-mode-set {sessionId, mode}`（四值白名单校验）。

### 迁移（全部 init 内自动执行）

1. `l1_records` ALTER 补 family 列 + 按 type 前缀回填；`l1_fts` 缺列则 drop 重建回灌；
2. `state.json` v1 平铺 → v2 分族（旧数据归 chat）；
3. `scenes/*.md` → `scenes/chat/`；`persona.md` → `persona-chat.md`；
4. **部署同步**：web profile 的 `cordis.patch.yml` 删除 `family: chat` 行（否则默认档仍为 chat）。

### 验证

- smoke 新增第 11 节：族标签推断 / 档位存储持久化与默认档 / FTS 族过滤 + 候选族隔离 +
  list 族过滤 / 真实旧库（无 family 列）迁移回填 + FTS 重建 / 旧场景与画像文件迁移 /
  state v1→v2 / 合并词表 prompt 含 7 类 / RPC 档位端点（含非法值拒绝）；
- `Config['~standard'].validate({})` 默认 family=auto 验证通过。

## [0.3.0] — 2026-08-16

记忆浏览器 + 记忆模式开关：设置页"记忆"从纯文字计数表升级为多 Tab 内容面板。

### 新增（UI）

- **多 Tab 记忆浏览器**（设置 → 记忆）：
  - **概览**：运行计数 + 记忆模式开关面板 + 每 5 秒自动刷新；
  - **记忆**：L1 记忆卡片列表——关键词搜索（BM25，与召回同源）+ 类型/情境筛选 +
    相关度展示 + 点击展开详情（时间戳链/版本/来源消息）；默认更新时间倒序，分页加载；
  - **场景**：L2 场景块全文（含热度/摘要 META）；
  - **画像**：L3 persona 全文；
  - **日志**：memory.log 尾部 200 行滚动。
- **记忆模式开关**（总开关 + 捕获/蒸馏/召回三个分项，总开关关闭时分项置灰）：
  走官方 settings 服务（命名空间 `dsh-memory`，live 生效、官方持久化），
  页面 switch 经 loopback RPC 写入；语义 = 静态 config（部署上限）AND 运行时开关。

### 新增（Host）

- RPC 新端点（沿用 `/rpc` loopback 通道）：`dsh-memory/settings-get` / `settings-set` /
  `list-records`（浏览分页 + 关键词双路径 + 场景 facet）/ `scenes` / `persona` / `log-tail`；
- `L1Store.list()`（SQL 按更新时间倒序 + 类型/情境过滤 + 分页）与 `distinctScenes()`；
- 三处运行时门控：capture 事件入口、runner 蒸馏步骤、recall 注入文本函数；
- settings 服务晚于插件就绪时自动补挂（`internal/service` 监听），缺失时保持全开并提示。

### 验证

- smoke 新增：浏览接口分页/过滤、开关 schema 默认值、RPC 端点分发端到端
  （fake connection 逐端点断言，含开关写透与未知端点拒绝）；
- 真机 boot：`记忆模式开关就绪（settings 命名空间 dsh-memory）` 日志确认，HTTP 200。

## [0.2.4] — 2026-08-16

可诊断性完善：全管线关键节点入日志，出 BUG 时凭 `memory.log` 单文件即可还原执行路径。

### 新增

- **LLM 调用统计**：每次蒸馏调用记录 `provider/model、输入/输出字符数、耗时`，
  调用失败记录原因 + 耗时（此前失败只有裸 message，无路由上下文）；
- **JSON 解析失败带原文摘录**：L1 抽取 / L1 去重 / L2 场景操作解析失败时，
  记录模型原始输出前 400 字符（模型输出漂移排查的关键信息）；
- **去重决策统计**：`抽取 N 条 → 候选召回 M 条 → 决策 store/update/merge/skip=x/y/z/w`
  单行日志，无决策记录按 skip 计；
- **管线阶段耗时**：蒸馏管线开始/结束（含本轮新增数与总耗时）、L0 落盘、L1/L2 阶段耗时；
- **L0 捕获明细**：turn 级捕获从 debug 提升为 info（含 user/assistant 条数分布）；
- **召回命中**：召回命中时记录条数 + query 摘录（debug → info）；
- **启动信息增强**：数据目录行附带插件版本号；新增蒸馏模型路由解析行
  （路由错误启动期即暴露，不再等到第一次抽取失败）；
- L2 跳过原因（阈值进度）、L3 未触发原因（阈值进度）入 debug 日志；
- 所有管线失败 warn 携带错误堆栈首帧（`errDetail`）。

## [0.2.3] — 2026-08-16

可诊断性修复：真机两轮对话后 L0 有数据但 L1 无产出，且 dsh 宿主无持久化日志，无法定位原因。

### 新增

- **文件日志**：info 及以上级别镜像写入数据目录 `memory.log`（超 2MB 轮转为 `.1`），
  写入失败静默忽略——dsh 宿主只把插件日志打到控制台，现在蒸馏管线问题可事后排查。
- **L0 捕获跳过原因入日志**：被冷启动保护拦截的 user 消息、非用户来源（`source.kind≠user`）
  的消息各记一条 info——用于诊断"整轮只剩 assistant 消息"这类捕获缺口。

### 修复

- **L1 "成功但零产出" 与 "失败" 状态可区分**：抽取成功但没有可提取记忆时，
  `state.lastExtractAt` 也会推进（此前保持 0，与抽取抛错无法区分）。
- **召回上下文热重载泄漏**：`systemPrompt.context()` 的 disposer 此前未挂到插件
  生命周期，热重载后旧注册残留、新实例撞名（`"memory:recall" is already registered`）；
  现在插件卸载时主动注销全部 agent 上的 `memory:recall` / `memory:profile`。

## [0.2.2] — 2026-08-15

代码审查（`docs/review-report-2026-08-15.md`）修复批次。

### 修复（高危）

- **MemoryDb 构造自降级（S1/P5）**：开库/建目录/PRAGMA 任一失败不再抛出，而是进入
  degraded 模式（全部读写安全 no-op），`init()` 对已降级实例直接短路——**任何存储故障都
  不再可能拖垮 dsh 宿主启动**（storage-degrade 不变量恢复成立）。

### 修复（检索语义，对齐官方）

- **hybrid 融合前不再做阈值过滤（P6）**：官方 hybrid 对各路完整列表直接 RRF 融合，
  `scoreThreshold` 仅对 keyword/embedding 单路策略生效（文档已注明）；
- **hybrid 融合分归一化到 0~1（P6）**：双列表 rank1 命中 = 1.0、单列表命中 ≤ 0.5，
  修复 memory_search 向模型报告 0.02~0.03 分数的语义破碎；
- **过度召回系数对齐官方（P1）**：候选池固定 = limit × 3（官方 tool 路径同款），
  移除 type 过滤的额外放大（此前误写为 ×5 的文档一并修正——0.2.0 的描述失实，
  实际代码是 ×9）。

### 修复（健壮性）

- **embedding_meta 延迟写入（P7）**：只在重嵌入完全成功（或空库无历史向量）后才持久化
  meta；失败则下次启动重新触发——修复"meta 过早写入导致向量表永远空着且能力位报 true"的漏洞；
- **周期性向量补齐（P3）**：向量能力启用时每 30 分钟（启动 1 分钟后首跑）比对
  向量行数与元数据行数，缺量自动重嵌入补齐——嵌入失败的批次不再需要手工干预；
- **旧数据迁移真实化（P8）**：只有全部记录成功入库才改名 `.imported`，rename 失败/部分
  导入会打真实日志并在下次启动重试（upsert 幂等）；
- **L1 去重决策改精确查询（S3）**：`pipeline/l1.ts` 按候选/目标 id 并集 `getByIds()` 取记录，
  不再每轮全表 `all()` 扫描。

### 修复（状态面板）

- stats 版本号从 `package.json` 读取（此前硬编码 0.1.0）；`message` 反映降级态；
  `pendingExtract` 接入 runner 真实的待重试计数（P4）；数据目录显示统一走 `resolveDataDir`。

### 清理（审查判断项）

- `EmbedHelper` 收敛 L0/L1 重复的嵌入降级/告警逻辑；`EmbeddingProviderInfo` 统一由
  `embedding.ts` 导出；场景导航标题统一引用 `persona.ts` 的 `NAV_HEADER`；
- 死代码移除：`Bm25Index.add`/脏标记/`snippet` 字段、`makeSnippet`、`readTodayCount`、
  recall 的未消费导出、`reindex` 未使用的 onProgress 参数（返回值改为
  `{written, failed}` 供 meta 时机判断）；
- `[DELETED]` 语义文档对齐（LLM delete → 工程侧删除文件；list 对遗留标记容错）。

## [0.2.1] — 2026-08-15

### 新增（输入 token 预算控制）

蒸馏模型上下文 1M token，日常按 ~700k 预算使用（`llm.maxInputChars`，默认 700_000 字符，
按中文 1 字 ≈ 1 token 保守折算）：

- **L1 抽取分块**：待抽取消息超预算时自动按块切分、链式多次抽取（情境名逐块衔接，`chunkByCharBudget`），
  消息不丢失——覆盖超长 agent 轮次与抽取失败重试堆积（最坏 ~840k 字符）两条路径；
- **callLLM 兜底截断**：任何蒸馏调用的用户 prompt 超预算时截断并标注（L2/L3 与异常场景的最后一道网）；
- 单条消息仍在捕获侧截到 `capture.maxMessageChars`（4000 字符），L2/L3 输入被场景文件尺寸天然限住。

### 配置

- 蒸馏模型显式固定为 `deepseek-official / deepseek-v4-flash`（`cordis.patch.yml`），
  不随 dsh 默认模型切换变化。

## [0.2.0] — 2026-08-15

存储与检索层按 [MemoryCore](https://github.com/TencentDB-Agent-Memory)（TencentDB Agent Memory）
官方 sqlite 后端架构重构：**JSONL 双写事实源 + SQLite 主检索引擎 + 三策略混合检索**。
动机：旧实现的 L0 检索每次查询重读近 30 天文件并现建内存 BM25 索引、L1 全量载入内存且
每次去重全量重写文件——数据量增长后性能与召回率都会崩。

### 变更（存储架构）

- **新增 `memory.db` 检索库**（`src/store/sqlite.ts`，`node:sqlite` 内置模块 + WAL + FTS5 +
  `sqlite-vec` vec0 余弦向量表），PRAGMA 组合照搬官方（busy_timeout/WAL/cache_size/mmap/wal_autocheckpoint）。
- **双写语义（官方同款）**：JSONL 追加文件降级为备份/恢复的事实源，**只增不改**；
  全部检索走 SQLite——L0 不再扫文件建索引，L1 不再全量载入/重写。
- **数据布局对齐官方**：L0 `l0/*.jsonl` → `conversations/YYYY-MM-DD.jsonl`；
  L1 `l1/records.jsonl`（单文件全量重写）→ `records/YYYY-MM-DD.jsonl`（按天追加）。
  旧布局在插件启动时自动导入检索库并改名 `.imported`（`l0/` → `l0.imported/`，
  `l1/records.jsonl` → `l1/records.jsonl.imported`），无需手工迁移。
- **去重/合并写路径重写**：`pipeline/l1.ts` 的应用决策从 `all() + replace(next)` 全量重写
  改为官方语义——合并结果作为**新记录追加**（版本号 +1），被替换目标 `deleteBatch` 只从检索库删除。
- L1 记录字段对齐官方：新增 `version`、`source_message_ids`、`metadata`
  （version/metadata 落检索库；source_message_ids 仅存于 JSONL 事实源）。

### 变更（检索）

- **三策略检索**（`recall.strategy`，默认 `hybrid`）：
  - `keyword`：FTS5 BM25 全文检索（`bm25()` rank → 0~1 分数，公式照搬官方）；
  - `embedding`：sqlite-vec vec0 余弦 KNN（score = 1 − cosine distance），可选能力；
  - `hybrid`：双路并行 + **RRF 融合（k=60）**，官方混合检索同款。
- **官方检索参数移植**：过度召回倍数（候选池 = limit × 3）、vec KNN 零向量
  补偿缓冲（+10）、召回分数阈值 `recall.scoreThreshold`（默认 0.3，含 FTS 小语料例外——
  结果数不超过 maxResults 时保留低分命中）、type 后置过滤（工具路径不过阈值）。
- **去重候选召回升级为官方 3 级**：空库跳过 → 向量优先 → FTS 兜底（原为内存 BM25 单级）。
- FTS 查询构造：token 引号化 OR 连接 + 中文停用词过滤（官方小表）；分词用项目自带
  CJK 二元组 + 英文词分词器（读写两侧同一分词器保证对齐），**不引 jieba 原生依赖**。
- **召回行格式**升级为官方样式：`- [type|scene] content`。

### 新增（embedding，可选能力，默认关闭）

- `embedding.*` 配置组：任意 OpenAI 兼容 `/embeddings` 服务（`baseUrl/apiKey/model/dimensions`
  等；DSH 的 `ctx.llm` 无 embeddings 端点，需自备）。向量客户端 L2 归一化（官方同款）。
- `embedding_meta` 持久化 provider/model/维度；配置变化自动 drop 向量表并**后台全量重嵌入**
  （`reindex()`，不阻塞启动）。
- 关闭 embedding 时等价官方 `provider="none"` 纯 FTS 模式——**默认零外部依赖即可运行**。

### 降级链（degrade-don't-crash 全程保持）

- sqlite-vec 加载失败 → 纯 FTS 模式（capability 位降级，warn 一次）；
- FTS5 建表失败 → `ftsSearch=false`；schema 初始化失败 → 检索库 degraded → 记忆功能停用
  但 **dsh 宿主照常启动**（沿用 storageOk 降级链）；
- embedding 单次调用失败 → 该次检索降级 FTS + 告警一次，写入侧跳过向量（可 reindex 补齐）；
- 插件卸载时关闭 DB 连接（WAL 落盘），注册于 `ctx.effect`。

### 依赖

- 新增运行时依赖 `sqlite-vec@0.1.7-alpha.2`（与 MemoryCore 同版本；预编译原生扩展，
  仅此一个原生依赖）。
- `node:sqlite` 为 Node ≥ 22.13 内置模块（engines 已要求 ≥ 22.16，无新增运行时要求）。

### 破坏性变更

- 数据布局：`l0/` → `conversations/`，`l1/records.jsonl` → `records/`（旧数据自动导入，
  原文件保留为 `.imported`，可手工清理）。
- `L1Store.search` / `searchCandidates` 由同步改为 **async**（向量路径需远程调用），
  第三参数从 `type?: string` 改为 `{ type?, scoreThreshold? }` 选项对象（仅插件内部 API，
  对外工具/召回行为不变）。

### 验证

- 冒烟测试新增/重写存储与检索断言：SQLite 双写、FTS 中英检索、type 过滤、阈值与小语料例外、
  merge 追加/删除语义、**vec0 向量 + hybrid + reindex**（确定性假嵌入）、旧布局迁移、
  RRF/bm25RankToScore/buildFtsQuery 纯函数——全部通过。
- Config Standard Schema 默认值填充验证通过（`embedding`/`recall.strategy`/`scoreThreshold`）。
- 真机启动验证：`dsh --profile web` 正常拉起，`~/.dsh/memory/` 生成 `memory.db`（含 WAL）+
  `conversations/` + `records/`，表结构完整（l0_conversations/l1_records/l0_fts/l1_fts/embedding_meta），
  停止干净。

## [0.1.0] — 2026-08-14

首个可用版本。

- L0~L3 分层蒸馏管线（捕获 → L1 抽取/去重 → L2 场景整合 → L3 画像蒸馏），Prompt 移植自
  MemoryCore（chat/work 双家族）。
- agent/pre-step 自动召回 + agent 作用域上下文注入（`<relevant-memories>` / `<user-persona>` /
  `<scene-navigation>` / 工具指南），capture 侧剥离注入标签防反馈循环。
- 模型工具：memory_search / conversation_search / memory_read_scene。
- 设置页状态面板（client bundle，Connection RPC 数据通道）。
- 修复致命 bug：配置 schema 导出名从 `schema` 改为 `Config`（cordis 只读 `plugin.Config`，
  导错名会导致整个 profile 启动失败）；LLM 流式文本收集改为 block-end 权威（修双倍输出）。
