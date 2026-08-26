/**
 * client 侧运行环境的最小类型面：宿主注入的 apply(ctx) 与 handoff 工厂参数 require。
 * 官方 dsh-client-modules 的浏览器侧类型未随包发布，这里按本 bundle 的实际使用面建模。
 */

/**
 * handoff 工厂参数 require：bundle 以 CJS 形态包在 factory(require) 内执行
 * （scripts/build-client.mjs 负责 wrapper），源码里的裸 require 调用（external 模块）
 * 在运行时解析到该参数——浏览器全局作用域没有 require。
 */
declare const require: (id: string) => unknown;

/** 宿主 require 的受控包装（guarded 加载官方原语模块用）。 */
export function hostRequire(id: string): unknown {
  return require(id);
}

/** 插件入口 apply(ctx) 收到的 ctx（inject = ["slots", "connection"]）。 */
export interface MemoryClientCtx {
  slots: {
    /** slot 注入：宿主在对应区域挂载时调用 factory，返回 register 句柄。 */
    inject(slot: string, factory: () => unknown): unknown;
    /** 注册组件与选项（name/id/order/label/inject 按 slot 约定）。 */
    register(options: Record<string, unknown>, component: unknown): unknown;
  };
  connection?: {
    rpc: { call(channel: string, endpoint: string, payload?: unknown): Promise<unknown> };
  };
}
