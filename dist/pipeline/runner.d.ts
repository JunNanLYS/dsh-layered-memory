/**
 * 管线 Runner：串行执行 L0 → L1 → L2 → L3。
 * 所有阶段失败只记日志，绝不向 Agent 循环抛错（失败兜底）。
 *
 * 会话档位：enqueue 带 mode（off 在捕获侧已被拦截）；L1 待重试缓冲按档分桶；
 * L2/L3 按记录族各自跑各自的场景/画像存储与阈值计数（分族隔离不变量）。
 *
 * 调度：内部是带优先级的任务列表——正常对话轮次（live）优先于重建分块（rebuild），
 * 重建期间用户照常聊天，新轮次的蒸馏最多等一个重建块。任务串行，同一时刻至多一个在跑。
 *
 * 未蒸馏缓冲：pending 三桶持久化在 pending.json，进程重启不丢；init 恢复后延迟补跑一次
 * （受 live 开关与 minMessages 阈值约束，失败维持"等下一轮同档对话"的现状语义）。
 */
import type { Context } from '@deepseek-ai/cordis';
import { type MemoryConfig } from '../config.js';
import type { LiveSettingsHandle } from '../settings.js';
import type { L0Store } from '../store/l0.js';
import type { L1Store } from '../store/l1.js';
import type { PersonaStore } from '../store/persona.js';
import type { SceneStore } from '../store/scenes.js';
import type { StateStore } from '../store/state.js';
import type { ConversationMessage, ExtractMode, MemoryFamily, MemoryLogger } from '../types.js';
import type { FamilyStates } from './l1.js';
export interface MemoryStores {
    l0: L0Store;
    l1: L1Store;
    scenes: Record<MemoryFamily, SceneStore>;
    persona: Record<MemoryFamily, PersonaStore>;
    state: StateStore;
}
/** 管线任务（优先级调度：live 优先于 rebuild）。 */
export interface PipelineTask {
    kind: 'live' | 'rebuild';
    run: () => Promise<unknown>;
}
/** 选取下一个要执行的任务下标：最早的 live 优先，否则队首（rebuild 分块让位）。 */
export declare function pickNextTaskIndex(tasks: PipelineTask[]): number;
/**
 * 运行时调参视图：UI 选择器可临时覆盖蒸馏思考档位与蒸馏模型路由
 * （空串回退静态 config / 默认选择）。浅拷贝只覆盖 llm 一层，其余键与原 cfg
 * 共享只读引用；pipeline 全链继续收 cfg，无需感知。
 *
 * 蒸馏模型覆盖优先级：部署静态 pin（cfg.llm.provider+model 双字段齐）不可被
 * 运行时覆盖（部署可强制蒸馏走内网路由，防用户选择把对话外送）；未 pin 时
 * 运行时选择（distillProvider+distillModel 成对）生效；再退 agentDefaultModel。
 */
export declare function effectiveCfg(cfg: MemoryConfig, live?: LiveSettingsHandle): MemoryConfig;
export declare class MemoryRunner {
    private readonly ctx;
    private readonly cfg;
    private readonly stores;
    private readonly logger;
    private readonly live;
    /** 会话档位只读句柄（闲置扫描跳过 off 档会话；挂起语义）。 */
    private readonly modes?;
    private tasks;
    private draining;
    /** 停止标志（dispose 序置位）：不再取新任务；进行中任务自然收尾，其 DB 写入失败由各层兜底捕获。 */
    private stopped;
    private pending;
    /** 各档位桶渐进阈值（1 起步翻倍至稳态毕业；ADR-0003，随 pending.json 持久化）。 */
    private warmup;
    /** 每会话最后活动时间（闲置兜底判定用）。 */
    private lastActivity;
    private readonly pendingFile;
    /** 分族 checkpoint（init 后可用；重建收尾也从这里读活引用）。 */
    states: FamilyStates;
    private afterRun;
    constructor(ctx: Context, cfg: MemoryConfig, stores: MemoryStores, logger: MemoryLogger, live: LiveSettingsHandle, 
    /** 会话档位只读句柄（闲置扫描跳过 off 档会话；挂起语义）。 */
    modes?: {
        get(sessionId: string): string;
    } | undefined);
    init(): Promise<void>;
    /** 启动补跑：对每个非空桶的每个会话切片入队一次蒸馏尝试（受 live 开关与
     *  生效阈值约束；不足阈值的消息等用户继续或闲置兜底，失败不无限重试）。 */
    private scheduleStartupRetry;
    /** L1 抽取待重试的消息条数（状态面板用）。 */
    get pendingCount(): number;
    /** 管线跑完一轮后的回调（用于召回缓存失效）。 */
    setAfterRun(fn: () => void): void;
    /** 一轮对话结束后入队（L0 落盘由 capture 在 turn/end 即时完成，不排蒸馏队列）。 */
    enqueue(sessionId: string, messages: ConversationMessage[], mode: ExtractMode, opts?: {
        force?: boolean;
    }): void;
    /** 重建任务入队（低优先级：让位于正常轮次；由 RebuildController 分块驱动）。 */
    enqueueRebuildTask(run: () => Promise<unknown>): void;
    /** 重建蒸馏轮：统一 auto 档，全量强制蒸馏（不受阈值约束——历史小会话也必须出记忆）、
     *  不受缓冲 200 上限（历史会话全量入桶，由 char 预算分块）。 */
    runRebuildTurn(sessionId: string, messages: ConversationMessage[]): Promise<number>;
    /** 停止取新任务（插件 dispose 序调用；进行中任务照常跑完但不 await——LLM 慢调用不拖住宿主卸载）。 */
    stop(): void;
    /** 启动闲置兜底定时器（index.ts 装配；idleSeconds=0 关闭）。 */
    startIdleTimer(): void;
    /** 闲置扫描：静默达标且有切片的会话按捕获档位落袋（off 档会话挂起跳过）。 */
    private flushIdleSlices;
    /** 把某会话在各桶中的切片按捕获档位逐个入队强制蒸馏（闲置兜底 / 档位切换共用）。 */
    private enqueueSessionSlices;
    /**
     * 档位切换同步（session-modes 的 set() 回调，ADR-0003）：
     * 非 off 间切换 → 该会话切片立即按捕获档位蒸馏（新档位从空切片起步）；
     * 切到 off → 挂起（切片留存，闲置扫描跳过）；从 off 切回 → 挂起片按捕获档位落袋。
     */
    onModeChange(sessionId: string, oldMode: string, newMode: string): void;
    private pushTask;
    private drain;
    /** 缓冲落盘（每次蒸馏尝试后调用；失败只告警不阻断管线）。
     *  非重建轮持久化前按桶截断到上限：重建取消后的大桶不至于在后续每次
     *  蒸馏尝试时反复整量序列化落盘（多 MB 级 IO）；重建轮豁免维持。 */
    private persistPending;
    private runTurn;
    /**
     * 抽取并消费一个会话切片：成功才把切片移出桶并推进爬坡阈值；失败保留切片待重试。
     * 调用方已保证切片达到生效阈值（或 force）。背景参考按会话从 L0 现查并剔除切片
     * 自身（ADR-0003：会话间互不污染、重启不丢背景）。
     */
    private extractSessionSlice;
}
