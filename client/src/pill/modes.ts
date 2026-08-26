/**
 * 会话记忆档位控件（输入栏 pill + 滑动选择器）的档位词表与几何常量。
 * 档位顺序即滑轨顺序：关闭 → 日常 → 工作 → 智能（默认档"智能"居右）。
 * 显示名中文；配置键与英文层保持 off/chat/work/auto（session-modes.json 不变）。
 * 档位色是 CSS 变量引用（--dsh-mem-mode-*，Light/Dark 各一组值，注入样式表定义），
 * 取值 = 灰 → 品牌蓝 的渐变阶：off 灰、chat/work 过渡蓝、auto 品牌蓝。
 */
export interface ModeDef {
  key: string;
  label: string;
  color: string;
}

export const MODES: ModeDef[] = [
  { key: 'off', label: '关闭', color: 'var(--dsh-mem-text-2)' },
  { key: 'chat', label: '日常', color: 'var(--dsh-mem-mode-chat)' },
  { key: 'work', label: '工作', color: 'var(--dsh-mem-mode-work)' },
  { key: 'auto', label: '智能', color: 'var(--dsh-mem-mode-auto)' },
];

export const TRACK_W = 200;
export const THUMB = 16;
export const RAIL_H = 22; // 粗滑轨高度 > 圆球直径（圆球被滑轨包裹）
export const INNER_W = TRACK_W - THUMB;

/** 点阵粒子场档位参数（参考 DSH-Claude-Style-Reasoning-Slider 的分档场强，
 * 配色锁品牌蓝单色系）：density 越大点阵越密、alpha 亮度系数、wave 明暗水波纹、
 * tempo 闪烁节拍倍率。tier0（关闭）不参与——show=false 整层不画 */
export const FIELD_TIERS = [
  { density: 0, alpha: 0, wave: 0, tempo: 1 },
  { density: 0.34, alpha: 0.5, wave: 0, tempo: 1 }, // 日常：稀疏微光
  { density: 0.55, alpha: 0.78, wave: 1, tempo: 1.15 }, // 工作：中强 + 水波纹
  { density: 0.72, alpha: 1, wave: 1, tempo: 1.3 }, // 智能：满场最活跃
];

/** smoothstep（粒子场展开/揭示用 ease） */
export function smStep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function modeInfo(key: string | null | undefined): ModeDef {
  for (let i = 0; i < MODES.length; i++) if (MODES[i]!.key === key) return MODES[i]!;
  return MODES[3]!; // null（首帧未加载）落默认档
}

export function modeLabel(key: string): string {
  if (key === 'auto') return '智能（双族）';
  if (key === 'chat') return '日常（个人）';
  if (key === 'work') return '工作（团队）';
  return '关闭';
}

export function modeIndex(key: string): number {
  for (let i = 0; i < MODES.length; i++) if (MODES[i]!.key === key) return i;
  return 3;
}
