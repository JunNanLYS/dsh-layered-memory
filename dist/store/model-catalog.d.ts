/**
 * 本地嵌入模型目录（D2 决策）：插件内置白名单，不提供任意 repo 下载。
 * 每款锁定 revision（commit sha）+ 每文件 sha256——目录即完整性契约，
 * 升级模型 = 改这里（维度变化会触发使用方全量重嵌入）。
 *
 * 数据来源（2026-08-17 采集）：
 * - revision 与 LFS 大文件 sha256：HF tree API（LFS oid 即 sha256）；
 * - 小文件 sha256：从镜像按锁定 revision 下载后本地实测。
 * embeddinggemma 是 ONNX 外部权重格式：model_quantized.onnx（图，~0.5MB）与
 * model_quantized.onnx_data（权重，~294MB）必须成对存在，onnxruntime 同目录自动加载。
 */
export interface CatalogFile {
    /** 仓库内相对路径（同时是 models/<id>/ 下的落盘路径）。 */
    path: string;
    /** 字节数（磁盘检查的进度分母）。 */
    size: number;
    /** sha256 hex（64 位）。 */
    sha256: string;
}
export interface CatalogEntry {
    /** 稳定 id：嵌入源状态文件（embedding-source.json）引用它。 */
    id: string;
    /** 展示名。 */
    name: string;
    /** HF 仓库 repo id。 */
    repo: string;
    /** 锁定的 revision。 */
    revision: string;
    /** 向量维度（vec0 建表与切换重嵌的判据）。 */
    dims: number;
    /** 上下文窗口（token），仅 UI 展示。 */
    contextTokens: number;
    /** 池化方式：BGE 系 CLS；embeddinggemma 系（Gemma 解码器底座）MEAN。 */
    pooling: 'cls' | 'mean';
    /** UI 标签。 */
    tags: string[];
    /** 一句话说明（设置页模型卡）。 */
    description: string;
    files: CatalogFile[];
}
export declare const MODEL_CATALOG: CatalogEntry[];
/** 按 id 取目录项。 */
export declare function catalogById(id: string): CatalogEntry | undefined;
/** 模型总字节数（磁盘检查与整体进度分母）。 */
export declare function catalogTotalBytes(entry: CatalogEntry): number;
