// 项目中心
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function createProjectCenter(baseDir) {
  const dbPath = path.join(baseDir, ".data", "project-center.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT DEFAULT '',
      cover TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS project_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      asset_type TEXT,
      asset_id TEXT,
      name TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  function create(name, description = "") {
    const id = `proj_${Date.now()}`; db.prepare("INSERT INTO projects (id,name,description) VALUES (?,?,?)").run(id, name, description); return { id, name, description };
  }
  function list() { return db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all(); }
  function getById(id) { return db.prepare("SELECT * FROM projects WHERE id=?").get(id); }
  function remove(id) { db.prepare("DELETE FROM projects WHERE id=?").run(id); return true; }
  function linkAsset(projectId, assetType, assetId, name = "") {
    const id = `pa_${Date.now()}`; db.prepare("INSERT INTO project_assets (id,project_id,asset_type,asset_id,name) VALUES (?,?,?,?,?)").run(id, projectId, assetType, assetId, name); return id;
  }
  function getAssets(projectId) { return db.prepare("SELECT * FROM project_assets WHERE project_id=? ORDER BY created_at DESC").all(projectId); }
  function getStats() { return { total: db.prepare("SELECT COUNT(*) as c FROM projects").get().c, draft: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='draft'").get().c, completed: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='completed'").get().c }; }

  return { create, list, getById, remove, linkAsset, getAssets, getStats };
}
