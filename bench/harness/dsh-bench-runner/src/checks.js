// 完成度校验（工作流赛道）的纯函数实现，与执行器解耦、可独立单测。
//
// 每条 check 必须恰好一种判据：
//   { file, contains: [k...] }     文件存在且包含全部关键词（正检查）
//   { file, notContains: [k...] }  文件存在且不含任一禁词（防误改 / 防旧流程复活）
//   { file, absent: true }         文件不得存在（旧流程专属产物在探针重置后不应再出现）
//   { file, exists: true }         文件必须存在（只看有无，不看内容）
// notContains / contains 可同条并用（文件既要有该有的、又不能有不该有的）。

import fs from 'node:fs';
import path from 'node:path';

/** 文件名白名单：仅字母数字点下划线连字符，杜绝任何路径片段。 */
export const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/** 拼接并校验相对路径不越出 base 目录：逐段白名单（段内仅字母数字点下划线连字符）。 */
export function safeJoin(base, rel) {
  const root = path.resolve(base);
  const segs = String(rel).split(/[\\/]+/).filter((s) => s !== '');
  if (segs.length === 0 || segs.some((s) => !SAFE_NAME.test(s))) {
    throw new Error(`非法相对路径：${rel}`);
  }
  const full = path.resolve(root, ...segs);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`路径越界：${rel}`);
  }
  return full;
}

/** 校验一条 check 的形状（validate-scenarios 与执行侧共用同一套规则）。 */
export function checkShapeProblem(c) {
  if (!c || typeof c.file !== 'string' || !c.file) return '缺 file';
  const hasContains = Array.isArray(c.contains) && c.contains.length > 0;
  const hasNot = Array.isArray(c.notContains) && c.notContains.length > 0;
  if (c.absent === true && c.exists === true) return 'absent 与 exists 互斥';
  if (c.absent === true || c.exists === true) {
    if (hasContains || hasNot) return 'absent/exists 不与 contains/notContains 同用';
    return '';
  }
  if (!hasContains && !hasNot) return '缺判据（contains / notContains / absent / exists 恰选其一）';
  return '';
}

/** 对沙箱根目录跑一批 check，返回 {file, ok, detail}[]（不抛错，逐条落 detail）。 */
export function evalFileChecks(sandboxRoot, checks) {
  return (checks ?? []).map((c) => {
    let ok = false;
    let detail = '';
    try {
      const file = safeJoin(sandboxRoot, c.file);
      if (c.absent === true) {
        ok = !fs.existsSync(file);
        detail = ok ? '未创建（符合预期）' : '不该出现的产物存在';
        return { file: c.file, ok, detail };
      }
      if (c.exists === true) {
        ok = fs.existsSync(file);
        detail = ok ? '存在' : '产物文件不存在';
        return { file: c.file, ok, detail };
      }
      const text = fs.readFileSync(file, 'utf8');
      const missing = (c.contains ?? []).filter((k) => !text.includes(k));
      const forbidden = (c.notContains ?? []).filter((k) => text.includes(k));
      ok = missing.length === 0 && forbidden.length === 0;
      const parts = [];
      if (missing.length) parts.push(`缺关键词：${missing.join('、')}`);
      if (forbidden.length) parts.push(`禁词出现：${forbidden.join('、')}`);
      detail = ok ? '命中' : parts.join('；');
    } catch {
      detail = '产物文件不存在';
    }
    return { file: c.file, ok, detail };
  });
}
