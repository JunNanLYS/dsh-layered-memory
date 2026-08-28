/**
 * 会话信息区：悬浮卡下半部（召回命中 / 攒批进度 / 会话产出 / 会话消息）。
 * 数据通道 dsh-memory/session-stats（宿主侧零文件 I/O：内存注册表 + 索引 COUNT，
 * 见 slider-spec 数据策略节）；自适应轮询：忙时（攒批/挂起/全局待蒸馏）2s，静默 5s，
 * 浮层卸载即停（ModeSlider 只在 pill 展开期间挂载）。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RecallDisabledReason, RecallSessionStats, SessionDistillView, SessionStatsResponse } from '../../../src/contract.js';
import { fmtAgo, fmtTime } from '../format.js';
import type { RpcFn } from '../rpc.js';

type SessionStatsView = Extract<SessionStatsResponse, { supported: true }>;

function sinfoCell(val: ReactNode, label: ReactNode, title?: string | null) {
  return (
    <div title={title || undefined}>
      <div className="dsh-mem-sinfo-val">{val}</div>
      <div className="dsh-mem-sinfo-label">{label}</div>
    </div>
  );
}

export function SessionInfoArea(props: { rpc: RpcFn; sessionId: string }) {
  const rpc = props.rpc;
  const sessionId = props.sessionId;
  // undefined=首帧加载中；null=宿主不支持（整体隐藏）；对象=最新快照
  const [stats, setStats] = useState<SessionStatsView | null | undefined>(undefined);
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
          if (r && r.ok && r.value) {
            if (r.value.supported === false) {
              setStats(null); // 宿主无数据源：整体隐藏
            } else {
              const v = r.value;
              setStats(v);
              const d = v.distill || {};
              const g = v.global || {};
              busyRef.current = (d.pendingSlice || 0) > 0 || (d.parkedSlices || 0) > 0 || (g.pendingTotal || 0) > 0;
            }
          }
          // RPC 失败：保持旧快照（信息区不因瞬时错误闪没）
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

  // 首帧占位骨架（防内容跳变）；宿主不支持则整体隐藏
  if (stats === null) return null;
  if (stats === undefined) {
    return (
      <div className="dsh-mem-sinfo">
        <div className="dsh-mem-sinfo-grid">
          {sinfoCell('…', '召回命中')}
          {sinfoCell('…', '攒批进度')}
          {sinfoCell('…', '本会话记忆')}
          {sinfoCell('…', '会话消息')}
        </div>
      </div>
    );
  }

  const rc = (stats.recall || {}) as Partial<{ enabled: boolean; reason?: RecallDisabledReason } & RecallSessionStats>;
  const di = (stats.distill || {}) as Partial<SessionDistillView>;
  const gl = (stats.global || {}) as SessionStatsView['global'];
  const isOff = stats.mode === 'off';

  // 召回命中：口径是"注入统计"（命中轮次/检索轮次），停用时显示状态而非误导性 0/0
  let rcVal: string;
  let rcLabel: string;
  let rcTitle: string;
  if (rc.enabled === false) {
    rcVal = '停用';
    rcLabel = '召回命中';
    // 停用原因由 host 短路判定带出（#38 起含「会话只写」）；旧宿主无 reason 回退枚举文案
    const reasonText: Partial<Record<RecallDisabledReason, string>> = {
      deploy: '部署未启用',
      global: '全局开关关闭',
      session: '会话只写',
      mode: '档位关闭',
    };
    rcTitle = rc.reason
      ? '召回已停用（' + (reasonText[rc.reason] ?? rc.reason) + '）'
      : '召回已停用（开关关闭 / 档位关闭 / 部署未启用）';
  } else {
    rcVal = (rc.hitTurns || 0) + '/' + (rc.injectedTurns || 0);
    rcLabel = '召回命中 · ' + (rc.totalHits || 0) + ' 条';
    rcTitle =
      '最近一轮命中 ' +
      (rc.lastHits || 0) +
      ' 条，耗时 ' +
      (rc.lastDurationMs || 0) +
      'ms' +
      ((rc.timeouts || 0) > 0 ? '，超时跳过 ' + rc.timeouts + ' 次' : '');
  }

  // 攒批进度（x/生效阈值，含 warmup 爬坡）；off 档显示挂起切片数
  let dVal: string;
  let dLabel: string;
  let dTitle: string;
  if (isOff) {
    dVal = String(di.parkedSlices || 0);
    dLabel = '挂起切片';
    dTitle = '档位关闭：未蒸馏切片挂起，切回档位后继续';
  } else {
    dVal = (di.pendingSlice || 0) + '/' + (di.threshold != null ? di.threshold : '-');
    dLabel = (di.parkedSlices || 0) > 0 ? '攒批 · 挂起 ' + di.parkedSlices : '攒批进度';
    dTitle = '达到阈值后自动蒸馏（阈值随使用渐进爬坡到稳态）';
  }

  const pTitle = di.lastDistillAt ? '最近蒸馏 ' + fmtTime(di.lastDistillAt) : '本会话尚未蒸馏';
  const warn = gl.degraded ? '⚠ 存储不可用，记忆功能已停用' : null;
  let note: string | null = null;
  if (!gl.degraded) {
    if (stats.retrieval === 'keyword' && !isOff) note = '检索降级：纯关键词（向量不可用）';
    else if (stats.retrieval === 'none') note = '检索不可用（FTS 与向量均失效）';
  }
  const ago = fmtAgo(gl.lastExtractAt);

  return (
    <div className="dsh-mem-sinfo">
      {warn ? <div className="dsh-mem-sinfo-warn">{warn}</div> : null}
      <div className="dsh-mem-sinfo-grid">
        {sinfoCell(rcVal, rcLabel, rcTitle)}
        {sinfoCell(dVal, dLabel, dTitle)}
        {sinfoCell(String(di.producedRecords || 0), '本会话记忆', pTitle)}
        {sinfoCell(stats.l0Count != null ? String(stats.l0Count) : '…', '会话消息')}
      </div>
      {note ? <div className="dsh-mem-sinfo-note">{note}</div> : null}
      <div className="dsh-mem-sinfo-sum">{'待蒸馏 ' + (gl.pendingTotal || 0) + ' · 上次蒸馏 ' + (ago || '尚未蒸馏')}</div>
    </div>
  );
}
