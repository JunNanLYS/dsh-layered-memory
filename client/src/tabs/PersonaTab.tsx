/** Tab：L3 画像。 */
import { useCallback, useEffect, useState } from 'react';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { NButton } from '../ui/primitives.js';

export function PersonaTab(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    rpc('dsh-memory/persona', {})
      .then((r) => {
        if (r && r.ok) setContent(r.value.content);
        else setError(r && r.error ? r.error.message : 'RPC error');
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
        <span style={S.muted}>
          {error ? '加载失败' : content === null ? '加载中…' : content ? content.length + ' 字符' : '未生成画像'}
        </span>
        <div style={S.grow} />
        <NButton onClick={load}>刷新</NButton>
      </div>
      {error ? (
        <div style={{ ...S.error, marginBottom: 10 }}>{'画像读取失败：' + error + '（点右上“刷新”重试）'}</div>
      ) : null}
      {content ? (
        <pre style={S.pre}>{content}</pre>
      ) : content === null ? null : (
        <p style={S.intro}>画像尚未生成；蒸馏若干记忆后 L3 会自动产出。</p>
      )}
    </div>
  );
}
