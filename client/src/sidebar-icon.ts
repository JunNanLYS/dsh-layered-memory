/**
 * 设置页侧边栏 icon：宿主 navIcon() 按 section id 硬编码白名单（slot 注册对象
 * 无 icon 字段），"dsh-memory" 落齿轮兜底。受控 DOM 补丁：把侧边栏"记忆"按钮的
 * 齿轮换成书本 icon。宿主只在分节激活时渲染我们的面板，所以补丁不能依赖
 * MemoryPanel 挂载——由常驻的输入栏 pill 驱动一个 body 级防抖观察器（全局单例，
 * 应用生命周期存续，观察 body 子树 childList）：设置页随时打开、侧边栏随时
 * 重渲染都能打上/重打补丁。找不到或 DOM 结构变化时静默保持原生齿轮。
 */
const BOOK_ICON_SVG =
  '<svg data-mem-icon="1" viewBox="0 0 16 16" width="16" height="16" fill="none" ' +
  'xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">' +
  '<path d="M8 3.4C6.6 2.5 4.6 2.4 2.9 3.1v9.3c1.7-.7 3.7-.6 5.1.3 1.4-.9 3.4-1 5.1-.3V3.1C11.4 2.4 9.4 2.5 8 3.4Z" ' +
  'stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>' +
  '<path d="M8 3.4v9.3" stroke="currentColor" stroke-width="1.2"/></svg>';

function patchSidebarIcon() {
  try {
    const buttons = document.querySelectorAll('button');
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i]!;
      const span = b.querySelector('span');
      const svg = b.querySelector('svg');
      // 侧边栏导航项 = [svg 图标, span 标签文本]；输入栏 pill 的文本形态不同（"记忆 · X"）
      if (span && svg && span.textContent && span.textContent.trim() === '记忆' && svg.getAttribute('data-mem-icon') !== '1') {
        svg.outerHTML = BOOK_ICON_SVG;
      }
    }
  } catch {
    /* best-effort：失败保持原生齿轮 */
  }
}

// body 子树变更频繁（对话流式渲染），补丁扫描走 250ms 尾随防抖
let sidebarIconTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSidebarPatch() {
  if (sidebarIconTimer !== null) return;
  sidebarIconTimer = setTimeout(() => {
    sidebarIconTimer = null;
    patchSidebarIcon();
  }, 250);
}

export function watchSidebarIcon() {
  patchSidebarIcon();
  try {
    if (document.body.getAttribute('data-mem-icon-bodywatch') === '1') return;
    document.body.setAttribute('data-mem-icon-bodywatch', '1');
    new MutationObserver(scheduleSidebarPatch).observe(document.body, { childList: true, subtree: true });
  } catch {
    /* ignore */
  }
}
