import { EFFORT_CHOICES } from './config.js';
import { errDetail } from './util/filelog.js';
/** 状态行/命令回显的档位短名（与 web 芯片「记忆 · 智能」同口径）。 */
const MODE_LABEL = { auto: '智能', chat: '对话', work: '工作', off: '暂停' };
/**
 * 单服务的「现在挂 + internal/service 补挂」：服务晚于本插件就绪（行序 ≠ 发布序）
 * 或换实例时自动重挂；下线即摘。fiber 卸载统一清理（disposer 指向已死服务时吞错）。
 */
function watchService(ctx, name, attach, logger) {
    let disposer;
    let bound;
    const up = () => {
        const svc = ctx.get?.(name);
        if (!svc || svc === bound)
            return;
        try {
            const d = attach(svc);
            if (!d)
                return;
            // 换实例摘旧：旧 disposer 可能指向已死服务，吞错不阻断新挂接
            try {
                disposer?.();
            }
            catch {
                // 旧服务所在宿主行已先一步卸载
            }
            disposer = d;
            bound = svc;
        }
        catch (err) {
            logger.warn(`[memory] TUI 接缝 ${name} 挂接失败（忽略）: ${errDetail(err)}`);
        }
    };
    const down = () => {
        try {
            disposer?.();
        }
        catch {
            // 服务所在宿主行已先一步卸载，残留引用调用必抛——吞掉
        }
        disposer = undefined;
        bound = undefined;
    };
    up();
    ctx.on('internal/service', (n, impl) => {
        if (n !== name)
            return;
        if (impl)
            up();
        else if (bound)
            down();
    });
    ctx.effect(() => () => down());
}
export function registerTuiSurface(ctx, deps) {
    const { logger, live, modes } = deps;
    // ── 状态行：当前会话的记忆档位（TUI 单活动 agent；agent/session-start 覆盖
    //    /new、/resume、rewind 全部切换路径） ──
    let lastSid = '';
    let lastText = '';
    let refreshStatus;
    const statusText = () => {
        if (!live.get().enabled)
            return '记忆:停用';
        return `记忆:${MODE_LABEL[modes.get(lastSid)]}`;
    };
    watchService(ctx, 'tuiStatus', (svc) => {
        const status = svc;
        refreshStatus = () => {
            const text = statusText();
            if (text === lastText)
                return;
            lastText = text;
            // 第三参 identity（插件 ctx）只喂 dsh-tui 的效果台账归属（C-060），省略记 undeclared
            status.set('memory', text, ctx);
        };
        refreshStatus();
        logger.info('[memory] TUI 状态行已接入（当前会话记忆档位可见）');
        return () => {
            refreshStatus = undefined;
            lastText = '';
            try {
                // 本插件独占该 key，显式清行与保留 set() 返回的 disposer 语义等价（后者只清
                // 自己那次写——这里没有并发写者，选更直白的一种）
                status.set('memory', undefined);
            }
            catch {
                // 宿主行已卸载
            }
        };
    }, logger);
    ctx.on('agent/session-start', (payload) => {
        const sid = String(payload?.agent?.id ?? '');
        if (!sid || sid === lastSid)
            return;
        lastSid = sid;
        refreshStatus?.();
    });
    // 全局开关在 /settings 里被改动 → 状态行即时跟随（否则「记忆:停用」读数要等下次交互才刷新）
    const unsubscribeLive = live.onChange?.(() => refreshStatus?.());
    if (unsubscribeLive)
        ctx.effect(() => () => unsubscribeLive());
    // ── /memory 命令：切当前会话档位；无参数时 TUI 环境弹托管单选 ──
    const MODE_OPTIONS = [
        { id: 'auto', label: '智能', description: '按会话类型自动选 chat/work 族' },
        { id: 'chat', label: '对话', description: '用户画像与偏好（chat 族）' },
        { id: 'work', label: '工作', description: '团队操作准则（work 族）' },
        { id: 'off', label: '暂停', description: '本会话停用记忆，可随时切回' },
    ];
    const MODE_USAGE = '用法：/memory <auto|chat|work|off>';
    watchService(ctx, 'commands', (svc) => {
        const commands = svc;
        const dispose = commands.register({
            name: 'memory',
            description: '切换本会话记忆档位（auto/chat/work/off，无参数弹出选择）',
            handler: async (inv) => {
                // 宿主侧 Agent 身份契约是 id（见 CommandsLike 注释）；sessionId 仅作兜底
                const agentId = inv.agent ?? {};
                const sid = String(agentId.id ?? agentId.sessionId ?? '');
                if (!sid)
                    return { kind: 'error', text: '无法确定当前会话' };
                const arg = inv.rawInput.trim().toLowerCase();
                let mode = ['auto', 'chat', 'work', 'off'].includes(arg)
                    ? arg
                    : undefined;
                if (!mode) {
                    const dialogs = ctx.get?.('tuiDialogs');
                    if (!dialogs)
                        return { kind: 'error', text: MODE_USAGE };
                    const picked = await dialogs.select(ctx, {
                        title: '记忆档位',
                        options: MODE_OPTIONS,
                        timeoutMs: 60_000,
                        signal: inv.signal,
                    });
                    if (!picked)
                        return { kind: 'success', text: '已取消（档位未变）' };
                    mode = picked;
                }
                const old = modes.get(sid);
                // ADR-0003 切换链（切走落袋/off 挂起/切回恢复）随 onModeChange 回调自动走
                modes.set(sid, mode);
                lastSid = sid;
                refreshStatus?.();
                logger.info(`[memory] /memory 切档 session=${sid} ${old}→${mode}`);
                return { kind: 'success', text: `记忆档位：${MODE_LABEL[old]} → ${MODE_LABEL[mode]}（本会话）` };
            },
        });
        logger.info('[memory] /memory 命令已注册（会话档位切换）');
        return dispose;
    }, logger);
    // ── /settings 设置区块：dsh-memory 命名空间的声明式编辑面（渲染/草稿/保存
    //    全由 TUI 宿主负责；复杂嵌套键如路由链仍走 YAML/web 面板） ──
    watchService(ctx, 'tuiSettingsSections', (svc) => {
        const sections = svc;
        const dispose = sections.register({
            ns: 'dsh-memory',
            title: 'Layered Memory',
            descriptions: { zh: '分层蒸馏记忆' },
            fields: [
                { path: ['enabled'], label: 'Master switch', descriptions: { zh: '总开关（关闭即全停）' }, kind: 'boolean' },
                { path: ['capture'], label: 'Capture', descriptions: { zh: '捕获（L0 对话留档）' }, kind: 'boolean' },
                { path: ['distill'], label: 'Distill', descriptions: { zh: '蒸馏（L1~L3 记忆整理）' }, kind: 'boolean' },
                { path: ['recall'], label: 'Recall injection', descriptions: { zh: '召回注入' }, kind: 'boolean' },
                {
                    path: ['reasoningEffort'],
                    label: 'Distill reasoning effort',
                    descriptions: { zh: '蒸馏思考档位' },
                    kind: 'select',
                    options: EFFORT_CHOICES.map((e) => ({ value: e, label: e === '' ? 'follow config' : e })),
                },
                {
                    path: ['distillProvider'],
                    label: 'Distill provider',
                    descriptions: { zh: '蒸馏模型供应商' },
                    kind: 'text',
                    hint: 'Empty = follow default model',
                    hintDescriptions: { zh: '留空跟随默认模型' },
                },
                {
                    path: ['distillModel'],
                    label: 'Distill model',
                    descriptions: { zh: '蒸馏模型' },
                    kind: 'text',
                    hint: 'Empty = follow default model',
                    hintDescriptions: { zh: '留空跟随默认模型' },
                },
                {
                    path: ['distillMaxInputChars'],
                    label: 'Distill input budget',
                    descriptions: { zh: '蒸馏输入预算（字符）' },
                    kind: 'number',
                    hint: '0 = default',
                    hintDescriptions: { zh: '0 = 默认' },
                },
            ],
        });
        logger.info('[memory] TUI 设置区块已注册（/settings · 分层蒸馏记忆）');
        return dispose;
    }, logger);
}
