/** Tab：概览（开关面板 + 计数）。 */
import { useCallback, useEffect, useState } from 'react';
import type { MemoryStats, SettingsGetResponse, SettingsSetRequest } from '../../../src/contract.js';
import { fmtTime } from '../format.js';
import { modeLabel } from '../pill/modes.js';
import type { RpcFn } from '../rpc.js';
import { S } from '../styles.js';
import { SwitchRow } from '../ui/controls.js';
import { BudgetInputs } from './BudgetInputs.js';
import { EmbeddingSection } from './EmbeddingSection.js';
import { RebuildPanel } from './RebuildPanel.js';
import { RouteChainEditor } from './RouteChainEditor.js';

type ToggleKey = 'enabled' | 'capture' | 'distill' | 'recall';

export function OverviewTab(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [settingsData, setSettingsData] = useState<SettingsGetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    rpc('dsh-memory/stats', {})
      .then((r) => {
        if (r && r.ok) setStats(r.value);
        else setError(r && r.error ? r.error.message : 'RPC error');
      })
      .catch((e: unknown) => {
        setError(String((e && (e as Error).message) || e));
      });
    rpc('dsh-memory/settings-get', {})
      .then((r) => {
        if (r && r.ok) setSettingsData(r.value);
      })
      .catch(() => {});
  }, [rpc]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [load]);

  const toggle = (key: ToggleKey, value: boolean) => {
    if (!settingsData) return;
    // 乐观更新：立即翻 UI，失败回滚
    const prev = settingsData;
    const patch = { [key]: value } as SettingsSetRequest;
    // settings-set 的层链键是 Partial（patch 语义），settings 视图要求全量 Record——
    // 乐观更新按具体开关键注入，不做整包 spread（形状不兼容且会盖掉无关键）
    const next = { ...prev, settings: { ...prev.settings, [key]: value } };
    setSettingsData(next);
    rpc('dsh-memory/settings-set', patch)
      .then((r) => {
        if (!r || !r.ok) {
          setSettingsData(prev);
          setError(r && r.error ? '开关写入失败：' + r.error.message : '开关写入失败');
        } else {
          setError(null);
        }
      })
      .catch((e: unknown) => {
        setSettingsData(prev);
        setError('开关写入失败：' + String((e && (e as Error).message) || e));
      });
  };

  // 统计分两段：计数瓦片（一眼可读）+ 明细行（目录/版本/时间线/队列）
  const tiles: Array<{ num: string; label: string }> = [];
  const infos: Array<[string, string]> = [];
  if (stats) {
    const th = stats.thresholds || { l2MinNewMemories: 5, l3Interval: 20 };
    tiles.push({ num: String(stats.l0Today), label: 'L0 今日消息' });
    tiles.push({ num: String(stats.l1Count), label: 'L1 原子记忆' });
    tiles.push({ num: String(stats.sceneCount), label: 'L2 场景块' });
    tiles.push({ num: String(stats.pendingExtract), label: '待重试消息' });
    infos.push(['数据目录', stats.dataDir]);
    infos.push(['插件版本', 'v' + stats.version]);
    infos.push(['默认档', modeLabel(stats.family)]);
    infos.push(['L1 累计抽取', String(stats.l1TotalExtracted)]);
    infos.push(['L3 画像', stats.personaChars > 0 ? stats.personaChars + ' 字符' : '未生成']);
    infos.push(['上次 L1 抽取', fmtTime(stats.lastExtractAt)]);
    infos.push(['上次 L2 整合', fmtTime(stats.lastL2At)]);
    infos.push(['上次 L3 蒸馏', fmtTime(stats.lastL3At)]);
    infos.push(['待 L2 新记忆', stats.memoriesSinceL2 + ' / ' + (th.l2MinNewMemories != null ? th.l2MinNewMemories : 5)]);
    infos.push(['待 L3 新记忆', stats.memoriesSinceL3 + ' / ' + (th.l3Interval != null ? th.l3Interval : 20)]);
  }
  const degraded = stats && stats.message && stats.message !== 'running';

  const master = settingsData && settingsData.settings ? settingsData.settings.enabled : true;
  let ceilingNote = '';
  if (settingsData && settingsData.ceilings) {
    const off: string[] = [];
    if (!settingsData.ceilings.capture) off.push('捕获');
    if (!settingsData.ceilings.distill) off.push('蒸馏');
    if (!settingsData.ceilings.recall) off.push('召回');
    if (off.length > 0) ceilingNote = '注意：部署配置已停用 ' + off.join('、') + '（运行时开关无法开启）';
  }

  return (
    <div>
      {settingsData && settingsData.supported === false ? (
        <p style={S.hint}>settings 服务不可用，记忆模式开关未启用（记忆保持全开）。</p>
      ) : settingsData ? (
        <div style={S.switchPanel}>
          {/* 分组：记忆模式（总闸与三个分项开关） */}
          <div style={S.panelLabel}>记忆模式</div>
          <SwitchRow
            label="记忆模式"
            desc={master ? '已开启：捕获对话并蒸馏记忆' : '已关闭：不捕获、不蒸馏、不注入（数据保留）'}
            checked={master}
            onChange={(v) => {
              toggle('enabled', v);
            }}
          />
          <SwitchRow
            label="捕获"
            desc="L0：记录原始对话（关闭后蒸馏也无输入）"
            checked={settingsData.settings.capture}
            disabled={!master}
            onChange={(v) => {
              toggle('capture', v);
            }}
          />
          <SwitchRow
            label="蒸馏"
            desc="L1 抽取 + L2 场景 + L3 画像"
            checked={settingsData.settings.distill}
            disabled={!master}
            onChange={(v) => {
              toggle('distill', v);
            }}
          />
          <SwitchRow
            label="召回"
            desc="对话时注入相关记忆与画像"
            checked={settingsData.settings.recall}
            disabled={!master}
            onChange={(v) => {
              toggle('recall', v);
            }}
          />
          {/* 分组：蒸馏参数（统一路由链 + 输出预算）——旧「蒸馏思考」全局切换器
              与「蒸馏模型」单路由选择器已并入 RouteChainEditor（档位逐路由设置） */}
          <div style={S.panelLabel}>蒸馏参数</div>
          <RouteChainEditor rpc={rpc} disabled={!master} />
          <BudgetInputs rpc={rpc} disabled={!master} data={settingsData} setData={setSettingsData} onError={setError} />
          {ceilingNote ? <p style={S.hint}>{ceilingNote}</p> : null}
        </div>
      ) : null}
      <EmbeddingSection rpc={rpc} />
      <RebuildPanel rpc={rpc} />
      {degraded ? (
        <div style={{ ...S.error, marginBottom: 10 }}>
          {'⚠ ' + stats!.message + '。上方数据为最后一次成功读取的值，记忆功能当前未工作。'}
        </div>
      ) : null}
      {error ? (
        <div style={S.error}>{'获取状态失败：' + error}</div>
      ) : !stats ? (
        <p style={S.intro}>正在读取记忆状态…</p>
      ) : (
        <div>
          <div style={S.panelLabel}>记忆概况</div>
          <div style={S.statGrid}>
            {tiles.map((t) => {
              return (
                <div key={t.label} className="dsh-mem-card" style={S.statTile}>
                  <div style={S.statNum}>{t.num}</div>
                  <div style={S.statLabel}>{t.label}</div>
                </div>
              );
            })}
          </div>
          <div style={S.panelLabel}>运行状态</div>
          {infos.map((row) => {
            return (
              <div key={row[0]} style={S.infoRow}>
                <span style={S.infoKey}>{row[0]}</span>
                <span style={S.infoVal}>{row[1]}</span>
              </div>
            );
          })}
        </div>
      )}
      <p style={S.hint}>浏览各层记忆内容请切换上方 Tab；原始对话（L0）不入浏览器，可由模型侧 conversation_search 工具查询。</p>
    </div>
  );
}
