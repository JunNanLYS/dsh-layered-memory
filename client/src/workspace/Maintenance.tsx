/**
 * 工作台·维护：诊断优先——运行健康行（存储/检索/队列）+ 数据目录与版本信息 +
 * 诊断日志披露（LogTab）+ 危险区重建（RebuildPanel，原生 Modal 确认）。
 * 健康数据源：workspace-overview（降级/检索能力/待处理）+ stats（目录/版本/今日捕获）。
 */
import { useCallback, useEffect, useState } from 'react';
import type { MemoryStats, WorkspaceOverviewResponse } from '../../../src/contract.js';
import { t, tpl } from '../i18n.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { LogTab } from '../tabs/LogTab.js';
import { RebuildPanel } from '../tabs/RebuildPanel.js';
import { ErrorBlock, SectionTitle } from './common.js';
import { NIconChevronRight14 } from '../ui/primitives.js';

const POLL_MS = 15_000;

export function Maintenance(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [ov, setOv] = useState<WorkspaceOverviewResponse | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(() => {
    setError(null);
    rpc('dsh-memory/workspace-overview', {})
      .then((r) => {
        if (r && r.ok) setOv(r.value);
        else setError(r && r.error ? r.error.message : 'RPC error');
      })
      .catch((e: unknown) => {
        setError(String((e && (e as Error).message) || e));
      });
    rpc('dsh-memory/stats', {})
      .then((r) => {
        if (r && r.ok) setStats(r.value);
      })
      .catch(() => {});
  }, [rpc]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [load]);

  if (!ov && !stats) {
    return error ? <ErrorBlock msg={error} onRetry={load} /> : <p style={S.intro}>{t('ws.loading')}</p>;
  }

  const retrievalText = (): { text: string; tone: 'ok' | 'warn' } => {
    if (ov?.retrieval === 'hybrid') return { text: t('ov.sys.ok'), tone: 'ok' };
    if (ov?.retrieval === 'keyword') return { text: t('ov.sys.keyword'), tone: 'warn' };
    if (ov?.retrieval === 'vector') return { text: t('ov.sys.vectorOnly'), tone: 'warn' };
    if (ov?.retrieval === 'none') return { text: t('ov.sys.none'), tone: 'warn' };
    return { text: t('mt.unknown'), tone: 'ok' };
  };
  const ret = retrievalText();
  const degraded = ov?.degraded ?? (stats ? stats.message !== 'running' : false);

  const healthRow = (name: string, dot: string, ev: string) => (
    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--dsh-mem-border)' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: dot }} />
      <span style={{ fontWeight: 500, width: 96, flex: 'none', color: 'var(--dsh-mem-text-1)' }}>{name}</span>
      <span style={{ flex: 1, minWidth: 0, color: 'var(--dsh-mem-text-2)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev}</span>
    </div>
  );
  const infoRow = (label: string, value: string) => (
    <div key={label} style={S.infoRow}>
      <span style={S.infoKey}>{label}</span>
      <span style={S.infoVal}>{value}</span>
    </div>
  );

  const pending = ov?.pendingExtract ?? stats?.pendingExtract ?? 0;
  const l0Today = ov?.l0Today ?? stats?.l0Today ?? 0;

  return (
    <div>
      <SectionTitle first>{t('mt.health')}</SectionTitle>
      <div className="dsh-mem-card" style={S.card}>
        {healthRow(t('ov.subsys.store'), degraded ? 'var(--dsh-mem-danger)' : 'var(--dsh-mem-ok)', degraded ? t('mt.store.down') : t('ov.sys.ok'))}
        {healthRow(t('ov.subsys.vec'), ret.tone === 'ok' ? 'var(--dsh-mem-ok)' : 'var(--dsh-mem-warn)', ret.text)}
        {healthRow(
          t('ov.subsys.queue'),
          pending > 0 ? 'var(--dsh-mem-accent)' : 'var(--dsh-mem-ok)',
          pending > 0 ? tpl('ov.sys.pending', { n: pending }) : t('ov.sys.idle'),
        )}
        {stats ? infoRow(t('mt.row.l0'), String(l0Today)) : null}
        {stats ? infoRow(t('mt.row.dataDir'), stats.dataDir) : null}
        {stats ? infoRow(t('mt.row.version'), 'v' + stats.version) : null}
      </div>
      {error ? <div style={S.error}>{error}</div> : null}

      <button className="dsh-mem-disc" aria-expanded={logOpen} onClick={() => { setLogOpen(!logOpen); }} style={{ marginTop: 14 }}>
        <span className="dsh-mem-disc-chev" aria-hidden="true">
          <NIconChevronRight14 />
        </span>
        {t('mt.log')}
      </button>
      {logOpen ? (
        <div style={{ marginTop: 4 }}>
          <LogTab rpc={rpc} />
        </div>
      ) : null}

      <SectionTitle>{t('mt.danger')}</SectionTitle>
      <div className="dsh-mem-card dsh-mem-danger" style={S.card}>
        <RebuildPanel rpc={rpc} />
      </div>
    </div>
  );
}
