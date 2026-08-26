/** Tab：L1 记忆浏览器。 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { ListRecordsRequest, UiRecord } from '../../../src/contract.js';
import { TYPE_LABELS, fmtTime } from '../format.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { NSel, type NSelOption } from '../ui/NSel.js';
import { NButton, NInput } from '../ui/primitives.js';

interface QueryConds {
  query: string;
  type: string;
  scene: string;
}

// 混合视图：两族类型都在库里，筛选器给全 7 类
const TYPE_CHOICES = [
  'persona',
  'episodic',
  'instruction',
  'work_fact',
  'work_task',
  'work_method',
  'work_artifact',
];

export function RecordsTab(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const limit = 50;

  const [items, setItems] = useState<UiRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [sceneOptions, setSceneOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sceneFilter, setSceneFilter] = useState('');

  // 最近一次实际查询条件（分页累积用）
  const [last, setLast] = useState<QueryConds>({ query: '', type: '', scene: '' });

  // 请求序列号：快速连续搜索/翻页时丢弃过期响应（慢的旧响应不得覆盖新结果）
  const seqRef = useRef(0);

  const fetchPage = useCallback(
    (conds: QueryConds, offset: number, append: boolean) => {
      setLoading(true);
      setError(null);
      const token = ++seqRef.current;
      const payload: ListRecordsRequest = { limit, offset };
      if (conds.query) payload.query = conds.query;
      if (conds.type) payload.type = conds.type;
      if (conds.scene) payload.scene = conds.scene;
      rpc('dsh-memory/list-records', payload)
        .then((r) => {
          if (token !== seqRef.current) return;
          setLoading(false);
          if (!r || !r.ok) {
            setError(r && r.error ? r.error.message : 'RPC error');
            return;
          }
          const v = r.value;
          setItems((prev) => (append ? prev.concat(v.items) : v.items));
          setHasMore(!!v.hasMore);
          setTotal(v.total === undefined || v.total === null ? null : v.total);
          setTruncated(!!v.truncated);
          if (v.scenes) setSceneOptions(v.scenes);
        })
        .catch((e: unknown) => {
          if (token !== seqRef.current) return;
          setLoading(false);
          setError(String((e && (e as Error).message) || e));
        });
    },
    [rpc],
  );

  const search = () => {
    const conds = { query: query.trim(), type: typeFilter, scene: sceneFilter };
    setLast(conds);
    fetchPage(conds, 0, false);
  };

  useEffect(() => {
    fetchPage({ query: '', type: '', scene: '' }, 0, false);
  }, [fetchPage]);

  const countText = total !== null ? '共 ' + total + ' 条' : items.length + ' 条' + (hasMore ? '+' : '');

  return (
    <div>
      <div style={S.toolbar}>
        <NInput
          style={{ flex: 1, minWidth: 160 }}
          placeholder="搜索记忆内容（BM25 关键词）…"
          value={query}
          onChange={(e: { target: { value: string } }) => {
            setQuery(e.target.value);
          }}
          onKeyDown={(e: ReactKeyboardEvent) => {
            if (e.key === 'Enter') search();
          }}
        />
        <NSel
          style={{ maxWidth: 200 }}
          options={([{ id: '', label: '全部类型' }] as NSelOption[]).concat(
            TYPE_CHOICES.map((t) => {
              return { id: t, label: TYPE_LABELS[t] || t };
            }),
          )}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <NSel
          style={{ maxWidth: 220 }}
          options={([{ id: '', label: '全部情境' }] as NSelOption[]).concat(
            sceneOptions.map((s) => {
              return { id: s, label: s.length > 24 ? s.slice(0, 24) + '…' : s };
            }),
          )}
          value={sceneFilter}
          onChange={setSceneFilter}
        />
        <NButton onClick={search}>搜索</NButton>
      </div>
      <div style={{ ...S.flexRow, marginBottom: 10 }}>
        <span style={S.muted}>{loading ? '加载中…' : countText}</span>
        <div style={S.grow} />
        <NButton
          onClick={() => {
            fetchPage(last, 0, false);
          }}
        >
          刷新
        </NButton>
      </div>
      {error ? <div style={S.error}>{error}</div> : null}
      {truncated ? (
        <div style={S.hint}>搜索分页已达检索上限（200 条），更早的结果未显示。请用更精确的关键词或类型/情境过滤。</div>
      ) : null}
      {items.length === 0 && !loading && !error ? (
        <p style={S.intro}>暂无记忆。对话几轮后，蒸馏管线会自动抽取记忆。</p>
      ) : (
        items.map((m) => {
          const open = expandedId === m.id;
          return (
            <div
              key={m.id}
              className="dsh-mem-card dsh-mem-card-hover"
              style={{ ...S.card, cursor: 'pointer' }}
              onClick={() => {
                setExpandedId(open ? null : m.id);
              }}
            >
              <div style={S.cardHead}>
                <span className={'dsh-mem-tag dsh-mem-tag-' + m.type}>{TYPE_LABELS[m.type] || m.type}</span>
                <span style={S.muted}>{'优先级 ' + m.priority}</span>
                {m.score !== null && m.score !== undefined ? (
                  <span style={S.muted}>{'相关度 ' + Number(m.score).toFixed(2)}</span>
                ) : null}
                <div style={S.grow} />
                <span style={S.muted}>{fmtTime(m.updatedAt)}</span>
              </div>
              <div style={S.content}>{m.content}</div>
              {open ? (
                <div style={S.detail}>
                  {'id: ' +
                    m.id +
                    '\n' +
                    '情境: ' +
                    (m.scene || '-') +
                    '\n' +
                    '版本: v' +
                    m.version +
                    '（去重合并次数 ' +
                    m.version +
                    '）\n' +
                    '创建: ' +
                    fmtTime(m.createdAt) +
                    '\n' +
                    '活跃时间: ' +
                    (m.timestamps && m.timestamps.length > 0 ? m.timestamps.map(fmtTime).join(' → ') : '-') +
                    '\n' +
                    (m.sourceMessageIds && m.sourceMessageIds.length > 0
                      ? '来源消息: ' + m.sourceMessageIds.join(', ')
                      : '来源消息: -')}
                </div>
              ) : null}
            </div>
          );
        })
      )}
      {hasMore ? (
        <div style={S.flexRow}>
          <div style={S.grow} />
          <NButton
            disabled={loading}
            onClick={() => {
              if (!loading) fetchPage(last, items.length, true);
            }}
          >
            {loading ? '加载中…' : '加载更多'}
          </NButton>
        </div>
      ) : null}
    </div>
  );
}
