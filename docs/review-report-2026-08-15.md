# dsh-memory-plugin 代码审查报告（v0.2.1）

- **日期**：2026-08-15
- **范围**：全量 `src/` 树（重点为 0.2.0/0.2.1 存储检索重构涉及文件）+ 文档（README / AGENTS / CHANGELOG）
- **方法**：双轴并行审查（标准轴 = 对照 AGENTS.md 约定 + Fowler 坏味道基线；规格轴 = 对照 CHANGELOG/README/AGENTS 的事实性声明逐条核实）。本仓库非 git 仓库，无法取 diff 固定点，按"当前文件全量"适配执行。
- **结论速览**：架构与降级设计总体成立；发现 **1 个高危不变量违规**（存储构造未保护，可拖垮宿主启动）、若干中低危逻辑/文档问题。

---

## 标准轴（对照 AGENTS.md 约定 + 坏味道基线）

### 硬违规（对照仓库明文标准）

| # | 严重度 | 发现 | 位置 |
| --- | --- | --- | --- |
| S1 | **高** | **storage-degrade 不变量被打破**：`new MemoryDb(...)` 不在任何 try/catch 内。构造器里 `mkdirSync`、`new DatabaseSync`、5 条 PRAGMA `exec` 全都可能抛（目录只读/DB 文件被锁/EBUSY）——一旦抛出即逃逸 `apply()` → fiber FAILED → **dsh 宿主启动崩溃**，正是 AGENTS.md 明令禁止的事故类别。更糟：`ensureDir` 失败（storageOk=false）后第 98 行仍会在不可写目录上构造 DB，降级路径自身就会抛。`db.init()` 有保护（index.ts:104-116），**构造没有** | `src/index.ts:98`；`src/store/sqlite.ts:105-117` |
| S2 | 低 | **`[DELETED]` 软删除语义与代码不符**：AGENTS.md 说 L2 场景块"软删除"，`SceneStore.write` 实际是硬 `unlink`，函数注释（scenes.ts:49）还写着"软删除"；scenes.ts:36 的 `[DELETED]` 内容过滤因此成了死代码 | `src/store/scenes.ts:36,49,56-58` |
| S3 | 低 | **"不再全量载入内存"被 L1 轮次打破**：`pipeline/l1.ts:151` 每轮抽取都 `store.all()`（全表 `SELECT`）只为建 `byId` 拿目标版本号；已有 `getL1ByIds` 精确查询可用 | `src/pipeline/l1.ts:151`、`src/store/sqlite.ts:546` |

### 判断项（Fowler 坏味道基线，均属可辩）

- **重复代码**：`embedQuerySafe` + `warnEmbed` 在 `l0.ts:140-154` 与 `l1.ts:202-227` 双份克隆；`EmbeddingProviderInfo` 接口在 `embedding.ts:9` 与 `sqlite.ts:39` 声明两次；`stats.ts:136-140` 的 `resolveDataDirDisplay` 重新实现了 `config.ts` 的 `resolveDataDir` 且回退逻辑分叉；`'## 🗺️ Scene Navigation'` 字面量在 `scenes.ts:69` 硬编码而 `persona.ts:8` 已导出 `NAV_HEADER`。
- **中间人 + 过期注释**：`stats.ts:142-146` 的 `readTodayCount` 纯转发，注释描述的还是旧实现。
- **投机通用性 / 死代码**：`Bm25Index.add`（bm25.ts:53）无人调用；`reindex(onProgress?)` 回调从未被传；`ExtractionResult.stored/skipped/sceneName`、`PersonaResult.generated/reason` 从未被读取；`recall.ts:175` 导出的 `buildProfile/formatL1Memories` 模块外无消费方；bm25 命中付出了 `makeSnippet` 成本但 `l2.ts:107` 只用 `h.id`。
- **撒谎字段**：`stats.ts:131-132` 的 `pendingExtract: 0` 与 `message: 'running'` 恒定硬编码，降级态也报 running。
- **守卫不一致**：`countL0Since`（sqlite.ts:676）缺兄弟方法都有的 try/catch——`init` 被跳过时 stats RPC 会抛 "no such table"（被 stats.ts:72 兜住，面板显错不崩溃，但行为不齐）。

### 验证通过项（抽查确认干净）

`Config` 导出名（index.ts:51）；全部相对导入带 `.js`；日志 `[memory]` 前缀；llm.ts 只收 `block-end`；waterfall `next()`（recall.ts:97）；同步 context text 走缓存；RPC disposer 同步返回无 `.then`（stats.ts:63-90）；capture 剥离全部四类注入标签；去重 = 追加新记录 + `deleteBatch`、无 JSONL 全量重写（pipeline/l1.ts:206-207）；SQLite 事务块内无 await，stats RPC 与管线队列在同步连接上无真并发风险；`db.close()` 经 `ctx.effect` 注册（index.ts:100）。小项：后台 reindex（index.ts:149）未随 dispose 取消，close 后的写入被吞，仅浪费功夫无损害。

---

## 规格轴（对照 CHANGELOG/README/AGENTS 声明逐条核实）

### (a) 声明了但缺失/部分实现

| # | 严重度 | 发现 | 声明 vs 代码 |
| --- | --- | --- | --- |
| P1 | 中 | **"type 过滤再 ×5" 数字不对**：代码 `filterBoost = CANDIDATE_MULTIPLIER`（=3），总放大 = limit×3×3 = **×9**；官方的 ×5 是多租户隔离过滤的放大，并非 type。属文档失实或系数应对齐 | CHANGELOG.md:50-51 vs `src/store/l1.ts:27,118-119` |
| P2 | 低 | **"source_message_ids（落库保留）"过度声明**：`l1_records` 无此列，`rowToRecord` 也不还原；仅存于 JSONL。CHANGELOG 括注与 types.ts:61 自述矛盾 | CHANGELOG.md:42 vs `src/store/sqlite.ts:194-232` |
| P3 | 低 | **"可 reindex 补齐"无触发路径**：`reindex()` 唯一触发是 provider/model/维度变化；嵌入批量失败跳过的向量没有任何工具/RPC/配置入口补齐，只能改配置绕道 | CHANGELOG.md:71 vs `src/index.ts:148-160` |
| P4 | 低 | **stats 版本号硬编码 `0.1.0`**，package.json 已是 0.2.1 | `src/stats.ts:119` |

### (b) 未声明的行为（超范围）

- `L0Store.search` 也实现了 FTS+向量 hybrid RRF（`l0.ts:105-113`），文档只描述了 L1 的三策略。
- `runner.ts:79` 的 `pending > 200` 直接清空重试缓冲——与 CHANGELOG"消息不丢失"表述存在张力（分块保的是单次抽取输入不丢；200 上限是另一条独立的丢弃路径，消息仍在 L0）。

### (c) 已实现但有 bug / 语义偏差

| # | 严重度 | 发现 | 位置 |
| --- | --- | --- | --- |
| P5 | **高** | **与 S1 同源**：`new MemoryDb` 未保护 → 违反 AGENTS.md:69-71 降级不变量（详见标准轴 S1） | `src/index.ts:98` |
| P6 | 中 | **hybrid 阈值与分数语义偏离官方**：官方 hybrid 对各路结果**不做阈值**、全量 RRF 融合（auto-recall.ts:623 `_threshold` 未用）；我们在融合前对各路按 0.3 过滤。且 hybrid 命中的 `score = rrfScore`（≤ ~0.033），与 keyword/embedding 的 0~1 分数语义不一致——memory_search 会给模型报 0.02~0.03 的分数，字段语义破碎 | `src/store/l1.ts:143-147`、`src/tools/index.ts:64` |
| P7 | 中 | **embedding_meta 过早写入的 reindex 漏洞**：sqlite-vec 加载失败或 reindex 分块失败时仍写入 meta（sqlite.ts:335；l1.ts:184-187）→ 下次启动同配置比对通过 → 不 drop 不重嵌 → 向量表永远空着而 `vectorSearch=true`，向量检索静默退化为无结果 | `src/store/sqlite.ts:170-190,335` |
| P8 | 低 | **旧数据迁移的假成功日志**：`fs.rename(...).catch(() => undefined)` 后无条件打"已导入"成功日志；Windows 上目录对目录 rename 失败时（`l0.imported/` 已存在）每次启动重跑导入却报成功。rename 也不看 upsert 返回值，理论上能把未导入完的源改名走 | `src/store/l0.ts:51-54`、`l1.ts:61-64` |

### (d) 文档漂移

- README 配置表所列行与 config.ts 默认值**全部一致**，但省略了 ~15 个已存在字段（recall.enabled/includePersona/includeSceneNav、embedding.apiKey/maxInputChars/timeoutMs、llm.maxTokens/temperature/timeoutMs、tools、capture.stripCodeBlocks/maxMessageChars、extract.enabled/backgroundMessages、l2.enabled/sceneContextLimit、l3.enabled），且无"节选"标记。
- CHANGELOG"验证"小节的声明抽查全部属实（阈值/小语料例外、hybrid+embedding、merge 语义、RRF/bm25/buildFtsQuery 断言均在 smoke 中存在）。

### 核实为非问题（按审查要点排除）

`countToday` 的 ISO 字符串字典序比较安全（两侧等宽 `toISOString`）；stats RPC 与管线在单同步连接上无并发危害（事务块内无 await）；BM25 公式与小语料例外条件忠实于官方。

---

## 汇总

- **标准轴**：3 项硬违规 + 6 类判断项；最重为 **S1（MemoryDb 构造未保护，可致宿主启动崩溃）**。
- **规格轴**：4 项声明缺失/失实 + 2 项未声明行为 + 4 项实现偏差 + 1 项文档漂移；最重为 **P5/P6（同一构造缺陷；hybrid 分数语义破碎影响 memory_search 输出质量）**。

（按双轴审查方法，两轴发现保持分离不做跨轴排序；上表编号供后续修复任务引用。）

---

## 修复记录（0.2.2，2026-08-15）

全部发现已在同日修复并验证（build + smoke 全绿 + 不可写路径降级实测 + 真机启动验证）：

| 编号 | 修复方式 | 验证 |
| --- | --- | --- |
| S1/P5 | `MemoryDb` 构造器整体 try/catch 自降级（构造永不抛出）；`init()` 对降级实例短路 | `Q:/` 不可写路径实测：degraded=true、全部操作 no-op、无异常 |
| P6 | hybrid 融合前移除阈值过滤（官方语义，`scoreThreshold` 仅对 keyword/embedding 单路生效）；RRF 融合分归一化 0~1（双列表 rank1=1.0） | smoke：`hybrid 融合分归一化 0~1 (1.000)` |
| P7 | `embedding_meta` 延迟到重嵌入完全成功后写入（`markEmbeddingSynced`）；失败下次启动重试 | 代码路径 + meta 时机单测覆盖（reindex failed>0 不标记） |
| P3 | 新增 30 分钟周期向量补齐（缺量判定幂等，启动 1 分钟首跑） | 代码路径（无独立 smoke，随 boot 验证） |
| P8 | 迁移只在全部入库成功后 rename；rename 失败/部分导入打真实日志并下次重试 | smoke 6c 迁移断言仍全绿 |
| P1 | 移除 type 过滤的额外放大（候选池固定 ×3，对齐官方 tool 路径）；CHANGELOG 0.2.0 失实描述就地更正 | smoke type 过滤断言通过 |
| P2 | CHANGELOG 0.2.0 措辞更正（source_message_ids 仅存 JSONL） | 文档 |
| P4 | stats 版本号经 createRequire 读 package.json；message 反映降级态；pendingExtract 接 runner.pendingCount；countL0Since 补守卫 | build + RPC 字段核对 |
| S2 | 文档与注释对齐实际行为（LLM delete → 工程侧删除文件；list 容错遗留标记） | 文档 |
| S3 | pipeline/l1.ts 按候选+目标 id 并集 `getByIds()`，去全表扫描 | build |
| 判断项 | EmbedHelper 收敛重复、EmbeddingProviderInfo/NAV_HEADER/resolveDataDir 统一、死代码移除（Bm25Index.add/snippet/makeSnippet/readTodayCount/未用导出/onProgress） | tsc + smoke |

未处理项（有意保留）：后台 reindex 任务未随插件卸载取消（close 后写入被吞，无害）；
`ExtractionResult`/`PersonaResult` 个别未读字段保留（返回形状清晰性优先）。
