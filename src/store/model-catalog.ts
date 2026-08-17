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

export const MODEL_CATALOG: CatalogEntry[] = [
  {
    id: 'bge-small-zh-v1.5',
    name: 'BGE small 中文',
    repo: 'Xenova/bge-small-zh-v1.5',
    revision: '75c43b069aac4d136ba6bc1122f995fedcfd2781',
    dims: 512,
    contextTokens: 512,
    pooling: 'cls',
    tags: ['中文', '轻量'],
    description: '中文专用小模型：约 25MB，CPU 嵌入最快，适合先体验语义检索。',
    files: [
      { path: 'config.json', size: 716, sha256: 'd4193ead3a810fd694fa8a31d7fc72fbaebc0668b603e398734bf2f6538ff42f' },
      { path: 'tokenizer_config.json', size: 367, sha256: 'e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a' },
      { path: 'special_tokens_map.json', size: 125, sha256: 'b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3' },
      { path: 'tokenizer.json', size: 439125, sha256: '48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26' },
      { path: 'onnx/model_quantized.onnx', size: 24010842, sha256: '15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc' },
    ],
  },
  {
    id: 'embeddinggemma-300m',
    name: 'EmbeddingGemma 300M',
    repo: 'onnx-community/embeddinggemma-300m-ONNX',
    revision: '5090578d9565bb06545b4552f76e6bc2c93e4a66',
    dims: 768,
    contextTokens: 2048,
    pooling: 'mean',
    tags: ['多语言', '均衡'],
    description: 'Google 官方嵌入模型：100+ 语言含中文，约 295MB，质量与开销均衡（上游 MemoryCore 同款）。',
    files: [
      { path: 'config.json', size: 1765, sha256: '6e1f06404b7163e0325ed2ea3e6781cde50f4a50b31780a95ad0d30e8404d77b' },
      { path: 'added_tokens.json', size: 35, sha256: '50b2f405ba56a26d4913fd772089992252d7f942123cc0a034d96424221ba946' },
      { path: 'special_tokens_map.json', size: 662, sha256: '2f7b0adf4fb469770bb1490e3e35df87b1dc578246c5e7e6fc76ecf33213a397' },
      { path: 'tokenizer_config.json', size: 1156830, sha256: '3ca953eea6c3c9fcda9cf3df22949ff18b216f7c74bd6459230f3f1013953f3a' },
      { path: 'generation_config.json', size: 133, sha256: '1fb1efd221c1ca88a736b1b36cb47d754c177677e222acb3b1e5424c5d664870' },
      { path: 'tokenizer.json', size: 20323312, sha256: '4dda02faaf32bc91031dc8c88457ac272b00c1016cc679757d1c441b248b9c47' },
      { path: 'onnx/model_quantized.onnx', size: 567874, sha256: '172efde319fe1542dc41f31be6154910b05b78f7a861c265c4600eec906bd6d8' },
      { path: 'onnx/model_quantized.onnx_data', size: 308890624, sha256: '705626e28e4c23c82ade34566b4197d97f534c12275fa406dfb71e9937d388c0' },
    ],
  },
  {
    id: 'bge-m3',
    name: 'BGE-M3 大杯',
    repo: 'Xenova/bge-m3',
    revision: '4de13258303883538bd53b696b452bf8099f0858',
    dims: 1024,
    contextTokens: 8192,
    pooling: 'cls',
    tags: ['中文', '长上下文'],
    description: '中文质量最强：8192 token 上下文，约 543MB，CPU 嵌入较慢（单条可达秒级）。',
    files: [
      { path: 'config.json', size: 770, sha256: '734a79bf12d388c1467a4e3ab625f45de7f6906cffcfb93a1eca1787504bed95' },
      { path: 'special_tokens_map.json', size: 964, sha256: '8c785abebea9ae3257b61681b4e6fd8365ceafde980c21970d001e834cf10835' },
      { path: 'tokenizer_config.json', size: 1173, sha256: '7e4c1cc848840aeccdd763458c18dd525eb0f795c992e00ebe9c28554e7db2d4' },
      { path: 'tokenizer.json', size: 17082821, sha256: '6710678b12670bc442b99edc952c4d996ae309a7020c1fa0096dd245c2faf790' },
      { path: 'onnx/model_quantized.onnx', size: 569694530, sha256: '0826f8c1ab9edf1801db86c61919d4d108e8bfc0b809ec823ad366882ff0b77d' },
    ],
  },
];

/** 按 id 取目录项。 */
export function catalogById(id: string): CatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/** 模型总字节数（磁盘检查与整体进度分母）。 */
export function catalogTotalBytes(entry: CatalogEntry): number {
  return entry.files.reduce((sum, f) => sum + f.size, 0);
}
