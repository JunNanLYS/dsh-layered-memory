export class LocalEmbeddingService {
    state = 'idle';
    extractor = null;
    loadPromise = null;
    loadError = null;
    modelDir;
    entry;
    loader;
    logger;
    constructor(entry, modelDir, loader, logger) {
        this.entry = entry;
        this.modelDir = modelDir;
        this.loader = loader;
        this.logger = logger;
    }
    getDimensions() {
        return this.entry.dims;
    }
    getProviderInfo() {
        // dimensions 语义与远程路径一致（sqlite.ts 的 providerInfo 比对含维度）
        return { provider: 'local', model: this.entry.id, dimensions: this.entry.dims };
    }
    isReady() {
        return this.state === 'ready' && this.extractor !== null;
    }
    /** 状态（进度展示用）。 */
    getState() {
        return this.state;
    }
    getLoadError() {
        return this.loadError;
    }
    /** 后台预热：下载完成后验证可加载性（幂等；失败态可重试）。 */
    startWarmup() {
        void this.ensureLoaded();
    }
    /** 等待预热完成（测试用）。 */
    async waitForReady() {
        await this.ensureLoaded();
    }
    async embed(text) {
        const [vec] = await this.embedBatch([text]);
        return vec;
    }
    async embedBatch(texts) {
        if (texts.length === 0)
            return [];
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
        const out = [];
        // CPU 推理逐条最稳（ORT session 内部并行），量级为本插件写入/重嵌批（≤16）没问题
        for (const text of texts) {
            const result = await this.extractor([text.slice(0, 5000)], { pooling: this.entry.pooling, normalize: true });
            out.push(new Float32Array(result[0].data));
        }
        return out;
    }
    /** 释放模型（嵌入源切走/关闭时调用；幂等）。terminated 后不可再复用——
     * 防止插件卸载/切走后残留的重嵌循环把模型重新加载常驻（内存泄漏）。 */
    close() {
        const ext = this.extractor;
        this.extractor = null;
        this.loadPromise = null;
        this.state = 'terminated';
        this.loadError = null;
        try {
            const dispose = ext?.dispose;
            if (dispose)
                void Promise.resolve(dispose.call(ext));
        }
        catch {
            /* 释放失败不影响状态复位 */
        }
    }
    async ensureLoaded() {
        if (this.state === 'ready')
            return;
        if (this.state === 'loading' && this.loadPromise)
            return this.loadPromise;
        this.state = 'loading';
        this.loadError = null;
        this.loadPromise = (async () => {
            try {
                const mod = await this.loader();
                if (mod.env) {
                    mod.env.allowRemoteModels = false;
                    if (mod.env.allowLocalModels !== undefined)
                        mod.env.allowLocalModels = true;
                }
                const extractor = await mod.pipeline('feature-extraction', this.modelDir, { dtype: 'q8' });
                // loading 中被 close()（terminated）：不得覆写状态复活（review C）——直接释放丢弃
                if (this.state === 'terminated') {
                    const dispose = extractor.dispose;
                    if (dispose)
                        void Promise.resolve(dispose.call(extractor)).catch(() => { });
                    throw new Error('加载期间服务已释放');
                }
                this.extractor = extractor;
                this.state = 'ready';
                this.logger?.info(`[memory] 本地嵌入模型就绪: ${this.entry.id}（dims=${this.entry.dims}，pooling=${this.entry.pooling}）`);
            }
            catch (err) {
                this.state = 'failed';
                this.loadError = err instanceof Error ? err.message : String(err);
                this.logger?.warn(`[memory] 本地嵌入模型加载失败（${this.entry.id}）: ${this.loadError}`);
                throw err;
            }
        })();
        return this.loadPromise;
    }
}
