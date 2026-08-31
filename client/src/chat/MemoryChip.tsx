/**
 * 会话记忆芯片（UI 重构分散式，spec v2 §4）：输入栏内的官方 composer chip 语法控件，
 * 文字即解析真值（范围 / 只写 / 暂停 / 降级）。点击弹出级联菜单：
 *  - 「记忆范围」行：点击在菜单内联展开记忆滑条（grid-rows 生长动画），拖拽/点轨
 *    切换 日常/工作/智能，芯片文字随拖拽实时联动；滑条展开期间数据流行隐藏；
 *  - 「数据流」行：hover 子面板四态（跟随全局/读写/只写/暂停），仅 hover 展开
 *    （桥接热区防慢速断链），点击行本身不固定子面板。
 * 占用明细不在会话面（唯一展示处 = 官方上下文环面板的记忆分项小节）。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { currentMeterSnapshot, initOccupancyIndicator, noteOccupancySession, watchContextMeter } from '../meter/occupancy-indicator.js';
import { initPanelSection } from '../meter/panel-section.js';
import { t } from '../i18n.js';
import type { RpcFn } from '../rpc.js';
import { watchSidebarIcon } from '../sidebar-icon.js';
import { ensureThemeStyle } from '../theme.js';

/** 官方原语的 guarded require（浮动面板限高钩子；宿主缺模块时回退本地实现）。 */
import { hostRequire } from '../env.js';
import { NIconChevronDown14, NIconChevronRight14 } from '../ui/primitives.js';
const PRIMS = (() => {
  try {
    return hostRequire('@deepseek-ai/dsh-client-ui-primitives') as {
      useAnchoredMaxHeight?: (ref: { current: HTMLElement | null }, cap: number, signal: unknown) => number;
    } | null;
  } catch {
    return null;
  }
})();

/** 范围滑条的三档（左→右即滑轨顺序）；off 不在滑条上——暂停属于数据流维度。 */
const SLIDER_SCOPES = ['chat', 'work', 'auto'] as const;
type ScopeKey = (typeof SLIDER_SCOPES)[number];
const FLOW_KEYS = ['follow', 'rw', 'wo', 'paused'] as const;
type FlowKey = (typeof FLOW_KEYS)[number];

const scopeLabel = (k: string): string => t('scope.' + k);
const flowLabel = (k: string): string => t('flow.' + k);

/** 本地限高回退（宿主原语缺失时）：按视口顶部余量夹住设计上限。 */
function useMaxHeightFallback(ref: { current: HTMLElement | null }, cap: number, signal: unknown): number {
  const [mh, setMh] = useState(cap);
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      setMh(Math.min(cap, Math.max(0, el.getBoundingClientRect().bottom - 12)));
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', fit, true);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', fit, true);
    };
  }, [ref, cap, signal]);
  return mh;
}
const useMenuMaxHeight = PRIMS?.useAnchoredMaxHeight ?? useMaxHeightFallback;

export function MemoryChip(props: { rpc: RpcFn; sessionId?: string; session?: { sessionId?: string } }) {
  const rpc = props.rpc;
  const sessionId = props.sessionId || (props.session && props.session.sessionId);
  const [mode, setMode] = useState<string | null>(null); // null = 加载中
  const [recall, setRecall] = useState<boolean | null>(null);
  const [recallResolved, setRecallResolved] = useState(true);
  /** 暂停恢复快照（spec v2 §4.5）：host 记录的暂停前范围；旧 host 缺省时回退默认档。 */
  const [resumeScope, setResumeScope] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sliderOpen, setSliderOpen] = useState(false);
  /** 拖拽预览：滑条拖动期间芯片文字实时跟随（只在跨档时更新，拖完清空）。 */
  const [previewScope, setPreviewScope] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
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
          const resume = (r.value as { resume?: { scope: string } | null }).resume;
          setResumeScope(resume ? resume.scope : null);
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

  // 侧边栏书本 icon 补丁与官方环观察器都由常驻芯片驱动（body 级单例，多实例幂等）
  useEffect(() => {
    watchSidebarIcon();
  }, []);
  useEffect(() => {
    initOccupancyIndicator((endpoint, payload) =>
      rpc(endpoint as Parameters<RpcFn>[0], payload as Parameters<RpcFn>[1]),
    );
    initPanelSection(currentMeterSnapshot);
    watchContextMeter();
    noteOccupancySession(sessionId ?? null);
  }, [sessionId, rpc]);

  // 菜单打开期间：外部 pointerdown / Escape 关闭（pointerdown 三类指针通吃）
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setSliderOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSliderOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  /** 乐观提交档位（范围/暂停共用）；RPC 失败回滚，token 丢弃过期会话响应。 */
  const commitMode = (next: string) => {
    if (!rpc || !sessionId || mode === null || next === mode) return;
    const prev = mode;
    const token = seqRef.current;
    setMode(next);
    setError(null);
    rpc('dsh-memory/session-mode-set', { sessionId, mode: next as 'auto' })
      .then((r) => {
        if (token !== seqRef.current) return;
        if (!r || !r.ok) {
          setMode(prev);
          setError((r && r.error ? r.error.message : '') || 'mode set failed');
        } else {
          // 暂停快照跟随权威响应：进 off 带出暂停前范围，恢复非 off 清空
          // （滑条/菜单的显示值与 applyFlow 的恢复目标都依赖这份本地态，审查 P1-3）
          setResumeScope(r.value.resume ? r.value.resume.scope : null);
        }
      })
      .catch((e: unknown) => {
        if (token !== seqRef.current) return;
        setMode(prev);
        setError(String((e && (e as Error).message) || e));
      });
  };

  /** 数据流四态应用：暂停 = 切 off（host 记录恢复快照）；从暂停恢复 = 恢复范围 +
   *  该数据流态合并提交（单 RPC 无部分提交）。 */
  const applyFlow = (k: FlowKey) => {
    if (!rpc || !sessionId || mode === null) return;
    if (k === 'paused') {
      commitMode('off');
      return;
    }
    const targetScope = paused ? (resumeScope ?? 'auto') : (mode as string);
    const recallVal: boolean | null = k === 'rw' ? true : k === 'wo' ? false : null;
    if (!paused && recallVal === recall) return; // 无变化
    const prevMode = mode;
    const prevRecall = recall;
    const prevResolved = recallResolved;
    const token = seqRef.current;
    setMode(targetScope);
    setRecall(recallVal);
    if (recallVal !== null) setRecallResolved(recallVal);
    setError(null);
    rpc('dsh-memory/session-mode-set', { sessionId, mode: targetScope as 'auto', recall: recallVal })
      .then((r) => {
        if (token !== seqRef.current) return;
        if (!r || !r.ok) {
          setMode(prevMode);
          setRecall(prevRecall);
          setRecallResolved(prevResolved);
          setError((r && r.error ? r.error.message : '') || 'flow set failed');
        } else {
          setRecall(r.value.recall);
          setRecallResolved(r.value.recallResolved);
          const resume = (r.value as { resume?: { scope: string } | null }).resume;
          setResumeScope(resume ? resume.scope : null);
        }
      })
      .catch((e: unknown) => {
        if (token !== seqRef.current) return;
        setMode(prevMode);
        setRecall(prevRecall);
        setRecallResolved(prevResolved);
        setError(String((e && (e as Error).message) || e));
      });
  };

  if (!sessionId || !rpc) return null;
  ensureThemeStyle();

  const paused = mode === 'off';
  const scope = paused ? (resumeScope ?? 'auto') : (mode ?? 'auto');
  const flow: FlowKey = paused ? 'paused' : recall === false ? 'wo' : recall === true ? 'rw' : 'follow';
  const shownScope = previewScope ?? scope;
  // 芯片文字 = 解析真值：暂停 > 只写 > 范围；拖拽预览期间范围实时跟随
  const label = paused
    ? `${t('chip.base')} · ${t('chip.paused')}`
    : `${t('chip.base')} · ${t('scope.' + shownScope)}${recallResolved ? '' : ' · ' + t('chip.wo')}`;

  const toggleMenu = () => {
    if (error) load();
    setSliderOpen(false);
    setMenuOpen(!menuOpen);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="dsh-mem-mchip"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={error ? t('err.load') : t('chip.title')}
        onClick={toggleMenu}
      >
        {paused ? <span className="dsh-mem-mchip-dot" aria-hidden={true} /> : null}
        <span className="mc-label">{label}</span>
        {/* 原生芯片 chevron：primitives IconChevronDownOutline14 优先（回退内联同款 path） */}
        <span className="dsh-mem-mchip-chev" aria-hidden={true}>
          <NIconChevronDown14 />
        </span>
      </button>
      {menuOpen ? (
        <div className="dsh-mem-menu" ref={menuRef} role="menu" aria-label={t('chip.base')}>
          <button
            type="button"
            className={'dsh-mem-pop-opt dsh-mem-sl-row' + (sliderOpen ? ' on' : '')}
            disabled={paused}
            aria-expanded={sliderOpen}
            onClick={() => setSliderOpen(!sliderOpen)}
          >
            <span className="dsh-mem-pop-opt-label">{t('row.scope')}</span>
            <span className="dsh-mem-subval">{scopeLabel(shownScope)}</span>
            <span className="dsh-mem-subchev" aria-hidden={true}>
              <NIconChevronRight14 />
            </span>
          </button>
          <div className={'dsh-mem-sl-reveal' + (sliderOpen ? ' open' : '')}>
            <div className="dsh-mem-sl-inner">
              <div className="dsh-mem-sl-labels" aria-hidden={true}>
                <span>{scopeLabel('chat')}</span>
                <span>{scopeLabel('work')}</span>
                <span>{scopeLabel('auto')}</span>
              </div>
              <ScopeSlider
                scope={scope}
                disabled={paused}
                onPreview={(k) => setPreviewScope(k)}
                onCommit={(k) => {
                  setPreviewScope(null);
                  commitMode(k);
                }}
              />
            </div>
          </div>
          <div className="dsh-mem-subwrap" hidden={sliderOpen}>
            {/* 触发行：键盘聚焦也揭示子面板（spec §12 键盘通路）；鼠标点击不夺焦——
                保持"点击不固定子卡片"的既定裁定（hover 是鼠标唯一揭示方式） */}
            <button
              type="button"
              className="dsh-mem-pop-opt"
              tabIndex={0}
              aria-haspopup="menu"
              onMouseDown={(e) => {
                e.preventDefault();
              }}
            >
              <span className="dsh-mem-pop-opt-label">{t('row.flow')}</span>
              <span className="dsh-mem-subval">{flowLabel(flow)}</span>
              <span className="dsh-mem-subchev" aria-hidden="true">
                <NIconChevronRight14 />
              </span>
            </button>
            <div className="dsh-mem-sub" role="menu" aria-label={t('row.flow')}>
              {FLOW_KEYS.map((k) => (
                <button
                  type="button"
                  key={k}
                  role="menuitemradio"
                  aria-checked={flow === k}
                  className={'dsh-mem-pop-opt' + (flow === k ? ' on' : '')}
                  onClick={() => {
                    applyFlow(k);
                    setMenuOpen(false);
                    setSliderOpen(false);
                  }}
                >
                  <span className="dsh-mem-pop-opt-label">{flowLabel(k)}</span>
                  {flow === k ? <span className="dsh-mem-pop-check">✓</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {error ? (
        <div role="alert" style={{ position: 'absolute', top: '100%', left: 0, fontSize: 11, color: 'var(--dsh-mem-danger)', whiteSpace: 'nowrap', zIndex: 2 }}>
          {t('err.load')}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 范围滑条（Codex 式内联滑条，主题令牌配色）：灰胶囊轨 + 品牌蓝填充 + 白圆钮 +
 * 三停点 + 上方档位标签；拖拽 1:1 跟手、跨档即通知父级（芯片文字实时联动），
 * 松手按动量投影吸附最近档（投影量 clamp 半档，绝不跳两档——旧 ModeSlider 同语义）。
 * 键盘：圆钮 role=slider，方向键 ±1 档、Home/End 到两端。
 */
function ScopeSlider(props: {
  scope: string;
  disabled: boolean;
  onPreview(key: string): void;
  onCommit(key: string): void;
}) {
  ensureThemeStyle();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const idx = Math.max(0, SLIDER_SCOPES.indexOf(props.scope as ScopeKey));

  /** 静止位：百分比 calc 表达（展开动画期间宽度未定，不能用像素量测）。 */
  const place = (i: number) => {
    const f = i / (SLIDER_SCOPES.length - 1);
    if (thumbRef.current) thumbRef.current.style.left = `calc((100% - 22px) * ${f} + 11px)`;
    if (fillRef.current) fillRef.current.style.width = `calc((100% - 22px) * ${f} + 22px)`;
  };
  useLayoutEffect(() => {
    if (!dragging) place(idx);
  });

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (props.disabled || dragging) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const rect = trackRef.current!.getBoundingClientRect();
    const max = rect.width - 22;
    let last = idx;
    const onMove = (ev: PointerEvent) => {
      const x = Math.max(11, Math.min(11 + max, ev.clientX - rect.left));
      if (thumbRef.current) thumbRef.current.style.left = x + 'px';
      if (fillRef.current) fillRef.current.style.width = x + 11 + 'px';
      const ni = Math.round((x - 11) / max * (SLIDER_SCOPES.length - 1));
      if (ni !== last) {
        last = ni;
        props.onPreview(SLIDER_SCOPES[ni]!);
      }
    };
    const onUp = (ev: PointerEvent) => {
      thumbRef.current?.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDragging(false);
      const x = Math.max(11, Math.min(11 + max, ev.clientX - rect.left));
      props.onCommit(SLIDER_SCOPES[Math.round((x - 11) / max * (SLIDER_SCOPES.length - 1))]!);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (props.disabled) return;
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, idx - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(SLIDER_SCOPES.length - 1, idx + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = SLIDER_SCOPES.length - 1;
    if (next === null) return;
    e.preventDefault();
    props.onCommit(SLIDER_SCOPES[next]!);
  };

  const dots = SLIDER_SCOPES.map((_, i) => (
    <span
      key={i}
      className="dsh-mem-sl-dot"
      style={{ left: `calc((100% - 22px) * ${i / (SLIDER_SCOPES.length - 1)} + 11px)` }}
    />
  ));

  return (
    <div
      ref={trackRef}
      className="dsh-mem-sl-track"
      style={props.disabled ? { opacity: 0.45, cursor: 'default' } : undefined}
      onPointerDown={startDrag}
    >
      <div ref={fillRef} className="dsh-mem-sl-fill" />
      {dots}
      <div
        ref={thumbRef}
        className={'dsh-mem-sl-thumb' + (dragging ? ' dragging' : '')}
        role="slider"
        tabIndex={props.disabled ? -1 : 0}
        aria-label={t('row.scope')}
        aria-valuemin={0}
        aria-valuemax={SLIDER_SCOPES.length - 1}
        aria-valuenow={idx}
        aria-valuetext={scopeLabel(SLIDER_SCOPES[idx]!)}
        onKeyDown={onKeyDown}
      >
        {dragging ? <div className="dsh-mem-bubble" style={{ left: '50%' }}>{scopeLabel(SLIDER_SCOPES[idx]!)}</div> : null}
      </div>
    </div>
  );
}
