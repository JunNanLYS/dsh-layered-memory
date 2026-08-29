/**
 * 主题令牌层 + 组件样式：inline style 放不了 @keyframes/@property/伪类/媒体查询，
 * 惰性注入一次性样式表（id 防重复）。
 * 主题机制：dsh 前端在 body[data-ds-dark-theme] 切暗色并重定义 --dsw-alias-* 令牌；
 * 我们的中性色链真实 dsw 令牌（缺省时用自带 fallback），强调色是 DeepSeek 品牌蓝体系：
 *   accent（图形：下划线/边框/光晕，非文字，3:1 即可）
 *   accent-text（表面上的强调文字，双主题 ≥4.5:1）
 *   accent-fill（实底填充 + 白字，双主题 ≥4.5:1）
 * 设置页挂载即注入（ensureThemeStyle），输入栏 pill / 浮层 / 重建面板共用。
 */
export const THEME_STYLE_ID = 'dsh-mem-theme-style';

export function ensureThemeStyle() {
  if (document.getElementById(THEME_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = THEME_STYLE_ID;
  el.textContent = [
    // conic 角度动画需要 @property 注册才能插值；不支持 @property 的浏览器里
    // var(--dsh-mem-angle) 无定义 → conic 层失效 → 整条 background 退化为无背景
    // （光带边框与内底一并消失，仅剩文字色）。2026 常青浏览器均已支持，仅作记录。
    "@property --dsh-mem-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }",
    '@keyframes dshMemFlow { to { --dsh-mem-angle: 360deg; } }',
    // ── 令牌（浅色）。中性色链【真实存在的】dsw 令牌（design-platform.css 校对）：
    //    bg-layer-2/3、bg-overlay、border-l1/l2/l3、border-inverted、label-*、
    //    interactive-bg-hover、state-error-primary、tooltip-bg、dsw-shadow-lv1/lv3 ──
    ':root {',
    '  --dsh-mem-accent: #4d6bfe;',
    '  --dsh-mem-accent-text: #3d5be0;',
    '  --dsh-mem-accent-fill: #3d5be0;',
    '  --dsh-mem-accent-weak: rgba(77,107,254,0.10);',
    '  --dsh-mem-bg-card: var(--dsw-alias-bg-layer-2, #ffffff);',
    '  --dsh-mem-bg-inset: var(--dsw-alias-bg-overlay, #e9ecf2);',
    '  --dsh-mem-bg-hover: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,0.06));',
    '  --dsh-mem-bg-pop: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #ffffff));',
    '  --dsh-mem-border: var(--dsw-alias-border-l2, rgba(0,0,0,0.10));',
    '  --dsh-mem-border-strong: var(--dsw-alias-border-l3, rgba(0,0,0,0.12));',
    '  --dsh-mem-border-pop: var(--dsw-alias-border-inverted, rgba(0,0,0,0));',
    '  --dsh-mem-text-1: var(--dsw-alias-label-primary, #0f1115);',
    '  --dsh-mem-text-2: var(--dsw-alias-label-secondary, #61666b);',
    '  --dsh-mem-text-3: var(--dsw-alias-label-tertiary, #6e7781);',
    '  --dsh-mem-danger: var(--dsw-alias-state-error-primary, #d0403f);',
    // 图表系列（成本折线图）：8 档固定色，PALETTE 只引用 var()；1 档锚品牌蓝，8 档中性"其他"
    '  --dsh-mem-chart-1: #4d6bfe;',
    '  --dsh-mem-chart-2: #0e9c8f;',
    '  --dsh-mem-chart-3: #1f9d55;',
    '  --dsh-mem-chart-4: #a8821c;',
    '  --dsh-mem-chart-5: #d97a0d;',
    '  --dsh-mem-chart-6: #d64570;',
    '  --dsh-mem-chart-7: #7c5cff;',
    '  --dsh-mem-chart-8: #61666b;',
    // 档位色 = 灰 → 品牌蓝 的渐变阶（chat/work 过渡蓝 / auto 品牌蓝）；
    // 文字对比度按 pill 真实底色（流光内底 = bg-card 97% + 档位色 3%）复算 AA 达标
    '  --dsh-mem-mode-chat: #5a69b0;',
    '  --dsh-mem-mode-work: #5263ca;',
    '  --dsh-mem-mode-auto: #3d5be0;',
    // 滑轨填充渐变（左浅右深）
    '  --dsh-mem-fill-1: #7b93ff;',
    '  --dsh-mem-fill-2: #3d5be0;',
    '  --dsh-mem-thumb: #ffffff;',
    '  --dsh-mem-track: rgba(128,140,150,0.32);',
    '  --dsh-mem-dot: rgba(128,140,150,0.55);',
    '  --dsh-mem-shadow-card: var(--dsw-shadow-lv1, 0 2px 4px 0 rgba(0,0,0,0.05));',
    '  --dsh-mem-shadow-pop: var(--dsw-shadow-lv3, 0 0 1px 0 rgba(0,0,0,.2), 0 0 4px 0 rgba(0,0,0,.02), 0 12px 32px 0 rgba(0,0,0,0.08));',
    '}',
    // ── 令牌（暗色：body[data-ds-dark-theme] 是 dsh 前端的暗色开关） ──
    'body[data-ds-dark-theme] {',
    '  --dsh-mem-accent: #6e85ff;',
    '  --dsh-mem-accent-text: #7b90ff;',
    '  --dsh-mem-accent-fill: #465ce8;',
    '  --dsh-mem-accent-weak: rgba(110,133,255,0.14);',
    '  --dsh-mem-bg-card: var(--dsw-alias-bg-layer-2, #2c2c2e);',
    '  --dsh-mem-bg-inset: var(--dsw-alias-bg-layer-1, #232324);',
    '  --dsh-mem-bg-hover: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.08));',
    '  --dsh-mem-bg-pop: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #353638));',
    '  --dsh-mem-border: var(--dsw-alias-border-l2, rgba(255,255,255,0.12));',
    '  --dsh-mem-border-strong: var(--dsw-alias-border-l3, rgba(255,255,255,0.16));',
    '  --dsh-mem-border-pop: var(--dsw-alias-border-inverted, rgba(255,255,255,0.06));',
    '  --dsh-mem-text-1: var(--dsw-alias-label-primary, #f9fafb);',
    '  --dsh-mem-text-2: var(--dsw-alias-label-secondary, #cfd3d6);',
    '  --dsh-mem-text-3: var(--dsw-alias-label-tertiary, #8892a6);',
    '  --dsh-mem-danger: var(--dsw-alias-state-error-primary, #f4707b);',
    '  --dsh-mem-chart-1: #6e85ff;',
    '  --dsh-mem-chart-2: #35c4b5;',
    '  --dsh-mem-chart-3: #52c98d;',
    '  --dsh-mem-chart-4: #d9b23e;',
    '  --dsh-mem-chart-5: #f59e5b;',
    '  --dsh-mem-chart-6: #f47ba2;',
    '  --dsh-mem-chart-7: #a78bfa;',
    '  --dsh-mem-chart-8: #8892a6;',
    '  --dsh-mem-mode-chat: #97a4ff;',
    '  --dsh-mem-mode-work: #8295ff;',
    '  --dsh-mem-mode-auto: #7b90ff;',
    '  --dsh-mem-fill-1: #8fa0ff;',
    '  --dsh-mem-fill-2: #465ce8;',
    '  --dsh-mem-thumb: #e8ebf5;',
    '  --dsh-mem-track: rgba(148,160,180,0.30);',
    '  --dsh-mem-dot: rgba(148,160,180,0.5);',
    '  --dsh-mem-shadow-card: var(--dsw-shadow-lv1, 0 2px 4px 0 rgba(0,0,0,0.3));',
    '  --dsh-mem-shadow-pop: var(--dsw-shadow-lv3, 0 0 1px 0 rgba(0,0,0,.2), 0 0 4px 0 rgba(0,0,0,.02), 0 12px 32px 0 rgba(0,0,0,.08));',
    '}',
    // ── 主题切换过渡：只挂颜色/阴影（不碰 transform），让明暗翻转不生硬 ──
    '.dsh-mem-root, .dsh-mem-root * { transition: background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease; }',
    // ── 控件：按钮（次级）── 圆角体系：控件 8 / 卡片 10 / 浮层 12 / 胶囊 999
    '.dsh-mem-btn {',
    '  padding: 5px 14px; font-size: 13px; line-height: 20px; border-radius: 8px; cursor: pointer;',
    '  border: 1px solid var(--dsh-mem-border); background: var(--dsh-mem-bg-card); color: var(--dsh-mem-text-1);',
    '  transition: background-color .15s ease, border-color .15s ease, transform .08s ease;',
    '}',
    '.dsh-mem-btn:hover:not(:disabled) { border-color: var(--dsh-mem-border-strong); background: var(--dsh-mem-bg-hover); }',
    '.dsh-mem-btn:active:not(:disabled) { transform: scale(0.98); }',
    '.dsh-mem-btn:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: 1px; }',
    '.dsh-mem-btn:disabled { opacity: 0.45; cursor: not-allowed; }',
    // ── 控件：输入框 / 下拉 ──
    '.dsh-mem-input {',
    '  padding: 5px 10px; font-size: 13px; border-radius: 8px; color: var(--dsh-mem-text-1);',
    '  border: 1px solid var(--dsh-mem-border); background: var(--dsh-mem-bg-card);',
    '  transition: border-color .15s ease, box-shadow .15s ease;',
    '}',
    '.dsh-mem-input:focus {',
    '  outline: none; border-color: var(--dsh-mem-accent);',
    '  box-shadow: 0 0 0 3px var(--dsh-mem-accent-weak);',
    '}',
    // ── 下拉（NSel 触发钮）：观感同输入框（8px 圆角/同令牌边框底色），文字
    //    ellipsis + CSS 描边 chevron（展开旋转 180°）；弹出面板见 .dsh-mem-pop ──
    '.dsh-mem-select {',
    '  display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;',
    '  width: 100%; min-width: 0; padding: 5px 10px; font: inherit; font-size: 13px; line-height: 20px;',
    '  text-align: left; border-radius: 8px; cursor: pointer; color: var(--dsh-mem-text-1);',
    '  border: 1px solid var(--dsh-mem-border); background: var(--dsh-mem-bg-card);',
    '  transition: border-color .15s ease, box-shadow .15s ease;',
    '}',
    '.dsh-mem-select:focus-visible {',
    '  outline: none; border-color: var(--dsh-mem-accent);',
    '  box-shadow: 0 0 0 3px var(--dsh-mem-accent-weak);',
    '}',
    '.dsh-mem-select:disabled { opacity: 0.45; cursor: not-allowed; }',
    '.dsh-mem-select-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    // 下拉弹出面板：dsh MenuDropdown 同款——浮层 12 圆角 + menu 底 + lv3 投影，
    // 选项行 10 圆角 + hover 底色 + 选中打勾（选项 active 由 data-active 标记）
    '.dsh-mem-sel { position: relative; display: inline-flex; min-width: 0; vertical-align: top; }',
    '.dsh-mem-sel-chev {',
    '  width: 8px; height: 8px; flex: none; margin-right: 2px;',
    '  border-right: 1.5px solid var(--dsh-mem-text-3); border-bottom: 1.5px solid var(--dsh-mem-text-3);',
    '  transform: rotate(45deg); transition: transform .12s ease;',
    '}',
    '.dsh-mem-sel-chev-open { transform: rotate(225deg); }',
    '.dsh-mem-pop {',
    '  position: absolute; top: calc(100% + 6px); left: 0; z-index: 30;',
    '  min-width: 100%; width: max-content; max-width: 340px; max-height: 264px;',
    '  overflow-y: auto; overscroll-behavior: contain; padding: 4px;',
    '  background: var(--dsh-mem-bg-pop); border: 1px solid var(--dsh-mem-border-pop);',
    '  border-radius: 12px; box-shadow: var(--dsh-mem-shadow-pop);',
    '}',
    '.dsh-mem-pop-opt {',
    '  display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;',
    '  min-height: 32px; padding: 5px 10px; font: inherit; font-size: 13px; line-height: 20px;',
    '  text-align: left; color: var(--dsh-mem-text-1); cursor: pointer;',
    '  background: none; border: none; outline: none; border-radius: 10px;',
    '}',
    '.dsh-mem-pop-opt:hover, .dsh-mem-pop-opt[data-active="1"] { background: var(--dsh-mem-bg-hover); }',
    '.dsh-mem-pop-opt-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.dsh-mem-pop-check { flex: none; font-size: 12px; color: var(--dsh-mem-text-1); }',
    '.dsh-mem-pop-empty { padding: 10px; font-size: 13px; color: var(--dsh-mem-text-3); }',
    // ── Tab（下划线式）：active 品牌蓝下划线 + 主文字色 ──
    '.dsh-mem-tab {',
    '  padding: 6px 12px; font-size: 13px; cursor: pointer; background: none; border: none;',
    '  color: var(--dsh-mem-text-2); border-bottom: 2px solid transparent; margin-bottom: -1px;',
    '}',
    '.dsh-mem-tab:hover { color: var(--dsh-mem-text-1); }',
    '.dsh-mem-tab-on { font-weight: 600; color: var(--dsh-mem-text-1); border-bottom-color: var(--dsh-mem-accent); }',
    '.dsh-mem-tab:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: -2px; }',
    // ── 卡片：悬浮微抬 + 边框加深（只在可交互卡片上用 hover） ──
    '.dsh-mem-card {',
    '  border: 1px solid var(--dsh-mem-border); border-radius: 10px; background: var(--dsh-mem-bg-card);',
    '  box-shadow: var(--dsh-mem-shadow-card);',
    '}',
    '.dsh-mem-card-hover:hover { border-color: var(--dsh-mem-border-strong); }',
    // ── 场景卡折叠箭头：展开态旋转 90°（过渡只做反馈，进 reduced-motion 压制名单） ──
    '.dsh-mem-scene-chev { display: inline-block; transition: transform .15s ease; color: var(--dsh-mem-text-3); }',
    // ── 记忆类型标签：tint 风格（彩底淡色 + 彩字），--dsh-mem-tag-c 由类型类给定 ──
    '.dsh-mem-tag {',
    '  display: inline-block; padding: 1px 8px; border-radius: 999px;',
    '  font-size: 11px; font-weight: 600; line-height: 18px; white-space: nowrap;',
    '  color: var(--dsh-mem-tag-c, var(--dsh-mem-text-2));',
    '  background: color-mix(in srgb, var(--dsh-mem-tag-c, #8a93a1) 12%, transparent);',
    '  border: 1px solid color-mix(in srgb, var(--dsh-mem-tag-c, #8a93a1) 28%, transparent);',
    '}',
    '.dsh-mem-tag-persona   { --dsh-mem-tag-c: #6f42c1; }',
    '.dsh-mem-tag-episodic  { --dsh-mem-tag-c: #0757b4; }',
    '.dsh-mem-tag-instruction, .dsh-mem-tag-work-artifact { --dsh-mem-tag-c: #8a5a00; }',
    '.dsh-mem-tag-work-fact { --dsh-mem-tag-c: #0757b4; }',
    '.dsh-mem-tag-work-task { --dsh-mem-tag-c: #116629; }',
    '.dsh-mem-tag-work-method { --dsh-mem-tag-c: #6f42c1; }',
    'body[data-ds-dark-theme] .dsh-mem-tag-persona   { --dsh-mem-tag-c: #c297ff; }',
    'body[data-ds-dark-theme] .dsh-mem-tag-episodic  { --dsh-mem-tag-c: #6cb2ff; }',
    'body[data-ds-dark-theme] .dsh-mem-tag-instruction, body[data-ds-dark-theme] .dsh-mem-tag-work-artifact { --dsh-mem-tag-c: #e3b341; }',
    'body[data-ds-dark-theme] .dsh-mem-tag-work-fact { --dsh-mem-tag-c: #6cb2ff; }',
    'body[data-ds-dark-theme] .dsh-mem-tag-work-task { --dsh-mem-tag-c: #6fca74; }',
    'body[data-ds-dark-theme] .dsh-mem-tag-work-method { --dsh-mem-tag-c: #c297ff; }',
    // ── pill 边缘流光（品牌蓝族，chat/work/auto 三档共用；off 无）：border 区画旋转
    // conic 光带；内部必须是【不透明】底色盖住光带（半透明内层会让 conic 透进按钮
    // 内部，文字被光斑干扰——实测事故）。不透明底 = 主题底混 3% 档位色
    //（--dsh-mem-pill-tint 由 pill inline 给定；3% 保证档位色文字 AA，暗色智能档余量 4.63:1）
    '.dsh-mem-flow {',
    '  border: 1px solid transparent;',
    '  background:',
    '    linear-gradient(',
    '      color-mix(in srgb, var(--dsh-mem-bg-card, #ffffff) 97%, var(--dsh-mem-pill-tint, #4d6bfe)),',
    '      color-mix(in srgb, var(--dsh-mem-bg-card, #ffffff) 97%, var(--dsh-mem-pill-tint, #4d6bfe))',
    '    ) padding-box,',
    '    conic-gradient(from var(--dsh-mem-angle),',
    '      rgba(61,91,224,0.9), rgba(77,107,254,0.95), rgba(147,168,255,1),',
    '      rgba(110,133,255,0.9), rgba(61,91,224,0.9)) border-box;',
    '  animation: dshMemFlow 3s linear infinite;',
    '}',
    // ── off 档 pill：dsh 透明按钮——无底无边框只留文字，hover 才出 interactive 淡底 ──
    //（button 裸元素会露出 UA 默认灰底+描边，必须显式压掉）
    '.dsh-mem-pill-off { border: none; background: transparent; }',
    '.dsh-mem-pill-off:hover { background: var(--dsh-mem-bg-hover); }',
    '.dsh-mem-pill-off:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: 1px; }',
    // 流光态焦点环（同一物理按钮的两态焦点反馈对称，配方同 .dsh-mem-btn）
    '.dsh-mem-flow:focus-visible { outline: 2px solid var(--dsh-mem-accent); outline-offset: 1px; }',
    // ── 触屏隐形热区（手机端适配）：触点目标补足 44px 标准（iOS HIG）。
    // 伪元素不参与布局（浮层/输入栏几何零变化），指针事件落在宿主元素上。
    // 全端统一不做 pointer:coarse 分端（桌面点中目标变大是纯收益）。
    // pill：视觉高 24px，::after 上下各外扩 10px；只上下不左右——左右是宿主输入栏
    // 邻位控件（模式选择器），外扩制造误触重叠带。
    // 滑轨：视觉轨 22px，::before 上下各外扩 11px；touch-action:none 已随轨声明，
    // 伪元素区的触摸同样命中轨元素。两处 px 值改须与注释口径同步 ──
    '.dsh-mem-pill-hit::after {',
    "  content: ''; position: absolute; left: 0; right: 0; top: -10px; bottom: -10px;",
    '}',
    '.dsh-mem-hitband::before {',
    "  content: ''; position: absolute; left: 0; right: 0; top: -11px; bottom: -11px;",
    '}',
    // ── 浮层（dsh 原生菜单同配方：不透明实底 + inverted 描边（浅色不可见）+ lv3 阴影） ──
    '.dsh-mem-popover {',
    '  border-radius: 12px;',
    '  border: 1px solid var(--dsh-mem-border-pop);',
    '  background: var(--dsh-mem-bg-pop);',
    '  box-shadow: var(--dsh-mem-shadow-pop);',
    '  color: var(--dsh-mem-text-1);',
    '}',
    // ── 拖动气泡：拖拽时显示当前档位名，随圆球移动，下倒三角尖角贴近圆球 ──
    // 底色走浮层同材质令牌（浅色白底深字 / 暗色深底浅字，随主题翻转；
    // tooltip-bg 令牌在浅色下仍是深色，不随材质走，已弃用）。
    // 悬停 8px（尖角尖端距圆球顶约 5px）；气泡 zIndex 4 高于浮层（同层叠上下文内
    // 数值比较），跨过浮层上缘时盖在其上；描边 + 投影让同材质不融合
    '.dsh-mem-bubble {',
    '  position: absolute; bottom: calc(100% + 8px); transform: translateX(-50%);',
    '  padding: 3px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; line-height: 18px;',
    '  border: 1px solid var(--dsh-mem-border);',
    '  background: var(--dsh-mem-bg-pop); color: var(--dsh-mem-text-1); white-space: nowrap;',
    '  box-shadow: 0 2px 8px rgba(0,0,0,0.18);',
    '}',
    // 尖角：clip-path 倒三角（旋转方块会露出上半截成菱形，实测视觉缺陷）。
    // 双三角叠画：外层描边色大一圈、内层填充色，压在浮层上缘也有轮廓可读
    '.dsh-mem-bubble::before {',
    "  content: ''; position: absolute; top: 100%; left: 50%; margin-left: -6px;",
    '  width: 12px; height: 7px;',
    '  clip-path: polygon(0 0, 100% 0, 50% 100%);',
    '  background: var(--dsh-mem-border);',
    '}',
    '.dsh-mem-bubble::after {',
    "  content: ''; position: absolute; top: 100%; left: 50%; margin-left: -5px;",
    '  width: 10px; height: 6px;',
    '  clip-path: polygon(0 0, 100% 0, 50% 100%);',
    '  background: var(--dsh-mem-bg-pop);',
    '}',
    // ── 粒子层（点阵场）：浅色 multiply 混合——深蓝点乘在浅蓝填充上沉显对比 ──
    'body:not([data-ds-dark-theme]) .dsh-mem-particles { mix-blend-mode: multiply; opacity: 0.82; }',
    // ── 重建面板 ──（模态本体走 NModal：原生 Modal 优先，回退 rb-overlay/rb-modal）
    '.dsh-mem-rb-card {',
    '  border: 1px solid var(--dsh-mem-border); border-radius: 10px; background: var(--dsh-mem-bg-card);',
    '  box-shadow: var(--dsh-mem-shadow-card); padding: 12px 14px; margin-bottom: 14px; font-size: 13px;',
    '}',
    '.dsh-mem-rb-bar { height: 8px; border-radius: 4px; overflow: hidden; flex: 1; background: var(--dsh-mem-track); }',
    '.dsh-mem-rb-fill { height: 100%; border-radius: 4px; background: var(--dsh-mem-accent-fill); transition: width .4s ease; }',
    '.dsh-mem-rb-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35);',
    '  display: flex; align-items: center; justify-content: center; z-index: 2000; }',
    '.dsh-mem-rb-modal { width: 440px; max-width: calc(100vw - 48px); border-radius: 12px;',
    '  padding: 18px 20px; font-size: 13px; line-height: 1.6;',
    '  border: 1px solid var(--dsh-mem-border); background: var(--dsh-mem-bg-card); color: var(--dsh-mem-text-1);',
    '  box-shadow: 0 16px 48px rgba(0,0,0,0.24); }',
    'body[data-ds-dark-theme] .dsh-mem-rb-modal { box-shadow: 0 16px 48px rgba(0,0,0,0.6); }',
    '.dsh-mem-rb-muted { font-size: 12px; color: var(--dsh-mem-text-3); }',
    // ── 会话信息区（悬浮卡下半部）：分隔线 + 2×2 指标 + 状态行；纯静态 DOM，
    // 不进粒子层 rAF 循环，轮询数据到达才触发本组件小树 re-render ──
    '.dsh-mem-sinfo { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--dsh-mem-border); }',
    '.dsh-mem-sinfo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }',
    '.dsh-mem-sinfo-val { font-size: 13px; font-weight: 600; color: var(--dsh-mem-text-1); line-height: 18px; font-variant-numeric: tabular-nums; }',
    '.dsh-mem-sinfo-label { font-size: 11px; color: var(--dsh-mem-text-3); line-height: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.dsh-mem-sinfo-warn { font-size: 11px; color: var(--dsh-mem-danger); line-height: 16px; margin-bottom: 6px; }',
    '.dsh-mem-sinfo-note { font-size: 11px; color: var(--dsh-mem-text-3); line-height: 16px; margin-top: 8px; }',
    '.dsh-mem-sinfo-sum { font-size: 11px; color: var(--dsh-mem-text-3); line-height: 16px; margin-top: 8px; }',
    // reduced-motion 兜底放样式表末尾：同特异性下后置声明才能压过上面的组件类
    '@media (prefers-reduced-motion: reduce) {',
    '  .dsh-mem-root, .dsh-mem-root *, .dsh-mem-btn, .dsh-mem-input, .dsh-mem-select, .dsh-mem-rb-fill, .dsh-mem-scene-chev, .dsh-mem-sel-chev { transition: none; }',
    '  .dsh-mem-flow { animation: none; }',
    '}',
  ].join('\n');
  document.head.appendChild(el);
}
