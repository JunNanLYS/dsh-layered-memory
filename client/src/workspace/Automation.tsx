/**
 * 工作台·自动化：基础开关（总闸/捕获/蒸馏/召回）+ 语义检索与蒸馏路由摘要行 +
 * 高级披露（路由链与预算 = DistillSettings 内含 RouteChainEditor/BudgetInputs；
 * 嵌入模型 = EmbeddingSection）。开关逻辑自旧概览迁移（乐观更新 + 失败回滚）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LlmProvidersResponse, SettingsGetResponse, SettingsSetRequest, EmbeddingStateResponse } from '../../../src/contract.js';
import { t, tpl } from '../i18n.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { SwitchRow } from '../ui/controls.js';
import { DistillSettings } from '../tabs/DistillSettings.js';
import { EmbeddingSection } from '../tabs/EmbeddingSection.js';
import { Chevron, ErrorBlock, SectionTitle } from './common.js';
import { NIconChevronRight14 } from '../ui/primitives.js';

type ToggleKey = 'enabled' | 'capture' | 'distill' | 'recall';

const POLL_MS = 10_000;

export function Automation(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [settingsData, setSettingsData] = useState<SettingsGetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<LlmProvidersResponse | null>(null);
  const [emb, setEmb] = useState<EmbeddingStateResponse | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const [embOpen, setEmbOpen] = useState(false);
  /** 写入期标志：乐观更新在途时丢弃轮询响应（防旧值闪回覆盖，审查 P2-6）。 */
  const writeBusy = useRef(false);

  const load = useCallback(() => {
    rpc('dsh-memory/settings-get', {})
      .then((r) => {
        if (writeBusy.current) return;
        if (r && r.ok) {
          setSettingsData(r.value);
          setError(null);
        } else if (!r || !r.ok) {
          setError(r && r.error ? r.error.message : 'RPC error');
        }
      })
      .catch((e: unknown) => {
        setError(String((e && (e as Error).message) || e));
      });
    rpc('dsh-memory/llm-providers', {})
      .then((r) => {
        if (r && r.ok) setRouteInfo(r.value);
      })
      .catch(() => {});
    rpc('dsh-memory/embedding-state-get', {})
      .then((r) => {
        if (r && r.ok) setEmb(r.value);
      })
      .catch(() => {});
  }, [rpc]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [load]);

  const toggle = (key: ToggleKey, value: boolean) => {
    if (!settingsData) return;
    const prev = settingsData;
    const patch = { [key]: value } as SettingsSetRequest;
    setSettingsData({ ...prev, settings: { ...prev.settings, [key]: value } });
    writeBusy.current = true;
    rpc('dsh-memory/settings-set', patch)
      .then((r) => {
        writeBusy.current = false;
        if (!r || !r.ok) {
          setSettingsData(prev);
          setError(r && r.error ? r.error.message : 'settings-set failed');
        } else {
          setError(null);
        }
      })
      .catch((e: unknown) => {
        writeBusy.current = false;
        setSettingsData(prev);
        setError(String((e && (e as Error).message) || e));
      });
  };

  const master = settingsData?.settings.enabled ?? true;

  let ceilingNote = '';
  if (settingsData?.ceilings) {
    const off: string[] = [];
    if (!settingsData.ceilings.capture) off.push(t('au.sw.capture'));
    if (!settingsData.ceilings.distill) off.push(t('au.sw.distill'));
    if (!settingsData.ceilings.recall) off.push(t('au.sw.recall'));
    if (off.length > 0) ceilingNote = tpl('au.ceiling', { s: off.join(' / ') });
  }

  // 语义检索摘要：远程/本地/关闭 + 模型名（嵌入明细在披露区内）
  let embSummary = '…';
  if (emb && emb.supported !== false) {
    if (emb.source === 'remote') embSummary = tpl('au.emb.remote', { m: emb.activeModel ?? '-' });
    else if (emb.source === 'local') embSummary = tpl('au.emb.local', { m: emb.activeModel ?? '-' });
    else embSummary = t('au.emb.off');
  }

  // 蒸馏路由摘要：生效链首行 + 回退条数（跟随态显示跟随默认模型）
  let routeSummary = '…';
  const chain = routeInfo?.chain.effectiveChain ?? [];
  if (routeInfo) {
    if (chain.length > 0) {
      const head = chain[0]!;
      const headName = (head.provider ? head.provider + '/' : '') + head.model;
      routeSummary = chain.length > 1 ? tpl('au.route.cur', { m: headName, n: chain.length - 1 }) : headName;
    } else {
      routeSummary = t('au.route.follow');
    }
  }

  const summaryRow = (label: string, value: string) => (
    <div style={{ ...S.switchRow, justifyContent: 'space-between' }}>
      <div style={S.switchLabel}>{label}</div>
      <span style={S.muted}>{value}</span>
    </div>
  );

  return (
    <div>
      <SectionTitle first>{t('au.basic')}</SectionTitle>
      {settingsData && settingsData.supported === false ? (
        <p style={S.hint}>{t('au.unsupported')}</p>
      ) : settingsData ? (
        <div style={S.switchPanel}>
          <SwitchRow
            label={t('au.sw.master')}
            desc={master ? t('au.sw.masterOn') : t('au.sw.masterOff')}
            checked={master}
            onChange={(v) => {
              toggle('enabled', v);
            }}
          /><SwitchRow
            label={t('au.sw.capture')}
            desc={t('au.sw.captureD')}
            checked={settingsData.settings.capture}
            disabled={!master}
            onChange={(v) => {
              toggle('capture', v);
            }}
          />
          <SwitchRow
            label={t('au.sw.distill')}
            desc={t('au.sw.distillD')}
            checked={settingsData.settings.distill}
            disabled={!master}
            onChange={(v) => {
              toggle('distill', v);
            }}
          />
          <SwitchRow
            label={t('au.sw.recall')}
            desc={t('au.sw.recallD')}
            checked={settingsData.settings.recall}
            disabled={!master}
            onChange={(v) => {
              toggle('recall', v);
            }}
          />
          {summaryRow(t('au.emb'), embSummary)}
          {summaryRow(t('au.route'), routeSummary)}
          {ceilingNote ? <p style={S.hint}>{ceilingNote}</p> : null}
          {error ? <div style={S.error}>{error}</div> : null}
        </div>
      ) : error ? (
        <ErrorBlock msg={error} onRetry={load} />
      ) : (
        <p style={S.intro}>{t('ws.loading')}</p>
      )}

      <button className="dsh-mem-disc" aria-expanded={advOpen} onClick={() => { setAdvOpen(!advOpen); }} style={{ marginTop: 14 }}>
        <span className="dsh-mem-disc-chev" aria-hidden="true">
          <NIconChevronRight14 />
        </span>
        {t('au.advTitle')}
        <span style={{ ...S.hint, marginLeft: 'auto', fontWeight: 400 }}>{t('au.advHint')}</span>
      </button>
      {advOpen && settingsData ? (
        <DistillSettings rpc={rpc} disabled={!master} data={settingsData} setData={setSettingsData} onError={setError} />
      ) : null}

      <button className="dsh-mem-disc" aria-expanded={embOpen} onClick={() => { setEmbOpen(!embOpen); }} style={{ marginTop: 12 }}>
        <span className="dsh-mem-disc-chev" aria-hidden="true">
          <NIconChevronRight14 />
        </span>
        {t('au.embTitle')}
      </button>
      {embOpen ? <EmbeddingSection rpc={rpc} /> : null}
    </div>
  );
}
