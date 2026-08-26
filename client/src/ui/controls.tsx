/** Switch / SwitchRow / Segmented：轻量自绘控件（S 布局 + theme 类交互态）。 */
import type { ReactNode } from 'react';
import { S } from '../styles.js';

export function Switch(props: { checked?: boolean; disabled?: boolean; onChange?(v: boolean): void }) {
  const on = !!props.checked;
  const disabled = !!props.disabled;
  const base: typeof S.switch = { ...S.switch, ...(on ? S.switchOn : S.switchOff), ...(disabled ? S.switchDisabled : null) };
  return (
    <div
      style={base}
      onClick={() => {
        if (!disabled && props.onChange) props.onChange(!on);
      }}
    >
      <span style={{ ...S.knob, left: on ? 18 : 2 }} />
    </div>
  );
}

export function SwitchRow(props: {
  label?: ReactNode;
  desc?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  onChange?(v: boolean): void;
}) {
  return (
    <div style={S.switchRow}>
      <Switch checked={props.checked} disabled={props.disabled} onChange={props.onChange} />
      <div>
        <div style={S.switchLabel}>{props.label}</div>
        <div style={S.switchDesc}>{props.desc || ''}</div>
      </div>
    </div>
  );
}

export interface SegOption {
  key: string;
  label: ReactNode;
  disabled?: boolean;
  disabledTitle?: string;
}

/** 分段选择器（支持逐项禁用：远程档未配四件套时置灰）。 */
export function Segmented(props: {
  value: string | null | undefined;
  options: SegOption[];
  disabled?: boolean;
  onChange?(key: string): void;
}) {
  const value = props.value;
  const disabled = !!props.disabled;
  return (
    <div style={{ ...S.seg, ...(disabled ? S.switchDisabled : null) }}>
      {props.options.map((opt, i) => {
        const on = opt.key === value;
        const optDisabled = disabled || !!opt.disabled;
        return (
          <span
            key={opt.key}
            title={opt.disabledTitle || ''}
            style={{
              ...S.segBtn,
              ...(on ? S.segBtnOn : null),
              ...(i === props.options.length - 1 ? { borderRight: 'none' } : null),
              ...(optDisabled ? { cursor: 'not-allowed', opacity: 0.45 } : null),
            }}
            onClick={() => {
              if (!optDisabled && !on && props.onChange) props.onChange(opt.key);
            }}
          >
            {opt.label}
          </span>
        );
      })}
    </div>
  );
}
