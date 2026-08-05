import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_AUTO_PREVIEW_DIR || path.join(ROOT, ".data", "repair-evidence", "04.01", "manual"));
const fixturePath = path.join(ROOT, "fixtures", "tts", "input.json");
const fixtureBuffer = fs.readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBuffer.toString("utf8"));
const safeAudioFixturePath = path.join(ROOT, "fixtures", "kinetic", "narration-440.wav");
const safeAudioFixtureBuffer = fs.readFileSync(safeAudioFixturePath);
const startedAt = Date.now();
const reuseJobId = String(process.env.TTS_AUTO_PREVIEW_JOB_ID || "").trim();
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

async function jobById(id) {
  const response = await apiFetch(`${BASE}/api/tts/job?id=${encodeURIComponent(id)}`);
  const data = await response.json();
  if (!response.ok || !data.job) throw new Error(`读取新 TTS 任务失败：${data.message || response.status}`);
  return data.job;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function importSafeFixture({ text = fixture.text, marker = "primary" } = {}) {
  const managedAudioDir = path.join(ROOT, ".data", "tts", "audio");
  const stagingPath = path.join(managedAudioDir, `r2-01-01-${marker}-${process.pid}-${Date.now()}.wav`);
  fs.mkdirSync(managedAudioDir, { recursive: true });
  fs.copyFileSync(safeAudioFixturePath, stagingPath);
  try {
    const response = await apiFetch(`${BASE}/api/tts/import-generated`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audio_path: stagingPath,
        text,
        provider: "safe_fixture",
        voice_id: "r2-01-01-safe-narration",
        voice_name: "R2-01.01 安全旁白 fixture",
        source: "generated_preview",
        emotion: "neutral",
        speed: 1,
        volume: 50,
        pitch: 1,
        format: "wav",
        metadata: {
          source_fixture: path.relative(ROOT, safeAudioFixturePath).replaceAll("\\", "/"),
          source_fixture_sha256: crypto.createHash("sha256").update(safeAudioFixtureBuffer).digest("hex").toUpperCase(),
          audio_role: "narration",
        },
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.job?.id) throw new Error(`导入安全 TTS fixture 失败：${data.message || response.status}`);
    return data.job;
  } finally {
    fs.rmSync(stagingPath, { force: true });
  }
}

await establishLocalSession();
let browser;
let page;
let newJob = null;
let alternateJob = null;
let browserState = null;
let beforeAutomaticPlayback = null;
let switchState = null;
let refreshState = null;
let blockedFallbackState = null;

async function readPreviewState({ pause = false } = {}) {
  return page.evaluate(`(function(){
    const audio = document.querySelector('#ttsAudio');
    const state = {
      src: audio?.currentSrc || audio?.src || '',
      readyState: audio?.readyState ?? -1,
      duration: audio?.duration ?? NaN,
      currentTime: audio?.currentTime ?? 0,
      paused: audio?.paused ?? true,
      muted: audio?.muted ?? false,
      autoPreviewState: audio?.dataset?.autoPreviewState || '',
      autoPreviewJobId: audio?.dataset?.autoPreviewJobId || '',
      autoPreviewError: audio?.dataset?.autoPreviewError || '',
      previewTitle: document.querySelector('#ttsPreviewTitle')?.textContent || '',
      previewMeta: document.querySelector('#ttsPreviewMeta')?.textContent || '',
      resultLaneVisible: Boolean(document.querySelector('.tts-result-lane')?.getBoundingClientRect().width),
      previewHidden: document.querySelector('#ttsPreview')?.hidden,
      activeJobId: typeof activeTtsRailJob === 'object' ? String(activeTtsRailJob?.id || '') : '',
      statusText: document.querySelector('#ttsStatus')?.textContent || '',
    };
    if (${pause ? "true" : "false"}) audio?.pause();
    return state;
  })()`);
}

async function waitForAutomaticPlayback(jobId, label, { pause = true } = {}) {
  try {
    await page.waitForFunction(`(function(){
      const audio = document.querySelector('#ttsAudio');
      const src = audio?.currentSrc || audio?.src || '';
      return String(activeTtsRailJob?.id || '') === ${JSON.stringify(String(jobId))}
        && src.includes('id=${String(jobId)}')
        && audio.currentTime > 0.15;
    })()`, 15000);
  } catch (error) {
    const failedState = await readPreviewState();
    throw new Error(`${label} 15 秒内未自动播放：${JSON.stringify(failedState)}；${error.message}`);
  }
  const state = await readPreviewState({ pause });
  if (state.previewHidden || !state.resultLaneVisible || state.activeJobId !== String(jobId)
    || state.autoPreviewJobId !== String(jobId) || state.autoPreviewState !== "playing" || state.currentTime <= 0.15) {
    throw new Error(`${label} 自动预览状态不完整：${JSON.stringify(state)}`);
  }
  return state;
}
try {
  browser = new BrowserCDP({ debuggingPort: 9227 });
  await browser.launch();
  page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("document.readyState === 'complete' && typeof generateTts === 'function'", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 10000);
  await page.waitForFunction(`(function(){
    const voice = document.querySelector('#ttsPresetVoice');
    const button = document.querySelector('#generateTts');
    return Boolean(voice && voice.value && voice.options.length && button && !button.disabled);
  })()`, 30000);

  if (reuseJobId) {
    newJob = await jobById(reuseJobId);
    if (newJob.status !== "completed" || String(newJob.text || "").trim() !== fixture.text) {
      throw new Error(`复验任务不是当前冻结文案的已完成旁白：${JSON.stringify({ id: newJob.id, status: newJob.status, text: newJob.text })}`);
    }
    await page.evaluate(`waitForTtsJob(${JSON.stringify(reuseJobId)})`);
    console.log(`[tts-auto-preview] replay completed job=${newJob.id}`);
  } else {
    newJob = await importSafeFixture();
    if (newJob.status !== "completed" || String(newJob.text || "").trim() !== fixture.text) {
      throw new Error(`安全 TTS fixture 未形成已完成任务：${JSON.stringify({ id: newJob.id, status: newJob.status, text: newJob.text })}`);
    }
    console.log(`[tts-auto-preview] imported safe fixture job=${newJob.id}`);
    await page.evaluate(`waitForTtsJob(${JSON.stringify(newJob.id)})`);
  }

  await page.waitForFunction(`(function(){
    const preview = document.querySelector('#ttsPreview');
    const audio = document.querySelector('#ttsAudio');
    const src = audio?.currentSrc || audio?.src || '';
    const style = preview && getComputedStyle(preview);
    const rect = preview?.getBoundingClientRect();
    return Boolean(preview && !preview.hidden && style?.display !== 'none' && style?.visibility !== 'hidden' && rect?.width > 0 && rect?.height > 0 && audio && src.includes('id=${String(newJob.id)}') && audio.readyState >= 1);
  })()`, 120000);

  await page.evaluate(`(function(){
    document.querySelector('#ttsAudio')?.scrollIntoView({ behavior: 'instant', block: 'center' });
    return true;
  })()`);
  await sleep(500);
  beforeAutomaticPlayback = await readPreviewState();
  browserState = await waitForAutomaticPlayback(newJob.id, "新任务");

  alternateJob = await importSafeFixture({ text: `${fixture.text}\n切换任务验证。`, marker: "alternate" });
  await page.evaluate(`waitForTtsJob(${JSON.stringify(alternateJob.id)})`);
  const alternateState = await waitForAutomaticPlayback(alternateJob.id, "切换到另一任务");
  await page.evaluate(`waitForTtsJob(${JSON.stringify(newJob.id)})`);
  const returnedState = await waitForAutomaticPlayback(newJob.id, "切回原任务");
  switchState = { alternate: alternateState, returned: returnedState };

  await page.navigate(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("document.readyState === 'complete' && typeof waitForTtsJob === 'function'", 15000);
  await page.click('[data-nav="tts"]');
  await page.evaluate(`waitForTtsJob(${JSON.stringify(newJob.id)})`);
  refreshState = await waitForAutomaticPlayback(newJob.id, "刷新后重新加载原任务");

  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "tts-auto-preview.png"));
  blockedFallbackState = await page.evaluate(`(async function(){
    const audio = document.querySelector('#ttsAudio');
    const originalPlay = audio.play;
    audio.play = () => Promise.reject(new DOMException('test policy block', 'NotAllowedError'));
    try {
      const started = await autoPlayTtsPreview(activeTtsRailJob);
      return {
        started,
        state: audio.dataset.autoPreviewState || '',
        error: audio.dataset.autoPreviewError || '',
        controls: audio.controls,
        statusText: document.querySelector('#ttsStatus')?.textContent || '',
      };
    } finally {
      audio.play = originalPlay;
    }
  })()`);
  if (blockedFallbackState.started || blockedFallbackState.state !== "blocked"
    || !blockedFallbackState.error.startsWith("NotAllowedError:") || !blockedFallbackState.controls
    || !blockedFallbackState.statusText.includes("点击播放器")) {
    throw new Error(`自动播放策略拒绝时没有保留可操作回退：${JSON.stringify(blockedFallbackState)}`);
  }
} finally {
  if (browser) await browser.close().catch(() => {});
}

newJob = await jobById(newJob.id);
const rawAudioPath = String(newJob.audio_path || "").trim();
if (!rawAudioPath) throw new Error("真实 TTS 任务没有返回 audio_path");
const audioPath = path.resolve(rawAudioPath);
if (!fs.existsSync(audioPath) || !fs.statSync(audioPath).isFile()) throw new Error(`真实 TTS 音频文件不存在：${audioPath}`);
const media = verifyMedia(audioPath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
if (!media.ok) throw new Error(`真实 TTS 音频验证失败：${media.errors.join("；")}`);
const audioBuffer = fs.readFileSync(audioPath);
const result = {
  generatedAt: new Date().toISOString(),
  generationMode: reuseJobId ? "completed-job-replay" : "safe-fixture-import",
  elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
  fixturePath,
  fixtureSha256: crypto.createHash("sha256").update(fixtureBuffer).digest("hex").toUpperCase(),
  safeAudioFixturePath,
  safeAudioFixtureSha256: crypto.createHash("sha256").update(safeAudioFixtureBuffer).digest("hex").toUpperCase(),
  newJob: {
    id: newJob.id,
    status: newJob.status,
    provider: newJob.provider,
    voiceId: newJob.voice_id,
    voiceName: newJob.voice_name,
    format: newJob.format,
    textExact: String(newJob.text || "").trim() === fixture.text,
    audioPath,
    audioUrl: newJob.audio_url,
  },
  audio: {
    bytes: audioBuffer.length,
    sha256: crypto.createHash("sha256").update(audioBuffer).digest("hex").toUpperCase(),
    media,
  },
  browser: browserState,
  beforeAutomaticPlayback,
  switchedTask: switchState,
  refreshedTask: refreshState,
  blockedFallback: blockedFallbackState,
  alternateJob: alternateJob ? { id: alternateJob.id, status: alternateJob.status, audioUrl: alternateJob.audio_url } : null,
  noHistoryAudioButtonClick: true,
  noAudioControlClick: true,
  passed: true,
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "tts-auto-preview.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`TTS auto preview: OK (job=${newJob.id}, duration=${media.duration?.duration}s, played=${browserState.currentTime.toFixed(3)}s)`);
console.log(`Evidence: ${reportPath}`);
