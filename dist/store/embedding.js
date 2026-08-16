/** 空实现：向量能力关闭/不可用时使用，一切调用安全返回。 */
export class NoopEmbeddingService {
    getDimensions() {
        return 0;
    }
    getProviderInfo() {
        return { provider: 'noop', model: 'disabled', dimensions: 0 };
    }
    isReady() {
        return false;
    }
    async embed() {
        return new Float32Array(0);
    }
    async embedBatch(texts) {
        return texts.map(() => new Float32Array(0));
    }
}
/**
 * OpenAI 兼容远程 embedding：POST {baseUrl}/embeddings。
 * 向量在客户端做 L2 归一化（与余弦度量配套，照搬官方 sanitizeAndNormalize）。
 */
export class RemoteEmbeddingService {
    opts;
    constructor(opts) {
        this.opts = { maxInputChars: 5000, timeoutMs: 10_000, ...opts };
    }
    getDimensions() {
        return this.opts.dimensions;
    }
    getProviderInfo() {
        return { provider: 'remote', model: this.opts.model, dimensions: this.opts.dimensions };
    }
    isReady() {
        return true;
    }
    async embed(text) {
        const [vec] = await this.embedBatch([text]);
        return vec;
    }
    async embedBatch(texts) {
        if (texts.length === 0)
            return [];
        const input = texts.map((t) => t.slice(0, this.opts.maxInputChars));
        const base = this.opts.baseUrl.replace(/\/+$/, '');
        const res = await fetch(`${base}/embeddings`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${this.opts.apiKey}`,
            },
            body: JSON.stringify({ model: this.opts.model, input }),
            signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`embeddings HTTP ${res.status}: ${body.slice(0, 200)}`);
        }
        const json = (await res.json());
        const data = json.data ?? [];
        if (data.length !== texts.length) {
            throw new Error(`embeddings 返回数量不匹配：期望 ${texts.length}，得到 ${data.length}`);
        }
        // 按 index 还原顺序（部分服务商不保序）
        const byIndex = new Map();
        for (const d of data)
            byIndex.set(d.index, d.embedding);
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
function sanitizeAndNormalize(vec) {
    const arr = Array.from(vec).map((v) => (Number.isFinite(v) ? v : 0));
    const magnitude = Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0));
    if (magnitude < 1e-10)
        return new Float32Array(arr);
    return new Float32Array(arr.map((v) => v / magnitude));
}
/**
 * 嵌入调用降级助手（L0/L1 Store 共用）：查询向量失败 → undefined（调用方降级 FTS）；
 * 批量嵌入失败 → 全 undefined（跳过向量写入，由周期性 backfill 补齐）。
 * 同类失败只告警一次，避免刷屏。
 */
export class EmbedHelper {
    embed;
    logger;
    warned = false;
    constructor(embed, logger) {
        this.embed = embed;
        this.logger = logger;
    }
    vectorReady() {
        return this.embed.isReady();
    }
    /** 查询向量；失败或空向量返回 undefined（调用方降级 FTS）。 */
    async query(text) {
        try {
            const vec = await this.embed.embed(text);
            return vec.length > 0 ? vec : undefined;
        }
        catch (err) {
            this.warn(`查询向量计算失败，降级 FTS: ${errMsg(err)}`);
            return undefined;
        }
    }
    /** 批量嵌入；服务未就绪或失败时返回全 undefined（不阻断元数据/FTS 写入）。 */
    async batch(texts) {
        if (!this.embed.isReady())
            return texts.map(() => undefined);
        try {
            return await this.embed.embedBatch(texts);
        }
        catch (err) {
            this.warn(`批量嵌入失败，本批暂不写向量（后台 backfill 会补齐）: ${errMsg(err)}`);
            return texts.map(() => undefined);
        }
    }
    warn(msg) {
        if (this.warned)
            return;
        this.warned = true;
        this.logger?.warn(`[memory] ${msg}`);
    }
}
function errMsg(err) {
    return err instanceof Error ? err.message : String(err);
}
