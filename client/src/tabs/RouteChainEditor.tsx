/**
 * 蒸馏路由链编辑器（统一列表：第 1 行主路由 + 后续回退链）。
 * 数据源：dsh-memory/llm-providers 的 chain 块（current 运行时链（含旧键投影）/
 * static 部署回退链 / effective 实际链（去重后、每条带档位候选）/ source 跟随或
 * 接管）与 dsh-memory/llm-models（模型目录，每模型附 efforts 档位表）。写入走
 * settings-set 的 distillChain（空数组 = 跟随部署配置与默认模型）。部署静态 pin
 * （pinned）时整区块只读。旧「蒸馏思考」全局切换器与「蒸馏模型」单路由选择器
 * 已由本编辑器取代：档位逐路由设置，缺省「跟随部署配置」（部署全局静态档）。
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DistillChainEntry, EffortChoice, LlmProvidersResponse, ModelWithEfforts } from '../../../src/contract.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { NSel, type NSelOption } from '../ui/NSel.js';
import { NButton, NInput } from '../ui/primitives.js';

// 供应商 → 模型列表缓存（模块级，会话内存活）：切换供应商时缓存命中即时渲染
// （后台仍刷新），面板首次加载时预取全部供应商——消除"切换后模型按钮几秒真空期"
const modelsCache: Record<string, ModelWithEfforts[]> = {};

// 档位词表（与 src/config.ts 的 EFFORT_CHOICES 同源——bundle 无法 import host
// 代码，词表扩容时两处须同步；适配器声明的表外 id 会被 settings-set 拒收，
// 行内下拉在此先过滤，防"能选出、存不进"）
const EFFORT_VOCAB = ['', 'off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

const STY: Record<string, CSSProperties> = {
  wrap: { padding: '8px 0' },
  row: { background: 'var(--dsh-mem-bg-inset)', borderRadius: 8, padding: 8, marginBottom: 8, border: '1px solid transparent' },
  rowErr: { border: '1px solid var(--dsh-mem-danger)' },
  badge: { flexShrink: 0, width: 20, height: 18, borderRadius: 999, background: 'var(--dsh-mem-accent-weak)', color: 'var(--dsh-mem-accent-text)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  // 控件行：供应商/模型/档位；flexWrap 兜底窄面板（放不下时档位自然折行）
  line: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  // 操作按钮行：右下角对齐
  actions: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  ico: { padding: 0, width: 26, height: 26, minWidth: 26, fontSize: 13, lineHeight: '20px' },
  add: { width: '100%', padding: '7px 0', fontSize: 12.5, color: 'var(--dsh-mem-text-3)', background: 'transparent', border: '1px dashed var(--dsh-mem-border-strong)', borderRadius: 8 },
  ghost: { border: 'none', background: 'transparent', color: 'var(--dsh-mem-text-3)' },
  note: { fontSize: 11, color: 'var(--dsh-mem-text-3)', marginTop: 6 },
  warn: { fontSize: 11, color: 'var(--dsh-mem-danger)', marginTop: 6 },
  mono: { fontSize: 12.5, color: 'var(--dsh-mem-text-1)', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  roRow: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--dsh-mem-bg-inset)', borderRadius: 8, padding: '7px 10px', marginBottom: 6 },
};

/** 主路由跟随默认的空行（provider/model 双空）。 */
const EMPTY_ROW: DistillChainEntry = { provider: '', model: '', reasoningEffort: '' };

/** 两种条目形状共用：运行时链 DistillChainEntry（档位必填）与静态回退链
 *  StaticFallbackEntry（档位可选）——档位字符串在这里收窄回 EffortChoice 词表。 */
function copyRow(e: { provider?: string; model?: string; reasoningEffort?: string }): DistillChainEntry {
  return { provider: e.provider || '', model: e.model || '', reasoningEffort: (e.reasoningEffort || '') as EffortChoice };
}

export function RouteChainEditor(props: { rpc: RpcFn; disabled?: boolean }) {
  const rpc = props.rpc;
  const disabled = !!props.disabled;

  const [info, setInfo] = useState<LlmProvidersResponse | null>(null);
  // 编辑草稿（null = 跟随态：只读展示 + 「编辑为运行时链」入口）
  const [rows, setRows] = useState<DistillChainEntry[] | null>(null);
  // 行级校验错误（保存时填、任何编辑动作清）与区块级错误文案
  const [rowErrs, setRowErrs] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  // 手动输入模型 id（供应商未提供目录时）：正在输入的行下标与文本
  const [manual, setManual] = useState<{ idx: number; text: string }>({ idx: -1, text: '' });

  // 写入在途时丢弃轮询响应（在途请求读到的是写入前的旧值，直接 set 会把
  // 乐观更新闪回）；写入成功后主动拉一次服务器真值收敛
  const pendingWrites = useRef(0);

  function refreshInfo() {
    rpc('dsh-memory/llm-providers', {})
      .then((r) => {
        if (r && r.ok && pendingWrites.current === 0) setInfo(r.value);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshInfo();
    const timer = setInterval(refreshInfo, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [rpc]);

  // 预取各供应商模型目录（含 efforts 档位表）进缓存：行内模型/档位下拉即时渲染
  useEffect(() => {
    if (!info || !info.providers) return;
    info.providers.forEach((p) => {
      if (!p.id || modelsCache[p.id]) return;
      rpc('dsh-memory/llm-models', { provider: p.id })
        .then((r) => {
          if (r && r.ok && r.value) modelsCache[p.id] = r.value.models || [];
        })
        .catch(() => {});
    });
  }, [rpc, info]);

  // 运行时链已存在 → 草稿初始化一次（此后轮询不覆盖本地编辑；清空跟随后退回）
  useEffect(() => {
    if (rows === null && info && info.chain && info.chain.current.length) {
      setRows(info.chain.current.map(copyRow));
    }
  }, [info, rows]);

  function updateRow(i: number, patch: Partial<DistillChainEntry>) {
    setRows(rows!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setRowErrs({});
  }

  /** 行移动：位置即优先级。第 2 行上移 = 与主路由互换（主路由为空时为顶替：
   *  空行代表「跟随默认」，落到回退位是非法空条目，直接消失不保留）。 */
  function moveRow(i: number, dir: number) {
    let next = rows!.map(copyRow);
    if (dir < 0 && i === 1) {
      if (!next[0]!.provider) next = next.slice(1);
      else {
        const t = next[0]!;
        next[0] = next[1]!;
        next[1] = t;
      }
    } else if (dir < 0 && i > 1) {
      const t2 = next[i - 1]!;
      next[i - 1] = next[i]!;
      next[i] = t2;
    } else if (dir > 0 && i < next.length - 1 && !(i === 0 && !next[0]!.provider)) {
      const t3 = next[i + 1]!;
      next[i + 1] = next[i]!;
      next[i] = t3;
    }
    setRows(next);
    setRowErrs({});
  }

  function removeRow(i: number) {
    // 主路由行的删除语义 = 重置为跟随默认（回退行保留）
    if (i === 0) setRows([EMPTY_ROW].concat(rows!.slice(1)));
    else setRows(rows!.slice(0, i).concat(rows!.slice(i + 1)));
    setRowErrs({});
  }

  function addRow() {
    let defProv = (rows![0] && rows![0]!.provider) || '';
    if (!defProv && info!.providers && info!.providers[0]) defProv = info!.providers[0]!.id;
    setRows(rows!.concat([{ provider: defProv, model: '', reasoningEffort: '' }]));
    setRowErrs({});
  }

  /** 跟随态入口：把部署静态回退链拷为可编辑草稿（主路由保持跟随默认），
   *  保存第一刻起运行时链接管静态链。 */
  function forkStatic() {
    const st = (info!.chain && info!.chain.static) || [];
    // 静态 fallbacks 无条数上限，fork 截到运行时上限内（1 主路由 + 7 回退 = 8）
    setRows([EMPTY_ROW].concat(st.slice(0, 7).map(copyRow)));
    setRowErrs({});
  }

  function save() {
    const errs: Record<number, string> = {};
    const seen: Record<string, number> = {};
    if ((rows![0]!.provider && !rows![0]!.model) || (!rows![0]!.provider && rows![0]!.model)) {
      errs[0] = '主路由行供应商与模型须成对（双空 = 跟随默认模型）';
    }
    if (rows![0]!.provider && rows![0]!.model) seen[rows![0]!.provider + '::' + rows![0]!.model] = 0;
    for (let i = 1; i < rows!.length; i++) {
      if (!rows![i]!.provider || !rows![i]!.model) {
        errs[i] = '回退路由必须显式选择供应商与模型';
        continue;
      }
      const key = rows![i]!.provider + '::' + rows![i]!.model;
      if (seen[key] !== undefined) {
        errs[i] = seen[key] === 0 ? '与主路由完全相同（运行时会跳过，请去重）' : '与第 ' + (seen[key] + 1) + ' 行重复';
      } else {
        seen[key] = i;
      }
    }
    setRowErrs(errs);
    if (rows!.length > 8) {
      setErr('路由链最多 8 行（含主路由行），请删除多余行');
      return;
    }
    if (Object.keys(errs).length) return;
    // 乐观更新（写入在途时轮询响应被丢弃），成功后拉真值收敛
    pendingWrites.current += 1;
    setInfo({
      ...info!,
      chain: { ...info!.chain, current: rows!.map(copyRow), source: 'runtime' },
    });
    rpc('dsh-memory/settings-set', { distillChain: rows! })
      .then((r) => {
        pendingWrites.current -= 1;
        setErr(!r || r.ok ? null : '路由链保存失败：' + ((r && r.error && r.error.message) || '未知错误'));
        refreshInfo();
      })
      .catch((e: unknown) => {
        pendingWrites.current -= 1;
        setErr('路由链保存失败：' + String((e && (e as Error).message) || e));
        refreshInfo();
      });
  }

  function clearToFollow() {
    pendingWrites.current += 1;
    // 清空链必须连带清旧运行时键——链空时旧键覆盖（distillProvider/distillModel）
    // 与旧档位接管（reasoningEffort）会立即复活，"跟随部署配置"就成了假承诺
    // （新 UI 已无旧键编辑入口，不清即永久滞留）
    rpc('dsh-memory/settings-set', { distillChain: [], distillProvider: '', distillModel: '', reasoningEffort: '' })
      .then((r) => {
        pendingWrites.current -= 1;
        setRows(null);
        setRowErrs({});
        setErr(!r || r.ok ? null : '清空失败，请重试');
        refreshInfo();
      })
      .catch((e: unknown) => {
        pendingWrites.current -= 1;
        setErr('清空失败：' + String((e && (e as Error).message) || e));
        refreshInfo();
      });
  }

  if (!info) return null;

  const providers = info.providers || [];
  const providersById: Record<string, { id: string; name: string }> = {};
  providers.forEach((p) => {
    providersById[p.id] = p;
  });

  /** 只读行（pinned / 跟随态共用）。 */
  function roRow(e: { provider: string; model: string; effort: string }, i: number) {
    return (
      <div key={'ro' + i} style={STY.roRow}>
        <span style={STY.badge}>{i === 0 ? '主' : String(i + 1)}</span>
        <span style={STY.mono}>{e.provider + ' / ' + e.model}</span>
        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, color: 'var(--dsh-mem-text-3)' }}>
          {e.effort ? '档位 ' + e.effort : '跟随部署配置'}
        </span>
      </div>
    );
  }

  // pinned：整区块只读（部署锁定路由；静态链照常生效但不可在此编辑）
  if (info.pinned) {
    const effPin = (info.chain && info.chain.effectiveChain) || [];
    return (
      <div style={STY.wrap}>
        {effPin.map(roRow)}
        <div style={STY.note}>部署已锁定路由（pin 优先于运行时链）；调整请修改 profile cordis.patch.yml 中 llm 的配置。</div>
      </div>
    );
  }

  // 跟随态：未配置运行时链 → 只读展示实际链 +「编辑为运行时链」
  if (rows === null) {
    const effFollow = (info.chain && info.chain.effectiveChain) || [];
    return (
      <div style={STY.wrap}>
        {effFollow.length === 0 ? (
          <div style={S.switchDesc}>蒸馏跟随默认模型，未配置回退链。</div>
        ) : (
          effFollow.map(roRow)
        )}
        <div style={{ marginTop: 6 }}>
          <NButton onClick={forkStatic} disabled={disabled}>
            编辑为运行时链
          </NButton>
        </div>
        <div style={STY.note}>
          未配置运行时链时跟随部署配置；「编辑为运行时链」会拷贝部署回退链为草稿，保存起运行时链接管。
        </div>
      </div>
    );
  }

  // 编辑态：统一列表（每行供应商 / 模型 / 档位 + 序调整 + 删除）
  const capped = rows.length >= 8;
  const dirty = JSON.stringify(rows) !== JSON.stringify((info.chain && info.chain.current) || []);

  const rowEls = rows.map((row, i) => {
    const isPrimary = i === 0;
    const known = !row.provider || !!providersById[row.provider];
    const modelsLoaded = row.provider ? Object.prototype.hasOwnProperty.call(modelsCache, row.provider) : false;
    const modelList = modelsLoaded ? modelsCache[row.provider]! : [];
    // 供应商列表为空数组 = 适配器不提供模型目录：该行降级为手动输入模型 id
    const manualInput = modelsLoaded && modelList.length === 0;
    let curEfforts: string[] = [];
    for (let mi = 0; mi < modelList.length; mi++) {
      if (modelList[mi]!.id === row.model) {
        curEfforts = modelList[mi]!.efforts || [];
        break;
      }
    }
    let providerOptions: NSelOption[] = providers.map((p) => {
      return { id: p.id, label: p.name !== p.id ? p.name + '（' + p.id + '）' : p.id };
    });
    if (isPrimary) {
      providerOptions = [
        {
          id: '',
          label: info.default ? '跟随默认模型（' + info.default.provider + ' / ' + info.default.model + '）' : '跟随默认模型',
        },
      ].concat(providerOptions);
    }
    if (row.provider && !providersById[row.provider]) {
      providerOptions.push({ id: row.provider, label: row.provider + '（已不在列表）' });
    }
    const modelOptions: NSelOption[] = modelList.map((m) => {
      return { id: m.id, label: m.name !== m.id ? m.name + '（' + m.id + '）' : m.id };
    });
    if (row.model && !modelList.some((m) => m.id === row.model)) {
      modelOptions.push({ id: row.model, label: row.model + '（已不在列表）' });
    }
    const effortOptions: NSelOption[] = [{ id: '', label: '跟随部署配置' }].concat(
      curEfforts
        .filter((k) => EFFORT_VOCAB.indexOf(k) >= 0)
        .map((k) => ({ id: k, label: k })),
    );

    return (
      <div key={'row' + i} style={{ ...STY.row, ...(rowErrs[i] ? STY.rowErr : null) }}>
        <div style={STY.line}>
          <span style={STY.badge}>{isPrimary ? '主' : String(i + 1)}</span>
          <NSel
            style={{ flex: 1, minWidth: 150 }}
            options={providerOptions}
            value={row.provider}
            disabled={disabled}
            placeholder={isPrimary ? '跟随默认模型' : '供应商'}
            onChange={(v) => {
              updateRow(i, { provider: v, model: '', reasoningEffort: '' });
            }}
          />
          {!row.provider ? null : manualInput ? (
            <NInput
              style={{ flex: 1, minWidth: 150 }}
              placeholder="模型 id（该供应商未提供列表，输入后回车）…"
              // 非编辑态回填已设模型 id：该供应商无目录时 NSel 分支不渲染，
              // NInput 是行内唯一的模型展示位（提交后置空会让已设值不可见）
              value={manual.idx === i ? manual.text : row.model}
              onChange={(e: { target: { value: string } }) => {
                setManual({ idx: i, text: e.target.value });
              }}
              onKeyDown={(e: ReactKeyboardEvent) => {
                if (e.key === 'Enter') {
                  const v = (manual.idx === i ? manual.text : '').trim();
                  if (v) {
                    updateRow(i, { model: v });
                    setManual({ idx: -1, text: '' });
                  }
                }
              }}
            />
          ) : (
            <NSel
              style={{ flex: 1, minWidth: 150 }}
              options={modelOptions}
              value={row.model}
              disabled={disabled || !modelsLoaded}
              placeholder={modelsLoaded ? (isPrimary ? '（选择模型，可留空跟随默认）' : '（选择模型）') : '加载模型列表…'}
              onChange={(v) => {
                updateRow(i, { model: v });
              }}
            />
          )}
          {/* 档位与供应商/模型同行：词表固定且短（跟随部署配置/off/low/high…），收窄即可 */}
          <NSel
            style={{ flexShrink: 0, width: 118 }}
            options={effortOptions}
            value={row.reasoningEffort}
            disabled={disabled || !(row.provider && row.model)}
            placeholder="跟随部署配置"
            onChange={(v) => {
              updateRow(i, { reasoningEffort: v as EffortChoice });
            }}
          />
        </div>
        {/* 序调整/删除按钮独立成行，右下角对齐（不与控件行混排） */}
        <div style={STY.actions}>
          <NButton
            style={STY.ico}
            disabled={disabled || i === 0}
            title={i === 1 ? '上移（与主路由互换/顶替为主路由）' : '上移'}
            onClick={() => {
              moveRow(i, -1);
            }}
          >
            ↑
          </NButton>
          <NButton
            style={STY.ico}
            disabled={disabled || i === rows.length - 1 || (i === 0 && !row.provider)}
            title="下移"
            onClick={() => {
              moveRow(i, 1);
            }}
          >
            ↓
          </NButton>
          <NButton
            style={STY.ico}
            disabled={disabled}
            title={isPrimary ? '重置为跟随默认' : '删除'}
            onClick={() => {
              removeRow(i);
            }}
          >
            ✕
          </NButton>
        </div>
        {isPrimary && !row.provider ? (
          <div style={STY.note}>
            {'跟随默认模型' +
              (info.default ? '：' + info.default.provider + ' / ' + info.default.model : '') +
              '（档位跟随部署配置，选定模型后可单独设置）'}
          </div>
        ) : null}
        {!known ? (
          <div style={STY.warn}>{'⚠ 供应商 ' + row.provider + ' 已不在已注册路由中：该路由调用会失败并被链跳过（不阻止保存）。'}</div>
        ) : null}
        {rowErrs[i] ? <div style={STY.warn}>{'✕ ' + rowErrs[i]}</div> : null}
      </div>
    );
  });

  const effChain = (info.chain && info.chain.effectiveChain) || [];

  return (
    <div style={STY.wrap}>
      <div style={{ ...S.switchDesc, marginBottom: 8 }}>
        路由按序尝试：第 1 行是主路由，失败（报错 / 掐断 / 网络异常 / 空输出）后按序降级；每行档位独立，缺省跟随部署配置。
      </div>
      {rowEls}
      <NButton style={STY.add} disabled={disabled || capped} onClick={addRow}>
        {capped ? '已达上限（8 条）' : '+ 添加回退路由'}
      </NButton>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <NButton style={STY.ghost} disabled={disabled} onClick={clearToFollow}>
          清空并跟随部署配置
        </NButton>
        <div style={S.grow} />
        <NButton variant="primary" disabled={disabled} onClick={save}>
          保存
        </NButton>
      </div>
      {err ? <div style={{ ...STY.warn, marginTop: 8 }}>{'✕ ' + err}</div> : null}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--dsh-mem-border)' }}>
        <div style={{ fontSize: 11, color: 'var(--dsh-mem-text-3)', marginBottom: 4 }}>
          {'实际链' + (dirty ? '（保存后更新；当前显示已保存值）' : '')}
        </div>
        <div
          style={{ fontSize: 12, color: 'var(--dsh-mem-text-2)', wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}
        >
          {effChain.map((e) => e.provider + '/' + e.model + (e.effort ? '（' + e.effort + '）' : '')).join(' → ') || '（暂无可用路由）'}
        </div>
      </div>
    </div>
  );
}
