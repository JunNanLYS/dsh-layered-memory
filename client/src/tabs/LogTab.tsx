/** Tab：运行日志。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { NButton } from '../ui/primitives.js';

export function LogTab(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  const load = useCallback(() => {
    setError(null);
    rpc('dsh-memory/log-tail', { lines: 200 })
      .then((r) => {
        if (r && r.ok) setLines(r.value.lines);
        else setError(r && r.error ? r.error.message : 'RPC error');
      })
      .catch((e: unknown) => {
        setError(String((e && (e as Error).message) || e));
      });
  }, [rpc]);

  useEffect(() => {
    load();
  }, [load]);
  // 默认滚到最底：看日志要看最新一条（tail 语义），加载/刷新后贴底
  useEffect(() => {
    if (lines && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [lines]);

  return (
    <div>
      <div style={{ ...S.flexRow, marginBottom: 10 }}>
        <span style={S.muted}>
          {error ? '加载失败' : lines === null ? '加载中…' : '最近 ' + lines.length + ' 行（memory.log）'}
        </span>
        <div style={S.grow} />
        <NButton onClick={load}>刷新</NButton>
      </div>
      {error ? (
        <div style={{ ...S.error, marginBottom: 10 }}>{'日志读取失败：' + error + '（点右上“刷新”重试）'}</div>
      ) : (
        <pre style={S.pre} ref={preRef}>
          {(lines || []).join('\n') || '(暂无日志)'}
        </pre>
      )}
    </div>
  );
}
