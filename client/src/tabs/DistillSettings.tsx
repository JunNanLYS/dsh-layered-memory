/**
 * 蒸馏设置区（#34 B 形态：范围分段切换）——路由链与预算按层组织的外壳。
 * 数据源：dsh-memory/llm-providers 的 layerChains 三态块（runtime/static/global，
 * 分段状态点总览）+ settings-get（预算，经 props 透传）。面板本体复用
 * RouteChainEditor（scope 参数化：global 编辑统一链 / l1~l3 编辑层链）与
 * BudgetInputs（scope 裁剪：全局面板输入预算、层面板该层输出预算）。
 * 语义（与 spec/ADR-0005 一致）：每层实际链 = 本层自定义（运行时）→ 部署 YAML
 * 层链 → 全局默认链，逐级兜底；pin 时运行时编辑只读（静态层链照常生效）。
 */
import { useEffect, useState, type CSSProperties } from 'react';
import type { LayerRouteKey, LlmProvidersResponse, SettingsGetResponse } from '../../../src/contract.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { Segmented, type SegOption } from '../ui/controls.js';
import { BudgetInputs } from './BudgetInputs.js';
import { RouteChainEditor } from './RouteChainEditor.js';

const STY: Record<string, CSSProperties> = {
  hint: { fontSize: 11, color: 'var(--dsh-mem-text-3)', margin: '0 0 8px' },
  panelHead: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  panelTitle: { fontSize: 13.5, fontWeight: 650, color: 'var(--dsh-mem-text-1)' },
  chip: {
    display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '1px 8px',
    fontSize: 11, fontWeight: 600, lineHeight: '18px', whiteSpace: 'nowrap',
  },
  chipAccent: { background: 'var(--dsh-mem-accent-weak)', color: 'var(--dsh-mem-accent-text)' },
  chipMuted: { background: 'var(--dsh-mem-bg-inset)', color: 'var(--dsh-mem-text-2)' },
  inUse: { fontSize: 11, color: 'var(--dsh-mem-text-3)', margin: '6px 0 0' },
};

/** 分段状态点：蓝实心 = 运行时自定义；空心 = 静态 YAML；灰 = 跟随全局。 */
function Dot(props: { kind: 'runtime' | 'static' | 'global' }) {
  const base: CSSProperties = {
    display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
    marginRight: 4, verticalAlign: 'middle', flexShrink: 0,
  };
  if (props.kind === 'runtime') return <span style={{ ...base, background: 'var(--dsh-mem-accent)' }} />;
  if (props.kind === 'static') return <span style={{ ...base, background: 'transparent', border: '1.5px solid var(--dsh-mem-text-3)' }} />;
  return <span style={{ ...base, background: 'var(--dsh-mem-track)' }} />;
}

const LAYER_META: Record<LayerRouteKey, { seg: string; title: string }> = {
  l1: { seg: 'L1', title: 'L1 · 抽取 / 去重' },
  l2: { seg: 'L2', title: 'L2 · 场景摘要' },
  l3: { seg: 'L3', title: 'L3 · 画像蒸馏' },
};

export function DistillSettings(props: {
  rpc: RpcFn;
  disabled?: boolean;
  data: SettingsGetResponse | null;
  setData(d: SettingsGetResponse): void;
  onError(msg: string | null): void;
}) {
  const rpc = props.rpc;
  const disabled = !!props.disabled;
  const [info, setInfo] = useState<LlmProvidersResponse | null>(null);
  const [tab, setTab] = useState<'g' | LayerRouteKey>('g');

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      rpc('dsh-memory/llm-providers', {})
        .then((r) => {
          if (alive && r && r.ok) setInfo(r.value);
        })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [rpc]);

  const layers = info?.layerChains;
  const dotOf = (k: LayerRouteKey): 'runtime' | 'static' | 'global' => layers?.[k]?.source ?? 'global';
  const users = (['l1', 'l2', 'l3'] as LayerRouteKey[]).filter((k) => dotOf(k) === 'global');

  const segOptions: SegOption[] = [
    { key: 'g', label: '全局默认', title: '未单独配置的层走这条链（当前在用：' + (users.length ? users.map((k) => LAYER_META[k].seg).join('、') : '无') + '）' },
    ...(['l1', 'l2', 'l3'] as LayerRouteKey[]).map((k) => ({
      key: k,
      title: LAYER_META[k].title + ' · ' + (dotOf(k) === 'runtime' ? '运行时自定义' : dotOf(k) === 'static' ? '部署 YAML 层链（只读）' : '跟随全局'),
      label: (
        <span>
          <Dot kind={dotOf(k)} />
          {LAYER_META[k].seg}
        </span>
      ),
    })),
  ];

  const chipTitle = (k: LayerRouteKey): string =>
    dotOf(k) === 'runtime'
      ? '本层走设置页自定义链'
      : dotOf(k) === 'static'
        ? '本层走部署 YAML 层链（UI 只读，自定义可覆盖）'
        : '本层未单独配置，走全局默认链';

  return (
    <div>
      <Segmented value={tab} options={segOptions} onChange={(k) => setTab(k as 'g' | LayerRouteKey)} />
      {/* 一行提示兼圆点图例：优先级关系挂 tooltip，不占解释性段落 */}
      <div style={STY.hint}>
        <Dot kind="runtime" /> 自定义 · <Dot kind="static" /> 部署 YAML · <Dot kind="global" /> 跟随全局
        <span title="每层实际链：运行时自定义 → 部署 YAML 层链 → 全局默认链，逐级兜底；部署 pin 时运行时编辑只读">（层链优先于全局）</span>
      </div>

      {tab === 'g' ? (
        <div>
          <div style={STY.panelHead}>
            <span style={STY.panelTitle}>全局默认链</span>
            <span style={{ ...STY.chip, ...STY.chipAccent }}>运行时 · 可编辑</span>
            <span style={{ ...STY.inUse, marginLeft: 'auto' }}>
              {users.length ? '在用：' + users.map((k) => LAYER_META[k].seg).join('、') : '当前无层使用'}
            </span>
          </div>
          {/* key=tab：切范围强制重挂载——RouteChainEditor/BudgetInputs 的编辑草稿是
              组件内部态，不重挂会把上一范围的草稿带进下一范围（L3 草稿漏进 L1/全局，
              保存还会写错层），这是 #34 验收发现的实例复用 bug 的修复 */}
          <RouteChainEditor key={'g'} rpc={rpc} disabled={disabled} />
          <BudgetInputs key={'g-budget'} rpc={rpc} disabled={disabled} data={props.data} setData={props.setData} onError={props.onError} scope="input" />
        </div>
      ) : (
        <div>
          <div style={STY.panelHead}>
            <span style={STY.panelTitle}>{LAYER_META[tab].title}</span>
            <span style={{ ...STY.chip, ...(dotOf(tab) === 'runtime' ? STY.chipAccent : STY.chipMuted) }} title={chipTitle(tab)}>
              {dotOf(tab) === 'runtime' ? '运行时自定义' : dotOf(tab) === 'static' ? '静态 · YAML' : '跟随全局'}
            </span>
          </div>
          <RouteChainEditor key={tab} rpc={rpc} disabled={disabled} scope={tab} />
          <BudgetInputs key={tab + '-budget'} rpc={rpc} disabled={disabled} data={props.data} setData={props.setData} onError={props.onError} scope={tab} />
        </div>
      )}
    </div>
  );
}
