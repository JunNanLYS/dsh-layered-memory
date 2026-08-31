/**
 * dsh 原生 UI 组件（官方 seed 模块 @deepseek-ai/dsh-client-ui-primitives，
 * 与宿主视觉完全一致）。宿主未注册该模块（老版本 dsh）时静默回退到
 * 本 bundle 的等效实现——degrade-don't-crash，与插件整体降级哲学一致。
 */
import { createElement, type ReactNode } from 'react';
import { hostRequire } from '../env.js';

/* 官方原语模块无类型发布，透传组件的 props 面按调用点宽容处理（any 限定在本文件）。 */

// guarded require：宿主 loader 对未注册模块 throw，这里必须吞掉
let P: any = null;
try {
  P = hostRequire('@deepseek-ai/dsh-client-ui-primitives') as any;
} catch {
  P = null;
}

/** 原语透传 props（原生专属字段 variant/icon 在回退路径被剥离）。 */
export interface NPrimitiveProps {
  [key: string]: any;
  children?: ReactNode;
}

/** 原生 Button（size sm）优先；回退 .dsh-mem-btn 类按钮（剥离原生专属 props）。 */
export function NButton(props: NPrimitiveProps) {
  if (P && P.Button) return createElement(P.Button, { size: 'sm', ...props });
  const rest = { ...props };
  delete rest.variant;
  delete rest.icon;
  rest.className = 'dsh-mem-btn' + (rest.className ? ' ' + rest.className : '');
  return createElement('button', rest);
}

/** 原生 Input 优先；回退 .dsh-mem-input 类输入框。
 * 原生 Input 是 span>input 结构且 rest 摊给内层 input——布局属性（flex/minWidth
 * 等）必须路由到外层，否则搜索框在 flex 工具栏里不再撑满。 */
export function NInput(props: NPrimitiveProps) {
  if (P && P.Input) {
    const inner = { ...props };
    const layoutStyle = inner.style;
    delete inner.style;
    return createElement('span', { style: layoutStyle }, createElement(P.Input, inner));
  }
  const rest = { ...props };
  rest.className = 'dsh-mem-input' + (rest.className ? ' ' + rest.className : '');
  return createElement('input', rest);
}

/** 原生 Modal 优先；回退 .dsh-mem-rb-overlay/.dsh-mem-rb-modal 模态。 */
export function NModal(props: NPrimitiveProps) {
  if (props.open === false) return null;
  if (P && P.Modal) return createElement(P.Modal, { closeLabel: '关闭', ...props });
  return createElement(
    'div',
    {
      className: 'dsh-mem-rb-overlay',
      onClick: (e: MouseEvent) => {
        if (e.target === e.currentTarget && props.onClose) props.onClose();
      },
    },
    createElement(
      'div',
      { className: 'dsh-mem-rb-modal' },
      props.title
        ? createElement('div', { style: { fontSize: 15, fontWeight: 600, marginBottom: 10 } }, props.title)
        : null,
      props.children,
      props.footer
        ? createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 } },
            props.footer,
          )
        : null,
    ),
  );
}

/* ── 原生 chevron 图标（primitives IconChevron*Outline14 优先；回退内联同款 path，
   path 逐字取自 dsh-client-ui-primitives lib/index.js——宿主在则跟随宿主更新） ── */

const CHEVRON_DOWN_14 =
  'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z';
const CHEVRON_RIGHT_14 =
  'M5.5 2.15137L5.92383 2.57617L8.65137 5.30273C8.90706 5.55843 9.13382 5.78438 9.29785 5.98828C9.46883 6.20088 9.61756 6.44405 9.66602 6.75C9.69222 6.91565 9.69222 7.08435 9.66602 7.25C9.61756 7.55595 9.46883 7.79912 9.29785 8.01172C9.13382 8.21561 8.90706 8.44157 8.65137 8.69727L5.92383 11.4238L5.5 11.8486L4.65137 11L5.07617 10.5762L7.80273 7.84863C8.07732 7.57405 8.24849 7.40124 8.3623 7.25977C8.46904 7.12709 8.47813 7.07728 8.48047 7.0625C8.48703 7.02105 8.48703 6.97895 8.48047 6.9375C8.47813 6.92272 8.46904 6.87291 8.3623 6.74023C8.24848 6.59876 8.07732 6.42595 7.80273 6.15137L5.07617 3.42383L4.65137 3L5.5 2.15137Z';

function iconFallback(d: string, props: NPrimitiveProps) {
  return createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', ...props },
    createElement('path', { d, fill: 'currentColor' }),
  );
}

/** 下向 chevron（原生芯片箭头同款）。 */
export function NIconChevronDown14(props: NPrimitiveProps) {
  if (P && P.IconChevronDownOutline14) return createElement(P.IconChevronDownOutline14, { size: 14, ...props });
  return iconFallback(CHEVRON_DOWN_14, props);
}

/** 右向 chevron（菜单行/披露/活动流行尾指示）。 */
export function NIconChevronRight14(props: NPrimitiveProps) {
  if (P && P.IconChevronRightOutline14) return createElement(P.IconChevronRightOutline14, { size: 14, ...props });
  return iconFallback(CHEVRON_RIGHT_14, props);
}
