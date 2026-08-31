/**
 * 工作台·记忆库：只读资产活动流（L1 记忆 / L2 场景 / L3 画像按更新时间混排）。
 * 数据源：dsh-memory/asset-activity（游标分页 + 类型/族/时间/关键词筛选）。
 * 修改不在此处发生——资产经由对话蒸馏演进（spec v2 §6 只读定位）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetActivityItem } from '../../../src/contract.js';
import { fmtAgoLocal, t, tpl, typeLabel } from '../i18n.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { NButton, NInput } from '../ui/primitives.js';
import { Segmented } from '../ui/controls.js';
import { Chevron, FamilyTag, KindTag, VerbTag } from './common.js';

const PAGE_LIMIT = 30;
const DEBOUNCE_MS = 300;

type KindFilter = '' | 'l1' | 'l2' | 'l3';
type FamilyFilter = '' | 'chat' | 'work';
type TimeFilter = '' | 'today' | 'd7' | 'd30';

function sinceFor(time: TimeFilter): number {
  if (time === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (time === 'd7') return Date.now() - 7 * 24 * 3600_000;
  if (time === 'd30') return Date.now() - 30 * 24 * 3600_000;
  return 0;
}

export function Library(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [items, setItems] = useState<AssetActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('');
  const [family, setFamily] = useState<FamilyFilter>('');
  const [time, setTime] = useState<TimeFilter>('');

  // 请求序列号：快速连续筛选时丢弃过期响应
  const seqRef = useRef(0);

  const fetchPage = useCallback(
    (append: boolean, cur: string | null) => {
      const token = ++seqRef.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      const payload: Record<string, unknown> = { limit: PAGE_LIMIT, cursor: cur ?? undefined };
      if (query.trim()) payload.query = query.trim();
      if (kind) payload.kind = kind;
      if (family) payload.family = family;
      const since = sinceFor(time);
      if (since > 0) payload.since = since;
      rpc('dsh-memory/asset-activity', payload)
        .then((r) => {
          if (token !== seqRef.current) return;
          if (append) setLoadingMore(false);
          else setLoading(false);
          if (!r || !r.ok) {
            setError(r && r.error ? r.error.message : 'RPC error');
            return;
          }
          setItems((prev) => (append ? prev.concat(r.value.items) : r.value.items));
          setCursor(r.value.nextCursor);
          setTruncated(!!r.value.truncated);
        })
        .catch((e: unknown) => {
          if (token !== seqRef.current) return;
          if (append) setLoadingMore(false);
          else setLoading(false);
          setError(String((e && (e as Error).message) || e));
        });
    },
    [rpc, query, kind, family, time],
  );

  // 筛选变化重拉第一页；关键词输入经 300ms 防抖（FTS 检索不逐键打）
  useEffect(() => {
    const h = setTimeout(() => {
      fetchPage(false, null);
    }, query ? DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage]);

  const filtered = !!(query.trim() || kind || family || time);

  const copy = (item: AssetActivityItem) => {
    const text = item.title + '\n' + item.content;
    const done = () => {
      setCopiedId(item.id);
      setTimeout(() => {
        setCopiedId((cur) => (cur === item.id ? null : cur));
      }, 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(done)
        .catch(() => {
          setCopiedId(null);
        });
    }
  };

  const metaRow = (label: string, value: string) => (
    <div key={label} style={{ display: 'contents' }}>
      <dt style={{ color: 'var(--dsh-mem-text-3)', fontSize: 12 }}>{label}</dt>
      <dd style={{ color: 'var(--dsh-mem-text-2)', fontSize: 12, margin: 0, wordBreak: 'break-all' }}>{value}</dd>
    </div>
  );

  const row = (item: AssetActivityItem) => {
    const open = expandedId === item.id;
    return (
      <div key={item.id} className={'dsh-mem-feed-row' + (open ? ' open' : '')}>
        <button
          className="dsh-mem-feed-head"
          aria-expanded={open}
          onClick={() => {
            setExpandedId(open ? null : item.id);
          }}
        >
          <VerbTag verb={item.verb} />
          <KindTag kind={item.kind} />
          <span className="dsh-mem-feed-title">{item.title}</span>
          <span className="dsh-mem-feed-time">{fmtAgoLocal(item.updatedAt) ?? '-'}</span>
          <Chevron />
        </button>
        {open ? (
          <div style={{ padding: '2px 2px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                background: 'var(--dsh-mem-bg-inset)',
                border: '1px solid var(--dsh-mem-border)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 12.5,
                lineHeight: '20px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--dsh-mem-text-1)',
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              {item.content}
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 14px', margin: 0 }}>
              {item.kind === 'l1' && item.scene ? metaRow(t('lib.meta.scene'), item.scene) : null}
              {item.kind === 'l1' && item.l1Type ? metaRow(t('lib.meta.type'), typeLabel(item.l1Type)) : null}
              {metaRow(t('lib.meta.created'), fmtAgoLocal(item.createdAt) ?? '-')}
              {metaRow(t('lib.meta.updated'), fmtAgoLocal(item.updatedAt) ?? '-')}
              {item.version !== null ? metaRow(t('lib.meta.version'), 'v' + item.version) : null}
              {item.sourceSession ? metaRow(t('lib.meta.source'), item.sourceSession) : null}
            </dl>
            <div style={{ ...S.flexRow }}>
              <FamilyTag family={item.family} />
              <div style={S.grow} />
              <NButton onClick={() => { copy(item); }}>
                {copiedId === item.id ? t('ws.copied') : t('ws.copy')}
              </NButton>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      <div style={S.toolbar}>
        <NInput
          style={{ flex: 1, minWidth: 160 }}
          placeholder={t('lib.search')}
          value={query}
          onChange={(e: { target: { value: string } }) => {
            setQuery(e.target.value);
          }}
        />
        <NButton
          onClick={() => {
            fetchPage(false, null);
          }}
        >
          {t('ws.refresh')}
        </NButton>
      </div>
      <div style={{ ...S.toolbar, marginBottom: 8 }}>
        <Segmented
          value={kind}
          options={[
            { key: '', label: t('ws.all') },
            { key: 'l1', label: t('kind.l1') },
            { key: 'l2', label: t('kind.l2') },
            { key: 'l3', label: t('kind.l3') },
          ]}
          onChange={(k) => { setKind(k as KindFilter); }}
        />
        <Segmented
          value={family}
          options={[
            { key: '', label: t('ws.all') },
            { key: 'chat', label: t('scope.chat') },
            { key: 'work', label: t('scope.work') },
          ]}
          onChange={(k) => { setFamily(k as FamilyFilter); }}
        />
        <Segmented
          value={time}
          options={[
            { key: '', label: t('ws.all') },
            { key: 'today', label: t('lib.time.today') },
            { key: 'd7', label: t('lib.time.d7') },
            { key: 'd30', label: t('lib.time.d30') },
          ]}
          onChange={(k) => { setTime(k as TimeFilter); }}
        />
      </div>
      <div style={{ ...S.flexRow, marginBottom: 8 }}>
        <span style={S.muted}>
          {loading ? t('ws.loading') : tpl(filtered ? 'lib.countFiltered' : 'lib.count', { n: items.length })}
        </span>
      </div>
      {error ? (
        <div style={{ ...S.flexRow, justifyContent: 'space-between', marginTop: 0, marginBottom: 8 }}>
          <span style={{ color: 'var(--dsh-mem-danger)', fontSize: 13 }}>{error}</span>
          {items.length > 0 ? (
            <NButton
              onClick={() => {
                fetchPage(false, null);
              }}
            >
              {t('ws.retry')}
            </NButton>
          ) : null}
        </div>
      ) : null}
      {truncated ? <div style={{ ...S.hint, marginTop: 0 }}>{t('lib.truncated')}</div> : null}
      {items.length === 0 && !loading && !error ? (
        <div className="dsh-mem-card" style={{ ...S.card, padding: '30px 10px', textAlign: 'center' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--dsh-mem-text-1)' }}>{t('lib.empty')}</h3>
          <p style={S.hint}>{t('lib.emptyHint')}</p>
        </div>
      ) : (
        <div className="dsh-mem-card" style={{ ...S.card, padding: '2px 10px' }}>{items.map(row)}</div>
      )}
      {cursor ? (
        <div style={S.flexRow}>
          <div style={S.grow} />
          <NButton
            disabled={loadingMore}
            onClick={() => {
              if (!loadingMore) fetchPage(true, cursor);
            }}
          >
            {loadingMore ? t('lib.loadingMore') : t('lib.more')}
          </NButton>
        </div>
      ) : null}
    </div>
  );
}
