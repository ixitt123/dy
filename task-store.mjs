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

const DIRECTOR_PROJECT_COLUMNS = [
  "id",
  "task_id",
  "rewrite_id",
  "title",
  "source_text",
  "video_type",
  "visual_style",
  "platform",
  "pace",
  "estimated_duration",
  "storyboard_path",
  "status",
  "score",
  "created_at",
  "updated_at",
  "metadata_json",
];

const DIRECTOR_SCENE_COLUMNS = [
  "id",
  "project_id",
  "scene_index",
  "duration",
  "purpose",
  "emotion",
  "voice_text",
  "subtitle",
  "visual_style",
  "camera",
  "composition",
  "image_prompt",
  "motion_prompt",
  "bgm",
  "sfx",
  "transition",
  "asset_type",
  "metadata_json",
];

const ASSET_PROJECT_COLUMNS = [
  "id",
  "director_project_id",
  "vfo_project_id",
  "title",
  "platform",
  "storyboard_path",
  "asset_plan_path",
  "package_path",
  "status",
  "score",
  "created_at",
  "updated_at",
  "metadata_json",
];

const ASSET_SCENE_COLUMNS = [
  "id",
  "project_id",
  "scene_index",
  "purpose",
  "asset_type",
  "asset_subtype",
  "reason",
  "generation_method",
  "image_prompt",
  "negative_prompt",
  "motion_prompt",
  "platform_fit_json",
  "aesthetic_score",
  "readiness_score",
  "render_ready",
  "metadata_json",
];

const ASSET_REVIEW_COLUMNS = [
  "id",
  "project_id",
  "review_type",
  "score",
  "material_score",
  "shot_score",
  "communication_score",
  "aesthetic_risk_score",
  "ai_risk_score",
  "problems_json",
  "fixes_json",
  "created_at",
  "updated_at",
  "metadata_json",
];

const VFO_PROJECT_COLUMNS = [
  "id",
  "director_project_id",
  "asset_project_id",
  "title",
  "platform",
  "storyboard_path",
  "render_plan_path",
  "status",
  "score",
  "created_at",
  "updated_at",
  "metadata_json",
];

const VFO_SCENE_COLUMNS = [
  "id",
  "project_id",
  "scene_index",
  "asset_type",
  "generation_strategy",
  "render_strategy",
  "qa_checks_json",
  "platform_fit_json",
  "readiness_score",
  "metadata_json",
];

const VFO_REVIEW_COLUMNS = [
  "id",
  "project_id",
  "score",
  "communication_score",
  "aesthetic_score",
  "information_density_score",
  "platform_fit_score",
  "ai_flavor_score",
  "problems_json",
  "fixes_json",
  "created_at",
  "updated_at",
  "metadata_json",
];

const TIMELINE_PROJECT_COLUMNS = [
  "id",
  "source_director_project_id",
  "audio_asset_id",
  "platform",
  "ratio",
  "resolution",
  "fps",
  "duration",
  "tracks_json",
  "output_type",
  "status",
  "progress",
  "current_step",
  "output_dir",
  "timeline_path",
  "srt_path",
  "manifest_path",
  "draft_path",
  "mp4_path",
  "blockers_json",
  "error",
  "created_at",
  "updated_at",
  "completed_at",
  "metadata_json",
];

const TIMELINE_SCENE_COLUMNS = [
  "id",
  "project_id",
  "scene_index",
  "narration_text",
  "subtitle_text",
  "start_time",
  "end_time",
  "duration",
  "image_asset_id",
  "image_path",
  "motion_type",
  "transition_type",
  "title_text",
  "visual_prompt",
  "status",
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

    CREATE TABLE IF NOT EXISTS director_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL DEFAULT 0,
      rewrite_id INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      source_text TEXT NOT NULL,
      video_type TEXT NOT NULL DEFAULT '',
      visual_style TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      pace TEXT NOT NULL DEFAULT '',
      estimated_duration REAL NOT NULL DEFAULT 30,
      storyboard_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      score INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_director_projects_status_created
      ON director_projects(status, created_at, id);

    CREATE TABLE IF NOT EXISTS director_scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      scene_index INTEGER NOT NULL,
      duration REAL NOT NULL DEFAULT 0,
      purpose TEXT NOT NULL DEFAULT '',
      emotion TEXT NOT NULL DEFAULT '',
      voice_text TEXT NOT NULL DEFAULT '',
      subtitle TEXT NOT NULL DEFAULT '',
      visual_style TEXT NOT NULL DEFAULT '',
      camera TEXT NOT NULL DEFAULT '',
      composition TEXT NOT NULL DEFAULT '',
      image_prompt TEXT NOT NULL DEFAULT '',
      motion_prompt TEXT NOT NULL DEFAULT '',
      bgm TEXT NOT NULL DEFAULT '',
      sfx TEXT NOT NULL DEFAULT '',
      transition TEXT NOT NULL DEFAULT '',
      asset_type TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_director_scenes_project_scene
      ON director_scenes(project_id, scene_index);

    CREATE TABLE IF NOT EXISTS asset_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      director_project_id INTEGER NOT NULL DEFAULT 0,
      vfo_project_id INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      storyboard_path TEXT NOT NULL DEFAULT '',
      asset_plan_path TEXT NOT NULL DEFAULT '',
      package_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      score INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_asset_projects_status_created
      ON asset_projects(status, created_at, id);

    CREATE TABLE IF NOT EXISTS asset_scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      scene_index INTEGER NOT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      asset_type TEXT NOT NULL DEFAULT '',
      asset_subtype TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      generation_method TEXT NOT NULL DEFAULT '',
      image_prompt TEXT NOT NULL DEFAULT '',
      negative_prompt TEXT NOT NULL DEFAULT '',
      motion_prompt TEXT NOT NULL DEFAULT '',
      platform_fit_json TEXT NOT NULL DEFAULT '{}',
      aesthetic_score INTEGER NOT NULL DEFAULT 0,
      readiness_score INTEGER NOT NULL DEFAULT 0,
      render_ready INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_scenes_project_scene
      ON asset_scenes(project_id, scene_index);

    CREATE TABLE IF NOT EXISTS asset_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      review_type TEXT NOT NULL DEFAULT 'asset_review',
      score INTEGER NOT NULL DEFAULT 0,
      material_score INTEGER NOT NULL DEFAULT 0,
      shot_score INTEGER NOT NULL DEFAULT 0,
      communication_score INTEGER NOT NULL DEFAULT 0,
      aesthetic_risk_score INTEGER NOT NULL DEFAULT 0,
      ai_risk_score INTEGER NOT NULL DEFAULT 0,
      problems_json TEXT NOT NULL DEFAULT '[]',
      fixes_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_reviews_project_type
      ON asset_reviews(project_id, review_type);

    CREATE TABLE IF NOT EXISTS vfo_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      director_project_id INTEGER NOT NULL DEFAULT 0,
      asset_project_id INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      storyboard_path TEXT NOT NULL DEFAULT '',
      render_plan_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      score INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_vfo_projects_status_created
      ON vfo_projects(status, created_at, id);

    CREATE TABLE IF NOT EXISTS vfo_scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      scene_index INTEGER NOT NULL,
      asset_type TEXT NOT NULL DEFAULT '',
      generation_strategy TEXT NOT NULL DEFAULT '',
      render_strategy TEXT NOT NULL DEFAULT '',
      qa_checks_json TEXT NOT NULL DEFAULT '[]',
      platform_fit_json TEXT NOT NULL DEFAULT '{}',
      readiness_score INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_vfo_scenes_project_scene
      ON vfo_scenes(project_id, scene_index);

    CREATE TABLE IF NOT EXISTS vfo_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      communication_score INTEGER NOT NULL DEFAULT 0,
      aesthetic_score INTEGER NOT NULL DEFAULT 0,
      information_density_score INTEGER NOT NULL DEFAULT 0,
      platform_fit_score INTEGER NOT NULL DEFAULT 0,
      ai_flavor_score INTEGER NOT NULL DEFAULT 0,
      problems_json TEXT NOT NULL DEFAULT '[]',
      fixes_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_vfo_reviews_project
      ON vfo_reviews(project_id);

    CREATE TABLE IF NOT EXISTS timeline_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_director_project_id INTEGER NOT NULL DEFAULT 0,
      audio_asset_id INTEGER NOT NULL DEFAULT 0,
      platform TEXT NOT NULL DEFAULT 'douyin',
      ratio TEXT NOT NULL DEFAULT '9:16',
      resolution TEXT NOT NULL DEFAULT '1080x1920',
      fps INTEGER NOT NULL DEFAULT 30,
      duration REAL NOT NULL DEFAULT 0,
      tracks_json TEXT NOT NULL DEFAULT '{}',
      output_type TEXT NOT NULL DEFAULT 'jianying',
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      current_step TEXT NOT NULL DEFAULT '',
      output_dir TEXT NOT NULL DEFAULT '',
      timeline_path TEXT NOT NULL DEFAULT '',
      srt_path TEXT NOT NULL DEFAULT '',
      manifest_path TEXT NOT NULL DEFAULT '',
      draft_path TEXT NOT NULL DEFAULT '',
      mp4_path TEXT NOT NULL DEFAULT '',
      blockers_json TEXT NOT NULL DEFAULT '[]',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_projects_status_created
      ON timeline_projects(status, created_at, id);

    CREATE TABLE IF NOT EXISTS timeline_scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      scene_index INTEGER NOT NULL,
      narration_text TEXT NOT NULL DEFAULT '',
      subtitle_text TEXT NOT NULL DEFAULT '',
      start_time REAL NOT NULL DEFAULT 0,
      end_time REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      image_asset_id TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL DEFAULT '',
      motion_type TEXT NOT NULL DEFAULT '',
      transition_type TEXT NOT NULL DEFAULT '',
      title_text TEXT NOT NULL DEFAULT '',
      visual_prompt TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_scenes_project_scene
      ON timeline_scenes(project_id, scene_index);
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
  const getDirectorProjectStmt = db.prepare(`
    SELECT ${DIRECTOR_PROJECT_COLUMNS.join(", ")}
    FROM director_projects
    WHERE id = ?
  `);
  const listDirectorProjectsStmt = db.prepare(`
    SELECT ${DIRECTOR_PROJECT_COLUMNS.join(", ")}
    FROM director_projects
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `);
  const insertDirectorProjectStmt = db.prepare(`
    INSERT INTO director_projects (
      task_id, rewrite_id, title, source_text, video_type, visual_style, platform, pace,
      estimated_duration, storyboard_path, status, score, created_at, updated_at, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listDirectorScenesStmt = db.prepare(`
    SELECT ${DIRECTOR_SCENE_COLUMNS.join(", ")}
    FROM director_scenes
    WHERE project_id = ?
    ORDER BY scene_index ASC, id ASC
  `);
  const insertDirectorSceneStmt = db.prepare(`
    INSERT INTO director_scenes (
      project_id, scene_index, duration, purpose, emotion, voice_text, subtitle, visual_style,
      camera, composition, image_prompt, motion_prompt, bgm, sfx, transition, asset_type, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getAssetProjectStmt = db.prepare(`
    SELECT ${ASSET_PROJECT_COLUMNS.join(", ")}
    FROM asset_projects
    WHERE id = ?
  `);
  const listAssetProjectsStmt = db.prepare(`
    SELECT ${ASSET_PROJECT_COLUMNS.join(", ")}
    FROM asset_projects
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `);
  const insertAssetProjectStmt = db.prepare(`
    INSERT INTO asset_projects (
      director_project_id, vfo_project_id, title, platform, storyboard_path,
      asset_plan_path, package_path, status, score, created_at, updated_at, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listAssetScenesStmt = db.prepare(`
    SELECT ${ASSET_SCENE_COLUMNS.join(", ")}
    FROM asset_scenes
    WHERE project_id = ?
    ORDER BY scene_index ASC, id ASC
  `);
  const insertAssetSceneStmt = db.prepare(`
    INSERT INTO asset_scenes (
      project_id, scene_index, purpose, asset_type, asset_subtype, reason,
      generation_method, image_prompt, negative_prompt, motion_prompt,
      platform_fit_json, aesthetic_score, readiness_score, render_ready, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getAssetReviewStmt = db.prepare(`
    SELECT ${ASSET_REVIEW_COLUMNS.join(", ")}
    FROM asset_reviews
    WHERE project_id = ? AND review_type = ?
  `);
  const listAssetReviewsStmt = db.prepare(`
    SELECT ${ASSET_REVIEW_COLUMNS.join(", ")}
    FROM asset_reviews
    WHERE project_id = ?
    ORDER BY datetime(updated_at) DESC, id DESC
  `);
  const insertAssetReviewStmt = db.prepare(`
    INSERT INTO asset_reviews (
      project_id, review_type, score, material_score, shot_score, communication_score,
      aesthetic_risk_score, ai_risk_score, problems_json, fixes_json,
      created_at, updated_at, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getVfoProjectStmt = db.prepare(`
    SELECT ${VFO_PROJECT_COLUMNS.join(", ")}
    FROM vfo_projects
    WHERE id = ?
  `);
  const listVfoProjectsStmt = db.prepare(`
    SELECT ${VFO_PROJECT_COLUMNS.join(", ")}
    FROM vfo_projects
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `);
  const insertVfoProjectStmt = db.prepare(`
    INSERT INTO vfo_projects (
      director_project_id, asset_project_id, title, platform, storyboard_path,
      render_plan_path, status, score, created_at, updated_at, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listVfoScenesStmt = db.prepare(`
    SELECT ${VFO_SCENE_COLUMNS.join(", ")}
    FROM vfo_scenes
    WHERE project_id = ?
    ORDER BY scene_index ASC, id ASC
  `);
  const insertVfoSceneStmt = db.prepare(`
    INSERT INTO vfo_scenes (
      project_id, scene_index, asset_type, generation_strategy, render_strategy,
      qa_checks_json, platform_fit_json, readiness_score, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getVfoReviewStmt = db.prepare(`
    SELECT ${VFO_REVIEW_COLUMNS.join(", ")}
    FROM vfo_reviews
    WHERE project_id = ?
  `);
  const insertVfoReviewStmt = db.prepare(`
    INSERT INTO vfo_reviews (
      project_id, score, communication_score, aesthetic_score, information_density_score,
      platform_fit_score, ai_flavor_score, problems_json, fixes_json,
      created_at, updated_at, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getTimelineProjectStmt = db.prepare(`
    SELECT ${TIMELINE_PROJECT_COLUMNS.join(", ")}
    FROM timeline_projects
    WHERE id = ?
  `);
  const listTimelineProjectsStmt = db.prepare(`
    SELECT ${TIMELINE_PROJECT_COLUMNS.join(", ")}
    FROM timeline_projects
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `);
  const insertTimelineProjectStmt = db.prepare(`
    INSERT INTO timeline_projects (
      source_director_project_id, audio_asset_id, platform, ratio, resolution, fps,
      duration, tracks_json, output_type, status, progress, current_step, output_dir,
      timeline_path, srt_path, manifest_path, draft_path, mp4_path, blockers_json,
      error, created_at, updated_at, completed_at, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listTimelineScenesStmt = db.prepare(`
    SELECT ${TIMELINE_SCENE_COLUMNS.join(", ")}
    FROM timeline_scenes
    WHERE project_id = ?
    ORDER BY scene_index ASC, id ASC
  `);
  const insertTimelineSceneStmt = db.prepare(`
    INSERT INTO timeline_scenes (
      project_id, scene_index, narration_text, subtitle_text, start_time, end_time,
      duration, image_asset_id, image_path, motion_type, transition_type, title_text,
      visual_prompt, status, metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  function deleteTtsJobs(ids = []) {
    const values = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    if (!values.length) return 0;
    const result = db.prepare(`DELETE FROM tts_jobs WHERE id IN (${placeholders(values.length)})`).run(...values);
    return Number(result.changes || 0);
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

  function deleteVoiceAsset(id) {
    const voiceId = Number(id || 0);
    if (!voiceId) return 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM voice_ratings WHERE voice_asset_id = ?").run(voiceId);
      db.prepare("DELETE FROM voice_tests WHERE voice_asset_id = ?").run(voiceId);
      const result = db.prepare("DELETE FROM voices WHERE id = ?").run(voiceId);
      db.exec("COMMIT");
      return Number(result.changes || 0);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
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

  function normalizeDirectorProject(row) {
    if (!row) return null;
    return {
      ...row,
      task_id: Number(row.task_id || 0),
      rewrite_id: Number(row.rewrite_id || 0),
      estimated_duration: Number(row.estimated_duration || 0),
      score: Number(row.score || 0),
    };
  }

  function normalizeDirectorScene(row) {
    if (!row) return null;
    return {
      ...row,
      project_id: Number(row.project_id || 0),
      scene_index: Number(row.scene_index || 0),
      duration: Number(row.duration || 0),
    };
  }

  function createDirectorProject(input) {
    const timestamp = nowIso();
    const result = insertDirectorProjectStmt.run(
      Number(input.task_id || 0),
      Number(input.rewrite_id || 0),
      String(input.title || ""),
      String(input.source_text || ""),
      String(input.video_type || ""),
      String(input.visual_style || ""),
      String(input.platform || ""),
      String(input.pace || ""),
      Number(input.estimated_duration || 30),
      String(input.storyboard_path || ""),
      String(input.status || "waiting"),
      Number(input.score || 0),
      timestamp,
      timestamp,
      String(input.metadata_json || "{}")
    );
    return getDirectorProject(Number(result.lastInsertRowid));
  }

  function getDirectorProject(id) {
    return normalizeDirectorProject(getDirectorProjectStmt.get(Number(id)));
  }

  function updateDirectorProject(id, changes) {
    const entries = Object.entries(changes).filter(([key]) => (
      DIRECTOR_PROJECT_COLUMNS.includes(key) && !["id", "created_at", "updated_at"].includes(key)
    ));
    if (entries.length === 0) return getDirectorProject(id);
    const sql = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([, value]) => value ?? "");
    values.push(nowIso(), Number(id));
    db.prepare(`UPDATE director_projects SET ${sql}, updated_at = ? WHERE id = ?`).run(...values);
    return getDirectorProject(id);
  }

  function listDirectorProjects({ limit = 50 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));
    return listDirectorProjectsStmt.all(safeLimit).map(normalizeDirectorProject);
  }

  function deleteDirectorProjects(ids = []) {
    const values = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    if (!values.length) return 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      const marks = placeholders(values.length);
      db.prepare(`DELETE FROM director_scenes WHERE project_id IN (${marks})`).run(...values);
      const result = db.prepare(`DELETE FROM director_projects WHERE id IN (${marks})`).run(...values);
      db.exec("COMMIT");
      return Number(result.changes || 0);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function replaceDirectorScenes(projectId, scenes = []) {
    const id = Number(projectId || 0);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM director_scenes WHERE project_id = ?").run(id);
      for (const scene of scenes) {
        insertDirectorSceneStmt.run(
          id,
          Number(scene.scene_index || scene.scene || 0),
          Number(scene.duration || 0),
          String(scene.purpose || ""),
          String(scene.emotion || ""),
          String(scene.voice_text || ""),
          String(scene.subtitle || ""),
          String(scene.visual_style || ""),
          String(scene.camera || ""),
          String(scene.composition || ""),
          String(scene.image_prompt || ""),
          String(scene.motion_prompt || ""),
          String(scene.bgm || ""),
          String(scene.sfx || ""),
          String(scene.transition || ""),
          String(scene.asset_type || ""),
          String(scene.metadata_json || "{}")
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return listDirectorScenes(id);
  }

  function listDirectorScenes(projectId) {
    return listDirectorScenesStmt.all(Number(projectId || 0)).map(normalizeDirectorScene);
  }

  function normalizeAssetProject(row) {
    if (!row) return null;
    return {
      ...row,
      director_project_id: Number(row.director_project_id || 0),
      vfo_project_id: Number(row.vfo_project_id || 0),
      score: Number(row.score || 0),
    };
  }

  function normalizeAssetScene(row) {
    if (!row) return null;
    return {
      ...row,
      project_id: Number(row.project_id || 0),
      scene_index: Number(row.scene_index || 0),
      aesthetic_score: Number(row.aesthetic_score || 0),
      readiness_score: Number(row.readiness_score || 0),
      render_ready: Boolean(row.render_ready),
    };
  }

  function normalizeAssetReview(row) {
    if (!row) return null;
    return {
      ...row,
      project_id: Number(row.project_id || 0),
      score: Number(row.score || 0),
      material_score: Number(row.material_score || 0),
      shot_score: Number(row.shot_score || 0),
      communication_score: Number(row.communication_score || 0),
      aesthetic_risk_score: Number(row.aesthetic_risk_score || 0),
      ai_risk_score: Number(row.ai_risk_score || 0),
    };
  }

  function createAssetProject(input) {
    const timestamp = nowIso();
    const result = insertAssetProjectStmt.run(
      Number(input.director_project_id || 0),
      Number(input.vfo_project_id || 0),
      String(input.title || ""),
      String(input.platform || ""),
      String(input.storyboard_path || ""),
      String(input.asset_plan_path || ""),
      String(input.package_path || ""),
      String(input.status || "waiting"),
      Number(input.score || 0),
      timestamp,
      timestamp,
      String(input.metadata_json || "{}")
    );
    return getAssetProject(Number(result.lastInsertRowid));
  }

  function getAssetProject(id) {
    return normalizeAssetProject(getAssetProjectStmt.get(Number(id)));
  }

  function updateAssetProject(id, changes) {
    const entries = Object.entries(changes).filter(([key]) => (
      ASSET_PROJECT_COLUMNS.includes(key) && !["id", "created_at", "updated_at"].includes(key)
    ));
    if (entries.length === 0) return getAssetProject(id);
    const sql = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([, value]) => value ?? "");
    values.push(nowIso(), Number(id));
    db.prepare(`UPDATE asset_projects SET ${sql}, updated_at = ? WHERE id = ?`).run(...values);
    return getAssetProject(id);
  }

  function listAssetProjects({ limit = 50 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));
    return listAssetProjectsStmt.all(safeLimit).map(normalizeAssetProject);
  }

  function replaceAssetScenes(projectId, scenes = []) {
    const id = Number(projectId || 0);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM asset_scenes WHERE project_id = ?").run(id);
      for (const scene of scenes) {
        insertAssetSceneStmt.run(
          id,
          Number(scene.scene_index || scene.scene || 0),
          String(scene.purpose || ""),
          String(scene.asset_type || ""),
          String(scene.asset_subtype || ""),
          String(scene.reason || ""),
          String(scene.generation_method || ""),
          String(scene.image_prompt || ""),
          String(scene.negative_prompt || ""),
          String(scene.motion_prompt || ""),
          String(scene.platform_fit_json || "{}"),
          Number(scene.aesthetic_score || 0),
          Number(scene.readiness_score || 0),
          scene.render_ready ? 1 : 0,
          String(scene.metadata_json || "{}")
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return listAssetScenes(id);
  }

  function listAssetScenes(projectId) {
    return listAssetScenesStmt.all(Number(projectId || 0)).map(normalizeAssetScene);
  }

  function saveAssetReview(input) {
    const projectId = Number(input.project_id || 0);
    const reviewType = String(input.review_type || "asset_review");
    const existing = getAssetReviewStmt.get(projectId, reviewType);
    const timestamp = nowIso();
    const values = [
      Number(input.score || 0),
      Number(input.material_score || 0),
      Number(input.shot_score || 0),
      Number(input.communication_score || 0),
      Number(input.aesthetic_risk_score || 0),
      Number(input.ai_risk_score || 0),
      String(input.problems_json || "[]"),
      String(input.fixes_json || "[]"),
      timestamp,
      String(input.metadata_json || "{}"),
    ];
    if (existing) {
      db.prepare(`
        UPDATE asset_reviews
        SET score = ?, material_score = ?, shot_score = ?, communication_score = ?,
            aesthetic_risk_score = ?, ai_risk_score = ?, problems_json = ?, fixes_json = ?,
            updated_at = ?, metadata_json = ?
        WHERE id = ?
      `).run(...values, existing.id);
    } else {
      insertAssetReviewStmt.run(projectId, reviewType, ...values.slice(0, 8), timestamp, timestamp, values[9]);
    }
    return normalizeAssetReview(getAssetReviewStmt.get(projectId, reviewType));
  }

  function listAssetReviews(projectId) {
    return listAssetReviewsStmt.all(Number(projectId || 0)).map(normalizeAssetReview);
  }

  function normalizeVfoProject(row) {
    if (!row) return null;
    return {
      ...row,
      director_project_id: Number(row.director_project_id || 0),
      asset_project_id: Number(row.asset_project_id || 0),
      score: Number(row.score || 0),
    };
  }

  function normalizeVfoScene(row) {
    if (!row) return null;
    return {
      ...row,
      project_id: Number(row.project_id || 0),
      scene_index: Number(row.scene_index || 0),
      readiness_score: Number(row.readiness_score || 0),
    };
  }

  function normalizeVfoReview(row) {
    if (!row) return null;
    return {
      ...row,
      project_id: Number(row.project_id || 0),
      score: Number(row.score || 0),
      communication_score: Number(row.communication_score || 0),
      aesthetic_score: Number(row.aesthetic_score || 0),
      information_density_score: Number(row.information_density_score || 0),
      platform_fit_score: Number(row.platform_fit_score || 0),
      ai_flavor_score: Number(row.ai_flavor_score || 0),
    };
  }

  function createVfoProject(input) {
    const timestamp = nowIso();
    const result = insertVfoProjectStmt.run(
      Number(input.director_project_id || 0),
      Number(input.asset_project_id || 0),
      String(input.title || ""),
      String(input.platform || ""),
      String(input.storyboard_path || ""),
      String(input.render_plan_path || ""),
      String(input.status || "waiting"),
      Number(input.score || 0),
      timestamp,
      timestamp,
      String(input.metadata_json || "{}")
    );
    return getVfoProject(Number(result.lastInsertRowid));
  }

  function getVfoProject(id) {
    return normalizeVfoProject(getVfoProjectStmt.get(Number(id)));
  }

  function updateVfoProject(id, changes) {
    const entries = Object.entries(changes).filter(([key]) => (
      VFO_PROJECT_COLUMNS.includes(key) && !["id", "created_at", "updated_at"].includes(key)
    ));
    if (entries.length === 0) return getVfoProject(id);
    const sql = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([, value]) => value ?? "");
    values.push(nowIso(), Number(id));
    db.prepare(`UPDATE vfo_projects SET ${sql}, updated_at = ? WHERE id = ?`).run(...values);
    return getVfoProject(id);
  }

  function listVfoProjects({ limit = 50 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));
    return listVfoProjectsStmt.all(safeLimit).map(normalizeVfoProject);
  }

  function replaceVfoScenes(projectId, scenes = []) {
    const id = Number(projectId || 0);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM vfo_scenes WHERE project_id = ?").run(id);
      for (const scene of scenes) {
        insertVfoSceneStmt.run(
          id,
          Number(scene.scene_index || scene.scene || 0),
          String(scene.asset_type || ""),
          String(scene.generation_strategy || ""),
          String(scene.render_strategy || ""),
          String(scene.qa_checks_json || "[]"),
          String(scene.platform_fit_json || "{}"),
          Number(scene.readiness_score || 0),
          String(scene.metadata_json || "{}")
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return listVfoScenes(id);
  }

  function listVfoScenes(projectId) {
    return listVfoScenesStmt.all(Number(projectId || 0)).map(normalizeVfoScene);
  }

  function saveVfoReview(input) {
    const projectId = Number(input.project_id || 0);
    const existing = getVfoReviewStmt.get(projectId);
    const timestamp = nowIso();
    const values = [
      Number(input.score || 0),
      Number(input.communication_score || 0),
      Number(input.aesthetic_score || 0),
      Number(input.information_density_score || 0),
      Number(input.platform_fit_score || 0),
      Number(input.ai_flavor_score || 0),
      String(input.problems_json || "[]"),
      String(input.fixes_json || "[]"),
      timestamp,
      String(input.metadata_json || "{}"),
    ];
    if (existing) {
      db.prepare(`
        UPDATE vfo_reviews
        SET score = ?, communication_score = ?, aesthetic_score = ?,
            information_density_score = ?, platform_fit_score = ?, ai_flavor_score = ?,
            problems_json = ?, fixes_json = ?, updated_at = ?, metadata_json = ?
        WHERE id = ?
      `).run(...values, existing.id);
    } else {
      insertVfoReviewStmt.run(projectId, ...values.slice(0, 8), timestamp, timestamp, values[9]);
    }
    return normalizeVfoReview(getVfoReviewStmt.get(projectId));
  }

  function getVfoReview(projectId) {
    return normalizeVfoReview(getVfoReviewStmt.get(Number(projectId || 0)));
  }

  function normalizeTimelineProject(row) {
    if (!row) return null;
    return {
      ...row,
      project_id: Number(row.id || 0),
      source_director_project_id: Number(row.source_director_project_id || 0),
      audio_asset_id: Number(row.audio_asset_id || 0),
      fps: Number(row.fps || 30),
      duration: Number(row.duration || 0),
      progress: Number(row.progress || 0),
    };
  }

  function normalizeTimelineScene(row) {
    if (!row) return null;
    return {
      ...row,
      project_id: Number(row.project_id || 0),
      scene_index: Number(row.scene_index || 0),
      start_time: Number(row.start_time || 0),
      end_time: Number(row.end_time || 0),
      duration: Number(row.duration || 0),
    };
  }

  function createTimelineProject(input) {
    const timestamp = nowIso();
    const result = insertTimelineProjectStmt.run(
      Number(input.source_director_project_id || 0),
      Number(input.audio_asset_id || 0),
      String(input.platform || "douyin"),
      String(input.ratio || "9:16"),
      String(input.resolution || "1080x1920"),
      Number(input.fps || 30),
      Number(input.duration || 0),
      String(input.tracks_json || "{}"),
      String(input.output_type || "jianying"),
      String(input.status || "pending"),
      Number(input.progress || 0),
      String(input.current_step || ""),
      String(input.output_dir || ""),
      String(input.timeline_path || ""),
      String(input.srt_path || ""),
      String(input.manifest_path || ""),
      String(input.draft_path || ""),
      String(input.mp4_path || ""),
      String(input.blockers_json || "[]"),
      String(input.error || ""),
      timestamp,
      timestamp,
      String(input.completed_at || ""),
      String(input.metadata_json || "{}")
    );
    return getTimelineProject(Number(result.lastInsertRowid));
  }

  function getTimelineProject(id) {
    return normalizeTimelineProject(getTimelineProjectStmt.get(Number(id || 0)));
  }

  function updateTimelineProject(id, changes) {
    const entries = Object.entries(changes).filter(([key]) => (
      TIMELINE_PROJECT_COLUMNS.includes(key) && !["id", "created_at", "updated_at"].includes(key)
    ));
    if (entries.length === 0) return getTimelineProject(id);
    const sql = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([, value]) => value ?? "");
    values.push(nowIso(), Number(id));
    db.prepare(`UPDATE timeline_projects SET ${sql}, updated_at = ? WHERE id = ?`).run(...values);
    return getTimelineProject(id);
  }

  function listTimelineProjects({ limit = 50 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));
    return listTimelineProjectsStmt.all(safeLimit).map(normalizeTimelineProject);
  }

  function deleteTimelineProjects(ids = []) {
    const values = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    if (!values.length) return 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      const marks = placeholders(values.length);
      db.prepare(`DELETE FROM timeline_scenes WHERE project_id IN (${marks})`).run(...values);
      const result = db.prepare(`DELETE FROM timeline_projects WHERE id IN (${marks})`).run(...values);
      db.exec("COMMIT");
      return Number(result.changes || 0);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function replaceTimelineScenes(projectId, scenes = []) {
    const id = Number(projectId || 0);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM timeline_scenes WHERE project_id = ?").run(id);
      for (const scene of scenes) {
        insertTimelineSceneStmt.run(
          id,
          Number(scene.scene_index || scene.scene || 0),
          String(scene.narration_text || ""),
          String(scene.subtitle_text || ""),
          Number(scene.start_time || 0),
          Number(scene.end_time || 0),
          Number(scene.duration || 0),
          String(scene.image_asset_id || ""),
          String(scene.image_path || ""),
          String(scene.motion_type || ""),
          String(scene.transition_type || ""),
          String(scene.title_text || ""),
          String(scene.visual_prompt || ""),
          String(scene.status || "pending"),
          String(scene.metadata_json || "{}")
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return listTimelineScenes(id);
  }

  function listTimelineScenes(projectId) {
    return listTimelineScenesStmt.all(Number(projectId || 0)).map(normalizeTimelineScene);
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
    close: () => db.close(),
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
    deleteTtsJobs,
    createVoiceAsset,
    getVoiceAsset,
    upsertVoice,
    listVoices,
    updateVoiceAsset,
    deleteVoiceAsset,
    setDefaultVoice,
    getDefaultVoice,
    recordVoiceUse,
    createVoiceTest,
    getVoiceTest,
    updateVoiceTest,
    listVoiceTests,
    saveVoiceRating,
    listVoiceRatings,
    createDirectorProject,
    getDirectorProject,
    updateDirectorProject,
    listDirectorProjects,
    deleteDirectorProjects,
    replaceDirectorScenes,
    listDirectorScenes,
    createAssetProject,
    getAssetProject,
    updateAssetProject,
    listAssetProjects,
    replaceAssetScenes,
    listAssetScenes,
    saveAssetReview,
    listAssetReviews,
    createVfoProject,
    getVfoProject,
    updateVfoProject,
    listVfoProjects,
    replaceVfoScenes,
    listVfoScenes,
    saveVfoReview,
    getVfoReview,
    createTimelineProject,
    getTimelineProject,
    updateTimelineProject,
    listTimelineProjects,
    deleteTimelineProjects,
    replaceTimelineScenes,
    listTimelineScenes,
  };
}
