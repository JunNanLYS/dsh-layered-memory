/**
 * dsh-layered-memory — browser half（TS/TSX 源，scripts/build-client.mjs 经
 * esbuild 打包为 dist/client.js 单文件 bundle）。
 *
 * 1. 输入栏（conversation.input.left，权限预设芯片右侧）：会话记忆芯片——
 *    级联菜单（记忆范围滑条 + 数据流 hover 子面板）；
 * 2. 输入框下方统计行（conversation.composer.dock）：待蒸馏遥测段；
 * 3. 设置 → 记忆：记忆工作台五区（总览 / 记忆库 / 自动化 / 洞察 / 维护，
 *    两族混合视图；spec 见 .scratch/ui-rework/ui-spec.md v2）。
 * 数据通道：ctx.connection.rpc.call('/rpc', 'dsh-memory/*', payload) → Host 侧 RPC 端点
 * （类型契约见 src/contract.ts，两端共享同一事实源）。
 *
 * 产物形态对齐官方 client bundle 的 handoff 协议：
 *   window.__ModuleLoader__.load({ id, factory })，
 *   factory(require) 返回 { apply, inject }（wrapper 由构建脚本生成）。
 */
import type { MemoryClientCtx } from './env.js';
import { MemoryChip } from './chat/MemoryChip.js';
import { StatsSegment } from './chat/stats-segment.js';
import { initI18n } from './i18n.js';
import { MemoryPanel } from './panel.js';
import { makeRpc } from './rpc.js';

export const inject = ['slots', 'connection'];

export function apply(ctx: MemoryClientCtx) {
  const rpc = makeRpc(ctx);
  initI18n(ctx);

  // 设置 → 记忆：记忆工作台（浏览器保持两族混合视图）
  ctx.slots.inject('settings.section', () => {
    return ctx.slots.register(
      {
        name: 'settings.section',
        id: 'dsh-memory',
        order: 200,
        label: '记忆',
        inject: () => ({ rpc }),
      },
      MemoryPanel,
    );
  });

  // 输入栏左簇（权限预设芯片右侧）：会话记忆芯片——级联菜单（范围滑条 + 数据流）。
  // （inject owner 实测为裸 sessionId 字符串——rc.8 的命名座位不随快照 props）
  ctx.slots.inject('conversation.input.left', () => {
    return ctx.slots.register(
      {
        name: 'conversation.input.left',
        id: 'dsh-memory-mode',
        order: 100,
        inject: (sessionId: string) => ({ sessionId, rpc }),
      },
      MemoryChip,
    );
  });

  // 输入框下方统计行（官方 stats 段之后）：待蒸馏遥测段（spec v2 §4.6）
  ctx.slots.inject('conversation.composer.dock', () => {
    return ctx.slots.register(
      {
        name: 'conversation.composer.dock',
        id: 'dsh-memory-telemetry',
        order: 5,
        inject: (sessionId: string) => ({ sessionId, rpc }),
      },
      StatsSegment,
    );
  });
}
