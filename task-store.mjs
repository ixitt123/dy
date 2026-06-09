import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const TASK_STATUS = {
  WAITING: "等待",
  DOWNLOADING: "下载中",
  TRANSCRIBING: "提取中",
  PAUSED: "已暂停",
  DONE: "完成",
  FAILED: "失败",
};

const STATUS_ORDER = [
  TASK_STATUS.WAITING,
  TASK_STATUS.DOWNLOADING,
  TASK_STATUS.TRANSCRIBING,
  TASK_STATUS.PAUSED,
  TASK_STATUS.DONE,
  TASK_STATUS.FAILED,
];

const COLUMNS = [
  "id",
  "kind",
  "task_action",
  "url",
  "normalized_url",
  "status",
  "progress",
  "title",
  "video_id",
  "video_path",
  "txt_path",
  "analysis_path",
  "rewrite_path",
  "comment_path",
  "stats_json",
  "ai_json",
  "rewrite_json",
  "rewrite_model",
  "rewrite_style",
  "rewrite_direction",
  "rewrite_params_json",
  "reference_examples_json",
  "humanize_level",
  "message",
  "error",
  "source_text",
  "file_hash",
  "file_size",
  "transcript_enabled",
  "analysis_enabled",
  "only_transcript",
  "created_at",
  "updated_at",
  "completed_at",
];

const TTS_JOB_COLUMNS = [
  "id",
  "task_id",
  "rewrite_id",
  "provider",
  "voice_id",
  "voice_name",
  "text",
  "emotion",
  "style_prompt",
  "speed",
  "volume",
  "pitch",
  "format",
  "audio_path",
  "status",
  "error",
  "metadata_json",
  "created_at",
  "completed_at",
];

const VOICE_COLUMNS = [
  "id",
  "provider",
  "voice_id",
  "voice_name",
  "voice_type",
  "sample_path",
  "created_at",
  "updated_at",
  "metadata_json",
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    ...row,
    progress: Number(row.progress || 0),
    file_size: Number(row.file_size || 0),
    transcript_enabled: Boolean(row.transcript_enabled),
    analysis_enabled: Boolean(row.analysis_enabled),
    only_transcript: Boolean(row.only_transcript),
  };
}

function placeholders(count) {
  return Array.from({ length: count }, () => "?").join(", ");
}

export function openTaskStore(baseDir) {
  const dataDir = path.join(baseDir, ".data");
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, "tasks.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'video',
      task_action TEXT NOT NULL DEFAULT 'download',
      url TEXT NOT NULL,
      normalized_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '等待',
      progress INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      video_id TEXT NOT NULL DEFAULT '',
      video_path TEXT NOT NULL DEFAULT '',
      txt_path TEXT NOT NULL DEFAULT '',
      analysis_path TEXT NOT NULL DEFAULT '',
      rewrite_path TEXT NOT NULL DEFAULT '',
      comment_path TEXT NOT NULL DEFAULT '',
      stats_json TEXT NOT NULL DEFAULT '{}',
      ai_json TEXT NOT NULL DEFAULT '{}',
      rewrite_json TEXT NOT NULL DEFAULT '{}',
      rewrite_model TEXT NOT NULL DEFAULT '',
      rewrite_style TEXT NOT NULL DEFAULT '',
      rewrite_direction TEXT NOT NULL DEFAULT '',
      rewrite_params_json TEXT NOT NULL DEFAULT '{}',
      reference_examples_json TEXT NOT NULL DEFAULT '[]',
      humanize_level TEXT NOT NULL DEFAULT '普通',
      message TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      source_text TEXT NOT NULL DEFAULT '',
      file_hash TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      transcript_enabled INTEGER NOT NULL DEFAULT 1,
      analysis_enabled INTEGER NOT NULL DEFAULT 1,
      only_transcript INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status_created
      ON tasks(status, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_tasks_video_id
      ON tasks(video_id);

    CREATE TABLE IF NOT EXISTS voices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      voice_id TEXT NOT NULL,
      voice_name TEXT NOT NULL DEFAULT '',
      voice_type TEXT NOT NULL DEFAULT 'preset',
      sample_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_voices_provider_voice
      ON voices(provider, voice_id);

    CREATE TABLE IF NOT EXISTS tts_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL DEFAULT 0,
      rewrite_id INTEGER NOT NULL DEFAULT 0,
      provider TEXT NOT NULL,
      voice_id TEXT NOT NULL DEFAULT '',
      voice_name TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      emotion TEXT NOT NULL DEFAULT '',
      style_prompt TEXT NOT NULL DEFAULT '',
      speed REAL NOT NULL DEFAULT 1.0,
      volume REAL NOT NULL DEFAULT 50,
      pitch REAL NOT NULL DEFAULT 1.0,
      format TEXT NOT NULL DEFAULT 'mp3',
      audio_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      error TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_tts_jobs_status_created
      ON tts_jobs(status, created_at, id);
  `);

  const taskColumns = new Set(db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name));
  if (!taskColumns.has("only_transcript")) {
    db.exec("ALTER TABLE tasks ADD COLUMN only_transcript INTEGER NOT NULL DEFAULT 0");
  }
  if (!taskColumns.has("task_action")) {
    db.exec("ALTER TABLE tasks ADD COLUMN task_action TEXT NOT NULL DEFAULT 'download'");
  }
  if (!taskColumns.has("rewrite_path")) {
    db.exec("ALTER TABLE tasks ADD COLUMN rewrite_path TEXT NOT NULL DEFAULT ''");
  }
  if (!taskColumns.has("rewrite_json")) {
    db.exec("ALTER TABLE tasks ADD COLUMN rewrite_json TEXT NOT NULL DEFAULT '{}'");
  }
  if (!taskColumns.has("rewrite_model")) {
    db.exec("ALTER TABLE tasks ADD COLUMN rewrite_model TEXT NOT NULL DEFAULT ''");
  }
  if (!taskColumns.has("rewrite_style")) {
    db.exec("ALTER TABLE tasks ADD COLUMN rewrite_style TEXT NOT NULL DEFAULT ''");
  }
  if (!taskColumns.has("rewrite_direction")) {
    db.exec("ALTER TABLE tasks ADD COLUMN rewrite_direction TEXT NOT NULL DEFAULT ''");
  }
  if (!taskColumns.has("rewrite_params_json")) {
    db.exec("ALTER TABLE tasks ADD COLUMN rewrite_params_json TEXT NOT NULL DEFAULT '{}'");
  }
  if (!taskColumns.has("reference_examples_json")) {
    db.exec("ALTER TABLE tasks ADD COLUMN reference_examples_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!taskColumns.has("humanize_level")) {
    db.exec("ALTER TABLE tasks ADD COLUMN humanize_level TEXT NOT NULL DEFAULT '普通'");
  }
  db.exec(`
    DROP INDEX IF EXISTS idx_tasks_kind_url;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_kind_action_url
      ON tasks(kind, task_action, normalized_url);
  `);

  const getByKindUrl = db.prepare("SELECT * FROM tasks WHERE kind = ? AND task_action = ? AND normalized_url = ?");
  const insertTask = db.prepare(`
    INSERT INTO tasks (
      kind, task_action, url, normalized_url, status, progress, message, source_text,
      transcript_enabled, analysis_enabled, only_transcript, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getById = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM tasks WHERE id = ?`);
  const getNextWaiting = db.prepare(`
    SELECT ${COLUMNS.join(", ")}
    FROM tasks
    WHERE status = ?
    ORDER BY datetime(created_at) ASC, id ASC
    LIMIT 1
  `);
  const listStmt = db.prepare(`
    SELECT ${COLUMNS.join(", ")}
    FROM tasks
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `);
  const listByStatusStmt = db.prepare(`
    SELECT ${COLUMNS.join(", ")}
    FROM tasks
    WHERE status = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `);
  const allStmt = db.prepare(`
    SELECT ${COLUMNS.join(", ")}
    FROM tasks
    ORDER BY datetime(created_at) DESC, id DESC
  `);
  const countStatusStmt = db.prepare("SELECT status, COUNT(*) AS count FROM tasks GROUP BY status");
  const waitingCountStmt = db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status IN (?, ?, ?)");
  const resetActiveStmt = db.prepare(`
    UPDATE tasks
    SET status = ?, progress = 0, message = ?, updated_at = ?
    WHERE status IN (?, ?)
  `);
  const completedByVideoStmt = db.prepare(`
    SELECT ${COLUMNS.join(", ")}
    FROM tasks
    WHERE video_id = ? AND status = ? AND video_path != ''
    ORDER BY datetime(updated_at) DESC, id DESC
    LIMIT 1
  `);
  const insertTtsJobStmt = db.prepare(`
    INSERT INTO tts_jobs (
      task_id, rewrite_id, provider, voice_id, voice_name, text, emotion, style_prompt,
      speed, volume, pitch, format, audio_path, status, error, metadata_json, created_at, completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getTtsJobStmt = db.prepare(`SELECT ${TTS_JOB_COLUMNS.join(", ")} FROM tts_jobs WHERE id = ?`);
  const listTtsJobsStmt = db.prepare(`
    SELECT ${TTS_JOB_COLUMNS.join(", ")}
    FROM tts_jobs
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `);
  const getVoiceStmt = db.prepare(`
    SELECT ${VOICE_COLUMNS.join(", ")}
    FROM voices
    WHERE provider = ? AND voice_id = ?
  `);
  const listVoicesStmt = db.prepare(`
    SELECT ${VOICE_COLUMNS.join(", ")}
    FROM voices
    WHERE (? = '' OR provider = ?)
    ORDER BY datetime(updated_at) DESC, id DESC
  `);
  const upsertVoiceStmt = db.prepare(`
    INSERT INTO voices (
      provider, voice_id, voice_name, voice_type, sample_path, created_at, updated_at, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, voice_id) DO UPDATE SET
      voice_name = excluded.voice_name,
      voice_type = excluded.voice_type,
      sample_path = excluded.sample_path,
      updated_at = excluded.updated_at,
      metadata_json = excluded.metadata_json
  `);

  function updateTask(id, changes) {
    const entries = Object.entries(changes).filter(([key]) => COLUMNS.includes(key) && key !== "id");
    if (entries.length === 0) return getTask(id);

    const setSql = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([, value]) => {
      if (typeof value === "boolean") return value ? 1 : 0;
      return value ?? "";
    });
    values.push(nowIso(), id);
    db.prepare(`UPDATE tasks SET ${setSql}, updated_at = ? WHERE id = ?`).run(...values);
    return getTask(id);
  }

  function getTask(id) {
    return normalizeRow(getById.get(Number(id)));
  }

  function importTasks(items) {
    const summary = {
      requested: items.length,
      inserted: 0,
      duplicate: 0,
      skippedDownloaded: 0,
      invalid: 0,
      tasks: [],
      duplicates: [],
    };

    const createdAt = nowIso();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of items) {
        if (!item?.normalizedUrl || !item?.url) {
          summary.invalid += 1;
          continue;
        }

        const kind = item.kind || "video";
        const taskAction = item.taskAction || "download";
        const existing = normalizeRow(getByKindUrl.get(kind, taskAction, item.normalizedUrl));
        if (existing) {
          const hasDownloadedFile = existing.video_path && fs.existsSync(existing.video_path);
          if (existing.status === TASK_STATUS.DONE && hasDownloadedFile) {
            summary.skippedDownloaded += 1;
          } else {
            summary.duplicate += 1;
          }
          summary.duplicates.push(existing);
          continue;
        }

        const result = insertTask.run(
          kind,
          item.taskAction || "download",
          item.url,
          item.normalizedUrl,
          TASK_STATUS.WAITING,
          0,
          "等待处理",
          item.sourceText || item.url,
          item.transcriptEnabled ? 1 : 0,
          item.analysisEnabled ? 1 : 0,
          item.onlyTranscript ? 1 : 0,
          createdAt,
          createdAt
        );
        const task = getTask(Number(result.lastInsertRowid));
        summary.inserted += 1;
        summary.tasks.push(task);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return summary;
  }

  function claimNextTask() {
    const row = normalizeRow(getNextWaiting.get(TASK_STATUS.WAITING));
    if (!row) return null;
    return updateTask(row.id, {
      status: TASK_STATUS.DOWNLOADING,
      progress: Math.max(row.progress, 1),
      message: "准备下载",
      error: "",
    });
  }

  function listTasks({ limit = 200, status = "" } = {}) {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
    const rows = status ? listByStatusStmt.all(status, safeLimit) : listStmt.all(safeLimit);
    return rows.map(normalizeRow);
  }

  function allTasks() {
    return allStmt.all().map(normalizeRow);
  }

  function summary() {
    const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));
    for (const row of countStatusStmt.all()) {
      counts[row.status] = Number(row.count || 0);
    }
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return { total, counts };
  }

  function hasPendingWork() {
    const row = waitingCountStmt.get(TASK_STATUS.WAITING, TASK_STATUS.DOWNLOADING, TASK_STATUS.TRANSCRIBING);
    return Number(row?.count || 0) > 0;
  }

  function resetActiveTasks() {
    resetActiveStmt.run(
      TASK_STATUS.WAITING,
      "上次运行中断，已重新排队",
      nowIso(),
      TASK_STATUS.DOWNLOADING,
      TASK_STATUS.TRANSCRIBING
    );
  }

  function findCompletedByVideoId(videoId) {
    if (!videoId) return null;
    return normalizeRow(completedByVideoStmt.get(videoId, TASK_STATUS.DONE));
  }

  function normalizeTtsJob(row) {
    if (!row) return null;
    return {
      ...row,
      task_id: Number(row.task_id || 0),
      rewrite_id: Number(row.rewrite_id || 0),
      speed: Number(row.speed || 1),
      volume: Number(row.volume ?? 50),
      pitch: Number(row.pitch || 1),
    };
  }

  function createTtsJob(input) {
    const createdAt = nowIso();
    const result = insertTtsJobStmt.run(
      Number(input.task_id || 0),
      Number(input.rewrite_id || 0),
      String(input.provider || ""),
      String(input.voice_id || ""),
      String(input.voice_name || ""),
      String(input.text || ""),
      String(input.emotion || ""),
      String(input.style_prompt || ""),
      Number(input.speed || 1),
      Number(input.volume ?? 50),
      Number(input.pitch || 1),
      String(input.format || "mp3"),
      String(input.audio_path || ""),
      String(input.status || "waiting"),
      String(input.error || ""),
      String(input.metadata_json || "{}"),
      createdAt,
      String(input.completed_at || "")
    );
    return getTtsJob(Number(result.lastInsertRowid));
  }

  function getTtsJob(id) {
    return normalizeTtsJob(getTtsJobStmt.get(Number(id)));
  }

  function updateTtsJob(id, changes) {
    const entries = Object.entries(changes).filter(([key]) => TTS_JOB_COLUMNS.includes(key) && key !== "id");
    if (entries.length === 0) return getTtsJob(id);
    const sql = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([, value]) => value ?? "");
    db.prepare(`UPDATE tts_jobs SET ${sql} WHERE id = ?`).run(...values, Number(id));
    return getTtsJob(id);
  }

  function listTtsJobs({ limit = 50 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));
    return listTtsJobsStmt.all(safeLimit).map(normalizeTtsJob);
  }

  function upsertVoice(input) {
    const timestamp = nowIso();
    upsertVoiceStmt.run(
      String(input.provider || ""),
      String(input.voice_id || ""),
      String(input.voice_name || ""),
      String(input.voice_type || "preset"),
      String(input.sample_path || ""),
      timestamp,
      timestamp,
      String(input.metadata_json || "{}")
    );
    return getVoiceStmt.get(String(input.provider || ""), String(input.voice_id || ""));
  }

  function listVoices({ provider = "" } = {}) {
    const selectedProvider = String(provider || "");
    return listVoicesStmt.all(selectedProvider, selectedProvider);
  }

  function deleteTasks(ids) {
    const values = ids.map((id) => Number(id)).filter(Number.isFinite);
    if (values.length === 0) return 0;
    const result = db.prepare(`
      DELETE FROM tasks
      WHERE id IN (${placeholders(values.length)})
        AND status NOT IN (?, ?)
    `).run(...values, TASK_STATUS.DOWNLOADING, TASK_STATUS.TRANSCRIBING);
    return Number(result.changes || 0);
  }

  function clearDoneAndFailed() {
    const result = db
      .prepare("DELETE FROM tasks WHERE status IN (?, ?)")
      .run(TASK_STATUS.DONE, TASK_STATUS.FAILED);
    return Number(result.changes || 0);
  }

  function clearTaskList() {
    const result = db
      .prepare("DELETE FROM tasks WHERE status NOT IN (?, ?)")
      .run(TASK_STATUS.DOWNLOADING, TASK_STATUS.TRANSCRIBING);
    return Number(result.changes || 0);
  }

  return {
    dbPath,
    updateTask,
    getTask,
    importTasks,
    claimNextTask,
    listTasks,
    allTasks,
    summary,
    hasPendingWork,
    resetActiveTasks,
    findCompletedByVideoId,
    deleteTasks,
    clearDoneAndFailed,
    clearTaskList,
    createTtsJob,
    getTtsJob,
    updateTtsJob,
    listTtsJobs,
    upsertVoice,
    listVoices,
  };
}
