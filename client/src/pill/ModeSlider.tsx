/** 滑动选择器浮层（参考 macOS 滑动器：拖拽圆头 1:1 连续跟手，松手按动量投影吸附最近档）。 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Segmented } from '../ui/controls.js';
import type { RpcFn } from '../rpc.js';
import { ensureThemeStyle } from '../theme.js';
import { FIELD_TIERS, INNER_W, MODES, RAIL_H, THUMB, TRACK_W, modeIndex, smStep } from './modes.js';
import { SessionInfoArea } from './SessionInfoArea.js';

interface DragState {
  /** 圆头连续位置 px */
  x: number;
  lastX: number;
  t: number;
  /** 速度 px/ms（EMA 平滑） */
  v: number;
}

/** 粒子层几何快照：每帧渲染时更新，rAF 循环跨帧读取（避免按帧重建 effect）。 */
interface GeoSnapshot {
  origin: number;
  rightEdge: number;
  tier: number;
  show: boolean;
  dragging: boolean;
}

interface GridCell {
  x: number;
  y: number;
  base: number;
  tempo: number;
  phase: number;
}

export function ModeSlider(props: {
  mode: string;
  onCommit(key: string): void;
  /** 会话级注入覆盖（#38）：null = 跟随全局；缺省（未传）= 浮层不渲染注入行。 */
  recall?: boolean | null;
  onCommitRecall?(next: boolean | null): void;
  error?: string | null;
  rpc?: RpcFn;
  sessionId?: string;
}) {
  ensureThemeStyle(); // 主题令牌与浮层/气泡 class 共用同一张注入样式表
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const geoRef = useRef<GeoSnapshot | null>(null);

  const clampX = (x: number) => {
    if (x < 0) return 0;
    if (x > INNER_W) return INNER_W;
    return x;
  };
  const xFromClientX = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return clampX(clientX - rect.left - THUMB / 2);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: xFromClientX(e.clientX), lastX: e.clientX, t: e.timeStamp, v: 0 });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const dt = e.timeStamp - drag.t;
    const instV = dt > 0 ? (e.clientX - drag.lastX) / dt : drag.v;
    setDrag({
      x: xFromClientX(e.clientX),
      lastX: e.clientX,
      t: e.timeStamp,
      v: drag.v * 0.7 + instV * 0.3, // EMA：瞬时抖动不放大，松手投影用
    });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    // 动量投影（Designing Fluid Interfaces）：按松手速度前瞻落点就近吸附；
    // 投影量 clamp 到半档（±30px）——甩动最多把边界推到相邻档，绝不会跳两档
    const projected = xFromClientX(e.clientX) + Math.max(-30, Math.min(30, drag.v * 120));
    const idx = Math.round((clampX(projected) / INNER_W) * (MODES.length - 1));
    setDrag(null);
    props.onCommit(MODES[idx]!.key);
  };

  // 拖拽中圆头 1:1 跟指针（连续位置，不吸附）；静止时停在档位中心
  const thumbLeft = drag !== null ? drag.x : (modeIndex(props.mode) / (MODES.length - 1)) * INNER_W;
  const activeIdx = Math.min(MODES.length - 1, Math.max(0, Math.round((thumbLeft / INNER_W) * (MODES.length - 1))));
  const info = MODES[activeIdx]!;

  // 粒子层几何快照：每帧渲染时更新，rAF 循环跨帧读取（避免按帧重建 effect）
  geoRef.current = {
    origin: thumbLeft + THUMB / 2, // 密度/亮度中心 = 圆球中心
    rightEdge: thumbLeft + THUMB, // 粒子活动区右界 = 填充右缘（不越过圆球）
    tier: activeIdx, // 场强档位（与填充/气泡同源；拖拽预览即时升降级）
    show: activeIdx > 0 || drag !== null, // 与填充显隐同源
    dragging: drag !== null,
  };

  // 粒子层动画循环：DPR 适配 + ResizeObserver + 主题观察；reduced-motion 只画静帧。
  // 依赖数组为空——几何/拖拽态经 geoRef 传递，effect 全生命周期只建一次
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 1;
    let height = 1;
    let frame = 0;
    let grid: GridCell[] = []; // 点阵网格（resize 时预计算静态哈希，逐帧只做时间维运算）
    let cell = 5;
    const gap = 1.1;
    let fieldOn = false; // show 翻转沿：入场展开动画的计时原点
    let fieldStart = 0;
    let lastDrawn = 0;

    const resize = () => {
      const b = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, b.width);
      height = Math.max(1, b.height);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // 网格：200×22 轨道 → 40 列 × 5 行 ≈ 200 格（哈希来自仓库B 的预计算方案）
      cell = width < 280 ? 5 : 6;
      grid = [];
      for (let row = 0; row * cell < height; row++) {
        for (let column = 0; column * cell < width; column++) {
          grid.push({
            x: column * cell,
            y: row * cell,
            base: Math.abs(Math.sin(column * 12.9898 + row * 78.233) * 43758.5453) % 1,
            tempo: Math.abs(Math.sin(column * 7.13 + row * 19.41) * 19341.731) % 1,
            phase: Math.abs(Math.sin(column * 31.17 + row * 11.93) * 28437.123) % 1,
          });
        }
      }
    };

    const draw = (time: number) => {
      const st = geoRef.current || { origin: 0, rightEdge: 0, tier: 0, show: false, dragging: false };
      ctx.clearRect(0, 0, width, height);
      if (!st.show || st.rightEdge <= 0) {
        fieldOn = false;
        return;
      }
      if (!fieldOn) {
        fieldOn = true;
        fieldStart = time; // 入场展开从这一刻起算（900ms 从圆球向外揭示）
      }
      const dark = document.body.hasAttribute('data-ds-dark-theme');
      const tier = FIELD_TIERS[st.tier] || FIELD_TIERS[1]!;
      const elapsed = Math.max(0, time - fieldStart);
      const reveal = reduced.matches ? 1 : smStep(0, 1, elapsed / 900);
      const ripplePhase = (elapsed % 1200) / 1200; // 明暗水波纹（1200ms 一轮，从球向外）
      const tempo = tier.tempo * (st.dragging ? 2 : 1); // 拖拽全档提速
      // 基色→高亮色：浅色用深蓝（multiply 混合下沉显色）/ 暗色用亮蓝
      const dim = dark ? [124, 144, 250] : [61, 91, 224];
      const hot = dark ? [214, 224, 255] : [126, 148, 250];

      ctx.save();
      ctx.beginPath();
      // 裁剪到填充区（胶囊形，与滑轨同圆角——矩形裁剪会在圆角末端溢出）
      if (ctx.roundRect) ctx.roundRect(0, 0, st.rightEdge, height, height / 2);
      else ctx.rect(0, 0, st.rightEdge, height);
      ctx.clip();

      for (let i = 0; i < grid.length; i++) {
        const c = grid[i]!;
        const dx = Math.abs(c.x + cell * 0.5 - st.origin) / Math.max(1, st.rightEdge * 0.5);
        if (dx > 1) continue;
        const near = Math.min(1, Math.max(0, 1 - dx * 1.1)); // 近球更密更亮
        if (c.base > tier.density - near * 0.3) continue; // 密度门（近球放行更多格）
        // 独立随机闪烁：每格按自身 tempo/phase 起伏
        const flicker = 0.5 + 0.5 * Math.sin(elapsed * 0.012 * tempo + c.tempo * 6.283 + c.phase * 6.283);
        // 明暗水波纹：从球心向外传播的亮带（tier 未开波纹时给常量底）
        const wave = tier.wave ? 0.5 + 0.5 * Math.sin((dx * 2 - ripplePhase) * 6.283) : 0.62;
        // 展开：越靠近球越早亮，向外渐显
        const revealA = smStep(0, 1, reveal * (1 - dx * 0.85) + dx * 0.15);
        const alpha = Math.min(1, (0.26 + 0.44 * flicker + near * 0.28) * (0.28 + 0.72 * wave) * revealA * tier.alpha);
        if (alpha < 0.02) continue;
        // 亮闪格向高亮色靠（flicker×wave 双高才发白）
        const glowMix = Math.max(0, flicker * wave - 0.45) * 1.6;
        ctx.fillStyle =
          'rgba(' +
          Math.round(dim[0]! + (hot[0]! - dim[0]!) * glowMix) +
          ',' +
          Math.round(dim[1]! + (hot[1]! - dim[1]!) * glowMix) +
          ',' +
          Math.round(dim[2]! + (hot[2]! - dim[2]!) * glowMix) +
          ',' +
          alpha.toFixed(3) +
          ')';
        ctx.fillRect(c.x + gap * 0.5, c.y + gap * 0.5, cell - gap, cell - gap);
      }
      ctx.restore();
    };

    const loop = (time: number) => {
      // 33ms 节流（≈30fps）：闪烁/波纹尺度下无可感差异，省电
      if (time - lastDrawn >= 33) {
        lastDrawn = time;
        draw(time);
      }
      frame = window.requestAnimationFrame(loop);
    };
    const redrawStatic = () => {
      if (reduced.matches) draw(performance.now());
    };
    const ro = new ResizeObserver(() => {
      resize();
      redrawStatic();
    });
    const themeObs = new MutationObserver(() => {
      redrawStatic(); // 静帧模式下主题翻转要重画（动画循环每帧自读主题）
    });
    ro.observe(canvas);
    themeObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    resize();
    draw(performance.now());
    if (!reduced.matches) frame = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(frame);
      ro.disconnect();
      themeObs.disconnect();
    };
  }, []);

  // ── 水平视口夹持（手机端适配）：浮层以 pill 中心为轴悬浮，而 pill 在输入栏左侧，
  // 窄视口（手机）下浮层左半会出屏。挂载即量一次，超界平移贴边（边距 8px），
  // 窗口 resize/旋转重算；桌面浮层天然在界内，shiftX 恒 0 零行为变化。
  // 垂直不夹：浮层只向上弹，点 pill 顺带收起软键盘，上方空间恒充裕（grilling 定案）。
  // ModeSlider 只在展开期间挂载，挂载即打开；useLayoutEffect 保证首帧前量完不闪位。
  // shift 参与变换，测量时须抵掉旧值还原理想中轴位置。
  const popRef = useRef<HTMLDivElement | null>(null);
  const shiftRef = useRef(0);
  const [shiftX, setShiftX] = useState(0);
  useLayoutEffect(() => {
    const clamp = () => {
      const el = popRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      const left = r.left - shiftRef.current;
      // 取舍（审查 P2-1）：视口窄于浮层+双边距（<250px，dsh web 现实下限 320px 不会到）
      // 时 if/else 左缘优先，右半浮层不可达——不做居中回退，保持定点稳定不振荡
      const edge = 8;
      let next = 0;
      if (left < edge) next = edge - left;
      else if (left + r.width > window.innerWidth - edge) {
        next = window.innerWidth - edge - (left + r.width);
      }
      if (next !== shiftRef.current) {
        shiftRef.current = next;
        setShiftX(next);
      }
    };
    clamp();
    window.addEventListener('resize', clamp);
    // 布局位移不都伴随 resize（侧边栏开合、软键盘、宿主动画）：浮层「开着即挂载」
    // 是短命表面，挂载期间 100ms 周期重夹——一次 getBoundingClientRect + 几次数值
    // 比较，与打开期间本来就在跑的粒子层 rAF 循环同级开销。不用 Intersection-
    // Observer：其回调依赖渲染帧派发，页面被遮挡/后台时整体停摆（连 observe 后
    // 必发的初始回调都不来，IAB 实测踩坑）；定时器后台只是节流到 1s、仍会跑。
    const iv = window.setInterval(clamp, 100);
    return () => {
      window.removeEventListener('resize', clamp);
      window.clearInterval(iv);
    };
  }, []);

  // 停点刻度：轨道上的 4 个小点提示可吸附位置；档位名改由拖动气泡显示
  const stops = [];
  for (let i = 0; i < MODES.length; i++) {
    const stopLeft = (i / (MODES.length - 1)) * INNER_W + THUMB / 2;
    stops.push(
      <div
        key={'stop' + i}
        style={{
          position: 'absolute',
          left: stopLeft - 3,
          top: (RAIL_H - 6) / 2,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--dsh-mem-dot)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />,
    );
  }

  return (
    <div
      // 外壳只负责定位（带 transform 居中悬浮在按钮上方，水平中轴对齐 pill 中心）；
      // shiftX = 水平视口夹持的贴边平移量（桌面恒 0）
      ref={popRef}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(calc(-50% + ' + shiftX + 'px))',
        zIndex: 1000,
      }}
    >
      <div
        // dsh 原生菜单同配方浮层：不透明实底（dsw-specific-menu）+ inverted 描边 + lv3 阴影；
        // 上下内边距对称（滑轨垂直居中、浮层紧凑），拖动气泡经 overflow: visible 溢出到浮层上方
        className="dsh-mem-popover"
        style={{ position: 'relative', padding: '14px 16px' }}
      >
        <div
          ref={trackRef}
          className="dsh-mem-hitband"
          style={{
            position: 'relative',
            // 容器宽 = thumb 活动范围（0..INNER_W + THUMB），点击映射与视觉两端严格对齐
            width: TRACK_W,
            height: RAIL_H,
            borderRadius: 999,
            background: 'var(--dsh-mem-track)',
            touchAction: 'none',
            cursor: drag === null ? 'pointer' : 'grabbing',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* 填充：从滑轨左端铺到圆球右缘（width = thumbLeft + THUMB，整球落在
              填充末端上与其重合，无空隙不割裂；auto 档恰好全轨蓝、不超出轨道）；
              颜色从左往右渐变：左侧浅（fill-1）到球侧深（fill-2）；
              显隐分两支：静态关闭档（off 且未拖拽）不渲染；拖拽中无论预览到哪档
              恒显示（松手落 off 才随提交消失）；
              松手吸附时 width 与圆球 left 同走 120ms ease（防球与填充瞬时分家） */}
          {activeIdx > 0 || drag !== null ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: thumbLeft + THUMB,
                borderRadius: 999,
                background: 'linear-gradient(90deg, var(--dsh-mem-fill-1), var(--dsh-mem-fill-2))',
                pointerEvents: 'none',
                zIndex: 1,
                transition: drag === null ? 'width 120ms ease' : 'none',
              }}
            />
          ) : null}
          {stops}
          {/* 粒子层：点阵粒子场（pointerEvents none 不挡拖拽；拖拽时滤镜增饱和提亮） */}
          <canvas
            ref={canvasRef}
            className="dsh-mem-particles"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 2,
              filter: drag !== null ? 'saturate(1.45) brightness(1.28) contrast(1.06)' : 'none',
            }}
          />
          {/* 圆球：被粗滑轨包裹（RAIL_H > THUMB），品牌蓝描边，拖拽时阴影加重 */}
          <div
            style={{
              position: 'absolute',
              left: thumbLeft,
              top: (RAIL_H - THUMB) / 2,
              width: THUMB,
              height: THUMB,
              borderRadius: '50%',
              background: 'var(--dsh-mem-thumb)',
              border: '1px solid var(--dsh-mem-accent)',
              boxShadow: drag !== null ? '0 2px 8px rgba(0,0,0,0.35)' : '0 1px 4px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
              transition: drag === null ? 'left 120ms ease' : 'none',
              zIndex: 3,
            }}
          />
          {/* 拖动气泡：仅拖拽期间显示当前档位名，下尖角指向圆球，松手即消失 */}
          {drag !== null ? (
            <div className="dsh-mem-bubble" style={{ left: thumbLeft + THUMB / 2, zIndex: 4 }}>
              {info.label}
            </div>
          ) : null}
        </div>
        {props.error ? (
          <div style={{ fontSize: 11, color: 'var(--dsh-mem-danger)', marginTop: 10, whiteSpace: 'nowrap' }}>
            {props.error}
          </div>
        ) : null}
        {/* 注入三态行（#38 只写不读）：滑轨（族维度）正下方，档位与注入正交分立。
            文案极简：标签两字 + 三态词；语义「跟随全局」即清除会话覆盖。
            off 档时行禁用（完全隐身包含注入，开关无意义） */}
        {props.recall !== undefined && props.onCommitRecall ? (
          <div
            style={{
              borderTop: '1px solid var(--dsh-mem-border)',
              marginTop: 10,
              paddingTop: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--dsh-mem-text-3)' }}>注入</span>
            <Segmented
              value={props.recall === null ? 'follow' : props.recall ? 'on' : 'off'}
              disabled={props.mode === 'off'}
              options={[
                { key: 'follow', label: '跟随全局', title: '清除本会话覆盖，跟随全局召回开关' },
                { key: 'on', label: '开', title: '本会话强制注入记忆' },
                { key: 'off', label: '关', title: '只写：记忆照常沉淀，但不注入本会话' },
              ]}
              onChange={(key) => props.onCommitRecall!(key === 'on' ? true : key === 'off' ? false : null)}
            />
          </div>
        ) : null}
        {/* 会话信息区（分隔线 + 2×2 指标 + 状态行）：session-stats 热路径端点，
            宿主不支持 / 数据缺失时整体不渲染（best-effort 增强，不占位） */}
        {props.rpc && props.sessionId ? <SessionInfoArea rpc={props.rpc} sessionId={props.sessionId} /> : null}
      </div>
    </div>
  );
}
