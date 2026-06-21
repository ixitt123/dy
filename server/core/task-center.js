// 任务中心 2.0 — 集成 QueueManager + SQLite + WebSocket
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { QueueManager } from "./queue-manager.js";

export function calculateDurationMs(startedAt, now = Date.now()) {
  return Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : null;
}

export function createTaskCenterV2(baseDir, { onProgress, maxConcurrency = 3 } = {}) {
  const dbPath = path.join(baseDir, ".data", "task-center.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT,
      name TEXT,
      status TEXT DEFAULT 'waiting',
      progress INTEGER DEFAULT 0,
      current_step TEXT DEFAULT '',
      input_data TEXT DEFAULT '{}',
      output_data TEXT DEFAULT '{}',
      error TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      completed_at TEXT
    )
  `);

  const queue = new QueueManager({ maxConcurrency, onProgress });

  function submit(type, name, data, executor) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
    db.prepare(`INSERT INTO tasks (id, type, name, status, input_data) VALUES (?, ?, ?, 'waiting', ?)`)
      .run(taskId, type, name, JSON.stringify(data || {}));

    void queue.enqueue(type, data, async (ctx) => {
      db.prepare(`UPDATE tasks SET status='running', updated_at=datetime('now','localtime') WHERE id=?`).run(taskId);
      try {
        const result = await executor(ctx);
        const durationMs = calculateDurationMs(ctx.startedAt);
        db.prepare(`UPDATE tasks SET status='done', progress=100, output_data=?, duration_ms=?, 
          updated_at=datetime('now','localtime'), completed_at=datetime('now','localtime') WHERE id=?`)
          .run(JSON.stringify(result || {}), durationMs, taskId);
        return result;
      } catch (e) {
        const durationMs = calculateDurationMs(ctx.startedAt);
        db.prepare(`UPDATE tasks SET status='failed', error=?, duration_ms=?, updated_at=datetime('now','localtime'), completed_at=datetime('now','localtime') WHERE id=?`)
          .run(e.message, durationMs, taskId);
        throw e;
      }
    }, { taskId }).catch(() => {});

    return taskId;
  }

  function getTasks({ status, limit = 50 } = {}) {
    let sql = "SELECT * FROM tasks";
    const params = [];
    if (status) { sql += " WHERE status=?"; params.push(status); }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    return db.prepare(sql).all(...params);
  }

  function getStats() {
    return {
      total: db.prepare("SELECT COUNT(*) as c FROM tasks").get().c,
      waiting: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='waiting'").get().c,
      running: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='running'").get().c,
      done: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done'").get().c,
      failed: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='failed'").get().c,
      queue: queue.getStatus(),
    };
  }

  function close() {
    queue.cancelAll();
    db.close();
  }

  return { submit, getTasks, getStats, queue, close };
}
