/**
 * 记忆模式运行时开关（官方 settings 服务，live 生效）。
 * 语义：静态 config（cordis.patch.yml，部署上限）AND 运行时开关，两者同时开才工作。
 * settings 服务缺失（如 headless）时退化为恒开——行为与无开关版本一致。
 */
import type { Context } from '@deepseek-ai/cordis';
// 纯类型导入：拉入 ctx.settings 的 Context 声明合并
import type {} from '@deepseek-ai/dsh-settings';
import Schema from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
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
}

export interface LiveSettingsHandle {
  /** settings 服务是否可用（不可用时 UI 侧隐藏开关面板） */
  supported: boolean;
  get(): MemoryLiveSettings;
  /** UI 写入入口；不支持时抛错由 RPC 层转成业务错误 */
  update(patch: Partial<MemoryLiveSettings>): Promise<void>;
}

const NS = settingsNamespace('dsh-memory');

const ALWAYS_ON: MemoryLiveSettings = { enabled: true, capture: true, distill: true, recall: true, reasoningEffort: '' };

export function liveSettingsSchema(): Schema<MemoryLiveSettings> {
  return Schema.object({
    enabled: Schema.boolean().default(true),
    capture: Schema.boolean().default(true),
    distill: Schema.boolean().default(true),
    recall: Schema.boolean().default(true),
    reasoningEffort: Schema.union(['', 'off', 'high', 'max']).default(''),
  });
}

export function registerLiveSettings(ctx: Context, logger: MemoryLogger): LiveSettingsHandle {
  // settings 服务可能晚于插件就绪（provider 先读盘再发布）：先探测，未上线则监听补挂
  let inner: LiveSettingsHandle = {
    supported: false,
    get: () => ALWAYS_ON,
    update: () => Promise.reject(new Error('settings 服务不可用')),
  };

  const tryAttach = (): boolean => {
    const settings = ctx.get('settings');
    if (!settings) return false;
    try {
      const scope = settings.register(NS, liveSettingsSchema(), { applies: 'live' });
      let current = resolveSettings(scope.get());
      scope.watch((next) => {
        const prev = current;
        current = resolveSettings(next);
        logger.info(
          `[memory] 记忆模式开关更新：总=${current.enabled} 捕获=${current.capture} 蒸馏=${current.distill} 召回=${current.recall}` +
            `，蒸馏思考=${current.reasoningEffort || '跟随配置'}（此前 总=${prev.enabled}）`,
        );
      });
      inner = {
        supported: true,
        get: () => current,
        update: async (patch) => {
          await scope.update(patch);
        },
      };
      logger.info(
        `[memory] 记忆模式开关就绪（settings 命名空间 dsh-memory，当前：总=${current.enabled} 捕获=${current.capture} 蒸馏=${current.distill} 召回=${current.recall}` +
          `，蒸馏思考=${current.reasoningEffort || '跟随配置'}）`,
      );
      return true;
    } catch (err) {
      logger.warn(`[memory] 记忆模式开关注册失败（保持全开）: ${err instanceof Error ? err.message : String(err)}`);
      return true; // 已拿到服务但注册失败，不再重试
    }
  };

  if (!tryAttach()) {
    logger.warn('[memory] settings 服务未就绪，记忆模式开关暂不可用（保持全开，等待服务上线）');
    ctx.on('internal/service', (name: string) => {
      if (name === 'settings' && !inner.supported) tryAttach();
    });
  }

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
  };
}
