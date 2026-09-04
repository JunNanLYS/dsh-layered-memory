/**
 * 客户端 i18n 层：探测宿主 locale 服务（可选依赖，缺失不阻塞），注册
 * `dsh-memory` 命名空间（zh/en 完整字典）；宿主缺失或注册失败时回退 zh 字面量。
 * 所有用户可见文案必须经 t()；UI 重构 spec v2 §11（双语随宿主 locale，不同屏并列）。
 * 带参文案用 tpl()（字典值写 {n}/{s} 占位符，客户端替换——宿主 bind 只做查表）。
 */

const zh: Record<string, string> = {
  'scope.auto': '智能',
  'scope.chat': '日常',
  'scope.work': '工作',
  'flow.follow': '跟随全局',
  'flow.rw': '读写',
  'flow.persona': '仅画像',
  'flow.wo': '只写',
  'flow.paused': '暂停',
  'row.scope': '记忆范围',
  'row.flow': '数据流',
  'chip.base': '记忆',
  'chip.persona': '仅画像',
  'chip.wo': '只写',
  'chip.paused': '暂停',
  'chip.degraded': '降级',
  'chip.title': '本会话记忆（点击设置范围与数据流）',
  'err.load': '读取失败，点击重试',

  // ── 工作台外壳 ──
  'ws.title': '记忆工作台',
  'ws.tab.overview': '总览',
  'ws.tab.library': '记忆库',
  'ws.tab.automation': '自动化',
  'ws.tab.insights': '洞察',
  'ws.tab.maintenance': '维护',
  'ws.refresh': '刷新',
  'ws.retry': '重试',
  'ws.loading': '正在读取…',
  'ws.loadFail': '数据加载失败',
  'ws.copy': '复制',
  'ws.copied': '已复制',
  'ws.copyFail': '复制失败',
  'ws.all': '全部',
  'ago.now': '刚刚',
  'ago.min': '{n} 分钟前',
  'ago.hour': '{n} 小时前',
  'ago.day': '{n} 天前',

  // ── 总览 ──
  'ov.runningOk': '运行正常',
  'ov.runningWarn': '检索降级',
  'ov.runningDown': '存储不可用，记忆功能已停用',
  'ov.subsys.store': '存储',
  'ov.subsys.fts': '全文检索',
  'ov.subsys.vec': '向量检索',
  'ov.subsys.queue': '蒸馏队列',
  'ov.sys.ok': '正常',
  'ov.sys.keyword': '降级 · 仅关键词',
  'ov.sys.vectorOnly': '降级 · 仅向量',
  'ov.sys.none': '未启用',
  'ov.sys.pending': '待处理 {n}',
  'ov.sys.idle': '空闲',
  'ov.attention': '需要关注',
  'ov.attn.pending': '待蒸馏 {n} 条',
  'ov.attn.vector': '向量检索降级',
  'ov.attn.degraded': '存储降级，功能已停用',
  'ov.recent': '最近活动',
  'ov.kg.l1': '记忆资产',
  'ov.kg.scenes': '场景',
  'ov.kg.week': '本周蒸馏输出',
  'ov.kg.weekSub': '{n} 次调用',
  'ov.kg.lastDistill': '上次蒸馏',
  'ov.kg.never': '尚未发生',
  'ov.goto.library': '打开记忆库',
  'ov.goto.automation': '自动化设置',
  'ov.goto.insights': '查看洞察',
  'ov.goto.maintenance': '维护',
  'ov.empty.title': '还没有形成记忆',
  'ov.empty.body': '开始一次对话，插件会先捕获内容，再在后台蒸馏为可召回的记忆。',
  'ov.empty.capture': '捕获',
  'ov.empty.distill': '蒸馏',
  'ov.empty.recall': '召回',
  'ov.empty.capOk': '三项能力当前均可用。',

  // ── 记忆库（只读资产活动流） ──
  'lib.search': '搜索记忆、场景与画像…',
  'lib.filter.type': '类型',
  'lib.filter.scope': '范围',
  'lib.filter.time': '时间',
  'lib.time.today': '今天',
  'lib.time.d7': '7 天',
  'lib.time.d30': '30 天',
  'lib.count': '{n} 条结果',
  'lib.countFiltered': '{n} 条结果 · 已筛选',
  'lib.empty': '没有匹配的记忆资产',
  'lib.emptyHint': '调整筛选条件，或继续对话产生新记忆。',
  'lib.truncated': '搜索已达检索上限（200 条），更早的结果未显示。',
  'lib.more': '加载更多',
  'lib.loadingMore': '加载中…',
  'kind.l1': '记忆',
  'kind.l2': '场景',
  'kind.l3': '画像',
  'type.persona': '画像偏好',
  'type.episodic': '客观事件',
  'type.instruction': '全局指令',
  'type.work_fact': '工作事实',
  'type.work_task': '工作任务',
  'type.work_method': '工作方法',
  'type.work_artifact': '工作资产',
  'verb.new': '新增',
  'verb.upd': '更新',
  'lib.meta.type': '类型',
  'lib.meta.created': '创建',
  'lib.meta.updated': '更新',
  'lib.meta.version': '版本',
  'lib.meta.source': '来源会话',
  'lib.meta.scene': '情境',

  // ── 自动化 ──
  'au.basic': '基础控制',
  'au.sw.master': '记忆总闸',
  'au.sw.masterOn': '已开启：捕获对话并蒸馏记忆',
  'au.sw.masterOff': '已关闭：不捕获、不蒸馏、不注入（数据保留）',
  'au.sw.capture': '捕获',
  'au.sw.captureD': '对话内容写入 L0 原始记录',
  'au.sw.distill': '蒸馏',
  'au.sw.distillD': '后台把 L0 提炼为记忆、场景与画像',
  'au.sw.recall': '召回',
  'au.sw.recallD': '对话时注入相关记忆（全局）',
  'au.emb': '语义检索',
  'au.emb.remote': '远程 · {m}',
  'au.emb.local': '本地 · {m}',
  'au.emb.off': '关闭',
  'au.route': '蒸馏路由',
  'au.route.cur': '{m} · 回退 {n} 条',
  'au.route.follow': '跟随默认模型',
  'au.ceiling': '部署配置已停用：{s}（运行时开关无法开启）',
  'au.advTitle': '高级路由与预算',
  'au.advHint': '部署锁定项显示为只读',
  'au.embTitle': '嵌入模型',
  'au.unsupported': '设置服务不可用，运行时开关未启用（记忆保持全开）。',

  // ── 洞察 ──
  'in.tab.cost': '成本',
  'in.tab.activity': '活动',
  'in.tab.recall': '召回',
  'in.act.chart': '近 7 天资产活动',
  'in.act.byLayer': '蒸馏调用与失败（本次运行累计）',
  'in.act.layer': '层级',
  'in.act.calls': '调用',
  'in.act.fail': '失败',
  'in.act.l1x': 'L1 抽取',
  'in.act.l1d': 'L1 去重',
  'in.act.l2': 'L2 场景',
  'in.act.l3': 'L3 画像',
  'in.rc.turns': '注入轮次',
  'in.rc.sessions': '有检索的会话',
  'in.rc.hits': '注入记忆条数',
  'in.rc.hitTurns': '命中轮次',
  'in.rc.timeouts': '召回超时',
  'in.rc.suppressed': '去重压制',
  'in.rc.disabled': '停用分布',
  'in.rc.globalOn': '全局注入已开启',
  'in.rc.globalOff': '全局注入已关闭',
  'in.rc.modeOff': '档位暂停会话',
  'in.rc.wo': '只写覆盖会话',
  'in.rc.empty': '本次运行尚无召回数据（统计在进程内累计，重启归零）。',

  // ── 维护 ──
  'mt.health': '运行健康',
  'mt.store.down': '不可用（降级）',
  'mt.retrieval.hybrid': '全文 + 向量',
  'mt.unknown': '未知',
  'mt.row.dataDir': '数据目录',
  'mt.row.version': '插件版本',
  'mt.row.l0': '今日捕获',
  'mt.log': '诊断日志',
  'mt.danger': '危险操作',
};

const en: Record<string, string> = {
  'scope.auto': 'Auto',
  'scope.chat': 'Personal',
  'scope.work': 'Work',
  'flow.follow': 'Follow global',
  'flow.rw': 'Read & write',
  'flow.persona': 'Persona only',
  'flow.wo': 'Write only',
  'flow.paused': 'Paused',
  'row.scope': 'Memory scope',
  'row.flow': 'Data flow',
  'chip.base': 'Memory',
  'chip.persona': 'persona-only',
  'chip.wo': 'write-only',
  'chip.paused': 'paused',
  'chip.degraded': 'degraded',
  'chip.title': 'Session memory (click to configure)',
  'err.load': 'Load failed, click to retry',

  // ── Workspace shell ──
  'ws.title': 'Memory Workspace',
  'ws.tab.overview': 'Overview',
  'ws.tab.library': 'Library',
  'ws.tab.automation': 'Automation',
  'ws.tab.insights': 'Insights',
  'ws.tab.maintenance': 'Maintenance',
  'ws.refresh': 'Refresh',
  'ws.retry': 'Retry',
  'ws.loading': 'Loading…',
  'ws.loadFail': 'Failed to load data',
  'ws.copy': 'Copy',
  'ws.copied': 'Copied',
  'ws.copyFail': 'Copy failed',
  'ws.all': 'All',
  'ago.now': 'just now',
  'ago.min': '{n} min ago',
  'ago.hour': '{n} h ago',
  'ago.day': '{n} d ago',

  // ── Overview ──
  'ov.runningOk': 'Running normally',
  'ov.runningWarn': 'Retrieval degraded',
  'ov.runningDown': 'Storage unavailable, memory disabled',
  'ov.subsys.store': 'Storage',
  'ov.subsys.fts': 'Full-text',
  'ov.subsys.vec': 'Vector',
  'ov.subsys.queue': 'Distill queue',
  'ov.sys.ok': 'OK',
  'ov.sys.keyword': 'Degraded · keyword only',
  'ov.sys.vectorOnly': 'Degraded · vector only',
  'ov.sys.none': 'Disabled',
  'ov.sys.pending': '{n} pending',
  'ov.sys.idle': 'Idle',
  'ov.attention': 'Needs attention',
  'ov.attn.pending': '{n} pending distill',
  'ov.attn.vector': 'Vector retrieval degraded',
  'ov.attn.degraded': 'Storage degraded, memory disabled',
  'ov.recent': 'Recent activity',
  'ov.kg.l1': 'Memories',
  'ov.kg.scenes': 'Scenes',
  'ov.kg.week': 'Output this week',
  'ov.kg.weekSub': '{n} calls',
  'ov.kg.lastDistill': 'Last distill',
  'ov.kg.never': 'Not yet',
  'ov.goto.library': 'Open library',
  'ov.goto.automation': 'Automation',
  'ov.goto.insights': 'Insights',
  'ov.goto.maintenance': 'Maintenance',
  'ov.empty.title': 'No memories yet',
  'ov.empty.body': 'Start a conversation. Content is captured first, then distilled in the background into recallable memories.',
  'ov.empty.capture': 'Capture',
  'ov.empty.distill': 'Distill',
  'ov.empty.recall': 'Recall',
  'ov.empty.capOk': 'All three capabilities are enabled.',

  // ── Library (read-only asset feed) ──
  'lib.search': 'Search memories, scenes and personas…',
  'lib.filter.type': 'Type',
  'lib.filter.scope': 'Scope',
  'lib.filter.time': 'Time',
  'lib.time.today': 'Today',
  'lib.time.d7': '7d',
  'lib.time.d30': '30d',
  'lib.count': '{n} results',
  'lib.countFiltered': '{n} results · filtered',
  'lib.empty': 'No matching memory assets',
  'lib.emptyHint': 'Adjust filters, or keep chatting to create new memories.',
  'lib.truncated': 'Search hit the retrieval cap (200); older results are not shown.',
  'lib.more': 'Load more',
  'lib.loadingMore': 'Loading…',
  'kind.l1': 'Memory',
  'kind.l2': 'Scene',
  'kind.l3': 'Persona',
  'type.persona': 'Persona',
  'type.episodic': 'Episodic',
  'type.instruction': 'Instruction',
  'type.work_fact': 'Work fact',
  'type.work_task': 'Work task',
  'type.work_method': 'Work method',
  'type.work_artifact': 'Artifact',
  'verb.new': 'New',
  'verb.upd': 'Updated',
  'lib.meta.type': 'Type',
  'lib.meta.created': 'Created',
  'lib.meta.updated': 'Updated',
  'lib.meta.version': 'Version',
  'lib.meta.source': 'Source session',
  'lib.meta.scene': 'Scene',

  // ── Automation ──
  'au.basic': 'Basic controls',
  'au.sw.master': 'Master switch',
  'au.sw.masterOn': 'On: capture and distill memories',
  'au.sw.masterOff': 'Off: no capture, distillation or recall (data kept)',
  'au.sw.capture': 'Capture',
  'au.sw.captureD': 'Write conversations to L0',
  'au.sw.distill': 'Distill',
  'au.sw.distillD': 'Distill L0 into memories, scenes and personas',
  'au.sw.recall': 'Recall',
  'au.sw.recallD': 'Inject relevant memories (global)',
  'au.emb': 'Semantic retrieval',
  'au.emb.remote': 'Remote · {m}',
  'au.emb.local': 'Local · {m}',
  'au.emb.off': 'Off',
  'au.route': 'Distill route',
  'au.route.cur': '{m} · {n} fallbacks',
  'au.route.follow': 'Follows the default model',
  'au.ceiling': 'Disabled by deployment: {s} (runtime switches cannot enable it)',
  'au.advTitle': 'Advanced routing and budgets',
  'au.advHint': 'Deployment-locked entries render read-only',
  'au.embTitle': 'Embedding models',
  'au.unsupported': 'Settings service unavailable; runtime switches inactive (memory stays on).',

  // ── Insights ──
  'in.tab.cost': 'Cost',
  'in.tab.activity': 'Activity',
  'in.tab.recall': 'Recall',
  'in.act.chart': 'Asset activity, 7 days',
  'in.act.byLayer': 'Distill calls and failures (this run)',
  'in.act.layer': 'Layer',
  'in.act.calls': 'Calls',
  'in.act.fail': 'Failures',
  'in.act.l1x': 'L1 extract',
  'in.act.l1d': 'L1 dedup',
  'in.act.l2': 'L2 scenes',
  'in.act.l3': 'L3 persona',
  'in.rc.turns': 'Injected turns',
  'in.rc.sessions': 'Sessions with retrieval',
  'in.rc.hits': 'Memories injected',
  'in.rc.hitTurns': 'Hit turns',
  'in.rc.timeouts': 'Recall timeouts',
  'in.rc.suppressed': 'Suppressed by dedupe',
  'in.rc.disabled': 'Disabled distribution',
  'in.rc.globalOn': 'Global recall on',
  'in.rc.globalOff': 'Global recall off',
  'in.rc.modeOff': 'Sessions paused',
  'in.rc.wo': 'Write-only sessions',
  'in.rc.empty': 'No recall data this run (counters are in-process, reset on restart).',

  // ── Maintenance ──
  'mt.health': 'Health',
  'mt.store.down': 'Unavailable (degraded)',
  'mt.retrieval.hybrid': 'Full-text + vector',
  'mt.unknown': 'Unknown',
  'mt.row.dataDir': 'Data directory',
  'mt.row.version': 'Plugin version',
  'mt.row.l0': 'Captured today',
  'mt.log': 'Diagnostic log',
  'mt.danger': 'Danger zone',
};

const FALLBACK = zh;

let bound: ((key: string) => unknown) | null = null;
let inited = false;

/** 探测并接入宿主 locale 服务（幂等；失败静默回退 zh）。 */
export function initI18n(ctx: unknown): void {
  if (inited) return;
  inited = true;
  const get = (ctx as { get?: (name: string) => unknown } | null)?.get;
  if (typeof get !== 'function') return;
  let locale: unknown;
  try {
    locale = get.call(ctx, 'locale');
  } catch {
    return;
  }
  const l = locale as { register?: (ns: string, dicts: unknown) => unknown; bind?: (ns: string) => unknown } | null | undefined;
  if (!l || typeof l.register !== 'function' || typeof l.bind !== 'function') return;
  try {
    l.register('dsh-memory', { zh, en });
    const t = l.bind('dsh-memory');
    if (typeof t !== 'function') return;
    // 宿主 t 对缺键返回键名本身——回退 zh 字面量，绝不把键名漏到界面上
    bound = (key: string) => {
      const s = t(key);
      return typeof s === 'string' && s !== key && s !== '' ? s : (FALLBACK[key] ?? key);
    };
  } catch {
    bound = null; // 注册失败（重复注册等）→ zh 字面量
  }
}

/** 取文案：宿主 locale 优先，回退 zh。 */
export function t(key: string): string {
  if (bound) {
    const s = String(bound(key));
    if (s) return s;
  }
  return FALLBACK[key] ?? key;
}

/** 带参文案：字典值写 {n}/{s} 占位符，此处替换（宿主 bind 只做查表）。 */
export function tpl(key: string, params: Record<string, string | number>): string {
  let s = t(key);
  for (const [k, v] of Object.entries(params)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/** 相对时间（工作台活动行）：刚刚 / N 分钟前 / N 小时前 / N 天前；无效返回 null。 */
export function fmtAgoLocal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!time) return null;
  let s = Math.floor((Date.now() - time) / 1000);
  if (s < 0) s = 0;
  if (s < 45) return t('ago.now');
  if (s < 3600) return tpl('ago.min', { n: Math.floor(s / 60) });
  if (s < 86400) return tpl('ago.hour', { n: Math.floor(s / 3600) });
  return tpl('ago.day', { n: Math.floor(s / 86400) });
}

/** L1 记忆类型显示名（工作台记忆库展开行）。 */
export function typeLabel(key: string): string {
  const k = 'type.' + key;
  const s = t(k);
  return s === k ? key : s;
}
