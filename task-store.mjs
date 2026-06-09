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
  "description",
  "tags_json",
  "sample_path",
  "preview_path",
  "is_favorite",
  "is_default",
  "use_count",
  "last_used_at",
  "version",
  "parent_voice_id",
  "status",
  "archived",
  "created_at",
  "updated_at",
  "metadata_json",
];

const VOICE_TEST_COLUMNS = [
  "id",
  "voice_asset_id",
  "test_type",
  "test_name",
  "script",
  "emotion",
  "tts_job_id",
  "audio_path",
  "status",
  "error",
  "metadata_json",
  "created_at",
  "completed_at",
];

const VOICE_RATING_COLUMNS = [
  "id",
  "voice_asset_id",
  "voice_test_id",
  "score",
  "stars",
  "notes",
  "created_at",
  "updated_at",
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
      description TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      sample_path TEXT NOT NULL DEFAULT '',
      preview_path TEXT NOT NULL DEFAULT '',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      parent_voice_id INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_voices_provider_voice
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

    CREATE TABLE IF NOT EXISTS voice_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voice_asset_id INTEGER NOT NULL,
      test_type TEXT NOT NULL,
      test_name TEXT NOT NULL DEFAULT '',
      script TEXT NOT NULL,
      emotion TEXT NOT NULL DEFAULT '自然',
      tts_job_id INTEGER NOT NULL DEFAULT 0,
      audio_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      error TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_voice_tests_asset_created
      ON voice_tests(voice_asset_id, created_at, id);

    CREATE TABLE IF NOT EXISTS voice_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voice_asset_id INTEGER NOT NULL,
      voice_test_id INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      stars INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_ratings_asset_test
      ON voice_ratings(voice_asset_id, voice_test_id);
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

  const voiceColumns = new Set(db.prepare("PRAGMA table_info(voices)").all().map((column) => column.name));
  const voiceMigrations = [
    ["description", "TEXT NOT NULL DEFAULT ''"],
    ["tags_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["preview_path", "TEXT NOT NULL DEFAULT ''"],
    ["is_favorite", "INTEGER NOT NULL DEFAULT 0"],
    ["is_default", "INTEGER NOT NULL DEFAULT 0"],
    ["use_count", "INTEGER NOT NULL DEFAULT 0"],
    ["last_used_at", "TEXT NOT NULL DEFAULT ''"],
    ["version", "INTEGER NOT NULL DEFAULT 1"],
    ["parent_voice_id", "INTEGER NOT NULL DEFAULT 0"],
    ["status", "TEXT NOT NULL DEFAULT 'active'"],
    ["archived", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [column, definition] of voiceMigrations) {
    if (!voiceColumns.has(column)) db.exec(`ALTER TABLE voices ADD COLUMN ${column} ${definition}`);
  }
  db.exec(`
    DROP INDEX IF EXISTS idx_tasks_kind_url;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_kind_action_url
      ON tasks(kind, task_action, normalized_url);
    DROP INDEX IF EXISTS idx_voices_provider_voice;
    CREATE INDEX IF NOT EXISTS idx_voices_provider_voice
      ON voices(provider, voice_id);
    CREATE INDEX IF NOT EXISTS idx_voices_default_recent
      ON voices(is_default, last_used_at, updated_at);
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
    ORDER BY version DESC, id DESC
    LIMIT 1
  `);
  const getVoiceByIdStmt = db.prepare(`SELECT ${VOICE_COLUMNS.join(", ")} FROM voices WHERE id = ?`);
  const listVoicesStmt = db.prepare(`
    SELECT ${VOICE_COLUMNS.join(", ")}
    FROM voices
    WHERE archived = 0 AND (? = '' OR provider = ?)
    ORDER BY is_default DESC, datetime(last_used_at) DESC, datetime(updated_at) DESC, id DESC
  `);
  const insertVoiceStmt = db.prepare(`
    INSERT INTO voices (
      provider, voice_id, voice_name, voice_type, description, tags_json, sample_path, preview_path,
      is_favorite, is_default, use_count, last_used_at, version, parent_voice_id, status, archived,
      created_at, updated_at, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listVoiceTestsStmt = db.prepare(`
    SELECT ${VOICE_TEST_COLUMNS.join(", ")}
    FROM voice_tests
    WHERE (? = 0 OR voice_asset_id = ?)
    ORDER BY datetime(created_at) DESC, id DESC
  `);
  const getVoiceTestStmt = db.prepare(`SELECT ${VOICE_TEST_COLUMNS.join(", ")} FROM voice_tests WHERE id = ?`);
  const insertVoiceTestStmt = db.prepare(`
    INSERT INTO voice_tests (
      voice_asset_id, test_type, test_name, script, emotion, tts_job_id, audio_path,
      status, error, metadata_json, created_at, completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listVoiceRatingsStmt = db.prepare(`
    SELECT ${VOICE_RATING_COLUMNS.join(", ")}
    FROM voice_ratings
    WHERE (? = 0 OR voice_asset_id = ?)
    ORDER BY datetime(updated_at) DESC, id DESC
  `);
  const getVoiceRatingStmt = db.prepare(`
    SELECT ${VOICE_RATING_COLUMNS.join(", ")}
    FROM voice_ratings
    WHERE voice_asset_id = ? AND voice_test_id = ?
  `);
  const insertVoiceRatingStmt = db.prepare(`
    INSERT INTO voice_ratings (
      voice_asset_id, voice_test_id, score, stars, notes, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
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

  function normalizeVoice(row) {
    if (!row) return null;
    return {
      ...row,
      is_favorite: Boolean(row.is_favorite),
      is_default: Boolean(row.is_default),
      archived: Boolean(row.archived),
      use_count: Number(row.use_count || 0),
      version: Number(row.version || 1),
      parent_voice_id: Number(row.parent_voice_id || 0),
    };
  }

  function createVoiceAsset(input) {
    const timestamp = nowIso();
    const result = insertVoiceStmt.run(
      String(input.provider || ""),
      String(input.voice_id || ""),
      String(input.voice_name || ""),
      String(input.voice_type || "clone"),
      String(input.description || ""),
      String(input.tags_json || "[]"),
      String(input.sample_path || ""),
      String(input.preview_path || ""),
      input.is_favorite ? 1 : 0,
      input.is_default ? 1 : 0,
      Number(input.use_count || 0),
      String(input.last_used_at || ""),
      Math.max(1, Number(input.version || 1)),
      Number(input.parent_voice_id || 0),
      String(input.status || "active"),
      input.archived ? 1 : 0,
      timestamp,
      timestamp,
      String(input.metadata_json || "{}")
    );
    if (input.is_default) setDefaultVoice(Number(result.lastInsertRowid));
    return getVoiceAsset(Number(result.lastInsertRowid));
  }

  function getVoiceAsset(id) {
    return normalizeVoice(getVoiceByIdStmt.get(Number(id)));
  }

  function upsertVoice(input) {
    const provider = String(input.provider || "");
    const voiceId = String(input.voice_id || "");
    const existing = normalizeVoice(getVoiceStmt.get(provider, voiceId));
    if (existing && existing.voice_type === "preset") {
      return updateVoiceAsset(existing.id, {
        voice_name: String(input.voice_name || existing.voice_name),
        metadata_json: String(input.metadata_json || existing.metadata_json || "{}"),
        status: String(input.status || existing.status || "active"),
      });
    }
    return createVoiceAsset(input);
  }

  function listVoices({ provider = "" } = {}) {
    const selectedProvider = String(provider || "");
    return listVoicesStmt.all(selectedProvider, selectedProvider).map(normalizeVoice);
  }

  function updateVoiceAsset(id, changes) {
    const entries = Object.entries(changes).filter(([key]) => VOICE_COLUMNS.includes(key) && !["id", "created_at"].includes(key));
    if (entries.length === 0) return getVoiceAsset(id);
    const sql = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([key, value]) => {
      if (["is_favorite", "is_default", "archived"].includes(key)) return value ? 1 : 0;
      return value ?? "";
    });
    values.push(nowIso(), Number(id));
    db.prepare(`UPDATE voices SET ${sql}, updated_at = ? WHERE id = ?`).run(...values);
    return getVoiceAsset(id);
  }

  function setDefaultVoice(id) {
    const voiceId = Number(id);
    const timestamp = nowIso();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE voices SET is_default = 0, updated_at = ? WHERE is_default != 0").run(timestamp);
      if (voiceId > 0) {
        db.prepare("UPDATE voices SET is_default = 1, archived = 0, updated_at = ? WHERE id = ?").run(timestamp, voiceId);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return voiceId > 0 ? getVoiceAsset(voiceId) : null;
  }

  function getDefaultVoice() {
    return normalizeVoice(db.prepare(`
      SELECT ${VOICE_COLUMNS.join(", ")}
      FROM voices
      WHERE is_default = 1 AND archived = 0
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT 1
    `).get());
  }

  function recordVoiceUse(id) {
    const voiceId = Number(id);
    db.prepare(`
      UPDATE voices
      SET use_count = use_count + 1, last_used_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), nowIso(), voiceId);
    return getVoiceAsset(voiceId);
  }

  function createVoiceTest(input) {
    const createdAt = nowIso();
    const result = insertVoiceTestStmt.run(
      Number(input.voice_asset_id || 0),
      String(input.test_type || ""),
      String(input.test_name || ""),
      String(input.script || ""),
      String(input.emotion || "自然"),
      Number(input.tts_job_id || 0),
      String(input.audio_path || ""),
      String(input.status || "waiting"),
      String(input.error || ""),
      String(input.metadata_json || "{}"),
      createdAt,
      String(input.completed_at || "")
    );
    return getVoiceTest(Number(result.lastInsertRowid));
  }

  function getVoiceTest(id) {
    return getVoiceTestStmt.get(Number(id)) || null;
  }

  function updateVoiceTest(id, changes) {
    const entries = Object.entries(changes).filter(([key]) => VOICE_TEST_COLUMNS.includes(key) && !["id", "created_at"].includes(key));
    if (entries.length === 0) return getVoiceTest(id);
    const sql = entries.map(([key]) => `${key} = ?`).join(", ");
    db.prepare(`UPDATE voice_tests SET ${sql} WHERE id = ?`).run(...entries.map(([, value]) => value ?? ""), Number(id));
    return getVoiceTest(id);
  }

  function listVoiceTests({ voiceAssetId = 0 } = {}) {
    const id = Number(voiceAssetId || 0);
    return listVoiceTestsStmt.all(id, id);
  }

  function saveVoiceRating(input) {
    const voiceAssetId = Number(input.voice_asset_id || 0);
    const voiceTestId = Number(input.voice_test_id || 0);
    const score = Math.max(0, Math.min(100, Math.round(Number(input.score || 0))));
    const stars = Math.max(1, Math.min(5, Math.round(Number(input.stars || 1))));
    const existing = getVoiceRatingStmt.get(voiceAssetId, voiceTestId);
    const timestamp = nowIso();
    if (existing) {
      db.prepare(`
        UPDATE voice_ratings
        SET score = ?, stars = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(score, stars, String(input.notes || ""), timestamp, existing.id);
      return getVoiceRatingStmt.get(voiceAssetId, voiceTestId);
    }
    insertVoiceRatingStmt.run(
      voiceAssetId,
      voiceTestId,
      score,
      stars,
      String(input.notes || ""),
      timestamp,
      timestamp
    );
    return getVoiceRatingStmt.get(voiceAssetId, voiceTestId);
  }

  function listVoiceRatings({ voiceAssetId = 0 } = {}) {
    const id = Number(voiceAssetId || 0);
    return listVoiceRatingsStmt.all(id, id);
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
    createVoiceAsset,
    getVoiceAsset,
    upsertVoice,
    listVoices,
    updateVoiceAsset,
    setDefaultVoice,
    getDefaultVoice,
    recordVoiceUse,
    createVoiceTest,
    getVoiceTest,
    updateVoiceTest,
    listVoiceTests,
    saveVoiceRating,
    listVoiceRatings,
  };
}
