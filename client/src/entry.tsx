/**
 * dsh-layered-memory — browser half（TS/TSX 源，scripts/build-client.mjs 经
 * esbuild 打包为 dist/client.js 单文件 bundle）。
 *
 * 1. 输入栏（conversation.input.left，模式选择器右侧）：会话记忆档位 pill
 *    （关闭/日常/工作/智能 四态，配置键 off/chat/work/auto），点击展开滑动选择器；
 * 2. 设置 → 记忆：多 Tab 记忆浏览器（概览+开关 / L1 记忆 / L2 场景 / L3 画像 /
 *    成本 / 运行日志，两族混合视图）。
 * 数据通道：ctx.connection.rpc.call('/rpc', 'dsh-memory/*', payload) → Host 侧 RPC 端点
 * （类型契约见 src/contract.ts，两端共享同一事实源）。
 *
 * 产物形态对齐官方 client bundle 的 handoff 协议：
 *   window.__ModuleLoader__.load({ id, factory })，
 *   factory(require) 返回 { apply, inject }（wrapper 由构建脚本生成）。
 */
import type { MemoryClientCtx } from './env.js';
import { MemoryPanel } from './panel.js';
import { MemoryModePill } from './pill/MemoryModePill.js';
import { makeRpc } from './rpc.js';

export const inject = ['slots', 'connection'];

export function apply(ctx: MemoryClientCtx) {
  const rpc = makeRpc(ctx);

  // 设置 → 记忆：状态页（浏览器保持两族混合视图）
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

  // 输入栏（模式选择器右侧）：会话记忆档位 pill + 滑动选择器
  ctx.slots.inject('conversation.input.left', () => {
    return ctx.slots.register(
      {
        name: 'conversation.input.left',
        id: 'dsh-memory-mode',
        order: 100,
        inject: (sessionId: string) => ({ sessionId, rpc }),
      },
      MemoryModePill,
    );
  });
}
