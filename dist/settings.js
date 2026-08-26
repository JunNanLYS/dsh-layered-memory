import Schema from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { EFFORT_CHOICES } from './config.js';
/**
 * 运行时统一路由链条目：[0] = 主路由（provider/model 双空 = 跟随默认模型），
 * [1..] = 回退链（按序降级）；reasoningEffort 为该路由的档位覆盖（'' = 跟随部署全局）。
 */
/** 运行时路由链上限（写入门与 UI 同限，防误粘贴巨数组撑爆 settings 存储）。 */
export const DISTILL_CHAIN_MAX = 8;
/**
 * 运行时统一路由链的**展示投影**（llm-providers 的 chain.current 数据源）：
 * distillChain 非空即原样返回；为空时投影旧运行时键（distillProvider/distillModel
 * 成对 → 单行主路由，旧档位 reasoningEffort 作为该主路由的档位——旧语义里它
 * 作用的就是当时唯一的路由）。注意：生效逻辑（effectiveCfg）只认显式
 * distillChain、不走本投影——旧键路径在未配链时按旧语义原样生效。
 */
export function projectDistillChain(s) {
    if (s?.distillChain?.length)
        return s.distillChain;
    if (s?.distillProvider && s?.distillModel) {
        return [{ provider: s.distillProvider, model: s.distillModel, reasoningEffort: s.reasoningEffort || '' }];
    }
    return [];
}
/** settings-set 写入门校验：返回错误文案（null = 通过）。 */
export function validateDistillChain(chain) {
    if (!Array.isArray(chain))
        return 'distillChain 须为数组';
    if (chain.length > DISTILL_CHAIN_MAX)
        return `路由链最多 ${DISTILL_CHAIN_MAX} 条`;
    const seen = new Set();
    for (let i = 0; i < chain.length; i++) {
        if (!chain[i] || typeof chain[i] !== 'object')
            return `第 ${i + 1} 行须为对象`;
        const e = chain[i];
        const p = typeof e.provider === 'string' ? e.provider : '';
        const m = typeof e.model === 'string' ? e.model : '';
        const eff = typeof e.reasoningEffort === 'string' ? e.reasoningEffort : '';
        if (p.length > 200 || m.length > 200)
            return `第 ${i + 1} 行 provider/model 过长（≤200 字符）`;
        if (!EFFORT_CHOICES.includes(eff))
            return `第 ${i + 1} 行思考档位非法: ${eff || '(空)'}`;
        if (i === 0) {
            if ((p && !m) || (!p && m))
                return '主路由行 provider 与 model 须成对（双空 = 跟随默认模型）';
        }
        else if (!p || !m) {
            return `第 ${i + 1} 行回退路由必须显式选择供应商与模型`;
        }
        if (p && m) {
            const key = `${p}::${m}`;
            if (seen.has(key))
                return `第 ${i + 1} 行与前面的路由重复（${p}/${m}）`;
            seen.add(key);
        }
    }
    return null;
}
const NS = settingsNamespace('dsh-memory');
const ALWAYS_ON = {
    enabled: true,
    capture: true,
    distill: true,
    recall: true,
    reasoningEffort: '',
    distillProvider: '',
    distillModel: '',
    distillChain: [],
    distillBudgets: { extract: 0, dedup: 0, l2: 0, l3: 0 },
    distillMaxInputChars: 0,
};
/**
 * 进程内 scope 复用（fiber 重启重挂）。
 * dsh-settings 的 register 把注册挂在其**服务自身 ctx** 的 effect 上
 * （node_modules/@deepseek-ai/dsh-settings/lib/index.js：`this.ctx.effect(...)`），
 * 不随本插件 fiber 销毁——fiber 重启后二次 register 会抛
 * `settings namespace "dsh-memory" is already registered`。模块级状态在
 * fiber 重启间存活：复用上次注册的 scope 并重挂 watcher，否则开关读写停在
 * stub、用户已存开关被静默忽略直到重启进程。
 *
 * 同时按服务实例（cachedSvc）判活：settings 服务自身重启时其注册随服务 ctx
 * 销毁，旧 scope 变死引用（get 返回冻结旧值、update 抛 not registered、
 * watcher 永不触发）——internal/service 携带的新实例与缓存不符时作废缓存、
 * 向新实例重新注册（用户层由服务从磁盘重解析，已存开关不丢）。
 */
let cachedScope;
let cachedUnwatch;
let cachedSvc;
export function liveSettingsSchema() {
    const budget = () => Schema.number().min(0).max(1_000_000).default(0);
    return Schema.object({
        enabled: Schema.boolean().default(true),
        capture: Schema.boolean().default(true),
        distill: Schema.boolean().default(true),
        recall: Schema.boolean().default(true),
        reasoningEffort: Schema.union([...EFFORT_CHOICES]).default(''),
        distillProvider: Schema.string().default(''),
        distillModel: Schema.string().default(''),
        distillChain: Schema.array(Schema.object({
            provider: Schema.string().default(''),
            model: Schema.string().default(''),
            reasoningEffort: Schema.union([...EFFORT_CHOICES]).default(''),
        })).default([]),
        distillBudgets: Schema.object({
            extract: budget(),
            dedup: budget(),
            l2: budget(),
            l3: budget(),
        }).default({ extract: 0, dedup: 0, l2: 0, l3: 0 }),
        distillMaxInputChars: Schema.number().min(0).max(1_000_000).default(0),
    });
}
export function registerLiveSettings(ctx, logger) {
    // settings 服务可能晚于插件就绪（provider 先读盘再发布）：先探测，未上线则监听补挂
    let inner = {
        supported: false,
        get: () => ALWAYS_ON,
        update: () => Promise.reject(new Error('settings 服务不可用')),
    };
    /** 挂接一个（新注册或复用的）scope：重挂前先摘旧 watcher，防跨重启累积。 */
    const wireScope = (scope) => {
        cachedUnwatch?.();
        let current = resolveSettings(scope.get());
        cachedUnwatch = scope.watch((next) => {
            const prev = current;
            current = resolveSettings(next);
            const b = current.distillBudgets;
            const budgetNote = (b.extract || b.dedup || b.l2 || b.l3)
                ? `，输出预算=抽取 ${b.extract || '默认'}/去重 ${b.dedup || '默认'}/L2 ${b.l2 || '默认'}/L3 ${b.l3 || '默认'}`
                : '';
            const inputNote = current.distillMaxInputChars > 0 ? `，输入预算=${current.distillMaxInputChars}` : '';
            logger.info(`[memory] 记忆模式开关更新：总=${current.enabled} 捕获=${current.capture} 蒸馏=${current.distill} 召回=${current.recall}` +
                `，蒸馏思考=${current.reasoningEffort || '跟随配置'}（此前 总=${prev.enabled}）` +
                (current.distillProvider && current.distillModel
                    ? `，蒸馏模型=${current.distillProvider}/${current.distillModel}`
                    : '') + budgetNote + inputNote);
        });
        return {
            supported: true,
            get: () => current,
            update: async (patch) => {
                await scope.update(patch);
            },
        };
    };
    /** 作废进程内缓存（服务下线/实例替换时旧注册已随服务销毁）。 */
    const invalidateCache = () => {
        cachedScope = undefined;
        cachedSvc = undefined;
        cachedUnwatch?.();
        cachedUnwatch = undefined;
    };
    const tryAttach = () => {
        const settings = ctx.get('settings');
        if (!settings)
            return false;
        // 仅当缓存来自同一服务实例时才可复用——换了实例（服务重启/替换）就重新注册
        if (cachedScope && cachedSvc === settings) {
            try {
                inner = wireScope(cachedScope);
                const c = inner.get();
                logger.info(`[memory] 记忆模式开关重挂（复用进程内注册，当前：总=${c.enabled} 捕获=${c.capture} 蒸馏=${c.distill} 召回=${c.recall}` +
                    `，蒸馏思考=${c.reasoningEffort || '跟随配置'}）`);
                return true;
            }
            catch (err) {
                logger.warn(`[memory] 记忆模式开关缓存复用失败，改为重新注册: ${err instanceof Error ? err.message : String(err)}`);
                invalidateCache();
            }
        }
        try {
            const scope = settings.register(NS, liveSettingsSchema(), { applies: 'live' });
            cachedScope = scope;
            cachedSvc = settings;
            inner = wireScope(scope);
            logger.info(`[memory] 记忆模式开关就绪（settings 命名空间 dsh-memory，当前：总=${inner.get().enabled} 捕获=${inner.get().capture} 蒸馏=${inner.get().distill} 召回=${inner.get().recall}` +
                `，蒸馏思考=${inner.get().reasoningEffort || '跟随配置'}）`);
            return true;
        }
        catch (err) {
            logger.warn(`[memory] 记忆模式开关注册失败（保持全开）: ${err instanceof Error ? err.message : String(err)}`);
            return true; // 已拿到服务但注册失败，不再重试
        }
    };
    if (!tryAttach()) {
        logger.warn('[memory] settings 服务未就绪，记忆模式开关暂不可用（保持全开，等待服务上线）');
    }
    // 无论初始是否成功都监听服务迁移：下线 → 作废缓存；换实例 → 作废后立即重挂
    // （此前监听仅在初始失败时注册，服务替换场景下没有任何自愈路径）
    ctx.on('internal/service', (name, impl) => {
        if (name !== 'settings')
            return;
        if (!impl) {
            if (cachedSvc !== undefined) {
                invalidateCache();
                logger.warn('[memory] settings 服务下线，开关缓存已作废（期间读数为冻结值，恢复后自动重挂）');
            }
            return;
        }
        // 实例变了才作废缓存；但 tryAttach 无条件执行（幂等）——同一事件会广播到
        // 所有存活 fiber 的监听器，后跑的那个也必须修好自己闭包里的 inner
        if (impl !== cachedSvc)
            invalidateCache();
        tryAttach();
    });
    return {
        get supported() {
            return inner.supported;
        },
        get: () => inner.get(),
        update: (patch) => inner.update(patch),
    };
}
/** scope.get() 的防御性解析：异常值回退全开（宁可多记不可静默停摆）。 */
function resolveSettings(value) {
    if (!value || typeof value !== 'object')
        return { ...ALWAYS_ON, distillChain: [] };
    const v = value;
    const num = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    const rawBudgets = (v.distillBudgets ?? {});
    // 路由链逐条防御：非对象条目剔除、超长截断、非法档位归空、超限截断到上限
    const rawChain = Array.isArray(v.distillChain) ? v.distillChain : [];
    const chain = [];
    for (const item of rawChain) {
        if (chain.length >= DISTILL_CHAIN_MAX)
            break;
        if (!item || typeof item !== 'object')
            continue;
        const e = item;
        const eff = typeof e.reasoningEffort === 'string' && EFFORT_CHOICES.includes(e.reasoningEffort)
            ? e.reasoningEffort
            : '';
        chain.push({
            provider: typeof e.provider === 'string' ? e.provider.slice(0, 200) : '',
            model: typeof e.model === 'string' ? e.model.slice(0, 200) : '',
            reasoningEffort: eff,
        });
    }
    return {
        enabled: v.enabled !== false,
        capture: v.capture !== false,
        distill: v.distill !== false,
        recall: v.recall !== false,
        reasoningEffort: typeof v.reasoningEffort === 'string' && EFFORT_CHOICES.includes(v.reasoningEffort)
            ? v.reasoningEffort
            : '',
        distillProvider: typeof v.distillProvider === 'string' ? v.distillProvider : '',
        distillModel: typeof v.distillModel === 'string' ? v.distillModel : '',
        distillChain: chain,
        distillBudgets: {
            extract: num(rawBudgets.extract),
            dedup: num(rawBudgets.dedup),
            l2: num(rawBudgets.l2),
            l3: num(rawBudgets.l3),
        },
        distillMaxInputChars: num(v.distillMaxInputChars),
    };
}
