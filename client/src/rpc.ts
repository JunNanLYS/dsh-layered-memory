/**
 * 类型化 RPC 通道：全部 23 个 dsh-memory/* 端点的请求/响应类型来自
 * src/contract.ts（契约单一事实源，import type 在 esbuild 构建期被擦除）。
 */
import type { DshMemoryEndpoint, DshMemoryRequestMap, DshMemoryResponseMap } from '../../src/contract.js';
import type { MemoryClientCtx } from './env.js';

/** RPC 信封（镜像宿主 dsh-host-apiproxy 的 RpcResult 形状；client 侧类型不随宿主包发布）。 */
export type RpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

/** 类型化调用：端点字面量 → 请求/响应自动查表。 */
export type RpcFn = <K extends DshMemoryEndpoint>(
  endpoint: K,
  payload?: DshMemoryRequestMap[K],
) => Promise<RpcResult<DshMemoryResponseMap[K]>>;

export function makeRpc(ctx: MemoryClientCtx): RpcFn {
  return (endpoint, payload) => {
    if (!ctx.connection || !ctx.connection.rpc) return Promise.reject(new Error('connection 服务不可用'));
    // 信封由宿主 rpc 层保证；这里断言到契约类型（契约漂移在 host 侧编译期已锁）
    // RpcResult<never> 经协变可赋给任意 RpcResult<K>（信封由宿主 rpc 层保证）
    return ctx.connection.rpc.call('/rpc', endpoint, payload ?? {}) as unknown as Promise<RpcResult<never>>;
  };
}

/** 动态端点转发（EmbeddingSection 的 call() 等）：泛型查表在运行时动态分发处不可用。 */
export type RpcLoose = (endpoint: DshMemoryEndpoint, payload?: unknown) => Promise<RpcResult<unknown>>;

export function asLoose(rpc: RpcFn): RpcLoose {
  return rpc as unknown as RpcLoose;
}
