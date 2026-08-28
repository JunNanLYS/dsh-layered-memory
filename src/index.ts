/**
 * dsh-memory-plugin — L0~L3 分层蒸馏记忆插件（持久组合插件）。
 *
 * 功能：
 * - L0：订阅 session/event，按轮次捕获原始对话，双写 JSONL 事实源 + SQLite 检索库；
 * - L1：LLM 抽取原子记忆（情境切分 + 记忆提取）+ 冲突检测去重 + FTS/向量/混合检索；
 * - L2：LLM 把新记忆整合为场景块（Markdown，META 块 + 热度管理 + 场景导航）；
 * - L3：LLM 从变化场景蒸馏 persona.md（chat=用户画像 / work=Team Operating Doctrine）；
 * - 召回：agent/pre-step 检索 L1，agent 作用域上下文注入画像/场景导航/工具指南；
 * - 工具：memory_search / conversation_search / memory_read_scene。
 *
 * 存储架构（对齐 MemoryCore 官方双写设计）：
 * - JSONL 追加文件（conversations/、records/ 按天分片）= 备份/恢复事实源；
 * - memory.db（node:sqlite + WAL + FTS5 BM25 + sqlite-vec 余弦向量）= 主检索引擎。
 *
 * 移植自 MemoryCore（TencentDB Agent Memory）的 L0~L3 设计，Prompt 原样保留，
 * 仅把"LLM 操作文件"的 L2/L3 流程适配为"LLM 输出、工程侧执行"。
 */
import * as path from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { memorySchema, resolveDataDir, type MemoryConfig } from './config.js';
import { registerBenchControl } from './bench-control.js';
import { registerCapture } from './hooks/capture.js';
import { registerRecall } from './hooks/recall.js';
import { MemoryRunner } from './pipeline/runner.js';
import { RebuildController } from './pipeline/rebuild.js';
import { registerMemoryRpc, PLUGIN_VERSION } from './stats.js';
import { registerLiveSettings } from './settings.js';
import { NoopEmbeddingService, type EmbeddingProviderInfo, type EmbeddingService } from './store/embedding.js';
import {
  EmbeddingManager,
  EmbeddingSourceStore,
  makeLocalServiceFactory,
  resolveInitialEmbedding,
  type InitialEmbedding,
} from './store/embedding-source.js';
import { ModelDownloadQueue } from './store/download-queue.js';
import { PINNED_TRANSFORMERS_VERSION, RuntimeInstaller } from './store/runtime-installer.js';
import { ensureDir } from './store/io.js';
import { L0Store } from './store/l0.js';
import { L1Store } from './store/l1.js';
import { PersonaStore } from './store/persona.js';
import { MemoryDb, type StoreInitResult } from './store/sqlite.js';
import { SceneStore } from './store/scenes.js';
import { SessionModeStore } from './store/session-modes.js';
import { StateStore } from './store/state.js';
import { registerMemoryTools } from './tools/index.js';
import type { MemoryLogger } from './types.js';
import { errDetail, withFileLog } from './util/filelog.js';
import { buildRouteChain, resolveModelRoute, invalidateEffortCache } from './llm.js';
import { effectiveCfg } from './pipeline/runner.js';
import { initTokenCost, resetTokenCost } from './token-cost.js';

export const name = 'dsh-memory-plugin';

/** 硬依赖：蒸馏要用 llm，工具注册要用 tools，召回注入要用 systemPrompt。 */
export const inject = ['llm', 'tools', 'systemPrompt'];

/**
 * 插件配置 schema。导出名必须是 `Config`——cordis 运行时只读 plugin.Config
 * （Standard Schema 接口）做校验与默认值填充；导出 `schema` 会被静默忽略，
 * 导致 config 里嵌套对象为 undefined、apply 抛错、fiber FAILED 拖垮宿主启动。
 */
export const Config = memorySchema;

export async function apply(ctx: Context, config: MemoryConfig): Promise<void> {
  let logger: MemoryLogger = {
    debug: (m) => ctx.logger.debug(m),
    info: (m) => ctx.logger.info(m),
    warn: (m) => ctx.logger.warn(m),
    error: (m) => ctx.logger.error(m),
  };

  const dataDir = resolveDataDir(config);
  // dsh 宿主无持久化日志，镜像 info+ 到数据目录 memory.log 供蒸馏问题诊断
  const fileLogger = withFileLog(dataDir, logger);
  logger = fileLogger;

  // 供应商拓扑变化（增删/改配置）→ 思考档位能力缓存失效，下次调用重新探询
  ctx.on('llm/adapters-updated', () => invalidateEffortCache());

  // 存储初始化失败只降级（禁用捕获/蒸馏），绝不拖垮宿主——
  // 记忆是增强能力，数据目录不可写时 dsh 本体必须照常启动。
  let storageOk = true;
  try {
    await ensureDir(dataDir);
  } catch (err) {
    storageOk = false;
    logger.error(
      `[memory] 数据目录不可写，记忆功能停用: ${dataDir} (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  // ── 记忆模式运行时开关（官方 settings 服务，live 生效；缺失时恒开） ──
  const live = registerLiveSettings(ctx, logger);

  /** 插件停机标志：置位后不再发起后台 embeddings 调用（dispose 序最先设置）。 */
  let disposed = false;

  // ── 会话档位存储（sessionId → auto/chat/work/off；默认档 = config.family） ──
  const modes = new SessionModeStore(dataDir, config.family, logger);
  if (storageOk) {
    try {
      await modes.init();
    } catch (err) {
      logger.warn(`[memory] 会话档位载入失败（降级为默认档内存态）: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 嵌入源三态（D4：远程/本地/关闭）——状态文件优先于静态配置 ──
  const sourceStore = new EmbeddingSourceStore(dataDir, logger);
  const installer = new RuntimeInstaller(dataDir, PINNED_TRANSFORMERS_VERSION, { logger });
  const downloader = new ModelDownloadQueue(dataDir, {
    mirror: config.embedding.mirror,
    logger,
    proxy: config.embedding.proxy,
  });
  const makeLocalService = makeLocalServiceFactory(installer, downloader, logger, config.embedding.maxInputChars);
  let initial: InitialEmbedding = { svc: new NoopEmbeddingService(), dims: 0 };
  /** 管理器引用：启动重嵌链/backfill 闭包在运行期解引用（声明早于创建避免 TDZ）。 */
  let embedManagerRef: EmbeddingManager | undefined;
  if (storageOk) {
    try {
      await sourceStore.init();
      initial = await resolveInitialEmbedding(config, sourceStore, downloader, makeLocalService, logger);
    } catch (err) {
      logger.warn(`[memory] 嵌入源初始解析失败（降级纯 FTS）: ${errDetail(err)}`);
    }
  }
  /** meta 写入永远用当前目标（杜绝启动期闭包里的陈旧 providerInfo 腐蚀 embedding_meta）。 */
  const currentProviderInfo = (): EmbeddingProviderInfo | undefined =>
    embedManagerRef?.currentProviderInfo() ?? initial.providerInfo;

  // ── 检索引擎（memory.db）与向量服务 ──
  const embed = initial.svc;
  const db = new MemoryDb(path.join(dataDir, 'memory.db'), initial.dims, logger);
  initTokenCost(db, config.tokenCost.retentionDays);
  // 插件卸载时关闭连接（WAL 落盘），注册一次即可
  ctx.effect(() => () => db.close());

  let dbInit: StoreInitResult = { needsReindex: false };
  if (storageOk) {
    try {
      dbInit = db.init(initial.providerInfo);
      if (db.isDegraded()) {
        storageOk = false;
        logger.error('[memory] 检索库初始化失败（schema/FTS 不可用），记忆功能停用');
      }
    } catch (err) {
      storageOk = false;
      logger.error(
        `[memory] 检索库打开失败，记忆功能停用: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const stores = {
    l0: new L0Store(dataDir, db, embed, logger),
    l1: new L1Store(dataDir, db, embed, config.recall.strategy, logger, config.recall.decayHalfLifeDays),
    // L2/L3 分族隔离：各自目录与文件（scenes/chat|work、persona-chat|work.md）
    scenes: {
      chat: new SceneStore(dataDir, 'chat', logger),
      work: new SceneStore(dataDir, 'work', logger),
    },
    persona: {
      chat: new PersonaStore(dataDir, 'chat', logger),
      work: new PersonaStore(dataDir, 'work', logger),
    },
    state: new StateStore(StateStore.pathFor(dataDir)),
  };
  if (storageOk) {
    try {
      await Promise.all([
        stores.l0.init(),
        stores.l1.init(),
        stores.scenes.chat.init(),
        stores.scenes.work.init(),
        stores.persona.chat.init(),
        stores.persona.work.init(),
      ]);
    } catch (err) {
      storageOk = false;
      logger.error(
        `[memory] 存储初始化失败，记忆功能停用: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 检索能力与策略说明（能力位由降级结果决定）
  const caps = db.getCapabilities();
  if (storageOk && config.recall.strategy !== 'keyword' && !caps.vectorSearch) {
    logger.warn(
      `[memory] 检索策略 ${config.recall.strategy} 需要向量能力（embedding 未启用/不可用），本次运行按 keyword（FTS5 BM25）检索`,
    );
  }
  logger.info(
    `[memory] 数据目录: ${dataDir}（v${PLUGIN_VERSION}，默认档=${config.family}，检索: FTS=${caps.ftsSearch} 向量=${caps.vectorSearch}${storageOk ? '' : '，存储不可用已停用捕获/蒸馏'}）`,
  );
  // 蒸馏模型路由：启动期解析一次并记录（路由错误是最难事后排查的问题之一）；
  // 用运行时调参视图解析——用户已用 UI 覆盖蒸馏模型时，日志反映实际路由
  try {
    const cfgView = effectiveCfg(config, live);
    const route = await resolveModelRoute(ctx, cfgView);
    // 链长度按同一解析口径计（相同条目会被去重），排障时无需 --dump-config 即可确认回退链生效
    const chain = buildRouteChain(route, cfgView.llm.fallbacks, cfgView.llm.reasoningEffort);
    logger.info(
      `[memory] 蒸馏模型路由: ${route.provider}/${route.model}${chain.length > 1 ? `（+${chain.length - 1} 回退）` : ''}`,
    );
  } catch (err) {
    logger.warn(`[memory] 蒸馏模型路由解析失败: ${errDetail(err)}`);
  }

  // embedding 配置变化 → 后台全量重嵌入（不阻塞启动）。
  // meta 标记条件 = 失败为 0 且缺失复查为 0（服务未就绪的空转不算成功）。
  if (storageOk && initial.providerInfo && !db.isDegraded()) {
    const info = initial.providerInfo;
    if (dbInit.needsReindex) {
      if (caps.vectorSearch) {
        void (async () => {
          try {
            if (disposed || embedManagerRef?.isBusy()) return;
            // 增量：配置变化路径向量表已被 drop，全部记录均"缺失"，等效全量；
            // 活切换发起时让路（swap 会 drop 表，并发跑只是白烧嵌入调用）
            const shouldCancel = () => disposed || !!embedManagerRef?.isBusy();
            const r1 = await stores.l1.reindex({ shouldCancel });
            const r0 = await stores.l0.reindex({ shouldCancel });
            // missing 复查：嵌入服务未就绪时 reindex 短路 0/0/0——那是"没跑"不是"成功"，
            // 不得标记 meta（否则启动链不再补，补齐被无限推迟到 backfill）
            const missingAfter =
              db.countL1VecMissing(db.getVecSkipSet('l1')) + db.countL0VecMissing(db.getVecSkipSet('l0'));
            if (r1.failed === 0 && r0.failed === 0 && missingAfter === 0) {
              db.markEmbeddingSynced(currentProviderInfo() ?? info);
              const skipNote = r1.skipped + r0.skipped > 0 ? `，跳过不可嵌入 ${r1.skipped + r0.skipped} 条` : '';
              logger.info(
                `[memory] 向量重建完成：L1 ${r1.written} 条，L0 ${r0.written} 条${skipNote}（原因：${dbInit.reason ?? '配置变化'}）`,
              );
            } else {
              logger.warn(
                `[memory] 向量重建未完成（L1 失败 ${r1.failed}，L0 失败 ${r0.failed}，剩缺 ${Math.max(missingAfter, 0)} 条），下次启动/补齐周期重试`,
              );
            }
          } catch (err) {
            logger.warn(`[memory] 向量重建失败: ${err instanceof Error ? err.message : String(err)}`);
          }
        })();
      }
    } else {
      // meta 已匹配或空库（initSchema 已写入），幂等重写一次
      db.markEmbeddingSynced(currentProviderInfo() ?? info);
    }

    // 周期性向量补齐：嵌入失败的批次/漏网记录自动补上（30 分钟一次）。
    // 判据 = 排除 skip 集后的缺失数（增量语义）：缺 1 条只补 1 条，
    // 零向量记录进 skip 集后不再触发——否则补齐永不收敛、每 30 分钟全量重嵌。
    // 注册不再依赖启动期 caps/providerInfo（off 起步后活切回旧源也要能补），
    // 执行期动态查当前目标与能力位。
    {
      const backfill = (): void => {
        void (async () => {
          try {
            if (disposed) return;
            const infoNow = currentProviderInfo();
            const capsNow = db.getCapabilities();
            if (!infoNow || !capsNow.vectorSearch) return;
            // 活切换链（安装/下载/重嵌）进行中让路——增量 reindex 天然幂等，
            // 但并发跑只是白烧一次嵌入调用
            if (embedManagerRef?.isBusy()) return;
            const l1Missing = db.countL1VecMissing(db.getVecSkipSet('l1')) > 0;
            const l0Missing = db.countL0VecMissing(db.getVecSkipSet('l0')) > 0;
            if (!l1Missing && !l0Missing) return;
            const shouldCancel = () => disposed || !!embedManagerRef?.isBusy();
            const r1 = await stores.l1.reindex({ shouldCancel });
            const r0 = await stores.l0.reindex({ shouldCancel });
            const missingAfter =
              db.countL1VecMissing(db.getVecSkipSet('l1')) + db.countL0VecMissing(db.getVecSkipSet('l0'));
            if (r1.failed === 0 && r0.failed === 0 && missingAfter === 0) {
              db.markEmbeddingSynced(infoNow);
              logger.info(
                `[memory] 向量补齐完成：L1 ${r1.written} 条，L0 ${r0.written} 条（跳过不可嵌入 ${r1.skipped + r0.skipped} 条）`,
              );
            } else if (r1.failed > 0 || r0.failed > 0) {
              logger.warn(`[memory] 向量补齐未完成（L1 失败 ${r1.failed}，L0 失败 ${r0.failed}），下个周期重试`);
            }
          } catch (err) {
            logger.warn(`[memory] 向量补齐失败: ${err instanceof Error ? err.message : String(err)}`);
          }
        })();
      };
      ctx.effect(() => {
        const timer = setInterval(backfill, 30 * 60_000);
        const first = setTimeout(backfill, 60_000);
        return () => {
          clearInterval(timer);
          clearTimeout(first);
        };
      });
    }
  }

  // 嵌入管理器（活切换/下载/运行时安装；存储降级时不建——RPC 走 supported=false）
  const embedManager =
    storageOk && !db.isDegraded()
      ? new EmbeddingManager({
          dataDir,
          cfg: config,
          db,
          l0: stores.l0,
          l1: stores.l1,
          sourceStore,
          installer,
          downloader,
          initial,
          logger,
          makeLocal: makeLocalService,
        })
      : undefined;
  embedManagerRef = embedManager;

  const runner = new MemoryRunner(ctx, config, stores, logger, live, modes);
  await runner.init();
  // 档位切换同步（ADR-0003）：切走按捕获档位落袋 / 切 off 挂起 / 切回清挂起
  modes.setModeChangeHandler((sessionId, oldMode, newMode) => runner.onModeChange(sessionId, oldMode, newMode));
  // 闲置兜底：静默达标会话的未蒸馏切片自动落袋（idleSeconds=0 关闭）
  runner.startIdleTimer();

  // 重建控制器（存储降级时不建——RPC 端点走 supported=false 分支）
  const rebuild =
    storageOk && !db.isDegraded()
      ? new RebuildController(ctx, config, stores, db, runner, logger, live)
      : undefined;

  let flushL0: (() => Promise<void>) | undefined;
  if (storageOk) {
    flushL0 = registerCapture(ctx, config, runner, stores.l0, logger, live, modes);
  }
  const recall = registerRecall(ctx, config, stores, logger, live, modes, dataDir);
  runner.setAfterRun(recall.invalidateProfile);
  registerMemoryTools(ctx, config, stores, logger, modes, live);
  registerMemoryRpc(
    ctx,
    config,
    stores,
    logger,
    {
      degraded: () => !storageOk || db.isDegraded(),
      pending: () => runner.pendingCount,
    },
    live,
    modes,
    dataDir,
    rebuild,
    embedManager,
    // 悬浮卡信息区数据源（session-stats 热路径端点；全部内存读 + 索引 COUNT，零文件 I/O）
    {
      recallStats: (sid) => recall.stats(sid),
      memoryOccupancy: (sid) => recall.occupancy(sid),
      profileEstimate: (sid) => recall.estimateProfileTokens(sid),
      recallEstimate: (sid) => recall.estimateRecallTokens(sid),
      runnerView: (sid, mode) => runner.sessionView(sid, mode),
      l0Count: (sid) => stores.l0.countBySession(sid),
      capabilities: () => db.getCapabilities(),
    },
  );

  // bench 控制服务（config.benchControl 门控，默认关）：仅基准/调试部署注册，
  // 供同进程的 bench-runner lifecycle 赛道触发 rebuild / 设置会话档位
  // （宿主侧 RPC 无 call()，见 bench-control.ts）
  if (config.benchControl && rebuild) {
    const disposeBench = registerBenchControl(ctx, rebuild, modes, logger);
    ctx.effect(() => () => disposeBench());
  }

  logger.info(
    `[memory] L0~L3 分层蒸馏记忆插件就绪（L1 记忆 ${storageOk ? stores.l1.size : 0} 条 | 捕获=${
      storageOk && config.capture.enabled
    } | 蒸馏=${storageOk && config.extract.enabled} | 召回=${config.recall.enabled}）`,
  );

  // 停机顺序（M7）：置停机标志（后台 embeddings 不再发起）→ 停蒸馏取新任务 →
  // 冲刷 L0 串行链（排队消息先落盘）→ 关库。cordis disposer 为 LIFO 逐个 await，
  // 本 effect 晚注册故先执行；apply 中途失败时由上方早注册的 db.close 兜底（双关安全）。
  ctx.effect(() => () => {
    disposed = true;
    runner.stop();
    embedManager?.dispose();
    downloader.dispose();
    return (async () => {
      await flushL0?.();
      db.close();
      resetTokenCost();
    })();
  });
}
