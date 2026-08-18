/**
 * L1 蒸馏：抽取（情境切分 + 记忆提取）→ 去重（冲突检测 + 合并）→ 写入。
 * 移植 MemoryCore 的 l1 runner 语义（抽取 prompt → batch 冲突检测 → apply）。
 */
import { randomBytes } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryConfig } from '../config.js';
import { callLLM, layerMaxTokens, LAYER_MAX_TOKENS_DEDUP, LAYER_MAX_TOKENS_EXTRACT, parseJsonLogged } from '../llm.js';
import { formatExtractionPrompt, getExtractMemoriesSystemPrompt } from '../prompts/l1-extraction.js';
import { formatBatchConflictPrompt, getConflictDetectionSystemPrompt } from '../prompts/l1-dedup.js';
import type { L1Store } from '../store/l1.js';
import type { MemoryState } from '../store/state.js';
import type {
  ConversationMessage,
  ExtractedMemory,
  ExtractMode,
  MemoryFamily,
  MemoryLogger,
  MemoryRecord,
} from '../types.js';
import { familyForType } from '../types.js';

export interface ExtractionResult {
  stored: number;
  skipped: boolean;
  sceneName: string;
  newRecords: MemoryRecord[];
}

/** 分族 checkpoint 桶（活引用，改动由调用方 save 落盘）。 */
export type FamilyStates = Record<MemoryFamily, MemoryState>;

interface SceneExtraction {
  scene_name: string;
  message_ids: string[];
  memories: ExtractedMemory[];
}

interface DedupDecision {
  record_id: string;
  action: 'store' | 'update' | 'skip' | 'merge';
  target_ids?: string[];
  merged_content?: string;
  merged_type?: string;
  merged_priority?: number;
  merged_timestamps?: string[];
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(3).toString('hex')}`;
}

/**
 * 按字符预算把消息切成多块（保持顺序，单条超预算独占一块，由 callLLM 兜底截断）。
 * 每条消息按 content 长度 + 64 字符脚手架开销（id/时间戳行）计。
 */
export function chunkByCharBudget(
  messages: ConversationMessage[],
  budgetChars: number,
): ConversationMessage[][] {
  if (messages.length === 0) return [];
  const chunks: ConversationMessage[][] = [];
  let cur: ConversationMessage[] = [];
  let curChars = 0;
  for (const m of messages) {
    const len = m.content.length + 64;
    if (cur.length > 0 && curChars + len > budgetChars) {
      chunks.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(m);
    curChars += len;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

export async function runExtraction(
  ctx: Context,
  cfg: MemoryConfig,
  store: L1Store,
  states: FamilyStates,
  pending: ConversationMessage[],
  background: ConversationMessage[],
  logger: MemoryLogger,
  mode: ExtractMode,
): Promise<ExtractionResult> {
  if (!cfg.extract.enabled) return { stored: 0, skipped: true, sceneName: chainHead(states, mode), newRecords: [] };
  if (pending.length < cfg.extract.minMessages) {
    return { stored: 0, skipped: true, sceneName: chainHead(states, mode), newRecords: [] };
  }

  // 纯档强制族 = 档位族；auto 档抽取后的记录族按 type 前缀判定
  const forcedFamily: MemoryFamily | undefined = mode === 'auto' ? undefined : mode;
  // 情境链锚点桶：纯档用本族；auto 用最近活跃的族（chainHead 同源）
  const chainState = mode === 'auto' ? activeState(states) : states[mode];

  // ── Step 1: 抽取（输入按 llm.maxInputChars 预算分块，情境链式衔接，不丢消息） ──
  const backgroundMsgs = background.slice(-cfg.extract.backgroundMessages);
  // 预留：背景消息（≤10 条 ×4000 字）+ prompt 脚手架
  const perChunk = Math.max(20_000, cfg.llm.maxInputChars - 42_000);
  const chunks = chunkByCharBudget(pending, perChunk);
  if (chunks.length > 1) {
    logger.info(
      `[memory] L1 输入超预算（${pending.length} 条消息），分 ${chunks.length} 块抽取（每块 ≤${perChunk} 字符）`,
    );
  }

  const extracted: Array<ExtractedMemory & { record_id: string; scene_name: string; family: MemoryFamily }> = [];
  let lastScene = chainState.lastSceneName;
  let sceneCount = 0;
  for (const chunk of chunks) {
    const userPrompt = formatExtractionPrompt({
      newMessages: chunk,
      backgroundMessages: backgroundMsgs,
      previousSceneName: lastScene || '无',
    });
    const raw = await callLLM(ctx, cfg, {
      system: getExtractMemoriesSystemPrompt(mode),
      user: userPrompt,
      maxTokens: layerMaxTokens(LAYER_MAX_TOKENS_EXTRACT, cfg.llm.reasoningEffort),
      logger,
    });
    const scenes = parseJsonLogged<SceneExtraction[]>(raw, 'L1 抽取', logger);
    if (!Array.isArray(scenes)) throw new Error('L1 抽取输出不是 JSON 数组');
    for (const scene of scenes) {
      if (!scene || typeof scene.scene_name !== 'string') continue;
      lastScene = scene.scene_name;
      sceneCount++;
      for (const m of scene.memories ?? []) {
        if (!m || typeof m.content !== 'string' || !m.content.trim()) continue;
        extracted.push({
          ...m,
          record_id: newId('mem'),
          scene_name: scene.scene_name,
          family: forcedFamily ?? familyForType(m.type ?? ''),
        });
      }
    }
  }

  if (extracted.length === 0) {
    logger.info(`[memory] L1 抽取完成：无可提取记忆（mode=${mode}，${pending.length} 条消息，${sceneCount} 个情境）`);
    // 成功但零产出：同样推进时间戳/场景，与失败（lastExtractAt 保持 0）区分开
    markExtracted(states, mode, lastScene);
    return { stored: 0, skipped: false, sceneName: lastScene, newRecords: [] };
  }

  // ── Step 2: 去重（batch 冲突检测；候选只在本族内召回，去重永不跨族） ──
  const matches = await Promise.all(
    extracted.map(async (m) => ({
      newMemory: m,
      candidates: await store.searchCandidates(m.content, cfg.extract.candidatePool, m.family),
    })),
  );
  const dedupPrompt = formatBatchConflictPrompt(matches);
  const dedupRaw = await callLLM(ctx, cfg, {
    system: getConflictDetectionSystemPrompt(mode),
    user: dedupPrompt,
    maxTokens: layerMaxTokens(LAYER_MAX_TOKENS_DEDUP, cfg.llm.reasoningEffort),
    logger,
  });
  const decisions = parseJsonLogged<DedupDecision[]>(dedupRaw, 'L1 去重判定', logger);
  const byRecord = new Map<string, DedupDecision>();
  for (const d of Array.isArray(decisions) ? decisions : []) {
    if (d && typeof d.record_id === 'string') byRecord.set(d.record_id, d);
  }

  // 去重决策统计：无决策的记录按 skip 处理，这里聚合成单行日志便于排查
  const actionCount: Record<string, number> = {};
  for (const m of extracted) {
    const action = byRecord.get(m.record_id)?.action ?? 'skip(未返回)';
    actionCount[action] = (actionCount[action] ?? 0) + 1;
  }
  const candidateTotal = matches.reduce((n, m) => n + m.candidates.length, 0);
  logger.info(
    `[memory] L1 去重判定：${extracted.length} 条候选记忆召回 ${candidateTotal} 条已有记录，决策 ${Object.entries(actionCount)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  );

  // ── Step 3: 应用决策（官方语义：新记录追加进事实源，被替换目标只从检索库删除） ──
  // 只按需取决策涉及的记录（候选 + 目标 id 并集），避免每轮全表扫描
  const relatedIds = new Set<string>();
  for (const d of byRecord.values()) {
    for (const id of d.target_ids ?? []) relatedIds.add(id);
  }
  for (const m of matches) {
    for (const c of m.candidates) relatedIds.add(c.id);
  }
  const byId = new Map(store.getByIds([...relatedIds]).map((r) => [r.id, r]));
  const deletedIds = new Set<string>();
  const added: MemoryRecord[] = [];
  const now = Date.now();

  for (const m of extracted) {
    const decision = byRecord.get(m.record_id);
    if (!decision || decision.action === 'skip') continue;
    const action = decision.action;
    const ts = m.metadata?.activity_start_time ? Date.parse(String(m.metadata.activity_start_time)) : now;

    if (action === 'store') {
      added.push({
        id: m.record_id,
        content: m.content,
        type: m.type,
        priority: Number(m.priority) || 60,
        scene_name: m.scene_name,
        timestamps: [Number.isNaN(ts) ? now : ts],
        createdAt: now,
        updatedAt: now,
        version: 0,
        source_message_ids: m.source_message_ids ?? [],
        metadata: m.metadata ?? {},
        family: m.family,
      });
      continue;
    }

    // update / merge：目标记录从检索库删除，合并结果作为新记录追加（版本 +1）
    // 候选召回按族隔离，合并产物保持新记忆的族标签
    const targets = (decision.target_ids ?? []).filter((id) => byId.has(id));
    for (const id of targets) deletedIds.add(id);
    const targetVersion = targets.reduce((max, id) => Math.max(max, byId.get(id)?.version ?? 0), 0);
    const mergedTs = (decision.merged_timestamps ?? [])
      .map((t) => Date.parse(t))
      .filter((t) => !Number.isNaN(t))
      .concat([now]);
    added.push({
      id: m.record_id,
      content:
        decision.merged_content && decision.merged_content.trim()
          ? decision.merged_content
          : m.content,
      type: decision.merged_type || m.type,
      priority: Number(decision.merged_priority) || Number(m.priority) || 60,
      scene_name: m.scene_name,
      timestamps: Array.from(new Set(mergedTs)).sort((a, b) => a - b),
      createdAt: now,
      updatedAt: now,
      version: targetVersion + 1,
      source_message_ids: m.source_message_ids ?? [],
      metadata: m.metadata ?? {},
      family: m.family,
    });
  }

  await store.appendNew(added);
  if (deletedIds.size > 0) await store.deleteBatch([...deletedIds]);

  // 状态按记录族分桶推进（阈值计数各自独立）
  const addedByFamily: Record<MemoryFamily, number> = { chat: 0, work: 0 };
  for (const r of added) addedByFamily[r.family ?? familyForType(r.type)]++;
  for (const f of ['chat', 'work'] as const) {
    if (addedByFamily[f] === 0) continue;
    states[f].totalExtracted += addedByFamily[f];
    states[f].newMemoriesSinceL2 += addedByFamily[f];
    states[f].memoriesSinceL3 += addedByFamily[f];
  }
  markExtracted(states, mode, lastScene);

  logger.info(
    `[memory] L1 抽取完成（mode=${mode}）：消息 ${pending.length} 条，抽取 ${extracted.length} 条，去重后新增 ${added.length} 条（替换 ${deletedIds.size} 条，chat=${addedByFamily.chat}/work=${addedByFamily.work}），累计 chat=${states.chat.totalExtracted}/work=${states.work.totalExtracted}`,
  );
  return { stored: added.length, skipped: false, sceneName: lastScene, newRecords: added };
}

/** auto 档取最近活跃的族 checkpoint（情境链/计数锚点）。 */
function activeState(states: FamilyStates): MemoryState {
  return states.chat.lastExtractAt >= states.work.lastExtractAt ? states.chat : states.work;
}

/** 情境链读取：auto → 最近活跃族；纯档 → 本族。 */
function chainHead(states: FamilyStates, mode: ExtractMode): string {
  return (mode === 'auto' ? activeState(states) : states[mode]).lastSceneName;
}

/** 抽取成功后推进时间戳/情境链：auto → 两族都推进（链只写锚点桶）；纯档 → 本族。 */
function markExtracted(states: FamilyStates, mode: ExtractMode, lastScene: string): void {
  const now = Date.now();
  if (mode === 'auto') {
    // 两族的 lastExtractAt 都推进（去重候选各自族内判断"新消息"）；情境链只维护锚点桶
    states.chat.lastExtractAt = now;
    states.work.lastExtractAt = now;
    activeState(states).lastSceneName = lastScene;
  } else {
    states[mode].lastExtractAt = now;
    states[mode].lastSceneName = lastScene;
  }
}
