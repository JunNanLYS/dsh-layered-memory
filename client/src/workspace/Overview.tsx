/**
 * 工作台·总览：健康摘要 + 最近活动 + 关键数字 + 引导式空状态。
 * 数据源：dsh-memory/workspace-overview 单发聚合（host 侧 buildStats + 周成本 +
 * 最近活动前 5 条），打开期间低频轮询。
 */
import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceOverviewResponse } from '../../../src/contract.js';
import { fmtAgoLocal, t, tpl } from '../i18n.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { NButton } from '../ui/primitives.js';
import { ErrorBlock, KindTag, SectionTitle, VerbTag, fmtTokensCompact } from './common.js';

const POLL_MS = 15_000;

type NavTab = 'library' | 'automation' | 'insights' | 'maintenance';

export function Overview(props: { rpc: RpcFn; onNavigate(tab: NavTab): void }) {
  const rpc = props.rpc;
  const [data, setData] = useState<WorkspaceOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    rpc('dsh-memory/workspace-overview', {})
      .then((r) => {
        if (r && r.ok) setData(r.value);
        else setError(r && r.error ? r.error.message : 'RPC error');
      })
      .catch((e: unknown) => {
        setError(String((e && (e as Error).message) || e));
      });
  }, [rpc]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [load]);

  if (!data) {
    return error ? <ErrorBlock msg={error} onRetry={load} /> : <p style={S.intro}>{t('ws.loading')}</p>;
  }

  // 引导式空状态：全部派生层为空 → 捕获→蒸馏→召回 三步指引
  if (data.empty) {
    const step = (label: string) => (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          width: 110,
          fontSize: 12,
          color: 'var(--dsh-mem-text-2)',
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--dsh-mem-accent-weak)',
            color: 'var(--dsh-mem-accent-text)',
            fontWeight: 600,
          }}
        >
          {label.slice(0, 1)}
        </span>
        {label}
      </div>
    );
    const arrow = (
      <span style={{ alignSelf: 'center', color: 'var(--dsh-mem-text-3)', paddingBottom: 20 }}>→</span>
    );
    return (
      <div className="dsh-mem-card" style={{ ...S.card, padding: '34px 10px', textAlign: 'center' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--dsh-mem-text-1)' }}>
          {t('ov.empty.title')}
        </h3>
        <p style={{ ...S.hint, maxWidth: 380, margin: '0 auto' }}>{t('ov.empty.body')}</p>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0 14px' }}>
          {step(t('ov.empty.capture'))}
          {arrow}
          {step(t('ov.empty.distill'))}
          {arrow}
          {step(t('ov.empty.recall'))}
        </div>
        <p style={S.hint}>{t('ov.empty.capOk')}</p>
      </div>
    );
  }

  // 健康摘要：子系统 chip（存储 / 检索 / 队列）+ 注意区
  const vectorDegraded = data.retrieval === 'keyword';
  const warn = data.degraded || vectorDegraded;
  const attn: Array<{ key: string; cls: string }> = [];
  if (data.pendingExtract > 0) attn.push({ key: tpl('ov.attn.pending', { n: data.pendingExtract }), cls: 'dsh-mem-chip-warn' });
  if (vectorDegraded) attn.push({ key: t('ov.attn.vector'), cls: 'dsh-mem-chip-warn' });
  if (data.degraded) attn.push({ key: t('ov.attn.degraded'), cls: 'dsh-mem-chip-err' });

  const chip = (label: string, cls: string) => <span className={'dsh-mem-chip ' + cls}>{label}</span>;
  const retrievalChip = () => {
    if (data.retrieval === null) return null;
    if (data.retrieval === 'hybrid') return chip(t('ov.subsys.vec') + ' · ' + t('mt.retrieval.hybrid'), 'dsh-mem-chip-ok');
    if (data.retrieval === 'keyword') return chip(t('ov.subsys.vec') + ' · ' + t('ov.sys.keyword'), 'dsh-mem-chip-warn');
    if (data.retrieval === 'vector') return chip(t('ov.subsys.vec') + ' · ' + t('ov.sys.vectorOnly'), 'dsh-mem-chip-warn');
    return chip(t('ov.subsys.vec') + ' · ' + t('ov.sys.none'), 'dsh-mem-chip-warn');
  };

  const actRow = (item: WorkspaceOverviewResponse['recent'][number], i: number) => (
    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < data.recent.length - 1 ? '1px solid var(--dsh-mem-border)' : 'none', fontSize: 12.5 }}>
      <VerbTag verb={item.verb} />
      <KindTag kind={item.kind} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dsh-mem-text-1)' }}>{item.title}</span>
      <span style={{ marginLeft: 'auto', color: 'var(--dsh-mem-text-3)', fontSize: 11, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
        {fmtAgoLocal(item.updatedAt) ?? '-'}
      </span>
    </div>
  );

  const kg = (label: string, value: string, sub?: string) => (
    <div key={label} className="dsh-mem-card" style={{ ...S.statTile, padding: '10px 14px' }}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statNum, fontSize: 18, lineHeight: '26px' }}>{value}</div>
      {sub ? <div style={S.statLabel}>{sub}</div> : null}
    </div>
  );
  const weekOut = data.week ? data.week.outputTokens + data.week.reasoningTokens : 0;

  return (
    <div>
      <div className="dsh-mem-card" style={{ ...S.card, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flex: 'none', background: warn ? 'var(--dsh-mem-warn)' : 'var(--dsh-mem-ok)' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--dsh-mem-text-1)' }}>
            {data.degraded ? t('ov.runningDown') : warn ? t('ov.runningWarn') : t('ov.runningOk')}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
            {chip(t('ov.subsys.store') + ' · ' + (data.degraded ? t('mt.store.down') : t('ov.sys.ok')), data.degraded ? 'dsh-mem-chip-err' : 'dsh-mem-chip-ok')}
            {retrievalChip()}
            {chip(
              t('ov.subsys.queue') + ' · ' + (data.pendingExtract > 0 ? tpl('ov.sys.pending', { n: data.pendingExtract }) : t('ov.sys.idle')),
              data.pendingExtract > 0 ? 'dsh-mem-chip-biz' : 'dsh-mem-chip-ok',
            )}
          </div>
          {attn.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {attn.map((a) => chip('● ' + a.key, a.cls))}
            </div>
          ) : null}
        </div>
        <NButton onClick={load}>{t('ws.refresh')}</NButton>
      </div>

      <SectionTitle>{t('ov.recent')}</SectionTitle>
      <div className="dsh-mem-card" style={S.card}>
        {data.recent.length > 0 ? (
          data.recent.map(actRow)
        ) : (
          <p style={S.muted}>-</p>
        )}
      </div>

      <div style={{ ...S.statGrid, marginTop: 16 }}>
        {kg(t('ov.kg.l1'), String(data.l1Count))}
        {kg(t('ov.kg.scenes'), String(data.sceneCount))}
        {kg(t('ov.kg.week'), fmtTokensCompact(weekOut), data.week ? tpl('ov.kg.weekSub', { n: data.week.calls }) : undefined)}
        {kg(t('ov.kg.lastDistill'), fmtAgoLocal(data.lastExtractAt) ?? t('ov.kg.never'))}
      </div>

      <div style={{ ...S.flexRow, marginTop: 10 }}>
        <NButton onClick={() => { props.onNavigate('library'); }}>{t('ov.goto.library')}</NButton>
        <NButton onClick={() => { props.onNavigate('automation'); }}>{t('ov.goto.automation')}</NButton>
        <NButton onClick={() => { props.onNavigate('insights'); }}>{t('ov.goto.insights')}</NButton>
        <NButton onClick={() => { props.onNavigate('maintenance'); }}>{t('ov.goto.maintenance')}</NButton>
      </div>
    </div>
  );
}
