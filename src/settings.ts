/**
 * 记忆模式运行时开关（官方 settings 服务，live 生效）。
 * 语义：静态 config（cordis.patch.yml，部署上限）AND 运行时开关，两者同时开才工作。
 * settings 服务缺失（如 headless）时退化为恒开——行为与无开关版本一致。
 */
import type { Context } from '@deepseek-ai/cordis';
// 纯类型导入：拉入 ctx.settings 的 Context 声明合并
import type {} from '@deepseek-ai/dsh-settings';
import Schema from '@deepseek-ai/schemastery';
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings';
import type { MemoryLogger } from './types.js';

/** 蒸馏思考档位可选项：'' = 跟随静态 config（部署默认）。 */
export type EffortChoice = '' | 'off' | 'high' | 'max';

export interface MemoryLiveSettings {
  /** 总开关：关 = 捕获/蒸馏/召回注入全停（数据保留） */
  enabled: boolean;
  /** L0 捕获（原始对话落盘） */
  capture: boolean;
  /** L1 抽取 + L2/L3 蒸馏 */
  distill: boolean;
  /** 召回注入（画像/记忆上下文） */
  recall: boolean;
  /** 蒸馏思考档位运行时覆盖：'' = 跟随静态 config（llm.reasoningEffort） */
  reasoningEffort: EffortChoice;
  /** 蒸馏模型运行时覆盖（供应商 id，用户已配置的路由）：'' = 跟随静态 config/默认选择。
   *  与 distillModel 成对生效（单字段不算）；部署静态 pin（provider+model 双字段）优先。 */
  distillProvider: string;
  /** 蒸馏模型运行时覆盖（模型 id）：'' = 跟随静态 config/默认选择。 */
  distillModel: string;
}

export interface LiveSettingsHandle {
  /** settings 服务是否可用（不可用时 UI 侧隐藏开关面板） */
  supported: boolean;
  get(): MemoryLiveSettings;
  /** UI 写入入口；不支持时抛错由 RPC 层转成业务错误 */
  update(patch: Partial<MemoryLiveSettings>): Promise<void>;
}

const NS = settingsNamespace('dsh-memory');

const ALWAYS_ON: MemoryLiveSettings = {
  enabled: true,
  capture: true,
  distill: true,
  recall: true,
  reasoningEffort: '',
  distillProvider: '',
  distillModel: '',
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
let cachedScope: SettingsScope<MemoryLiveSettings> | undefined;
let cachedUnwatch: (() => void) | undefined;
let cachedSvc: unknown;

export function liveSettingsSchema(): Schema<MemoryLiveSettings> {
  return Schema.object({
    enabled: Schema.boolean().default(true),
    capture: Schema.boolean().default(true),
    distill: Schema.boolean().default(true),
    recall: Schema.boolean().default(true),
    reasoningEffort: Schema.union(['', 'off', 'high', 'max']).default(''),
    distillProvider: Schema.string().default(''),
    distillModel: Schema.string().default(''),
  });
}

export function registerLiveSettings(ctx: Context, logger: MemoryLogger): LiveSettingsHandle {
  // settings 服务可能晚于插件就绪（provider 先读盘再发布）：先探测，未上线则监听补挂
  let inner: LiveSettingsHandle = {
    supported: false,
    get: () => ALWAYS_ON,
    update: () => Promise.reject(new Error('settings 服务不可用')),
  };

  /** 挂接一个（新注册或复用的）scope：重挂前先摘旧 watcher，防跨重启累积。 */
  const wireScope = (scope: SettingsScope<MemoryLiveSettings>): LiveSettingsHandle => {
    cachedUnwatch?.();
    let current = resolveSettings(scope.get());
    cachedUnwatch = scope.watch((next) => {
      const prev = current;
      current = resolveSettings(next);
      logger.info(
        `[memory] 记忆模式开关更新：总=${current.enabled} 捕获=${current.capture} 蒸馏=${current.distill} 召回=${current.recall}` +
          `，蒸馏思考=${current.reasoningEffort || '跟随配置'}（此前 总=${prev.enabled}）` +
          (current.distillProvider && current.distillModel
            ? `，蒸馏模型=${current.distillProvider}/${current.distillModel}`
            : ''),
      );
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
  const invalidateCache = (): void => {
    cachedScope = undefined;
    cachedSvc = undefined;
    cachedUnwatch?.();
    cachedUnwatch = undefined;
  };

  const tryAttach = (): boolean => {
    const settings = ctx.get('settings');
    if (!settings) return false;
    // 仅当缓存来自同一服务实例时才可复用——换了实例（服务重启/替换）就重新注册
    if (cachedScope && cachedSvc === settings) {
      try {
        inner = wireScope(cachedScope);
        const c = inner.get();
        logger.info(
          `[memory] 记忆模式开关重挂（复用进程内注册，当前：总=${c.enabled} 捕获=${c.capture} 蒸馏=${c.distill} 召回=${c.recall}` +
            `，蒸馏思考=${c.reasoningEffort || '跟随配置'}）`,
        );
        return true;
      } catch (err) {
        logger.warn(`[memory] 记忆模式开关缓存复用失败，改为重新注册: ${err instanceof Error ? err.message : String(err)}`);
        invalidateCache();
      }
    }
    try {
      const scope = settings.register(NS, liveSettingsSchema(), { applies: 'live' });
      cachedScope = scope;
      cachedSvc = settings;
      inner = wireScope(scope);
      logger.info(
        `[memory] 记忆模式开关就绪（settings 命名空间 dsh-memory，当前：总=${inner.get().enabled} 捕获=${inner.get().capture} 蒸馏=${inner.get().distill} 召回=${inner.get().recall}` +
          `，蒸馏思考=${inner.get().reasoningEffort || '跟随配置'}）`,
      );
      return true;
    } catch (err) {
      logger.warn(`[memory] 记忆模式开关注册失败（保持全开）: ${err instanceof Error ? err.message : String(err)}`);
      return true; // 已拿到服务但注册失败，不再重试
    }
  };

  if (!tryAttach()) {
    logger.warn('[memory] settings 服务未就绪，记忆模式开关暂不可用（保持全开，等待服务上线）');
  }
  // 无论初始是否成功都监听服务迁移：下线 → 作废缓存；换实例 → 作废后立即重挂
  // （此前监听仅在初始失败时注册，服务替换场景下没有任何自愈路径）
  ctx.on('internal/service', (name: string, impl: unknown) => {
    if (name !== 'settings') return;
    if (!impl) {
      if (cachedSvc !== undefined) {
        invalidateCache();
        logger.warn('[memory] settings 服务下线，开关缓存已作废（期间读数为冻结值，恢复后自动重挂）');
      }
      return;
    }
    // 实例变了才作废缓存；但 tryAttach 无条件执行（幂等）——同一事件会广播到
    // 所有存活 fiber 的监听器，后跑的那个也必须修好自己闭包里的 inner
    if (impl !== cachedSvc) invalidateCache();
    tryAttach();
  });

  return {
    get supported(): boolean {
      return inner.supported;
    },
    get: (): MemoryLiveSettings => inner.get(),
    update: (patch: Partial<MemoryLiveSettings>): Promise<void> => inner.update(patch),
  };
}

/** scope.get() 的防御性解析：异常值回退全开（宁可多记不可静默停摆）。 */
function resolveSettings(value: unknown): MemoryLiveSettings {
  if (!value || typeof value !== 'object') return { ...ALWAYS_ON };
  const v = value as Partial<MemoryLiveSettings>;
  const efforts = ['', 'off', 'high', 'max'] as const;
  return {
    enabled: v.enabled !== false,
    capture: v.capture !== false,
    distill: v.distill !== false,
    recall: v.recall !== false,
    reasoningEffort:
      typeof v.reasoningEffort === 'string' && efforts.includes(v.reasoningEffort as EffortChoice)
        ? (v.reasoningEffort as EffortChoice)
        : '',
    distillProvider: typeof v.distillProvider === 'string' ? v.distillProvider : '',
    distillModel: typeof v.distillModel === 'string' ? v.distillModel : '',
  };
}
