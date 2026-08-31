import type { MemoryFamily, MemoryLogger, SceneSummary } from '../types.js';
/** 场景文件 META 块标记（工作台活动流剥正文复用，保持单一事实源）。 */
export declare const META_START = "-----META-START-----";
export declare const META_END = "-----META-END-----";
export declare class SceneStore {
    private readonly logger?;
    private readonly dir;
    private readonly family;
    constructor(dataDir: string, family: MemoryFamily, logger?: MemoryLogger | undefined);
    init(): Promise<void>;
    /** 旧布局迁移：scenes/ 根下的 .md 移入本族目录。仅 chat 族执行（历史数据归属 chat）。 */
    private migrateLegacyLayout;
    listFiles(): Promise<string[]>;
    /** 列出场景摘要（解析 META 块）。 */
    list(): Promise<SceneSummary[]>;
    read(name: string): Promise<string | undefined>;
    /**
     * 写入/重写场景文件。content 为 [DELETED] 时删除该文件（LLM 的 delete 操作）。
     * 文件名自动归一化（空格→短横线、剔除非法字符），非法则抛错。
     */
    write(name: string, content: string): Promise<string>;
    /** 场景导航索引（召回注入用）。 */
    navigation(): Promise<string>;
}
/** 文件名归一化：只允许字母数字 CJK - _ .，以 .md 结尾，去空格/标点。
 *  超长名截断到 120 字符（ENAMETOOLONG 防御）；Windows 保留设备名加前缀 _ 避让。 */
export declare function sanitizeFilename(name: string): string;
