import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value || "")) ?? fallback;
  } catch {
    return fallback;
  }
}

export function createMoneyPrinterStore(baseDir) {
  const dataDir = path.join(baseDir, ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "money-printer.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS money_printer_jobs (
      id TEXT PRIMARY KEY,
      official_task_id TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      material_sources_json TEXT NOT NULL DEFAULT '[]',
      source_index INTEGER NOT NULL DEFAULT 0,
      attempts_json TEXT NOT NULL DEFAULT '[]',
      material_mode TEXT NOT NULL DEFAULT 'standard',
      material_plan_json TEXT,
      runtime_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS money_printer_assets (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_money_printer_jobs_updated ON money_printer_jobs(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_money_printer_assets_updated ON money_printer_assets(updated_at DESC);
  `);
  const jobColumns = new Set(db.prepare("PRAGMA table_info(money_printer_jobs)").all().map((row) => row.name));
  if (!jobColumns.has("runtime_json")) db.exec("ALTER TABLE money_printer_jobs ADD COLUMN runtime_json TEXT NOT NULL DEFAULT '{}'");

  const saveJobStatement = db.prepare(`
    INSERT INTO money_printer_jobs (
      id, official_task_id, payload_json, material_sources_json, source_index,
      attempts_json, material_mode, material_plan_json, runtime_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      official_task_id=excluded.official_task_id,
      payload_json=excluded.payload_json,
      material_sources_json=excluded.material_sources_json,
      source_index=excluded.source_index,
      attempts_json=excluded.attempts_json,
      material_mode=excluded.material_mode,
      material_plan_json=excluded.material_plan_json,
      runtime_json=excluded.runtime_json,
      updated_at=excluded.updated_at
  `);
  const saveAssetStatement = db.prepare(`
    INSERT INTO money_printer_assets (id, file_path, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      file_path=excluded.file_path,
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `);

  function saveManagedTask(task) {
    const now = new Date().toISOString();
    const createdAt = String(task?.createdAt || now);
    saveJobStatement.run(
      String(task?.id || ""),
      String(task?.officialTaskId || ""),
      JSON.stringify(task?.payload || {}),
      JSON.stringify(Array.isArray(task?.materialSources) ? task.materialSources : []),
      Number(task?.sourceIndex || 0),
      JSON.stringify(Array.isArray(task?.attempts) ? task.attempts : []),
      String(task?.materialMode || "standard"),
      task?.materialPlan == null ? null : JSON.stringify(task.materialPlan),
      JSON.stringify(task?.runtime || {}),
      createdAt,
      now,
    );
    return getManagedTask(task.id);
  }

  function getManagedTask(id) {
    const row = db.prepare("SELECT * FROM money_printer_jobs WHERE id=?").get(String(id || ""));
    if (!row) return null;
    return {
      id: row.id,
      officialTaskId: row.official_task_id,
      payload: parseJson(row.payload_json, {}),
      materialSources: parseJson(row.material_sources_json, []),
      sourceIndex: Number(row.source_index || 0),
      attempts: parseJson(row.attempts_json, []),
      materialMode: row.material_mode || "standard",
      materialPlan: parseJson(row.material_plan_json, null),
      runtime: parseJson(row.runtime_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function saveRenderedFile(id, record = {}) {
    const now = new Date().toISOString();
    const createdAt = String(record.createdAt || now);
    saveAssetStatement.run(
      String(id || ""),
      path.resolve(String(record.filePath || "")),
      JSON.stringify(record.metadata || {}),
      createdAt,
      now,
    );
    return getRenderedFile(id);
  }

  function getRenderedFile(id) {
    const row = db.prepare("SELECT * FROM money_printer_assets WHERE id=?").get(String(id || ""));
    if (!row) return null;
    return {
      id: row.id,
      filePath: row.file_path,
      metadata: parseJson(row.metadata_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function listRenderedFiles(limit = 200) {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
    return db.prepare("SELECT * FROM money_printer_assets ORDER BY updated_at DESC LIMIT ?").all(safeLimit).map((row) => ({
      id: row.id,
      filePath: row.file_path,
      metadata: parseJson(row.metadata_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  return {
    dbPath,
    close: () => db.close(),
    getManagedTask,
    saveManagedTask,
    getRenderedFile,
    listRenderedFiles,
    saveRenderedFile,
  };
}
