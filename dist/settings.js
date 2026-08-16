import Schema from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
const NS = settingsNamespace('dsh-memory');
const ALWAYS_ON = { enabled: true, capture: true, distill: true, recall: true, reasoningEffort: '' };
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
    const tryAttach = () => {
        const settings = ctx.get('settings');
        if (!settings)
            return false;
        try {
            const scope = settings.register(NS, liveSettingsSchema(), { applies: 'live' });
            let current = resolveSettings(scope.get());
            scope.watch((next) => {
                const prev = current;
                current = resolveSettings(next);
                logger.info(`[memory] 记忆模式开关更新：总=${current.enabled} 捕获=${current.capture} 蒸馏=${current.distill} 召回=${current.recall}` +
                    `，蒸馏思考=${current.reasoningEffort || '跟随配置'}（此前 总=${prev.enabled}）`);
            });
            inner = {
                supported: true,
                get: () => current,
                update: async (patch) => {
                    await scope.update(patch);
                },
            };
            logger.info(`[memory] 记忆模式开关就绪（settings 命名空间 dsh-memory，当前：总=${current.enabled} 捕获=${current.capture} 蒸馏=${current.distill} 召回=${current.recall}` +
                `，蒸馏思考=${current.reasoningEffort || '跟随配置'}）`);
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
