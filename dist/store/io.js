/**
 * 持久化工具：原子写（tmp + fsync + rename）、JSON 状态。
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
export async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}
/**
 * 原子写文本文件。tmp 写满后先 fsync 数据块再 rename——否则断电时文件系统可能
 * 先持久化 rename 元数据、后持久化数据块（ext4 delayed allocation / NTFS 均可能），
 * 目标文件变成空文件或半截。tmp 名带随机段防同毫秒碰撞；失败路径清理孤儿 tmp。
 */
export async function atomicWriteText(file, content) {
    await ensureDir(path.dirname(file));
    const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
    try {
        await fs.writeFile(tmp, content, 'utf-8');
        const fh = await fs.open(tmp, 'r+');
        try {
            await fh.sync();
        }
        finally {
            await fh.close();
        }
        await fs.rename(tmp, file);
    }
    catch (err) {
        await fs.unlink(tmp).catch(() => { });
        throw err;
    }
}
/** 原子写 JSON。 */
export async function atomicWriteJson(file, value) {
    await atomicWriteText(file, JSON.stringify(value, null, 2));
}
export async function readJsonIfExists(file) {
    try {
        const raw = await fs.readFile(file, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
export async function readTextIfExists(file) {
    try {
        return await fs.readFile(file, 'utf-8');
    }
    catch {
        return undefined;
    }
}
/**
 * 追加 JSONL 行（存在则追加，否则创建）。走 OS 写回不加 fsync：追加是热路径
 * （每轮对话一次），逐条 fsync 的延迟代价大于崩溃窗口丢尾部几行的损失——
 * 事实源的完整性边界见 README「日志与故障排查」。
 */
export async function appendJsonl(file, lines) {
    if (lines.length === 0)
        return;
    await ensureDir(path.dirname(file));
    const payload = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    await fs.appendFile(file, payload, 'utf-8');
}
/** 读取 JSONL 全部行。 */
export async function readJsonl(file) {
    try {
        const raw = await fs.readFile(file, 'utf-8');
        const out = [];
        for (const line of raw.split('\n')) {
            const t = line.trim();
            if (!t)
                continue;
            try {
                out.push(JSON.parse(t));
            }
            catch {
                // 跳过坏行
            }
        }
        return out;
    }
    catch {
        return [];
    }
}
export function nowIso() {
    return new Date().toISOString();
}
export function dayKey(ts) {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}
