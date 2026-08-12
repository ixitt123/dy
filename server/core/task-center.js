import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { QueueManager } from "./queue-manager.js";
import { ErrorCodes, errorCategory, inferErrorCode, isRetryable } from "./error-codes.mjs";

const RUNNING_COLLECTOR_STATES = new Set(["下载中", "提取中"]);

export function calculateDurationMs(startedAt, now = Date.now()) {
  return Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : null;
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function mapCollectorStatus(status) {
  if (status === "等待") return "waiting";
  if (RUNNING_COLLECTOR_STATES.has(status)) return "running";
  if (status === "完成") return "done";
  if (status === "失败") return "failed";
  if (status === "已暂停") return "paused";
  return String(status || "waiting").toLowerCase();
}

function decodeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    type: row.type,
    name: row.name,
    status: row.status,
    progress: Number(row.progress || 0),
    currentStep: row.current_step,
    input: parseJson(row.input_json),
    output: parseJson(row.output_json),
    error: row.error || "",
    revision: Number(row.revision || 1),
    requestId: row.request_id || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || "",
  };
}

export function createTaskCenterV2(baseDir, { onProgress, maxConcurrency = 3, taskStore = null } = {}) {
  const dbPath = taskStore?.dbPath || path.join(baseDir, ".data", "tasks.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      progress INTEGER NOT NULL DEFAULT 0,
      current_step TEXT NOT NULL DEFAULT '',
      input_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1,
      request_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT '',
      UNIQUE(source, source_id)
    );
    CREATE TABLE IF NOT EXISTS job_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '',
      progress INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(job_id) REFERENCES jobs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_source_status ON jobs(source, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id, id);
  `);

  const queue = new QueueManager({ maxConcurrency, onProgress });
  const getJobStmt = db.prepare("SELECT * FROM jobs WHERE id=?");
  const getSourceJobStmt = db.prepare("SELECT * FROM jobs WHERE source=? AND source_id=?");
  const insertEventStmt = db.prepare(`INSERT INTO job_events (job_id,event_type,status,progress,payload_json,created_at) VALUES (?,?,?,?,?,?)`);

  function appendEvent(jobId, eventType, status, progress, payload = {}, createdAt = new Date().toISOString()) {
    insertEventStmt.run(jobId, eventType, status || "", Math.max(0, Math.min(100, Number(progress) || 0)), JSON.stringify(payload || {}), createdAt);
  }

  function upsertJob(job, { eventType = "updated", eventPayload = {} } = {}) {
    const now = new Date().toISOString();
    const source = String(job.source || "internal");
    const sourceId = String(job.sourceId || job.id || "");
    const id = String(job.id || `${source}:${sourceId}`);
    if (!sourceId) throw new Error("job sourceId 不能为空");
    const previous = decodeJob(getSourceJobStmt.get(source, sourceId));
    const next = {
      id,
      source,
      sourceId,
      type: String(job.type || previous?.type || source),
      name: String(job.name || previous?.name || ""),
      status: String(job.status || previous?.status || "waiting"),
      progress: Math.max(0, Math.min(100, Number(job.progress ?? previous?.progress ?? 0) || 0)),
      currentStep: String(job.currentStep ?? previous?.currentStep ?? ""),
      input: job.input ?? previous?.input ?? {},
      output: job.output ?? previous?.output ?? {},
      error: String(job.error ?? previous?.error ?? ""),
      revision: Math.max(1, Number(job.revision ?? previous?.revision ?? 1) || 1),
      requestId: String(job.requestId ?? previous?.requestId ?? ""),
      createdAt: String(job.createdAt || previous?.createdAt || now),
      updatedAt: String(job.updatedAt || now),
      completedAt: String(job.completedAt || previous?.completedAt || (job.status === "done" || job.status === "failed" ? now : "")),
    };
    const changed = !previous
      || previous.type !== next.type
      || previous.name !== next.name
      || previous.status !== next.status
      || previous.progress !== next.progress
      || previous.currentStep !== next.currentStep
      || previous.error !== next.error
      || previous.revision !== next.revision
      || previous.requestId !== next.requestId
      || previous.completedAt !== next.completedAt
      || JSON.stringify(previous.input) !== JSON.stringify(next.input)
      || JSON.stringify(previous.output) !== JSON.stringify(next.output);
    if (!changed) return previous;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO jobs (id,source,source_id,type,name,status,progress,current_step,input_json,output_json,error,revision,request_id,created_at,updated_at,completed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(source,source_id) DO UPDATE SET type=excluded.type,name=excluded.name,status=excluded.status,
          progress=excluded.progress,current_step=excluded.current_step,input_json=excluded.input_json,output_json=excluded.output_json,
          error=excluded.error,revision=excluded.revision,request_id=excluded.request_id,updated_at=excluded.updated_at,completed_at=excluded.completed_at`)
        .run(next.id, next.source, next.sourceId, next.type, next.name, next.status, next.progress, next.currentStep,
          JSON.stringify(next.input), JSON.stringify(next.output), next.error, next.revision, next.requestId, next.createdAt, next.updatedAt, next.completedAt);
      appendEvent(previous?.id || next.id, previous ? eventType : "created", next.status, next.progress, eventPayload, next.updatedAt);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return decodeJob(getSourceJobStmt.get(source, sourceId));
  }

  function syncCollectorTasks() {
    if (!taskStore?.allTasks) return [];
    const tasks = taskStore.allTasks();
    const liveSourceIds = new Set(tasks.map((task) => String(task.id)));
    for (const task of tasks) {
      upsertJob({
        id: `collector:${task.id}`,
        source: "collector",
        sourceId: String(task.id),
        type: String(task.task_action || task.kind || "collector"),
        name: String(task.title || task.url || `任务 #${task.id}`),
        status: mapCollectorStatus(task.status),
        progress: Number(task.progress || 0),
        currentStep: String(task.message || ""),
        input: { legacyTaskId: task.id, url: task.url, kind: task.kind, taskAction: task.task_action },
        output: {
          videoPath: task.video_path || "",
          audioPath: task.audio_path || "",
          subtitlePath: task.subtitle_path || "",
          textPath: task.txt_path || "",
          analysisPath: task.analysis_path || "",
        },
        error: task.error || "",
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at,
      }, { eventType: "collector_sync", eventPayload: { legacyStatus: task.status } });
    }
    const staleJobs = db.prepare("SELECT * FROM jobs WHERE source='collector' AND status!='deleted'").all()
      .filter((row) => !liveSourceIds.has(String(row.source_id)));
    for (const stale of staleJobs) {
      upsertJob({ source: "collector", sourceId: stale.source_id, status: "deleted", currentStep: "source_deleted" }, {
        eventType: "deleted",
        eventPayload: { reason: "collector_source_deleted" },
      });
    }
    return tasks;
  }

  function submit(type, name, data, executor) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    upsertJob({ id: taskId, source: "internal", sourceId: taskId, type, name, status: "waiting", input: data || {} });
    void queue.enqueue(type, data, async (ctx) => {
      upsertJob({ source: "internal", sourceId: taskId, status: "running", currentStep: "started" }, { eventType: "started" });
      try {
        const result = await executor({
          ...ctx,
          onProgress(progress, step) {
            ctx.onProgress(progress, step);
            upsertJob({ source: "internal", sourceId: taskId, status: "running", progress, currentStep: step || "" }, { eventType: "progress" });
          },
        });
        upsertJob({ source: "internal", sourceId: taskId, status: "done", progress: 100, output: result || {}, completedAt: new Date().toISOString() }, { eventType: "completed" });
        return result;
      } catch (error) {
        const errorCode = inferErrorCode(error);
        const errorMeta = { errorCode, category: errorCategory(errorCode), retryable: isRetryable(errorCode) };
        upsertJob({
          source: "internal",
          sourceId: taskId,
          status: "failed",
          error: error?.message || String(error),
          output: { ...errorMeta },
          completedAt: new Date().toISOString(),
        }, { eventType: "failed", eventPayload: errorMeta });
        throw error;
      }
    }, { taskId }).catch(() => {});
    return taskId;
  }

  function getTasks({ status, source, limit = 50 } = {}) {
    syncCollectorTasks();
    const where = ["status!='deleted'"];
    const params = [];
    if (status) { where.push("status=?"); params.push(status); }
    if (source) { where.push("source=?"); params.push(source); }
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));
    const sql = `SELECT * FROM jobs${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC,id DESC LIMIT ?`;
    return db.prepare(sql).all(...params, safeLimit).map(decodeJob);
  }

  function getAllTasks(options = {}) {
    return getTasks({ ...options, limit: options.limit || 500 });
  }

  function getJobEvents(jobId, limit = 200) {
    return db.prepare("SELECT * FROM job_events WHERE job_id=? ORDER BY id ASC LIMIT ?").all(String(jobId), Math.max(1, Math.min(1000, Number(limit) || 200)))
      .map((row) => ({ ...row, progress: Number(row.progress || 0), payload: parseJson(row.payload_json) }));
  }

  function getCollectorView({ limit = 200, status = "" } = {}) {
    syncCollectorTasks();
    const tasks = taskStore?.listTasks ? taskStore.listTasks({ limit, status }) : [];
    const summary = taskStore?.summary ? taskStore.summary() : { total: tasks.length, counts: {} };
    const running = tasks.filter((task) => RUNNING_COLLECTOR_STATES.has(task.status)).length;
    return { tasks, summary, running, concurrency: queue.getStatus().maxConcurrency };
  }

  function getStats() {
    syncCollectorTasks();
    const count = (status = "") => Number(db.prepare(`SELECT COUNT(*) AS count FROM jobs WHERE status!='deleted'${status ? " AND status=?" : ""}`).get(...(status ? [status] : [])).count || 0);
    return { total: count(), waiting: count("waiting"), running: count("running"), done: count("done"), failed: count("failed"), queue: queue.getStatus() };
  }

  function recoverInterruptedJobs() {
    const now = new Date().toISOString();
    const rows = db.prepare("SELECT id,status,progress FROM jobs WHERE source='internal' AND status='running'").all();
    if (!rows.length) return 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        db.prepare("UPDATE jobs SET status='interrupted',error='service_restarted',updated_at=? WHERE id=?").run(now, row.id);
        appendEvent(row.id, "interrupted", "interrupted", row.progress, {
          reason: "service_restarted",
          errorCode: ErrorCodes.TEMPORARY_FAILURE,
          category: errorCategory(ErrorCodes.TEMPORARY_FAILURE),
          retryable: true,
        }, now);
      }
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
    return rows.length;
  }

  recoverInterruptedJobs();
  syncCollectorTasks();

  function close() {
    queue.cancelAll();
    if (queue.getStatus().running === 0) db.close();
  }

  return { dbPath, submit, upsertJob, appendEvent, getTasks, getAllTasks, getJobEvents, getCollectorView, getStats, syncCollectorTasks, recoverInterruptedJobs, queue, close };
}
