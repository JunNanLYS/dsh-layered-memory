/**
 * bench 控制服务（config `benchControl` 门控，默认关）：为同进程的基准驱动插件
 * （dsh-bench-runner 的 lifecycle 赛道）提供进程内控制面。
 *
 * 为什么不走 RPC：宿主侧 connection.rpc 只有 handle/intercept、没有 call()，
 * 基准驱动包在 dsh 宿主进程内无法调用插件的 loopback RPC 端点；cordis 服务
 * （ctx.provide / ctx.get）是唯一干净的进程内通道。生产部署不开启该配置，
 * 服务不注册、零表面积；即便开启，暴露的也只是既有公开 API 的薄包装，
 * 不引入新逻辑：
 *   - RebuildController.start()/getStatus()（重建触发与状态轮询）；
 *   - SessionModeStore.set()/get()（会话档位——capture/recall 每轮读 Map，
 *     agent 建好后、首条消息前设档即可生效，且走 onModeChange 回调的
 *     pending 落袋/挂起语义，不是裸改 Map）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryLogger, MemoryMode } from './types.js';
import type { RebuildController, RebuildStatus } from './pipeline/rebuild.js';
import type { SessionModeStore } from './store/session-modes.js';
import type { DistillUsageSnapshot } from './llm-usage.js';
import { snapshotDistillUsage } from './llm-usage.js';

/** 服务名（消费方：bench/harness/dsh-bench-runner 的 lifecycle 赛道）。 */
export const BENCH_CONTROL_SERVICE = 'dsh-memory-bench';

export interface BenchControlSurface {
  /** 触发全量重建（从 L0 重导派生层）；前置条件不满足时抛错（调用方捕获）。 */
  rebuildStart(): RebuildStatus;
  /** 重建状态快照（phase/running/recordsBuilt/…，轮询至 done/failed/cancelled）。 */
  rebuildStatus(): RebuildStatus;
  /** 设置会话档位（chat/work/off/auto）；对全新会话应在首条消息前设置。 */
  setSessionMode(sessionId: string, mode: MemoryMode): void;
  /** 查询会话档位（未设过的会话返回部署默认档）。 */
  getSessionMode(sessionId: string): MemoryMode;
  /** 蒸馏用量快照（按层累计的调用数/输入字符/输出 token——「记忆开销」记账）。 */
  getDistillUsage(): DistillUsageSnapshot;
}

/** 注册控制服务，返回注销函数（调用方在插件 dispose 时执行）。 */
export function registerBenchControl(
  ctx: Context,
  rebuild: RebuildController,
  modes: SessionModeStore,
  logger: MemoryLogger,
): () => void {
  const surface: BenchControlSurface = {
    rebuildStart: () => rebuild.start(),
    rebuildStatus: () => rebuild.getStatus(),
    setSessionMode: (sessionId, mode) => modes.set(sessionId, mode),
    getSessionMode: (sessionId) => modes.get(sessionId),
    getDistillUsage: () => snapshotDistillUsage(),
  };
  const dispose = ctx.provide(BENCH_CONTROL_SERVICE, surface);
  logger.info('[memory] bench 控制服务已提供（dsh-memory-bench，仅基准/调试部署）');
  return dispose;
}
