/** 重建面板：从 L0 重导 L1/L2/L3（确认弹窗 + 进度 + 取消；Light/Dark 双主题走 class）。 */
import { useCallback, useEffect, useState } from 'react';
import type { RebuildStatusResponse } from '../../../src/contract.js';
import { fmtTime } from '../format.js';
import { NButton, NModal } from '../ui/primitives.js';
import type { RpcFn } from '../rpc.js';

const RB_PHASE_LABEL: Record<string, string> = {
  preparing: '准备中（归档旧数据 · 清空检索库）',
  distilling: '分块蒸馏中',
  finalizing: '收尾（强制 L2 场景 + L3 画像）',
};

export function RebuildPanel(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [rb, setRb] = useState<RebuildStatusResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rbError, setRbError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    rpc('dsh-memory/rebuild-status', {})
      .then((r) => {
        if (r && r.ok) setRb(r.value);
      })
      .catch(() => {});
  }, [rpc]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 运行中 1.5s 高频轮询进度；空闲不轮询（重新打开 Tab 时挂载刷新一次）
  const running = !!(rb && 'running' in rb && rb.running);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, 1500);
    return () => {
      clearInterval(timer);
    };
  }, [running, refresh]);

  if (!rb || 'supported' in rb) return null;

  const start = () => {
    setBusy(true);
    setRbError(null);
    rpc('dsh-memory/rebuild-start', {})
      .then((r) => {
        setBusy(false);
        if (r && r.ok) {
          setConfirmOpen(false);
          setRb(r.value);
        } else {
          setRbError(r && r.error ? r.error.message : '启动失败');
        }
      })
      .catch((e: unknown) => {
        setBusy(false);
        setRbError(String((e && (e as Error).message) || e));
      });
  };
  const cancel = () => {
    setBusy(true);
    rpc('dsh-memory/rebuild-cancel', {})
      .then((r) => {
        setBusy(false);
        if (r && r.ok) setRb(r.value);
      })
      .catch(() => {
        setBusy(false);
      });
  };

  const empty = !running && (rb.messageCount === 0 || rb.estCalls === 0);
  const pct = rb.total > 0 ? Math.round((rb.done / rb.total) * 100) : 0;

  let lastNote: string | null = null;
  if (!running && rb.phase === 'done') {
    lastNote =
      '上次重建：完成（' +
      rb.done +
      '/' +
      rb.total +
      ' 会话，产出 ' +
      rb.recordsBuilt +
      ' 条记录）' +
      (rb.finishedAt ? ' · ' + fmtTime(new Date(rb.finishedAt).toISOString()) : '');
  } else if (!running && rb.phase === 'cancelled') {
    lastNote = '上次重建：已取消（完成 ' + rb.done + '/' + rb.total + ' 会话，已重建部分保留）';
  } else if (!running && rb.phase === 'failed') {
    lastNote = '上次重建：失败：' + (rb.error || '未知错误');
  }

  return (
    <div className="dsh-mem-rb-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>重建记忆</div>
        <div className="dsh-mem-rb-muted" style={{ flex: 1, minWidth: 180 }}>
          {running
            ? (RB_PHASE_LABEL[rb.phase] || rb.phase) + ' · ' + rb.done + '/' + rb.total + ' 会话（' + pct + '%）'
            : '从 L0 原始对话重新蒸馏 L1/L2/L3；旧数据先归档（不删除）'}
        </div>
        {running ? (
          <NButton disabled={busy || rb.cancelRequested} onClick={cancel}>
            {rb.cancelRequested ? '取消中…' : '取消重建'}
          </NButton>
        ) : (
          <NButton
            disabled={busy || empty}
            title={empty ? 'L0 无消息，无可重建内容' : '重新蒸馏全部记忆'}
            style={{ color: 'var(--dsh-mem-danger)' }}
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            {busy ? '…' : '开始重建'}
          </NButton>
        )}
      </div>
      {running ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <div className="dsh-mem-rb-bar">
            <div className="dsh-mem-rb-fill" style={{ width: pct + '%' }} />
          </div>
          <span className="dsh-mem-rb-muted" style={{ whiteSpace: 'nowrap' }}>
            {'产出 ' + rb.recordsBuilt + ' 条'}
          </span>
        </div>
      ) : null}
      {lastNote ? (
        <div className="dsh-mem-rb-muted" style={{ marginTop: 8 }}>
          {lastNote}
        </div>
      ) : null}
      {rbError ? (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--dsh-mem-danger)' }}>{rbError}</div>
      ) : null}
      {confirmOpen ? (
        <NModal
          open={true}
          onClose={() => {
            setConfirmOpen(false);
          }}
          title="确认重建全部记忆？"
          footer={[
            <NButton
              key="cancel"
              onClick={() => {
                setConfirmOpen(false);
              }}
            >
              取消
            </NButton>,
            <NButton key="confirm" variant="primary" disabled={busy} onClick={start}>
              {busy ? '启动中…' : '开始重建'}
            </NButton>,
          ]}
        >
          <div>
            将以 L0 原始对话为事实源重新蒸馏：
            <b>{rb.sessionCount + ' 个会话 · ' + rb.messageCount + ' 条消息'}</b>
            {'，预计 ≥' + rb.estCalls + ' 次蒸馏调用。'}
          </div>
          <div style={{ marginTop: 8 }}>
            现有 L1 记忆 / L2 场景 / L3 画像会整体归档（*.bak.时间戳，可手工找回），随后清空重建；重建期间可正常对话，新对话的蒸馏优先进行；中途可取消，已重建部分保留。
          </div>
        </NModal>
      ) : null}
    </div>
  );
}
