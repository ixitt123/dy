import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BGM_PLAYER_DIR || path.join(ROOT, ".data", "repair-evidence", "R2-01.04", "manual"));
const safeAudioFixturePath = path.join(ROOT, "fixtures", "kinetic", "narration-440.wav");
const safeAudioFixtureBuffer = fs.readFileSync(safeAudioFixturePath);
const fixtureSha256 = crypto.createHash("sha256").update(safeAudioFixtureBuffer).digest("hex").toUpperCase();
const fixtureText = `R2-01.04 播放器验收 ${Date.now()}-${process.pid}`;
const keepFixtures = process.env.TTS_BGM_PLAYER_KEEP_FIXTURES === "1";
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

async function importSafeFixture({ marker, role, parentId = 0, bgmRequested = null, relationConfirmed = false }) {
  const managedAudioDir = path.join(ROOT, ".data", "tts", "audio");
  const stagingPath = path.join(managedAudioDir, `r2-01-04-${marker}-${process.pid}-${Date.now()}.wav`);
  fs.mkdirSync(managedAudioDir, { recursive: true });
  fs.copyFileSync(safeAudioFixturePath, stagingPath);
  const isBgm = role === "background_music";
  try {
    const data = await apiJson(`${BASE}/api/tts/import-generated`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audio_path: stagingPath,
        text: fixtureText,
        provider: "safe_fixture",
        voice_id: isBgm ? "music:clean_education_bgm" : `r2-01-04-${marker}`,
        voice_name: isBgm ? "R2-01.04 安全 BGM fixture" : "R2-01.04 安全旁白 fixture",
        model: isBgm ? "music-2.6-free" : "safe-fixture",
        source: isBgm ? "minimax_music_bgm" : "generated_preview",
        asset_kind: isBgm ? "minimax_music_preset" : "",
        emotion: isBgm ? "music" : "neutral",
        format: "wav",
        metadata: {
          source_fixture: path.relative(ROOT, safeAudioFixturePath).replaceAll("\\", "/"),
          source_fixture_sha256: fixtureSha256,
          audio_role: role,
          ...(bgmRequested === null ? {} : { bgm_requested: bgmRequested }),
          ...(parentId ? {
            parent_tts_job_id: Number(parentId),
            source_tts_job_id: Number(parentId),
            bgm_relation_confirmed: relationConfirmed,
            bgm_relation_source: "r2-01-04-browser-fixture",
            instrumental: true,
            background_volume: 0.18,
          } : {}),
        },
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

async function loadBgmAndPlay(page, parentId, bgmId, label) {
  const button = `[data-tts-job-id="${parentId}"] [data-tts-load-file="bgm"]`;
  await page.waitForFunction(`Boolean(document.querySelector(${JSON.stringify(button)}))`, 30000);
  await page.click(button);
  await page.waitForFunction(`(function(){
    const preview = document.querySelector('#ttsBgmPreview');
    const audio = document.querySelector('#ttsBgmAudio');
    const rect = preview?.getBoundingClientRect();
    const source = audio?.currentSrc || audio?.src || '';
    return Boolean(preview && !preview.hidden && rect?.width > 0 && rect?.height > 0
      && audio?.controls && source.includes('id=${bgmId}') && audio.readyState >= 1);
  })()`, 30000);
  const beforeClick = await page.evaluate(`(function(){
    const preview = document.querySelector('#ttsBgmPreview');
    const audio = document.querySelector('#ttsBgmAudio');
    audio.pause();
    audio.currentTime = 0;
    audio.muted = true;
    audio.scrollIntoView({ behavior: 'instant', block: 'center' });
    const audioRect = audio.getBoundingClientRect();
    return {
      label: ${JSON.stringify(label)},
      visible: !preview.hidden && preview.getBoundingClientRect().height > 0,
      controls: audio.controls,
      src: audio.currentSrc || audio.src || '',
      duration: audio.duration,
      clickPoint: { x: audioRect.left + 20, y: audioRect.top + audioRect.height / 2 },
      title: document.querySelector('#ttsBgmPreviewTitle')?.textContent?.trim() || '',
      meta: document.querySelector('#ttsBgmPreviewMeta')?.textContent?.trim() || '',
    };
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await page._send("Input.dispatchMouseEvent", { type: "mousePressed", x: beforeClick.clickPoint.x, y: beforeClick.clickPoint.y, button: "left", buttons: 1, clickCount: 1 });
  await page._send("Input.dispatchMouseEvent", { type: "mouseReleased", x: beforeClick.clickPoint.x, y: beforeClick.clickPoint.y, button: "left", buttons: 0, clickCount: 1 });
  await page.waitForFunction('document.querySelector("#ttsBgmAudio")?.currentTime > 0.15', 15000);
  const afterClick = await page.evaluate(`(function(){
    const audio = document.querySelector('#ttsBgmAudio');
    const state = { currentTime: audio.currentTime, paused: audio.paused, readyState: audio.readyState, src: audio.currentSrc || audio.src || '' };
    audio.pause();
    return state;
  })()`);
  assert.equal(beforeClick.visible, true, `${label} 播放器不可见`);
  assert.equal(beforeClick.controls, true, `${label} 缺少原生 controls`);
  assert.equal(beforeClick.src.includes(`id=${bgmId}`), true, `${label} currentSrc 未指向目标 BGM`);
  assert.equal(beforeClick.src.includes(`id=${parentId}`), false, `${label} currentSrc 错指向父任务`);
  assert.equal(afterClick.src.includes(`id=${bgmId}`), true, `${label} 播放后资源被替换`);
  assert.equal(afterClick.currentTime > 0.15, true, `${label} 物理点击后没有播放`);
  assert.equal(afterClick.readyState >= 1, true, `${label} 媒体未就绪`);
  return { beforeClick, afterClick };
}

async function loadNoBgmAndAssertCleared(page, parentId) {
  const row = `[data-tts-job-id="${parentId}"]`;
  const audioButton = `${row} [data-tts-load-file="audio"]`;
  await page.waitForFunction(`Boolean(document.querySelector(${JSON.stringify(audioButton)}))`, 30000);
  const hasBgmButton = await page.evaluate(`Boolean(document.querySelector(${JSON.stringify(`${row} [data-tts-load-file="bgm"]`)}))`);
  assert.equal(hasBgmButton, false, "无 BGM 旁白不应出现 BGM 按钮");
  await page.click(audioButton);
  await page.waitForFunction(`String(activeTtsRailJob?.id || '') === ${JSON.stringify(String(parentId))}`, 30000);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const state = await page.evaluate(`(function(){
    const preview = document.querySelector('#ttsBgmPreview');
    const audio = document.querySelector('#ttsBgmAudio');
    const missing = document.querySelector('#ttsBgmMissing');
    return {
      activeJobId: String(activeTtsRailJob?.id || ''),
      previewHidden: Boolean(preview?.hidden),
      missingVisible: Boolean(missing && !missing.hidden),
      sourceAttribute: audio?.getAttribute('src') || '',
      currentSrc: audio?.currentSrc || '',
      paused: Boolean(audio?.paused),
      currentTime: Number(audio?.currentTime || 0),
    };
  })()`);
  assert.equal(state.previewHidden, true, `无 BGM 任务仍显示旧播放器：${JSON.stringify(state)}`);
  assert.equal(state.sourceAttribute, "", `无 BGM 任务仍保留 src 属性：${JSON.stringify(state)}`);
  assert.equal(state.currentSrc, "", `无 BGM 任务仍保留 currentSrc：${JSON.stringify(state)}`);
  assert.equal(state.paused, true, `无 BGM 任务仍在播放旧音频：${JSON.stringify(state)}`);
  return state;
}

await establishLocalSession();
const jobs = [];
let browser;
let result = { generatedAt: new Date().toISOString(), passed: false };
let thrown;
try {
  const parentA = await importSafeFixture({ marker: "parent-a", role: "narration", bgmRequested: true });
  jobs.push(parentA);
  const bgmA = await importSafeFixture({ marker: "bgm-a", role: "background_music", parentId: parentA.id, relationConfirmed: true });
  jobs.push(bgmA);
  const parentB = await importSafeFixture({ marker: "parent-b", role: "narration", bgmRequested: true });
  jobs.push(parentB);
  const bgmB = await importSafeFixture({ marker: "bgm-b", role: "background_music", parentId: parentB.id, relationConfirmed: true });
  jobs.push(bgmB);
  const parentNone = await importSafeFixture({ marker: "parent-none", role: "narration", bgmRequested: false });
  jobs.push(parentNone);

  const ids = {
    parentA: Number(parentA.id),
    bgmA: Number(bgmA.id),
    parentB: Number(parentB.id),
    bgmB: Number(bgmB.id),
    parentNone: Number(parentNone.id),
  };
  const media = verifyMedia(safeAudioFixturePath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
  if (!media.ok) throw new Error(`安全 BGM fixture 媒体验证失败：${media.errors.join("；")}`);

  browser = new BrowserCDP({ debuggingPort: 9233 });
  await browser.launch();
  const page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction(`Boolean(document.querySelector('[data-tts-job-id="${ids.parentA}"]') && document.querySelector('[data-tts-job-id="${ids.parentB}"]') && document.querySelector('[data-tts-job-id="${ids.parentNone}"]'))`, 30000);

  const firstA = await loadBgmAndPlay(page, ids.parentA, ids.bgmA, "BGM A");
  const thenB = await loadBgmAndPlay(page, ids.parentB, ids.bgmB, "BGM B");
  assert.equal(thenB.beforeClick.src.includes(`id=${ids.bgmA}`), false, "切换 BGM B 后仍保留 BGM A 资源");
  const thenNone = await loadNoBgmAndAssertCleared(page, ids.parentNone);
  assert.equal(thenNone.missingVisible, true, "无 BGM 任务没有显示明确状态");

  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "bgm-a-to-b-to-none-cleared.png"));

  await page.reload();
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction(`Boolean(document.querySelector('[data-tts-job-id="${ids.parentA}"]') && document.querySelector('[data-tts-job-id="${ids.parentNone}"]'))`, 30000);
  const refreshedA = await loadBgmAndPlay(page, ids.parentA, ids.bgmA, "刷新后 BGM A");
  const refreshedNone = await loadNoBgmAndAssertCleared(page, ids.parentNone);

  const expectedDuration = Number(media.duration?.duration || 0);
  for (const state of [firstA.beforeClick, thenB.beforeClick, refreshedA.beforeClick]) {
    assert.equal(Math.abs(Number(state.duration || 0) - expectedDuration) <= 0.35, true, `${state.label} 时长与真实媒体不一致`);
  }

  result = {
    generatedAt: new Date().toISOString(),
    mode: "self-contained-safe-fixture",
    fixturePath: path.relative(ROOT, safeAudioFixturePath).replaceAll("\\", "/"),
    fixtureSha256,
    ids,
    media,
    browser: { firstA, thenB, thenNone, refreshedA, refreshedNone },
    assertions: {
      visibleWithinThirtySeconds: true,
      nativeControlsPresent: true,
      physicalPlaybackAdvanced: true,
      exactSourceFollowsSelectedBgm: true,
      taskSwitchHasNoCrosstalk: true,
      noBgmClearsAndStopsOldSource: true,
      refreshPreservesCorrectBehavior: true,
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
  const reportPath = path.join(evidenceDir, "tests", "tts-bgm-player.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const reportSha256 = crypto.createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex").toUpperCase();
  console.log(`Evidence: ${reportPath} (${reportSha256})`);
}

if (thrown) throw thrown;
console.log(`TTS BGM visible player: OK (A=${result.ids.bgmA}, B=${result.ids.bgmB}, none=${result.ids.parentNone})`);
