import type { MemoryFamily, MemoryLogger } from '../types.js';
export declare const NAV_HEADER = "## \uD83D\uDDFA\uFE0F Scene Navigation";
export declare class PersonaStore {
    private readonly logger?;
    private readonly file;
    private readonly family;
    constructor(dataDir: string, family: MemoryFamily, logger?: MemoryLogger | undefined);
    /** 旧布局迁移：persona.md → persona-chat.md（幂等，仅 chat 族执行）。 */
    init(): Promise<void>;
    /** 读取正文（剥离场景导航部分）。 */
    read(): Promise<string | undefined>;
    /** 写入正文（保留已有导航段则拼回尾部）。 */
    write(body: string): Promise<void>;
}
export declare function stripSceneNavigation(content: string): string;
