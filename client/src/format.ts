/** 通用格式化与标签词表（跨 Tab 共用）。 */

export const TYPE_LABELS: Record<string, string> = {
  persona: '画像偏好',
  episodic: '客观事件',
  instruction: '全局指令',
  work_fact: '工作事实',
  work_task: '工作任务',
  work_method: '工作方法',
  work_artifact: '工作资产',
};

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

/** 相对时间（悬浮卡摘要行用）：刚刚 / N 分钟前 / N 小时前 / N 天前；无效返回 null。 */
export function fmtAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const t = new Date(iso).getTime();
    if (!t) return null;
    let s = Math.floor((Date.now() - t) / 1000);
    if (s < 0) s = 0;
    if (s < 45) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  } catch {
    return null;
  }
}

/** 字节数 → 人类可读（嵌入模型卡体积等）。 */
export function fmtMB(bytes: number): string {
  if (!bytes || bytes <= 0) return '0MB';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(bytes < 100 * 1024 * 1024 ? 1 : 0) + 'MB';
}
