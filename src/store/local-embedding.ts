/**
 * 本地嵌入服务（D1/D6 决策）：transformers.js + ONNX，进程内 CPU 推理。
 *
 * - 懒加载（D6）：首次嵌入调用才加载模型（下载完成后的预热也走这里），
 *   加载后常驻，close() 释放（嵌入源切走/关闭时调用）；
 * - 模型从数据目录 models/<id>/ 本地加载（env.allowRemoteModels=false 杜绝联网）；
 * - loader 可注入（测试缝）：不依赖真实 transformers.js/模型文件即可测状态机；
 * - 池化方式来自模型目录（BGE 系 CLS / Gemma 系 MEAN），normalize 交给 pipeline
 *   内建 L2 归一（与远程路径的 sanitizeAndNormalize 语义一致）。
 *
 * 注意：真实模型路径的池化正确性（尤其 embeddinggemma 的 mean）属于实现期
 * 待验证项——下载预热后应做一次相似度 sanity 检查（见 PR 验证指引）。
 */
import type { MemoryLogger } from '../types.js';
import type { CatalogEntry } from './model-catalog.js';
import type { EmbeddingProviderInfo, EmbeddingService } from './embedding.js';

/** transformers.js 的 feature-extraction pipeline 最小面（结构化注入缝）。 */
export interface ExtractorLike {
  (texts: string[], opts: { pooling: 'cls' | 'mean'; normalize: boolean }): Promise<Array<{ data: number[] | Float32Array }>>;
  dispose?: () => Promise<void> | void;
}

export interface TransformersModuleLike {
  pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<ExtractorLike>;
  env?: { allowLocalModels?: boolean; allowRemoteModels?: boolean };
}

/** 模块加载器（默认走 RuntimeInstaller.resolveModule；测试注入假模块）。 */
export type ModuleLoader = () => Promise<TransformersModuleLike>;

type LocalState = 'idle' | 'loading' | 'ready' | 'failed' | 'terminated';

export class LocalEmbeddingService implements EmbeddingService {
  private state: LocalState = 'idle';
  private extractor: ExtractorLike | null = null;
  private loadPromise: Promise<void> | null = null;
  private loadError: string | null = null;
  private readonly modelDir: string;
  private readonly entry: CatalogEntry;
  private readonly loader: ModuleLoader;
  private readonly logger?: MemoryLogger;
  /** 输入截断（与远程路径同源的 embedding.maxInputChars 配置，缺省 5000）。 */
  private readonly maxInputChars: number;

  constructor(entry: CatalogEntry, modelDir: string, loader: ModuleLoader, logger?: MemoryLogger, maxInputChars?: number) {
    this.entry = entry;
    this.modelDir = modelDir;
    this.loader = loader;
    this.logger = logger;
    this.maxInputChars = maxInputChars && maxInputChars > 0 ? maxInputChars : 5000;
  }

  getDimensions(): number {
    return this.entry.dims;
  }

  getProviderInfo(): EmbeddingProviderInfo {
    // dimensions 语义与远程路径一致（sqlite.ts 的 providerInfo 比对含维度）
    return { provider: 'local', model: this.entry.id, dimensions: this.entry.dims };
  }

  isReady(): boolean {
    return this.state === 'ready' && this.extractor !== null;
  }

  /** 状态（进度展示用）。 */
  getState(): LocalState {
    return this.state;
  }

  getLoadError(): string | null {
    return this.loadError;
  }

  /** 后台预热：下载完成后验证可加载性（幂等；失败态可重试）。 */
  startWarmup(): void {
    void this.ensureLoaded();
  }

  /** 等待预热完成（测试用）。 */
  async waitForReady(): Promise<void> {
    await this.ensureLoaded();
  }

  async embed(text: string): Promise<Float32Array> {
    const [vec] = await this.embedBatch([text]);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    if (this.state === 'terminated') {
      throw new Error('本地嵌入服务已释放（嵌入源已切换）；本实例不可复用');
    }
    // 首次调用触发懒加载（D6：加载期间调用方等待而非失败——召回只慢这一次）；
    // 只有明确失败过的服务才抛错（EmbedHelper 捕获后降级 FTS）
    if (this.state !== 'ready') {
      if (this.state === 'failed') {
        throw new Error(`本地嵌入模型加载失败: ${this.loadError ?? '未知原因'}（重启插件或重新下载模型可重试）`);
      }
      await this.ensureLoaded();
    }
    const out: Float32Array[] = [];
    // CPU 推理逐条最稳（ORT session 内部并行），量级为本插件写入/重嵌批（≤16）没问题
    for (const text of texts) {
      const result = await this.extractor!([text.slice(0, this.maxInputChars)], { pooling: this.entry.pooling, normalize: true });
      out.push(new Float32Array(result[0].data));
    }
    return out;
  }

  /** 释放模型（嵌入源切走/关闭时调用；幂等）。terminated 后不可再复用——
   * 防止插件卸载/切走后残留的重嵌循环把模型重新加载常驻（内存泄漏）。 */
  close(): void {
    const ext = this.extractor;
    this.extractor = null;
    this.loadPromise = null;
    this.state = 'terminated';
    this.loadError = null;
    try {
      const dispose = ext?.dispose;
      if (dispose) void Promise.resolve(dispose.call(ext));
    } catch {
      /* 释放失败不影响状态复位 */
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.state === 'ready') return;
    if (this.state === 'loading' && this.loadPromise) return this.loadPromise;
    this.state = 'loading';
    this.loadError = null;
    this.loadPromise = (async () => {
      try {
        const mod = await this.loader();
        if (mod.env) {
          mod.env.allowRemoteModels = false;
          if (mod.env.allowLocalModels !== undefined) mod.env.allowLocalModels = true;
        }
        const extractor = await mod.pipeline('feature-extraction', this.modelDir, { dtype: 'q8' });
        // loading 中被 close()（terminated）：不得覆写状态复活（review C）——直接释放丢弃
        if (this.state === 'terminated') {
          const dispose = extractor.dispose;
          if (dispose) void Promise.resolve(dispose.call(extractor)).catch(() => {});
          throw new Error('加载期间服务已释放');
        }
        this.extractor = extractor;
        this.state = 'ready';
        this.logger?.info(`[memory] 本地嵌入模型就绪: ${this.entry.id}（dims=${this.entry.dims}，pooling=${this.entry.pooling}）`);
      } catch (err) {
        this.state = 'failed';
        this.loadError = err instanceof Error ? err.message : String(err);
        this.logger?.warn(`[memory] 本地嵌入模型加载失败（${this.entry.id}）: ${this.loadError}`);
        throw err;
      }
    })();
    return this.loadPromise;
  }
}
