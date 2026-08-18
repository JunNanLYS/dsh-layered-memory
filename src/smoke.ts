/**
 * 冒烟测试：独立运行核心逻辑（不依赖 DSH 运行时）。
 * 运行：npm run smoke（node dist-smoke/smoke.js）
 */
import { existsSync, promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { MemoryConfig } from './config.js';
import { memorySchema } from './config.js';
import { Bm25Index } from './store/bm25.js';
import { ModelDownloadQueue } from './store/download-queue.js';
import type { EmbeddingService } from './store/embedding.js';
import { NoopEmbeddingService } from './store/embedding.js';
import {
  EmbeddingManager,
  EmbeddingSourceStore,
  resolveInitialEmbedding,
  type EmbeddingSourceState,
  type InitialEmbedding,
} from './store/embedding-source.js';
import { L0Store } from './store/l0.js';
import { L1Store } from './store/l1.js';
import { LocalEmbeddingService } from './store/local-embedding.js';
import { catalogById, catalogTotalBytes, MODEL_CATALOG, type CatalogEntry } from './store/model-catalog.js';
import { PersonaStore } from './store/persona.js';
import { RuntimeInstaller, type SpawnImpl } from './store/runtime-installer.js';
import { SceneStore, sanitizeFilename } from './store/scenes.js';
import { SessionModeStore } from './store/session-modes.js';
import { MemoryDb } from './store/sqlite.js';
import { bm25RankToScore, buildFtsQuery, rrfMerge, tokenizeForFts } from './store/search-utils.js';
import { liveSettingsSchema, registerLiveSettings } from './settings.js';
import { registerMemoryRpc } from './stats.js';
import { registerMemoryTools } from './tools/index.js';
import { StateStore } from './store/state.js';
import { dayKey } from './store/io.js';
import { familyForType } from './types.js';
import { CaptureBuffers, isCaptureRelevant, registerCapture, trimBuffer } from './hooks/capture.js';
import { buildRecallQuery, registerRecall } from './hooks/recall.js';
import { sanitizeText, shouldCaptureL0, stripCodeBlocks } from './util/sanitize.js';
import { errDetail, SIZE_CHECK_INTERVAL, withFileLog } from './util/filelog.js';
import { parseJson } from './llm.js';
import { chunkByCharBudget } from './pipeline/l1.js';
import { MemoryRunner, pickNextTaskIndex } from './pipeline/runner.js';
import { estimateCalls, groupL0Sessions, RebuildController } from './pipeline/rebuild.js';
import { loadPending, pendingPathFor, savePending } from './store/pending.js';
import { formatExtractionPrompt, getExtractMemoriesSystemPrompt } from './prompts/l1-extraction.js';
import { formatBatchConflictPrompt, getConflictDetectionSystemPrompt } from './prompts/l1-dedup.js';
import { buildScenePrompt, formatSceneSummaries } from './prompts/scene.js';
import { buildPersonaPrompt } from './prompts/persona.js';
import { blocksToText, tokenize } from './util/text.js';
import { tokenizerStamp } from './util/tokenizer.js';

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
      // 命中标记的内容返回全零向量（模拟 provider 对个别内容不可嵌入，H1 场景）
      if (t.includes('空向量标记')) return new Float32Array(4);
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
  const segU = tokenize('机器学习');
  assert(
    segU.includes('机器') && segU.includes('学习') && segU.includes('器学'),
    `词 + 二元组并集分词（jieba 与回退模式均成立，${segU.join('/')}）`,
  );
  assert(tokenize('咖啡 咖啡').filter((t) => t === '咖啡').length === 1, '分词有序去重（2 字词与其二元组同形不双计）');
  assert(tokenize('！！——').length === 0, '纯标点 token 被过滤');

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

    // FTS 点查预判的行为不变性：同 id 覆盖 upsert → 旧内容不可搜、新内容可搜且无重复索引行
    // （防御性 FTS 删除仅在主表已有该行时执行；漏删会出现旧行残留，多删/重复会出现同 id 双行）
    await l1.appendNew([
      { id: 'r2', content: '用户改喝拿铁咖啡', type: 'persona', priority: 70, scene_name: '闲聊', timestamps: [now], createdAt: now, updatedAt: now, version: 1, source_message_ids: [], metadata: {} },
    ]);
    const dupOld = await l1.search('手冲', 5);
    assert(dupOld.length === 0, '覆盖 upsert 后旧 FTS 内容不可搜（防御删除在覆盖路径仍执行）');
    const dupNew = await l1.search('拿铁', 5);
    assert(dupNew.length === 1 && dupNew[0].id === 'r2', '覆盖 upsert 后新内容可搜且无重复索引行');

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

    // 直接写库不带向量 → reindex 增量补齐 → 向量可检索
    db2.upsertL1({ id: 'c3', content: 'react 前端组件状态管理方案', type: 'work_method', priority: 60, scene_name: '前端', timestamps: [t], createdAt: t, updatedAt: t });
    const q = await embed.embed('react 组件');
    assert(!db2.searchL1Vector(q, 5).some((h) => h.id === 'c3'), 'reindex 前无向量行');
    assert(db2.countL1VecMissing(db2.getVecSkipSet('l1')) === 1, '缺失判定只数无向量行的记录（增量）');
    const ri = await l1v.reindex();
    assert(ri.written === 1 && ri.failed === 0 && ri.skipped === 0, `reindex 增量补齐（written=${ri.written}，不重嵌已有向量）`);
    assert(db2.searchL1Vector(q, 5).some((h) => h.id === 'c3'), 'reindex 后向量命中');

    // T1/H1：零向量记录 → skipped 不算 failed + 进 skip 集 → 补齐判据收敛（不再每 30 分钟重嵌）
    db2.upsertL1({ id: 'c4', content: '补齐增量验证的普通缺失记录', type: 'work_fact', priority: 60, scene_name: 's', timestamps: [t], createdAt: t, updatedAt: t });
    db2.upsertL1({ id: 'c5', content: '这条内容会返回空向量标记（provider 不可嵌入）', type: 'persona', priority: 60, scene_name: 's', timestamps: [t], createdAt: t, updatedAt: t });
    assert(db2.countL1VecMissing(db2.getVecSkipSet('l1')) === 2, '零向量记录初始也算缺失');
    const ri2 = await l1v.reindex();
    assert(ri2.written === 1 && ri2.failed === 0 && ri2.skipped === 1, `零向量记 skipped 不算 failed（written=${ri2.written}, skipped=${ri2.skipped}）`);
    assert(db2.getVecSkipSet('l1').has('c5'), 'skip 集持久化零向量 id');
    assert(db2.countL1VecMissing(db2.getVecSkipSet('l1')) === 0, '补齐判据收敛（缺失数排除 skip 集后归零）');
    const ri3 = await l1v.reindex();
    assert(ri3.written === 0 && ri3.skipped === 0 && ri3.failed === 0, '收敛后 reindex 空转（零 embeddings 调用）');

    const l0v = new L0Store(tmp2, db2, embed);
    await l0v.init();
    await l0v.append('sess-v', [
      { id: 'vm1', role: 'user', content: '帮我优化 react 组件渲染性能', timestamp: t },
    ]);
    const l0vh = await l0v.search('react 渲染', 5);
    assert(l0vh.length === 1 && l0vh[0].content.includes('react'), 'L0 向量+FTS hybrid 命中');
    // L0 侧同语义：增量 + 零向量 skipped + 判据收敛
    db2.upsertL0Batch([{ sessionId: 'sess-v', recordedAt: '', id: 'vm2', role: 'user', content: 'L0 的空向量标记记录', timestamp: t }]);
    const ri0 = await l0v.reindex();
    assert(ri0.written === 0 && ri0.failed === 0 && ri0.skipped === 1, `L0 零向量 skipped（skipped=${ri0.skipped}）`);
    assert(db2.countL0VecMissing(db2.getVecSkipSet('l0')) === 0, 'L0 补齐判据收敛');
    // skip 集上限 900（=IN_CHUNK，notInClause 不分块须避开老构建 999 上限）：
    // 保最新，被挤出的旧 id 只是多一次重试
    db2.addVecSkippedIds('l1', Array.from({ length: 1100 }, (_, i) => `skip-${i}`));
    const skipBig = db2.getVecSkipSet('l1');
    assert(skipBig.size === 900 && skipBig.has('skip-1099') && !skipBig.has('skip-0') && !skipBig.has('c5'), `skip 集上限保最新（size=${skipBig.size}，c5 被挤出仅多一次重试）`);
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
          l2: { enabled: false, minNewMemories: 5 },
          l3: { enabled: false, interval: 20 },
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

      const st = await call('dsh-memory/stats') as never as { message: string; thresholds: { l2MinNewMemories: number; l3Interval: number } };
      assert(st.message === 'running', 'stats 运行态消息（降级时为 degraded 提示，UI 渲染 badge）');
      assert(st.thresholds.l2MinNewMemories === 5 && st.thresholds.l3Interval === 20, 'stats 下发实际阈值（概览分母不硬编码）');

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

      // T12：反向分块读——文件 >64KB 跨块 + 尾部 N 行精确 + CJK 不因块边界乱码
      const bigLog = Array.from({ length: 3000 }, (_, i) => `line-${i}-记忆日志条目流水`);
      await fs.writeFile(path.join(tmpRpc, 'memory.log'), bigLog.join('\n') + '\n', 'utf-8');
      const ltBig = await call('dsh-memory/log-tail', { lines: 5 }) as never as { lines: string[] };
      assert(
        ltBig.lines.length === 5 && ltBig.lines[0] === 'line-2995-记忆日志条目流水' && ltBig.lines[4] === 'line-2999-记忆日志条目流水',
        `log-tail 反向分块读跨 64KB 块（${ltBig.lines.length} 行，首行=${ltBig.lines[0]}）`,
      );

      const rbs = await call('dsh-memory/rebuild-status') as never as { supported: boolean; running: boolean };
      assert(rbs.supported === false && rbs.running === false, 'rebuild-status 无控制器时 supported=false');
      let rbStart = false;
      try { await call('dsh-memory/rebuild-start'); } catch { rbStart = true; }
      assert(rbStart, 'rebuild-start 无控制器时报错');

      let unknown = false;
      try { await call('dsh-memory/nope'); } catch { unknown = true; }
      assert(unknown, '未知端点抛错');

      // T11：搜索分页触达上限 → 显式截断标记（不再静默空结果）
      const lqNear = await call('dsh-memory/list-records', { query: 'emoji', limit: 50, offset: 100 }) as never as { truncated: boolean };
      assert(lqNear.truncated === false, '分页窗口在检索上限内 → 不标记截断');
      const lqOver = await call('dsh-memory/list-records', { query: 'emoji', limit: 50, offset: 200 }) as never as { truncated: boolean };
      assert(lqOver.truncated === true, '分页窗口超过检索上限 200 → 显式标记截断');

      db.close();
    } finally {
      await fs.rm(tmpRpc, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('== 10b. 记忆工具 off 档统一提示（M7） ==');
  {
    const tmpTool = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-tools-'));
    try {
      const dbT = new MemoryDb(path.join(tmpTool, 'memory.db'), 0, silentLogger);
      dbT.init();
      const l0T = new L0Store(tmpTool, dbT, undefined, silentLogger);
      const l1T = new L1Store(tmpTool, dbT, undefined, 'keyword', silentLogger);
      await Promise.all([l0T.init(), l1T.init()]);
      const scenesT = { chat: new SceneStore(tmpTool, 'chat', silentLogger), work: new SceneStore(tmpTool, 'work', silentLogger) };
      const personaT = { chat: new PersonaStore(tmpTool, 'chat'), work: new PersonaStore(tmpTool, 'work') };
      await Promise.all([scenesT.chat.init(), scenesT.work.init(), personaT.chat.init(), personaT.work.init()]);
      const modesT = new SessionModeStore(tmpTool, 'auto');
      await modesT.init();
      modesT.set('sess-off', 'off');
      const t = Date.now();
      await l1T.appendNew([{ id: 'tool-r1', content: '用户偏好 emoji 回复', type: 'instruction', priority: 90, scene_name: '偏好', timestamps: [t], createdAt: t, updatedAt: t }]);

      const specs: Record<string, { execute: (args: Record<string, unknown>, exec: { agent?: { id?: string } }) => Promise<Record<string, unknown>>; output: { render: (_a: unknown, v: Record<string, unknown>) => Array<{ type: string; text: string }> } }> = {};
      const ctxT = {
        tools: {
          register: (spec: { name: string }) => {
            specs[spec.name] = spec as never;
            return () => {};
          },
        },
      } as never;
      registerMemoryTools(ctxT, { tools: true } as never, { l0: l0T, l1: l1T, scenes: scenesT, persona: personaT }, silentLogger, modesT);
      assert(Object.keys(specs).length === 3, '三工具注册');

      const ms = await specs['memory_search'].execute({ query: 'emoji' }, { agent: { id: 'sess-off' } });
      assert((ms.items as unknown[]).length === 0 && typeof ms.notice === 'string' && (ms.notice as string).includes('隐身'), `off 档 memory_search 返回统一提示（非空结果集）`);
      const msRender = specs['memory_search'].output.render({}, ms)[0].text;
      assert(msRender.includes('隐身'), 'off 档 memory_search 渲染提示文本');
      const cs = await specs['conversation_search'].execute({ query: '消息' }, { agent: { id: 'sess-off' } });
      assert((cs.items as unknown[]).length === 0 && typeof cs.notice === 'string', 'off 档 conversation_search 返回统一提示');
      const rs = await specs['memory_read_scene'].execute({ path: 'persona.md' }, { agent: { id: 'sess-off' } });
      assert(typeof rs.content === 'string' && (rs.content as string).includes('隐身'), 'off 档 memory_read_scene 保持提示（回归）');

      const okSearch = await specs['memory_search'].execute({ query: 'emoji' }, { agent: { id: 'sess-auto' } }) as { items: Array<{ content: string }>; notice?: string };
      assert(okSearch.items.length === 1 && okSearch.items[0].content.includes('emoji') && okSearch.notice === undefined, 'auto 档正常检索且无提示字段');
      dbT.close();
    } finally {
      await fs.rm(tmpTool, { recursive: true, force: true }).catch(() => {});
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
        // 无戳旧库（jieba 引入前）视同 bigram-v1：分词器变更触发 FTS 重建后戳已写入
        const rawVerify = new DatabaseSync(legacyPath);
        try {
          const stampRow = rawVerify
            .prepare("SELECT value FROM embedding_meta WHERE key = 'fts_tokenizer'")
            .get() as { value: string } | undefined;
          assert(
            stampRow !== undefined && stampRow.value === tokenizerStamp(),
            `FTS 分词器版本戳已写入（${stampRow?.value}）`,
          );
        } finally {
          rawVerify.close();
        }
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

    // 12e. CaptureBuffers：turn 消费后空前缀即释放条目（M5 慢泄漏修复）
    const cbuf = new CaptureBuffers();
    cbuf.push('s1', ev('turn/start', 1));
    cbuf.push('s1', ev('user/message'));
    cbuf.push('s1', ev('assistant/message'));
    assert(cbuf.size === 1, '进行中轮次保留缓冲条目');
    const ev1 = cbuf.takeTurn('s1', 1);
    assert(ev1.length === 2 && ev1[0].type === 'user/message', 'takeTurn 返回轮内事件（不含 turn/start）');
    assert(cbuf.size === 0, 'turn 消费后空前缀 → 条目释放（不随会话数累积）');
    // 无匹配 turn/start（turn/start 事件缺失）→ 整缓冲作为轮次事件，条目同样释放
    cbuf.push('s3', ev('user/message'));
    cbuf.takeTurn('s3', 9);
    assert(cbuf.size === 0, '无 start 匹配时整缓冲消费后释放');
    // turn/start 之前的游离事件按设计保留（归下一轮），条目留驻但受 MAX_BUFFER 约束
    cbuf.push('s2', ev('user/message'));
    cbuf.push('s2', ev('turn/start', 5));
    cbuf.push('s2', ev('user/message'));
    cbuf.takeTurn('s2', 5);
    assert(cbuf.size === 1, '带游离前缀的会话保留条目（事件不丢，受裁剪上限约束）');
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
      assert(ctl1.chunkCount === 2, '蒸馏中快照块驻留（2 会话）');
      ctl1.requestCancel();
      assert(ctl1.getStatus().cancelRequested === true, '取消请求已记录');
      let guard = 0;
      while (tasks1.length > 0 && guard++ < 50) await tasks1.shift()!();
      const stCancelled = ctl1.getStatus();
      assert(!stCancelled.running && stCancelled.phase === 'cancelled' && stCancelled.done === 0, `取消后收尾 → cancelled（done=${stCancelled.done}）`);
      assert(ctl1.chunkCount === 0, '取消收尾后快照块清空（全量消息引用释放，M6）');
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
        assert(ctl2.chunkCount === 0, 'done 收尾后快照块清空（引用释放）');
        dbR2.close();
      } finally {
        await fs.rm(tmpRb2, { recursive: true, force: true }).catch(() => {});
      }
      dbR.close();
    } finally {
      await fs.rm(tmpRb, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('== 14. 停机顺序（L0 冲刷缝 + 调度停止标志） ==');
  {
    const tmpT4 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-shutdown-'));
    try {
      const db4 = new MemoryDb(path.join(tmpT4, 'memory.db'), 0, silentLogger);
      db4.init();
      const l0T4 = new L0Store(tmpT4, db4, undefined, silentLogger);
      await l0T4.init();

      // 14a. registerCapture 返回冲刷缝：合成 turn 事件 → flush() → JSONL 先落盘
      let evHandler: ((session: unknown, event: unknown) => void) | undefined;
      const ctxT4 = {
        on: (_e: string, h: (session: unknown, event: unknown) => void) => {
          evHandler = h;
          return () => {};
        },
      } as never;
      const liveT4 = { supported: true, get: () => ({ enabled: true, capture: true, distill: true, reasoningEffort: '' }) };
      const modesT4 = new SessionModeStore(tmpT4, 'auto');
      await modesT4.init();
      let enqueued = 0;
      const flush = registerCapture(
        ctxT4,
        { capture: { enabled: true, stripCodeBlocks: false, maxMessageChars: 4000 } } as never,
        { enqueue: () => { enqueued++; } } as never,
        l0T4,
        silentLogger,
        liveT4 as never,
        modesT4,
      );
      assert(typeof flush === 'function', 'registerCapture 返回 L0 冲刷函数');
      const nowT4 = Date.now();
      evHandler!('sess-t4', { type: 'turn/start', time: nowT4, data: { turn: 1 } });
      evHandler!('sess-t4', { type: 'user/message', time: nowT4 + 1, data: { id: 'u1', source: { kind: 'user' }, content: [{ type: 'text', text: '停机冲刷验证消息' }] } });
      evHandler!('sess-t4', { type: 'turn/end', time: nowT4 + 2, data: { turn: 1 } });
      assert(enqueued === 1, 'turn/end 后入队蒸馏');
      await flush!();
      assert(
        existsSync(path.join(tmpT4, 'conversations', `${dayKey(nowT4)}.jsonl`)),
        'flush() 等待 L0 串行链排空（排队消息先落盘再关库）',
      );

      // 14b. 调度停止标志：stop 后首任务完成、后续任务不再取
      const stateT4 = new StateStore(StateStore.pathFor(tmpT4));
      const runner2 = new MemoryRunner(
        { effect: (f: () => (() => void)) => f() } as never,
        {
          dataDir: tmpT4,
          extract: { enabled: false, minMessages: 1, backgroundMessages: 10, candidatePool: 5 },
          l2: { enabled: false },
          l3: { enabled: false },
        } as never,
        { state: stateT4 } as never,
        silentLogger,
        liveT4 as never,
      );
      await runner2.init();
      let ran = 0;
      runner2.setAfterRun(() => {
        ran++;
      });
      runner2.enqueue('s', [], 'chat');
      runner2.enqueue('s', [], 'chat');
      runner2.stop(); // 同步置位：drain 在首任务完成后退出
      await new Promise((r) => setTimeout(r, 50));
      assert(ran === 1, `stop 后不再取新任务（完成 ${ran} 个）`);
      db4.close();
    } finally {
      await fs.rm(tmpT4, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('== 15. 召回查询截断 + 空查询清缓存 ==');
  {
    // 15a. 纯函数：末尾 N 条 + 字符上限 + 空输入
    const msg = (marker: string, len = 1): { content: unknown } => ({ content: [{ type: 'text', text: `${marker}${'x'.repeat(Math.max(0, len - marker.length))}` }] });
    const many = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => msg(`m${i}·`));
    const q1 = buildRecallQuery(many);
    assert(q1.includes('m5·') && !q1.includes('m4·'), '长会话只取末尾 8 条（早于窗口的消息不进查询）');
    const longTail = [msg('头部标记', 3000)];
    const q2 = buildRecallQuery(longTail);
    assert(q2.length <= 2000 && !q2.includes('头部标记') && q2.endsWith('xxx'), `字符上限截断且保留末尾（len=${q2.length}）`);
    assert(buildRecallQuery([]) === '', '空输入返回空查询');
    assert(buildRecallQuery([{ content: [] }, { content: [{ type: 'text', text: '  ' }] }]) === '', '无有效文本返回空查询');

    // 15b. pre-step：空查询清空该 agent 的召回缓存（不沿用上一步命中）
    const tmpT5 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-recall-'));
    try {
      const contextText: Record<string, () => string> = {};
      const fakeAgent = {
        id: 'agent-t5',
        ctx: { systemPrompt: { context: (def: { name: string; text: () => string }) => { contextText[def.name] = def.text; return () => {}; } } },
      };
      let preStep: ((payload: { agent: { id: string }; messages: Array<{ content: unknown }> }, next: () => void) => Promise<void>) | undefined;
      const ctxT5 = {
        on: (ev: string, h: typeof preStep) => {
          if (ev === 'agent/pre-step') preStep = h;
          return () => {};
        },
        effect: (f: () => (() => void)) => f(),
        get: (name: string) => (name === 'agents' ? { list: () => [fakeAgent] } : undefined),
      } as never;
      let searchCalls = 0;
      const storesT5 = {
        l1: {
          search: async () => {
            searchCalls++;
            return [{ id: 'h1', content: '命中记忆内容', type: 'persona', priority: 70, scene_name: '', score: 0.9, family: 'chat' }];
          },
        },
        scenes: {
          chat: { navigation: async () => '' },
          work: { navigation: async () => '' },
        },
        persona: {
          chat: { read: async () => '' },
          work: { read: async () => '' },
        },
      } as never;
      const modesT5 = new SessionModeStore(tmpT5, 'auto');
      await modesT5.init();
      const liveT5 = { supported: true, get: () => ({ enabled: true, capture: true, distill: true, recall: true, reasoningEffort: '' }) };
      registerRecall(
        ctxT5,
        { recall: { enabled: true, maxResults: 5, includePersona: true, includeSceneNav: true, strategy: 'keyword', scoreThreshold: 0.3 } } as never,
        storesT5,
        silentLogger,
        liveT5 as never,
        modesT5,
      );
      assert(typeof contextText['memory:recall'] === 'function', 'agent 作用域召回上下文已注册');
      let nexted = 0;
      await preStep!({ agent: { id: 'agent-t5' }, messages: [msg('咖啡 手冲 偏好')] }, () => {
        nexted++;
      });
      assert(nexted === 1 && searchCalls === 1, '有查询时执行检索且必调 next()');
      assert(contextText['memory:recall']().includes('命中记忆内容'), '命中注入 <relevant-memories>');
      await preStep!({ agent: { id: 'agent-t5' }, messages: [] }, () => {
        nexted++;
      });
      assert(nexted === 2 && searchCalls === 1, '空查询不发起检索');
      assert(contextText['memory:recall']() === '', '空查询清空缓存（上一步命中不再注入）');
    } finally {
      await fs.rm(tmpT5, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('== 16. settings 命名空间 fiber 重启 / 服务实例迁移重挂（M10） ==');
  {
    // 复现要点（与 dsh-settings 实测实现一致）：注册挂服务自身生命周期
    // （不随调用方 fiber 销毁）、同 ns 二次 register 抛 already registered。
    // 每次 mkSvc() 是一个独立服务实例（各自 registrations）；
    // initial 模拟服务重启后从持久层重解析出的用户开关值。
    type SvcEvent = (name: string, impl: unknown) => void;
    const mkSvc = (initial?: Record<string, unknown>) => {
      const registrations = new Map<string, { value: Record<string, unknown>; watchers: Set<(v: unknown) => void> }>();
      let registerCalls = 0;
      const svc = {
        registerCalls: () => registerCalls,
        register: (ns: string, _schema: unknown, _opts?: unknown) => {
          registerCalls++;
          if (registrations.has(ns)) throw new Error(`settings namespace "${ns}" is already registered`);
          const reg = {
            value: { enabled: true, capture: true, distill: true, recall: true, reasoningEffort: '', ...initial },
            watchers: new Set<(v: unknown) => void>(),
          };
          registrations.set(ns, reg);
          return {
            get: () => reg.value,
            watch: (cb: (v: unknown) => void) => {
              reg.watchers.add(cb);
              return () => {
                reg.watchers.delete(cb);
              };
            },
            update: async (patch: Record<string, unknown>) => {
              reg.value = { ...reg.value, ...patch };
              for (const w of reg.watchers) w(reg.value);
            },
          };
        },
      };
      return svc;
    };
    type Svc = ReturnType<typeof mkSvc>;
    // ctx.get('settings') 跟随当前实例（fire 前先 setService，模拟服务迁移后的解析结果）
    const mkCtx = () => {
      let svc: Svc | undefined;
      let listener: SvcEvent | undefined;
      const ctx = {
        get: (n: string) => (n === 'settings' ? svc : undefined),
        on: (_e: string, h: SvcEvent) => {
          listener = h;
          return () => {};
        },
        effect: (f: () => (() => void)) => f(),
      };
      return {
        ctx: ctx as never,
        setService: (s: Svc | undefined) => {
          svc = s;
        },
        fire: (name: string, impl: unknown) => listener!(name, impl),
      };
    };

    // 16a 首次注册 + 写入用户开关
    const svcA = mkSvc();
    const c1 = mkCtx();
    c1.setService(svcA);
    const h1 = registerLiveSettings(c1.ctx, silentLogger);
    assert(h1.supported === true, '首次注册成功');
    await h1.update({ enabled: false });
    assert(h1.get().enabled === false, '写入用户开关（enabled=false）');

    // 16b fiber 重启（同一服务实例）：复用进程内注册，不撞 already registered
    const c2 = mkCtx();
    c2.setService(svcA);
    const h2 = registerLiveSettings(c2.ctx, silentLogger);
    assert(h2.supported === true && h2.get().enabled === false, 'fiber 重启后复用进程内注册（读到已存开关）');
    assert(svcA.registerCalls() === 1, '同实例重挂不重复注册');

    // 16c 服务实例替换（服务重启，用户层从持久层重解析）：作废死 scope → 向新实例重注册
    const svcB = mkSvc({ enabled: false });
    c2.setService(svcB);
    c2.fire('settings', svcB as unknown);
    assert(svcB.registerCalls() === 1, '服务实例替换后向新实例重新注册（旧 scope 作废）');
    assert(h2.supported === true && h2.get().enabled === false, '重挂读到新实例解析的用户已存开关');
    await h2.update({ enabled: true });
    assert(h2.get().enabled === true, '实例替换后写恢复正常');

    // 16d 服务下线 → 再上线：缓存作废，重新注册
    c2.setService(undefined);
    c2.fire('settings', undefined);
    const svcC = mkSvc({ enabled: true });
    c2.setService(svcC);
    c2.fire('settings', svcC as unknown);
    assert(svcC.registerCalls() === 1 && h2.get().enabled === true, '服务下线再上线后自动重挂');

    // 16e 服务缺失路径保持：恒开 stub
    const h3 = registerLiveSettings(mkCtx().ctx, silentLogger);
    assert(h3.supported === false && h3.get().enabled === true, '服务缺失保持全开（既有行为不变）');
  }

  console.log('== 17. connection 波动后 RPC 重挂（M11） ==');
  {
    const tmpT9 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-conn-'));
    try {
      type H = (endpoint: string, payload?: unknown) => Promise<unknown>;
      let handler1: H | undefined;
      let handler2: H | undefined;
      let disposed1 = 0;
      let disposed2 = 0;
      const svc1 = {
        rpc: {
          handle: (_ch: string, h: H) => {
            handler1 = h;
            return async () => {
              disposed1++;
            };
          },
        },
      };
      const svc2 = {
        rpc: {
          handle: (_ch: string, h: H) => {
            handler2 = h;
            return async () => {
              disposed2++;
            };
          },
        },
      };
      let svc: unknown = svc1;
      let serviceListener: ((name: string, impl: unknown) => void) | undefined;
      const ctxC = {
        get: (n: string) => (n === 'connection' ? svc : undefined),
        on: (_e: string, h: (name: string, impl: unknown) => void) => {
          serviceListener = h;
          return () => {};
        },
        effect: (f: () => (() => void)) => {
          f();
          return () => {};
        },
      } as never;
      registerMemoryRpc(ctxC, {} as never, {} as never, silentLogger, undefined, undefined, undefined, tmpT9);
      assert(typeof handler1 === 'function', '初始注册到 svc1');

      // 服务下线（impl=undefined）：旧 handle 随旧实例失效 → 立即释放复位
      svc = undefined;
      serviceListener!('connection', undefined);
      assert(disposed1 === 1, '下线即释放旧 handle（holding 复位，不再卡死）');

      // 服务恢复（新实例）：自动重挂
      svc = svc2;
      serviceListener!('connection', svc2);
      assert(typeof handler2 === 'function', '恢复后自动重挂到新实例');
      const r = (await handler2!('dsh-memory/log-tail', { lines: 3 })) as { ok: boolean; value: { lines: string[] } };
      assert(r.ok === true && Array.isArray(r.value.lines), '重挂后的 handler 端点可用');
    } finally {
      await fs.rm(tmpT9, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('== 18. 日志轮转兜底（rename 连续失败截断重开） ==');
  {
    const tmpF2 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-log-'));
    try {
      const logP = path.join(tmpF2, 'memory.log');
      const fl = withFileLog(tmpF2, silentLogger);
      fl.info('seed');
      // 超限 → 轮转成功（.1 保留一代，当前文件回到小体积）
      await fs.writeFile(logP, 'x'.repeat(2 * 1024 * 1024 + 100), 'utf-8');
      let rotated = false;
      for (let i = 0; i < SIZE_CHECK_INTERVAL + 8 && !rotated; i++) {
        fl.info('r' + i);
        rotated = existsSync(`${logP}.1`);
      }
      assert(rotated, '超限后轮转（rename 保留一代）');
      assert((await fs.stat(logP)).size < 2 * 1024 * 1024, '轮转后当前文件回到小体积');

      // 轮转永久失败（.1 被目录占用）→ 连续失败达上限后截断重开，体积有上界
      await fs.rm(`${logP}.1`, { recursive: true, force: true });
      await fs.mkdir(`${logP}.1`);
      await fs.writeFile(logP, 'y'.repeat(2 * 1024 * 1024 + 100), 'utf-8');
      let truncatedOk = false;
      for (let i = 0; i < SIZE_CHECK_INTERVAL * 8; i++) {
        fl.info('f' + i);
        if ((await fs.stat(logP)).size < 2 * 1024 * 1024) {
          truncatedOk = true;
          break;
        }
      }
      assert(truncatedOk, '轮转连续失败后截断重开（体积有上界，不再无界增长）');
      const tail = await fs.readFile(logP, 'utf-8');
      assert(tail.includes('f') && tail.length < 2 * 1024 * 1024, '截断后继续写入正常');
    } finally {
      await fs.rm(tmpF2, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('== 19. 配置数值边界 + pending 持久化截断（T13） ==');
  {
    // 19a. Standard Schema 校验：非法数值拒绝，默认值通过
    const tryValidate = (input: unknown): boolean => {
      try {
        const r = (memorySchema as unknown as { '~standard': { validate: (i: unknown) => unknown } })['~standard'].validate(input);
        if (r && typeof r === 'object' && 'issues' in (r as object)) return false;
        return true;
      } catch {
        return false;
      }
    };
    assert(tryValidate({}), '全默认配置校验通过');
    assert(!tryValidate({ recall: { scoreThreshold: -0.5 } }), '负 scoreThreshold 被拒');
    assert(!tryValidate({ recall: { scoreThreshold: 1.5 } }), '超 1 的 scoreThreshold 被拒');
    assert(!tryValidate({ llm: { timeoutMs: 0 } }), '零 timeoutMs 被拒');
    assert(!tryValidate({ capture: { maxMessageChars: 10 } }), '低于下限的 maxMessageChars 被拒');
    assert(!tryValidate({ embedding: { dimensions: -8 } }), '负 dimensions 被拒');
    assert(tryValidate({ embedding: { dimensions: 0 } }), 'dimensions=0（纯 FTS）合法');
  }

  // 19b. pending 持久化前按桶截断（非重建轮）/ 重建轮豁免 —— 挂在 §14 的 runner2 之后
  {
    const tmpT13 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-pend-'));
    try {
      const liveT13 = { supported: true, get: () => ({ enabled: true, capture: true, distill: true, reasoningEffort: '' }) };
      const runner3 = new MemoryRunner(
        { effect: (f: () => (() => void)) => f() } as never,
        { dataDir: tmpT13, extract: { enabled: false }, l2: { enabled: false }, l3: { enabled: false } } as never,
        { state: new StateStore(StateStore.pathFor(tmpT13)) } as never,
        silentLogger,
        liveT13 as never,
      );
      await runner3.init();
      const rp = runner3 as unknown as {
        pending: { chat: Array<{ id: string; role: string; content: string; timestamp: number }> };
        pendingFile: string;
        persistPending: (noBufferCap?: boolean) => Promise<void>;
      };
      rp.pending.chat = Array.from({ length: 260 }, (_, i) => ({ id: `p${i}`, role: 'user', content: 'x', timestamp: i }));
      await rp.persistPending(false);
      const loadedA = await loadPending(rp.pendingFile, silentLogger);
      assert(loadedA.chat.length === 200 && loadedA.chat[0].id === 'p60', `非重建轮持久化前按桶截断保尾部（${loadedA.chat.length} 条，首条 ${loadedA.chat[0]?.id}）`);
      rp.pending.chat = Array.from({ length: 260 }, (_, i) => ({ id: `q${i}`, role: 'user', content: 'x', timestamp: i }));
      await rp.persistPending(true);
      const loadedB = await loadPending(rp.pendingFile, silentLogger);
      assert(loadedB.chat.length === 260, `重建轮（noBufferCap）豁免截断（${loadedB.chat.length} 条）`);
    } finally {
      await fs.rm(tmpT13, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('== 20. SQL 热路径：IN 分块 + L1 批量事务（T6） ==');
  {
    const tmpT6 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-sql-'));
    try {
      const dbT6 = new MemoryDb(path.join(tmpT6, 'memory.db'), 0, silentLogger);
      dbT6.init();
      const t6 = Date.now();
      // 950 条单事务批量写入（> IN_CHUNK=900，跨块场景）
      const bigBatch = Array.from({ length: 950 }, (_, i) => ({
        id: `b${i}`,
        content: `批量记录 ${i} 的内容`,
        type: 'work_fact',
        priority: 60,
        scene_name: '批量',
        timestamps: [t6 + i],
        createdAt: t6 + i,
        updatedAt: t6 + i,
      }));
      assert(dbT6.upsertL1Batch(bigBatch), '950 条单事务批量写入成功');
      assert(dbT6.countL1() === 950, '批量写入计数正确');
      const allIds = bigBatch.map((r) => r.id);
      const gotAll = dbT6.getL1ByIds(allIds);
      assert(gotAll.length === 950, `getL1ByIds 跨 900 分块返回全量（${gotAll.length}/950）`);
      assert(dbT6.deleteL1Batch(allIds.slice(0, 400)) === 400, '分块批量删除返回条数');
      assert(dbT6.countL1() === 550, `删除后计数正确（${dbT6.countL1()}）`);
      const gotRest = dbT6.getL1ByIds(allIds.slice(400));
      assert(gotRest.length === 550 && gotRest.every((r) => !r.id.startsWith('b3') || r.id >= 'b400'), '剩余记录可查');
      const hitT6 = dbT6.searchL1Fts('批量记录 900', 5);
      assert(hitT6.length >= 1 && hitT6[0].id === 'b900', '批量写入后 FTS 可检索');

      // 批量失败回退逐条：好记录照常入库、坏记录只丢自身——消"JSONL 已写、
      // 检索库整批缺失且无自愈"的批次空洞（毒记录 = 仅让 FTS 插入对该条抛错）
      const dbPriv = dbT6 as unknown as {
        stmtL1FtsInsert: {
          run: (...a: unknown[]) => unknown;
          all: (...a: unknown[]) => unknown[];
          get: (...a: unknown[]) => unknown;
        };
      };
      const origFtsInsert = dbPriv.stmtL1FtsInsert;
      dbPriv.stmtL1FtsInsert = {
        run: (...a: unknown[]) => {
          if (String(a[1]).includes('毒记录')) throw new Error('fts boom');
          return origFtsInsert.run(...a);
        },
        all: (...a: unknown[]) => origFtsInsert.all(...a),
        get: (...a: unknown[]) => origFtsInsert.get(...a),
      };
      const beforeP = dbT6.countL1();
      const recP = (id: string, content: string) => ({ id, content, type: 'work_fact', priority: 60, scene_name: 's', timestamps: [t6], createdAt: t6, updatedAt: t6 });
      const fbRes = dbT6.upsertL1Batch([recP('fb-good1', '回退批的好记录一'), recP('fb-bad', '包含毒记录的坏条目'), recP('fb-good2', '回退批的好记录二')]);
      dbPriv.stmtL1FtsInsert = origFtsInsert;
      assert(fbRes === false, '含坏记录的批量返回 false（未全量成功）');
      assert(dbT6.countL1() === beforeP + 2, `逐条回退：好记录入库、坏记录只丢自身（+${dbT6.countL1() - beforeP}）`);
      assert(dbT6.getL1ByIds(['fb-good1', 'fb-good2']).length === 2, '回退后好记录可查');

      // 批量事务保持 T2 的 FTS 失败整批回滚语义（回退后逐条同样全失败 → 计数不变）
      const raw6 = (dbT6 as unknown as { db: DatabaseSync }).db;
      raw6.exec('DROP TABLE l1_fts');
      const before6 = dbT6.countL1();
      assert(!dbT6.upsertL1Batch([{ id: 'bf1', content: '失败批一', type: 'work_fact', priority: 60, scene_name: 's', timestamps: [t6], createdAt: t6, updatedAt: t6 }, { id: 'bf2', content: '失败批二', type: 'work_fact', priority: 60, scene_name: 's', timestamps: [t6], createdAt: t6, updatedAt: t6 }]), 'FTS 失败 → 批量返回 false');
      assert(dbT6.countL1() === before6, '批量整批回滚（无部分提交）');
      dbT6.close();
    } finally {
      await fs.rm(tmpT6, { recursive: true, force: true }).catch(() => {});
    }
  }

  // ── 21. client bundle 主题化静态断言（#15-#18 验收） ──
  {
    const clientSrc = await fs.readFile(new URL('../client/client.js', import.meta.url), 'utf8');
    // 令牌层：双主题变量块 + DeepSeek 品牌蓝
    assert(clientSrc.includes(':root {') && clientSrc.includes('--dsh-mem-accent:'), '浅色令牌块存在');
    assert(clientSrc.includes('body[data-ds-dark-theme] {') && clientSrc.includes('--dsh-mem-accent-text:'), '暗色令牌块存在');
    assert(clientSrc.includes('--dsh-mem-accent: #4d6bfe'), 'DeepSeek 品牌蓝 #4D6BFE 是浅色 accent 令牌');
    // 修复的 typo：--dsh-alias-*（应为 dsw）不得再出现
    assert(!clientSrc.includes('var(--dsh-alias'), '无 --dsh-alias typo');
    // 旧注入函数已更名（令牌与组件样式统一入口）
    assert(!clientSrc.includes('ensureFlowStyle') && clientSrc.includes('ensureThemeStyle'), '样式注入函数已更名');
    // 7 类记忆类型标签全部有 tint 类 + 暗色覆盖（类型类可能是合并选择器，查前缀即可）
    for (const t of ['persona', 'episodic', 'instruction', 'work-fact', 'work-task', 'work-method', 'work-artifact']) {
      assert(clientSrc.includes(`.dsh-mem-tag-${t}`), `标签类 .dsh-mem-tag-${t}`);
    }
    const tagDark = clientSrc.match(/body\[data-ds-dark-theme\] \.dsh-mem-tag-/g) ?? [];
    assert(tagDark.length >= 7, `标签暗色覆盖 ≥7（实际 ${tagDark.length}）`);
    // 无障碍：reduced-motion / focus-visible（btn/tab 键盘焦点环；输入框用 :focus 即时环）
    assert(clientSrc.includes('prefers-reduced-motion'), 'reduced-motion 降级');
    assert((clientSrc.match(/:focus-visible/g) ?? []).length >= 3, 'focus-visible 焦点环（btn/tab/pill 两态）');
    // 档位显示名中文化（配置键 off/chat/work/auto 保持英文——键值对并存断言）
    for (const label of ['关闭', '日常', '工作', '智能']) {
      assert(clientSrc.includes('label: "' + label + '"'), `档位显示名：${label}`);
    }
    for (const key of ['"off"', '"chat"', '"work"', '"auto"']) {
      assert(clientSrc.includes('key: ' + key), `档位配置键保留：${key}`);
    }
    assert(clientSrc.includes('"记忆 · "'), 'pill 文本为"记忆 · 档位名"格式');
    // 悬浮板：dsw 原生菜单同配方浮层 + 拖动气泡 + 粗滑轨包裹圆球
    assert(clientSrc.includes('.dsh-mem-popover'), '浮层类（dsw 原生菜单配方）');
    assert(clientSrc.includes('--dsh-mem-bg-pop: var(--dsw-specific-menu'), '浮层底链 dsw-specific-menu');
    assert(clientSrc.includes('.dsh-mem-bubble'), '拖动气泡类');
    // 气泡材质与尖角：浮层同材质（随主题翻转）+ 描边 + 双 clip-path 倒三角（外描边内填充）
    assert(clientSrc.includes('background: var(--dsh-mem-bg-pop); color: var(--dsh-mem-text-1);'), '气泡浮层同材质（浅白深字/暗深浅字）');
    assert(clientSrc.includes('width: 12px; height: 7px;'), '尖角外层描边三角（大内三角一圈）');
    assert((clientSrc.match(/clip-path: polygon\(0 0, 100% 0, 50% 100%\)/g) ?? []).length >= 2, '气泡下尖角为双 clip-path 倒三角');
    assert(clientSrc.includes('bottom: calc(100% + 8px)'), '气泡贴近圆球（悬停 8px）');
    assert(!clientSrc.includes('--dsw-alias-tooltip-bg, #2c2c2e'), '不随主题的 tooltip-bg 硬底已弃用');
    assert(clientSrc.includes('var RAIL_H = 22') && clientSrc.includes('var THUMB = 16'), '粗滑轨（RAIL_H 22 > THUMB 16）');
    assert(clientSrc.includes('linear-gradient(90deg, var(--dsh-mem-fill-1), var(--dsh-mem-fill-2))'), '滑轨填充左浅右深渐变（球侧最深）');
    assert(!clientSrc.includes('var(--dsh-mem-fill-2), var(--dsh-mem-fill-1)'), '渐变端色序未被反转');
    // 填充：从滑轨左端铺到圆球右缘（重合无割裂）；off 档不渲染（auto 恰全轨蓝不超界）
    assert(clientSrc.includes('width: thumbLeft + THUMB'), '填充右缘=圆球右缘（整球落在填充末端上）');
    assert(!clientSrc.includes('width: thumbLeft + THUMB / 2'), '旧半程重合公式已移除');
    assert(!clientSrc.includes('right: 0,'), '右侧填充锚定公式已移除');
    assert(clientSrc.includes('activeIdx > 0 || drag !== null'), '静态关闭档不渲染填充，拖拽中恒显示');
    // 粒子层：点阵粒子场（仓库B 路线）+ 档位分级 + 拖拽全套增强
    assert(clientSrc.includes('react.createElement("canvas"'), '粒子层 canvas 元素');
    assert(clientSrc.includes('cancelAnimationFrame') && clientSrc.includes('requestAnimationFrame'), 'rAF 循环带清理');
    assert(clientSrc.includes('ctx.roundRect') && clientSrc.includes('height / 2)'), '胶囊形裁剪（roundRect 半径 = 半轨高）');
    assert(clientSrc.includes('FIELD_TIERS') && clientSrc.includes('tier: activeIdx'), '场强按档位分级（与填充/气泡同源）');
    assert(clientSrc.includes('flicker') && clientSrc.includes('ripplePhase'), '独立随机闪烁 + 明暗水波纹');
    assert(clientSrc.includes('lastDrawn >= 33'), '30fps 节流');
    assert(clientSrc.includes('saturate(1.45) brightness(1.28)'), '拖拽滤镜增饱和提亮');
    assert(clientSrc.includes('mix-blend-mode: multiply'), '浅色主题 multiply 混合');
    assert((clientSrc.match(/pointerEvents: "none",\s*\n\s*zIndex: 2,/g) ?? []).length >= 1, 'canvas 不挡指针（拖拽路径不受粒子层干扰）');
    assert(clientSrc.includes('prefers-reduced-motion: reduce') && clientSrc.includes('redrawStatic'), 'reduced-motion 静帧降级');
    // 浮层对称内边距：滑轨垂直居中，气泡经 overflow: visible 溢出到浮层上方
    assert(clientSrc.includes('padding: "14px 16px"'), '浮层上下内边距对称（紧凑尺寸）');
    assert(!clientSrc.includes('38px 16px'), '气泡预留顶部内边距已移除');
    assert(!clientSrc.includes('top: 26'), '滑轨下方档位标签已删除（改拖动气泡）');
    // pill：off 档透明化（压掉 UA 按钮默认底/边框，hover 淡底）、其余三档共用流光
    assert(clientSrc.includes('.dsh-mem-pill-off { border: none; background: transparent; }'), 'off 档透明按钮类');
    assert(clientSrc.includes('.dsh-mem-pill-off:hover { background: var(--dsh-mem-bg-hover); }'), 'off 档 hover 淡底');
    assert(clientSrc.includes('.dsh-mem-flow:focus-visible'), '流光态焦点环（与 off 态对称）');
    assert(clientSrc.includes('"dsh-mem-pill-off"'), 'off 档类接线到 pill');
    assert(clientSrc.includes('var isFlow = loaded && !isOff'), 'off 档排除流光');
    assert(clientSrc.includes('--dsh-mem-pill-tint'), '流光内底混色通道');
    assert(!clientSrc.includes('.dsh-mem-glass'), '玻璃浮层类已移除（换原生实底浮层）');
    // 原生组件复用：guarded require + 三个包装器（含回退）
    assert(clientSrc.includes('require("@deepseek-ai/dsh-client-ui-primitives")'), '原生 primitives require');
    assert(
      clientSrc.includes('function NButton') && clientSrc.includes('function NInput') && clientSrc.includes('function NModal'),
      '原生组件包装器 NButton/NInput/NModal',
    );
    // 侧边栏 icon 补丁（书本）
    assert(clientSrc.includes('patchSidebarIcon') && clientSrc.includes('BOOK_ICON_SVG'), '侧边栏书本 icon 补丁');
    // 圆角体系锁定：inline borderRadius 与 CSS border-radius 只允许 {4,8,10,12,999,50%}
    //（4px 仅限重建进度条内轨，8=控件，10=卡片，12=浮层，999=胶囊）
    const inlineR = [...clientSrc.matchAll(/borderRadius: ([^,}]+)/g)].map((m) => m[1].trim().replace(/^"|"$/g, ''));
    assert(inlineR.length > 0, '圆角断言取样非空');
    for (const r of inlineR) {
      assert(r === '50%' || ['4', '8', '10', '12', '999'].includes(r), `inline 圆角合规：${r}`);
    }
    const cssR = [...clientSrc.matchAll(/border-radius: (\d+)px/g)].map((m) => m[1]);
    for (const r of cssR) assert(['4', '8', '10', '12', '999'].includes(r), `CSS 圆角合规：${r}px`);
    // 可见文案零 em-dash（design-taste 铁律；代码注释除外）
    const emDashInString = clientSrc.match(/"[^"\n]*—[^"\n]*"/);
    assert(!emDashInString, `字符串内出现 em-dash：${emDashInString?.[0] ?? ''}`);
    // 组件类接线：按钮/输入/Tab/卡片类在 JSX 侧被引用
    for (const cls of ['dsh-mem-btn', 'dsh-mem-input', 'dsh-mem-select', 'dsh-mem-tab', 'dsh-mem-card', 'dsh-mem-root']) {
      assert(clientSrc.includes(`"${cls}`), `组件类被引用：${cls}`);
    }
  }

  // ── 22. 模型目录 + 下载器（#20：目录即完整性契约 + 断点续传状态机） ──
  console.log('== 22. 模型目录 + 下载器 ==');
  {
    assert(MODEL_CATALOG.length === 3, '目录三档模型');
    assert(new Set(MODEL_CATALOG.map((m) => m.dims)).size === 3, '三档维度互异（切换触发重嵌）');
    for (const m of MODEL_CATALOG) {
      assert(m.files.length > 0 && /^[0-9a-f]{40,}$/.test(m.revision), `${m.id} 锁定 revision`);
      for (const f of m.files) {
        assert(/^[0-9a-f]{64}$/.test(f.sha256), `${m.id}/${f.path} sha256 为 64 位 hex`);
        assert(f.size > 0, `${m.id}/${f.path} size > 0`);
      }
      assert(catalogTotalBytes(m) === m.files.reduce((a, f) => a + f.size, 0), `${m.id} 总量合计一致`);
    }
    assert(catalogById('embeddinggemma-300m')!.files.some((f) => f.path.endsWith('.onnx_data')), 'gemma 外部权重 onnx_data 在清单');

    const tmp22 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-dl-'));
    try {
      const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
      const bodyA = 'hello-config-A';
      const bodyB = 'world-weights-B';
      const mkEntry = (): CatalogEntry => ({
        id: 'test-model',
        name: '测试模型',
        repo: 't/t',
        revision: 'r'.repeat(40),
        dims: 8,
        contextTokens: 8,
        pooling: 'cls',
        tags: [],
        description: '',
        files: [
          { path: 'config.json', size: bodyA.length, sha256: sha(bodyA) },
          { path: 'onnx/model.onnx', size: bodyB.length, sha256: sha(bodyB) },
        ],
      });
      /** 假 fetch：按 URL 后缀路由，支持 Range 续传语义（206/200 + content-length）。 */
      const serve = (routes: Array<[string, string]>, opts?: { truncateAt?: Map<string, number>; failOn?: string }): typeof fetch =>
        (async (url: string, init?: RequestInit) => {
          for (const [suffix, content] of routes) {
            if (!url.endsWith(suffix)) continue;
            if (opts?.failOn === suffix) throw new Error(`模拟网络故障: ${suffix}`);
            const truncated = opts?.truncateAt?.get(suffix);
            const payload = truncated !== undefined ? content.slice(0, truncated) : content;
            const range = (init?.headers as Record<string, string> | undefined)?.range;
            const from = range ? Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0) : 0;
            if (from > payload.length) throw new Error('range 越界');
            const slice = payload.slice(from);
            return new Response(slice, {
              status: from > 0 ? 206 : 200,
              headers: { 'content-length': String(slice.length) },
            });
          }
          throw new Error('fake fetch 无路由: ' + url);
        }) as typeof fetch;

      // a. happy path：全量下载 + 校验 + 落盘
      {
        const q = new ModelDownloadQueue(tmp22, {
          mirror: 'https://fake.example',
          fetchImpl: serve([
            ['/config.json', bodyA],
            ['/onnx/model.onnx', bodyB],
          ]),
          freeBytes: async () => 1e9,
        });
        const r = await q.startEntry(mkEntry());
        assert(r.phase === 'done', `全量下载 done（${r.phase}${r.error ? ': ' + r.error : ''}）`);
        const a = await fs.readFile(path.join(q.modelsDir('test-model'), 'config.json'), 'utf8');
        const b = await fs.readFile(path.join(q.modelsDir('test-model'), 'onnx', 'model.onnx'), 'utf8');
        assert(a === bodyA && b === bodyB, '文件内容完整落盘');
        // 合成模型不在内置目录（listStatus 只扫目录）——验证断点旁车已清理
        let partLeft = false;
        await fs.stat(path.join(q.modelsDir('test-model'), 'onnx', 'model.onnx.part')).then(
          () => { partLeft = true; },
          () => { partLeft = false; },
        );
        assert(!partLeft, '成功后 .part 旁车已清理');
      }

      // b. 断点续传：第二文件中途数量不吻合 → .part 保留 → 重跑从 Range 续传
      {
        const dirB = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-resume-'));
        const entry = mkEntry();
        const q1 = new ModelDownloadQueue(dirB, {
          mirror: 'https://fake.example',
          fetchImpl: serve(
            [
              ['/config.json', bodyA],
              ['/onnx/model.onnx', bodyB],
            ],
            { truncateAt: new Map([['/onnx/model.onnx', 6]]) },
          ),
          freeBytes: async () => 1e9,
        });
        const r1 = await q1.startEntry(entry);
        assert(r1.phase === 'error' && /数量不吻合/.test(r1.error ?? ''), `中断下载报错保留断点（${r1.error}）`);
        const partPath = path.join(q1.modelsDir('test-model'), 'onnx', 'model.onnx.part');
        assert((await fs.stat(partPath)).size === 6, '.part 保留 6 字节断点');

        const q2 = new ModelDownloadQueue(dirB, {
          mirror: 'https://fake.example',
          fetchImpl: serve([
            ['/config.json', bodyA],
            ['/onnx/model.onnx', bodyB],
          ]),
          freeBytes: async () => 1e9,
        });
        const r2 = await q2.startEntry(entry);
        assert(r2.phase === 'done', `续传后 done（${r2.error ?? ''}）`);
        const b2 = await fs.readFile(path.join(dirB, 'models', 'test-model', 'onnx', 'model.onnx'), 'utf8');
        assert(b2 === bodyB, '续传拼接内容完整（校验通过）');
      }

      // c. sha256 失配 → 删除断点报错
      {
        const dirC = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-badsha-'));
        const q = new ModelDownloadQueue(dirC, {
          mirror: 'https://fake.example',
          fetchImpl: serve([
            ['/config.json', bodyA],
            ['/onnx/model.onnx', 'X'.repeat(bodyB.length)],
          ]),
          freeBytes: async () => 1e9,
        });
        const r = await q.startEntry(mkEntry());
        assert(r.phase === 'error' && /sha256 校验失败/.test(r.error ?? ''), `哈希失配拦截（${r.error}）`);
        let partExists = true;
        await fs.stat(path.join(dirC, 'models', 'test-model', 'onnx', 'model.onnx.part')).then(
          () => { partExists = true; },
          () => { partExists = false; },
        );
        assert(!partExists, '失配断点已删除');
      }

      // d. 磁盘门禁
      {
        const dirD = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-disk-'));
        const q = new ModelDownloadQueue(dirD, {
          mirror: 'https://fake.example',
          fetchImpl: serve([
            ['/config.json', bodyA],
            ['/onnx/model.onnx', bodyB],
          ]),
          freeBytes: async () => 10,
        });
        const r = await q.startEntry(mkEntry());
        assert(r.phase === 'error' && /磁盘剩余空间不足/.test(r.error ?? ''), `磁盘门禁拦截（${r.error}）`);
      }

      // e. 串行队列 + 取消（挂起 fetch 尊重 abort）
      {
        const dirE = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-cancel-'));
        const hang: typeof fetch = ((url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            void url;
          })) as typeof fetch;
        const q = new ModelDownloadQueue(dirE, { mirror: 'https://fake.example', fetchImpl: hang, freeBytes: async () => 1e9 });
        const inflight = q.startEntry(mkEntry()).then((r) => r);
        await new Promise((r) => setTimeout(r, 30));
        let secondRejected = false;
        try {
          await q.startEntry(mkEntry());
        } catch {
          secondRejected = true;
        }
        assert(secondRejected, '忙时串行队列拒绝新任务');
        assert(q.cancel(), '取消在途任务');
        const r = await inflight;
        assert(r.phase === 'cancelled', `取消后终态 cancelled（${r.phase}）`);
      }

      // f. 服务器忽略 Range 回 200：删断点从零重写
      {
        const dirF = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-200fb-'));
        const entry = mkEntry();
        const partDir = path.join(dirF, 'models', 'test-model', 'onnx');
        await fs.mkdir(partDir, { recursive: true });
        await fs.writeFile(path.join(partDir, 'model.onnx.part'), bodyB.slice(0, 5), 'utf8');
        const noRange: typeof fetch = (async (url: string, _init?: RequestInit) => {
          if (url.endsWith('/config.json')) return new Response(bodyA, { headers: { 'content-length': String(bodyA.length) } });
          if (url.endsWith('/onnx/model.onnx')) return new Response(bodyB, { status: 200, headers: { 'content-length': String(bodyB.length) } });
          throw new Error('no route ' + url);
        }) as typeof fetch;
        const q = new ModelDownloadQueue(dirF, { mirror: 'https://fake.example', fetchImpl: noRange, freeBytes: async () => 1e9 });
        const r = await q.startEntry(entry);
        assert(r.phase === 'done', `200 回退重写完成（${r.phase}${r.error ? ': ' + r.error : ''}）`);
        const fb = await fs.readFile(path.join(dirF, 'models', 'test-model', 'onnx', 'model.onnx'), 'utf8');
        assert(fb === bodyB, '200 回退从零重写内容正确');
      }

      // g. 满断点预校验：.part 已是完整文件（进程死在 rename 前）→ 不发请求直接收编
      {
        const dirG = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-fullpart-'));
        const entry = mkEntry();
        const modelDir = path.join(dirG, 'models', 'test-model');
        const partDir = path.join(modelDir, 'onnx');
        await fs.mkdir(partDir, { recursive: true });
        await fs.writeFile(path.join(modelDir, 'config.json'), bodyA, 'utf8');
        await fs.writeFile(path.join(partDir, 'model.onnx.part'), bodyB, 'utf8');
        const boom: typeof fetch = (async () => {
          throw new Error('不应发起网络请求');
        }) as typeof fetch;
        const q = new ModelDownloadQueue(dirG, { mirror: 'https://fake.example', fetchImpl: boom, freeBytes: async () => 1e9 });
        const r = await q.startEntry(entry);
        assert(r.phase === 'done', `满断点直接收编（${r.phase}${r.error ? ': ' + r.error : ''}）`);
        const fb = await fs.readFile(path.join(dirG, 'models', 'test-model', 'onnx', 'model.onnx'), 'utf8');
        assert(fb === bodyB, '满断点 rename 落位');
      }

      // h. 服务器对满/异常 Range 回 416：删断点一次性从零重下
      {
        const dirH = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-416-'));
        const entry = mkEntry();
        const modelDir = path.join(dirH, 'models', 'test-model');
        const partDir = path.join(modelDir, 'onnx');
        await fs.mkdir(partDir, { recursive: true });
        await fs.writeFile(path.join(modelDir, 'config.json'), bodyA, 'utf8');
        await fs.writeFile(path.join(partDir, 'model.onnx.part'), bodyB.slice(0, 5), 'utf8');
        let rangeHit = false;
        const fetch416: typeof fetch = (async (url: string, init?: RequestInit) => {
          if (url.endsWith('/config.json')) return new Response(bodyA, { headers: { 'content-length': String(bodyA.length) } });
          if (url.endsWith('/onnx/model.onnx')) {
            const range = (init?.headers as Record<string, string> | undefined)?.range;
            if (range && !rangeHit) {
              rangeHit = true;
              return new Response('', { status: 416 });
            }
            return new Response(bodyB, { status: 200, headers: { 'content-length': String(bodyB.length) } });
          }
          throw new Error('no route ' + url);
        }) as typeof fetch;
        const q = new ModelDownloadQueue(dirH, { mirror: 'https://fake.example', fetchImpl: fetch416, freeBytes: async () => 1e9 });
        const r = await q.startEntry(entry);
        assert(r.phase === 'done', `416 回退重下完成（${r.phase}${r.error ? ': ' + r.error : ''}）`);
        assert(rangeHit, '416 分支确实触发');
        const fb = await fs.readFile(path.join(dirH, 'models', 'test-model', 'onnx', 'model.onnx'), 'utf8');
        assert(fb === bodyB, '416 回退后内容完整');
      }
    } finally {
      await fs.rm(tmp22, { recursive: true, force: true }).catch(() => {});
    }
  }

  // ── 23. 本地嵌入服务状态机（#21：懒加载/就绪/失败/释放，假 loader 不触真模型） ──
  console.log('== 23. 本地嵌入服务 ==');
  {
    const entry = catalogById('bge-small-zh-v1.5')!;
    const vec512 = (t: string): Float32Array => {
      const v = new Float32Array(512);
      let h = 0;
      for (const ch of t) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
      v[h % 512] = 1;
      v[(h >>> 9) % 512] = 3;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return new Float32Array(Array.from(v).map((x) => x / norm)) as Float32Array;
    };
    const fakeExtractor = async (texts: string[]) => texts.map((t) => ({ data: vec512(t) }));
    const okLoader = async () => ({ pipeline: async () => fakeExtractor, env: {} });
    const svc = new LocalEmbeddingService(entry, '/fake/model/dir', okLoader, silentLogger);
    assert(!svc.isReady() && svc.getState() === 'idle', '初始 idle');
    const vecs = await svc.embedBatch(['你好世界', 'hello world']);
    assert(svc.isReady() && svc.getState() === 'ready', '首次调用触发懒加载 → ready');
    const norm = Math.sqrt(Array.from(vecs[0]).reduce((s, x) => s + x * x, 0));
    assert(Math.abs(norm - 1) < 1e-5, `pipeline 归一化保持 L2=1（${norm.toFixed(4)}）`);
    assert(vecs[0].length === 512, '维度 = 目录 dims');
    assert(svc.getProviderInfo().provider === 'local' && svc.getProviderInfo().dimensions === 512, 'providerInfo 为 local/512');
    svc.close();
    assert(!svc.isReady() && svc.getState() === 'terminated', 'close 释放进入 terminated');
    await svc.embedBatch(['x']).then(
      () => assert(false, 'terminated 态 embedBatch 应抛'),
      (e) => assert(/已释放/.test(String(e)), 'terminated 态不可复活（防卸载后模型重载泄漏）'),
    );

    const badLoader = async () => {
      throw new Error('模块加载爆炸');
    };
    const svc2 = new LocalEmbeddingService(entry, '/fake', badLoader, silentLogger);
    await svc2.waitForReady().then(
      () => assert(false, '加载失败应 reject'),
      () => assert(true, '加载失败 reject'),
    );
    assert(svc2.getState() === 'failed' && /模块加载爆炸/.test(svc2.getLoadError() ?? ''), '失败态带原因');
    await svc2.embed('x').then(
      () => assert(false, 'failed 态 embed 应抛'),
      (e) => assert(/加载失败/.test(String(e)), 'failed 态 embed 抛明确错误'),
    );
    svc2.close();
  }

  // ── 24. 嵌入源状态层 + 活切换重嵌链（#22：三态/上限/切换触发重嵌/失败回滚） ──
  console.log('== 24. 嵌入源三态与活切换 ==');
  {
    const tmp24 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-src-'));
    try {
      const cfgValue = (await memorySchema['~standard'].validate({})) as unknown as { value: MemoryConfig };
      const cfg = cfgValue.value;

      // a. 状态存储：默认 remote / 持久化往返 / 坏文件降级
      const ss = new EmbeddingSourceStore(tmp24, silentLogger);
      await ss.init();
      assert(ss.get().source === 'remote', '无状态文件默认 remote（老用户语义）');
      await ss.set({ source: 'local', activeModel: 'bge-m3' });
      const ss2 = new EmbeddingSourceStore(tmp24, silentLogger);
      await ss2.init();
      assert(ss2.get().source === 'local' && ss2.get().activeModel === 'bge-m3', '写穿持久化往返');
      await fs.writeFile(path.join(tmp24, 'embedding-source.json'), '{oops', 'utf8');
      const ss3 = new EmbeddingSourceStore(tmp24, silentLogger);
      await ss3.init();
      assert(ss3.get().source === 'remote', '坏状态文件降级默认');

      // b. 初始解析：off / local 缺模型 / local 被部署禁用
      const fakeStore = (s: EmbeddingSourceState): EmbeddingSourceStore =>
        ({ get: () => s, init: async () => {}, set: async () => {} }) as unknown as EmbeddingSourceStore;
      const installer24 = new RuntimeInstaller(tmp24, '0.0.0-test', { logger: silentLogger });
      const dl24 = new ModelDownloadQueue(tmp24, { mirror: 'https://fake.example', logger: silentLogger });
      const mkLocal = () => null;
      const rOff = await resolveInitialEmbedding(cfg, fakeStore({ source: 'off', activeModel: null }), dl24, mkLocal, silentLogger);
      assert(rOff.dims === 0 && !rOff.providerInfo, 'off 初始 → Noop/0 维');
      const rMissing = await resolveInitialEmbedding(
        cfg,
        fakeStore({ source: 'local', activeModel: 'bge-small-zh-v1.5' }),
        dl24,
        mkLocal,
        silentLogger,
      );
      assert(rMissing.dims === 0 && /模型文件缺失/.test(rMissing.note ?? ''), `local 缺模型降级（${rMissing.note}）`);
      const cfgNoLocal = JSON.parse(JSON.stringify(cfg)) as MemoryConfig;
      cfgNoLocal.embedding.allowLocalModels = false;
      const rForbidden = await resolveInitialEmbedding(
        cfgNoLocal,
        fakeStore({ source: 'local', activeModel: 'bge-small-zh-v1.5' }),
        dl24,
        mkLocal,
        silentLogger,
      );
      assert(/禁用/.test(rForbidden.note ?? ''), '部署禁用本地 → 降级并说明');

      // c. 活切换链：local 全链（假安装器 + 假 transformers 模块 + 预置模型文件）→ 重嵌 → 持久化
      const db24 = new MemoryDb(path.join(tmp24, 'memory.db'), 0, silentLogger);
      db24.init(undefined);
      const l0s = new L0Store(tmp24, db24, new NoopEmbeddingService(), silentLogger);
      const l1s = new L1Store(tmp24, db24, new NoopEmbeddingService(), 'hybrid', silentLogger);
      await l0s.init();
      await l1s.init();
      const t24 = Date.now();
      const rec24 = (id: string) => ({
        id,
        content: `本地嵌入切换验证 ${id}`,
        type: 'work_fact',
        priority: 60,
        scene_name: 's',
        timestamps: [t24],
        createdAt: t24,
        updatedAt: t24,
      });
      await l1s.appendNew([rec24('m1'), rec24('m2')]);

      const entry = catalogById('bge-small-zh-v1.5')!;
      for (const f of entry.files) {
        const p = path.join(dl24.modelsDir(entry.id), f.path);
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, Buffer.alloc(f.size, 7));
      }

      const vecFor = (t: string, dims: number): Float32Array => {
        const v = new Float32Array(dims);
        let h = 0;
        for (const ch of t) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
        v[h % dims] = 1;
        v[(h >>> 9) % dims] = 3;
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        return new Float32Array(Array.from(v).map((x) => x / norm)) as Float32Array;
      };
      const fakeExtractor24 = async (texts: string[]) => texts.map((t) => ({ data: vecFor(t, entry.dims) }));
      const fakeInstaller = {
        runtimeDir: path.join(tmp24, 'runtime'),
        getProgress: () => ({ phase: 'ready', targetVersion: '0.0.0-test', installedVersion: '0.0.0-test', startedAt: 0, elapsedMs: 0, lastLines: [] }),
        installedVersion: async () => '0.0.0-test',
        isReady: async () => true,
        ensure: async () => true,
        cancel: () => false,
        resolveModule: () => ({ pipeline: async () => fakeExtractor24, env: {} }),
      } as unknown as RuntimeInstaller;

      const initial24: InitialEmbedding = { svc: new NoopEmbeddingService(), dims: 0 };
      const mgr = new EmbeddingManager({
        dataDir: tmp24,
        cfg,
        db: db24,
        l0: l0s,
        l1: l1s,
        sourceStore: ss,
        installer: fakeInstaller,
        downloader: dl24,
        initial: initial24,
        logger: silentLogger,
      });

      const waitApply = async (): Promise<string> => {
        for (let i = 0; i < 400; i++) {
          const snap = await mgr.snapshot();
          if (!snap.apply.busy) return snap.apply.phase;
          await new Promise((r) => setTimeout(r, 25));
        }
        return 'timeout';
      };

      const acc1 = mgr.requestSource({ source: 'local', activeModel: entry.id });
      assert(acc1.accepted, 'local 切换请求被接受');
      const phase1 = await waitApply();
      const snap1 = await mgr.snapshot();
      assert(phase1 === 'done', `local 切换链完成（phase=${phase1}，msg=${snap1.apply.message}）`);
      assert(ss.get().source === 'local' && ss.get().activeModel === entry.id, '切换成功后状态持久化');
      assert(db24.getCapabilities().vectorSearch, '向量能力随 swapProvider 启用（0 维起步懒加载 sqlite-vec）');
      assert(db24.countL1Vec() === 2, `后台重嵌入写满 L1 向量（实际 ${db24.countL1Vec()}）`);
      assert(snap1.local?.state === 'ready', '本地服务就绪');
      const swapAgain = db24.swapProvider({ provider: 'local', model: entry.id, dimensions: entry.dims });
      assert(swapAgain.ok && !swapAgain.needsReindex, '同 provider 复切不重嵌（meta 已同步）');

      const accOff = mgr.requestSource({ source: 'off' });
      assert(accOff.accepted, 'off 切换接受');
      assert((await waitApply()) === 'done', 'off 切换完成');
      assert(ss.get().source === 'off', 'off 状态持久化');

      const rr = mgr.requestSource({ source: 'remote' });
      assert(!rr.accepted && /部署未配置/.test(rr.error ?? ''), `远程档无四件套被拒（${rr.error}）`);

      const accBad = mgr.requestSource({ source: 'local', activeModel: 'bge-m3' });
      assert(accBad.accepted, '未下载模型的切换请求进入应用链');
      const phaseBad = await waitApply();
      const snapBad = await mgr.snapshot();
      assert(phaseBad === 'error' && /模型文件不完整/.test(snapBad.apply.message), `未下载模型在链上被拦（${snapBad.apply.message}）`);
      assert(ss.get().source === 'off', '失败后状态回滚不变');

      // review #2 回归：meta 吻合但物理表维度错位（取消/崩溃残留）→ 必须强制重建
      const raw24 = (db24 as unknown as { db: DatabaseSync }).db;
      raw24.exec('DROP TABLE l1_vec');
      raw24.exec(
        "CREATE VIRTUAL TABLE l1_vec USING vec0(record_id TEXT PRIMARY KEY, embedding float[768] distance_metric=cosine, updated_time TEXT DEFAULT '')",
      );
      const physMismatch = db24.swapProvider({ provider: 'local', model: entry.id, dimensions: entry.dims });
      assert(physMismatch.ok && physMismatch.needsReindex, 'meta 吻合但物理维度错位 → 强制重建（防静默丢数据）');
      db24.close();
    } finally {
      await fs.rm(tmp24, { recursive: true, force: true }).catch(() => {});
    }
  }

  // ── 25. 运行时安装器：随包 lockfile → npm ci；ci 失败/资产缺失回退 npm install ──
  console.log('== 25. 运行时安装器 lockfile 链 ==');
  {
    const tmp25 = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mem-rt-'));
    try {
      const fakeModule = async (cwd: string, version: string) => {
        const pkgDir = path.join(cwd, 'node_modules', '@huggingface', 'transformers');
        await fs.mkdir(pkgDir, { recursive: true });
        await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@huggingface/transformers', version }));
      };
      /** 假 spawn：记录调用；"安装成功"副作用 = 落盘假模块（exited resolve 前完成，保证顺序）。 */
      const mkFakeSpawn = (exitCodes: number[], installVersion: string) => {
        const calls: Array<{ cmd: string; args: string[]; cwd: string }> = [];
        let i = 0;
        const impl = ((cmd: string, args: string[], cwd: string) => {
          calls.push({ cmd, args, cwd });
          const code = exitCodes[Math.min(i++, exitCodes.length - 1)];
          return {
            onStdout: () => {},
            onStderr: () => {},
            kill: () => {},
            exited: (async () => {
              if (code === 0) await fakeModule(cwd, installVersion);
              return code;
            })(),
          };
        }) as SpawnImpl;
        return { calls, impl };
      };
      const lockSrc = path.join(tmp25, 'bundled-lock.json');
      const lockBody = JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/@huggingface/transformers': { version: '1.0.0' } } });
      await fs.writeFile(lockSrc, lockBody);

      // a. lockfile 就位且 ci 成功：单次 npm ci、lockfile 拷入 runtime、锚定 package.json 带精确依赖
      const a = mkFakeSpawn([0], '1.0.0');
      const insA = new RuntimeInstaller(path.join(tmp25, 'a'), '1.0.0', { logger: silentLogger, spawnImpl: a.impl, lockfileSource: lockSrc });
      assert(await insA.ensure(), 'lockfile + ci 成功 → ready');
      assert(a.calls.length === 1 && a.calls[0].args[0] === 'ci', `走 npm ci（实际 ${a.calls.map((c) => c.args[0]).join(',')}）`);
      assert(a.calls[0].args.includes('--ignore-scripts'), 'ci 带 --ignore-scripts');
      const copiedLock = await fs.readFile(path.join(tmp25, 'a', 'runtime', 'package-lock.json'), 'utf8');
      assert(copiedLock === lockBody, '随包 lockfile 原样拷入 runtime');
      const anchor = JSON.parse(await fs.readFile(path.join(tmp25, 'a', 'runtime', 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      assert(anchor.dependencies?.['@huggingface/transformers'] === '1.0.0', '锚定 package.json 带精确依赖（npm ci 前置条件）');

      // b. ci 失败（lock 漂移）→ 回退 npm install 精确版本
      const b = mkFakeSpawn([1, 0], '1.0.0');
      const insB = new RuntimeInstaller(path.join(tmp25, 'b'), '1.0.0', { logger: silentLogger, spawnImpl: b.impl, lockfileSource: lockSrc });
      assert(await insB.ensure(), 'ci 失败回退 install 后 ready');
      assert(b.calls.length === 2 && b.calls[0].args[0] === 'ci' && b.calls[1].args[0] === 'install', 'ci → install 两次调用');
      assert(b.calls[1].args[b.calls[1].args.length - 1] === '@huggingface/transformers@1.0.0', '回退 install 钉精确版本');

      // c. 随包 lockfile 缺失（资产被裁剪）→ 直接 npm install，不尝试 ci
      const c = mkFakeSpawn([0], '1.0.0');
      const missingLock = path.join(tmp25, 'no-such-lock.json');
      const insC = new RuntimeInstaller(path.join(tmp25, 'c'), '1.0.0', { logger: silentLogger, spawnImpl: c.impl, lockfileSource: missingLock });
      assert(await insC.ensure(), '无 lockfile 直装 ready');
      assert(c.calls.length === 1 && c.calls[0].args[0] === 'install', '无 lockfile 只走 install');
    } finally {
      await fs.rm(tmp25, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 个失败 ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
