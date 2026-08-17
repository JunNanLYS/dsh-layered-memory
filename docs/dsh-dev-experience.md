# DSH 插件开发经验总结

来源：2026-08 修复 dsh-memory-plugin"装上后 dsh 打不开"事故的完整排查过程。
所有 API 结论均对照本机运行时源码逐一验证（版本随 profile 漚动，重大升级后建议复核）。

## 0. 资料可信度排序（查 API 按这个顺序）

1. **本机运行时类型与源码**：`~/.dsh/profiles/node_modules/@deepseek-ai/<pkg>/lib/types/*.d.ts`
   （实现就在同目录 `.js`，可直接 grep 运行时行为）。最权威——线上文档可能滞后，类型定义不会。
2. **官方插件的产物**：同目录下的 `dsh-client-ui-*`、`dsh-tool-*` 等包。学 API 用法的最佳范例
   （client bundle 怎么写、slot 怎么注册、RPC 怎么挂，照着抄结构最稳）。
3. **skill 手册**：`~\.agents\skills\dsh-plugin-development\SKILL.md`（概念与流程，含官方教程离线副本）。
4. **线上文档**：https://deepseek-harness.github.io/deepseek-harness/develop/basic/ 与 `/reference/`。

## 1. 失败语义（最重要的一课）

- **配置 schema 的导出名必须叫 `Config`**。cordis 运行时只读 `plugin.Config`（Standard Schema
  的 `~standard` 接口）做校验和**默认值填充**；导出 `schema` 会被**静默忽略**。后果链：
  patch.yml 只传 `{family: work}` → 嵌套字段不补默认 → `config.capture.enabled` TypeError →
  apply 抛错 → fiber FAILED → **整个 profile 启动失败、dsh 打不开**。
  这是本 repo 最严重的一次事故，且 tsc 完全查不出来（类型与运行时契约的缝隙）。
- **apply() 抛错 = 响亮失败**，不是跳过。apply 里一切可失败操作（建目录、初始化存储）都要
  try/catch 降级——增强型插件的原则：**宁可自己不工作，不能拖垮宿主**。
- **插件"什么都没打印"多半是 PENDING**：声明的 `inject` 服务没人提供，fiber 合法地永远等待。
  排查看 fiber state；解法要么补提供者，要么改用 `ctx.get('x')` 可选探测。
- **服务是持续追踪的**：inject 的服务消失→依赖者卸载；回来→重新加载。所以一次性
  `ctx.get()` 探测有窗口期问题，可选服务要配合 `internal/service` 事件做延迟注册。

## 2. 已验证的 Host 侧 API 要点

### ctx.llm（流式，没有 generate()）
- `ctx.llm.stream(GenerateOptions): AsyncIterable<StreamChunk>`；`GenerateOptions` 必须带
  `provider` + `model`（没有"默认模型"参数）。
- "当前默认模型"来自可选服务 `ctx.get('agentDefaultModel')?.currentSelection()`
  → `{ provider, model, reasoningEffort? }`（dsh-agent-default-model 提供）。
- **收集文本只取 `block-end`**：协议保证它携带组装完成的整块；`text-delta` 只是增量。
  两者都累计会把输出**翻倍**（修过的真实 bug）。稳妥写法：blockText 优先、deltaText 兜底。
- `finish` chunk 的 `reason.kind === 'error' | 'aborted'` 是失败信号，要抛给调用方。
- 组消息用 `createUserMessage({ content: [{type:'text', text}], source: {kind:'user'} })`。

### ctx.tools（defineTool）
- `ctx.tools.register(defineTool({...}))`；`output: { schema, render(args, value) }` 是**强制**的，
  `execute` 返回受 schema 校验的 canonical value（校验失败 = 工具失败）。
- 参数 DSL：`{ key: { type: 'string', required?: true, description? } }`；**显式 object 节点必须写
  `additionalProperties`**（布尔，_schema DSL 的强制项）。
- 注册是 effect，插件卸载自动注销。

### ctx.systemPrompt
- `ctx.systemPrompt.context({ name, order, text })` 的 `text` 是**同步**函数——异步内容（读文件）
  必须走内存缓存 + 定时刷新/主动失效，不能在 text 里 await。

### 事件（名字和 payload 形状都是验证过的）
| 事件 | 模式 | payload |
|---|---|---|
| `session/event` | emit | `(session, event)`；event = `{seq, time, type, data}`；`user/message` 的 data **就是** UserMessage；`assistant/message` 的 data 是 `{turn, step, message, usage?}` |
| `agent/pre-step` | waterfall | `(payload{agent, messages, turn, step, signal}, next)`；只观察**必须** `return next()`，不调 next 会短路整个循环 |
| `agent/created` / `agent/disposed` | emit | `payload.agent` |
| `internal/service` | emit | `(name, value)`——服务上/下线通知，可选服务延迟注册用它 |

- Agent 对象：`agent.id`、`agent.ctx`（agent 作用域上下文，注册的东西随 agent 销毁回收）、
  `agent.inject(UserMessage)`（给下一步注入模型可见上下文的正规通道）。
- **枚举已存在的 agent**：`ctx.get('agents')?.list()`——插件加载晚于默认 agent 创建时，
  只听 `agent/created` 会漏掉它（记忆注入失效的真实原因）。补注册用 WeakSet 防重。

### Host↔Client RPC
- Host：`ctx.connection.rpc.handle('/rpc', handler, { authority: 'loopback' })`，handler 签名
  `(endpoint, payload, signal) => Promise<RpcResult<unknown>>`，返回值必须是
  `{ok:true, value} | {ok:false, error:{code, message, details}}`。
  注意返回的是**同步函数**（`() => Promise<void>` 的异步 disposer），不能 `.then` 链。
- Client：`ctx.connection.rpc.call('/rpc', endpoint, payload)` → `Promise<RpcResult>`。
- connection 是可选服务且可能晚于插件就绪：先探测一次 + 监听 `internal/service` 补注册。
- **`authority: 'loopback'` 的安全边界在宿主传输层，插件侧无需再加调用方校验**
  （2026-08-17 对照 `dsh-client-connection/lib/index.js` 的 `isTrustedApiRequest` 验证）：
  每个 loopback 通道的请求进 handler 前先过三重栅栏——① Host 头必须是 loopback
  （localhost / [::1] / 127/8，拦 DNS rebinding）；② `Sec-Fetch-Site: cross-site` 直接拒；
  ③ 带 Origin 头（浏览器跨站请求必带）时必须与 Host 同源。恶意网页从 `https://evil.com`
  调本机 `http://127.0.0.1:3080` 的 RPC 会拿到 403。本机无 Origin 头的非浏览器进程
  可以调用——这是 loopback 的固有信任边界（同机进程本就能直接读数据文件）。

### 类型系统陷阱：Context 声明合并要靠 import 拉进编译
`ctx.get('connection')` 想拿到类型，必须在文件里 `import type {} from '@deepseek-ai/dsh-client-connection'`
（纯类型导入，编译后消失，无运行时依赖）。否则静默 any——tsc 不报错但失去所有保护。
`agentDefaultModel`、`agents` 等服务同理。

### 路径
默认数据目录用 `dshHomePath('memory')`（`@deepseek-ai/dsh-home-paths`），别自己拼
`HOME/USERPROFILE`——Windows 下行为不一致。

## 3. Client 半边（web）

- **handoff 协议**：`window.__ModuleLoader__.load({ id, factory })`；`factory(require)` 返回
  `{ apply, inject }`；工厂体内是全部副作用（执行 script 只注册工厂）。
- `require("react")`、`require("react/jsx-runtime")`、官方各 client 包名都可直接 require。
- **不引入打包器手写纯 JS bundle 完全可行**（本 repo 的 client.js 就是），保持 ES5 风格。
- 注册设置页：`ctx.slots.inject("settings.section", () => ctx.slots.register({ name, id, order, label, inject: () => props }, Component))`
  ——list 型 slot 的 `id` 必填；`inject` 函数给组件喂 props。
- package.json 的 `dsh.client.inject`（声明依赖的 client 模块）+ `platform: 'web'` 字段照抄
  官方包（如 `dsh-client-ui-settings`）的形状即可。

## 4. 调试阶梯（tsc 通过 ≠ 能跑）

按成本递增依次上：

1. **类型核对**：对照本机 `.d.ts`（不是记忆里的 API）。tsc 过了只说明形状对，
   不说明导出名/时序/协议语义对。
2. **Config 单测**：`Config['~standard'].validate(最小config)` 直接在 node 里跑，
   模拟 cordis 的真实加载路径，确认默认值填充。
3. **组合检查**：`dsh --profile web --dump-config` 看插件条目是否在最终组合树里。
4. **短启动实测**：后台拉起 `dsh --profile web`，看副作用证据（本例：`~/.dsh/memory/{conversations,records,scenes}`
   被创建 = apply 成功）。**插件日志不走 stdout**（stdout 只有 `dsh web: http://...`），
   走 dsh 内部 sink，别等 console。
5. **fiber 状态**："没报错但也没生效"时按 skill 手册查 PENDING（inject 未满足）。

## 5. 工程化经验

- **本地路径安装生成 link:**（`dsh plugin --profile web add <本地路径>` 转发 pnpm）——
  指向源仓库，`npm run build` + 重启 dsh 即生效，**无需重装**（开发期的正确姿势）。
- 前置依赖：**pnpm 必须全局安装**（`npm i -g pnpm`）；Git Bash 里 `dsh` 不在 PATH 时直接
  `node ~/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js`。
- 工作区 `package.json` 用 `file:` 依赖指向 profile 的 node_modules：npm 会装成**符号链接**，
  因此插件与宿主解析到**同一个物理模块**（cordis 单例成立，已验证
  `import 两个路径 === 同一实例`）。若被物化拷贝则会双实例、服务注册表分裂——升级 npm/换包管理器后要复验这条。
- 手工编译产物（如 dist-smoke）不被主构建覆盖，跑旧测试会得出错误结论——构建脚本要么纳管它，
  要么在文档里显著标注。
- 组合条目务必写显式 `id`：loader 按 id 差分做增量挂载/卸载，没有 id 每次读配置都当"删除+新增"。

## 6. 诊断实战：管线"没产出"的排查路径（0.2.3 沉淀）

一次"蒸馏没跑"的真机排查，流程可复用：

1. **先找地面真相，不猜**：`state.json` 的字段是管线是否执行过的直接证据
   （`lastExtractAt=0` + `hasPersona=true` → 管线跑过、L3 成功、L1 无产出）。
   落盘产物（records/、persona.md、DB 行数）是第二层证据。
2. **没有日志就先造日志**：dsh 宿主不持久化插件日志（stdout 也没有），第一动作是加
   文件日志（`withFileLog` 镜像 info+ → `memory.log`），再复现。无观测的诊断是盲猜。
3. **状态字段要能区分"成功零产出"与"失败"**：0.2.3 之前 L1 抽取成功但 0 条记忆时
   `lastExtractAt` 保持 0，与抛错无法区分——修成成功也推进时间戳后，下次日志+状态
   立刻定位是哪类。负路径（捕获跳过、门控拦截）也要留一行 info。
4. **"不工作"可能是在正确地工作**：最终根因是 `family: work` 的抽取 prompt 明确
   排除个人内容，模型执行得完全正确。排查 LLM 行为异常时先读 prompt 全文和配置语义，
   不要默认是代码 bug。
5. **进程外复现 API 调用会踩环境差异**：shell 里的 API key 与运行中 dsh 的不同
   （401），复现失败≠服务故障。以宿主进程环境为准。

## 7. 热重载泄漏：别人的 ctx 上注册必须自己收 disposer（0.2.3 沉淀）

- `agent.ctx.systemPrompt.context(...)` 返回 disposer，但 **agent.ctx 比插件实例活得久**：
  不把 disposer 挂到插件自身 `ctx.effect`，热重载后旧注册残留、新实例撞名
  （`"memory:recall" is already registered in this scope`），且旧闭包读的是死缓存。
- 通用规则：**在非自身 ctx（agent.ctx / 其它插件提供的对象）上的任何注册，disposer
  都要收集进插件生命周期清理**；自身 ctx 上的注册（ctx.on/effect 化的 API）才可依赖自动回收。

## 8. settings 服务：运行时开关的正解（0.3.0 沉淀）

- `ctx.settings.register(settingsNamespace('xxx'), schema, { applies: 'live' })` 返回
  `SettingsScope`：`get()/watch(cb)/update(patch)/replace(section)`；用户层持久化，
  `watch` 回调在 commit 后异步串行触发。
- **服务可能晚于插件就绪**（provider 先读盘再发布）：`ctx.get('settings')` 探测 +
  监听 `internal/service`（name === 'settings'）补挂——与 connection 同款模式；
  缺失时降级为"恒开"并让 UI 隐藏开关。
- 手写 client bundle 不用碰官方 `api.settings.mutate`（remote API 网关那套）：
  自有 loopback RPC 端点调 `scope.update()` 更简单可控。
- 开关语义：**静态 config（部署上限）AND 运行时开关**，门控写在消费点（事件入口/
  管线步骤/注入函数），不要在启动时一次性读死。

## 9. RPC 端点的无宿主测试模式（0.3.0 沉淀）

fake connection 捕获 handler 即可端到端测全部端点，不需要起 dsh：

```ts
let handler;
const fakeCtx = {
  get: (n) => n === 'connection' ? { rpc: { handle: (_ch, h) => { handler = h; return async () => {}; } } } : undefined,
  on: () => () => {},
  effect: (f) => f(),
} as never;
registerMyRpc(fakeCtx, ...);
const value = (await handler('my-plugin/endpoint', payload)).value;
```

注意两点：handler 返回的是 `{ok, value}` 包装（要解一层）；fake config 必须带全
schema 默认值形状（真实运行时由 Schemastery 补齐，fake 不会）。

## 10. grill 需求澄清流程（0.3.0 UI 实战）

- 顺序有效：**事实自己查（本机 .d.ts / 官方 bundle 槽位名 / 数据现状）→ 只把决策抛给
  用户，一次一题带推荐项**。"入口放哪/搜索做多少/范围包不包 L0/开关粒度"四个决策问完，
  设计就定了，无需返工。
- 用户不答的题按推荐项继续并显式声明"可推翻"，不阻塞。
- 本环境（无显示面板）浏览器 webview 附加不上，UI 视觉验证降级为"RPC 分发层 e2e +
  语法检查"，让用户肉眼验收——验收手段要提前想好降级路径。
