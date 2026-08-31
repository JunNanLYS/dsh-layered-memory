/** 工作台共用件：区标题 / 错误重试块 / 紧凑数字 / 活动流小标（五区共享）。 */
import type { CSSProperties, ReactNode } from 'react';
import { t } from '../i18n.js';
import { S } from '../styles.js';
import { NButton, NIconChevronRight14 } from '../ui/primitives.js';

const TITLE_BASE: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  lineHeight: '22px',
  margin: '20px 0 10px',
  color: 'var(--dsh-mem-text-1)',
};

/** 区标题（first = 首区去掉上边距）。 */
export function SectionTitle(props: { children: ReactNode; first?: boolean }) {
  return <div style={{ ...TITLE_BASE, ...(props.first ? { marginTop: 0 } : null) }}>{props.children}</div>;
}

/** 加载失败块（重试可点；其余界面保持可浏览）。 */
export function ErrorBlock(props: { msg?: string | null; onRetry?(): void }) {
  return (
    <div
      className="dsh-mem-card"
      style={{ ...S.card, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: 16 }}
    >
      <b style={{ color: 'var(--dsh-mem-danger)' }}>{t('ws.loadFail')}</b>
      {props.msg ? <span style={S.muted}>{props.msg}</span> : null}
      {props.onRetry ? (
        <NButton
          onClick={() => {
            props.onRetry?.();
          }}
        >
          {t('ws.retry')}
        </NButton>
      ) : null}
    </div>
  );
}

/** 紧凑 token 数字（~K 格式，与官方上下文数字口径一致）。 */
export function fmtTokensCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return (n / 1000).toFixed(n < 100_000 ? 1 : 0) + 'K';
  return (n / 1_000_000).toFixed(1) + 'M';
}

/** 动词小标（新增/更新）。 */
export function VerbTag(props: { verb: 'new' | 'upd' }) {
  return (
    <span className={'dsh-mem-vtag ' + (props.verb === 'new' ? 'dsh-mem-vtag-new' : 'dsh-mem-vtag-upd')}>
      {t('verb.' + props.verb)}
    </span>
  );
}

/** 层小标（记忆/场景/画像）。 */
export function KindTag(props: { kind: 'l1' | 'l2' | 'l3' }) {
  return <span className="dsh-mem-typetag">{t('kind.' + props.kind)}</span>;
}

/** 族小标（日常/工作）。 */
export function FamilyTag(props: { family: string }) {
  return <span className="dsh-mem-typetag">{t('scope.' + props.family)}</span>;
}

/** 展开箭头（原生右向 chevron 图标，随 .open 旋转 90° 向下）。 */
export function Chevron() {
  return (
    <span className="dsh-mem-feed-chev" aria-hidden="true">
      <NIconChevronRight14 />
    </span>
  );
}
