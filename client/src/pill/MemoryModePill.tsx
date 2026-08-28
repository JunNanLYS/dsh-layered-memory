/** 输入栏 pill：点击展开滑动选择器；props 来自 conversation.input.left 的 zone 注入。 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { currentMeterSnapshot, initOccupancyIndicator, noteOccupancySession, watchContextMeter } from '../meter/occupancy-indicator.js';
import { initPanelSection } from '../meter/panel-section.js';
import type { RpcFn } from '../rpc.js';
import { watchSidebarIcon } from '../sidebar-icon.js';
import { ensureThemeStyle } from '../theme.js';
import { ModeSlider } from './ModeSlider.js';
import { modeInfo } from './modes.js';

export function MemoryModePill(props: {
  rpc: RpcFn;
  sessionId?: string;
  session?: { sessionId?: string };
}) {
  const rpc = props.rpc;
  const sessionId = props.sessionId || (props.session && props.session.sessionId);
  const [mode, setMode] = useState<string | null>(null);
  // 会话级注入覆盖（#38 只写不读）：null = 跟随全局；recallResolved = host 解析后的
  // 生效值（面文直接消费——client 不另知全局开关，解析权威在 host）
  const [recall, setRecall] = useState<boolean | null>(null);
  const [recallResolved, setRecallResolved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // 请求序列号：快速切换会话时丢弃旧会话的过期响应（慢响应不得覆盖新会话档位）
  const seqRef = useRef(0);

  const load = useCallback(() => {
    if (!sessionId || !rpc) return;
    const token = ++seqRef.current;
    setError(null);
    rpc('dsh-memory/session-mode-get', { sessionId })
      .then((r) => {
        if (token !== seqRef.current) return;
        if (r && r.ok && r.value) {
          setMode(r.value.mode);
          setRecall(r.value.recall);
          setRecallResolved(r.value.recallResolved);
        } else setError(r && !r.ok ? r.error.message : 'RPC error');
      })
      .catch((e: unknown) => {
        if (token !== seqRef.current) return;
        setError(String((e && (e as Error).message) || e));
      });
  }, [sessionId, rpc]);

  useEffect(() => {
    load();
  }, [load]);

  // 侧边栏书本 icon 补丁由常驻 pill 驱动（MemoryPanel 只在记忆分节激活时挂载，
  // 覆盖不了"打开设置第一眼"的场景）；body 级观察器全局单例，多实例幂等
  useEffect(() => {
    watchSidebarIcon();
  }, []);

  // 占用指示器（外圈记忆光晕弧）同款驱动：观察器单例常驻，数据通道与会话在此接线。
  //sessionId 变化即冷启动检查（无缓存才发首次拉取）；rpc 端点为 session-stats。
  useEffect(() => {
    initOccupancyIndicator((endpoint, payload) =>
      rpc(endpoint as Parameters<RpcFn>[0], payload as Parameters<RpcFn>[1]),
    );
    initPanelSection(currentMeterSnapshot);
    watchContextMeter();
    noteOccupancySession(sessionId ?? null);
  }, [sessionId, rpc]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** 乐观提交：立即更新 UI，RPC 失败回滚并提示。 */
  const commit = (next: string) => {
    if (!rpc || next === mode) return;
    const prev = mode;
    setMode(next);
    setError(null);
    rpc('dsh-memory/session-mode-set', { sessionId: sessionId!, mode: next as 'auto' })
      .then((r) => {
        if (!r || !r.ok) {
          setMode(prev);
          setError(r && r.error ? '档位写入失败：' + r.error.message : '档位写入失败');
        }
      })
      .catch((e: unknown) => {
        setMode(prev);
        setError('档位写入失败：' + String((e && (e as Error).message) || e));
      });
  };

  /** 注入覆盖提交（#38）：null = 清除覆盖（跟随全局）；显式传 mode（host 侧缺省
   *  recall 不动现值）。清除后的解析值（= 全局）只有 host 知道，以 set 响应回填。 */
  const commitRecall = (next: boolean | null) => {
    if (!rpc || !sessionId || next === recall) return;
    const prevRecall = recall;
    const prevResolved = recallResolved;
    setRecall(next);
    if (next !== null) setRecallResolved(next);
    setError(null);
    rpc('dsh-memory/session-mode-set', { sessionId, mode: (mode ?? 'auto') as 'auto', recall: next })
      .then((r) => {
        if (!r || !r.ok) {
          setRecall(prevRecall);
          setRecallResolved(prevResolved);
          setError(r && r.error ? '注入设置失败：' + r.error.message : '注入设置失败');
        } else {
          setRecall(r.value.recall);
          setRecallResolved(r.value.recallResolved);
        }
      })
      .catch((e: unknown) => {
        setRecall(prevRecall);
        setRecallResolved(prevResolved);
        setError('注入设置失败：' + String((e && (e as Error).message) || e));
      });
  };

  if (!sessionId || !rpc) return null;
  const info = modeInfo(mode);
  const loaded = mode !== null;
  // 关闭档与其余三档二分：关闭 = dsh 透明按钮（无边框无底无光晕）；
  // 日常/工作/智能 = 同款流光 + 光晕，档位区分靠蓝阶文字色与流光内底混色深度
  const isOff = loaded && mode === 'off';
  const isFlow = loaded && !isOff;
  // 面文换字（#38 方案 A）：非 off 且注入生效值为否 → 面文整词换作「只写」，
  // 族名收进菜单（注入态优先上脸）；off 档维持「关闭」灰态优先（完全隐身不含只写）
  const faceLabel = !loaded ? (error ? '⚠' : '…') : isOff ? info.label : !recallResolved ? '只写' : info.label;

  ensureThemeStyle();

  const pillStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 24,
    padding: '0 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: '20px',
    cursor: 'pointer',
    // 流光档的边框/背景由 .dsh-mem-flow 的双层背景提供（流光边 + 不透明内底），
    // inline 只给文字色 / 光晕 / 流光内底混色通道（--dsh-mem-pill-tint）
    color: isFlow ? info.color : 'var(--dsh-mem-text-2)',
  } as CSSProperties & Record<string, string | number>;
  if (isFlow) {
    pillStyle.boxShadow = '0 0 12px color-mix(in srgb, ' + info.color + ' 30%, transparent)';
    pillStyle['--dsh-mem-pill-tint'] = info.color;
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        title={error ? '档位读取失败：' + error + '（点击重试）' : '本会话记忆档位（点击切换）'}
        onClick={() => {
          if (error) load();
          setOpen(!open);
        }}
        className={isFlow ? 'dsh-mem-flow' : 'dsh-mem-pill-off'}
        style={pillStyle}
      >
        记忆 · <span>{faceLabel}</span>
      </button>
      {open ? (
        <ModeSlider
          mode={mode || 'auto'}
          onCommit={commit}
          recall={recall}
          onCommitRecall={commitRecall}
          error={error}
          rpc={rpc}
          sessionId={sessionId}
        />
      ) : null}
    </div>
  );
}
