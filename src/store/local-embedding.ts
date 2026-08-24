/**
 * 本地嵌入服务（D1/D6 决策，worker 线程化版）：transformers.js 的模型加载与
 * ONNX 推理全部在 worker_threads 子线程执行（resources/embedding-worker.cjs），
 * 本类只是主线程侧的协议代理——onnxruntime-node 的 run/loadModel 是主线程
 * 同步调用，留在宿主事件循环会冻结整个 dsh 页面（0.8.6 修复的真实事故）。
 *
 * - 懒加载（D6）：首次嵌入/warmup 才让 worker 加载模型，close()=terminate
 *   释放线程与模型（嵌入源切走/关闭时调用），terminated 后不可复用；
 * - 模型从数据目录 models/<id>/ 本地加载（worker 侧 env.allowRemoteModels=false）；
 * - channel 可注入（测试缝）：smoke 用假通道验证协议与状态机，不触真模型；
 * - callOpts.timeoutMs 经 Promise.race 钳制（迟到回复按 id 丢弃——推理在
 *   worker 线程无法真正取消，但主线程可以停止等待并降级 FTS）；
 * - 池化方式来自模型目录（BGE 系 CLS / Gemma 系 MEAN），normalize 交给
 *   pipeline 内建 L2 归一（与远程路径的 sanitizeAndNormalize 语义一致）。
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { MemoryLogger } from '../types.js';
import type { CatalogEntry } from './model-catalog.js';
import type { EmbedCallOptions, EmbeddingProviderInfo, EmbeddingService } from './embedding.js';

type LocalState = 'idle' | 'loading' | 'ready' | 'failed' | 'terminated';

/** worker 启动参数（workerData；构造后不可变）。 */
export interface EmbedWorkerData {
  runtimeDir: string;
  modelDir: string;
  pooling: 'cls' | 'mean';
  dtype: string;
  maxInputChars: number;
}

/** 主线程 → worker 的调用（id 由通道分配）。 */
export type EmbedWorkerCall =
  | { type: 'ping' }
  | { type: 'warmup' }
  | { type: 'embed'; texts: string[]; priority: boolean };

/** worker → 主线程的应答。 */
export type EmbedWorkerReply =
  | { id: number; ok: true; type: 'pong' }
  | { id: number; ok: true; type: 'ready' }
  | { id: number; ok: true; type: 'embedded'; vectors: Float32Array[] }
  | { id: number; ok: false; stage: 'load' | 'infer'; error: string };

/** worker 通道抽象（测试缝：smoke 注入假实现验证协议与状态机）。 */
export interface EmbedWorkerChannel {
  request(call: EmbedWorkerCall): Promise<EmbedWorkerReply>;
  /** 立即终止 worker 并拒绝全部未决请求（close 语义）；幂等。 */
  terminate(): void;
  /** worker 意外崩溃通知（此后所有未决请求已被通道拒绝）。 */
  setOnCrash(cb: (error: string) => void): void;
}

/** 默认 worker 资产路径：dist/store/ → dist/embedding-worker.cjs（构建期拷入）。 */
function defaultWorkerPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'embedding-worker.cjs');
}

/** 真实通道：spawn worker_threads + 自增 id 配对 + 崩溃兜底拒绝。 */
class RealWorkerChannel implements EmbedWorkerChannel {
  private readonly worker: Worker;
  private readonly pending = new Map<number, { resolve: (r: EmbedWorkerReply) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private terminated = false;
  private crashed: string | undefined;
  private crashCb: ((error: string) => void) | undefined;

  constructor(workerPath: string, workerData: EmbedWorkerData) {
    this.worker = new Worker(workerPath, { workerData });
    this.worker.on('message', (msg: EmbedWorkerReply | { type: 'fatal'; error: string }) => {
      if (msg && (msg as { type?: string }).type === 'fatal') {
        this.failAll(`本地嵌入 worker 致命错误: ${(msg as { error?: string }).error ?? '未知'}`);
        return;
      }
      const id = (msg as { id?: number }).id;
      if (typeof id !== 'number') return;
      const entry = this.pending.get(id);
      if (!entry) return; // 迟到回复（调用方已超时放弃）
      this.pending.delete(id);
      entry.resolve(msg as EmbedWorkerReply);
    });
    // error（未捕获异常且 worker 未自处理）与 exit（含 fatal 后的退出）都兜底拒绝
    this.worker.on('error', (err) => this.failAll(`本地嵌入 worker 线程错误: ${err.message}`));
    this.worker.on('exit', (code) => {
      if (!this.terminated) this.failAll(`本地嵌入 worker 线程退出（code=${code}）`);
    });
  }

  request(call: EmbedWorkerCall): Promise<EmbedWorkerReply> {
    // 已释放/已崩溃的通道快速拒绝——postMessage 到死线程是静默无回应，调用方会挂到超时
    if (this.terminated) return Promise.reject(new Error('嵌入 worker 已释放'));
    if (this.crashed) return Promise.reject(new Error(this.crashed));
    const id = this.nextId++;
    return new Promise<EmbedWorkerReply>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...call, id });
    });
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.failAll('嵌入 worker 已释放');
    void this.worker.terminate();
  }

  setOnCrash(cb: (error: string) => void): void {
    this.crashCb = cb;
    // 构造与回调注册之间发生的崩溃（spawn 即失败等）不丢通知
    if (this.crashed) cb(this.crashed);
  }

  private failAll(error: string): void {
    for (const [, entry] of this.pending) entry.reject(new Error(error));
    this.pending.clear();
    if (!this.terminated && !this.crashed) {
      this.crashed = error;
      this.crashCb?.(error);
    }
  }
}

export interface LocalEmbeddingOptions {
  /** 数据目录 runtime/（worker 据此 createRequire 加载 transformers）。 */
  runtimeDir: string;
  /** worker 资产路径（默认 dist/embedding-worker.cjs；测试可显式指定）。 */
  workerPath?: string;
  /** 通道注入缝（测试用；缺省 spawn 真实 worker）。 */
  channel?: EmbedWorkerChannel;
  logger?: MemoryLogger;
  maxInputChars?: number;
}

export class LocalEmbeddingService implements EmbeddingService {
  private state: LocalState = 'idle';
  private loadError: string | null = null;
  private readonly channel: EmbedWorkerChannel;
  private readonly entry: CatalogEntry;
  private readonly logger?: MemoryLogger;

  constructor(entry: CatalogEntry, modelDir: string, opts: LocalEmbeddingOptions) {
    this.entry = entry;
    this.logger = opts.logger;
    const maxInputChars = opts.maxInputChars && opts.maxInputChars > 0 ? opts.maxInputChars : 5000;
    this.channel =
      opts.channel ??
      new RealWorkerChannel(opts.workerPath ?? defaultWorkerPath(), {
        runtimeDir: opts.runtimeDir,
        modelDir,
        pooling: entry.pooling,
        dtype: 'q8',
        maxInputChars,
      });
    // 崩溃不自愈（换源/重启恢复）：拒绝语义沿 EmbedHelper 降级链走 FTS
    this.channel.setOnCrash((error) => {
      if (this.state === 'terminated') return;
      this.state = 'failed';
      this.loadError = error;
      this.logger?.warn(`[memory] ${error}（本地嵌入转入 failed 态，换源或重启可恢复）`);
    });
  }

  getDimensions(): number {
    return this.entry.dims;
  }

  getProviderInfo(): EmbeddingProviderInfo {
    // dimensions 语义与远程路径一致（sqlite.ts 的 providerInfo 比对含维度）
    return { provider: 'local', model: this.entry.id, dimensions: this.entry.dims };
  }

  isReady(): boolean {
    return this.state === 'ready';
  }

  /** 状态（进度展示用）。 */
  getState(): LocalState {
    return this.state;
  }

  getLoadError(): string | null {
    return this.loadError;
  }

  /** 后台预热：启动后让 worker 立即加载模型（幂等；失败态可重试）。 */
  startWarmup(): void {
    void this.waitForReady().catch(() => {});
  }

  /** 等待模型就绪（warmup 协议；applyChain 的 warming 阶段与测试用）。 */
  async waitForReady(): Promise<void> {
    if (this.state === 'ready') return;
    if (this.state === 'terminated') {
      throw new Error('本地嵌入服务已释放（嵌入源已切换）；本实例不可复用');
    }
    if (this.state !== 'failed') this.state = 'loading';
    const reply = await this.channel.request({ type: 'warmup' });
    if (!reply.ok) {
      this.applyLoadFailure(reply.error);
      throw new Error(reply.error);
    }
    this.markReady();
  }

  async embed(text: string, callOpts?: EmbedCallOptions): Promise<Float32Array> {
    const [vec] = await this.embedBatch([text], callOpts);
    return vec;
  }

  async embedBatch(texts: string[], callOpts?: EmbedCallOptions): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    if (this.state === 'terminated') {
      throw new Error('本地嵌入服务已释放（嵌入源已切换）；本实例不可复用');
    }
    if (this.state === 'failed') {
      // 只有明确失败过的服务才抛错（EmbedHelper 捕获后降级 FTS）；warmup 可重试
      throw new Error(`本地嵌入模型加载失败: ${this.loadError ?? '未知原因'}（重启插件或重新下载模型可重试）`);
    }
    if (this.state !== 'ready') this.state = 'loading';
    // 单条请求（召回 query）带优先标记：worker 侧插队，不被 reindex 批次堵队尾
    const reply = await this.requestWithTimeout(
      { type: 'embed', texts, priority: texts.length === 1 },
      callOpts?.timeoutMs,
    );
    if (!reply.ok) {
      if (reply.stage === 'load') this.applyLoadFailure(reply.error);
      else this.markReady(); // 推理失败说明模型已加载成功（loading → ready），失败只属于这一次调用
      throw new Error(reply.error);
    }
    if (reply.type !== 'embedded') throw new Error(`嵌入 worker 返回异常消息类型: ${reply.type}`);
    this.markReady();
    for (const v of reply.vectors) {
      if (v.length !== this.entry.dims) {
        throw new Error(`本地嵌入维度不匹配：期望 ${this.entry.dims}，得到 ${v.length}`);
      }
    }
    return reply.vectors;
  }

  /** 释放 worker 线程与模型（嵌入源切走/关闭时调用；幂等）。terminated 后不可
   *  再复用——防止插件卸载/切走后残留的重嵌循环把模型重新加载常驻（内存泄漏）。 */
  close(): void {
    this.state = 'terminated';
    this.loadError = null;
    this.channel.terminate();
  }

  /** 内层钳制（仅缩短）：超时放弃等待（迟到回复由通道按 id 丢弃），调用方降级。 */
  private async requestWithTimeout(call: EmbedWorkerCall, timeoutMs?: number): Promise<EmbedWorkerReply> {
    if (!(timeoutMs && timeoutMs > 0)) return this.channel.request(call);
    return await Promise.race([
      this.channel.request(call),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`本地嵌入调用超时（${timeoutMs}ms），已放弃等待`)), timeoutMs);
      }),
    ]);
  }

  /** loading → ready 一次性日志（memory.log 时序可读性：启动到模型就绪的间隔）。 */
  private markReady(): void {
    if (this.state === 'ready') return;
    this.state = 'ready';
    this.logger?.info(
      `[memory] 本地嵌入模型就绪: ${this.entry.id}（dims=${this.entry.dims}，pooling=${this.entry.pooling}）`,
    );
  }

  private applyLoadFailure(error: string): void {
    this.state = 'failed';
    this.loadError = error;
    this.logger?.warn(`[memory] 本地嵌入模型加载失败（${this.entry.id}）: ${error}`);
  }
}
