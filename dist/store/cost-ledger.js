function emptyCostAggregate() {
    return { calls: 0, inputChars: 0, outputTokens: 0, reasoningTokens: 0, avgOutputTokens: 0, medianOutputTokens: 0 };
}
/** 已排序序列的中位数（偶数个取中间两者平均；空返回 0）。 */
function medianOf(sorted) {
    const n = sorted.length;
    if (n === 0)
        return 0;
    const mid = Math.floor(n / 2);
    return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export class CostLedger {
    db = null;
    logger;
    stmtInsert = null;
    stmtDelete = null;
    /** init 是否成功（未就绪 = 宿主库降级，方法全部返回零值不抛错）。 */
    get ready() {
        return this.stmtInsert !== null;
    }
    /** 建表 + 迁移 + 语句缓存（MemoryDb.initSchema 内调用；失败冒泡触发库级降级）。 */
    init(db, logger) {
        this.db = db;
        this.logger = logger;
        db.exec(`
      CREATE TABLE IF NOT EXISTS token_cost (
        ts INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        layer TEXT NOT NULL,
        input_chars INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0
      )
    `);
        // 迁移：provider/model 复合键引入前的旧表补 provider 列（历史行回填 unknown）
        const cols = db.prepare('PRAGMA table_info(token_cost)').all();
        if (!cols.some((c) => c.name === 'provider')) {
            db.exec("ALTER TABLE token_cost ADD COLUMN provider TEXT NOT NULL DEFAULT 'unknown'");
        }
        db.exec('CREATE INDEX IF NOT EXISTS idx_token_cost_ts ON token_cost(ts)');
        this.stmtInsert = db.prepare('INSERT INTO token_cost (ts, provider, model, layer, input_chars, output_tokens, reasoning_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)');
        this.stmtDelete = db.prepare('DELETE FROM token_cost WHERE ts < ?');
    }
    /**
     * 记录一次蒸馏调用成本（明细表，写入时按 retentionDays 滚动清理；0 = 永久保留）。
     * 失败/成功都记（token 照烧）；记账失败记 warn 但不阻断蒸馏（成本看板是增强能力）。
     */
    insertCostCall(provider, model, layer, inputChars, outputTokens, reasoningTokens, retentionDays) {
        if (!this.db || !this.stmtInsert || !this.stmtDelete)
            return;
        try {
            this.stmtInsert.run(Date.now(), provider, model, layer, Math.max(0, Math.round(inputChars)), Math.max(0, Math.round(outputTokens)), Math.max(0, Math.round(reasoningTokens)));
            if (retentionDays > 0)
                this.stmtDelete.run(Date.now() - retentionDays * 24 * 3600_000);
        }
        catch (err) {
            this.logger?.warn(`[memory][sqlite] token_cost 记账失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * 查询 token_cost 单窗口聚合（成本看板用；since 为毫秒起点，0 = 全量）。
     * 输入口径：inputChars 是字符（llm 流拿不到输入 token，沿用 llm-usage 的字符折算口径）。
     * median 需取 output_tokens 序列在 JS 侧算（SQLite 无内置 median 函数）。
     */
    aggregateCost(since) {
        if (!this.ready || !this.db)
            return { total: emptyCostAggregate(), byModel: [] };
        try {
            const total = this.db
                .prepare(`SELECT COUNT(*) AS calls,
                  COALESCE(SUM(input_chars), 0) AS inputChars,
                  COALESCE(SUM(output_tokens), 0) AS outputTokens,
                  COALESCE(SUM(reasoning_tokens), 0) AS reasoningTokens,
                  COALESCE(AVG(output_tokens), 0) AS avgOutputTokens
             FROM token_cost WHERE ts >= ?`)
                .get(since);
            const tokenRows = this.db
                .prepare('SELECT output_tokens FROM token_cost WHERE ts >= ? ORDER BY output_tokens')
                .all(since);
            const byModel = this.db
                .prepare(`SELECT provider, model, COUNT(*) AS calls,
                  COALESCE(SUM(input_chars), 0) AS inputChars,
                  COALESCE(SUM(output_tokens), 0) AS outputTokens,
                  COALESCE(SUM(reasoning_tokens), 0) AS reasoningTokens
             FROM token_cost WHERE ts >= ? GROUP BY provider, model ORDER BY outputTokens DESC`)
                .all(since);
            return {
                total: {
                    calls: total.calls,
                    inputChars: total.inputChars,
                    outputTokens: total.outputTokens,
                    reasoningTokens: total.reasoningTokens,
                    avgOutputTokens: total.avgOutputTokens,
                    medianOutputTokens: medianOf(tokenRows.map((r) => r.output_tokens)),
                },
                byModel,
            };
        }
        catch {
            return { total: emptyCostAggregate(), byModel: [] };
        }
    }
    /**
     * 按层级归并聚合（l1 = l1-extract + l1-dedup；成本看板层级表格用）。
     * 降级/异常返回空数组，不抛错。
     */
    aggregateCostByLayer(since) {
        if (!this.ready || !this.db)
            return [];
        try {
            const rows = this.db
                .prepare(`SELECT CASE WHEN layer IN ('l1-extract','l1-dedup') THEN 'l1' ELSE layer END AS layer,
                  COUNT(*) AS calls,
                  COALESCE(SUM(input_chars), 0) AS inputChars,
                  COALESCE(SUM(output_tokens), 0) AS outputTokens,
                  COALESCE(SUM(reasoning_tokens), 0) AS reasoningTokens,
                  COALESCE(AVG(output_tokens), 0) AS avgOutputTokens
             FROM token_cost WHERE ts >= ? GROUP BY layer ORDER BY layer`)
                .all(since);
            // 中位数需取 output_tokens 序列在 JS 侧算（SQLite 无内置 median）
            const tokenRows = this.db
                .prepare(`SELECT CASE WHEN layer IN ('l1-extract','l1-dedup') THEN 'l1' ELSE layer END AS layer,
                  output_tokens
             FROM token_cost WHERE ts >= ? ORDER BY layer, output_tokens`)
                .all(since);
            const medianByLayer = new Map();
            for (const r of tokenRows) {
                const arr = medianByLayer.get(r.layer);
                if (arr)
                    arr.push(r.output_tokens);
                else
                    medianByLayer.set(r.layer, [r.output_tokens]);
            }
            return rows.map((r) => ({
                ...r,
                medianOutputTokens: medianOf(medianByLayer.get(r.layer) ?? []),
            }));
        }
        catch {
            return [];
        }
    }
    /**
     * 按时间桶（bucketMs 毫秒）+ model 聚合，返回扁平行。
     * offsetMs 把桶边界对齐本地时区；layer 为空=全部，'l1' 归并 extract/dedup，其余精确匹配。
     * 趋势图与「日均/周均/月均 + 中位数」统计共用：JS 侧按不同 bucketMs 调三次再聚合。
     */
    aggregateByBucket(bucketMs, offsetMs, since, layer) {
        if (!this.ready || !this.db)
            return [];
        try {
            let sql = `SELECT CAST((ts + ?) / ? AS INTEGER) AS bucket, provider, model,
                COUNT(*) AS calls,
                COALESCE(SUM(output_tokens), 0) AS outputTokens,
                COALESCE(SUM(reasoning_tokens), 0) AS reasoningTokens
           FROM token_cost WHERE ts >= ?`;
            const params = [offsetMs, bucketMs, since];
            if (layer === 'l1') {
                sql += ` AND layer IN ('l1-extract','l1-dedup')`;
            }
            else if (layer) {
                sql += ` AND layer = ?`;
                params.push(layer);
            }
            sql += ` GROUP BY bucket, provider, model ORDER BY bucket, provider, model`;
            return this.db.prepare(sql).all(...params);
        }
        catch {
            return [];
        }
    }
}
