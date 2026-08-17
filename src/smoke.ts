/**
 * 冒烟测试：独立运行核心逻辑（不依赖 DSH 运行时）。
 * 运行：npm run smoke（node dist-smoke/smoke.js）
 */
import { existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { Bm25Index } from './store/bm25.js';
import type { EmbeddingService } from './store/embedding.js';
import { L0Store } from './store/l0.js';
import { L1Store } from './store/l1.js';
import { PersonaStore } from './store/persona.js';
import { SceneStore, sanitizeFilename } from './store/scenes.js';
import { SessionModeStore } from './store/session-modes.js';
import { MemoryDb } from './store/sqlite.js';
import { bm25RankToScore, buildFtsQuery, rrfMerge, tokenizeForFts } from './store/search-utils.js';
import { liveSettingsSchema } from './settings.js';
import { registerMemoryRpc } from './stats.js';
import { StateStore } from './store/state.js';
import { dayKey } from './store/io.js';
import { familyForType } from './types.js';
import { isCaptureRelevant, trimBuffer } from './hooks/capture.js';
import { sanitizeText, shouldCaptureL0, stripCodeBlocks } from './util/sanitize.js';
import { parseJson } from './llm.js';
import { chunkByCharBudget } from './pipeline/l1.js';
import { pickNextTaskIndex } from './pipeline/runner.js';
import { estimateCalls, groupL0Sessions, RebuildController } from './pipeline/rebuild.js';
import { loadPending, pendingPathFor, savePending } from './store/pending.js';
import { formatExtractionPrompt, getExtractMemoriesSystemPrompt } from './prompts/l1-extraction.js';
import { formatBatchConflictPrompt, getConflictDetectionSystemPrompt } from './prompts/l1-dedup.js';
import { buildScenePrompt, formatSceneSummaries } from './prompts/scene.js';
import { buildPersonaPrompt } from './prompts/persona.js';
import { blocksToText, tokenize } from './util/text.js';

let failures = 0;

function assert(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  ✅ ${label}`);
  } else {
    failures++;
    console.error(`  ❌ ${label}`);
  }
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** 确定性假嵌入：关键词映射到正交维度，用于验证向量/hybrid/reindex 路径。 */
class FakeEmbedding implements EmbeddingService {
  getDimensions(): number {
    return 4;
  }
  getProviderInfo() {
    return { provider: 'fake', model: 'fake-4d', dimensions: 4 };
  }
  isReady(): boolean {
    return true;
  }
  async embed(text: string): Promise<Float32Array> {
    return (await this.embedBatch([text]))[0];
  }
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => {
      const v = new Float32Array(4);
      if (t.includes('咖啡') || t.includes('coffee')) v[0] = 1;
      if (t.includes('分层') || t.includes('架构') || t.includes('memory')) v[1] = 1;
      if (t.includes('react')) v[2] = 1;
      if (v[0] + v[1] + v[2] === 0) v[3] = 1;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return new Float32Array(Array.from(v).map((x) => x / norm)) as Float32Array;
    });
  }
}

async function main(): Promise<void> {
  console.log('== 1. 分词 / BM25（场景摘要检索用） ==');
  const index = new Bm25Index();
  index.rebuild([
    { id: 'a', text: '用户喜欢喝耶加雪菲咖啡，偏好手冲' },
    { id: 'b', text: '团队决定 L1 抽取优先使用少量高层工作类型' },
    { id: 'c', text: 'user prefers dark roast coffee beans' },
  ]);
  const hits = index.search('咖啡 耶加雪菲', 2);
  assert(hits.length > 0 && hits[0].id === 'a', `BM25 中文检索命中 (${hits.map((h) => h.id).join(',')})`);
  const hitsEn = index.search('coffee', 2);
  assert(hitsEn.length > 0 && hitsEn[0].id === 'c', `BM25 英文检索命中 (${hitsEn.map((h) => h.id).join(',')})`);
  assert(tokenize('Hello world 你好世界').length >= 3, '分词输出');

  console.log('== 1b. 检索纯函数（官方公式移植） ==');
  assert(bm25RankToScore(-1) > bm25RankToScore(-0.2), 'bm25RankToScore 单调（负值更相关）');
  assert(bm25RankToScore(-1) === 0.5, 'bm25RankToScore(-1)=0.5');
  assert(bm25RankToScore(0) === 1 && bm25RankToScore(1) === 0.5, 'bm25RankToScore 非负分支');
  const merged = rrfMerge(
    [
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'b' }, { id: 'c' }],
    ],
    (x) => x.id,
  );
  assert(merged[0].id === 'b' && merged[0].rrfScore > merged[1].rrfScore, 'RRF 双列表命中项融合居首');
  const ftsq = buildFtsQuery('用户喜欢喝咖啡 的');
  assert(ftsq !== null && ftsq.includes(' OR ') && !ftsq.includes('"的"'), `buildFtsQuery 停用词过滤 (${ftsq})`);
  assert(buildFtsQuery('！！！') === null, 'buildFtsQuery 无有效 token 返回 null');
  const liveResult = (await liveSettingsSchema()['~standard'].validate({})) as unknown as {
    value: { enabled: boolean; capture: boolean; distill: boolean; recall: boolean };
  };
  const liveDefaults = liveResult.value;
  assert(
    liveDefaults.enabled && liveDefaults.capture && liveDefaults.distill && liveDefaults.recall,
    '记忆模式开关 schema 默认全开（Standard Schema 默认值填充）',
  );

  console.log('== 2. 清洗 ==');
  const dirty = '<relevant-memories>\n- [persona] xxx\n</relevant-memories>\n用户实际说的话 ```json {"session":1} ```';
  const clean = sanitizeText(dirty);
  assert(!clean.includes('relevant-memories') && !clean.includes('```'), 'sanitize 剥离注入标签与代码块');
  assert(!shouldCaptureL0(''), '空消息不捕获');
  assert(shouldCaptureL0('普通消息'), '普通消息捕获');
  assert(stripCodeBlocks('解释\n```ts\nconst x=1\n```\n结尾').includes('解释'), 'stripCodeBlocks 保留解释文本');

  console.log('== 3. L0/L1 存储（SQLite 双写，纯 FTS 模式） ==');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-'));
  try {
    const db = new MemoryDb(path.join(tmp, 'memory.db'), 0);
    const initRes = db.init();
    assert(!initRes.needsReindex, 'MemoryDb 初始化（dims=0 纯 FTS）');
    const caps = db.getCapabilities();
    assert(caps.ftsSearch && !caps.vectorSearch, '纯 FTS 能力位');

    const l0 = new L0Store(tmp, db);
    await l0.init();
    await l0.append('sess-1', [
      { id: 'm1', role: 'user', content: '帮我看看 L0 分层记忆怎么设计', timestamp: Date.now() },
      { id: 'm2', role: 'assistant', content: 'L0 是原始对话，L1 是原子记忆', timestamp: Date.now() + 1 },
    ]);
    const l0hits = await l0.search('分层记忆', 5);
    assert(l0hits.length >= 1 && l0hits[0].content.includes('L0 分层记忆'), `L0 FTS 检索命中 ${l0hits.length} 条，首条正确`);
    assert((await l0.countToday()) === 2, 'L0 今日计数（SQL COUNT）');
    assert(
      existsSync(path.join(tmp, 'conversations', `${dayKey(Date.now())}.jsonl`)),
      'L0 JSONL 事实源按天落盘（conversations/）',
    );

    const l1 = new L1Store(tmp, db);
    await l1.init();
    const now = Date.now();
    await l1.appendNew([
      { id: 'r1', content: '团队决定 L0/L1/L2/L3 四层记忆结构', type: 'work_fact', priority: 90, scene_name: '团队在围绕 Agent Memory 设计记忆分层', timestamps: [now], createdAt: now, updatedAt: now, version: 0, source_message_ids: ['m1'], metadata: {} },
      { id: 'r2', content: '用户喜欢手冲咖啡', type: 'persona', priority: 70, scene_name: '闲聊', timestamps: [now], createdAt: now, updatedAt: now, version: 0, source_message_ids: [], metadata: {} },
    ]);
    assert(
      existsSync(path.join(tmp, 'records', `${dayKey(now)}.jsonl`)),
      'L1 JSONL 事实源按天落盘（records/）',
    );
    const l1hits = await l1.search('记忆分层', 5);
    assert(l1hits.length === 1 && l1hits[0].id === 'r1', `L1 FTS 检索命中 ${l1hits.length} 条`);
    assert(l1hits[0].priority === 90, 'L1 命中携带 priority');
    const cands = await l1.searchCandidates('四层记忆', 5);
    assert(cands.length >= 1 && cands[0].id === 'r1', 'L1 去重候选召回（FTS 兜底）');
    assert(l1.size === 2, 'L1 条数（SQL COUNT）');

    const typed = await l1.search('咖啡 手冲', 5, { type: 'persona' });
    assert(typed.length === 1 && typed[0].id === 'r2', 'type 后置过滤');
    const typedEmpty = await l1.search('咖啡', 5, { type: 'work_fact' });
    assert(typedEmpty.length === 0, 'type 过滤排除不匹配类型');
    const strict = await l1.search('记忆分层', 5, { scoreThreshold: 0.99 });
    assert(strict.length === 1, '小语料例外：结果数 ≤ maxResults 时保留低分命中');
    const strictMany = await l1.search('记忆 咖啡 手冲 用户 团队 分层', 1, { scoreThreshold: 0.99 });
    assert(strictMany.length === 0, '结果数超过 maxResults 时阈值生效（无例外）');

    // 浏览接口（UI 用）：按更新时间倒序 + 类型/场景过滤 + 分页
    const browseAll = l1.list({ limit: 10, offset: 0 });
    assert(browseAll.total === 2 && browseAll.items.length === 2, 'list 全量分页');
    const browseType = l1.list({ type: 'persona', limit: 10, offset: 0 });
    assert(browseType.total === 1 && browseType.items[0].id === 'r2', 'list 类型过滤');
    const browseScene = l1.list({ scene: '闲聊', limit: 10, offset: 0 });
    assert(browseScene.total === 1 && browseScene.items[0].content.includes('咖啡'), 'list 场景过滤');
    const browsePage = l1.list({ limit: 1, offset: 1 });
    assert(browsePage.total === 2 && browsePage.items.length === 1, 'list 分页切片');
    assert(l1.distinctScenes().length === 2, '场景名去重列表');

    // 去重 merge 语义：新记录追加 + 目标记录删除（不再全量重写）
    await l1.appendNew([
      { id: 'r3', content: '团队确定采用 L0~L3 分层与 SQLite 检索引擎架构', type: 'work_fact', priority: 95, scene_name: '架构', timestamps: [now], createdAt: now, updatedAt: now, version: 1, source_message_ids: [], metadata: {} },
    ]);
    await l1.deleteBatch(['r1']);
    assert(l1.size === 2, 'merge 语义：追加新记录 + 删除目标');
    const after = await l1.search('分层 架构', 5);
    assert(after.length >= 1 && after.every((h) => h.id !== 'r1'), '被替换记录不再出现');

    console.log('== 4. L2 场景块 ==');
    const scenes = new SceneStore(tmp, 'chat');
    await scenes.init();
    const name = await scenes.write('技术研究-Rust学习.md', '-----META-START-----\ncreated: 2026-01-01\nupdated: 2026-01-02\nsummary: rust 学习\nheat: 3\n-----META-END-----\n## 用户核心特征\n喜欢系统级编程');
    assert(name === '技术研究-Rust学习.md', '场景文件名保留');
    const bad = sanitizeFilename('Daily Rhythm (v2).md');
    assert(bad === 'Daily-Rhythm-v2.md', `非法文件名归一化 (${bad})`);
    const list = await scenes.list();
    assert(list.length === 1 && list[0].heat === 3, 'META 解析');
    await scenes.write('技术研究-Rust学习.md', '[DELETED]');
    assert((await scenes.list()).length === 0, '[DELETED] 软删除');
    const nav = await scenes.navigation();
    assert(nav === '', '空导航');

    console.log('== 5. L3 画像 ==');
    const persona = new PersonaStore(tmp, 'chat');
    await persona.init();
    await persona.write('# User Narrative Profile\n\n内容正文');
    await persona.write('# User Narrative Profile\n\n新正文\n\n## 🗺️ Scene Navigation\n- a.md');
    const body = await persona.read();
    assert(body === '# User Narrative Profile\n\n新正文', `剥离导航段 (${JSON.stringify(body)})`);

    console.log('== 6. 状态存储（v2 分族） ==');
    const state = new StateStore(StateStore.pathFor(tmp));
    await state.load();
    state.forFamily('chat').totalExtracted = 42;
    state.forFamily('chat').hasPersona = true;
    state.forFamily('work').totalExtracted = 7;
    await state.save();
    const state2 = new StateStore(StateStore.pathFor(tmp));
    await state2.load();
    assert(state2.forFamily('chat').totalExtracted === 42 && state2.forFamily('chat').hasPersona, 'state v2 chat 桶持久化');
    assert(state2.forFamily('work').totalExtracted === 7, 'state v2 work 桶独立计数');
    db.close();
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }

  console.log('== 3b. FTS 写入失败事务回滚（索引与元数据同生共死） ==');
  {
    const tmpF = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-fts-'));
    try {
      const dbF = new MemoryDb(path.join(tmpF, 'memory.db'), 0, silentLogger);
      dbF.init();
      const t = Date.now();
      assert(
        dbF.upsertL1({ id: 'f1', content: '先写入一条正常记录', type: 'persona', priority: 70, scene_name: 's', timestamps: [t], createdAt: t, updatedAt: t }),
        '基线 L1 upsert 成功',
      );
      assert(
        dbF.upsertL0Batch([{ sessionId: 's1', recordedAt: '', id: 'lf1', role: 'user', content: '基线 L0', timestamp: t }]),
        '基线 L0 批量写入成功',
      );
      // 破坏 FTS 表模拟插入失败（ftsAvailable 能力位仍为 true，走 FTS 写入分支）
      const raw = (dbF as unknown as { db: DatabaseSync }).db;
      raw.exec('DROP TABLE l1_fts');
      raw.exec('DROP TABLE l0_fts');
      const before1 = dbF.countL1();
      const before0 = dbF.countL0();
      assert(
        !dbF.upsertL1({ id: 'f2', content: 'FTS 失败的记录', type: 'persona', priority: 70, scene_name: 's', timestamps: [t], createdAt: t, updatedAt: t }),
        'L1 FTS 失败 → upsert 返回 false',
      );
      assert(dbF.countL1() === before1, 'L1 元数据随事务回滚（无半提交：不出现"元数据在、索引被删未补"的检索空洞）');
      assert(
        !dbF.upsertL0Batch([{ sessionId: 's1', recordedAt: '', id: 'lf2', role: 'user', content: 'FTS 失败的 L0', timestamp: t }]),
        'L0 FTS 失败 → 批量写入返回 false',
      );
      assert(dbF.countL0() === before0, 'L0 批量整批回滚');
      dbF.close();
    } finally {
      await fs.rm(tmpF, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('== 6b. 向量 / hybrid / reindex（sqlite-vec） ==');
  const tmp2 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-vec-'));
  try {
    const embed = new FakeEmbedding();
    const db2 = new MemoryDb(path.join(tmp2, 'memory.db'), 4);
    db2.init(embed.getProviderInfo());
    assert(db2.getCapabilities().vectorSearch, 'vec0 能力位（dims=4）');

    const l1v = new L1Store(tmp2, db2, embed, 'hybrid');
    await l1v.init();
    const t = Date.now();
    await l1v.appendNew([
      { id: 'c1', content: '用户喜欢在周末喝手冲咖啡', type: 'persona', priority: 70, scene_name: '闲聊', timestamps: [t], createdAt: t, updatedAt: t },
      { id: 'c2', content: '项目采用 memory 分层架构设计', type: 'work_fact', priority: 80, scene_name: '架构', timestamps: [t], createdAt: t, updatedAt: t },
    ]);
    const vh = await l1v.search('咖啡 手冲', 5);
    assert(vh.length >= 1 && vh[0].id === 'c1', `hybrid 检索命中 (${vh.map((h) => h.id).join(',')})`);
    assert(vh[0].score >= 0.5 && vh[0].score <= 1, `hybrid 融合分归一化 0~1 (${vh[0].score.toFixed(3)})`);

    const l1e = new L1Store(tmp2, db2, embed, 'embedding');
    const eh = await l1e.search('分层 架构', 5, { scoreThreshold: 0.3 });
    assert(eh.length >= 1 && eh[0].id === 'c2', 'embedding 策略 + 阈值命中');

    // 直接写库不带向量 → reindex 补齐 → 向量可检索
    db2.upsertL1({ id: 'c3', content: 'react 前端组件状态管理方案', type: 'work_method', priority: 60, scene_name: '前端', timestamps: [t], createdAt: t, updatedAt: t });
    const q = await embed.embed('react 组件');
    assert(!db2.searchL1Vector(q, 5).some((h) => h.id === 'c3'), 'reindex 前无向量行');
    const ri = await l1v.reindex();
    assert(ri.written >= 3 && ri.failed === 0, `reindex 全量重嵌入 (${ri.written} 条, 失败 ${ri.failed})`);
    assert(db2.searchL1Vector(q, 5).some((h) => h.id === 'c3'), 'reindex 后向量命中');

    const l0v = new L0Store(tmp2, db2, embed);
    await l0v.init();
    await l0v.append('sess-v', [
      { id: 'vm1', role: 'user', content: '帮我优化 react 组件渲染性能', timestamp: t },
    ]);
    const l0vh = await l0v.search('react 渲染', 5);
    assert(l0vh.length === 1 && l0vh[0].content.includes('react'), 'L0 向量+FTS hybrid 命中');
    db2.close();
  } finally {
    await fs.rm(tmp2, { recursive: true, force: true }).catch(() => undefined);
  }

  console.log('== 6c. 旧数据布局迁移 ==');
  const tmp3 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-legacy-'));
  try {
    const oldRecord = { id: 'old1', content: '旧版单文件里的记忆', type: 'work_fact', priority: 80, scene_name: '迁移', timestamps: [Date.now()], createdAt: Date.now(), updatedAt: Date.now() };
    await fs.mkdir(path.join(tmp3, 'l1'), { recursive: true });
    await fs.writeFile(path.join(tmp3, 'l1', 'records.jsonl'), `${JSON.stringify(oldRecord)}\n`, 'utf-8');
    await fs.mkdir(path.join(tmp3, 'l0'), { recursive: true });
    await fs.writeFile(
      path.join(tmp3, 'l0', '2026-01-01.jsonl'),
      `${JSON.stringify({ sessionId: 'old-sess', recordedAt: new Date().toISOString(), id: 'om1', role: 'user', content: '旧格式消息内容', timestamp: Date.now() })}\n`,
      'utf-8',
    );
    const db3 = new MemoryDb(path.join(tmp3, 'memory.db'), 0);
    db3.init();
    const l0L = new L0Store(tmp3, db3);
    await l0L.init();
    const l1L = new L1Store(tmp3, db3);
    await l1L.init();
    assert(l1L.size === 1, '旧 L1 records.jsonl 导入检索库');
    assert((await l0L.search('旧格式', 5)).length === 1, '旧 L0 目录导入并可检索');
    assert(existsSync(path.join(tmp3, 'l1', 'records.jsonl.imported')), '旧 L1 文件改名 .imported');
    assert(existsSync(path.join(tmp3, 'l0.imported')), '旧 L0 目录改名 l0.imported/');
    db3.close();
  } finally {
    await fs.rm(tmp3, { recursive: true, force: true }).catch(() => undefined);
  }

  console.log('== 7. JSON 解析 ==');
  const parsed = parseJson<Array<{ scene_name: string }>>('```json\n[{"scene_name": "x"}]\n```');
  assert(parsed.length === 1 && parsed[0].scene_name === 'x', 'parseJson 剥离围栏');
  const raw2 = '好的，输出如下：\n[{"a":1}]';
  assert(parseJson<Array<{ a: number }>>(raw2)[0].a === 1, 'parseJson 提取数组');

  console.log('== 8. Prompt 组装 ==');
  const now2 = Date.now();
  // 输入预算分块：3 条 5000 字消息按 11000 预算切成 2 块，保序不丢
  const bigMsgs = [1, 2, 3].map((i) => ({ id: `big${i}`, role: 'user' as const, content: 'x'.repeat(5000), timestamp: now2 + i }));
  const chunked = chunkByCharBudget(bigMsgs, 11_000);
  assert(chunked.length === 2 && chunked[0].length === 2 && chunked[1].length === 1, `输入预算分块 (${chunked.map((c) => c.length).join('+')})`);
  assert(chunked.flat().every((m, i) => m.id === bigMsgs[i].id), '分块保序');
  assert(chunkByCharBudget(bigMsgs, 1000).length === 3, '单条超预算独占一块');
  assert(chunkByCharBudget([], 1000).length === 0, '空输入不分块');
  const extractPrompt = formatExtractionPrompt({
    newMessages: [{ id: 'n1', role: 'user', content: '记住：以后回答都用中文', timestamp: now2 }],
    backgroundMessages: [{ id: 'b1', role: 'user', content: '你好', timestamp: now2 - 1000 }],
    previousSceneName: '无',
  });
  assert(extractPrompt.includes('[n1]') && extractPrompt.includes('待提取的新消息'), 'L1 抽取 prompt');
  assert(getExtractMemoriesSystemPrompt('chat').includes('persona, episodic, instruction'), 'chat 家族 prompt');
  assert(getExtractMemoriesSystemPrompt('work').includes('work_fact'), 'work 家族 prompt');
  const mergedPrompt = getExtractMemoriesSystemPrompt('auto');
  for (const t of ['persona', 'episodic', 'instruction', 'work_fact', 'work_task', 'work_method', 'work_artifact']) {
    if (!mergedPrompt.includes(t)) throw new Error(`auto 合并词表 prompt 缺类型 ${t}`);
  }
  assert(true, 'auto 合并词表 prompt 含全部 7 类');
  assert(getConflictDetectionSystemPrompt('auto').includes('work_method'), 'auto 去重 prompt 合并词表');

  const dedupPrompt = formatBatchConflictPrompt([
    { newMemory: { record_id: 'mem_1', content: 'x', type: 'persona', priority: 80, source_message_ids: [], metadata: {}, scene_name: '闲聊' }, candidates: [] },
  ]);
  assert(dedupPrompt.includes('统一候选记忆池') && dedupPrompt.includes('（空'), '去重 prompt 空池');
  assert(getConflictDetectionSystemPrompt('work').includes('work'), '去重系统 prompt');

  const scenePrompt = buildScenePrompt({
    memoriesJson: '[{"record_id":"m1","content":"c","type":"work_fact","priority":80,"scene_name":"s","timestamps":[]}]',
    sceneSummaries: formatSceneSummaries([]),
    sceneContents: '',
    currentTimestamp: new Date().toISOString(),
    existingSceneFiles: [],
    maxScenes: 12,
    family: 'work',
  });
  assert(scenePrompt.systemPrompt.includes('"op": "write"'), 'L2 prompt 操作输出契约');
  assert(scenePrompt.systemPrompt.includes('Team Work Method'), 'L2 work 家族');

  const personaPrompt = buildPersonaPrompt({
    mode: 'first',
    family: 'work',
    currentTime: new Date().toISOString(),
    totalProcessed: 10,
    sceneCount: 2,
    changedSceneCount: 2,
    changedScenesContent: '### 场景: a.md',
  });
  assert(personaPrompt.systemPrompt.includes('Team Operating Doctrine'), 'L3 work 家族');
  assert(personaPrompt.systemPrompt.includes('直接输出'), 'L3 内容输出模式');

  console.log('== 9. blocksToText ==');
  const text = blocksToText([
    { type: 'text', text: 'hello' },
    { type: 'tool-call', id: 'c1', name: 'x', arguments: '{}' },
    { type: 'text', text: ' world' },
  ] as never);
  assert(text === 'hello\n world', `blocksToText (${JSON.stringify(text)})`);

  console.log('== 10. RPC 端点分发（记忆浏览器数据通道） ==');
  {
    const tmpRpc = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-rpc-'));
    try {
      const db = new MemoryDb(path.join(tmpRpc, 'memory.db'), 0);
      db.init();
      const l0s = new L0Store(tmpRpc, db);
      const l1s = new L1Store(tmpRpc, db);
      const scenesS = { chat: new SceneStore(tmpRpc, 'chat'), work: new SceneStore(tmpRpc, 'work') };
      const personaS = { chat: new PersonaStore(tmpRpc, 'chat'), work: new PersonaStore(tmpRpc, 'work') };
      const stateS = new StateStore(StateStore.pathFor(tmpRpc));
      const modesS = new SessionModeStore(tmpRpc, 'auto');
      await Promise.all([l0s.init(), l1s.init(), scenesS.chat.init(), scenesS.work.init(), personaS.chat.init(), personaS.work.init(), modesS.init()]);
      const t = Date.now();
      await l1s.appendNew([
        { id: 'rpc-r1', content: 'Nann 喜欢在回复里看到 emoji', type: 'instruction', priority: 90, scene_name: '偏好设定', timestamps: [t], createdAt: t, updatedAt: t, version: 0, source_message_ids: [], metadata: {} },
      ]);
      await scenesS.chat.write('偏好设定.md', '# 偏好设定\n\n- emoji 偏好\n\n<!-- META heat=1 updated=2026-08-16T00:00:00Z summary=回复风格偏好 -->');
      await personaS.chat.write('# Team Operating Doctrine\n\n- Nann 喜欢简洁回复\n');

      // fake live 开关句柄
      let liveVal = { enabled: true, capture: true, distill: true, recall: true, reasoningEffort: '' };
      const live = {
        supported: true,
        get: () => liveVal,
        update: async (patch: Partial<typeof liveVal>) => {
          liveVal = { ...liveVal, ...patch };
        },
      };

      // fake connection：捕获 rpc.handle 注册的 handler
      let handler: ((endpoint: string, payload?: unknown) => Promise<unknown>) | undefined;
      const fakeCtx = {
        get: (name: string) => (name === 'connection' ? { rpc: { handle: (ch: string, h: typeof handler) => { handler = h; return async () => {}; } } } : undefined),
        on: () => () => {},
        effect: (f: () => (() => void)) => f(),
      } as never;
      registerMemoryRpc(
        fakeCtx,
        {
          dataDir: '',
          family: 'chat',
          capture: { enabled: true, stripCodeBlocks: true, maxMessageChars: 4000 },
          extract: { enabled: true, minMessages: 1, backgroundMessages: 10, candidatePool: 5 },
          recall: { enabled: true, maxResults: 5, includePersona: true, includeSceneNav: true, strategy: 'keyword', scoreThreshold: 0.3 },
          llm: { reasoningEffort: 'off' },
        } as never,
        { l0: l0s, l1: l1s, scenes: scenesS, persona: personaS, state: stateS },
        silentLogger,
        { degraded: () => false, pending: () => 0 },
        live as never,
        modesS,
        tmpRpc,
      );
      assert(typeof handler === 'function', 'RPC handler 注册成功');

      const call = async (endpoint: string, payload?: unknown): Promise<never> => {
        const r = (await handler!(endpoint, payload)) as { ok: boolean; value?: unknown };
        if (!r.ok) throw new Error(`rpc ${endpoint} failed`);
        return r.value as never;
      };

      const sg = await call('dsh-memory/settings-get') as never as { supported: boolean; settings: { enabled: boolean }; ceilings: { capture: boolean }; effort: { current: string; effective: string; fallback: string } };
      assert(sg.supported && sg.settings.enabled === true && sg.ceilings.capture === true, 'settings-get 返回开关与上限');
      assert(sg.effort.current === '' && sg.effort.effective === 'off' && sg.effort.fallback === 'off', 'settings-get 思考档位：空覆盖回退部署默认');

      const smg = await call('dsh-memory/session-mode-get', { sessionId: 'sess-x' }) as never as { mode: string; defaultMode: string };
      assert(smg.mode === 'auto' && smg.defaultMode === 'auto', 'session-mode-get 未设置会话返回默认档');
      const sms = await call('dsh-memory/session-mode-set', { sessionId: 'sess-x', mode: 'work' }) as never as { mode: string };
      assert(sms.mode === 'work' && modesS.get('sess-x') === 'work', 'session-mode-set 写透档位存储');
      const smg2 = await call('dsh-memory/session-mode-get', { sessionId: 'sess-x' }) as never as { mode: string };
      assert(smg2.mode === 'work', 'session-mode-get 读回已设档位');
      const smOff = await call('dsh-memory/session-mode-set', { sessionId: 'sess-y', mode: 'off' }) as never as { mode: string };
      assert(smOff.mode === 'off', 'session-mode-set 接受 off 档');
      let badMode = false;
      try { await call('dsh-memory/session-mode-set', { sessionId: 'sess-z', mode: 'sleep' }); } catch { badMode = true; }
      assert(badMode, 'session-mode-set 拒绝非法档位');

      const ss = await call('dsh-memory/settings-set', { enabled: false }) as never as { settings: { enabled: boolean } };
      assert(ss.settings.enabled === false && liveVal.enabled === false, 'settings-set 写透到 live 句柄');

      const se = await call('dsh-memory/settings-set', { reasoningEffort: 'high' }) as never as { settings: { reasoningEffort: string } };
      assert(se.settings.reasoningEffort === 'high' && liveVal.reasoningEffort === 'high', 'settings-set 写入思考档位覆盖');
      let badEffort = false;
      try { await call('dsh-memory/settings-set', { reasoningEffort: 'banana' }); } catch { badEffort = true; }
      assert(badEffort, 'settings-set 拒绝非法思考档位');

      const lr = await call('dsh-memory/list-records', { limit: 10, offset: 0 }) as never as { items: Array<{ id: string; content: string; type: string }>; total: number; hasMore: boolean; scenes: string[] };
      assert(lr.total === 1 && lr.items[0].id === 'rpc-r1' && lr.items[0].type === 'instruction', 'list-records 默认浏览');
      assert(Array.isArray(lr.scenes) && lr.scenes[0] === '偏好设定', 'list-records 附带场景 facet');

      const lq = await call('dsh-memory/list-records', { query: 'emoji', limit: 10, offset: 0 }) as never as { items: Array<{ id: string; score: number | null }> };
      assert(lq.items.length === 1 && lq.items[0].id === 'rpc-r1' && lq.items[0].score !== null, 'list-records 关键词路径走检索接缝');

      const sc = await call('dsh-memory/scenes') as never as { items: Array<{ path: string; content: string }> };
      assert(sc.items.length === 1 && sc.items[0].path === '偏好设定.md' && sc.items[0].content.includes('emoji'), 'scenes 端点返回全文');

      const pe = await call('dsh-memory/persona') as never as { content: string };
      assert(pe.content.includes('Nann 喜欢简洁回复'), 'persona 端点返回全文');

      const lt = await call('dsh-memory/log-tail', { lines: 5 }) as never as { lines: string[] };
      assert(Array.isArray(lt.lines), 'log-tail 端点返回行数组（空目录容忍）');

      const rbs = await call('dsh-memory/rebuild-status') as never as { supported: boolean; running: boolean };
      assert(rbs.supported === false && rbs.running === false, 'rebuild-status 无控制器时 supported=false');
      let rbStart = false;
      try { await call('dsh-memory/rebuild-start'); } catch { rbStart = true; }
      assert(rbStart, 'rebuild-start 无控制器时报错');

      let unknown = false;
      try { await call('dsh-memory/nope'); } catch { unknown = true; }
      assert(unknown, '未知端点抛错');

      db.close();
    } finally {
      await fs.rm(tmpRpc, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('== 11. 会话档位 / 分族检索 / 迁移 ==');
  {
    // 11a. 族标签推断
    assert(familyForType('work_fact') === 'work' && familyForType('work_task') === 'work', 'familyForType work 前缀');
    assert(familyForType('persona') === 'chat' && familyForType('') === 'chat', 'familyForType 其余归 chat');

    // 11b. SessionModeStore：默认档 / set 写穿 / 持久化重载
    const tmpM = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-mode-'));
    try {
      const ms = new SessionModeStore(tmpM, 'auto');
      assert(ms.get('nope') === 'auto' && ms.default === 'auto', '未设置会话返回默认档');
      ms.set('s1', 'off');
      ms.set('s2', 'work');
      assert(ms.get('s1') === 'off' && ms.get('s2') === 'work', 'set 立即生效（内存态）');
      await ms.flush();
      const ms2 = new SessionModeStore(tmpM, 'chat');
      await ms2.init();
      assert(ms2.get('s1') === 'off' && ms2.get('s2') === 'work', '档位持久化重载');
      assert(ms2.get('nope') === 'chat', '默认档随部署配置变化');

      // 11c. 分族检索（FTS 路径）+ 去重候选族隔离 + DB 回填迁移
      const db = new MemoryDb(path.join(tmpM, 'memory.db'), 0);
      db.init();
      const l1 = new L1Store(tmpM, db);
      await l1.init();
      const tt = Date.now();
      await l1.appendNew([
        { id: 'fm1', content: '用户喜欢手冲咖啡', type: 'persona', priority: 70, scene_name: '闲聊', timestamps: [tt], createdAt: tt, updatedAt: tt, family: 'chat' },
        { id: 'fm2', content: '团队决定采用 SQLite 检索引擎', type: 'work_fact', priority: 90, scene_name: '架构', timestamps: [tt], createdAt: tt, updatedAt: tt, family: 'work' },
      ]);
      const chatOnly = await l1.search('喜欢', 5, { family: 'chat' });
      assert(chatOnly.length >= 1 && chatOnly.every((h) => h.id === 'fm1'), 'family=chat 过滤只回 chat 记录');
      const workOnly = await l1.search('检索', 5, { family: 'work' });
      assert(workOnly.length >= 1 && workOnly.every((h) => h.id === 'fm2'), 'family=work 过滤只回 work 记录');
      const noFilter = await l1.search('咖啡 SQLite', 5);
      assert(noFilter.length === 2, '无 family 过滤两族都回（auto 档/浏览）');
      const candChat = await l1.searchCandidates('咖啡 手冲', 5, 'chat');
      assert(candChat.every((c) => c.id === 'fm1'), '去重候选族内召回');
      assert(l1.list({ family: 'work', limit: 10, offset: 0 }).total === 1, 'list family 过滤');
      db.close();

      // 11d. 旧库迁移（0.3 版布局：l1_records/l1_fts 均无 family 列）→ ALTER 补列 + type 回填 + FTS 重建
      const tmpLegacy = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-legacyfamily-'));
      try {
        const legacyPath = path.join(tmpLegacy, 'memory.db');
        const raw = new DatabaseSync(legacyPath);
        raw.exec(`CREATE TABLE l1_records (
          record_id TEXT PRIMARY KEY, content TEXT NOT NULL, type TEXT DEFAULT '', priority INTEGER DEFAULT 50,
          scene_name TEXT DEFAULT '', session_id TEXT DEFAULT 'default', version INTEGER NOT NULL DEFAULT 0,
          timestamp_str TEXT DEFAULT '', timestamp_start TEXT DEFAULT '', timestamp_end TEXT DEFAULT '',
          created_time TEXT DEFAULT '', updated_time TEXT DEFAULT '', metadata_json TEXT DEFAULT '{}'
        )`);
        raw.exec(`CREATE VIRTUAL TABLE l1_fts USING fts5(
          content, content_original UNINDEXED, record_id UNINDEXED, type UNINDEXED, priority UNINDEXED,
          scene_name UNINDEXED, session_id UNINDEXED, version UNINDEXED, timestamp_str UNINDEXED,
          timestamp_start UNINDEXED, timestamp_end UNINDEXED, metadata_json UNINDEXED
        )`);
        raw.prepare("INSERT INTO l1_records (record_id, content, type, priority, scene_name) VALUES ('oldw', '团队决定采用 SQLite 检索引擎', 'work_fact', 90, '架构')").run();
        raw.prepare("INSERT INTO l1_records (record_id, content, type, priority, scene_name) VALUES ('oldc', '用户喜欢手冲咖啡', 'persona', 70, '闲聊')").run();
        for (const [id, text] of [['oldw', '团队决定采用 SQLite 检索引擎'], ['oldc', '用户喜欢手冲咖啡']] as const) {
          raw.prepare('INSERT INTO l1_fts (content, content_original, record_id) VALUES (?, ?, ?)').run(tokenizeForFts(text), text, id);
        }
        raw.close();

        const dbg = new MemoryDb(legacyPath, 0);
        dbg.init();
        const l1g = new L1Store(tmpLegacy, dbg);
        await l1g.init();
        const legacyWork = await l1g.search('检索 引擎', 5, { family: 'work' });
        assert(legacyWork.length >= 1 && legacyWork[0].id === 'oldw', '旧库 family 回填（work_* → work）+ FTS 重建后可检索');
        const legacyChat = await l1g.search('咖啡', 5, { family: 'chat' });
        assert(legacyChat.length >= 1 && legacyChat[0].id === 'oldc', '旧库 chat 记录归 chat 族');
        dbg.close();
      } finally {
        await fs.rm(tmpLegacy, { recursive: true, force: true }).catch(() => {});
      }
    } finally {
      await fs.rm(tmpM, { recursive: true, force: true }).catch(() => {});
    }

    // 11e. 旧布局文件迁移：scenes/ 根 → scenes/chat/；persona.md → persona-chat.md；state v1 → v2
    const tmpL = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-modelegacy-'));
    try {
      await fs.mkdir(path.join(tmpL, 'scenes'), { recursive: true });
      await fs.writeFile(path.join(tmpL, 'scenes', '旧场景.md'), '# 旧场景', 'utf-8');
      await fs.writeFile(path.join(tmpL, 'persona.md'), '# 旧画像', 'utf-8');
      await fs.writeFile(
        path.join(tmpL, 'state.json'),
        JSON.stringify({ lastExtractAt: 123, totalExtracted: 5, hasPersona: true }),
        'utf-8',
      );
      const scenesChat = new SceneStore(tmpL, 'chat');
      await scenesChat.init();
      assert((await scenesChat.list()).length === 1 && (await scenesChat.read('旧场景.md')) === '# 旧场景', '旧场景文件迁入 scenes/chat/');
      const personaChat = new PersonaStore(tmpL, 'chat');
      await personaChat.init();
      assert((await personaChat.read()) === '# 旧画像', '旧画像改名 persona-chat.md');
      assert(!existsSync(path.join(tmpL, 'persona.md')), '旧 persona.md 不再存在');
      const stateL = new StateStore(StateStore.pathFor(tmpL));
      await stateL.load();
      assert(stateL.didMigrate && stateL.forFamily('chat').totalExtracted === 5, 'state v1 平铺迁入 chat 桶');
      assert(stateL.forFamily('work').totalExtracted === 0, 'state v2 work 桶全新');
    } finally {
      await fs.rm(tmpL, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('== 12. 捕获缓冲（L0 丢消息事故修复） ==');
  {
    // 12a. 只缓冲 4 类事件：流式 chunk（每秒数百条）进缓冲会把轮次头部裁掉
    assert(isCaptureRelevant('user/message') && isCaptureRelevant('assistant/message'), '消息事件进缓冲');
    assert(isCaptureRelevant('turn/start') && isCaptureRelevant('turn/end'), '轮次边界进缓冲');
    assert(!isCaptureRelevant('text-delta') && !isCaptureRelevant('reasoning-chunks') && !isCaptureRelevant('assistant/chunk'), '流式 chunk 不进缓冲');

    // 12b. 裁剪铁律：进行中轮次绝不裁（事故场景：600 事件 + 长回复轮次）
    const ev = (type: string, turn?: number): SessionEvent => ({ type, time: Date.now(), data: turn === undefined ? {} : { turn } }) as never;
    const openTurn = [ev('turn/start', 3), ev('user/message'), ev('assistant/message'), ev('assistant/message')];
    const buf = [...Array.from({ length: 600 }, () => ev('assistant/message')), ...openTurn];
    trimBuffer(buf);
    assert(buf.length === openTurn.length && buf[0].type === 'turn/start' && buf[1].type === 'user/message', '裁剪保留完整进行中轮次（turn/start + user 不丢）');

    // 12c. 无进行中轮次时回到尾部 500 上限
    const buf2 = Array.from({ length: 600 }, () => ev('assistant/message'));
    trimBuffer(buf2);
    assert(buf2.length === 500, '无进行中轮次时按 500 上限裁剪');

    // 12d. 未超限不动
    const buf3 = [ev('turn/start', 1), ev('user/message'), ev('turn/end', 1)];
    trimBuffer(buf3);
    assert(buf3.length === 3, '未超限不裁剪');
  }

  console.log('== 13. 未蒸馏缓冲持久化 + 优先级调度 + 重建 ==');
  {
    // 13a. pending.json 落盘/加载往返 + 坏文件/坏行宽容
    const tmpP = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-pending-'));
    try {
      const pFile = pendingPathFor(tmpP);
      await savePending(pFile, {
        auto: [{ id: 'm1', role: 'user', content: '待重试', timestamp: 1 }],
        chat: [],
        work: [{ id: 'm2', role: 'assistant', content: '攒阈值', timestamp: 2 }],
      });
      const loaded = await loadPending(pFile);
      assert(loaded.auto.length === 1 && loaded.auto[0].id === 'm1' && loaded.work.length === 1 && loaded.work[0].content === '攒阈值', 'pending 往返保真');

      await fs.writeFile(pFile, '{oops', 'utf-8');
      const bad = await loadPending(pFile, silentLogger);
      assert(bad.auto.length === 0 && bad.chat.length === 0 && bad.work.length === 0, '坏 JSON → 空桶不抛');

      await fs.writeFile(
        pFile,
        JSON.stringify({
          version: 1,
          buckets: { auto: [{ id: 'ok', role: 'user', content: 'x', timestamp: 1 }, { id: 'bad', role: 'root', content: 'y', timestamp: 2 }, 'junk'], chat: [], work: [] },
        }),
        'utf-8',
      );
      const mixed = await loadPending(pFile, silentLogger);
      assert(mixed.auto.length === 1 && mixed.auto[0].id === 'ok', '非法记录（role/类型）被丢弃');
    } finally {
      await fs.rm(tmpP, { recursive: true, force: true }).catch(() => {});
    }

    // 13b. 优先级任务选取：live 永远插在 rebuild 前
    assert(pickNextTaskIndex([]) === 0, '空任务列表返回 0');
    const mixedTasks = [
      { kind: 'rebuild' as const, run: async () => {} },
      { kind: 'live' as const, run: async () => {} },
      { kind: 'rebuild' as const, run: async () => {} },
    ];
    assert(pickNextTaskIndex(mixedTasks) === 1, 'live 优先于队首 rebuild');
    assert(pickNextTaskIndex([{ kind: 'live' as const, run: async () => {} }, { kind: 'live' as const, run: async () => {} }]) === 0, '多个 live 取最早');
    assert(pickNextTaskIndex([{ kind: 'rebuild' as const, run: async () => {} }]) === 0, '无 live 取队首');

    // 13c. StateStore.reset 原地突变（runner 持有的活引用必须看到重置）
    const tmpSt = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-reset-'));
    try {
      const sst = new StateStore(StateStore.pathFor(tmpSt));
      await sst.load();
      const ref = sst.forFamily('chat');
      ref.totalExtracted = 9;
      ref.hasPersona = true;
      ref.personaRequestedReason = 'why';
      sst.reset();
      assert(ref.totalExtracted === 0 && (ref.hasPersona as boolean) === false && ref.personaRequestedReason === undefined, 'reset 后活引用可见归零');
    } finally {
      await fs.rm(tmpSt, { recursive: true, force: true }).catch(() => {});
    }

    // 13d. L0 分组 + 调用数下界估算
    const grouped = groupL0Sessions([
      { sessionId: 'b', recordedAt: '', id: 'b1', role: 'user', content: 'hello', timestamp: 200 },
      { sessionId: 'a', recordedAt: '', id: 'a2', role: 'assistant', content: 'hi', timestamp: 150 },
      { sessionId: 'a', recordedAt: '', id: 'a1', role: 'user', content: 'yo', timestamp: 100 },
      { sessionId: 'a', recordedAt: '', id: 'bad-role', role: 'system' as never, content: 'x', timestamp: 120 },
      { sessionId: 'empty', recordedAt: '', id: 'e1', role: 'user', content: '  ', timestamp: 1 },
    ]);
    assert(grouped.length === 2, `L0 按会话分组（坏 role/空内容丢弃）(${grouped.length})`);
    assert(grouped[0].sessionId === 'a' && grouped[0].messages.length === 2 && grouped[0].messages[0].id === 'a1', '会话按首条时间排序 + 组内按时间');
    assert(grouped[1].sessionId === 'b', '次会话顺位正确');
    assert(estimateCalls(0, 0, 0, 5000) === 0, '无消息 → 0 次调用');
    assert(estimateCalls(3, 3, 100, 5000) === 3, '下界 = 会话数');
    assert(estimateCalls(1, 100, 100_000, 5000) > 1, '超字符预算按块放大');

    // 13e. MemoryDb：listL0All / l0RebuildEstimate / clearL1（清 L1 不动 L0）
    const tmpRb = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-rebuild-'));
    try {
      const dbR = new MemoryDb(path.join(tmpRb, 'memory.db'), 0, silentLogger);
      dbR.init();
      // L0 经 store 落盘（JSONL + DB 双写）——重建后 conversations/ 必须原样保留
      const l0s = new L0Store(tmpRb, dbR, undefined, silentLogger);
      await l0s.init();
      await l0s.append('s1', [
        { id: 'l1', role: 'user', content: 'a', timestamp: 100 },
        { id: 'l2', role: 'assistant', content: 'bb', timestamp: 200 },
      ]);
      await l0s.append('s2', [{ id: 'l3', role: 'user', content: 'ccc', timestamp: 300 }]);
      const all = dbR.listL0All();
      assert(all.length === 3 && all[0].id === 'l1' && all[2].id === 'l3', 'listL0All 按时间升序');
      const estR = dbR.l0RebuildEstimate();
      assert(estR.sessions === 2 && estR.messages === 3 && estR.chars === 6, `聚合预估 (${estR.sessions}/${estR.messages}/${estR.chars})`);

      // 13f. RebuildController 全链路（stub runner：runRebuildTurn 不打 LLM；l2/l3 关闭走不到 callLLM）
      const l1s = new L1Store(tmpRb, dbR, undefined, 'keyword', silentLogger);
      await l1s.init();
      const t0 = Date.now();
      await l1s.appendNew([
        { id: 'rb-old', content: '旧记录会被归档', type: 'persona', priority: 70, scene_name: '旧情境', timestamps: [t0], createdAt: t0, updatedAt: t0, family: 'chat' },
      ]);
      const scenesR = { chat: new SceneStore(tmpRb, 'chat', silentLogger), work: new SceneStore(tmpRb, 'work', silentLogger) };
      const personaR = { chat: new PersonaStore(tmpRb, 'chat'), work: new PersonaStore(tmpRb, 'work') };
      await Promise.all([scenesR.chat.init(), scenesR.work.init(), personaR.chat.init(), personaR.work.init()]);
      await scenesR.chat.write('旧情境.md', '# 旧情境\n\n<!-- META heat=1 updated=2026-08-01T00:00:00Z summary=旧 -->');
      await personaR.chat.write('# 旧画像');
      const stateR = new StateStore(StateStore.pathFor(tmpRb));
      await stateR.load();
      const liveRef = stateR.forFamily('chat');
      liveRef.totalExtracted = 42;

      let liveVal2 = { enabled: true, capture: true, distill: true, recall: true, reasoningEffort: '' };
      const live2 = { supported: true, get: () => liveVal2, update: async () => {} };
      const fakeCtx2 = { get: () => undefined, on: () => () => {}, effect: (f: () => (() => void)) => f() } as never;
      const fakeCfg2 = {
        dataDir: tmpRb,
        family: 'auto',
        capture: { enabled: true, stripCodeBlocks: true, maxMessageChars: 4000 },
        extract: { enabled: true, minMessages: 1, backgroundMessages: 10, candidatePool: 5 },
        recall: { enabled: true, maxResults: 5, includePersona: true, includeSceneNav: true, strategy: 'keyword', scoreThreshold: 0.3 },
        llm: { reasoningEffort: 'off', maxInputChars: 5000 },
        l2: { enabled: false },
        l3: { enabled: false },
      } as never;

      // 取消路径：先跑 prepare（快照+归档+清库），再请求取消 → 只收尾
      const tasks1: Array<() => Promise<unknown>> = [];
      const runner1 = {
        enqueueRebuildTask: (fn: () => Promise<unknown>) => { tasks1.push(fn); },
        runRebuildTurn: async () => 0,
        states: { chat: stateR.forFamily('chat'), work: stateR.forFamily('work') },
      } as never;
      const ctl1 = new RebuildController(fakeCtx2, fakeCfg2, { l1: l1s, scenes: scenesR, persona: personaR, state: stateR }, dbR, runner1, silentLogger, live2 as never);
      const stIdle = ctl1.getStatus();
      assert(stIdle.phase === 'idle' && stIdle.sessionCount === 2 && stIdle.messageCount === 3, 'idle 状态附带实时 L0 预估');
      const stStarted = ctl1.start();
      assert(stStarted.running && stStarted.phase === 'preparing', 'start → preparing');
      assert(tasks1.length === 1, '准备任务已入队');
      await tasks1.shift()!();
      assert(ctl1.getStatus().phase === 'distilling' && ctl1.getStatus().total === 2, '快照完成 → distilling');
      ctl1.requestCancel();
      assert(ctl1.getStatus().cancelRequested === true, '取消请求已记录');
      let guard = 0;
      while (tasks1.length > 0 && guard++ < 50) await tasks1.shift()!();
      const stCancelled = ctl1.getStatus();
      assert(!stCancelled.running && stCancelled.phase === 'cancelled' && stCancelled.done === 0, `取消后收尾 → cancelled（done=${stCancelled.done}）`);
      assert(dbR.countL1() === 0 && dbR.countL0() === 3, '清库只清 L1，L0 原样');
      assert(liveRef.totalExtracted === 0, 'checkpoint 原地重置');
      assert(dbR.searchL1Fts('归档', 5).length === 0, 'FTS 一并清空');
      const names1 = await fs.readdir(tmpRb);
      assert(names1.some((n) => n.startsWith('records.bak.')) && names1.some((n) => n.startsWith('scenes.bak.')) && names1.some((n) => n.startsWith('persona-chat.md.bak.')), '三处旧产物均已归档');
      assert(names1.includes('conversations'), 'L0 conversations 目录不受影响');
      // 结束后（running=false）可再次启动
      const ctl1Again = ctl1.start();
      assert(ctl1Again.running === true, '结束后可再次重建');

      // 完成路径：全新目录重跑一遍跑满 done
      const tmpRb2 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-rebuild2-'));
      try {
        const dbR2 = new MemoryDb(path.join(tmpRb2, 'memory.db'), 0, silentLogger);
        dbR2.init();
        dbR2.upsertL0Batch([
          { sessionId: 's1', recordedAt: '', id: 'k1', role: 'user', content: 'aa', timestamp: 1 },
          { sessionId: 's2', recordedAt: '', id: 'k2', role: 'user', content: 'bb', timestamp: 2 },
        ]);
        const l1s2 = new L1Store(tmpRb2, dbR2, undefined, 'keyword', silentLogger);
        await l1s2.init();
        const scenesR2 = { chat: new SceneStore(tmpRb2, 'chat', silentLogger), work: new SceneStore(tmpRb2, 'work', silentLogger) };
        const personaR2 = { chat: new PersonaStore(tmpRb2, 'chat'), work: new PersonaStore(tmpRb2, 'work') };
        await Promise.all([scenesR2.chat.init(), scenesR2.work.init(), personaR2.chat.init(), personaR2.work.init()]);
        const stateR2 = new StateStore(StateStore.pathFor(tmpRb2));
        await stateR2.load();
        const tasks2: Array<() => Promise<unknown>> = [];
        const runner2 = {
          enqueueRebuildTask: (fn: () => Promise<unknown>) => { tasks2.push(fn); },
          runRebuildTurn: async () => 2,
          states: { chat: stateR2.forFamily('chat'), work: stateR2.forFamily('work') },
        } as never;
        const cfg2 = {
          dataDir: tmpRb2,
          family: 'auto',
          capture: { enabled: true, stripCodeBlocks: true, maxMessageChars: 4000 },
          extract: { enabled: true, minMessages: 1, backgroundMessages: 10, candidatePool: 5 },
          recall: { enabled: true, maxResults: 5, includePersona: true, includeSceneNav: true, strategy: 'keyword', scoreThreshold: 0.3 },
          llm: { reasoningEffort: 'off', maxInputChars: 5000 },
          l2: { enabled: false },
          l3: { enabled: false },
        } as never;
        const ctl2 = new RebuildController(fakeCtx2, cfg2, { l1: l1s2, scenes: scenesR2, persona: personaR2, state: stateR2 }, dbR2, runner2, silentLogger, live2 as never);
        ctl2.start();
        let guard2 = 0;
        while (tasks2.length > 0 && guard2++ < 50) await tasks2.shift()!();
        const stDone = ctl2.getStatus();
        assert(!stDone.running && stDone.phase === 'done' && stDone.done === 2 && stDone.total === 2, `链跑完 → done（${stDone.done}/${stDone.total}）`);
        assert(stDone.recordsBuilt === 4, `产出计数累加（${stDone.recordsBuilt}）`);
        dbR2.close();
      } finally {
        await fs.rm(tmpRb2, { recursive: true, force: true }).catch(() => {});
      }
      dbR.close();
    } finally {
      await fs.rm(tmpRb, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 个失败 ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
