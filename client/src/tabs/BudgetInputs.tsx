/**
 * 蒸馏预算（分层输出 token 上限 + 输入字符上限）。
 * 数据源：settings-get 的 budgets（current 运行时覆盖 0=跟随默认 / defaults
 * 内置默认 / effective 实际生效）与 inputBudget（current 0=跟随配置 /
 * fallback 静态配置值 / effective）。输出四键经 settings-set 的
 * distillBudgets 成对提交；输入走 distillMaxInputChars 单键提交。
 * 思考档 high/xhigh/max 的 ×4 放大只作用于输出预算（提示文案注明）。
 *
 * scope（#34 B 分段 UI）：'all'（缺省，四输出 + 输入整组）| 'input'（仅输入，全局
 * 面板用）| 'l1' | 'l2' | 'l3'（仅该层输出——l1 = 抽取 + 去重两行；层面板用）。
 * 提交仍整组四键（未编辑键带当前值回写，不会互相清零）。
 */
import { useState } from 'react';
import type { SettingsGetResponse, SettingsSetRequest } from '../../../src/contract.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { NInput } from '../ui/primitives.js';

const LAYERS: Array<[string, string]> = [
  ['extract', '抽取'],
  ['dedup', '去重'],
  ['l2', 'L2 场景'],
  ['l3', 'L3 画像'],
];

/** 层范围 → 该面板要渲染的输出键（l1 同管抽取+去重）。 */
const SCOPE_KEYS: Record<'l1' | 'l2' | 'l3', string[]> = {
  l1: ['extract', 'dedup'],
  l2: ['l2'],
  l3: ['l3'],
};

export function BudgetInputs(props: {
  rpc: RpcFn;
  disabled?: boolean;
  data: SettingsGetResponse | null;
  setData(d: SettingsGetResponse): void;
  onError(msg: string | null): void;
  scope?: 'all' | 'input' | 'l1' | 'l2' | 'l3';
}) {
  const rpc = props.rpc;
  const disabled = !!props.disabled;
  const data = props.data;
  const setData = props.setData;
  const onError = props.onError;
  const scope = props.scope ?? 'all';
  const layers = scope === 'all' || scope === 'input' ? LAYERS : LAYERS.filter((l) => SCOPE_KEYS[scope].includes(l[0]));
  // 输入草稿（string|null）：击键只改本地，blur/回车才提交（input 键 = 输入预算）
  const [draft, setDraft] = useState<Record<string, string> | null>(null);

  if (!data || !data.budgets) return null;
  const cur: Record<string, number> = data.budgets.current || ({} as Record<string, number>);
  const def: Record<string, number> = data.budgets.defaults || ({} as Record<string, number>);
  const eff: Record<string, number> = data.budgets.effective || ({} as Record<string, number>);
  const ib = data.inputBudget || { current: 0, fallback: 0, effective: 0 };
  const curIn = ib.current || 0;
  const effIn = ib.effective || ib.fallback || 0;

  const shown = (key: string): string => {
    if (draft && draft[key] !== undefined) return draft[key]!;
    const c = key === 'input' ? curIn : cur[key] || 0;
    return c > 0 ? String(c) : '';
  };

  /** 通用提交：buildPayload 从草稿取值并校验后构造 settings-set 载荷。 */
  const commitPart = (
    keys: string[],
    buildPayload: (v: Record<string, number>) => SettingsSetRequest,
    applyView: (prev: SettingsGetResponse, v: Record<string, number>) => SettingsGetResponse,
  ) => {
    if (!draft) return;
    const values: Record<string, number> = {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const raw = (draft[key] !== undefined ? draft[key] : shown(key)).trim();
      const n = raw === '' ? 0 : Number(raw);
      const max = key === 'input' ? 1000000 : 1000000;
      const min = key === 'input' ? (raw === '' ? 0 : 1000) : 0;
      if (!Number.isInteger(n) || n < min || n > max) {
        onError(
          key === 'input'
            ? '输入预算须为 0 或 1000~1000000 的整数（留空或 0 = 跟随配置）'
            : '输出预算须为 0~1000000 的整数（留空或 0 = 跟随默认）',
        );
        setDraft(null);
        return;
      }
      values[key] = n;
    }
    setDraft(null);
    const prev = data;
    setData(applyView(prev, values));
    rpc('dsh-memory/settings-set', buildPayload(values))
      .then((r) => {
        if (!r || !r.ok) {
          setData(prev);
          onError(r && r.error ? '预算写入失败：' + r.error.message : '预算写入失败');
        } else {
          onError(null);
        }
      })
      .catch((e: unknown) => {
        setData(prev);
        onError('预算写入失败：' + String((e && (e as Error).message) || e));
      });
  };

  /** 输出四键成对提交（distillBudgets）。 */
  const commitOutputs = () => {
    commitPart(
      ['extract', 'dedup', 'l2', 'l3'],
      (v) => ({ distillBudgets: v as unknown as SettingsSetRequest['distillBudgets'] }),
      (prev, v) => {
        const effNext: Record<string, number> = {};
        for (let j = 0; j < layers.length; j++) {
          const k = layers[j]![0]!;
          effNext[k] = v[k]! > 0 ? v[k]! : (def[k] || 0);
        }
        return {
          ...prev,
          settings: { ...prev.settings, distillBudgets: v as unknown as SettingsGetResponse['settings']['distillBudgets'] },
          budgets: {
            ...prev.budgets,
            current: v as unknown as SettingsGetResponse['budgets']['current'],
            effective: effNext as unknown as SettingsGetResponse['budgets']['effective'],
          },
        };
      },
    );
  };

  /** 输入预算单键提交（distillMaxInputChars）。 */
  const commitInput = () => {
    commitPart(
      ['input'],
      (v) => ({ distillMaxInputChars: v.input }),
      (prev, v) => {
        return {
          ...prev,
          settings: { ...prev.settings, distillMaxInputChars: v.input! },
          inputBudget: {
            ...(prev.inputBudget || { current: 0, fallback: 0, effective: 0 }),
            current: v.input!,
            effective: v.input! > 0 ? v.input! : ib.fallback || 0,
          },
        };
      },
    );
  };

  /** 某组键是否有未提交改动（触发 blur/Enter 提交）。 */
  const dirty = (keys: string[]) => {
    if (!draft) return false;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const want = (draft[key] !== undefined ? draft[key] : '').trim();
      const was =
        key === 'input' ? (curIn > 0 ? String(curIn) : '') : (cur[key] || 0) > 0 ? String(cur[key]) : '';
      if (want !== was) return true;
    }
    return false;
  };

  const inputBox = (
    key: string,
    _label: string,
    title: string,
    width: number,
    placeholder: number | undefined,
    onCommit: () => void,
  ) => {
    return (
      <NInput
        key={key}
        type="number"
        min={0}
        max={1000000}
        style={{ width }}
        title={title}
        placeholder={String(placeholder || '')}
        value={shown(key)}
        disabled={disabled}
        onChange={(e: { target: { value: string } }) => {
          const v = e.target.value;
          const d = { ...(draft || {}) };
          d[key] = v;
          setDraft(d);
        }}
        onBlur={() => {
          if (dirty([key])) onCommit();
        }}
        onKeyDown={(e: { key: string }) => {
          if (e.key === 'Enter' && dirty([key])) onCommit();
        }}
      />
    );
  };

  const showOutputs = scope !== 'input';
  const showInput = scope === 'all' || scope === 'input';
  const effNote = layers.map((l) => eff[l[0]!] || '?').join(' / ');
  return (
    <div>
      {showOutputs ? (
        <div style={S.switchRow}>
          <div style={{ ...S.flexRow, gap: 6 }}>
            {layers.map((l) => {
              return inputBox(
                l[0]!,
                l[1]!,
                l[1]! + ' 输出预算（token，留空 = 默认 ' + (def[l[0]!] || '?') + '）',
                92,
                def[l[0]!],
                commitOutputs,
              );
            })}
          </div>
          <div>
            <div
              style={S.switchLabel}
              title={
                (scope === 'l1' ? 'L1 的抽取与去重是两次独立调用，输出限额各自设置（路由共用同一条链）。' : '') +
                '留空或 0 = 跟随默认（当前生效 ' + effNote + '）；思考档 high/xhigh/max 时实际限额自动 ×4'
              }
            >
              输出预算
            </div>
            {scope === 'all' ? (
              <div style={S.switchDesc}>
                {'各蒸馏层单次输出的 token 上限（抽取/去重/L2/L3）；留空或 0 = 跟随默认（当前生效 ' + effNote +
                  '）；思考档 high/xhigh/max 时实际限额自动 ×4'}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {showInput ? (
        <div style={S.switchRow}>
          {inputBox(
            'input',
            '输入',
            '单次蒸馏输入字符上限（≈token，中文 1 字≈1 token；留空 = 跟随配置 ' + (ib.fallback || '?') + '）',
            120,
            ib.fallback,
            commitInput,
          )}
          <div>
            <div
              style={S.switchLabel}
              title={'单次蒸馏调用的输入字符上限（≈token）：L1 抽取按此分块、L2/L3 超限截断；留空或 0 = 跟随配置（当前生效 ' + (effIn || '?') + '，来自 llm.maxInputChars）'}
            >
              输入预算
            </div>
            {scope === 'all' ? (
              <div style={S.switchDesc}>
                {'单次蒸馏调用的输入字符上限（≈token）：L1 抽取按此分块、L2/L3 超限截断；' +
                  '留空或 0 = 跟随配置（当前生效 ' +
                  (effIn || '?') +
                  '，来自 llm.maxInputChars）'}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
