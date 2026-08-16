import type { MemoryLogger, MemoryMode } from '../types.js';
export declare function isMemoryMode(v: unknown): v is MemoryMode;
export declare class SessionModeStore {
    private readonly defaultMode;
    private readonly logger?;
    private readonly file;
    private readonly entries;
    private readonly loaded;
    private persistFailed;
    /** 串行化持久化写（避免并发原子写撞临时文件名）。 */
    private writeChain;
    constructor(dataDir: string, defaultMode: Extract<MemoryMode, 'auto' | 'chat' | 'work'>, logger?: MemoryLogger | undefined);
    /** 载入持久化映射（index.ts 启动时 await；失败降级内存态）。 */
    init(): Promise<void>;
    get default(): MemoryMode;
    /** 同步读取：未设置过的会话返回默认档。 */
    get(sessionId: string): MemoryMode;
    /** 设置会话档位（写穿持久化；持久化失败保持内存态生效）。 */
    set(sessionId: string, mode: MemoryMode): void;
    /** 等待在途持久化写完成（测试/停机用）。 */
    flush(): Promise<void>;
    private persist;
    private serialize;
}
