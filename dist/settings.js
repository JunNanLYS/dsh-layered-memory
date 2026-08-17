import Schema from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
const NS = settingsNamespace('dsh-memory');
const ALWAYS_ON = { enabled: true, capture: true, distill: true, recall: true, reasoningEffort: '' };
/**
 * 进程内 scope 复用（fiber 重启重挂）。
 * dsh-settings 的 register 把注册挂在其**服务自身 ctx** 的 effect 上
 * （node_modules/@deepseek-ai/dsh-settings/lib/index.js：`this.ctx.effect(...)`），
 * 不随本插件 fiber 销毁——fiber 重启后二次 register 会抛
 * `settings namespace "dsh-memory" is already registered`。模块级状态在
 * fiber 重启间存活：复用上次注册的 scope 并重挂 watcher，否则开关读写停在
 * stub、用户已存开关被静默忽略直到重启进程。
 */
let cachedScope;
let cachedUnwatch;
export function liveSettingsSchema() {
    return Schema.object({
        enabled: Schema.boolean().default(true),
        capture: Schema.boolean().default(true),
        distill: Schema.boolean().default(true),
        recall: Schema.boolean().default(true),
        reasoningEffort: Schema.union(['', 'off', 'high', 'max']).default(''),
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
            logger.info(`[memory] 记忆模式开关更新：总=${current.enabled} 捕获=${current.capture} 蒸馏=${current.distill} 召回=${current.recall}` +
                `，蒸馏思考=${current.reasoningEffort || '跟随配置'}（此前 总=${prev.enabled}）`);
        });
        return {
            supported: true,
            get: () => current,
            update: async (patch) => {
                await scope.update(patch);
            },
        };
    };
    const tryAttach = () => {
        const settings = ctx.get('settings');
        if (!settings)
            return false;
        if (cachedScope) {
            inner = wireScope(cachedScope);
            const c = inner.get();
            logger.info(`[memory] 记忆模式开关重挂（复用进程内注册，当前：总=${c.enabled} 捕获=${c.capture} 蒸馏=${c.distill} 召回=${c.recall}` +
                `，蒸馏思考=${c.reasoningEffort || '跟随配置'}）`);
            return true;
        }
        try {
            const scope = settings.register(NS, liveSettingsSchema(), { applies: 'live' });
            cachedScope = scope;
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
        ctx.on('internal/service', (name) => {
            if (name === 'settings' && !inner.supported)
                tryAttach();
        });
    }
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
        return { ...ALWAYS_ON };
    const v = value;
    const efforts = ['', 'off', 'high', 'max'];
    return {
        enabled: v.enabled !== false,
        capture: v.capture !== false,
        distill: v.distill !== false,
        recall: v.recall !== false,
        reasoningEffort: typeof v.reasoningEffort === 'string' && efforts.includes(v.reasoningEffort)
            ? v.reasoningEffort
            : '',
    };
}
