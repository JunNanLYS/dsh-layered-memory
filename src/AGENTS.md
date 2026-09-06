# src/ — host 侧插件代码（架构不变量）

改 src/ 下任何代码前先通读本文件。浏览器半边（client/）见 client/AGENTS.md。
（根 AGENTS.md 为维护者本地文件、不入库；命令跑法见 package.json scripts。）

## 目录速览

- `index.ts` — cordis 插件入口：`name`、`inject = ['llm', 'tools', 'systemPrompt']`（硬依赖）、
  Schemastery `Config`、`apply()` 装配 MemoryDb/embedding/所有 store/hook/tool/RPC。
- `contract.ts` — RPC 契约单一事实源（**types-only，零运行时代码**）：26 个端点的
  请求/响应类型 + 从各 host 模块迁入的纯数据类型（原模块保留 re-export 不断裂引用）。
  client 经 `import type` 引用（esbuild 构建期擦除）；扩端点先改这里，两侧编译器会追着改。
- `bench-control.ts` — bench 控制服务（`benchControl` 配置门控，默认关）：`ctx.provide`
  `dsh-memory-bench`（RebuildController start/getStatus + SessionModeStore set/get 的薄包装），
  供 bench-runner 的 lifecycle 赛道进程内调用——宿主侧 connection.rpc 只有 handle 没有
  call()，cordis 服务是唯一干净通道；生产部署不开此配置。
- `llm-usage.ts` — 蒸馏用量计数器（常开纯内存）：callLLM 按层（l1-extract/l1-dedup/
  l2/l3）累计调用数/输入字符/输出与思考 token（流 usage 不含输入 token，输入记字符），
  bench 控制服务 getDistillUsage 暴露——「记忆开销」效率三角指标的数据源。
- `token-cost.ts` — 蒸馏成本看板账本：每次蒸馏调用（model × layer）的 token 成本写 SQLite
  明细（模块级单例 + init 注入 db；按 model 分组、持久化保留期默认 365 天，面向 UI 成本看板）。
- `settings.ts` — 记忆模式运行时开关（官方 settings 服务命名空间 `dsh-memory`，live 生效；
  见下方不变量「记忆模式开关」）。
- `hooks/capture.ts` — L0 捕获（session/event turn/end，清洗去噪后落盘 JSONL）。
- `hooks/recall.ts` — **消息侧注入**（ADR-0001）：pre-step prepend 注册、先 next() 再
  在消息列表头部插入 `form:'recall'` 合成消息（排在用户新消息之前）；agent 作用域上下文
  只留稳定区（画像/导航/三条件门控的工具指南）。
- `pipeline/` — `runner.ts`（优先级任务调度、按会话切片触发、闲置兜底、档位切换同步）
  + `trigger.ts`（触发决策纯函数：渐进阈值/切换动作表/闲置扫描/背景选取——S2 测试缝）
  + `l1.ts` / `l2.ts` / `l3.ts`（各层蒸馏）
  + `rebuild.ts`（重建控制器：从 L0 重导全部派生层）。
- `prompts/` — 移植自 MemoryCore 的 LLM Prompt（l1-extraction、l1-dedup、scene、persona）。
- `store/` — 双写架构：
  - `sqlite.ts`（**MemoryDb**：node:sqlite + WAL + FTS5 BM25 + sqlite-vec vec0，主检索引擎）；
  - `cost-ledger.ts`（token_cost 表族：建表迁移 + 写入清理 + 四路聚合，MemoryDb 一行委托）；
  - `search-utils.ts`（RRF k=60、bm25RankToScore、buildFtsQuery/tokenizeForFts）；
  - `embedding.ts`（EmbeddingService：Noop / OpenAI 兼容远程，可选能力）+
    `local-embedding.ts`（本地嵌入的 worker 代理，0.8.6——推理在子线程，见不变量）+
    `embedding-source.ts`（嵌入源三态状态文件）+ `runtime-installer.ts`（本地运行时按需安装）+
    `download-queue.ts`（模型文件断点续传下载）+ `model-catalog.ts`（内置模型白名单，
    锁定 revision + 逐文件 sha256）；
  - `l0.ts`（conversations/ 按天 JSONL + DB 双写）、`l1.ts`（records/ 按天 JSONL 追加式事实源 +
    upsert/deleteBatch 检索库，三策略检索的唯一缝）；
  - `scenes.ts` / `persona.ts` / `state.ts`（L2/L3/checkpoint 保持文件形态，构造带 family 参数
    分族拆分）+ `session-modes.ts`（会话档位 Map + 写穿持久化 + 档位切换回调）+
    `pending.ts`（未蒸馏缓冲持久化 pending.json：条目带 sessionId、随桶存渐进阈值状态）+
    `recall-dedupe.ts`（召回去重：内存 Set 权威 + 写穿持久化）+
    `bm25.ts`（仅 L2 场景摘要选上下文用）+ `io.ts`（原子写等文件原语）。
- `tools/index.ts` — 模型工具：memory_search / conversation_search / memory_read_scene
  （execute 的 `exec.agent.id === sessionId` 用于按会话档位过滤）。
- `stats.ts` — 通用 RPC 端点 `dsh-memory/*`，供 client 工作台与输入栏芯片拉数据；
  工作台三聚合端点（workspace-overview / asset-activity / runtime-insights）的装配在
  `workspace-aggregates.ts`（只读、索引化，不改蒸馏/召回语义）。
- `llm.ts` / `config.ts`（Schemastery schema + MemoryConfig）/ `types.ts` / `util/`。
- `smoke.ts` — 冒烟测试（不依赖 DSH 运行时，纯 assert；第 21 节对 dist/client.js 产物断言）。

## 架构边界与不变量（改代码时必须保持）

- **配置导出必须叫 `Config`**：cordis 运行时只读 `plugin.Config`（Standard Schema `~standard` 接口）
  做校验与默认值填充；导出 `schema` 会被**静默忽略**→ 嵌套 config 为 undefined → apply 抛
  TypeError → fiber FAILED → **dsh 整个启动失败**（2026-08 修复过的真实事故）。
- **存储初始化失败只降级不崩溃**：apply 里 ensureDir/store init 失败 → 禁用捕获/蒸馏 +
  error 日志，宿主必须照常启动（记忆是增强能力）。
- **管线失败绝不阻塞 Agent 循环**：所有蒸馏阶段失败只记日志（logger.warn/error），不抛出。
- **防反馈循环**：召回注入用标签包裹（如 `<relevant-memories>`），capture 侧必须剥离这些标签与代码块。
- **L0 捕获缓冲只收 4 类事件**（user/message、assistant/message、turn/start、turn/end，`isCaptureRelevant`）：
  实时流里的 text-delta/reasoning chunk 每秒数百条，缓冲它们会撑爆 MAX_BUFFER 并把轮次头部
  （turn/start + user 消息）裁掉（2026-08-16 真实事故，长回复轮次丢 user 消息）。裁剪铁律
  （`trimBuffer`）：进行中轮次的事件绝不裁。**L0 在 capture 的 turn/end 即时落盘**（独立串行链，
  `l0Queue`），runner 不再写 L0——否则会被蒸馏队列里的慢 LLM 调用阻塞，进程退出时丢排队消息。
- **检索唯一缝**：`L1Store.search()`（现 async，接受 `{type?, family?, scoreThreshold?, embeddingTimeoutMs?}`）是唯一检索入口；
  换检索实现只改 `src/store/sqlite.ts` + `l1.ts`/`l0.ts`，不要在别处另开检索路径。
  family 过滤三路都有（FTS SQL `AND family=?` / vec 过度召回×3 + 回查过滤 / hybrid 双路各自过滤后 RRF）。
  **时效衰减加权（0.8.6，#29）**：`applyDecayWeight`（search-utils）在 `search()` 三路
  阈值后、截断前挂载——`score × max(0.5, 0.5^(Δ天/半衰期))`（Δ 按 updated_at，缺失按最老→地板），
  乘法保相关性主导（只轮转相关度相近候选的名次，不淘汰）；地板 0.5 是安全边界（老记忆最多损失
  一半排序分），不进配置；`recall.decayHalfLifeDays`（默认 30，0=关，bench 可 pin 0 保基线可比）。
  **只作用于读路径**：`searchCandidates()`（去重候选）禁止应用——写路径找同语义旧记录要无视
  新旧，衰减会让去重漏检（同事实双记录）；hit 的原 score 字段不被改写（排序用加权分，展示反映
  检索相关度）；updated_at 经 `getL1ByIds` 批量点查回填（FTS 表无该列，候选池 ≤3×limit 条主键查询）。
- **分词器（jieba ∪ 二元组并集）**：`src/util/tokenizer.ts` 惰性加载 `@node-rs/jieba`
  （createRequire，与 sqlite-vec 同款），失败永久回退纯二元组（进程内模式定死不漂移）；
  `tokenize()`（util/text.ts）产出 **jieba 词 ∪ 拉丁词 ∪ CJK 二元组** 有序去重并集，
  读写两侧（buildFtsQuery / tokenizeForFts / bm25.ts）共用。二元组是召回底线：
  查询"负载"须命中只含"负载均衡"词元的行，**不许去掉并集里的二元组路**。
  FTS 索引按 `embedding_meta` 的 `fts_tokenizer` 戳自动重建（戳 ≠ 当前分词器 →
  l1_fts/l0_fts drop 后从 l1_records/l0_conversations 回灌；无戳视同 bigram-v1）。
- **双写语义（官方）**：JSONL（`conversations/`、`records/` 按天）只增不改，是备份/恢复事实源；
  `memory.db` 是主检索引擎——去重合并的 update/merge 走"新记录追加 + 目标 deleteBatch"，
  **禁止恢复全量重写 records.jsonl 的旧做法**。旧布局（`l0/`、`l1/records.jsonl`）在 init 时
  自动导入检索库并改名 `.imported`。
- **FTS 防御删除必须先主表点查（ADR-0002，0.8.0）**：upsert 前的防御性 FTS 删除
  （record_id UNINDEXED，按 id DELETE 是全表扫描）必须先做主表存在性点查（主键索引），
  行不存在即跳过——否则重建/重嵌/导入等全新增路径每条记录白付一次全扫（整体 O(N²)）。
  **禁止改 rowid 映射方案**（陈旧映射静默错删他人索引，比慢更糟；正确修法是外部内容表，
  见 ADR-0002）。
- **sqlite-vec 降级规则**：加载失败 → 纯 FTS（capability 位），不崩不装死；FTS5 建表失败 →
  ftsSearch=false；**MemoryDb 构造/开库失败 → 构造器内部捕获并自降级（构造永不抛出）**，
  再叠加 schema 失败 → degraded → 走 storageOk=false 停用链路。embedding 调用失败
  → 单次降级 FTS + 告警一次（`EmbedHelper`），绝不上抛阻塞管线。
- **embedding meta 时机**：`embedding_meta` 只在重嵌入完全成功（或空库）后写入
  （`markEmbeddingSynced`）；向量能力启用时每 30 分钟比对向量行数 vs 元数据行数自动补齐
  （backfill，index.ts）。reindex 返回 `{written, failed}`，failed>0 不得标记同步。
- **embedding 配置变化**（provider/model/维度）→ `embedding_meta` 比对 → drop 向量表 →
  后台 `reindex()` 全量重嵌入；维度为 0 表示纯 FTS 模式（不建 vec 表，不加载 sqlite-vec）。
- **存储形态**：`memory.db`（检索库，L1 带 family 列）+ JSONL 事实源（L0/L1 按天，L0 不分族）+
  Markdown（L2 场景块 `scenes/<family>/`、L3 `persona-<family>.md`）+ `state.json`（v2 分族
  checkpoint）+ `pending.json`（未蒸馏缓冲）+ `session-modes.json`（会话档位）+
  `recall-dedupe.json`（召回去重：sessionId → 已注入记录 id 集合）。
  重建归档产物为 `records.bak.<ts>/`、`scenes.bak.<ts>/`、`persona-*.md.bak.<ts>`。
  数据目录默认 `dshHomePath('memory')`（即 `$DSH_HOME/memory`，勿自己拼 HOME 路径）。
- **未蒸馏缓冲（pending.ts，0.8.0 会话切片化）**：pending 三桶（auto/chat/work）每次蒸馏
  尝试后原子落盘 `pending.json`，**条目携带 sessionId**（旧格式无字段 → 归 `legacy` 组），
  随桶持久化渐进阈值状态（warmup：1 起步翻倍至 minMessages 稳态毕业，0=已毕业）。
  `runner.init()` 恢复（坏文件空桶起步）并延迟 20s 对非空桶**按会话切片分组**补跑一次。
  单桶上限 200 条（重建轮 `noBufferCap` 豁免——历史会话需全量入桶）。
  抽取连续失败按会话**指数退避**（`extractionBackoffMs`：60s 起步翻倍封顶 30min，成功
  消费清零，重建轮豁免；瞬态不持久化），退避期间闲置兜底不入队、阈值触发跳过该会话
  ——否则 LLM 故障期间闲置兜底每 30s 入队、在 120s 超时等待中堆积成连环重试风暴
  （0.8.6 修复，memory.log 实证每 2 分钟一轮不收敛）。
- **会话切片铁律（ADR-0003，0.8.0）**：蒸馏的一切触发都以会话切片为单位——阈值按会话
  计数且只抽取达标会话的切片；闲置兜底（idleSeconds，默认 300s，off 档会话挂起跳过）
  与档位切换（非 off 间切换→按捕获档位立即落袋 / 切 off→挂起 / 切回→清挂起；挂点在
  session-modes 的 set() 回调）都只动目标会话的切片；**切片内永不跨会话、跨档位混装**。
  抽取背景按会话从 L0 现查（recentBySession，走会话索引）并按消息 id 剔除切片自身——
  **禁止全局背景数组**（跨会话污染 + 重启即丢，0.8.0 修掉的缺陷）。重建轮 force 全量
  蒸馏不受阈值约束、也不推进爬坡。
- **消息侧注入铁律（ADR-0001，0.8.0）**：召回合成消息必须带
  `source: {kind:'plugin', plugin:'memory', form:'recall'}`（plugin 字段是宿主 UI 的署名后缀
  "上下文注入 · memory"，用展示名而非 cordis id）——capture 侧只收
  `source.kind === 'user'` 的消息，这是 L0 防反馈循环的结构性机制（勿改 capture 过滤）；
  注入只在有新用户来源消息的步骤发生（轮首 + steering 插话），排在用户消息**之前**，
  pre-step 必须 prepend 注册且先 `await next()` 再改写；召回预算（单条/整轮）与总超时
  （recall.timeoutMs）在注入路径强制生效，超时跳过本轮绝不阻塞对话。
- **召回去重（0.8.6）**：同会话已注入过的记录不再重复注入（`recall-dedupe.ts`：
  内存 Set 权威 + 写穿 `recall-dedupe.json`，LRU 200 会话 / 单会话 512 id / 90 天过期，
  I/O 失败降级内存态）。纯过滤——剩几条注几条，全量压制是正确状态；粒度 = 记录 id
  （更新换 id 天然解除压制）；`agent/session-start` 的 `compact`/`clear` 重置、`resume`
  不重置；只标记模型真实看到的条目（预算截断保留前缀 → 注入 = fresh 的前 lines.length
  条）；统计口径：全量压制轮计入 hitTurns（分母 injectedTurns 仍计全部检索轮，悬浮卡
  命中率不失真）、lastHits = 实际注入数（0.8.6 与用户共识的偏差：原定"injectedTurns
  只计实际注入轮"会让命中率恒 100% 空转，实现改为保分母语义）。
- **调度优先级（runner）**：内部是任务列表（非 Promise 链），`pickNextTaskIndex` 永远先取
  最早的 live 任务，否则队首 rebuild 任务——重建分块让位于正常对话轮次；重建链一次只挂
  一个块（跑完再挂下一块），取消 = 不再挂下一块 + 已入队块开跑前检查取消标志。
- **重建边界（rebuild.ts，0.6.0 引入 / 0.7.0 审查修复引用释放）**：L0/conversations 永不触碰；旧 `records/`、`scenes/`、
  `persona-*.md` 归档（改名，任一失败即终止重建——半清半留破坏"全量重导"）；`db.clearL1()`
  清 L1 三表（vec 表 DROP+重建，放事务外）；`state.reset()` 必须**原地突变**（runner.states
  持有桶对象活引用）；统一 auto 档、按会话分块（会话按首条时间排序）；收尾强制 L2（各族
  残余记录）+ L3（checkpoint 重置后 hasPersona=false → 冷启动触发，无场景的族跳过）。
  重建期间新捕获的 L0 走正常轮次蒸馏（快照从 DB 读，事务一致，天然不重不漏）。
- L2 场景块：LLM 的 delete 操作（输出 `[DELETED]`）由工程侧**删除文件**（硬删除）；
  META 块存热度/摘要；persona-*.md 读取时剥离 Scene Navigation 段。
- **日志**：`withFileLog`（index.ts 装配）把 info+ 镜像到数据目录 `memory.log`（2MB 轮转），
  debug 只进宿主控制台。新代码的关键节点走 `logger.info`（捕获/LLM 调用/阶段耗时/去重决策/召回命中），
  失败用 `errDetail()`（带堆栈首帧），LLM JSON 解析失败必须用 `parseJsonLogged`（记录原始输出摘录）。
- **记忆模式开关**（settings.ts）：官方 settings 服务命名空间 `dsh-memory`（live 生效）。
  生效规则 = 静态 config（部署上限）AND 运行时开关，三处门控：capture 事件入口 /
  runner 蒸馏步骤 / recall 注入文本函数。settings 服务晚于插件就绪时监听
  `internal/service` 补挂；服务缺失时保持全开（行为与无开关版本一致），UI 侧隐藏开关。
  UI 写开关走 `dsh-memory/settings-set` RPC → `scope.update()`，不要另开写路径。
- **bench 控制服务**（bench-control.ts，0.8.5）：`benchControl` 配置为 true 时
  `ctx.provide('dsh-memory-bench', …)`——rebuild 触发/状态与会话档位的进程内薄包装，
  仅供 bench profile 的 lifecycle 赛道（分族门控/off 捕获/rebuild 保真/遗忘请求）。
  默认关、生产零表面积；不要经它暴露任何新逻辑（只包既有公开 API）。
- **会话档位（0.4.0，session-modes.ts）**：`MemoryMode = auto|chat|work|off`，按 sessionId
  存 `session-modes.json`（内存 Map + 写穿，串行化持久化）。**写入与召回同档**是核心不变量：
  档位同时决定蒸馏 prompt（auto→合并词表，纯档→窄 prompt + 强制族标签）与召回范围
  （`L1Store.search` 的 family 过滤 + 画像/导航按族注入）。off 档在 capture 入口与
  turn/end 双重拦截（不写 L0）；工具路径经 `exec.agent.id` 查档。默认档 = `config.family`
  （union `auto|chat|work`，默认 auto，语义是"新会话默认档"而非全局唯一家族）。
- **L2/L3 分族隔离**：`SceneStore(dataDir, family)` → `scenes/<family>/`，
  `PersonaStore(dataDir, family)` → `persona-<family>.md`，`state.json` v2 按
  `families.chat|work` 分桶（阈值计数/情境链/lastExtractAt 各自独立）。auto 档抽取产出
  按记录族分组走各自的 L2/L3；auto 的情境链只维护"最近活跃族"锚点桶。
  **去重候选只在同族内召回（searchCandidates 带 family），去重永不跨族。**
- **族标签事实源**：记录的 family 以 `MemoryRecord.family` 为准，写入走三级兜底链
  `resolveRecordFamily`（types.ts）：**纯档强制（forcedFamily）→ auto 档抽取显式 family
  （语境归族、形状不归族；family 决定 type 词表不许交叉，见 l1-extraction.ts 与上游
  分叉注释）→ type 前缀推导（familyForType，旧输出兜底）**。DB 层 `normFamily` 同规则兜底。
  显式 family 是 2026-08-23 lifecycle 赛道实测修复——此前 auto 档靠 type 前缀隐式定族，
  个人"计划性"事实（喂养频率/用药周期）被 work_fact/work_method 形状语义吸走 → 族错标
  → 同事实双族并存（去重不跨族、旧值复活）+ 分族门控泄漏。存量错标库靠升级后 rebuild
  一次治愈（L1 清空重导）。
  旧库迁移：l1_records ALTER 补列 + type 前缀回填；l1_fts 缺 family 列 → drop 全量重建回灌；
  scenes/ 根下散文件 → scenes/chat/；persona.md → persona-chat.md；state v1 平铺 → chat 桶。
- **嵌入源三态（本地嵌入模型）**：远程/本地/关闭由数据目录 `embedding-source.json`
  （写穿持久化，session-modes 同款）决定，初始解析在**建 db 之前**（dims 依赖它）；
  生效 = 部署上限 AND 状态文件（本地受 `embedding.allowLocalModels` 上限，远程需四件套）。
  本地推理运行时（transformers.js 钉死版本）**按需**安装到数据目录 `runtime/`
  （锚定 package.json + **随包 lockfile → `npm ci`** 锁定完整传递依赖树，ci 失败回退
  `npm install` 精确版本；绝不进插件 npm 包依赖）；模型目录是内置白名单
  （`src/store/model-catalog.ts`，锁定 revision + 每文件 sha256，升级=改目录触发重嵌）。
  **嵌入推理只在 worker 线程（0.8.6 铁律）**：transformers 的 require、模型加载与每次
  ONNX 推理都发生在 `resources/embedding-worker.cjs`（worker_threads，构建期拷入 dist 根）
  ——onnxruntime-node 的 `run`/`loadModel` 是 setImmediate 回调里的同步调用（Promise 包装
  不卸载计算），回主线程即冻结宿主事件循环、整页无响应（0.8.6 修掉的真实事故）；主线程
  只有 `local-embedding.ts` 的协议代理（`EmbedWorkerChannel` 测试缝，smoke 注入
  FakeEmbedChannel，勿再引入进程内 loader 路径）。worker 内逐条推理、条间 setImmediate
  让路，单条请求（召回 query）插队不被 reindex 批次堵队尾；`callOpts.timeoutMs` 经
  race 钳制（迟到回复丢弃，同步推理无法真正取消）；worker 崩溃不自愈（failed 态走
  FTS 降级链，换源/重启恢复），且崩溃/释放后的通道必须快速拒绝新请求（postMessage 到
  死线程静默无回应，调用方会挂到超时）。
  活切换不变式：`swapProvider` 的 unchanged 判据必须 **meta + 物理表维度双吻合**
  （防"meta=旧源、表=新维度"错位导致 upsert 静默丢数据）；meta 语义 = 物理表现状
  （swap 成功即写，重嵌取消/部分失败不回滚，缺失行靠 backfill 的 missing 计数补齐，
  该判据不依赖 meta）；**所有 `markEmbeddingSynced` 调用走 `manager.currentProviderInfo()`**
  （启动闭包里的陈旧 info 会腐蚀 meta）；启动/补齐链标记 meta 前必须 missing 复查为 0
  （服务未就绪的空转 0/0/0 不是成功）。`LocalEmbeddingService.close()` = worker
  terminate，之后 terminated 不可复活（防卸载后模型重载泄漏）。下载器断点续传：`.part`
  满尺寸先哈希预校验、416 删断点从零重试、落盘后单遍哈希校验。

## dsh 运行时 API 硬规则（已对照本机 .d.ts 逐一验证）

- **ctx.llm 是流式 API**：`ctx.llm.stream(GenerateOptions)` 返回 `AsyncIterable<StreamChunk>`，
  没有 `generate()`。`GenerateOptions` 必须带 `provider`/`model`；"当前默认模型"来自可选服务
  `ctx.get('agentDefaultModel')?.currentSelection()`。**收集文本只取 `block-end`**（协议保证携带
  组装完的整块），`text-delta` 仅兜底——两者都累计会把输出翻倍（修过的真实 bug）。
- **ctx.tools.register(defineTool({...}))**：`output: { schema, render }` 是强制字段；`execute`
  返回受 schema 校验的 canonical value；参数 schema 用 `{ key: { type, required?, description? } }`
  DSL（显式 object 节点必须带 `additionalProperties`）。
- **ctx.systemPrompt.context({ name, order, text })**：text 是同步函数，异步内容必须走内存缓存。
- **agent 作用域注册**：`agent.ctx.systemPrompt.context(...)`；插件加载晚于 agent 创建时必须用
  `ctx.get('agents')?.list()` 给已存在的 agent 补注册（只听 `agent/created` 会漏掉默认 agent）。
- **事件**：`session/event (session, event)` emit 模式；`agent/pre-step (payload, next)` waterfall
  必须调 next；`SessionEventMap` 中 `user/message` 的 data 就是 UserMessage，
  `assistant/message` 的 data 是 `{ turn, step, message, usage? }`。
- **Host↔Client RPC**：Host `ctx.connection.rpc.handle('/rpc', handler)`（0.1.2-alpha 起
  两参——第三参 `{authority:'loopback'}` 已删，回环约束改由宿主侧 Host/Origin fence +
  浏览器 token 鉴权统一承担）返回**同步**的异步 disposer（`() => Promise<void>`，不能
  .then 链）；Client
  `ctx.connection.rpc.call('/rpc', endpoint, payload)` 返回 `RpcResult`（`{ok,value}|{ok,error}`）。
  connection 是可选服务且可能晚于插件就绪：探测 + 监听 `internal/service` 事件补注册。
- **Context 声明合并要靠 import 拉进来**：`ctx.get('connection')` 想拿到类型，必须
  `import type {} from '@deepseek-ai/dsh-client-connection'`（纯类型导入，无运行时依赖），
  否则是 any。`agentDefaultModel`/`agents` 同理。
- **Session 事件读取（0.1.2-rc.1 起）**：宿主移除了 `Session.events` getter，改为
  `eventAt(seq)` / `snapshotEvents(from?, to?)` / `ownEvents()`。鸭子探测路径
  （recall.ts 的 estimateRecallTokens）双轨兼容：有 `snapshotEvents` 用之，否则回退
  `events`（覆盖 alpha 宿主）——`surface.nodes`、`sessionPersistence.loadStored()`
  返回的 `StoredPrefix.events` 均未变。

（client bundle 侧的 handoff 协议与 slots 注册规则见 `client/AGENTS.md`。）

## 代码约定（src 侧）

- ESM（`"type": "module"`）+ TypeScript strict + NodeNext：src 内相对导入**必须带 `.js` 扩展名**。
- 注释与日志用中文；日志走 `MemoryLogger`（`ctx.logger` 封装），消息带 `[memory]` 前缀。
- 配置一律进 `src/config.ts` 的 Schemastery schema（带默认值），不要在别处读裸 env（`DSH_HOME` 除外）。
- 无测试框架；验证用 `src/smoke.ts` 补 assert 场景（`pnpm run smoke` 自动先重建 dist-smoke；
  陷阱见下方 Gotchas）。
- **导出的 schema 常量必须显式注解类型**（如 `Schema<any, MemoryConfig>`，官方 dsh-time-context
  同款）：pnpm 符号链接布局下 TS 无法为推断类型命名传递依赖 cosmokit（TS2742 声明发射
  可移植性错误，npm 扁平布局掩盖了它）——新导出 schema 一律照此注解。
- 新增/变更 RPC 端点：先改 `src/contract.ts`（类型单一事实源），再改 stats.ts 的 case 表与
  client 两侧——双链 typecheck 会追着改。

## Gotchas（src 侧）

- **直接 `node dist-smoke/smoke.js` 跑的可能是陈旧产物**：tsconfig exclude 了 `src/smoke.ts`，
  `npm run build` 不产出 dist-smoke——`npm run smoke` 已前置 build:smoke 重建（CI 同链），但绕开
  npm script 直跑 node 前须先重建。也可 `node --import tsx src/smoke.ts` 直接跑源码（需自装 tsx）。
  dist-smoke 也不拷资产：worker ping 测试在 `dist/embedding-worker.cjs` 缺失时自动跳过
  （先 `npm run build` 再跑 smoke 才会真正执行该段）。
- smoke 里建的 `MemoryDb` 必须 `db.close()` 再删临时目录，否则 Windows 报 EBUSY（文件句柄未释放）。
- `node:sqlite` 在启动 stdout 会打一条 ExperimentalWarning（Node 对 sqlite 模块的提示），
  无害，不要当成插件错误。
- `sqlite-vec` 是原生扩展（预编译二进制）；加载路径走 `createRequire(import.meta.url)`，
  从仓库 node_modules 解析——部署环境需保证该依赖随包安装。
- **数据目录属信任边界内**（威胁模型假设，0.8.2 审查记录）：本地嵌入运行时
  （runtime/node_modules）的就绪判定只比对 package.json 的 version 字符串——对数据
  目录有写权限的进程理论上可植入恶意模块绕过版本检查在插件进程内执行。模型文件
  是逐文件 sha256 锁定的，运行时代码没有同等级防护；完整修复需要安装指纹（lockfile/
  入口哈希落地复验）设计决策，暂以文档化假设为准。
