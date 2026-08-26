/**
 * 自绘下拉（NSel）：对齐 dsh MenuDropdown（输入栏模型选择器同款）观感。
 * 原生 <select> 的弹出列表是操作系统绘的（方角、系统高亮色），appearance:none
 * 只能改闭合态外壳——所以整件换成按钮触发 + 浮层面板：面板 12px 圆角 /
 * bg-pop / border-pop / shadow-pop，选项行 10px 圆角 + hover 底色 + 选中打勾。
 * 键盘 ↑↓ 移动（wrap）、回车/空格开面板与选定、Esc/外点/焦点离开收起；
 * 焦点始终留在触发钮上（keydown 从钮冒泡到包装层统一处理）。
 */
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface NSelOption {
  id: string;
  label: string;
}

export function NSel(props: {
  options?: NSelOption[];
  value: string;
  disabled?: boolean;
  placeholder?: string;
  style?: CSSProperties;
  onChange?(id: string): void;
}) {
  const options = props.options || [];
  const value = props.value || '';
  const disabled = !!props.disabled;
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  let selectedLabel = '';
  for (let si = 0; si < options.length; si++) {
    if (options[si]!.id === value) selectedLabel = options[si]!.label;
  }

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  // 键盘移动后把活动项滚进可视区（鼠标 hover 同步活动项索引）
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('[data-active="1"]');
    if (el && (el as HTMLElement).scrollIntoView) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [open, idx]);

  const indexOfValue = () => {
    for (let i = 0; i < options.length; i++) if (options[i]!.id === value) return i;
    return -1;
  };
  const closeMenu = (refocus: boolean) => {
    setOpen(false);
    setIdx(-1);
    if (refocus && wrapRef.current) {
      const btn = wrapRef.current.querySelector('button');
      if (btn && (btn as HTMLButtonElement).focus) (btn as HTMLButtonElement).focus();
    }
  };
  const pick = (id: string) => {
    closeMenu(true);
    if (id !== value && props.onChange) props.onChange(id);
  };
  const moveActive = (delta: number) => {
    const n = options.length;
    if (n === 0) return;
    let cur = idx >= 0 ? idx : indexOfValue();
    if (cur < 0) cur = delta > 0 ? -1 : 0;
    setIdx(delta > 0 ? ((cur + 1) % n + n) % n : ((cur - 1) % n + n) % n);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        closeMenu(true);
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setIdx(indexOfValue());
      } else moveActive(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (!open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
      setIdx(indexOfValue());
      return;
    }
    if (open && e.key === 'Enter') {
      e.preventDefault();
      let t = idx >= 0 ? idx : indexOfValue();
      if (t < 0) t = 0;
      if (options[t]) pick(options[t]!.id);
    }
  };
  const onBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (!open) return;
    const to = e.relatedTarget;
    if (!to || (wrapRef.current && !wrapRef.current.contains(to as Node))) setOpen(false);
  };

  return (
    <div className="dsh-mem-sel" style={props.style} ref={wrapRef} onKeyDown={onKey} onBlur={onBlur}>
      <button
        type="button"
        className={'dsh-mem-select' + (open ? ' dsh-mem-select-open' : '')}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) closeMenu(false);
          else {
            setOpen(true);
            setIdx(-1);
          }
        }}
      >
        <span className="dsh-mem-select-label">{selectedLabel || props.placeholder || '（请选择）'}</span>
        <span className={'dsh-mem-sel-chev' + (open ? ' dsh-mem-sel-chev-open' : '')} aria-hidden={true} />
      </button>
      {open && !disabled ? (
        <div className="dsh-mem-pop" ref={listRef} role="listbox">
          {options.length === 0 ? (
            <div className="dsh-mem-pop-empty">无选项</div>
          ) : (
            options.map((o, i) => {
              return (
                <button
                  type="button"
                  key={o.id}
                  className={'dsh-mem-pop-opt' + (o.id === value ? ' dsh-mem-pop-opt-on' : '')}
                  role="option"
                  aria-selected={o.id === value}
                  data-active={i === idx ? '1' : '0'}
                  // 阻断 mousedown 默认行为（抢焦点）：焦点留在触发钮上，避免
                  // blur-关面板把后续 click 吞掉（点选项无反应的事故根因）
                  onMouseDown={(e) => {
                    if (e.preventDefault) e.preventDefault();
                  }}
                  onClick={() => {
                    pick(o.id);
                  }}
                  onMouseEnter={() => {
                    if (idx !== i) setIdx(i);
                  }}
                >
                  <span className="dsh-mem-pop-opt-label">{o.label}</span>
                  {o.id === value ? <span className="dsh-mem-pop-check">✓</span> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
