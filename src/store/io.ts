/**
 * 持久化工具：原子写（tmp + rename）、JSON 状态。
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** 原子写文本文件。 */
export async function atomicWriteText(file: string, content: string): Promise<void> {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, 'utf-8');
  await fs.rename(tmp, file);
}

/** 原子写 JSON。 */
export async function atomicWriteJson(file: string, value: unknown): Promise<void> {
  await atomicWriteText(file, JSON.stringify(value, null, 2));
}

export async function readJsonIfExists<T>(file: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function readTextIfExists(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf-8');
  } catch {
    return undefined;
  }
}

/** 追加 JSONL 行（存在则追加，否则创建）。 */
export async function appendJsonl(file: string, lines: unknown[]): Promise<void> {
  if (lines.length === 0) return;
  await ensureDir(path.dirname(file));
  const payload = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  await fs.appendFile(file, payload, 'utf-8');
}

/** 读取 JSONL 全部行。 */
export async function readJsonl<T>(file: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const out: T[] = [];
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t) as T);
      } catch {
        // 跳过坏行
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
