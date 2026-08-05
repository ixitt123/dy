import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BGM_OPTION_DIR || path.join(ROOT, ".data", "repair-evidence", "R2-01.02", "manual"));
const safeAudioFixturePath = path.join(ROOT, "fixtures", "kinetic", "narration-440.wav");
const safeAudioFixtureBuffer = fs.readFileSync(safeAudioFixturePath);
const sharedText = `R2-01.02 未勾选 BGM 关联隔离 ${Date.now()}-${process.pid}`;
const keepFixtures = process.env.TTS_BGM_OPTION_KEEP_FIXTURES === "1";
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
  const stagingPath = path.join(managedAudioDir, `r2-01-02-${marker}-${process.pid}-${Date.now()}.wav`);
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
        text: sharedText,
        provider: "safe_fixture",
        voice_id: isBgm ? "music:clean_education_bgm" : `r2-01-02-${marker}`,
        voice_name: isBgm ? "R2-01.02 安全 BGM fixture" : "R2-01.02 安全旁白 fixture",
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

async function deleteFixtureJob(id) {
  if (!id) return;
  await apiJson(`${BASE}/api/tts/delete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, deleteFile: true }),
  }).catch(() => {});
}

function sqliteRelationState(ids) {
  const db = new DatabaseSync(path.join(ROOT, ".data", "tasks.sqlite"), { readOnly: true });
  try {
    const statement = db.prepare("SELECT id, metadata_json FROM tts_jobs WHERE id = ?");
    return Object.fromEntries(Object.entries(ids).map(([name, id]) => {
      const row = statement.get(Number(id));
      const metadata = JSON.parse(String(row?.metadata_json || "{}"));
      return [name, {
        id: Number(row?.id || 0),
        bgmRequested: Object.prototype.hasOwnProperty.call(metadata, "bgm_requested") ? metadata.bgm_requested : null,
        parentTtsJobId: Number(metadata.parent_tts_job_id || 0),
        sourceTtsJobId: Number(metadata.source_tts_job_id || 0),
        relationConfirmed: metadata.bgm_relation_confirmed === true,
      }];
    }));
  } finally {
    db.close();
  }
}

function publicRelationState(job) {
  return {
    id: Number(job?.id || 0),
    bgmRequested: job?.bgm_requested ?? job?.metadata?.bgm_requested ?? null,
    parentTtsJobId: Number(job?.parent_tts_job_id ?? job?.metadata?.parent_tts_job_id ?? 0),
    sourceTtsJobId: Number(job?.source_tts_job_id ?? job?.metadata?.source_tts_job_id ?? 0),
    relationConfirmed: (job?.bgm_relation_confirmed ?? job?.metadata?.bgm_relation_confirmed) === true,
  };
}

function assertRelationContract({ sqlite, api, ids }) {
  if (sqlite.unchecked.bgmRequested !== false || api.unchecked.bgmRequested !== false) {
    throw new Error(`未勾选状态没有在 SQLite/API 中显式保持 false：${JSON.stringify({ sqlite, api })}`);
  }
  if (sqlite.historicalBgm.parentTtsJobId !== ids.historical || api.historicalBgm.parentTtsJobId !== ids.historical
    || !sqlite.historicalBgm.relationConfirmed || !api.historicalBgm.relationConfirmed) {
    throw new Error(`合法历史 BGM 关系未保持精确 ID：${JSON.stringify({ sqlite, api, ids })}`);
  }
  if (sqlite.staleBgm.parentTtsJobId !== ids.unchecked || api.staleBgm.parentTtsJobId !== ids.unchecked
    || sqlite.staleBgm.relationConfirmed || api.staleBgm.relationConfirmed) {
    throw new Error(`陈旧认领 fixture 与预期不一致：${JSON.stringify({ sqlite, api, ids })}`);
  }
}

function assertDomState(state, ids, label) {
  if (state.optionChecked || !state.optionStatus.includes("未选择") || !state.optionStatus.includes("三件套")) {
    throw new Error(`${label} BGM 默认状态错误：${JSON.stringify(state)}`);
  }
  if (!state.hasNoPersistMarker) throw new Error(`${label} BGM 选择项缺少不持久化标记`);
  if (!state.historical.hasBgmButton || !state.historical.bundleLabel.includes("四件套") || !state.historical.linkedBgm
    || state.historical.linkedBgmId !== String(ids.historicalBgm)) {
    throw new Error(`${label} 合法历史四件套没有按精确 ID 恢复：${JSON.stringify(state.historical)}`);
  }
  if (state.unchecked.hasBgmButton || state.unchecked.bundleLabel.includes("四件套") || state.unchecked.linkedBgm) {
    throw new Error(`${label} 新未勾选旁白被陈旧 BGM 错误关联：${JSON.stringify(state.unchecked)}`);
  }
  if (!state.unchecked.bundleLabel.includes("三件套")) {
    throw new Error(`${label} 新未勾选旁白没有保持三件套：${JSON.stringify(state.unchecked)}`);
  }
}

async function readDomState(page, ids) {
  return page.evaluate(`(function(){
    const option = document.querySelector('#ttsGenerateCleanEducationBgm');
    function rowState(id) {
      const row = document.querySelector('[data-tts-job-id="' + id + '"]');
      const linked = typeof linkedTtsBgmJob === 'function' ? linkedTtsBgmJob({ id }) : null;
      const text = row?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        exists: Boolean(row),
        text,
        hasBgmButton: Boolean(row?.querySelector('[data-tts-load-file="bgm"]')),
        hasThreePieceLabel: text.includes('三件套'),
        hasFourPieceLabel: text.includes('四件套'),
        bundleLabel: typeof ttsHandoffBundleLabel === 'function' ? ttsHandoffBundleLabel({ id }) : '',
        linkedBgm: Boolean(linked),
        linkedBgmId: String(linked?.id || ''),
      };
    }
    return {
      optionChecked: Boolean(option?.checked),
      optionStatus: document.querySelector('#ttsBgmSelectionState')?.textContent?.trim() || '',
      hasNoPersistMarker: option?.hasAttribute('data-no-choice-persist') || false,
      historical: rowState(${JSON.stringify(String(ids.historical))}),
      unchecked: rowState(${JSON.stringify(String(ids.unchecked))}),
    };
  })()`);
}

await establishLocalSession();
const jobs = [];
let browser;
let page;
let result = { generatedAt: new Date().toISOString(), passed: false };
let thrown;
try {
  const historical = await importSafeFixture({ marker: "historical-narration", role: "narration", bgmRequested: true });
  jobs.push(historical);
  const historicalBgm = await importSafeFixture({ marker: "historical-bgm", role: "background_music", parentId: historical.id, relationConfirmed: true });
  jobs.push(historicalBgm);
  const unchecked = await importSafeFixture({ marker: "unchecked-narration", role: "narration", bgmRequested: false });
  jobs.push(unchecked);
  const staleBgm = await importSafeFixture({ marker: "stale-claim-bgm", role: "background_music", parentId: unchecked.id, relationConfirmed: false });
  jobs.push(staleBgm);

  const ids = {
    historical: Number(historical.id),
    historicalBgm: Number(historicalBgm.id),
    unchecked: Number(unchecked.id),
    staleBgm: Number(staleBgm.id),
  };
  const apiJobs = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([name, id]) => {
    const data = await apiJson(`${BASE}/api/tts/job?id=${id}`);
    return [name, publicRelationState(data.job)];
  })));
  const sqlite = sqliteRelationState(ids);

  browser = new BrowserCDP({ debuggingPort: 9229 });
  await browser.launch();
  page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("document.readyState === 'complete' && typeof syncTtsBgmSelectionState === 'function'", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction(`Boolean(document.querySelector('[data-tts-job-id="${ids.unchecked}"]') && document.querySelector('[data-tts-job-id="${ids.historical}"]'))`, 30000);
  const initial = await readDomState(page, ids);

  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "tts-bgm-explicit-association.png"));
  assertDomState(initial, ids, "首次加载");
  assertRelationContract({ sqlite, api: apiJobs, ids });

  await page.click("#ttsGenerateCleanEducationBgm");
  await page.waitForFunction('document.querySelector("#ttsGenerateCleanEducationBgm")?.checked === true', 5000);
  await page.reload();
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction(`Boolean(document.querySelector('[data-tts-job-id="${ids.unchecked}"]') && document.querySelector('[data-tts-job-id="${ids.historical}"]'))`, 30000);
  const refreshed = await readDomState(page, ids);
  assertDomState(refreshed, ids, "刷新后");

  result = {
    generatedAt: new Date().toISOString(),
    fixturePath: path.relative(ROOT, safeAudioFixturePath).replaceAll("\\", "/"),
    fixtureSha256: crypto.createHash("sha256").update(safeAudioFixtureBuffer).digest("hex").toUpperCase(),
    sharedTextSha256: crypto.createHash("sha256").update(sharedText).digest("hex").toUpperCase(),
    ids,
    sqlite,
    api: apiJobs,
    dom: { initial, refreshed },
    assertions: {
      historicalSameTextUsesExplicitIdOnly: true,
      staleUnconfirmedClaimRejected: true,
      uncheckedNarrationIsThreePiece: true,
      checkboxDoesNotPersistAcrossReload: true,
      sqliteApiDomConsistent: true,
    },
    fixturesRetainedForRestartCheck: keepFixtures,
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
  const reportPath = path.join(evidenceDir, "tests", "tts-bgm-option.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const reportSha256 = crypto.createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex").toUpperCase();
  console.log(`Evidence: ${reportPath} (${reportSha256})`);
}

if (thrown) throw thrown;
console.log(`TTS BGM option: OK (unchecked=${result.ids.unchecked}, historical=${result.ids.historical}, stale=${result.ids.staleBgm})`);
