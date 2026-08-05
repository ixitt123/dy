import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BUNDLE_LABELS_DIR || path.join(ROOT, ".data", "repair-evidence", "R2-01.03", "manual"));
const safeAudioFixturePath = path.join(ROOT, "fixtures", "kinetic", "narration-440.wav");
const safeAudioFixtureBuffer = fs.readFileSync(safeAudioFixturePath);
const fixtureText = `R2-01.03 关系状态验收 ${Date.now()}-${process.pid}`;
const keepFixtures = process.env.TTS_BUNDLE_LABELS_KEEP_FIXTURES === "1";
const nativeFetch = globalThis.fetch.bind(globalThis);
let localApiCookie = "";

async function establishLocalSession() {
  const response = await nativeFetch(`${BASE}/`);
  localApiCookie = String(response.headers.get("set-cookie") || "").split(";")[0];
  if (!response.ok || !localApiCookie) throw new Error("无法建立本机 API 会话");
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", localApiCookie);
  headers.set("origin", BASE);
  return nativeFetch(url, { ...options, headers });
}

async function apiJson(url, options = {}) {
  const response = await apiFetch(url, options);
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

async function importSafeFixture({ marker, role, parentId = 0, bgmRequested = null, relationConfirmed = false }) {
  const managedAudioDir = path.join(ROOT, ".data", "tts", "audio");
  const stagingPath = path.join(managedAudioDir, `r2-01-03-${marker}-${process.pid}-${Date.now()}.wav`);
  fs.mkdirSync(managedAudioDir, { recursive: true });
  fs.copyFileSync(safeAudioFixturePath, stagingPath);
  const isBgm = role === "background_music";
  const metadata = {
    source_fixture: path.relative(ROOT, safeAudioFixturePath).replaceAll("\\", "/"),
    source_fixture_sha256: crypto.createHash("sha256").update(safeAudioFixtureBuffer).digest("hex").toUpperCase(),
    audio_role: role,
    ...(bgmRequested === null ? {} : { bgm_requested: bgmRequested }),
    ...(parentId ? {
      parent_tts_job_id: Number(parentId),
      source_tts_job_id: Number(parentId),
      bgm_relation_confirmed: relationConfirmed,
      instrumental: true,
      background_volume: 0.18,
    } : {}),
  };
  try {
    const data = await apiJson(`${BASE}/api/tts/import-generated`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audio_path: stagingPath,
        text: fixtureText,
        provider: "safe_fixture",
        voice_id: isBgm ? "music:clean_education_bgm" : `r2-01-03-${marker}`,
        voice_name: isBgm ? "R2-01.03 安全 BGM fixture" : "R2-01.03 安全旁白 fixture",
        model: isBgm ? "music-2.6-free" : "safe-fixture",
        source: isBgm ? "minimax_music_bgm" : "generated_preview",
        asset_kind: isBgm ? "minimax_music_preset" : "",
        emotion: isBgm ? "music" : "neutral",
        format: "wav",
        metadata,
      }),
    });
    if (!data.job?.id) throw new Error(`导入 ${marker} fixture 后没有任务 ID`);
    return data.job;
  } finally {
    fs.rmSync(stagingPath, { force: true });
  }
}

function estimatedWords(text, duration) {
  const words = Array.from(String(text).replace(/\s+/g, ""));
  const step = duration / Math.max(1, words.length);
  return words.map((word, index) => ({
    word,
    text: word,
    start: Number((index * step).toFixed(6)),
    end: Number(((index + 1) * step).toFixed(6)),
  }));
}

async function confirmNarration(job) {
  const duration = Number(job.audio_duration || job.duration || job.metadata?.audio_duration || 1.2) || 1.2;
  const rows = [{ id: "r2-01-03-line-1", index: 1, start: 0, end: duration, text: fixtureText }];
  const data = await apiJson(`${BASE}/api/tts/alignment/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: job.id,
      title: "R2-01.03 标签验收",
      text: fixtureText,
      sentenceTimeline: rows,
      subtitleTimeline: rows,
      wordTimeline: estimatedWords(fixtureText, duration),
      duration,
      source: "r2-01-03-safe-fixture",
      confirmationMode: "r2-01-03-safe-fixture",
      preserveTimelineValues: true,
    }),
  });
  assert.equal(data.job?.alignment_status, "confirmed", `旁白 #${job.id} 未进入 confirmed`);
  return data.job;
}

async function deleteFixtureJob(id) {
  if (!id) return;
  await apiJson(`${BASE}/api/tts/delete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, deleteFile: true }),
  }).catch(() => {});
}

function sqliteState(ids) {
  const db = new DatabaseSync(path.join(ROOT, ".data", "tasks.sqlite"), { readOnly: true });
  try {
    const statement = db.prepare("SELECT id, status, metadata_json FROM tts_jobs WHERE id = ?");
    return Object.fromEntries(Object.entries(ids).map(([name, id]) => {
      const row = statement.get(Number(id));
      const metadata = JSON.parse(String(row?.metadata_json || "{}"));
      return [name, {
        id: Number(row?.id || 0),
        status: String(row?.status || ""),
        bgmRequested: Object.prototype.hasOwnProperty.call(metadata, "bgm_requested") ? metadata.bgm_requested : null,
        parentTtsJobId: Number(metadata.parent_tts_job_id || 0),
        sourceTtsJobId: Number(metadata.source_tts_job_id || 0),
        relationConfirmed: metadata.bgm_relation_confirmed === true,
        alignmentStatus: String(metadata.alignment_status || ""),
      }];
    }));
  } finally {
    db.close();
  }
}

function publicState(job) {
  return {
    id: Number(job?.id || 0),
    bgmRequested: job?.bgm_requested ?? job?.metadata?.bgm_requested ?? null,
    parentTtsJobId: Number(job?.parent_tts_job_id ?? job?.metadata?.parent_tts_job_id ?? 0),
    sourceTtsJobId: Number(job?.source_tts_job_id ?? job?.metadata?.source_tts_job_id ?? 0),
    relationConfirmed: (job?.bgm_relation_confirmed ?? job?.metadata?.bgm_relation_confirmed) === true,
    alignmentStatus: String(job?.alignment_status ?? job?.metadata?.alignment_status ?? ""),
  };
}

async function selectedBundleState(page, jobId) {
  const selector = `[data-tts-job-id="${jobId}"] [data-tts-load-file="audio"]`;
  await page.waitForFunction(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, 30000);
  await page.click(selector);
  await page.waitForFunction(`String(activeTtsRailJob?.id || '') === ${JSON.stringify(String(jobId))}`, 30000);
  return page.evaluate(`(function(){
    const jobId = ${JSON.stringify(String(jobId))};
    const row = document.querySelector('[data-tts-job-id="' + jobId + '"]');
    const files = row?.querySelector('.tts-history-files');
    const linked = typeof linkedTtsBgmJob === 'function' ? linkedTtsBgmJob({ id: jobId }) : null;
    const pseudoLabel = files ? getComputedStyle(files, '::before').content.replace(/^['"]|['"]$/g, '') : '';
    return {
      jobId,
      rowExists: Boolean(row),
      rowText: row?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      historyBundle: row?.querySelector('.tts-job-handoff-head strong')?.textContent?.trim() || '',
      filesClassHasBgm: Boolean(files?.classList.contains('has-bgm')),
      filesPseudoLabel: pseudoLabel,
      hasBgmButton: Boolean(row?.querySelector('[data-tts-load-file="bgm"]')),
      linkedBgmId: String(linked?.id || ''),
      selectorBundleLabel: typeof ttsHandoffBundleLabel === 'function' ? ttsHandoffBundleLabel({ id: jobId }) : '',
      saveButton: document.querySelector('#ttsSaveTimeline')?.textContent?.trim() || '',
      centralStatus: document.querySelector('#ttsCentralHandoffStatus')?.textContent?.trim() || '',
      bgmPreviewHidden: Boolean(document.querySelector('#ttsBgmPreview')?.hidden),
      bgmAudioSource: document.querySelector('#ttsBgmAudio')?.currentSrc || document.querySelector('#ttsBgmAudio')?.src || '',
    };
  })()`);
}

function assertThreePiece(state) {
  assert.equal(state.rowExists, true);
  assert.equal(state.historyBundle, "已生成三件套");
  assert.equal(state.filesClassHasBgm, false);
  assert.equal(state.filesPseudoLabel, "三件套");
  assert.equal(state.hasBgmButton, false);
  assert.equal(state.linkedBgmId, "");
  assert.equal(state.selectorBundleLabel, "三件套");
  assert.equal(state.saveButton, "确定修改并发送三件套到：");
  assert.equal(state.centralStatus, "点“确定修改”后发送当前三件套。");
  assert.equal(state.bgmPreviewHidden, true);
  assert.equal(state.rowText.includes("四件套"), false);
}

function assertFourPiece(state, bgmId) {
  assert.equal(state.rowExists, true);
  assert.equal(state.historyBundle, "已生成四件套（含独立 BGM）");
  assert.equal(state.filesClassHasBgm, true);
  assert.equal(state.filesPseudoLabel, "四件套");
  assert.equal(state.hasBgmButton, true);
  assert.equal(state.linkedBgmId, String(bgmId));
  assert.equal(state.selectorBundleLabel, "四件套（含独立 BGM）");
  assert.equal(state.saveButton, "确定修改并发送四件套（含独立 BGM）到：");
  assert.equal(state.centralStatus, "点“确定修改”后发送当前四件套（含独立 BGM）。");
  assert.equal(state.bgmPreviewHidden, false);
  assert.equal(state.bgmAudioSource.includes(`id=${bgmId}`), true);
  assert.equal(state.rowText.includes("已生成三件套"), false);
}

await establishLocalSession();
const jobs = [];
let browser;
let result = { generatedAt: new Date().toISOString(), passed: false };
let thrown;
try {
  const threePiece = await importSafeFixture({ marker: "three-piece-narration", role: "narration", bgmRequested: false });
  jobs.push(threePiece);
  await confirmNarration(threePiece);
  const staleBgm = await importSafeFixture({ marker: "stale-bgm", role: "background_music", parentId: threePiece.id, relationConfirmed: false });
  jobs.push(staleBgm);

  const fourPiece = await importSafeFixture({ marker: "four-piece-narration", role: "narration", bgmRequested: true });
  jobs.push(fourPiece);
  await confirmNarration(fourPiece);
  const confirmedBgm = await importSafeFixture({ marker: "confirmed-bgm", role: "background_music", parentId: fourPiece.id, relationConfirmed: true });
  jobs.push(confirmedBgm);

  const ids = {
    threePiece: Number(threePiece.id),
    staleBgm: Number(staleBgm.id),
    fourPiece: Number(fourPiece.id),
    confirmedBgm: Number(confirmedBgm.id),
  };
  const sqlite = sqliteState(ids);
  const api = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([name, id]) => {
    const data = await apiJson(`${BASE}/api/tts/job?id=${id}`);
    return [name, publicState(data.job)];
  })));

  assert.equal(sqlite.threePiece.bgmRequested, false);
  assert.equal(api.threePiece.bgmRequested, false);
  assert.equal(sqlite.threePiece.alignmentStatus, "confirmed");
  assert.equal(api.threePiece.alignmentStatus, "confirmed");
  assert.equal(sqlite.staleBgm.parentTtsJobId, ids.threePiece);
  assert.equal(sqlite.staleBgm.relationConfirmed, false);
  assert.equal(sqlite.fourPiece.bgmRequested, true);
  assert.equal(api.fourPiece.bgmRequested, true);
  assert.equal(sqlite.fourPiece.alignmentStatus, "confirmed");
  assert.equal(api.fourPiece.alignmentStatus, "confirmed");
  assert.equal(sqlite.confirmedBgm.parentTtsJobId, ids.fourPiece);
  assert.equal(sqlite.confirmedBgm.sourceTtsJobId, ids.fourPiece);
  assert.equal(sqlite.confirmedBgm.relationConfirmed, true);
  assert.deepEqual(api.confirmedBgm, {
    id: ids.confirmedBgm,
    bgmRequested: null,
    parentTtsJobId: ids.fourPiece,
    sourceTtsJobId: ids.fourPiece,
    relationConfirmed: true,
    alignmentStatus: "not_required",
  });

  browser = new BrowserCDP({ debuggingPort: 9235 });
  await browser.launch();
  const page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("document.readyState === 'complete' && typeof ttsHandoffBundleLabel === 'function'", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction(`Boolean(document.querySelector('[data-tts-job-id="${ids.threePiece}"]') && document.querySelector('[data-tts-job-id="${ids.fourPiece}"]'))`, 30000);

  const initialThreePiece = await selectedBundleState(page, ids.threePiece);
  assertThreePiece(initialThreePiece);
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", `three-piece-${ids.threePiece}.png`));

  const initialFourPiece = await selectedBundleState(page, ids.fourPiece);
  assertFourPiece(initialFourPiece, ids.confirmedBgm);
  await page.screenshot(path.join(evidenceDir, "browser", `four-piece-${ids.fourPiece}.png`));

  await page.reload();
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction(`Boolean(document.querySelector('[data-tts-job-id="${ids.threePiece}"]') && document.querySelector('[data-tts-job-id="${ids.fourPiece}"]'))`, 30000);
  const refreshedThreePiece = await selectedBundleState(page, ids.threePiece);
  assertThreePiece(refreshedThreePiece);
  const refreshedFourPiece = await selectedBundleState(page, ids.fourPiece);
  assertFourPiece(refreshedFourPiece, ids.confirmedBgm);

  result = {
    generatedAt: new Date().toISOString(),
    fixturePath: path.relative(ROOT, safeAudioFixturePath).replaceAll("\\", "/"),
    fixtureSha256: crypto.createHash("sha256").update(safeAudioFixtureBuffer).digest("hex").toUpperCase(),
    ids,
    sqlite,
    api,
    dom: {
      initial: { threePiece: initialThreePiece, fourPiece: initialFourPiece },
      refreshed: { threePiece: refreshedThreePiece, fourPiece: refreshedFourPiece },
    },
    assertions: {
      threePieceHasNoBgmButtonOrFourPieceLabel: true,
      staleUnconfirmedBgmCannotChangeBundle: true,
      confirmedExactBgmEnablesFourPieceOnly: true,
      historyAndCentralLabelsUseSameState: true,
      refreshPreservesLabelsAndButtons: true,
      sqliteApiDomConsistent: true,
    },
    fixturesRetained: keepFixtures,
    passed: true,
  };
} catch (error) {
  thrown = error;
  result = {
    ...result,
    failedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    passed: false,
  };
} finally {
  if (browser) await browser.close().catch(() => {});
  if (!keepFixtures) {
    for (const job of [...jobs].reverse()) await deleteFixtureJob(job.id);
  }
  fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
  const reportPath = path.join(evidenceDir, "tests", "tts-bundle-labels.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const reportSha256 = crypto.createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex").toUpperCase();
  console.log(`Evidence: ${reportPath} (${reportSha256})`);
}

if (thrown) throw thrown;
console.log(`TTS bundle labels: OK (job #${result.ids.threePiece}=三件套, job #${result.ids.fourPiece}=四件套)`);
