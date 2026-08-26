import type { MemoryLogger } from '../types.js';
/** 钉死的 transformers.js 版本（D8：精确版本，升级插件时在此变更并重装运行时）。 */
export declare const PINNED_TRANSFORMERS_VERSION = "4.2.0";
import type { RuntimeProgress } from '../contract.js';
export type { RuntimeProgress } from '../contract.js';
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
    /** 随包 lockfile 路径（测试可注入；默认取 dist 根下构建期拷入的资产）。 */
    private readonly lockfileSource;
    private progress;
    private child;
    private current;
    /** 安装超时（npm 卡死不罕见：registry 停滞即永挂，applyBusy 会被锁死）。每次 spawn 独立计时。 */
    private static INSTALL_TIMEOUT_MS;
    constructor(dataDir: string, targetVersion: string, opts?: {
        logger?: MemoryLogger;
        spawnImpl?: SpawnImpl;
        lockfileSource?: string;
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
    /**
     * 取消安装（kill 子进程；node_modules 残留无害，npm 幂等重装）。
     * 间隙兼容：ci 退出到回退 install 起跑之间 child 为 null——此时也置取消态，
     * runNpm 起跑前复查即不再起新进程（否则回退的 npm 会跑到自然结束且无法再取消）。
     */
    cancel(): boolean;
    private pushLine;
    /** 跑一次 npm 子进程（采集尾行 + 超时 kill），返回退出码（null = 被杀死/启动失败）。 */
    private runNpm;
    /** 取消态判定。独立方法而非内联比较：cancel() 在 await 期间跨方法置位
     *  phase，TS 的属性流分析不跟踪这种突变，内联比较会被窄化误报"无重叠"。 */
    private wasCancelled;
    private installOnce;
}
