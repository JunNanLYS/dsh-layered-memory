/**
 * 嵌入源状态层 + 活切换管理器（D4/D5/D6 决策落地）。
 *
 * - 状态文件 embedding-source.json（写穿持久化，session-modes 同款：内存态 + 原子写
 *   + 写队列串行化）；无文件 = remote（与历史行为完全一致，老用户无感）；
 * - 生效 = 部署上限 AND 运行时选择（仓库铁律）：远程档要求静态四件套配齐，
 *   本地档受 embedding.allowLocalModels 上限约束；
 * - 活切换链（后台执行，RPC 立即返回 accepted，进度靠轮询）：
 *   安装运行时（首次本地）→ 预热加载 → 换服务 + swapProvider（维度变化 drop 向量表）
 *   → 后台全量重嵌（L1/L0 计数进度，可取消）→ 持久化状态。
 *   失败语义：异常（安装失败/模型加载失败/db 拒绝）→ 状态不持久化，重启回到旧源；
 *   重嵌取消/部分失败 → 已切换（物理表即新维度，meta 已同步），缺失向量由周期
 *   backfill 补齐——不回滚（回滚需要再 drop 一次表，得不偿失）。
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { MemoryConfig } from '../config.js';
import type { MemoryLogger } from '../types.js';
import type { EmbeddingProviderInfo, EmbeddingService } from './embedding.js';
import { NoopEmbeddingService, RemoteEmbeddingService } from './embedding.js';
import type { L0Store } from './l0.js';
import type { L1Store } from './l1.js';
import { catalogById, MODEL_CATALOG } from './model-catalog.js';
import { LocalEmbeddingService, type TransformersModuleLike } from './local-embedding.js';
import { ModelDownloadQueue } from './download-queue.js';
import { RuntimeInstaller } from './runtime-installer.js';
import type { MemoryDb } from './sqlite.js';

export type EmbeddingSourceKind = 'remote' | 'local' | 'off';

export interface EmbeddingSourceState {
  source: EmbeddingSourceKind;
  /** source=local 时启用的目录模型 id。 */
  activeModel: string | null;
}

// ── 状态存储（写穿持久化） ──

export class EmbeddingSourceStore {
  private state: EmbeddingSourceState = { source: 'remote', activeModel: null };
  private readonly file: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly logger?: MemoryLogger;

  constructor(dataDir: string, logger?: MemoryLogger) {
    this.file = path.join(dataDir, 'embedding-source.json');
    this.logger = logger;
  }

  get(): EmbeddingSourceState {
    return { ...this.state };
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as Partial<EmbeddingSourceState>;
      if (
        (parsed.source === 'remote' || parsed.source === 'local' || parsed.source === 'off') &&
        (parsed.activeModel === null || typeof parsed.activeModel === 'string')
      ) {
        this.state = { source: parsed.source, activeModel: parsed.activeModel };
      } else {
        this.logger?.warn('[memory] 嵌入源状态文件损坏，按默认 remote 起步');
      }
    } catch {
      // 无文件 = 历史行为（跟随部署配置的远程嵌入）
    }
  }

  async set(next: EmbeddingSourceState): Promise<void> {
    this.state = { source: next.source, activeModel: next.activeModel };
    this.writeQueue = this.writeQueue.then(() => this.persist()).catch(() => {});
    await this.writeQueue;
  }

  private async persist(): Promise<void> {
    const tmp = this.file + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    await fs.rename(tmp, this.file);
  }
}

// ── 启动期初始解析（index.ts 在建 db 前调用；纯函数式便于测试） ──

export interface InitialEmbedding {
  svc: EmbeddingService;
  dims: number;
  /** 传给 db.init 的 providerInfo（触发既有配置比对 → drop → needsReindex 链）。 */
  providerInfo?: EmbeddingProviderInfo;
  /** 解析降级原因（UI 展示）。 */
  note?: string;
}

/** 远程档部署上限：静态四件套 + enabled。 */
export function remoteCeiling(cfg: MemoryConfig): boolean {
  const e = cfg.embedding;
  return e.enabled && !!e.baseUrl && !!e.apiKey && !!e.model && e.dimensions > 0;
}

export async function resolveInitialEmbedding(
  cfg: MemoryConfig,
  sourceStore: EmbeddingSourceStore,
  downloader: ModelDownloadQueue,
  makeLocal: (modelId: string) => LocalEmbeddingService | null,
  logger?: MemoryLogger,
): Promise<InitialEmbedding> {
  const state = sourceStore.get();
  if (state.source === 'off') {
    return { svc: new NoopEmbeddingService(), dims: 0 };
  }
  if (state.source === 'local') {
    if (!cfg.embedding.allowLocalModels) {
      logger?.warn('[memory] 嵌入源为 local 但部署已禁用本地模型（allowLocalModels=false），本次运行纯 FTS');
      return { svc: new NoopEmbeddingService(), dims: 0, note: '部署配置已禁用本地嵌入模型' };
    }
    const entry = state.activeModel ? catalogById(state.activeModel) : undefined;
    if (!entry) {
      logger?.warn(`[memory] 嵌入源 local 的模型 ${state.activeModel} 不在目录，本次运行纯 FTS`);
      return { svc: new NoopEmbeddingService(), dims: 0, note: '启用的模型不在内置目录' };
    }
    if (!(await downloader.isDownloaded(entry.id))) {
      logger?.warn(`[memory] 本地模型 ${entry.id} 文件缺失（可能被清理），本次运行纯 FTS`);
      return { svc: new NoopEmbeddingService(), dims: 0, note: '模型文件缺失，请重新下载' };
    }
    const svc = makeLocal(entry.id);
    if (!svc) return { svc: new NoopEmbeddingService(), dims: 0, note: '本地服务构造失败' };
    return { svc, dims: entry.dims, providerInfo: { provider: 'local', model: entry.id, dimensions: entry.dims } };
  }
  // remote（默认）
  if (!remoteCeiling(cfg)) {
    return { svc: new NoopEmbeddingService(), dims: 0 };
  }
  const svc = new RemoteEmbeddingService({
    baseUrl: cfg.embedding.baseUrl,
    apiKey: cfg.embedding.apiKey,
    model: cfg.embedding.model,
    dimensions: cfg.embedding.dimensions,
    maxInputChars: cfg.embedding.maxInputChars,
    timeoutMs: cfg.embedding.timeoutMs,
    logger,
  });
  return { svc, dims: cfg.embedding.dimensions, providerInfo: svc.getProviderInfo() };
}

/** 本地服务构造工厂（index.ts 的初始解析与 Manager 共用一份实现，防漂移）。 */
export function makeLocalServiceFactory(
  installer: RuntimeInstaller,
  downloader: ModelDownloadQueue,
  logger?: MemoryLogger,
  maxInputChars?: number,
): (modelId: string) => LocalEmbeddingService | null {
  return (modelId: string) => {
    const entry = catalogById(modelId);
    if (!entry) return null;
    return new LocalEmbeddingService(
      entry,
      downloader.modelsDir(entry.id),
      () => Promise.resolve(installer.resolveModule() as TransformersModuleLike),
      logger,
      maxInputChars,
    );
  };
}

// ── 活切换管理器 ──

export type ApplyPhase =
  | 'idle'
  | 'installing-runtime'
  | 'warming'
  | 'switching'
  | 'reindexing'
  | 'done'
  | 'error';

export interface ReindexProgressState {
  running: boolean;
  l1Done: number;
  l1Total: number;
  l0Done: number;
  l0Total: number;
  startedAt: number;
  cancelled: boolean;
  error?: string;
}

export interface EmbeddingManagerDeps {
  dataDir: string;
  cfg: MemoryConfig;
  db: MemoryDb;
  l0: L0Store;
  l1: L1Store;
  sourceStore: EmbeddingSourceStore;
  installer: RuntimeInstaller;
  downloader: ModelDownloadQueue;
  initial: InitialEmbedding;
  logger: MemoryLogger;
  /** 本地服务构造（默认用 makeLocalServiceFactory(installer, downloader)。 */
  makeLocal?: (modelId: string) => LocalEmbeddingService | null;
}

export class EmbeddingManager {
  readonly sourceStore: EmbeddingSourceStore;
  readonly installer: RuntimeInstaller;
  readonly downloader: ModelDownloadQueue;
  private readonly deps: EmbeddingManagerDeps;
  private current: EmbeddingService;
  private localSvc: LocalEmbeddingService | null = null;
  private applyPhase: ApplyPhase = 'idle';
  private applyMessage = '';
  private applyStartedAt = 0;
  private applyBusy = false;
  private reindex: ReindexProgressState = {
    running: false,
    l1Done: 0,
    l1Total: 0,
    l0Done: 0,
    l0Total: 0,
    startedAt: 0,
    cancelled: false,
  };
  private reindexCancel = false;
  /** 停机标志：dispose 后应用链不再推进（防卸载后的孤儿重嵌/安装）。 */
  private disposedFlag = false;
  /** 当前生效目标的 providerInfo（backfill/启动链的 meta 写入用——杜绝陈旧闭包）。 */
  private currentInfo: EmbeddingProviderInfo | undefined;
  /** 初始解析的降级说明（活切换成功后清空，防过期提示常驻）。 */
  private activeNote: string | undefined;

  constructor(deps: EmbeddingManagerDeps) {
    this.deps = deps;
    this.sourceStore = deps.sourceStore;
    this.installer = deps.installer;
    this.downloader = deps.downloader;
    this.current = deps.initial.svc;
    this.currentInfo = deps.initial.providerInfo;
    this.activeNote = deps.initial.note;
    // 启动即本地档：initial.svc 已是绑定真实运行时 loader 的 LocalEmbeddingService。
    // 立即后台预热（不阻塞启动）——否则 L1/L0.reindex 与 EmbedHelper.batch 的
    // vectorReady 短路都不会触发懒加载，缺失向量要等到首次召回才补（review A）
    if (deps.initial.providerInfo?.provider === 'local') {
      this.localSvc = this.current as LocalEmbeddingService;
      this.localSvc.startWarmup();
    }
  }

  /** 当前目标的 providerInfo（index.ts 的启动重嵌链/周期 backfill 写 meta 用）。 */
  currentProviderInfo(): EmbeddingProviderInfo | undefined {
    return this.currentInfo;
  }

  /** 取消运行时安装（RPC：npm 卡死/用户主动放弃）。 */
  cancelRuntimeInstall(): boolean {
    return this.installer.cancel();
  }

  /** 当前生效服务（index.ts 初始建 store 用）。 */
  getService(): EmbeddingService {
    return this.current;
  }

  /** 构造绑定真实运行时 loader 的本地服务（deps.makeLocal 可注入，测试替换）。 */
  private makeLocalService(modelId: string): LocalEmbeddingService | null {
    const factory =
      this.deps.makeLocal ?? makeLocalServiceFactory(this.installer, this.downloader, this.deps.logger, this.deps.cfg.embedding.maxInputChars);
    return factory(modelId);
  }

  /** 活切换请求：验证通过即接受，后台执行应用链（进度轮询可见）。 */
  requestSource(next: { source: EmbeddingSourceKind; activeModel?: string | null }): { accepted: boolean; error?: string } {
    if (this.applyBusy) return { accepted: false, error: '切换进行中，请等待完成' };
    if (next.source === 'remote' && !remoteCeiling(this.deps.cfg)) {
      return { accepted: false, error: '部署未配置远程嵌入（baseUrl/apiKey/model/dimensions 或 enabled），远程档不可选' };
    }
    if (next.source === 'local') {
      if (!this.deps.cfg.embedding.allowLocalModels) {
        return { accepted: false, error: '部署已禁用本地嵌入模型（allowLocalModels=false）' };
      }
      if (!next.activeModel || !catalogById(next.activeModel)) {
        return { accepted: false, error: '请选择内置目录中的模型' };
      }
    }
    const state: EmbeddingSourceState = {
      source: next.source,
      activeModel: next.source === 'local' ? next.activeModel! : null,
    };
    this.applyBusy = true;
    this.applyStartedAt = Date.now();
    this.applyMessage = '';
    void this.applyChain(state).finally(() => {
      this.applyBusy = false;
    });
    return { accepted: true };
  }

  /** 下载启动（串行队列忙时拒绝）；完成后自动做一次可加载性预热验证（D6）。 */
  startDownload(modelId: string): { ok: boolean; error?: string } {
    if (!this.deps.cfg.embedding.allowLocalModels) {
      return { ok: false, error: '部署已禁用本地嵌入模型' };
    }
    if (!catalogById(modelId)) return { ok: false, error: '未知模型' };
    if (this.downloader.isBusy()) return { ok: false, error: '已有下载任务进行中' };
    void this.downloader
      .start(modelId)
      .then(async (p) => {
        if (p.phase !== 'done') return;
        // 下载完成自动预热验证：当前启用模型 → 直接 warmup；未启用的临时模型验完即释放
        if (this.sourceStore.get().source === 'local' && this.sourceStore.get().activeModel === modelId) {
          this.localSvc?.startWarmup();
          return;
        }
        const scratch = this.makeLocalService(modelId);
        if (!scratch) return;
        if (await this.installer.isReady()) {
          // 预热只为验证可加载性：完成后必须释放（bge-m3 ~550MB，不关就常驻泄漏，
          // 且 onnxruntime 持文件句柄会卡住该模型的删除）
          scratch.startWarmup();
          void scratch.waitForReady().then(
            () => scratch.close(),
            () => scratch.close(),
          );
        }
      })
      .catch(() => {
        /* 失败态在 downloader 进度里 */
      });
    return { ok: true };
  }

  cancelDownload(): boolean {
    return this.downloader.cancel();
  }

  async deleteModel(modelId: string): Promise<{ ok: boolean; error?: string }> {
    const state = this.sourceStore.get();
    if (state.source === 'local' && state.activeModel === modelId) {
      return { ok: false, error: '该模型正在使用中，请先切换嵌入源' };
    }
    return this.downloader.deleteModel(modelId);
  }

  cancelReindex(): boolean {
    if (!this.reindex.running) return false;
    this.reindexCancel = true;
    return true;
  }

  /** 应用链/后台任务是否在跑（backfill 并发门禁用）。 */
  isBusy(): boolean {
    return this.applyBusy || this.reindex.running || this.downloader.isBusy();
  }

  /** 停机钩子（插件 dispose）：取消 npm 安装、下载与重嵌——不留后台孤儿任务。 */
  dispose(): void {
    this.disposedFlag = true;
    this.installer.cancel();
    this.downloader.cancel();
    this.cancelReindex();
    this.localSvc?.close();
  }

  private async applyChain(next: EmbeddingSourceState): Promise<void> {
    try {
      let svc: EmbeddingService;
      let providerInfo: EmbeddingProviderInfo | undefined;

      if (next.source === 'off') {
        this.applyPhase = 'switching';
        svc = new NoopEmbeddingService();
        providerInfo = undefined;
        this.currentInfo = undefined;
      } else if (next.source === 'remote') {
        this.applyPhase = 'switching';
        svc = new RemoteEmbeddingService({
          baseUrl: this.deps.cfg.embedding.baseUrl,
          apiKey: this.deps.cfg.embedding.apiKey,
          model: this.deps.cfg.embedding.model,
          dimensions: this.deps.cfg.embedding.dimensions,
          maxInputChars: this.deps.cfg.embedding.maxInputChars,
          timeoutMs: this.deps.cfg.embedding.timeoutMs,
          logger: this.deps.logger,
        });
        providerInfo = svc.getProviderInfo();
      } else {
        // local：下载完整性前置校验 → 运行时 → 预热 → 切换
        if (!(await this.downloader.isDownloaded(next.activeModel!))) {
          throw new Error('模型文件不完整（未下载或已损坏），请先完成下载');
        }
        if (!(await this.installer.isReady())) {
          this.applyPhase = 'installing-runtime';
          const ok = await this.installer.ensure();
          if (!ok) {
            throw new Error(`运行时安装失败: ${this.installer.getProgress().error ?? '未知原因'}`);
          }
        }
        if (this.disposedFlag) throw new Error('插件已卸载，切换中止');
        this.applyPhase = 'warming';
        const local = this.makeLocalService(next.activeModel!);
        if (!local) throw new Error('模型不在目录');
        await local.waitForReady();
        svc = local;
        providerInfo = local.getProviderInfo();
        this.applyPhase = 'switching';
      }

      // 换服务 + 换表（providerInfo 变化 → drop 向量表按新维度重建）
      let needsReindex = false;
      if (providerInfo) {
        const swap = this.deps.db.swapProvider(providerInfo);
        if (!swap.ok) throw new Error(swap.error ?? '切换向量引擎失败');
        needsReindex = swap.needsReindex;
        // 物理表在 swap 成功那一刻已是新维度——meta 立即跟上（即使后续重嵌被取消/
        // 部分失败）：meta 的语义是"物理表现状"，缺失行由 backfill 按 missing 计数补，
        // 不依赖 meta。拖着不写会把"meta=旧 provider"留给下次比对埋雷。
        this.deps.db.markEmbeddingSynced(providerInfo);
        this.currentInfo = providerInfo;
      }
      const oldLocal = this.localSvc;
      this.localSvc = next.source === 'local' ? (svc as LocalEmbeddingService) : null;
      this.current = svc;
      this.deps.l0.setEmbeddingService(svc);
      this.deps.l1.setEmbeddingService(svc);
      oldLocal?.close();

      let pendingNote = '';
      if (needsReindex) {
        if (this.disposedFlag) throw new Error('插件已卸载，重嵌入中止');
        this.applyPhase = 'reindexing';
        const result = await this.reindexNow();
        if (result.cancelled) {
          pendingNote = '；重嵌入已取消，缺失向量由周期任务补齐';
          this.deps.logger.warn('[memory] 重嵌入已取消，缺失向量将由周期补齐（检索暂按关键词降级）');
        } else if (result.failedTotal > 0) {
          pendingNote = `；${result.failedTotal} 条向量待补齐（周期任务会补）`;
        }
        if (result.error) throw new Error(result.error);
      }

      await this.sourceStore.set(next);
      this.activeNote = undefined;
      this.applyPhase = 'done';
      this.applyMessage =
        next.source === 'off'
          ? '已切换为关键词检索'
          : '切换完成' + pendingNote;
    } catch (err) {
      this.applyPhase = 'error';
      this.applyMessage = err instanceof Error ? err.message : String(err);
      this.deps.logger.warn(`[memory] 嵌入源切换失败（状态保持不变）: ${this.applyMessage}`);
    }
  }

  private async reindexNow(): Promise<{ cancelled: boolean; failedTotal: number; error?: string }> {
    this.reindexCancel = false;
    this.reindex = { running: true, l1Done: 0, l1Total: 0, l0Done: 0, l0Total: 0, startedAt: Date.now(), cancelled: false };
    let failedTotal = 0;
    try {
      const r1 = await this.deps.l1.reindex({
        onProgress: (done, total) => {
          this.reindex.l1Done = done;
          this.reindex.l1Total = total;
        },
        shouldCancel: () => this.reindexCancel,
      });
      failedTotal += r1.failed;
      const r0 = await this.deps.l0.reindex({
        onProgress: (done, total) => {
          this.reindex.l0Done = done;
          this.reindex.l0Total = total;
        },
        shouldCancel: () => this.reindexCancel,
      });
      failedTotal += r0.failed;
      const cancelled = !!(r1.cancelled || r0.cancelled);
      this.reindex.cancelled = cancelled;
      this.reindex.running = false;
      return { cancelled, failedTotal };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.reindex.running = false;
      this.reindex.error = message;
      return { cancelled: false, failedTotal, error: `重嵌入失败: ${message}` };
    }
  }

  /** RPC 快照（设置页嵌入区块数据源；client 忙时 1s 轮询）。 */
  async snapshot(): Promise<EmbeddingStateView> {
    const status = await this.downloader.listStatus();
    const models = MODEL_CATALOG.map((entry) => {
      const s = status.find((x) => x.id === entry.id);
      return {
        id: entry.id,
        name: entry.name,
        dims: entry.dims,
        contextTokens: entry.contextTokens,
        tags: entry.tags,
        description: entry.description,
        totalBytes: s?.totalBytes ?? 0,
        bytesOnDisk: s?.bytesOnDisk ?? 0,
        state: s?.state ?? 'none',
      };
    });
    const state = this.sourceStore.get();
    return {
      source: state.source,
      activeModel: state.activeModel,
      ceilings: { remote: remoteCeiling(this.deps.cfg), local: this.deps.cfg.embedding.allowLocalModels },
      runtime: this.installer.getProgress(),
      models,
      download: this.downloader.getProgress(),
      apply: { phase: this.applyPhase, message: this.applyMessage, startedAt: this.applyStartedAt, busy: this.applyBusy },
      local: this.localSvc ? { state: this.localSvc.getState(), error: this.localSvc.getLoadError() } : null,
      reindex: { ...this.reindex },
      activeNote: this.activeNote,
    };
  }
}

export interface EmbeddingStateView {
  source: EmbeddingSourceKind;
  activeModel: string | null;
  ceilings: { remote: boolean; local: boolean };
  runtime: {
    targetVersion: string;
    phase: 'idle' | 'installing' | 'ready' | 'error' | 'cancelled';
    installedVersion: string | null;
    elapsedMs: number;
    lastLines: string[];
    error?: string;
  };
  models: Array<{
    id: string;
    name: string;
    dims: number;
    contextTokens: number;
    tags: string[];
    description: string;
    totalBytes: number;
    bytesOnDisk: number;
    state: 'none' | 'partial' | 'downloaded';
  }>;
  download: ReturnType<ModelDownloadQueue['getProgress']>;
  apply: { phase: ApplyPhase; message: string; startedAt: number; busy: boolean };
  local: { state: 'idle' | 'loading' | 'ready' | 'failed' | 'terminated'; error: string | null } | null;
  reindex: ReindexProgressState;
  activeNote?: string;
}
