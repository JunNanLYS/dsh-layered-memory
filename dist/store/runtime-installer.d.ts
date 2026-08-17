import type { MemoryLogger } from '../types.js';
/** 钉死的 transformers.js 版本（D8：精确版本，升级插件时在此变更并重装运行时）。 */
export declare const PINNED_TRANSFORMERS_VERSION = "4.2.0";
export interface RuntimeProgress {
    phase: 'idle' | 'installing' | 'ready' | 'error' | 'cancelled';
    /** 插件钉死的目标版本。 */
    targetVersion: string;
    /** runtime 里实际就位的版本（未安装为 null）。 */
    installedVersion: string | null;
    startedAt: number;
    /** 已运行毫秒（读时计算）。 */
    elapsedMs: number;
    /** npm 输出尾行（最近 5 行，让用户看到 npm 在干什么）。 */
    lastLines: string[];
    error?: string;
}
/** 子进程抽象（测试注入缝）：注册输出行回调 + 终止 + 终态。 */
export interface SpawnedProcess {
    onStdout(cb: (line: string) => void): void;
    onStderr(cb: (line: string) => void): void;
    kill(): void;
    /** 终态 Promise：退出码（null = 被信号杀死）。 */
    exited: Promise<number | null>;
}
export type SpawnImpl = (command: string, args: string[], cwd: string) => SpawnedProcess;
export declare class RuntimeInstaller {
    readonly runtimeDir: string;
    private readonly target;
    private readonly logger?;
    private readonly spawnImpl;
    private progress;
    private child;
    private current;
    /** 安装超时（npm 卡死不罕见：registry 停滞即永挂，applyBusy 会被锁死）。 */
    private static INSTALL_TIMEOUT_MS;
    constructor(dataDir: string, targetVersion: string, opts?: {
        logger?: MemoryLogger;
        spawnImpl?: SpawnImpl;
    });
    /** 包内模块名（与钉死版本一起构成安装目标）。 */
    static packageName: string;
    /** 进度快照。 */
    getProgress(): RuntimeProgress;
    private pkgJsonPath;
    /** 已就位版本（读 package.json；未安装返回 null）。 */
    installedVersion(): Promise<string | null>;
    /** 是否就绪（版本精确匹配目标）。 */
    isReady(): Promise<boolean>;
    /**
     * 确保运行时就位：版本匹配直接就绪；否则安装（忙时并 await 同一次任务）。
     * 返回是否就绪（失败/取消返回 false 并在 progress.error 说明原因）。
     */
    ensure(): Promise<boolean>;
    /** 取消安装（kill 子进程；node_modules 残留无害，npm 幂等重装）。 */
    cancel(): boolean;
    /** 从 runtime 目录解析已安装的 transformers 模块（LocalEmbeddingService 用）。 */
    resolveModule(): unknown;
    private pushLine;
    private installOnce;
}
