<div align="center">

<img src="./assets/img/Hero.png" width="100%"
     alt="DeepSeek Harness hero banner: conversations distilled into layered memories and recalled before every model step — chat bubbles dissolve into three progressively brighter light layers flowing into a frosted-glass capsule with a glowing orb and gradient track (tick labels: 日常·工作·智能·关闭), with light threads looping back to suggest recall">

# dsh-layered-memory

**A layered distillation memory plugin for DeepSeek Harness: conversations are processed in the background through L0 capture → L1 atomic memories → L2 scene consolidation → L3 persona distillation, and relevant memories are automatically injected into context before every model step — neither the user nor the model needs to do anything.**

[简体中文](README.md) · [Latest release](https://github.com/JunNanLYS/dsh-layered-memory/releases/latest) · [Report issues](https://github.com/JunNanLYS/dsh-layered-memory/issues)

[![npm version](https://img.shields.io/npm/v/dsh-layered-memory?color=6f83ff&style=flat-square&label=npm)](https://www.npmjs.com/package/dsh-layered-memory)
[![DSH 0.1.1-rc.2](https://img.shields.io/badge/DSH-0.1.1--rc.2-8b5cf6?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![MIT License](https://img.shields.io/badge/license-MIT-536990?style=flat-square)](LICENSE)

</div>

## Getting Started

Requires Node ≥ 22.16. Two invocation styles — the `npx` prefix can replace `dsh` in
any command below:

```bash
# Option 1: run the official CLI directly via npx (no pre-installed dsh; version can be pinned, e.g. dsh-layered-memory@0.8.4)
npx -y @deepseek-ai/dsh plugin --profile web add dsh-layered-memory

# Option 2: with the dsh CLI installed (dsh is a pnpm forwarder; npm i -g pnpm first if missing)
dsh plugin --profile web add dsh-layered-memory

# Alternative sources: GitHub repo / local path (dev & debugging, link: points at the repo; npm run build + restart dsh to apply)
dsh plugin --profile web add https://github.com/JunNanLYS/dsh-layered-memory
dsh plugin --profile web add /path/to/dsh-layered-memory
```

### Install via an AI Agent (Recommended)

If your current agent can run terminal commands, send it this message as-is:

```text
Please install the dsh-layered-memory plugin for the web profile of DeepSeek Harness.

Run only the two commands below and do not modify any other profile:
dsh plugin --profile web add dsh-layered-memory
dsh --profile web --dump-config

Confirm that dsh-layered-memory appears in the output, then report the result to me.
Do not close or restart my running DSH yourself; after installation, remind me to manually restart the DSH Web Host.
```

The agent should report the installation result and explicitly tell you whether
`dsh-layered-memory` has appeared in the configuration.

This package declares a `dsh.bundle` composition layer (`cordis.patch.yml`); after
installation the **plugin entry is mounted automatically** — no need to hand-edit
`$DSH_HOME/profiles/web/cordis.patch.yml`. Then restart DeepSeek Harness and verify:
the appearance of `conversations/ records/ scenes/` and `memory.db` under
`~/.dsh/memory/` means the plugin applied successfully; the "Memory" page in settings
and the mode pill in the input bar mean the client half is ready.

> ⚠️ **Security note**: installing a plugin = running third-party code with your
> privileges. This plugin reads session content, writes files in its data directory,
> and calls the LLM/embedding services you configured; if that concerns you, review
> the source first (`src/`).

**Uninstall**: `dsh plugin --profile web remove dsh-layered-memory` + restart. Data
stays in `~/.dsh/memory/`; delete the whole directory manually if you don't need it.

### Development from Source

```bash
git clone https://github.com/JunNanLYS/dsh-layered-memory
cd dsh-layered-memory
npm install && npm run build
dsh plugin --profile web add .        # link: install; after code changes, npm run build + restart dsh
npm run smoke                         # smoke test (rebuild first: see command below)
npx tsc src/smoke.ts --outDir dist-smoke --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck --esModuleInterop
```

## Runtime Data Flow

<p align="center">
  <img src="./assets/readme/flow.svg" width="100%"
       alt="Runtime data flow: session events from User and Assistant (left) flow into the plugin (L0 capture, L1–L3 distillation, retrieval, memory tools), which injects relevant memories into the DeepSeek Harness core (right) at agent/pre-step; distillation reuses the core's ctx.llm and data is dual-written to ~/.dsh/memory/">
</p>

The plugin attaches to DSH-native event seams (`session/event` for capture,
`agent/pre-step` for injection) and reuses the host's `ctx.llm` for distillation. Recall
is presented as **message-side injection**: relevant memories enter the conversation as a
synthetic message placed right before the user's new message, rendered as a
**"Context injection · memory"** row in the chat flow (expand to see the hits) — so you
can see "memory at work" directly. Injected content is bounded by length and
time budgets — oversized lines are truncated (pointing the model at the memory tools for
the full text) and a timed-out recall silently skips that turn, never slowing the chat. It
also registers three model-callable memory tools: `memory_search` /
`conversation_search` / `memory_read_scene`.

In action: the "Context injection · memory" row surfaces relevant memories first, and
the model then calls `memory_read_scene` directly to read scene blocks before answering
from memory:

<p align="center">
  <img src="./assets/img/MemoryTools.png" width="60%"
       alt="Real conversation UI (light theme): a "Context injection · memory" row sits above the user's message asking about recent plans; the assistant lists 4 memory_read_scene tool calls (with scene-block .md filenames as arguments) before answering from memory">
</p>

In restricted sessions where only the code-execution entry point is available, the model
reaches the memory tools indirectly through `run_code` (nested as SUBTOOL calls in the
trajectory view):

<p align="center">
  <img src="./assets/img/ToolTrajectory.png" width="80%"
       alt="Tool-call trajectory view: a colored timeline on top and a step list on the left (SYSTEM/CONTEXT/USER/ASSISTANT/TOOL/SUBTOOL tags); a run_code tool step nests 5 memory_read_scene sub-tool calls (SUBTOOL tags), with a detail panel for the selected step on the right">
</p>

## Layered Memory (L0–L3)

<p align="center">
  <img src="./assets/img/Layers.png" width="100%"
       alt="Four memory layers refining from top-left to bottom-right: L0 raw conversation (chat bubbles) → L1 atomic memories (glowing fact particles) → L2 scene blocks (glass document slabs) → L3 core persona (radiant crystal core); stages connected by LLM extract/consolidate/distill light beams, shrinking width shows progressive refinement">
</p>

## Per-Session Memory Modes

<p align="center">
  <img src="./assets/img/Modes.png" width="100%"
       alt="Per-session memory modes: a glass capsule track with four stops (日常 · 工作 · 智能 · 关闭), the glowing orb resting on 智能 (default); a vignette above each — personal chat bubbles for 日常, code/document panes for 工作, two streams merging brightest for 智能, a dim dashed ghost bubble for 关闭">
</p>

- **Control**: the pill next to the mode selector in the input bar (`Memory · Auto`);
  clicking opens a macOS-style sliding picker above — release to snap to the nearest
  mode; adapts to light/dark themes;
- The lower half of the popover is a **per-session info area**: recall hits
  (hit/searched turns plus cumulative items), batching progress (this session's
  slice x/effective threshold; the off mode shows parked slices instead), memories
  produced for this session, and session message count — plus status lines for
  anomalies (storage degraded / vector search unavailable) and a global summary
  (pending distill count, last distill time). Data comes from the
  `dsh-memory/session-stats` endpoint (in-memory registries + an indexed COUNT,
  zero file I/O), adaptively polled while open (2s busy / 5s idle) and stopped on
  close;
- Each session's choice is persisted by sessionId to `session-modes.json`, surviving
  restarts/session restore; stacks with the global switches (global is the master gate);
  L2/L3 are fully family-isolated — content never leaks across families.

## UI Preview

<p align="center">
  <img src="./assets/img/ui-dark.jpg" width="49.5%"
       alt="Settings memory browser overview in dark theme: status card (plugin version, capture/distill/recall switch states, FTS and vector capabilities, L1 memory count, distillation model) and stat tiles, glassy controls with a cold-blue accent">
  <img src="./assets/img/ui-light.jpg" width="49.5%"
       alt="The same settings memory browser overview in light theme: identical layout and information on light card backgrounds with the same accent family, theme switch without reload">
</p>

## Measured Comparison (DSH-MemBench: Automated Benchmark)

Screenshots show what the plugin looks like — this section answers "**what does enabling it actually buy you?**" with measured numbers from an **automated benchmark** ([`bench/`](./bench/), one command to reproduce). Method: the same scenario bank with verbatim-identical inputs runs in **Group A (memory on)** with 3 merged repetitions and **Group B (memory off)** with 1 repetition (a memory-off long task burns multiples of the tokens per scenario — a cost guardrail); the dialog track now runs Group A only (memory-off probes in independent sessions cannot succeed, so the control carries no information — retired). Dialog-track environment: DeepSeek official `deepseek-v4-flash`, plugin 0.8.5 (judge same-source as tested; every answer archived for manual audit), Windows; taxonomy adapted from [LongMemEval](https://github.com/xiaowu0162/longmemeval) / [LoCoMo](https://snap-research.github.io/locomo/) / [AMB](https://github.com/vectorize-io/agent-memory-benchmark), with the extended probe types and lifecycle track informed by [MemoryAgentBench](https://arxiv.org/abs/2507.05257) / [GoodAI LTM](https://github.com/GoodAI/goodai-ltm-benchmark) / BEAM.

> The dialog track below is the **fresh 0.8.5 baseline** (fixed plugin + corrected judging criteria); the workflow-track numbers remain the archived 0.8.3 run (the bank has since grown to 8 scenarios with a prospective-memory addition — re-run pending).

### Dialog track (20 scenarios × 10 probe types × 3 reps = 420 questions): does it remember correctly

> 0.8.5 baseline (Group A data; the dialog-track B arm is retired — Group A only).

<p align="center">
  <img src="./assets/readme/bench-dialog.svg" width="100%"
       alt="DSH-MemBench dialog track accuracy chart (Group A, memory on): overall accuracy 95.2% (400/420); six core probe types, 60 questions each — extraction 58/60, multi-hop 60/60, temporal 56/60, updates 55/60, scene recall 52/60, abstention 60/60 with 0 fabricated; four extended probe types, 15 each — accretive completion 15/15, update chains 15/15, event ordering 14/15, paraphrase 15/15">
</p>

**Dual-channel recall** (Group A): passive injection hit rate **78.1%** (the answer's key points appear in the recall injection, 281/360); most of the rest the model recovered by **actively calling the memory tools** — 106 questions with active queries, **75 rescued by tools**. The end-to-end 95.2% is the composite of both channels plus model utilization. With the memory store accumulating across scenarios for the whole run, 295 probe injections carried other scenarios' memories (honestly counted) — yet accuracy actually *rose* from 92.8% (early, small store) to 97.7% (late, largest store), and offline flooding with 600 extra synthetic records moved retrieval recall@5 by only −2.8pp: interference resistance under a growing store, measured.

**Layered weaknesses**: offline retrieval metrics (recall@5, controlled replay) total 73.3%, with event ordering at 0% and scene recall at 50% — end-to-end still 93%+ thanks to model robustness over adjacent injected memories. **Efficiency triangle** (the cost of memory): injections add no latency (injected turns respond 210ms *faster* on average), recall text is ~10.3% of per-turn input, and the whole distillation pipeline costs ≈2727 input / 240 output tokens per captured message (1172 calls, 0 failures).

### Workflow track (archived 0.8.3 · 7-scenario edition · Group A ×3 / Group B ×1, real tool sandbox): does it do it right, and cheaper

<p align="center">
  <img src="./assets/readme/bench-workflow.svg" width="100%"
       alt="DSH-MemBench workflow track, Group A vs Group B: probe-phase completion A 59/69 (85.5%) vs B 10/23 (43.5%); cost comparison (Group B as the full-bar baseline, per-scenario means) — steps 24.3 vs 41.4 (B +70%), tool calls 37.7 vs 62.1 (B +65%), input tokens 266k vs 1.81M (B 6.8×); style-convention scenario probes A 12/12 vs B 0/4; long-task input tokens per scenario A 266k vs B 1.81M">
</p>

**Probe-phase completion 85.5% vs 43.5% (+42pp)**: both groups have live context during teach/change phases — the probe phase (continuation task in a fresh session) is the pure memory window. Group A scored a perfect 12/12 on all three new probe archetypes (workflow knowledge update / twin-runbook disambiguation / style-convention continuity), consistent across all three reps; Group B scored **0/4** on style-convention probes (naming/structure/thousands-separator/footer conventions exist only in memory — they cannot be explored out of the sandbox), while on the workflow-update scenario it can reverse-engineer the procedure by reading the script (discrimination limited by sandbox affordances, honestly noted).

**Long-task cost: Group B burns 6.8× Group A's input tokens per scenario** (1.81M vs 266k) — without memory the agent advances by re-exploring, and under a high reasoning effort it even builds its own projects to probe what a one-line script convention would have done; output tokens 3× (46.2k vs 15.4k), steps +70%. This is memory's core value: **what it saves is not task difficulty, but pointless round-trips and re-exploration**.

### Methodology & reproduction

```bash
node bench/harness/run.mjs --arm A --repeats 3 --provider deepseek-official --model deepseek-v4-flash   # dialog track (Group A only)
node bench/harness/run.mjs --track workflow --arm AB --repeats 3 ...                                  # workflow track (A/B arms in parallel)
node bench/harness/run.mjs --track lifecycle --arm A ...                                              # lifecycle track (gating/off/rebuild/forget)
node bench/harness/report.mjs --latest [dialog|workflow]                                               # aggregate report
node bench/harness/retrieval-metrics.mjs <runDir> --flood 200,600                                     # retrieval metrics + flooding curve
```

- Scoring: programmatic `contains-all` plus an LLM judge against key points (every answer and verdict is preserved in `result.json` for human audit); for stale-bearing probes (updates/update-chains/forget) an old value only fails when stated *as the current answer*, and abstention probes allow citing real adjacent facts while denying the asked point; workflow completion is verified programmatically from produced files and their contents (four check kinds: positive / forbidden-word / must-not-exist / exists);
- Metric surface: beyond the per-type accuracy table (6 core + 4 extended types), reports automatically include **offline retrieval metrics** (recall@5 / injection precision / stale leakage), the **efficiency triangle** (injection latency differential / injection share / distillation accounting per captured message), **scale-position analysis** (accuracy & contamination vs store growth), and the lifecycle-track section (family-gating matrix / off-mode dual assertions / rebuild fidelity / forget requests);
- Live progress: running the benchmark auto-starts a local progress panel and opens the browser (`--no-panel` to disable) — per-arm scenario/phase/message-level progress, heartbeat & activity freshness (distinguishes "stuck" from "process died"), and cumulative cost as it accrues;
- Metrics come from provider-reported usage (input with cache-hit split) and session-event folding; the steady-state cache rate excludes each session's first request (0.8.5 baseline: 89.1% — memory injection does not hurt caching);
- Regression use: run before/after a plugin change and diff with `compare.mjs` (environment header check including git SHA + Group-B control-drift warning + retrieval-metric comparison);
- Limitations (stated honestly): single machine; Group A ×3 merged, Group B ×1 (cost guardrail — noisier); judge vs tested model: same model in the 0.8.5 dialog baseline, heterogeneous in the archived workflow run (glm-5.3 judging v4-flash); the scenario bank is author-built (biased toward memory-advantage scenarios — reproduce it yourself); sandbox-file affordances partially leak procedures (Group B can reverse-engineer by reading scripts — discrimination limits honestly noted); dual-tier tool audit (strict violation voids the scenario / loose heuristic flags only), with 0 violations measured on both sides.

Full reports and per-question data: [`bench/baseline/`](./bench/baseline/).

## Configuration

Override configs go into the profile's own `cordis.patch.yml` as a **top-level bare
patch entry** (direct `id:`, not wrapped in `insert:` — an insert with the same id as
the bundle layer appends and causes `duplicate loader entry id` startup failure):

```yaml
- id: dsh-memory
  name: dsh-layered-memory
  config:                    # keys replace whole lines (no deep merge); write out all keys you want to keep
    family: auto             # default mode for new sessions: auto | chat | work
    llm:                     # static distillation route (both fields set = deployment pin,
      provider: ''           # which outranks the settings-page selection; when empty the route
      model: ''              # follows the settings-page "distillation model" picker or the default model)
```

| Field | Default | Description |
| --- | --- | --- |
| `family` | `auto` | Default memory mode for new sessions: `auto` (both families) \| `chat` (personal) \| `work` (work); switchable per session via the input-bar control |
| `dataDir` | `$DSH_HOME/memory` | Data directory |
| `capture.enabled` | `true` | L0 capture |
| `capture.stripCodeBlocks` | `true` | Strip code blocks from assistant messages |
| `capture.maxMessageChars` | `4000` | Max characters per message |
| `extract.enabled` | `true` | L1 extraction |
| `extract.minMessages` | `6` | Steady-state trigger threshold: run L1 extraction once a session accumulates N new messages. The effective threshold ramps up 1→2→4→…→N (first turn yields memories immediately, then batches to save calls) |
| `extract.idleSeconds` | `300` | Idle flush: distill a session's pending slice after N seconds of silence (catches "user left before reaching the threshold"); `0` disables |
| `extract.backgroundMessages` | `10` | Background messages attached to extraction (fetched per session from L0 — no cross-session contamination) |
| `extract.candidatePool` | `5` | Dedup candidate pool size |
| `l2.enabled` | `true` | L2 scene consolidation |
| `l2.minNewMemories` | `5` | New-memory threshold since last L2 consolidation |
| `l2.maxScenes` | `12` | Scene block count cap |
| `l2.sceneContextLimit` | `3` | Max similar-scene full texts attached to the L2 prompt |
| `l3.enabled` | `true` | L3 persona distillation |
| `l3.interval` | `20` | L3 distillation interval (new-memory count) |
| `recall.enabled` | `true` | Auto recall |
| `recall.maxResults` | `5` | Max L1 records injected before each new user message |
| `recall.maxCharsPerMemory` | `500` | Per-memory character cap for injected recall (overlong lines truncated with a hint to use the memory tools for the full text); `0` disables |
| `recall.maxTotalRecallChars` | `2000` | Total character cap per injected recall batch (lowest-ranked tail dropped first); `0` disables |
| `recall.timeoutMs` | `5000` | Overall recall budget (ms): a timed-out recall skips that turn without blocking the chat; `0` disables |
| `recall.includePersona` | `true` | Inject persona context into the system prompt (`<user-persona>`, stable zone) |
| `recall.includeSceneNav` | `true` | Inject scene navigation into the system prompt (`<scene-navigation>`, stable zone) |
| `recall.strategy` | `hybrid` | Retrieval strategy: `keyword` / `embedding` / `hybrid` |
| `recall.scoreThreshold` | `0.3` | Recall score threshold (below is not injected; applies to keyword/embedding only, not pre-fusion hybrid; tool path unfiltered) |
| `embedding.enabled` | `false` | Vector retrieval switch; off = pure FTS |
| `embedding.baseUrl` | empty | OpenAI-compatible /embeddings endpoint (e.g. `https://api.siliconflow.cn/v1`) |
| `embedding.apiKey` | empty | API key |
| `embedding.model` | empty | embedding model name |
| `embedding.dimensions` | `0` | Vector dimensions (required when enabled; must match model output) |
| `embedding.maxInputChars` | `5000` | Max characters per text (overlong inputs truncated) |
| `embedding.timeoutMs` | `10000` | Per-call embedding timeout (ms) |
| `embedding.allowLocalModels` | `true` | Allow the local embedding tier (deployment ceiling; when off, no model downloads and no local tier in settings) |
| `embedding.mirror` | `https://hf-mirror.com` | Download mirror root for local models (can be changed back to `https://huggingface.co`) |
| `embedding.proxy` | `''` | Three-state download proxy: `''` (default) = auto-detect proxy env vars (`HTTPS_PROXY`/`ALL_PROXY` etc., honoring `NO_PROXY`); `none` = disable, always direct; any other value = proxy URL (e.g. `http://127.0.0.1:7890`). Direct connections to the mirror are intermittently unreachable on some networks (connect timeouts and poisoned bytes have both been observed) — keep the default auto-detection on machines with a proxy |
| `llm.provider/model` | empty | Static distillation route (deployment pin): when **both** fields are set the route is locked, outranking the settings-page selection and the default model (deployments can force distillation onto a specific route); when empty the route follows "settings-page selection → default model". At runtime, switch among **configured providers** (including custom ones added in dsh Settings → Models) via the "distillation model" picker in Settings → Memory → Overview — effective immediately, no restart needed |
| `llm.maxTokens` | `65536` | Fallback output cap for non-layered calls. Each distillation stage has its own budget (extraction 16k / dedup 8k / L2 32k / L3 16k; auto ×4 when the reasoning effort is high/xhigh/max, so thinking can't starve the text budget); the per-layer budgets are runtime-adjustable in Settings → Memory → Overview → distillation parameters (empty/0 = built-in defaults) |
| `llm.reasoningEffort` | empty | Distillation reasoning effort: empty = **auto** (resolved from model capability: the model's default tier, else `high`); an explicit value (`off`/`none`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`) is only sent when the model declares support — effort vocabularies differ across providers (deepseek accepts `off`, OpenAI-style APIs use `none`, models that declare no tiers get nothing), and unsupported tiers degrade to not-sending with a one-time warning; output budgets auto-×4 at high/xhigh/max. Switchable at runtime in Settings → Memory → Overview; the selectable tiers follow the current model live |
| `llm.temperature` | `0.3` | Distillation temperature |
| `llm.maxInputChars` | `700000` | Input character budget per distillation call (over-budget L1 inputs are chunked automatically); runtime-adjustable in Settings → distillation parameters → input budget (empty/0 = follow this value) |
| `llm.timeoutMs` | `120000` | Per-call distillation timeout (ms) |
| `tools` | `true` | Whether to register model-callable memory tools |
| `benchControl` | `false` | Register the in-process bench control service (rebuild trigger / session-mode setting / distillation usage snapshot — used by the benchmark's lifecycle track). Off by default — zero surface in production deployments; do not enable casually |

## Storage Layout

<p align="center">
  <img src="./assets/readme/storage.svg" width="100%"
       alt="Storage layout: dual-write architecture (append-only JSONL source of truth + memory.db retrieval engine); file forms include conversations/records/scenes/persona/state/pending/session-modes/embedding-source/model catalog/inference runtime/log and rebuild archives; three retrieval strategies keyword/embedding/hybrid (RRF k=60); a degradation chain never blocks the host">
</p>

Vectors are off by default (pure FTS). DSH's `ctx.llm` has no embeddings endpoint;
semantic retrieval is provided by a **three-state embedding source** (off / remote /
local), switchable at runtime in the settings page — see the next section.

## Semantic Retrieval (Embedding Source)

Pick the embedding source in Settings → Memory → Overview → Semantic Retrieval;
it takes effect immediately, no config edit or restart:

<p align="center">
  <img src="./assets/img/EmbeddingSource.png" width="70%"
       alt="Semantic retrieval (embedding source) panel in the settings page (light theme): a three-state selector (Off/Local/Remote, Local selected) showing the current source and the first-run runtime install hint; below it the local model catalog lists BGE small Chinese (in use/ready), EmbeddingGemma 300M (download 316MB) and BGE-M3 (download 560MB) with dims/context/size/notes and download buttons">
</p>

Three sources: **Off** (default; no vector embedding at all, pure BM25 keyword
retrieval), **Remote** (bring any OpenAI-compatible `/embeddings` service, selectable
only when the `embedding.*` quartet is configured), **Local** (pick from a built-in
model catalog, ONNX-quantized **CPU inference** — no API key, data never leaves the
machine). The local catalog is a built-in allowlist (each model pinned to a revision
with per-file sha256; arbitrary repos cannot be downloaded).

- **Download**: one click on the model card (default mirror `hf-mirror.com`, resumable
  downloads + sha256 integrity checks; a proxy is used when direct access is
  unreachable — proxy env vars like `HTTPS_PROXY`/`ALL_PROXY` are auto-detected by
  default, see `embedding.proxy`). Per-file failures auto-retry with a rotated cache
  key (`?dshmem-retry=N`, sidestepping occasionally bad CDN cache objects); hash
  mismatches restart from zero, network errors resume from the checkpoint; stored
  under `models/<id>/` in the data directory, deletable from the settings page at any time;
- **On-demand runtime**: the inference runtime (transformers.js, ~100–200MB) is
  installed only on first switch to the local tier, into `runtime/` in the data
  directory — never in the plugin's dependency tree or install directory; model
  loading and inference run on a **dedicated worker thread**, so the host event
  loop is never frozen (conversations and page interactions stay responsive while
  text is being embedded);
- **Live switching**: one click to swap sources — everything is re-embedded in the
  background (visible progress, cancellable; retrieval silently degrades to keywords
  in the meantime, conversations unaffected; a dimension change rebuilds the vector
  table at the new size); a failed switch keeps the old source, which a restart
  still uses;
- **Effective = deployment ceiling AND runtime choice**: `embedding.allowLocalModels=false`
  disables the local tier entirely; without the `embedding.*` quartet the remote tier
  is unavailable (enterprise deployments can lock this down). The choice persists in
  `embedding-source.json`.

## Logging & Troubleshooting

The dsh host prints plugin logs to the console; the plugin mirrors info and above to
`memory.log` in its data directory. The typical log path of one conversation turn:
`L0 capture` → `L0 flush` → `distillation pipeline start` → `LLM call (input/output
chars, duration)` → `L1 extraction done` → `pipeline end`; the next turn shows
`recall hit N L1 records`. Empty LLM output carries full diagnostics (finish reason /
token counts / reasoning excerpt); JSON parse failures include the first 400 characters
of the raw model output; all failure warns carry the first stack frame. The JSONL
fact source is appended per turn and relies on OS write-back (no per-line fsync);
an extreme crash (power loss) loses at most a small tail, and the index DB can be
fully re-derived from the fact source via "Rebuild memories".

## Differences from MemoryCore

- The full pipeline is embedded (no external Gateway); distillation reuses DSH's own LLM;
- L2/L3 changed from "LLM manipulates file tools" to "LLM outputs operation JSON / full documents, engineering side executes";
- Recall injection happens at `agent/pre-step` (message-side synthetic message, the official pre-step replacement semantics) plus agent-scoped `systemPrompt.context` (persona/navigation stable zone — DSH-native events/services);
- Storage/retrieval is a single-machine slimmed version of the official sqlite backend (drops multi-tenant isolation columns, TCVDB cloud backend, audit tables; tokenization uses jieba like the official one — @node-rs/jieba prebuilt binaries union CJK character bigrams: word tokens give BM25 exact-word hits while bigrams keep sub-word recall; on load failure it falls back to pure bigrams, and FTS indexes are rebuilt automatically via a tokenizer version stamp).

## Credits

The core memory capabilities (layered distillation pipeline, prompt design, and the
dual-write storage architecture) are modeled after **MemoryCore** from
[TencentCloud/TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory).
Thanks to the original project for open-sourcing its design and implementation.

## Roadmap

Features under planning — feedback and priorities welcome in the
[issue tracker](https://github.com/JunNanLYS/dsh-layered-memory/issues):

- [ ] **Git branch awareness**: associate memories with the current git branch; recall can filter/boost by branch (orthogonal to the existing memory modes)
- [ ] **Claude Code / Codex memory import**: one-click migration of existing memory assets (`CLAUDE.md`, Claude Code memory files, Codex `AGENTS.md`, etc.), fed into the layered distillation pipeline

## License

[MIT](LICENSE)
