import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BGM_PERSISTENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "R2-01.02", "persistence"));
const safeAudioFixturePath = path.join(ROOT, "fixtures", "kinetic", "narration-440.wav");
const safeAudioFixtureBuffer = fs.readFileSync(safeAudioFixturePath);
const suppliedParentId = Number(String(process.env.TTS_BGM_PARENT_JOB_ID || "").trim() || 0);
const suppliedBgmId = Number(String(process.env.TTS_BGM_JOB_ID || "").trim() || 0);
const externallyRestarted = process.env.TTS_BGM_PERSISTENCE_RESTARTED === "1";
const nativeFetch = globalThis.fetch.bind(globalThis);
let localApiCookie = "";

async function establishLocalSession() {
  const response = await nativeFetch(`${BASE}/`);
  localApiCookie = String(response.headers.get("set-cookie") || "").split(";")[0];
  if (!response.ok || !localApiCookie) throw new Error("无法建立本机 API 会话");
}

async function apiJson(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", localApiCookie);
  headers.set("origin", BASE);
  const response = await nativeFetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

async function importFixture({ marker, text, parentId = 0 }) {
  const isBgm = parentId > 0;
  const managedAudioDir = path.join(ROOT, ".data", "tts", "audio");
  const stagingPath = path.join(managedAudioDir, `r2-01-02-persistence-${marker}-${process.pid}-${Date.now()}.wav`);
  fs.mkdirSync(managedAudioDir, { recursive: true });
  fs.copyFileSync(safeAudioFixturePath, stagingPath);
  try {
    const data = await apiJson(`${BASE}/api/tts/import-generated`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audio_path: stagingPath,
        text,
        provider: "safe_fixture",
        voice_id: isBgm ? "music:clean_education_bgm" : "r2-01-02-persistence-narration",
        voice_name: isBgm ? "R2-01.02 持久化 BGM fixture" : "R2-01.02 持久化旁白 fixture",
        model: isBgm ? "music-2.6-free" : "safe-fixture",
        source: isBgm ? "minimax_music_bgm" : "generated_preview",
        asset_kind: isBgm ? "minimax_music_preset" : "",
        emotion: isBgm ? "music" : "neutral",
        format: "wav",
        metadata: isBgm ? {
          audio_role: "background_music",
          instrumental: true,
          parent_tts_job_id: parentId,
          source_tts_job_id: parentId,
          bgm_relation_confirmed: true,
          bgm_relation_source: "explicit_user_request",
          background_volume: 0.18,
          source_fixture_sha256: crypto.createHash("sha256").update(safeAudioFixtureBuffer).digest("hex").toUpperCase(),
        } : {
          audio_role: "narration",
          bgm_requested: true,
          source_fixture_sha256: crypto.createHash("sha256").update(safeAudioFixtureBuffer).digest("hex").toUpperCase(),
        },
      }),
    });
    return data.job;
  } finally {
    fs.rmSync(stagingPath, { force: true });
  }
}

async function deleteJob(id) {
  await apiJson(`${BASE}/api/tts/delete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, deleteFile: true }),
  }).catch(() => {});
}

function sqliteState(parentId, bgmId) {
  const db = new DatabaseSync(path.join(ROOT, ".data", "tasks.sqlite"), { readOnly: true });
  try {
    const statement = db.prepare("SELECT id, status, audio_path, metadata_json FROM tts_jobs WHERE id = ?");
    const parent = statement.get(parentId);
    const bgm = statement.get(bgmId);
    const parentMetadata = JSON.parse(String(parent?.metadata_json || "{}"));
    const bgmMetadata = JSON.parse(String(bgm?.metadata_json || "{}"));
    return {
      parent: { id: Number(parent?.id || 0), status: parent?.status || "", bgmRequested: parentMetadata.bgm_requested ?? null },
      bgm: {
        id: Number(bgm?.id || 0),
        status: bgm?.status || "",
        audioPath: String(bgm?.audio_path || ""),
        parentTtsJobId: Number(bgmMetadata.parent_tts_job_id || 0),
        sourceTtsJobId: Number(bgmMetadata.source_tts_job_id || 0),
        relationConfirmed: bgmMetadata.bgm_relation_confirmed === true,
      },
    };
  } finally {
    db.close();
  }
}

async function browserState(page, parentId, bgmId) {
  return page.evaluate(`(function(){
    const row = document.querySelector('[data-tts-job-id="${parentId}"]');
    const linked = typeof linkedTtsBgmJob === 'function' ? linkedTtsBgmJob({ id: ${parentId} }) : null;
    return {
      rowExists: Boolean(row),
      hasBgmButton: Boolean(row?.querySelector('[data-tts-load-file="bgm"]')),
      bundleLabel: typeof ttsHandoffBundleLabel === 'function' ? ttsHandoffBundleLabel({ id: ${parentId} }) : '',
      linkedBgmId: String(linked?.id || ''),
      expectedBgmId: ${JSON.stringify(String(bgmId))},
    };
  })()`);
}

function assertBrowserState(state, label) {
  if (!state.rowExists || !state.hasBgmButton || !state.bundleLabel.includes("四件套") || state.linkedBgmId !== state.expectedBgmId) {
    throw new Error(`${label} BGM 关系未恢复：${JSON.stringify(state)}`);
  }
}

await establishLocalSession();
const createdIds = [];
let parentId = suppliedParentId;
let bgmId = suppliedBgmId;
let browser;
let result = { generatedAt: new Date().toISOString(), passed: false };
let thrown;
try {
  if (!parentId || !bgmId) {
    const text = `R2-01.02 BGM 持久化 ${Date.now()}-${process.pid}`;
    const parent = await importFixture({ marker: "parent", text });
    const bgm = await importFixture({ marker: "bgm", text, parentId: parent.id });
    parentId = Number(parent.id);
    bgmId = Number(bgm.id);
    createdIds.push(parentId, bgmId);
  }

  const parentResponse = await apiJson(`${BASE}/api/tts/job?id=${parentId}`);
  const bgmResponse = await apiJson(`${BASE}/api/tts/job?id=${bgmId}`);
  const parent = parentResponse.job;
  const bgm = bgmResponse.job;
  const sqlite = sqliteState(parentId, bgmId);
  if (parent.status !== "completed" || bgm.status !== "completed" || parent.bgm_requested !== true) {
    throw new Error(`API 中父旁白/BGM 状态错误：${JSON.stringify({ parent: { id: parent.id, status: parent.status, bgmRequested: parent.bgm_requested }, bgm: { id: bgm.id, status: bgm.status } })}`);
  }
  if (Number(bgm.parent_tts_job_id) !== parentId || Number(bgm.source_tts_job_id) !== parentId || bgm.bgm_relation_confirmed !== true) {
    throw new Error(`API 中 BGM 精确关系丢失：${JSON.stringify({ parentId, bgmId, parentTtsJobId: bgm.parent_tts_job_id, sourceTtsJobId: bgm.source_tts_job_id, relationConfirmed: bgm.bgm_relation_confirmed })}`);
  }
  if (sqlite.parent.bgmRequested !== true || sqlite.bgm.parentTtsJobId !== parentId || sqlite.bgm.sourceTtsJobId !== parentId || !sqlite.bgm.relationConfirmed) {
    throw new Error(`SQLite 中 BGM 精确关系丢失：${JSON.stringify(sqlite)}`);
  }

  const bgmPath = path.resolve(String(bgm.audio_path || sqlite.bgm.audioPath || ""));
  if (!fs.existsSync(bgmPath)) throw new Error(`BGM 文件不存在：${bgmPath}`);
  const media = verifyMedia(bgmPath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
  if (!media.ok) throw new Error(`BGM 媒体验证失败：${media.errors.join("；")}`);

  browser = new BrowserCDP({ debuggingPort: 9231 });
  await browser.launch();
  const page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction(`Boolean(document.querySelector('[data-tts-job-id="${parentId}"]'))`, 30000);
  const initial = await browserState(page, parentId, bgmId);
  assertBrowserState(initial, "首次加载");
  await page.reload();
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction(`Boolean(document.querySelector('[data-tts-job-id="${parentId}"]'))`, 30000);
  const refreshed = await browserState(page, parentId, bgmId);
  assertBrowserState(refreshed, "刷新后");

  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", `tts-parent-${parentId}-persistent-bgm.png`));
  result = {
    generatedAt: new Date().toISOString(),
    mode: suppliedParentId && suppliedBgmId ? "existing-fixture" : "self-contained-fixture",
    externallyRestarted,
    parentId,
    bgmId,
    sqlite,
    api: {
      parent: { id: Number(parent.id), bgmRequested: parent.bgm_requested },
      bgm: { id: Number(bgm.id), parentTtsJobId: Number(bgm.parent_tts_job_id), sourceTtsJobId: Number(bgm.source_tts_job_id), relationConfirmed: bgm.bgm_relation_confirmed },
    },
    browser: { initial, refreshed },
    media,
    bgmSha256: crypto.createHash("sha256").update(fs.readFileSync(bgmPath)).digest("hex").toUpperCase(),
    passed: true,
  };
} catch (error) {
  thrown = error;
  result = { ...result, error: error instanceof Error ? error.message : String(error), passed: false };
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const id of [...createdIds].reverse()) await deleteJob(id);
  fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
  const reportPath = path.join(evidenceDir, "tests", "tts-bgm-persistence.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Evidence: ${reportPath}`);
}

if (thrown) throw thrown;
console.log(`TTS BGM persistence: OK (parent=${parentId}, bgm=${bgmId}, restarted=${externallyRestarted})`);
