/**
 * Tab：L2 场景。
 * 场景卡：默认收起（头部 + 摘要行），点击头部展开/收起正文——与记忆卡的
 * 点击展开范式同款（cursor pointer + card-hover 描边），箭头 ▸ 展开态旋转 90°。
 */
import { useCallback, useEffect, useState } from 'react';
import type { ScenesResponse } from '../../../src/contract.js';
import { fmtTime } from '../format.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { NButton } from '../ui/primitives.js';

function SceneCard(props: { s: ScenesResponse['items'][number] }) {
  const s = props.s;
  const [open, setOpen] = useState(false);
  return (
    <div className="dsh-mem-card dsh-mem-card-hover" style={S.card}>
      <div
        style={{ ...S.sceneHead, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className="dsh-mem-scene-chev" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
          ▸
        </span>
        <span style={S.sceneTitle}>{s.path}</span>
        {s.heat ? <span style={S.muted}>{'热度 ' + s.heat}</span> : null}
        <div style={S.grow} />
        <span style={S.muted}>{'更新 ' + fmtTime(s.updated)}</span>
      </div>
      {s.summary ? <div style={{ ...S.muted, marginBottom: 6 }}>{s.summary}</div> : null}
      {open ? <pre style={S.pre}>{s.content || '(空)'}</pre> : null}
    </div>
  );
}

export function ScenesTab(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [items, setItems] = useState<ScenesResponse['items'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    rpc('dsh-memory/scenes', {})
      .then((r) => {
        if (r && r.ok) {
          setItems(r.value.items);
          setError(null);
        } else setError(r && r.error ? r.error.message : 'RPC error');
      })
      .catch((e: unknown) => {
        setError(String((e && (e as Error).message) || e));
      });
  }, [rpc]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div style={{ ...S.flexRow, marginBottom: 10 }}>
        <span style={S.muted}>{items ? items.length + ' 个场景块' : '加载中…'}</span>
        <div style={S.grow} />
        <NButton onClick={load}>刷新</NButton>
      </div>
      {error ? <div style={S.error}>{error}</div> : null}
      {items && items.length === 0 ? (
        <p style={S.intro}>暂无场景块。累计 5 条新记忆后 L2 会自动整合出第一个场景。</p>
      ) : null}
      {(items || []).map((s) => {
        return <SceneCard key={s.path} s={s} />;
      })}
    </div>
  );
}
