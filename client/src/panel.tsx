/**
 * 记忆工作台壳：设置 → 记忆 五区任务导航（总览/记忆库/自动化/洞察/维护，
 * spec v2 §5-§10）。sticky tablist + 箭头键巡游（roving tabindex）；
 * 重挂载自然回到总览（state 随挂载重置）。
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { t } from './i18n.js';
import type { RpcFn } from './rpc.js';
import { watchSidebarIcon } from './sidebar-icon.js';
import { S } from './styles.js';
import { ensureThemeStyle } from './theme.js';
import { Automation } from './workspace/Automation.js';
import { Insights } from './workspace/Insights.js';
import { Library } from './workspace/Library.js';
import { Maintenance } from './workspace/Maintenance.js';
import { Overview } from './workspace/Overview.js';

const WS_TABS = ['overview', 'library', 'automation', 'insights', 'maintenance'] as const;
type WsTab = (typeof WS_TABS)[number];

export function MemoryPanel(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [tab, setTab] = useState<WsTab>('overview');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  ensureThemeStyle(); // 设置页挂载即注入主题令牌与组件样式
  useEffect(() => {
    watchSidebarIcon();
  }, []);

  // tablist 箭头键巡游：切换选中并移焦点（roving tabindex）
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = WS_TABS.indexOf(tab);
    const next = e.key === 'ArrowRight' ? (idx + 1) % WS_TABS.length : (idx - 1 + WS_TABS.length) % WS_TABS.length;
    setTab(WS_TABS[next]!);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="dsh-mem-root" style={S.section}>
      <h2 style={S.heading}>{t('ws.title')}</h2>
      <div className="dsh-mem-ws-tabs" role="tablist" aria-label={t('ws.title')} onKeyDown={onKeyDown}>
        {WS_TABS.map((k, i) => (
          <button
            key={k}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            aria-selected={tab === k}
            tabIndex={tab === k ? 0 : -1}
            className="dsh-mem-ws-tab"
            onClick={() => {
              setTab(k);
            }}
          >
            {t('ws.tab.' + k)}
          </button>
        ))}
      </div>
      {tab === 'overview' ? <Overview rpc={rpc} onNavigate={setTab} /> : null}
      {tab === 'library' ? <Library rpc={rpc} /> : null}
      {tab === 'automation' ? <Automation rpc={rpc} /> : null}
      {tab === 'insights' ? <Insights rpc={rpc} /> : null}
      {tab === 'maintenance' ? <Maintenance rpc={rpc} /> : null}
    </div>
  );
}
