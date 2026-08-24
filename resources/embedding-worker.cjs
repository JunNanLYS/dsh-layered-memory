/**
 * 本地嵌入 worker：transformers.js 的模型加载与推理在本线程执行，主线程只
 * 投递文本、收回向量。onnxruntime-node（v1.24.3）的 run/loadModel 是
 * setImmediate 回调里的同步调用（Promise 包装不卸载计算），留在主线程会
 * 冻结宿主事件循环——dsh 页面一切交互无响应数秒的根因。
 *
 * 协议（与 src/store/local-embedding.ts 的 RealWorkerChannel 配对；自增 id）：
 * - 入向：{id,type:'ping'} | {id,type:'warmup'} | {id,type:'embed',texts,priority}
 * - 出向：{id,ok:true,type:'pong'|'ready'|'embedded',vectors?}（向量经
 *   transfer 列表零拷贝回传）| {id,ok:false,stage:'load'|'infer',error}
 *   | {type:'fatal',error}
 *
 * 调度：单线程串行。embedBatch 拆成逐条 job、条间 setImmediate 让路——
 * 单条请求（priority，即召回 query）unshift 插队，最坏只等"正在算的那一条"，
 * 不会被 reindex 批次（16/32 条 ≈5-10s）堵在队尾。
 *
 * 信任边界（沿 AGENTS.md 0.8.2 审查记录）：runtime/ 目录在数据目录信任边界内，
 * 本线程按其 package.json createRequire 加载 transformers——对数据目录有写
 * 权限的进程理论上可植入恶意模块；模型文件逐文件 sha256 锁定，运行时代码
 * 无同级防护，完整修复需安装指纹设计，暂以文档化假设为准。
 */
'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const { createRequire } = require('node:module');

const cfg = workerData || {};
const RUNTIME_DIR = typeof cfg.runtimeDir === 'string' ? cfg.runtimeDir : '';
const MODEL_DIR = typeof cfg.modelDir === 'string' ? cfg.modelDir : '';
const POOLING = cfg.pooling === 'cls' ? 'cls' : 'mean';
const DTYPE = typeof cfg.dtype === 'string' ? cfg.dtype : 'q8';
const MAX_INPUT_CHARS = cfg.maxInputChars > 0 ? cfg.maxInputChars : 5000;

let extractor = null; // pipeline('feature-extraction', …)
let loadState = 'idle'; // idle | loading | ready | failed
let loadPromise = null;
let loadError = null;

// ── 模型懒加载（首请求触发；失败后经 warmup 可重试，embed 请求失败快返回） ──
function ensureLoaded() {
  if (loadState === 'ready') return Promise.resolve();
  if (loadState === 'loading' && loadPromise) return loadPromise;
  loadState = 'loading';
  loadError = null;
  loadPromise = (async () => {
    try {
      if (!RUNTIME_DIR || !MODEL_DIR) throw new Error('workerData 缺少 runtimeDir/modelDir');
      const req = createRequire(path.join(RUNTIME_DIR, 'package.json'));
      const mod = req('@huggingface/transformers');
      if (mod.env) {
        mod.env.allowRemoteModels = false;
        if (mod.env.allowLocalModels !== undefined) mod.env.allowLocalModels = true;
      }
      extractor = await mod.pipeline('feature-extraction', MODEL_DIR, { dtype: DTYPE });
      loadState = 'ready';
    } catch (err) {
      loadState = 'failed';
      loadError = err && err.message ? err.message : String(err);
      loadPromise = null; // 失败后下一次 warmup 重新走加载
      throw err;
    }
  })();
  return loadPromise;
}

// ── 推理队列（逐条 job；priority 插队；条间让路） ──
const queue = []; // [{ request, index, text }]
let pumping = false;

function postReply(msg, transfer) {
  parentPort.postMessage(msg, transfer || []);
}

/** 请求全部条目完成 → 回执（transfer 向量缓冲零拷贝）。 */
function settle(request) {
  if (request.failed || request.remaining !== 0) return;
  postReply(
    { id: request.id, ok: true, type: 'embedded', vectors: request.vectors },
    request.vectors.map((v) => v.buffer),
  );
}

/** 首个失败即回执错误，并移除该请求尚未开跑的条目（正在跑的至多 1 条，算完即弃）。 */
function failRequest(request, error, stage) {
  if (request.failed) return;
  request.failed = true;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].request === request) queue.splice(i, 1);
  }
  postReply({ id: request.id, ok: false, stage: stage, error: error && error.message ? error.message : String(error) });
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      if (job.request.failed) continue;
      try {
        const result = await extractor([job.text.slice(0, MAX_INPUT_CHARS)], { pooling: POOLING, normalize: true });
        const data = result[0] && result[0].data;
        job.request.vectors[job.index] = data instanceof Float32Array ? data : new Float32Array(data);
        job.request.remaining -= 1;
        settle(job.request);
      } catch (err) {
        failRequest(job.request, err, 'infer');
      }
      // 条间让路：交还本线程事件循环，新消息（含 priority 插队）可在批间被处理
      await new Promise((resolve) => setImmediate(resolve));
    }
  } finally {
    pumping = false;
  }
}

function handleEmbed(msg) {
  const texts = Array.isArray(msg.texts) ? msg.texts : [];
  if (texts.length === 0) {
    postReply({ id: msg.id, ok: true, type: 'embedded', vectors: [] });
    return;
  }
  const request = { id: msg.id, vectors: new Array(texts.length), remaining: texts.length, failed: false };
  // 单条请求（召回 query）插队到队首；批次追加到队尾（批内条目间仍会被后来的插队）
  const priority = msg.priority === true && texts.length === 1;
  for (let i = 0; i < texts.length; i++) {
    const job = { request: request, index: i, text: String(texts[i] == null ? '' : texts[i]) };
    if (priority) queue.unshift(job);
    else queue.push(job);
  }
  void pump();
}

parentPort.on('message', (msg) => {
  if (!msg || typeof msg.id !== 'number' || typeof msg.type !== 'string') return;
  if (msg.type === 'ping') {
    postReply({ id: msg.id, ok: true, type: 'pong' });
    return;
  }
  if (msg.type === 'warmup') {
    ensureLoaded().then(
      () => postReply({ id: msg.id, ok: true, type: 'ready' }),
      () => postReply({ id: msg.id, ok: false, stage: 'load', error: loadError ?? '模型加载失败' }),
    );
    return;
  }
  if (msg.type === 'embed') {
    void (async () => {
      try {
        await ensureLoaded();
      } catch {
        postReply({ id: msg.id, ok: false, stage: 'load', error: loadError ?? '模型加载失败' });
        return;
      }
      handleEmbed(msg);
    })();
    return;
  }
});

// 未捕获异常：尽力通知主线程后强制退出（主线程的 exit 处理会拒绝全部 pending
// 并转入 failed 态）。不保持半死状态——半死的 worker 只会让调用方挂到超时。
process.on('uncaughtException', (err) => {
  try {
    postReply({ type: 'fatal', error: err && err.message ? err.message : String(err) });
  } catch {
    /* 端口已坏，exit 处理兜底 */
  }
  setTimeout(() => process.exit(1), 50);
});
