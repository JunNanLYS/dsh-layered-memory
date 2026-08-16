/**
 * 召回 Hook：
 * 1. agent/pre-step（waterfall）：用进入步骤的用户消息做 L1 BM25 检索，缓存到该 agent 的槽位；
 *    必须调用并返回 next()（只观察，不改写步骤）。
 * 2. agent/created：在 agent 作用域注册动态上下文 provider（L1 召回 + L3 画像 + L2 场景导航 + 工具指南）。
 *
 * 注入内容使用 <relevant-memories> / <user-persona> / <scene-navigation> / <memory-tools-guide>
 * 标签包裹——capture 侧 sanitize 会剥离这些标签，防止反馈循环。
 * auto 档两族合并时在 <user-persona>/<scene-navigation> 内部用 <domain family="..."> 子块
 * 分域（子块只出现在外层标签内部，随外层一起被 sanitize 剥离，无泄漏风险）。
 *
 * 注意：PromptContext.text 是**同步**函数，画像/场景导航这类异步文件读取必须走内存缓存，
 * 由定时刷新 + 管线更新后的主动失效来更新。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { MemoryConfig } from '../config.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { L1Store } from '../store/l1.js';
import type { PersonaStore } from '../store/persona.js';
import type { SceneStore } from '../store/scenes.js';
import type { SessionModeStore } from '../store/session-modes.js';
import type { L1Hit, MemoryLogger } from '../types.js';
import { blocksToText } from '../util/text.js';

const PROFILE_TTL = 60_000;

const MEMORY_TOOLS_GUIDE = `<memory-tools-guide>
## 记忆工具调用指南

当上方注入的记忆片段不足以回答用户问题时，可主动调用以下工具获取更多信息：

- **memory_search**：搜索结构化记忆（L1），适用于回忆用户偏好、历史事件、项目事实、任务、规则等。
- **conversation_search**：搜索原始对话（L0），适用于查找具体消息原文、时间线、上下文细节。
- **memory_read_scene**：读取记忆文件详情（L2 场景块，如场景目录下的 .md 文件；也可读 persona.md）。

### ⚠️ 调用次数限制
每轮对话中，memory_search 和 conversation_search **合计最多调用 3 次**。
- 首次搜索无结果时，可换关键词或换工具重试，但总调用次数不要超过 3 次。
- 若 3 次搜索后仍无结果，说明该信息不在记忆中，请直接根据已有信息回复用户。
</memory-tools-guide>`;

export interface RecallHooks {
  /** 管线更新后调用：画像/场景缓存立即失效并异步刷新。 */
  invalidateProfile(): void;
}

export function registerRecall(
  ctx: Context,
  cfg: MemoryConfig,
  stores: { l1: L1Store; scenes: Record<'chat' | 'work', SceneStore>; persona: Record<'chat' | 'work', PersonaStore> },
  logger: MemoryLogger,
  live: LiveSettingsHandle,
  modes: SessionModeStore,
): RecallHooks {
  const l1Cache = new Map<string, L1Hit[]>();
  // 画像/场景导航按族缓存（分族隔离：注入时按会话档位选族）
  const profileCache: Record<'chat' | 'work', ProfileParts> = {
    chat: { persona: '', nav: '' },
    work: { persona: '', nav: '' },
  };

  const refreshProfile = async (): Promise<void> => {
    try {
      const [chat, work] = await Promise.all([
        loadProfileParts(stores, cfg, 'chat'),
        loadProfileParts(stores, cfg, 'work'),
      ]);
      profileCache.chat = chat;
      profileCache.work = work;
    } catch (err) {
      logger.warn(`[memory] 画像/场景缓存刷新失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 初始刷新 + 定时刷新（TTL）
  void refreshProfile();
  ctx.effect(() => {
    const timer = setInterval(() => void refreshProfile(), PROFILE_TTL);
    return () => clearInterval(timer);
  });

  const invalidateProfile = (): void => {
    void refreshProfile();
  };

  // agent 销毁时清掉召回缓存槽
  ctx.on('agent/disposed', (payload) => {
    l1Cache.delete(payload.agent.id);
  });

  // ── 1. pre-step：检索并缓存（按会话档位过滤族：纯档只查本族，auto 不过滤，off 跳过） ──
  if (cfg.recall.enabled) {
    ctx.on('agent/pre-step', async (payload, next) => {
      try {
        const s = live.get();
        const mode = modes.get(payload.agent.id);
        if (!s.enabled || !s.recall || mode === 'off') {
          l1Cache.set(payload.agent.id, []);
          return next();
        }
        const query = payload.messages
          .map((m) => blocksToText(m.content))
          .join(' ')
          .trim();
        if (query) {
          const hits = await stores.l1.search(query, cfg.recall.maxResults, {
            scoreThreshold: cfg.recall.scoreThreshold,
            family: mode === 'auto' ? undefined : mode,
          });
          l1Cache.set(payload.agent.id, hits);
          if (hits.length > 0) {
            logger.info(
              `[memory] 召回命中 ${hits.length} 条 L1（mode=${mode}，query="${query.slice(0, 30).replace(/\n/g, ' ')}…"，agent=${payload.agent.id}）`,
            );
          }
        }
      } catch (err) {
        logger.warn(`[memory] 召回检索失败: ${err instanceof Error ? err.message : String(err)}`);
      }
      return next();
    });
  }

  // ── 2. agent 作用域上下文 provider ──
  // 插件可能在默认 agent 创建之后才加载（组合顺序由依赖决定），
  // 因此除了监听 agent/created，还要给已存在的 agent 补注册。
  const registered = new WeakSet<object>();
  // context() 的 disposer 必须挂到插件自身生命周期：agent.ctx 比插件实例活得久，
  // 不主动清理会导致热重载后旧注册泄漏、新实例撞名（"already registered"）
  const contextDisposers: Array<() => void> = [];
  const registerForAgent = (agent: Agent): void => {
    if (registered.has(agent)) return;
    registered.add(agent);
    try {
      contextDisposers.push(
        agent.ctx.systemPrompt.context({
          name: 'memory:recall',
          order: 500,
          text: () => {
            const s = live.get();
            if (!s.enabled || !s.recall) return '';
            const hits = l1Cache.get(agent.id) ?? [];
            return formatL1Memories(hits);
          },
        }),
        agent.ctx.systemPrompt.context({
          name: 'memory:profile',
          order: 510,
          text: () => {
            const s = live.get();
            if (!s.enabled || !s.recall) return '';
            const mode = modes.get(agent.id);
            if (mode === 'off') return '';
            // auto 档：两族按类别归组（画像/导航各一个标签，域内 <domain> 分块）；纯档：单族原格式
            const body =
              mode === 'auto'
                ? formatProfileAuto(profileCache.chat, profileCache.work)
                : formatProfileSingle(profileCache[mode]);
            if (!body) return MEMORY_TOOLS_GUIDE;
            return `${body}\n\n${MEMORY_TOOLS_GUIDE}`;
          },
        }),
      );
    } catch (err) {
      logger.warn(`[memory] 召回上下文注册失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const agents = ctx.get('agents');
  if (agents) {
    for (const agent of agents.list()) registerForAgent(agent);
  }
  ctx.on('agent/created', (payload) => {
    registerForAgent(payload.agent);
  });
  ctx.effect(() => () => {
    for (const dispose of contextDisposers.splice(0)) {
      try {
        dispose();
      } catch {
        /* agent 可能已先一步销毁 */
      }
    }
  });

  return { invalidateProfile };
}

function formatL1Memories(items: L1Hit[]): string {
  if (items.length === 0) return '';
  const lines = ['<relevant-memories>', ''];
  for (const item of items) {
    // [type|scene] 标签 + 内容（官方召回行格式）
    const tag = item.scene_name ? `${item.type}|${item.scene_name}` : item.type;
    lines.push(`- [${tag}] ${item.content}`);
  }
  lines.push('', '</relevant-memories>');
  return lines.join('\n');
}

/** 单族画像/导航片段（注入侧按档位组装，纯档与 auto 档格式不同）。 */
interface ProfileParts {
  persona: string;
  nav: string;
}

/** auto 档 <user-persona> 内的域说明：让模型理解分块结构与两域的独立性。 */
const DOMAIN_HINT =
  '以下内容按记忆域分块：chat=用户个人画像（User Narrative Profile），work=团队工作准则（Team Operating Doctrine）。' +
  '两域独立蒸馏与更新，请按当前对话语境参考对应域，不要把一域的内容当作另一域的事实。';

function wrapDomain(family: 'chat' | 'work', content: string): string {
  const label = family === 'chat' ? '用户个人画像' : '团队工作准则';
  return `<domain family="${family}" label="${label}">\n${content.trim()}\n</domain>`;
}

/** 纯档注入：单族画像 + 场景导航（沿用原有格式）。 */
function formatProfileSingle(parts: ProfileParts): string {
  const segments: string[] = [];
  if (parts.persona) segments.push(`<user-persona>\n${parts.persona}\n</user-persona>`);
  if (parts.nav) segments.push(`<scene-navigation>\n${parts.nav}\n</scene-navigation>`);
  return segments.join('\n\n');
}

/** auto 档注入：两族按类别归组——画像共用一个 <user-persona>、导航共用一个 <scene-navigation>，域内 <domain> 分块。 */
function formatProfileAuto(chat: ProfileParts, work: ProfileParts): string {
  const segments: string[] = [];
  const personas: Array<['chat' | 'work', string]> = [
    ['chat', chat.persona],
    ['work', work.persona],
  ];
  const personaBlocks = personas.filter(([, p]) => p.trim()).map(([f, p]) => wrapDomain(f, p));
  if (personaBlocks.length > 0) {
    segments.push(`<user-persona>\n${DOMAIN_HINT}\n\n${personaBlocks.join('\n\n')}\n</user-persona>`);
  }
  const navs: Array<['chat' | 'work', string]> = [
    ['chat', chat.nav],
    ['work', work.nav],
  ];
  const navBlocks = navs.filter(([, n]) => n.trim()).map(([f, n]) => wrapDomain(f, n));
  if (navBlocks.length > 0) {
    segments.push(`<scene-navigation>\n${navBlocks.join('\n\n')}\n</scene-navigation>`);
  }
  // 注意：工具指南由注入侧统一附加一次（auto 档不重复）
  return segments.join('\n\n');
}

async function loadProfileParts(
  stores: { scenes: Record<'chat' | 'work', SceneStore>; persona: Record<'chat' | 'work', PersonaStore> },
  cfg: MemoryConfig,
  family: 'chat' | 'work',
): Promise<ProfileParts> {
  const persona = cfg.recall.includePersona ? ((await stores.persona[family].read()) ?? '') : '';
  const nav = cfg.recall.includeSceneNav ? ((await stores.scenes[family].navigation()) ?? '').trim() : '';
  return { persona, nav };
}
