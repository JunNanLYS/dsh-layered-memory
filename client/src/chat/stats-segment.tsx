/**
 * 统计行记忆遥测段（conversation.composer.dock，spec v2 §4.6）：官方会话统计行旁的
 * `待蒸馏 N` 文本段（N = 待蒸馏切片 + 挂起切片），无占用、无控制——占用唯一展示处
 * 是官方上下文环面板。轮询复用 session-stats 热路径端点，忙 2s / 静 5s 自适应，
 * 卸载即停；宿主不支持时整体不渲染（best-effort）。
 */
import { useEffect, useRef, useState } from 'react';
import type { SessionStatsResponse } from '../../../src/contract.js';
import type { RpcFn } from '../rpc.js';

type SessionStatsView = Extract<SessionStatsResponse, { supported: true }>;

export function StatsSegment(props: { rpc: RpcFn; sessionId: string }) {
  const rpc = props.rpc;
  const sessionId = props.sessionId;
  const [stats, setStats] = useState<SessionStatsView | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!rpc || !sessionId) return undefined;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let seq = 0;
    const tick = () => {
      const token = ++seq;
      rpc('dsh-memory/session-stats', { sessionId })
        .then((r) => {
          if (!alive || token !== seq) return;
          if (r && r.ok && r.value && r.value.supported) {
            const v = r.value;
            setStats(v);
            const d = v.distill || {};
            const g = v.global || {};
            busyRef.current = (d.pendingSlice || 0) > 0 || (d.parkedSlices || 0) > 0 || (g.pendingTotal || 0) > 0;
          }
        })
        .catch(() => {})
        .then(() => {
          if (alive) timer = setTimeout(tick, busyRef.current ? 2000 : 5000);
        });
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [rpc, sessionId]);

  if (!stats) return null;
  const di = stats.distill || {};
  const pending = (di.pendingSlice || 0) + (di.parkedSlices || 0);
  if (pending <= 0) return null;
  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: '20px',
        color: 'var(--dsh-mem-text-3)',
        textAlign: 'center',
        padding: '0 0 2px',
        fontVariantNumeric: 'tabular-nums',
      }}
      title="本会话待蒸馏切片（含暂停挂起）"
    >
      待蒸馏 {pending}
    </div>
  );
}
