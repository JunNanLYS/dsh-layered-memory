/** 主面板：Tab 框架（设置 → 记忆 分节主体）。 */
import { useEffect, useState } from 'react';
import type { RpcFn } from './rpc.js';
import { watchSidebarIcon } from './sidebar-icon.js';
import { S } from './styles.js';
import { ensureThemeStyle } from './theme.js';
import { CostTab } from './tabs/CostTab.js';
import { LogTab } from './tabs/LogTab.js';
import { OverviewTab } from './tabs/OverviewTab.js';
import { PersonaTab } from './tabs/PersonaTab.js';
import { RecordsTab } from './tabs/RecordsTab.js';
import { ScenesTab } from './tabs/ScenesTab.js';

const TABS: Array<[string, string]> = [
  ['overview', '概览'],
  ['records', '记忆'],
  ['scenes', '场景'],
  ['persona', '画像'],
  ['cost', '成本'],
  ['log', '日志'],
];

export function MemoryPanel(props: { rpc: RpcFn }) {
  const rpc = props.rpc;
  const [tab, setTab] = useState('overview');

  ensureThemeStyle(); // 设置页挂载即注入主题令牌与组件样式
  useEffect(() => {
    watchSidebarIcon();
  }, []);

  let body;
  if (tab === 'overview') body = <OverviewTab rpc={rpc} />;
  else if (tab === 'records') body = <RecordsTab rpc={rpc} />;
  else if (tab === 'scenes') body = <ScenesTab rpc={rpc} />;
  else if (tab === 'persona') body = <PersonaTab rpc={rpc} />;
  else if (tab === 'cost') body = <CostTab rpc={rpc} />;
  else body = <LogTab rpc={rpc} />;

  return (
    <div className="dsh-mem-root" style={S.section}>
      <h2 style={S.heading}>记忆 (Memory)</h2>
      <p style={S.intro}>L0~L3 分层蒸馏记忆：浏览被记住的内容，控制记忆模式开关。</p>
      <div style={S.tabbar}>
        {TABS.map((t) => {
          return (
            <button
              key={t[0]}
              className={tab === t[0] ? 'dsh-mem-tab dsh-mem-tab-on' : 'dsh-mem-tab'}
              onClick={() => {
                setTab(t[0]!);
              }}
            >
              {t[1]}
            </button>
          );
        })}
      </div>
      {body}
    </div>
  );
}
