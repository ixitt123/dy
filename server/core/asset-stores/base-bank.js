/**
 * BaseBank — 资产存储基类
 * 所有 bank（copybank, director-bank, storyboard-bank, image-bank,
 * voice-bank, video-bank, jianying-bank）均继承此类。
 * 每个 bank 使用独立的 SQLite 数据库文件。
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export class BaseBank {
  /**
   * @param {string} dbPath - SQLite 数据库文件路径
   * @param {string} tableName - 表名
   */
  constructor(dbPath, tableName = "assets") {
    this.dbPath = dbPath;
    this.tableName = tableName;
    this.db = null;
  }

  /** 初始化数据库和表 */
  init() {
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA busy_timeout=5000");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL DEFAULT '',
        source_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'waiting'
          CHECK(status IN ('waiting','processing','done','failed')),
        data_json TEXT NOT NULL DEFAULT '{}',
        error TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_source_id
        ON ${this.tableName}(source_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_status
        ON ${this.tableName}(status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_source_type
        ON ${this.tableName}(source_type)
    `);
  }

  /**
   * 插入一条资产记录
   * @param {object} params
   * @param {string} params.sourceType - 来源类型
   * @param {string} params.sourceId - 来源 ID
   * @param {object} [params.data={}] - JSON 数据
   * @param {string} [params.status='waiting'] - 状态
   * @returns {object} 插入的记录
   */
  insert({ sourceType = "", sourceId = "", data = {}, status = "waiting" } = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (source_type, source_id, status, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
    `);
    const result = stmt.run(sourceType, String(sourceId), status, JSON.stringify(data));
    return this.getById(result.lastInsertRowid);
  }

  /**
   * 更新状态
   * @param {number} id
   * @param {string} status - waiting/processing/done/failed
   * @param {object} [extra={}] - 额外更新的字段 { data, error }
   */
  updateStatus(id, status, extra = {}) {
    const sets = ["status = ?", "updated_at = datetime('now','localtime')"];
    const values = [status];

    if (extra.data !== undefined) {
      sets.push("data_json = ?");
      values.push(JSON.stringify(extra.data));
    }
    if (extra.error !== undefined) {
      sets.push("error = ?");
      values.push(String(extra.error || ""));
    }

    values.push(id);
    this.db.prepare(`UPDATE ${this.tableName} SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  /**
   * 根据 ID 获取记录
   * @param {number} id
   * @returns {object|null}
   */
  getById(id) {
    const row = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(id);
    return row ? this._enrich(row) : null;
  }

  /**
   * 根据 source_id 获取记录
   * @param {string} sourceId
   * @returns {object|null}
   */
  getBySourceId(sourceId) {
    const row = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE source_id = ? ORDER BY id DESC LIMIT 1`).get(String(sourceId));
    return row ? this._enrich(row) : null;
  }

  /**
   * 按状态列出记录
   * @param {string} status
   * @param {object} [opts]
   * @param {number} [opts.limit=50]
   * @param {number} [opts.offset=0]
   * @returns {object[]}
   */
  listByStatus(status, { limit = 50, offset = 0 } = {}) {
    const rows = this.db.prepare(
      `SELECT * FROM ${this.tableName} WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(status, limit, offset);
    return rows.map((r) => this._enrich(r));
  }

  /**
   * 列出所有记录
   * @param {object} [opts]
   * @param {number} [opts.limit=50]
   * @param {number} [opts.offset=0]
   * @returns {object[]}
   */
  listAll({ limit = 50, offset = 0 } = {}) {
    const rows = this.db.prepare(
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset);
    return rows.map((r) => this._enrich(r));
  }

  /**
   * 获取统计信息
   * @returns {object}
   */
  getStats() {
    const total = this.db.prepare(`SELECT COUNT(*) as c FROM ${this.tableName}`).get().c;
    const byStatus = {};
    for (const s of ["waiting", "processing", "done", "failed"]) {
      byStatus[s] = this.db.prepare(`SELECT COUNT(*) as c FROM ${this.tableName} WHERE status = ?`).get(s).c;
    }
    return { total, byStatus };
  }

  /**
   * 删除一条记录
   * @param {number} id
   */
  delete(id) {
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
  }

  /** 关闭数据库连接 */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /** 内部：解析 data_json 并返回 enriched 对象 */
  _enrich(row) {
    let data = {};
    try {
      data = JSON.parse(row.data_json || "{}");
    } catch { /* keep empty */ }
    return {
      ...row,
      data,
    };
  }
}
