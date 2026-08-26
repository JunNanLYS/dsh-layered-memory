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
