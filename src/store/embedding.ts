/**
 * Embedding 服务（移植 MemoryCore embedding.ts 的裁剪版，仅保留远程 OpenAI 兼容实现）。
 * dsh 的 ctx.llm 只有 chat 流式接口、无 embeddings 端点，因此向量能力
 * 需要用户自备任意 OpenAI 兼容 /embeddings 服务（OpenAI/SiliconFlow/Jina/自托管 BGE 等）。
 * 默认关闭（Noop）——纯 FTS 模式即可运行，这是官方 provider="none" 的同款语义。
 */
import type { MemoryLogger } from '../types.js';

export interface EmbeddingProviderInfo {
  provider: string;
  model: string;
  dimensions: number;
}

/** 单次嵌入调用的可选参数：timeoutMs 只允许缩短服务配置的超时（内层钳制），
 *  永不放大——召回路径用它给 FTS 降级留时间（规格 A 节）。本地实现经 worker
 *  代理以 Promise.race 钳制（迟到回复丢弃，推理在 worker 线程无法真正取消）。 */
export interface EmbedCallOptions {
  timeoutMs?: number;
}

export interface EmbeddingService {
  embed(text: string, callOpts?: EmbedCallOptions): Promise<Float32Array>;
  embedBatch(texts: string[], callOpts?: EmbedCallOptions): Promise<Float32Array[]>;
  getDimensions(): number;
  getProviderInfo(): EmbeddingProviderInfo;
  isReady(): boolean;
  close?(): void;
}

/** 空实现：向量能力关闭/不可用时使用，一切调用安全返回。 */
export class NoopEmbeddingService implements EmbeddingService {
  getDimensions(): number {
    return 0;
  }
  getProviderInfo(): EmbeddingProviderInfo {
    return { provider: 'noop', model: 'disabled', dimensions: 0 };
  }
  isReady(): boolean {
    return false;
  }
  async embed(): Promise<Float32Array> {
    return new Float32Array(0);
  }
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map(() => new Float32Array(0));
  }
}

export interface RemoteEmbeddingOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 必填且须与模型输出一致（vec0 建表需要固定维度）。 */
  dimensions: number;
  maxInputChars?: number;
  timeoutMs?: number;
  logger?: MemoryLogger;
}

/**
 * OpenAI 兼容远程 embedding：POST {baseUrl}/embeddings。
 * 向量在客户端做 L2 归一化（与余弦度量配套，照搬官方 sanitizeAndNormalize）。
 */
export class RemoteEmbeddingService implements EmbeddingService {
  private readonly opts: Required<Pick<RemoteEmbeddingOptions, 'maxInputChars' | 'timeoutMs'>> &
    RemoteEmbeddingOptions;

  constructor(opts: RemoteEmbeddingOptions) {
    this.opts = { maxInputChars: 5000, timeoutMs: 10_000, ...opts };
  }

  getDimensions(): number {
    return this.opts.dimensions;
  }

  getProviderInfo(): EmbeddingProviderInfo {
    return { provider: 'remote', model: this.opts.model, dimensions: this.opts.dimensions };
  }

  isReady(): boolean {
    return true;
  }

  async embed(text: string, callOpts?: EmbedCallOptions): Promise<Float32Array> {
    const [vec] = await this.embedBatch([text], callOpts);
    return vec;
  }

  async embedBatch(texts: string[], callOpts?: EmbedCallOptions): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const input = texts.map((t) => t.slice(0, this.opts.maxInputChars));
    const base = this.opts.baseUrl.replace(/\/+$/, '');
    // 内层钳制只缩短不放大：召回路径传短超时，给 FTS 降级留时间
    const timeoutMs = Math.min(this.opts.timeoutMs, callOpts?.timeoutMs ?? this.opts.timeoutMs);
    const res = await fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({ model: this.opts.model, input }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`embeddings HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ index: number; embedding: number[] }>;
    };
    const data = json.data ?? [];
    if (data.length !== texts.length) {
      throw new Error(`embeddings 返回数量不匹配：期望 ${texts.length}，得到 ${data.length}`);
    }
    // 按 index 还原顺序（部分服务商不保序）
    const byIndex = new Map<number, number[]>();
    for (const d of data) byIndex.set(d.index, d.embedding);
    return input.map((_, i) => {
      const raw = byIndex.get(i);
      if (!raw || raw.length !== this.opts.dimensions) {
        throw new Error(`embedding 维度不匹配：期望 ${this.opts.dimensions}，得到 ${raw?.length ?? 0}`);
      }
      return sanitizeAndNormalize(raw);
    });
  }
}

/** 清洗 NaN/Inf 并 L2 归一化（零向量原样返回，写入侧会跳过）。 */
function sanitizeAndNormalize(vec: number[] | Float32Array): Float32Array {
  const arr = Array.from(vec).map((v) => (Number.isFinite(v) ? v : 0));
  const magnitude = Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0));
  if (magnitude < 1e-10) return new Float32Array(arr);
  return new Float32Array(arr.map((v) => v / magnitude));
}

/**
 * 嵌入调用降级助手（L0/L1 Store 共用）：查询向量失败 → undefined（调用方降级 FTS）；
 * 批量嵌入失败 → 全 undefined（跳过向量写入，由周期性 backfill 补齐）。
 * 同类失败只告警一次，避免刷屏。
 */
export class EmbedHelper {
  private warned = false;

  constructor(
    private embed: EmbeddingService,
    private readonly logger?: MemoryLogger,
  ) {}

  /** 活切换嵌入源（D4/D5）：换掉底层服务并复位一次性告警（新服务重新获得告警机会）。 */
  setService(svc: EmbeddingService): void {
    this.embed = svc;
    this.warned = false;
  }

  vectorReady(): boolean {
    return this.embed.isReady();
  }

  /** 查询向量；失败或空向量返回 undefined（调用方降级 FTS）。
   *  timeoutMs 为内层钳制（仅缩短服务超时），召回路径使用。 */
  async query(text: string, timeoutMs?: number): Promise<Float32Array | undefined> {
    try {
      const vec = await this.embed.embed(text, timeoutMs != null ? { timeoutMs } : undefined);
      return vec.length > 0 ? vec : undefined;
    } catch (err) {
      this.warn(`查询向量计算失败，降级 FTS: ${errMsg(err)}`);
      return undefined;
    }
  }

  /** 批量嵌入；服务未就绪或失败时返回全 undefined（不阻断元数据/FTS 写入）。 */
  async batch(texts: string[]): Promise<Array<Float32Array | undefined>> {
    if (!this.embed.isReady()) return texts.map(() => undefined);
    try {
      return await this.embed.embedBatch(texts);
    } catch (err) {
      this.warn(`批量嵌入失败，本批暂不写向量（后台 backfill 会补齐）: ${errMsg(err)}`);
      return texts.map(() => undefined);
    }
  }

  private warn(msg: string): void {
    if (this.warned) return;
    this.warned = true;
    this.logger?.warn(`[memory] ${msg}`);
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
