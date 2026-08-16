/**
 * L2 场景块存储：Markdown 文件（含 META 块）+ 场景导航。
 * 命名规范移植自 MemoryCore；LLM 输出 [DELETED] 时由工程侧**删除文件**（硬删除），
 * list() 对仍含该标记的遗留文件容错跳过。
 *
 * 分族隔离：目录为 scenes/<family>/；init() 把旧布局（scenes/ 根下散文件）
 * 一次性迁入 scenes/chat/（历史数据由 chat 档蒸馏产出）。
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { MemoryFamily, MemoryLogger, SceneSummary } from '../types.js';
import { atomicWriteText, ensureDir, readTextIfExists } from './io.js';
import { NAV_HEADER } from './persona.js';

const META_START = '-----META-START-----';
const META_END = '-----META-END-----';
const DELETED_MARKER = '[DELETED]';

export class SceneStore {
  private readonly dir: string;
  private readonly family: MemoryFamily;

  constructor(dataDir: string, family: MemoryFamily, private readonly logger?: MemoryLogger) {
    this.family = family;
    this.dir = path.join(dataDir, 'scenes', family);
  }

  async init(): Promise<void> {
    await ensureDir(this.dir);
    await this.migrateLegacyLayout();
  }

  /** 旧布局迁移：scenes/ 根下的 .md 移入本族目录。仅 chat 族执行（历史数据归属 chat）。 */
  private async migrateLegacyLayout(): Promise<void> {
    if (this.family !== 'chat') return;
    const legacyDir = path.dirname(this.dir);
    let files: string[];
    try {
      files = await fs.readdir(legacyDir);
    } catch {
      return;
    }
    let moved = 0;
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const from = path.join(legacyDir, f);
      const to = path.join(this.dir, f);
      try {
        await fs.rename(from, to);
        moved++;
      } catch {
        /* 单文件失败跳过（可能被占用），下次启动重试 */
      }
    }
    if (moved > 0) this.logger?.info(`[memory] 场景目录迁移：${moved} 个文件 scenes/ → scenes/chat/`);
  }

  listFiles(): Promise<string[]> {
    return fs.readdir(this.dir).catch(() => []);
  }

  /** 列出场景摘要（解析 META 块）。 */
  async list(): Promise<SceneSummary[]> {
    const files = await this.listFiles();
    const out: SceneSummary[] = [];
    for (const f of files.sort()) {
      if (!f.endsWith('.md')) continue;
      const content = await readTextIfExists(path.join(this.dir, f));
      if (!content || content.trim() === DELETED_MARKER) continue;
      out.push(parseMeta(content, f));
    }
    return out;
  }

  async read(name: string): Promise<string | undefined> {
    const safe = sanitizeFilename(name);
    if (!safe) return undefined;
    return readTextIfExists(path.join(this.dir, safe));
  }

  /**
   * 写入/重写场景文件。content 为 [DELETED] 时删除该文件（LLM 的 delete 操作）。
   * 文件名自动归一化（空格→短横线、剔除非法字符），非法则抛错。
   */
  async write(name: string, content: string): Promise<string> {
    const safe = sanitizeFilename(name);
    if (!safe) throw new Error(`非法的场景文件名: ${name}`);
    const file = path.join(this.dir, safe);
    if (content.trim() === DELETED_MARKER) {
      await fs.unlink(file).catch(() => undefined);
      return safe;
    }
    await atomicWriteText(file, content);
    return safe;
  }

  /** 场景导航索引（召回注入用）。 */
  async navigation(): Promise<string> {
    const scenes = await this.list();
    if (scenes.length === 0) return '';
    const lines = [
      NAV_HEADER,
      '*以下是当前场景记忆索引，可使用 memory_read_scene 读取详细内容。*',
      '',
    ];
    for (const s of scenes) {
      lines.push(`- \`${s.path}\` — ${s.summary || '(无摘要)'}`);
    }
    return lines.join('\n');
  }
}

function parseMeta(content: string, name: string): SceneSummary {
  const s: SceneSummary = { path: name, created: '', updated: '', summary: '', heat: 0 };
  const start = content.indexOf(META_START);
  const end = content.indexOf(META_END);
  if (start !== -1 && end !== -1) {
    const meta = content.slice(start + META_START.length, end);
    for (const line of meta.split('\n')) {
      const m = /^\s*([a-zA-Z_]+)\s*:\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      if (key === 'created') s.created = value;
      else if (key === 'updated') s.updated = value;
      else if (key === 'summary') s.summary = value;
      else if (key === 'heat') s.heat = Number.parseInt(value, 10) || 0;
    }
  }
  return s;
}

/** 文件名归一化：只允许字母数字 CJK - _ .，以 .md 结尾，去空格/标点。 */
export function sanitizeFilename(name: string): string {
  let n = name.trim();
  if (!n.toLowerCase().endsWith('.md')) n = `${n}.md`;
  n = n
    .replace(/[^\w\u3400-\u9fff\uf900-\ufaff.\-_]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/-+\.md$/i, '.md')
    .replace(/^-+|-+$/g, '');
  if (!n || !/^[\w\u3400-\u9fff\uf900-\ufaff.\-_]+\.md$/i.test(n)) return '';
  return n;
}
