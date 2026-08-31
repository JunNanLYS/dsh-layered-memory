/**
 * 工作台·洞察：成本 / 活动 / 召回 三个只读子页。
 * 成本复用 CostTab（token-cost 端点，自带粒度/趋势/层级表）；
 * 活动与召回走 dsh-memory/runtime-insights 聚合（近 7 天逐日活动 + 蒸馏调用
 * 计数器 + 召回全量累计与停用分布）。
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { RuntimeInsightsResponse } from '../../../src/contract.js';
import { t } from '../i18n.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { Segmented } from '../ui/controls.js';
import { CostTab } from '../tabs/CostTab.js';
import { ErrorBlock, SectionTitle } from './common.js';

type Sub = 'cost' | 'activity' | 'recall';
const POLL_MS = 15_000;

const LAYER_LABEL_KEY: Record<string, string> = {
  'l1-extract': 'in.act.l1x',
  'l1-dedup': 'in.act.l1d',
  l2: 'in.act.l2',
  l3: 'in.act.l3',
};

export function Insights(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [sub, setSub] = useState<Sub>('cost');
  const [data, setData] = useState<RuntimeInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    rpc('dsh-memory/runtime-insights', {})
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

  if (sub === 'cost') {
    return (
      <div>
        <InsightTabs sub={sub} setSub={setSub} />
        <div style={{ marginTop: 12 }}>
          <CostTab rpc={rpc} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <InsightTabs sub={sub} setSub={setSub} />
        {error ? <ErrorBlock msg={error} onRetry={load} /> : <p style={S.intro}>{t('ws.loading')}</p>}
      </div>
    );
  }

  return (
    <div>
      <InsightTabs sub={sub} setSub={setSub} />
      {sub === 'activity' ? <ActivityView data={data} /> : <RecallView data={data} />}
    </div>
  );
}

function InsightTabs(props: { sub: Sub; setSub(s: Sub): void }) {
  return (
    <Segmented
      value={props.sub}
      options={[
        { key: 'cost', label: t('in.tab.cost') },
        { key: 'activity', label: t('in.tab.activity') },
        { key: 'recall', label: t('in.tab.recall') },
      ]}
      onChange={(k) => {
        props.setSub(k as Sub);
      }}
    />
  );
}

/** 活动子页：近 7 天资产活动条形图（逐日 L1/L2/L3 合计）+ 蒸馏调用与失败表。 */
function ActivityView(props: { data: RuntimeInsightsResponse }) {
  const days = props.data.activityDays;
  const max = Math.max(1, ...days.map((d) => d.l1 + d.l2 + d.l3));
  const barLabel = (day: string) => {
    const m = day.slice(5, 7);
    const d = day.slice(8, 10);
    return `${Number(m)}/${Number(d)}`;
  };
  const thL: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--dsh-mem-text-3)', textAlign: 'left', padding: '4px 10px', borderBottom: '1px solid var(--dsh-mem-border)' };
  const thR: CSSProperties = { ...thL, textAlign: 'right' };
  const tdL: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--dsh-mem-text-1)', padding: '5px 10px' };
  const tdR: CSSProperties = { fontSize: 12.5, color: 'var(--dsh-mem-text-1)', textAlign: 'right', padding: '5px 10px', fontVariantNumeric: 'tabular-nums' };
  return (
    <div>
      <SectionTitle first>{t('in.act.chart')}</SectionTitle>
      <div className="dsh-mem-card" style={S.card}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110, marginTop: 8 }}>
          {days.map((d) => {
            const total = d.l1 + d.l2 + d.l3;
            return (
              <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, height: '100%' }}>
                <div
                  title={`${d.day} · L1 ${d.l1} / L2 ${d.l2} / L3 ${d.l3}`}
                  style={{
                    height: Math.max(2, Math.round((total / max) * 80)),
                    borderRadius: 4,
                    background: 'var(--dsh-mem-accent-fill)',
                    opacity: 0.85,
                  }}
                />
                <span style={{ textAlign: 'center', fontSize: 10, color: 'var(--dsh-mem-text-3)', fontVariantNumeric: 'tabular-nums' }}>
                  {barLabel(d.day)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <SectionTitle>{t('in.act.byLayer')}</SectionTitle>
      <div className="dsh-mem-card" style={{ ...S.card, padding: '4px 10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thL}>{t('in.act.layer')}</th>
              <th style={thR}>{t('in.act.calls')}</th>
              <th style={thR}>{t('in.act.fail')}</th>
            </tr>
          </thead>
          <tbody>
            {props.data.distill.map((row) => (
              <tr key={row.layer}>
                <td style={tdL}>{t(LAYER_LABEL_KEY[row.layer] ?? '') || row.layer}</td>
                <td style={tdR}>{row.calls}</td>
                <td style={{ ...tdR, color: row.failures > 0 ? 'var(--dsh-mem-danger)' : undefined }}>{row.failures}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 召回子页：全量累计行 + 停用分布（进程内计数，重启归零）。 */
function RecallView(props: { data: RuntimeInsightsResponse }) {
  const r = props.data.recall;
  const row = (label: string, value: string) => (
    <div key={label} style={{ ...S.switchRow, justifyContent: 'space-between' }}>
      <div style={S.switchLabel}>{label}</div>
      <b style={{ color: 'var(--dsh-mem-text-1)', fontVariantNumeric: 'tabular-nums' }}>{value}</b>
    </div>
  );
  const disabledRow = (cls: string, label: string) => (
    <span key={label} className={'dsh-mem-chip ' + cls}>
      {label}
    </span>
  );
  return (
    <div>
      {r.sessions === 0 ? (
        <div className="dsh-mem-card" style={{ ...S.card, padding: '26px 10px', textAlign: 'center' }}>
          <p style={S.hint}>{t('in.rc.empty')}</p>
        </div>
      ) : (
        <div className="dsh-mem-card" style={{ ...S.switchPanel, marginTop: 14 }}>
          {row(t('in.rc.sessions'), String(r.sessions))}
          {row(t('in.rc.turns'), String(r.injectedTurns))}
          {row(t('in.rc.hitTurns'), String(r.hitTurns))}
          {row(t('in.rc.hits'), String(r.totalHits))}
          {row(t('in.rc.timeouts'), String(r.timeouts))}
          {row(t('in.rc.suppressed'), String(r.suppressedRecalls))}
        </div>
      )}
      <SectionTitle>{t('in.rc.disabled')}</SectionTitle>
      <div className="dsh-mem-card" style={S.card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {disabledRow(r.globalRecall ? 'dsh-mem-chip-ok' : 'dsh-mem-chip-warn', r.globalRecall ? t('in.rc.globalOn') : t('in.rc.globalOff'))}
          {disabledRow('dsh-mem-chip', `${t('in.rc.modeOff')} · ${r.sessionsModeOff}`)}
          {disabledRow('dsh-mem-chip', `${t('in.rc.wo')} · ${r.sessionsWriteOnly}`)}
        </div>
      </div>
    </div>
  );
}
