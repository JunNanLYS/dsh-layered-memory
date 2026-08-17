# 全量代码审查报告（2026-08-17）

> 审查方式：三路并行子代理（存储/检索层、管线/钩子/LLM 层、入口/RPC/工具/客户端），聚焦性能、内存泄漏、可用性。
> 修复规格见 GitHub issue #1（ready-for-agent）。本报告保留逐条 file:line 证据供工单引用。

**总体结论**：架构不变量全部成立，无致命缺陷；1 个高严重度（H1）、11 个中严重度（M1–M11）、约 14 个低严重度（L1–L14）。

## 高严重度（已验证）

### H1. embedding 补齐实为全量重嵌入，且零向量记录致每 30 分钟死循环
- `src/index.ts:224` 补齐判据 `countL1Vec() < countL1()`；`src/store/l1.ts:222` reindex 取**全部**行重嵌入（缺 1 条即重嵌整库）。
- `src/store/sqlite.ts:1025` 零向量返回 false → `l1.ts:236` 计入 failed → `index.ts:229` `failed===0` 永不满足 → 不写 markEmbeddingSynced；且零向量记录永远写不进向量表（`upsertL1:557` 同样跳过）→ 计数差恒真 → 无限循环。
- **修复**：reindex 改增量（LEFT JOIN 取缺失行）；零向量记 skipped 不算 failed，补齐判据排除不可嵌入记录。

## 中严重度

### 性能
- **M1. recall 查询不截断**（两路独立发现）— `src/hooks/recall.ts:102` 全量 messages 拼接做 FTS 查询；长会话每步线性涨、整会话二次方累计。embedding 侧有 maxInputChars 截断，FTS 侧没有。修复：取末尾 N 条。
- **M2. 热路径逐次 prepare** — `src/store/sqlite.ts:981-982` searchL0Vector 循环内 prepare（对照 `searchL1Vector:794` 已复用）；`deleteL1Batch`（607-614）、`getL1ByIds`（689-694）动态拼 placeholders，后者在去重热路径；超长 id 列表撞 SQLite 变量数上限。
- **M3. appendNew 逐条开事务** — `src/store/l1.ts:122-124` 每条 BEGIN/COMMIT（WAL FULL 下每 commit 一次 fsync）；L0 已有 upsertL0Batch，L1 缺。

### 数据完整性
- **M4. FTS delete-then-insert 失败被吞** — `src/store/sqlite.ts:561-584`（L0 同 833-842）：delete 已执行后 insert 抛错只 warn、COMMIT 照走 → 该 id 索引行被删未补，全文检索永久不可见。修复：FTS 失败 rethrow 让事务回滚。

### 内存泄漏
- **M5. capture buffers Map 无限增长**（两路独立发现）— `src/hooks/capture.ts:44,66-78` 只有 set/slice 无 delete，每会话残留最多 500 条事件数组。修复：turn/end 后空即 delete。
- **M6. 重建完成后全量消息常驻内存** — `src/pipeline/rebuild.ts:304-314` finish() 不清 this.chunks（prepare 时 `listL0All()` 装入，:182）。
- **M7. dispose 不冲刷 l0Queue 与蒸馏队列** — `src/index.ts:121` 卸载即关库；`capture.ts:47` 串行链与 runner.drain() 无法等待/中止：DB 写入剩 warn，蒸馏任务卸载后继续耗 LLM 调用。

### 可用性 / 健壮性
- **M8. RPC 失败时三面板永久卡"加载中"** — `client/client.js:1315`（PersonaTab）、`:1347`（LogTab）、`:610`（ModePill）无 else 分支且 `.catch(function(){})` 吞错。
- **M9. 存储降级在设置页零呈现** — `src/stats.ts:177` 已返回 degraded message，`client.js:942-957` 概览表从不读它。
- **M10（判断）. settings 命名空间注册不随插件 fiber 销毁** — `src/settings.ts:63`；dsh-settings 实现（`node_modules/.../dsh-settings/lib/index.js:326`）用服务自身 ctx，与其文档注释矛盾；fiber 重启 → 二次 register 抛 already registered → `:85-88` catch 后不再重试 → 已存开关被静默忽略。需实测确认。
- **M11（判断）. connection 服务"消失又回来"不重注册 RPC** — `src/stats.ts:83` `if (holding) return` 只在 teardown（:121-125）复位，与文件头注释（:6）承诺不符。

## 低严重度

| # | 位置 | 问题 |
|---|---|---|
| L1 | `sqlite.ts:148-155` | sqlite-vec 加载失败时 enableLoadExtension(true) 未 try/finally 复位 |
| L2 | `filelog.ts:22-28` | Windows EBUSY 吞掉后 memory.log 无上界；每条日志两次同步 stat |
| L3 | `sqlite.ts:457,679,884,1008-1019` | getAllL1/listL0All 等一次性 .all() 全库载入，建议 iterate 流式 |
| L4 | `runner.ts:220` | 每次蒸馏尝试全量重写 pending.json（最坏 ~2.4MB/次）；重建取消后 noBufferCap 桶数万条落盘，重启才截断 |
| L5 | `recall.ts:106` | query 为空不清 l1Cache，上一步命中注入到无查询步骤 |
| L6 | `runner.ts:216` | pending 超 200 清空整桶兜底为不可达死代码 |
| L7 | `tools/index.ts:79,129` | off 档两搜索工具返回 {items:[]} 与文件头声明不符（仅 :166 read_scene 返回提示） |
| L8 | `client.js:954-955` | 概览分母 " / 5"、" / 20" 硬编码，配置改后失真 |
| L9 | `client.js:1101-1125,1241-1244` | RecordsTab 无请求序列号（旧响应覆盖新结果）；"加载更多"未禁用可双发重复 append；ModePill（:606-613）同竞态 |
| L10 | `stats.ts:270,362` | 搜索 offset 超 200 静默截断且 hasMore 恒 false；log-tail 同步整读 2MB 阻塞事件循环 |
| L11 | `config.ts:119` 等 | 数值字段缺 .min/.max，负 scoreThreshold / 0 timeoutMs 可穿透 |
| L12 | `index.ts:195-212` | 启动期 reindex fire-and-forget，卸载后仍跑全量嵌入 |
| L13 | `rebuild.ts:296` | 收尾强制 L2 会重复处理重建期间 live 轮次新记录（多一次 LLM 调用，语义无害，维持现状） |
| L14 | `runner.ts:233-236` | L2 阈值触发需本族当轮活跃，积压族长期不整合（设计取舍，注释说明即可） |

## 核查为干净的部分（要点）

- **不变量全部成立**：MemoryDb 构造永不抛；三路族过滤（FTS `AND family=?` :343 / vec (topK+10)×3 过度召回+回查 :786-796 / hybrid 双路 l1.ts:171-175）；JSONL 只增不改、dedup 走追加+deleteBatch（l1.ts:106-136）；调度 live 严格优先（runner.ts:45-50）、重建一次一链双检取消（rebuild.ts:213-234）；重建边界（L0 只读快照、归档失败即终止、state.reset 原地 Object.assign state.ts:89-94）。
- **失败语义**：pre-step 全程 try/catch 且无条件 next()（recall.ts:94-122）；蒸馏各阶段独立捕获；llm.ts 单源取文（:112）不翻倍、finish=error 抛错（:100-103）；无 floating promise。
- **防反馈环**：5 种注入标签均在 sanitize 覆盖；user/assistant 双入口都过 sanitize（capture.ts:160,166）。
- **dispose**：startup-retry（runner.ts:118-123）、画像 TTL（recall.ts:78-81）、30min backfill（index.ts:238-245）均 ctx.effect 清理；实测带未 finalize 语句 close() 不抛。
- **RPC/工具**：authority=loopback 真实生效；错误统一 {ok,error}；rebuild-start 有 running 守卫；工具 limit clamp、sanitizeFilename 防路径穿越、output schema 带 additionalProperties:false。
- **客户端**：全文无 innerHTML（XSS 安全）；ES5 纯净（仅 loader 外壳一处箭头）；interval/listener 清理齐全。
