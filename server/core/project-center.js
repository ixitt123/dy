import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const VIDEO_PROJECT_STATUSES = [
  "created",
  "collected",
  "transcribed",
  "rewritten",
  "voiced",
  "directed",
  "assets_ready",
  "draft_ready",
  "exported",
];

const PROJECT_JSON_FIELDS = {
  sourceVideos: "source_videos_json",
  rewriteVersions: "rewrite_versions_json",
  ttsAudios: "tts_audios_json",
  selectedTtsAudio: "selected_tts_audio_json",
  directorScript: "director_script_json",
  assetPlan: "asset_plan_json",
  selectedAssets: "selected_assets_json",
  bgm: "bgm_json",
  subtitleTimeline: "subtitle_timeline_json",
  jianyingDraft: "jianying_draft_json",
  outputHistory: "output_history_json",
};

const PROJECT_TEXT_FIELDS = {
  title: "title",
  videoType: "video_type",
  status: "status",
  transcriptText: "transcript_text",
  selectedRewriteText: "selected_rewrite_text",
  outputMode: "output_mode",
  description: "description",
  cover: "cover",
};

function safeJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "") ?? fallback;
  } catch {
    return fallback;
  }
}

function nowLocal() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(String(value || "").trim());
}

function uniqueById(rows) {
  const seen = new Set();
  return rows.filter((item) => {
    const key = String(item?.id || item?.assetId || item?.path || JSON.stringify(item));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function statusProgress(status) {
  const index = VIDEO_PROJECT_STATUSES.indexOf(status);
  return index < 0 ? 0 : Math.round((index / (VIDEO_PROJECT_STATUSES.length - 1)) * 100);
}

function nextAction(project) {
  const actions = {
    created: { label: "采集素材", page: "collector" },
    collected: { label: "提取文案", page: "transcript" },
    transcribed: { label: "生成 3 个改写版本", page: "rewrite" },
    rewritten: { label: "生成配音", page: "tts" },
    voiced: { label: "生成导演稿", page: "director" },
    directed: { label: "匹配素材", page: "files" },
    assets_ready: { label: "生成成片草稿", page: "vfo" },
    draft_ready: { label: "打开剪映并导出", page: "vfo" },
    exported: { label: "查看成片记录", page: "vfo" },
  };
  return actions[project.status] || actions.created;
}

export function createProjectCenter(baseDir) {
  const dataDir = path.join(baseDir, ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "project-center.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT DEFAULT '',
      cover TEXT DEFAULT '',
      status TEXT DEFAULT 'created',
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

  function ensureColumn(table, column, definition) {
    const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name));
    if (!columns.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  [
    ["title", "TEXT DEFAULT ''"],
    ["video_type", "TEXT DEFAULT '宣传类'"],
    ["source_videos_json", "TEXT DEFAULT '[]'"],
    ["transcript_text", "TEXT DEFAULT ''"],
    ["rewrite_versions_json", "TEXT DEFAULT '[]'"],
    ["selected_rewrite_text", "TEXT DEFAULT ''"],
    ["tts_audios_json", "TEXT DEFAULT '[]'"],
    ["selected_tts_audio_json", "TEXT DEFAULT '{}'"],
    ["director_script_json", "TEXT DEFAULT '{}'"],
    ["asset_plan_json", "TEXT DEFAULT '{}'"],
    ["selected_assets_json", "TEXT DEFAULT '[]'"],
    ["bgm_json", "TEXT DEFAULT '{}'"],
    ["subtitle_timeline_json", "TEXT DEFAULT '[]'"],
    ["output_mode", "TEXT DEFAULT 'jianying'"],
    ["jianying_draft_json", "TEXT DEFAULT '{}'"],
    ["output_history_json", "TEXT DEFAULT '[]'"],
  ].forEach(([column, definition]) => ensureColumn("projects", column, definition));

  [
    ["use_case", "TEXT DEFAULT ''"],
    ["style", "TEXT DEFAULT ''"],
    ["ratio", "TEXT DEFAULT ''"],
    ["source", "TEXT DEFAULT 'local_upload'"],
    ["used_count", "INTEGER DEFAULT 0"],
    ["status", "TEXT DEFAULT 'ready'"],
    ["metadata_json", "TEXT DEFAULT '{}'"],
    ["updated_at", "TEXT DEFAULT ''"],
  ].forEach(([column, definition]) => ensureColumn("project_assets", column, definition));

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_video_projects_updated ON projects(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_assets_project_type ON project_assets(project_id, asset_type);
  `);

  function decodeProject(row) {
    if (!row) return null;
    const project = {
      id: row.id,
      title: row.title || row.name || "未命名短视频",
      videoType: row.video_type || "宣传类",
      status: VIDEO_PROJECT_STATUSES.includes(row.status) ? row.status : row.status === "completed" ? "exported" : "created",
      sourceVideos: safeJson(row.source_videos_json, []),
      transcriptText: row.transcript_text || "",
      rewriteVersions: safeJson(row.rewrite_versions_json, []),
      selectedRewriteText: row.selected_rewrite_text || "",
      ttsAudios: safeJson(row.tts_audios_json, []),
      selectedTtsAudio: safeJson(row.selected_tts_audio_json, {}),
      directorScript: safeJson(row.director_script_json, {}),
      assetPlan: safeJson(row.asset_plan_json, {}),
      selectedAssets: safeJson(row.selected_assets_json, []),
      bgm: safeJson(row.bgm_json, {}),
      subtitleTimeline: safeJson(row.subtitle_timeline_json, []),
      outputMode: row.output_mode || "jianying",
      jianyingDraft: safeJson(row.jianying_draft_json, {}),
      outputHistory: safeJson(row.output_history_json, []),
      description: row.description || "",
      cover: row.cover || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    project.progress = statusProgress(project.status);
    project.nextAction = nextAction(project);
    return project;
  }

  function decodeAsset(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      assetType: row.asset_type,
      assetId: row.asset_id,
      name: row.name,
      useCase: row.use_case || "",
      style: row.style || "",
      ratio: row.ratio || "",
      source: row.source || "local_upload",
      usedCount: Number(row.used_count || 0),
      status: row.status || "ready",
      metadata: safeJson(row.metadata_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
    };
  }

  function getById(id) {
    return decodeProject(db.prepare("SELECT * FROM projects WHERE id=?").get(String(id || "")));
  }

  function create(input = {}, description = "") {
    const payload = typeof input === "string" ? { title: input, description } : input || {};
    const id = makeId("vp");
    const title = String(payload.title || payload.name || "新短视频项目").trim() || "新短视频项目";
    const videoType = String(payload.videoType || "宣传类");
    const outputMode = String(payload.outputMode || "jianying");
    const now = nowLocal();
    db.prepare(`
      INSERT INTO projects (id, name, title, description, status, video_type, output_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'created', ?, ?, ?, ?)
    `).run(id, title, title, String(payload.description || ""), videoType, outputMode, now, now);
    return getById(id);
  }

  function list(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit || 100)));
    return db.prepare("SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC LIMIT ?").all(limit).map(decodeProject);
  }

  function update(id, changes = {}) {
    const current = getById(id);
    if (!current) return null;
    const assignments = [];
    const values = [];
    Object.entries(PROJECT_TEXT_FIELDS).forEach(([key, column]) => {
      if (changes[key] === undefined) return;
      assignments.push(`${column}=?`);
      values.push(String(changes[key] ?? ""));
      if (key === "title") {
        assignments.push("name=?");
        values.push(String(changes[key] ?? ""));
      }
    });
    Object.entries(PROJECT_JSON_FIELDS).forEach(([key, column]) => {
      if (changes[key] === undefined) return;
      assignments.push(`${column}=?`);
      values.push(JSON.stringify(changes[key] ?? (Array.isArray(current[key]) ? [] : {})));
    });
    if (!assignments.length) return current;
    assignments.push("updated_at=?");
    values.push(nowLocal(), String(id));
    db.prepare(`UPDATE projects SET ${assignments.join(", ")} WHERE id=?`).run(...values);
    return getById(id);
  }

  function deriveStatus(project) {
    if (hasValue(project.outputHistory)) return "exported";
    if (hasValue(project.jianyingDraft)) return "draft_ready";
    if (hasValue(project.selectedAssets) && hasValue(project.bgm)) return "assets_ready";
    if (hasValue(project.directorScript)) return "directed";
    if (hasValue(project.selectedTtsAudio)) return "voiced";
    if (hasValue(project.selectedRewriteText)) return "rewritten";
    if (hasValue(project.transcriptText)) return "transcribed";
    if (hasValue(project.sourceVideos)) return "collected";
    return "created";
  }

  function listAssets(filters = {}) {
    const where = [];
    const values = [];
    const mapping = {
      projectId: "project_id",
      assetType: "asset_type",
      useCase: "use_case",
      style: "style",
      ratio: "ratio",
      source: "source",
      status: "status",
    };
    Object.entries(mapping).forEach(([key, column]) => {
      const value = String(filters[key] || "").trim();
      if (!value || value === "all") return;
      where.push(`${column}=?`);
      values.push(value);
    });
    const sql = `SELECT * FROM project_assets${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT 500`;
    return db.prepare(sql).all(...values).map(decodeAsset);
  }

  function upsertProjectField(project, asset) {
    const metadata = asset.metadata || {};
    const item = {
      id: asset.assetId,
      linkId: asset.id,
      name: asset.name,
      assetType: asset.assetType,
      ...metadata,
    };
    const changes = {};
    if (asset.assetType === "source_video") changes.sourceVideos = uniqueById([...project.sourceVideos, item]);
    if (asset.assetType === "transcript") changes.transcriptText = String(metadata.text || asset.name || "");
    if (asset.assetType === "rewrite") changes.rewriteVersions = uniqueById([...project.rewriteVersions, item]);
    if (asset.assetType === "selected_rewrite") changes.selectedRewriteText = String(metadata.text || asset.name || "");
    if (asset.assetType === "tts") {
      changes.ttsAudios = uniqueById([...project.ttsAudios, item]);
      changes.selectedTtsAudio = item;
    }
    if (asset.assetType === "director") {
      changes.directorScript = item;
      const timeline = metadata.subtitleTimeline || metadata.subtitle_timeline || metadata.result?.subtitle_timeline;
      if (Array.isArray(timeline)) changes.subtitleTimeline = timeline;
    }
    if (asset.assetType === "asset_plan") changes.assetPlan = item;
    if (["image", "video", "sfx", "subtitle", "cover"].includes(asset.assetType)) {
      changes.selectedAssets = uniqueById([...project.selectedAssets, item]);
      if (asset.assetType === "subtitle" && Array.isArray(metadata.timeline)) changes.subtitleTimeline = metadata.timeline;
    }
    if (asset.assetType === "bgm") changes.bgm = item;
    if (asset.assetType === "jianying") changes.jianyingDraft = item;
    if (asset.assetType === "output") changes.outputHistory = uniqueById([...project.outputHistory, item]);
    const next = { ...project, ...changes };
    changes.status = deriveStatus(next);
    return update(project.id, changes);
  }

  function linkAsset(projectId, assetType, assetId, name = "", metadata = {}) {
    const project = getById(projectId);
    if (!project) throw new Error("短视频项目不存在。");
    const normalizedMetadata = metadata && typeof metadata === "object" ? metadata : {};
    const existing = db.prepare("SELECT * FROM project_assets WHERE project_id=? AND asset_type=? AND asset_id=?")
      .get(String(projectId), String(assetType), String(assetId));
    let row;
    if (existing) {
      db.prepare(`
        UPDATE project_assets SET name=?, use_case=?, style=?, ratio=?, source=?, status=?, metadata_json=?, updated_at=? WHERE id=?
      `).run(
        String(name || existing.name || ""),
        String(normalizedMetadata.useCase || existing.use_case || project.videoType || ""),
        String(normalizedMetadata.style || existing.style || ""),
        String(normalizedMetadata.ratio || existing.ratio || ""),
        String(normalizedMetadata.source || existing.source || "local_upload"),
        String(normalizedMetadata.status || existing.status || "ready"),
        JSON.stringify({ ...safeJson(existing.metadata_json, {}), ...normalizedMetadata }),
        nowLocal(),
        existing.id,
      );
      row = db.prepare("SELECT * FROM project_assets WHERE id=?").get(existing.id);
    } else {
      const id = makeId("pa");
      db.prepare(`
        INSERT INTO project_assets (
          id, project_id, asset_type, asset_id, name, use_case, style, ratio, source,
          used_count, status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        String(projectId),
        String(assetType || ""),
        String(assetId || ""),
        String(name || ""),
        String(normalizedMetadata.useCase || project.videoType || ""),
        String(normalizedMetadata.style || ""),
        String(normalizedMetadata.ratio || ""),
        String(normalizedMetadata.source || "local_upload"),
        Number(normalizedMetadata.usedCount || 0),
        String(normalizedMetadata.status || "ready"),
        JSON.stringify(normalizedMetadata),
        nowLocal(),
        nowLocal(),
      );
      row = db.prepare("SELECT * FROM project_assets WHERE id=?").get(id);
    }
    const asset = decodeAsset(row);
    const updatedProject = upsertProjectField(project, asset);
    return { asset, project: updatedProject };
  }

  function getAssets(projectId) {
    return listAssets({ projectId });
  }

  function getReadiness(id) {
    const project = getById(id);
    if (!project) return null;
    const assets = getAssets(id);
    const mediaAssets = assets.filter((item) => ["image", "video"].includes(item.assetType) && item.status === "ready");
    const expectedAssets = Math.max(1, Number(project.directorScript?.sceneCount || project.directorScript?.scene_count || project.directorScript?.result?.storyboard?.length || 1));
    const missingAssets = Math.max(0, expectedAssets - mediaAssets.length);
    const outputDir = path.join(baseDir, "video-products");
    let outputReady = true;
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.accessSync(outputDir, fs.constants.W_OK);
    } catch {
      outputReady = false;
    }
    const checks = [
      { id: "script", label: "文案", ok: hasValue(project.selectedRewriteText || project.transcriptText), ready: "已完成", missing: "缺失", page: "rewrite", action: "选择文案", critical: true },
      { id: "voice", label: "语音", ok: hasValue(project.selectedTtsAudio), ready: "已完成", missing: "缺失", page: "tts", action: "生成语音", critical: true },
      { id: "director", label: "导演稿", ok: hasValue(project.directorScript), ready: "已完成", missing: "缺失", page: "director", action: "生成导演稿", critical: true },
      { id: "subtitle", label: "字幕时间轴", ok: hasValue(project.subtitleTimeline), ready: "已完成", missing: "缺失", page: "director", action: "补齐字幕", critical: true },
      { id: "assets", label: "素材", ok: mediaAssets.length > 0 && missingAssets === 0, ready: `已完成 · ${mediaAssets.length} 个`, missing: `缺少 ${missingAssets || expectedAssets} 个`, page: "files", action: "匹配素材", critical: true },
      { id: "bgm", label: "BGM", ok: hasValue(project.bgm), ready: "已完成", missing: "未选择", page: "files", action: "选择 BGM", critical: true },
      { id: "template", label: "剪映模板", ok: project.outputMode !== "jianying" || hasValue(project.jianyingDraft), ready: project.outputMode === "jianying" ? "已选择" : "当前路线不需要", missing: "未选择", page: "vfo", action: "选择模板", critical: project.outputMode === "jianying" },
      { id: "output", label: "输出目录", ok: outputReady, ready: "正常", missing: "异常", page: "settings", action: "检查目录", critical: true },
    ].map((item) => ({ ...item, detail: item.ok ? item.ready : item.missing }));
    const blockers = checks.filter((item) => item.critical && !item.ok);
    return {
      projectId: project.id,
      ready: blockers.length === 0,
      checks,
      blockers,
      missingAssets,
      outputDir,
    };
  }

  function getQualityCheck(id) {
    const project = getById(id);
    if (!project) return null;
    const readiness = getReadiness(id);
    const script = String(project.selectedRewriteText || project.transcriptText || "");
    const subtitleRows = Array.isArray(project.subtitleTimeline) ? project.subtitleTimeline : [];
    const assets = getAssets(id).filter((item) => ["image", "video"].includes(item.assetType));
    const directorScenes = Number(project.directorScript?.sceneCount || project.directorScript?.result?.storyboard?.length || subtitleRows.length || 1);
    const firstLine = script.split(/[。！？!?\n]/)[0] || "";
    const hookScore = Math.min(100, 50 + Math.min(30, firstLine.length) + (/[？?！!]|别|不要|为什么|真相|关键|立刻/.test(firstLine) ? 20 : 0));
    const scriptClarityScore = script.length >= 60 && script.length <= 800 ? 88 : script.length ? 68 : 0;
    const averageSubtitle = subtitleRows.length
      ? subtitleRows.reduce((total, item) => total + String(item.text || item.subtitle || "").length, 0) / subtitleRows.length
      : 0;
    const subtitleRhythmScore = subtitleRows.length ? (averageSubtitle <= 22 ? 90 : averageSubtitle <= 30 ? 72 : 55) : 0;
    const visualDiversityScore = Math.min(100, assets.length * 16 + new Set(assets.map((item) => item.assetType)).size * 18);
    const assetMatchScore = Math.min(100, Math.round((assets.length / Math.max(1, directorScenes)) * 100));
    const bgmReady = hasValue(project.bgm);
    const ctaReady = /关注|评论|私信|领取|报名|咨询|收藏|转发|立即|扫码/.test(script);
    const scoreValues = [hookScore, scriptClarityScore, subtitleRhythmScore, visualDiversityScore, assetMatchScore, bgmReady ? 100 : 0, ctaReady ? 100 : 45];
    const totalScore = Math.round(scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length);
    const problems = [];
    const suggestions = [];
    if (hookScore < 75) { problems.push("开头钩子不够强"); suggestions.push({ label: "生成强钩子版本", page: "rewrite" }); }
    if (subtitleRhythmScore < 70) { problems.push("字幕过长或节奏不足"); suggestions.push({ label: "重新切分字幕", page: "director" }); }
    if (assetMatchScore < 80) { problems.push("分镜素材不足"); suggestions.push({ label: "去素材库补齐", page: "files" }); }
    if (!bgmReady) { problems.push("没有准备 BGM"); suggestions.push({ label: "推荐本地 BGM", page: "files" }); }
    if (!ctaReady) { problems.push("结尾行动号召不明显"); suggestions.push({ label: "生成 CTA 版本", page: "rewrite" }); }
    if (!readiness.ready) problems.push(...readiness.blockers.map((item) => `${item.label}${item.detail}`));
    return {
      projectId: project.id,
      totalScore,
      hookScore,
      scriptClarityScore,
      subtitleRhythmScore,
      visualDiversityScore,
      assetMatchScore,
      bgmReady,
      ctaReady,
      estimatedQualityLevel: totalScore >= 85 ? "优秀" : totalScore >= 70 ? "良好" : totalScore >= 55 ? "可用" : "待完善",
      problems: [...new Set(problems)],
      suggestions,
      readiness,
      checkedAt: nowLocal(),
    };
  }

  function remove(id) {
    db.prepare("DELETE FROM project_assets WHERE project_id=?").run(String(id || ""));
    db.prepare("DELETE FROM projects WHERE id=?").run(String(id || ""));
    return true;
  }

  function getStats() {
    const projects = list({ limit: 500 });
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: projects.length,
      active: projects.filter((item) => item.status !== "exported").length,
      exported: projects.filter((item) => item.status === "exported").length,
      today: projects.filter((item) => String(item.createdAt || "").startsWith(today)).length,
      draft: projects.filter((item) => item.status === "draft_ready").length,
      completed: projects.filter((item) => item.status === "exported").length,
    };
  }

  return {
    create,
    list,
    getById,
    update,
    remove,
    linkAsset,
    getAssets,
    listAssets,
    getReadiness,
    getQualityCheck,
    getStats,
  };
}
