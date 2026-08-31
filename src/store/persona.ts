/**
 * L3 画像存储：persona-<family>.md（chat 族=用户画像 / work 族=Team Operating Doctrine）。
 * 场景导航由工程侧自动追加/剥离（移植 MemoryCore stripSceneNavigation 语义）。
 * init() 把旧布局的 persona.md 一次性改名为 persona-chat.md（历史数据归属 chat 档）。
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { MemoryFamily, MemoryLogger } from '../types.js';
import { atomicWriteText, readTextIfExists } from './io.js';

export const NAV_HEADER = '## 🗺️ Scene Navigation';

export class PersonaStore {
  private readonly file: string;
  private readonly family: MemoryFamily;

  constructor(dataDir: string, family: MemoryFamily, private readonly logger?: MemoryLogger) {
    this.family = family;
    this.file = path.join(dataDir, `persona-${family}.md`);
  }

  /** 旧布局迁移：persona.md → persona-chat.md（幂等，仅 chat 族执行）。 */
  async init(): Promise<void> {
    if (this.family !== 'chat') return;
    const dataDir = path.dirname(this.file);
    const legacy = path.join(dataDir, 'persona.md');
    try {
      await fs.access(legacy);
      await fs.rename(legacy, this.file);
      this.logger?.info('[memory] 画像文件迁移：persona.md → persona-chat.md');
    } catch {
      /* 无旧文件或已迁移 */
    }
  }

  /** 读取正文（剥离场景导航部分）。 */
  async read(): Promise<string | undefined> {
    const raw = await readTextIfExists(this.file);
    if (!raw) return undefined;
    return stripSceneNavigation(raw).trim() || undefined;
  }

  /** 文件 mtime（epoch ms；无画像文件 null）——工作台资产活动流的 L3 时间源。 */
  async mtime(): Promise<number | null> {
    try {
      return (await fs.stat(this.file)).mtimeMs;
    } catch {
      return null;
    }
  }

  /** 写入正文（保留已有导航段则拼回尾部）。 */
  async write(body: string): Promise<void> {
    const raw = await readTextIfExists(this.file);
    const nav = raw ? extractSceneNavigation(raw) : undefined;
    const content = nav ? `${body.trim()}\n\n${nav}\n` : `${body.trim()}\n`;
    await atomicWriteText(this.file, content);
  }
}

export function stripSceneNavigation(content: string): string {
  const idx = content.indexOf(NAV_HEADER);
  if (idx === -1) return content;
  return content.slice(0, idx).trimEnd();
}

function extractSceneNavigation(content: string): string | undefined {
  const idx = content.indexOf(NAV_HEADER);
  if (idx === -1) return undefined;
  return content.slice(idx).trim();
}
