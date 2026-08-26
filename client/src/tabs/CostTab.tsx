/** Tab：蒸馏成本看板（折线图 + 层级×窗口表格 + 总览）。 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { CostSnapshot, TrendBucket } from '../../../src/contract.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { Segmented, type SegOption } from '../ui/controls.js';
import { NButton, NInput } from '../ui/primitives.js';

/** 折线图 helper：把桶序列画成 SVG 多模型折线。 */
function renderCostChart(
  buckets: TrendBucket[],
  models: string[],
  maxY: number,
  fmtDate: (ts: number) => string,
  fmtInt: (n: number) => string,
  palette: string[],
) {
  const W = 600;
  const H = 200;
  const L = 46;
  const R = 10;
  const T = 10;
  const B = 26;
  const iw = W - L - R;
  const ih = H - T - B;
  const n = buckets.length;
  const x = (i: number) => L + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => T + ih - (v / maxY) * ih;
  const yTicks = [0, maxY / 2, maxY];
  const xIdx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : [0];
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <line x1={L} y1={y(0)} x2={W - R} y2={y(0)} stroke="var(--dsh-mem-border)" strokeWidth={1} />
      {yTicks.map((v) => {
        return (
          <text key={'yt' + v} x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--dsh-mem-text-3)">
            {fmtInt(v)}
          </text>
        );
      })}
      {xIdx.map((i) => {
        return (
          <text key={'xt' + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--dsh-mem-text-3)">
            {fmtDate(buckets[i] ? buckets[i]!.ts : 0)}
          </text>
        );
      })}
      {models.map((m, mi) => {
        const pts = buckets.map((b, i) => x(i) + ',' + y(b.byModel[m] || 0)).join(' ');
        return (
          <polyline
            key={'pl' + m}
            points={pts}
            fill="none"
            stroke={palette[mi % palette.length]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

const RANGE_LABELS: Record<string, string> = { day: '今日', week: '本周', month: '本月', all: '累计' };
const LAYER_OPTS: SegOption[] = [
  { key: '', label: '全部' },
  { key: 'l1', label: 'L1' },
  { key: 'l2', label: 'L2' },
  { key: 'l3', label: 'L3' },
];
const GRAN_OPTS: SegOption[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
];
const PALETTE = [
  'var(--dsh-mem-chart-1)',
  'var(--dsh-mem-chart-2)',
  'var(--dsh-mem-chart-3)',
  'var(--dsh-mem-chart-4)',
  'var(--dsh-mem-chart-5)',
  'var(--dsh-mem-chart-6)',
  'var(--dsh-mem-chart-7)',
  'var(--dsh-mem-chart-8)',
];

const RANGES = ['day', 'week', 'month', 'all'] as const;

const thFirst: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--dsh-mem-text-3)', textAlign: 'left', padding: '4px 10px', borderBottom: '1px solid var(--dsh-mem-border)' };
const thStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--dsh-mem-text-3)', textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid var(--dsh-mem-border)' };
const tdFirst: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--dsh-mem-text-1)', textAlign: 'left', padding: '4px 10px' };
const tdStyle: CSSProperties = { fontSize: 12.5, color: 'var(--dsh-mem-text-1)', textAlign: 'right', padding: '4px 10px', fontFamily: 'ui-monospace, Consolas, monospace' };

export function CostTab(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [data, setData] = useState<CostSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState('day');
  const [layer, setLayer] = useState('');
  const [rangeDays, setRangeDays] = useState(0);
  const [rangeOpen, setRangeOpen] = useState(false);

  const load = useCallback(() => {
    setError(null);
    rpc('dsh-memory/token-cost', {
      granularity: granularity as 'day',
      rangeDays: rangeDays,
    })
      .then((r) => {
        if (r && r.ok) setData(r.value);
        else setError(r && r.error ? r.error.message : 'RPC error');
      })
      .catch((e: unknown) => {
        setError(String((e && (e as Error).message) || e));
      });
  }, [rpc, granularity, rangeDays]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [load]);

  const fmtInt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fmtModel = (p: string, m: string) => (p ? p + '/' + m : m);
  const fmtDate = (ts: number) => {
    try {
      const d = new Date(ts);
      // 近 N 天时后端强制日粒度，用 trend 实际粒度（而非用户选的周/月）格式化横轴
      const g = data && data.trend ? data.trend.granularity : granularity;
      if (g === 'month') return d.getMonth() + 1 + '月';
      return d.getMonth() + 1 + '/' + d.getDate();
    } catch {
      return '';
    }
  };

  const windows = (data && data.windows) || [];
  const byModel = (data && data.byModel) || [];
  const byLayer = (data && data.byLayer) || [];
  const trend = data && data.trend ? data.trend : null;

  // 趋势桶（按 layer 过滤/合并；全部 = l1+l2+l3 逐桶相加）
  let buckets: TrendBucket[] = [];
  if (trend && trend.byLayer) {
    if (layer === 'l1' || layer === 'l2' || layer === 'l3') {
      buckets = trend.byLayer[layer] || [];
    } else {
      const seqs = [trend.byLayer.l1 || [], trend.byLayer.l2 || [], trend.byLayer.l3 || []];
      const n = seqs[0]!.length;
      for (let i = 0; i < n; i++) {
        const merged: TrendBucket = { ts: 0, total: 0, byModel: {} };
        for (let s = 0; s < seqs.length; s++) {
          const seq = seqs[s]!;
          if (seq && seq[i]) {
            if (merged.ts === 0) merged.ts = seq[i]!.ts;
            merged.total += seq[i]!.total;
            Object.keys(seq[i]!.byModel).forEach((m) => {
              merged.byModel[m] = (merged.byModel[m] || 0) + seq[i]!.byModel[m]!;
            });
          }
        }
        buckets.push(merged);
      }
    }
  }

  // 折线模型 + maxY
  const models: string[] = [];
  const seen: Record<string, boolean> = {};
  buckets.forEach((b) => {
    Object.keys(b.byModel).forEach((m) => {
      if (!seen[m]) {
        seen[m] = true;
        models.push(m);
      }
    });
  });
  models.sort();
  let maxY = 1;
  buckets.forEach((b) => {
    if (b.total > maxY) maxY = b.total;
    models.forEach((m) => {
      if ((b.byModel[m] || 0) > maxY) maxY = b.byModel[m]!;
    });
  });

  // 层级×窗口表格数据（layer → {range: 格子}）
  const layerTable = byLayer.map((lc) => {
    const win: Record<string, (typeof lc.windows)[number]> = {};
    lc.windows.forEach((w) => {
      win[w.range] = w;
    });
    return { layer: lc.layer, win: win as Record<string, { outputTokens: number; avgOutputTokens: number; medianOutputTokens: number }> };
  });

  const cell = (lc: (typeof layerTable)[number], r: string, pick: (w: { outputTokens: number; avgOutputTokens: number; medianOutputTokens: number }) => number) => {
    const w = lc.win[r];
    return <td key={r}>{w ? fmtInt(pick(w)) : '0'}</td>;
  };

  return (
    <div>
      <div style={{ ...S.flexRow, marginBottom: 10 }}>
        <Segmented value={layer} options={LAYER_OPTS} onChange={setLayer} />
        <Segmented value={granularity} options={GRAN_OPTS} onChange={setGranularity} />
        <NButton
          onClick={() => {
            setRangeOpen(!rangeOpen);
          }}
        >
          {rangeDays > 0 ? '近 ' + rangeDays + ' 天' : '近N天'}
        </NButton>
        <div style={S.grow} />
        <NButton onClick={load}>刷新</NButton>
      </div>
      {rangeOpen ? (
        <div style={{ ...S.flexRow, marginBottom: 10 }}>
          <span style={S.muted}>展示近 N 天（正整数，清空=默认窗口；超出保留期后端自动回退）</span>
          <NInput
            value={rangeDays === 0 ? '' : String(rangeDays)}
            placeholder="如 30"
            style={{ width: 90 }}
            onChange={(e: { target: { value: string } }) => {
              const v = String(e.target.value || '').trim();
              if (v === '') {
                setRangeDays(0);
                return;
              }
              const n = Number(v);
              if (Number.isInteger(n) && n > 0 && n <= 3650) setRangeDays(n);
            }}
          />
        </div>
      ) : null}
      {error ? <div style={S.error}>{'成本读取失败：' + error}</div> : null}
      <div style={S.panelLabel}>成本趋势（按模型）</div>
      {buckets.length > 0 ? (
        <div>
          {renderCostChart(buckets, models, maxY, fmtDate, fmtInt, PALETTE)}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', margin: '6px 0 14px' }}>
            {models.map((m, mi) => {
              return (
                <span
                  key={'lg' + m}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--dsh-mem-text-2)' }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 4, background: PALETTE[mi % PALETTE.length], display: 'inline-block' }} />
                  {m}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <p style={S.muted}>{data ? '暂无成本数据（触发一次蒸馏后这里会出现趋势）。' : '加载中…'}</p>
      )}
      <div style={S.panelLabel}>层级成本（输出 token）</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <thead>
          <tr>
            <th style={thFirst}>层级</th>
            {RANGES.map((r) => {
              return (
                <th key={r} style={thStyle}>
                  {RANGE_LABELS[r]}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {layerTable.map((lc) => {
            return (
              <tr key={lc.layer}>
                <td style={tdFirst}>{lc.layer.toUpperCase()}</td>
                {RANGES.map((r) => cell(lc, r, (w) => w.outputTokens))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={S.panelLabel}>层级成本（单次 avg）</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <thead>
          <tr>
            <th style={thFirst}>层级</th>
            {RANGES.map((r) => {
              return (
                <th key={r} style={thStyle}>
                  {RANGE_LABELS[r] + '-avg'}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {layerTable.map((lc) => {
            return (
              <tr key={lc.layer}>
                <td style={tdFirst}>{lc.layer.toUpperCase()}</td>
                {RANGES.map((r) => cell(lc, r, (w) => w.avgOutputTokens))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={S.panelLabel}>层级成本（单次 median）</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <thead>
          <tr>
            <th style={thFirst}>层级</th>
            {RANGES.map((r) => {
              return (
                <th key={r} style={thStyle}>
                  {RANGE_LABELS[r] + '-median'}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {layerTable.map((lc) => {
            return (
              <tr key={lc.layer}>
                <td style={tdFirst}>{lc.layer.toUpperCase()}</td>
                {RANGES.map((r) => cell(lc, r, (w) => w.medianOutputTokens))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={S.panelLabel}>时间窗口总览</div>
      <div style={S.statGrid}>
        {windows.map((w) => {
          return (
            <div key={w.range} className="dsh-mem-card" style={S.statTile}>
              <div style={S.statNum}>{fmtInt(w.outputTokens + w.reasoningTokens)}</div>
              <div style={S.statLabel}>{RANGE_LABELS[w.range] + ' · 总输出 token'}</div>
              <div style={S.muted}>
                {'文字 ' + fmtInt(w.outputTokens) + ' · 思考 ' + fmtInt(w.reasoningTokens) + ' · ' + w.calls + ' 次调用'}
              </div>
            </div>
          );
        })}
      </div>
      {byModel.length > 0 ? (
        <div>
          <div style={S.panelLabel}>按模型（累计）</div>
          {byModel.map((m) => {
            const label = fmtModel(m.provider, m.model);
            return (
              <div key={'m-' + label} style={S.infoRow}>
                <span style={S.infoKey}>{label}</span>
                <span style={S.infoVal}>
                  {m.calls + ' 次 · 输出 ' + fmtInt(m.outputTokens) + ' · 思考 ' + fmtInt(m.reasoningTokens)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {data ? (
        <p style={S.hint}>输入按字符、输出/思考按 token 计；趋势图 Y 轴为输出 token，上方可切换层级与颗粒度。</p>
      ) : null}
    </div>
  );
}
