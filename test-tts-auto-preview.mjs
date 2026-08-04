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

async function jobs() {
  const response = await apiFetch(`${BASE}/api/tts/jobs?limit=100`);
  if (!response.ok) throw new Error(`读取 TTS 任务失败：HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.jobs) ? data.jobs : [];
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

await establishLocalSession();
const beforeIds = reuseJobId ? new Set() : new Set((await jobs()).map((job) => String(job.id)));
let browser;
let page;
let newJob = null;
let browserState = null;
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
    const submitted = await page.evaluate(`(function(){
    const text = document.querySelector('#ttsText');
    const bgm = document.querySelector('#ttsGenerateCleanEducationBgm');
    const voice = document.querySelector('#ttsPresetVoice');
    const source = document.querySelector('#ttsVoiceSource');
    const provider = document.querySelector('#ttsProvider');
    const model = document.querySelector('#ttsModel');
    function chooseNarrationVoice() {
      for (const option of [...voice.options]) {
        voice.value = option.value;
        const selected = selectedTtsVoice();
        if (selected?.id && !isTtsMusicAsset(selected.asset)) return selected;
      }
      source.value = 'all';
      updateTtsVoiceSource();
      for (const option of [...voice.options]) {
        voice.value = option.value;
        const selected = selectedTtsVoice();
        if (selected?.id && !isTtsMusicAsset(selected.asset)) return selected;
      }
      return null;
    }
    const selected = chooseNarrationVoice();
    voice.dispatchEvent(new Event('change', { bubbles: true }));
    text.value = ${JSON.stringify(fixture.text)};
    text.dispatchEvent(new Event('input', { bubbles: true }));
    if (bgm) {
      bgm.checked = false;
      bgm.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return {
      text: text.value,
      provider: provider?.value || '',
      voiceId: selected?.id || '',
      voiceLabel: voice?.selectedOptions?.[0]?.textContent?.trim() || '',
      model: model?.value || '',
      musicAsset: Boolean(selected && isTtsMusicAsset(selected.asset)),
      bgmChecked: Boolean(bgm?.checked),
      previewHiddenBefore: Boolean(document.querySelector('#ttsPreview')?.hidden),
    };
  })()`);
    if (submitted.text !== fixture.text || !submitted.provider || !submitted.voiceId || submitted.musicAsset || submitted.bgmChecked) {
      throw new Error(`TTS 冻结输入未正确装载：${JSON.stringify(submitted)}`);
    }
    console.log(`[tts-auto-preview] submit provider=${submitted.provider} voice=${submitted.voiceLabel || submitted.voiceId}`);
    await page.click("#generateTts");

    const createDeadline = Date.now() + 45000;
    while (Date.now() < createDeadline && !newJob) {
      const candidates = await jobs();
      newJob = candidates.find((job) => !beforeIds.has(String(job.id)) && String(job.text || "").trim() === fixture.text) || null;
      if (!newJob) await sleep(1000);
    }
    if (!newJob?.id) throw new Error("点击生成后 45 秒内未创建新的 TTS 任务");
    console.log(`[tts-auto-preview] created job=${newJob.id}`);

    const completionDeadline = Date.now() + 360000;
    let lastStatus = "";
    let lastHeartbeat = 0;
    while (Date.now() < completionDeadline) {
      newJob = await jobById(newJob.id);
      if (newJob.status !== lastStatus || Date.now() - lastHeartbeat > 15000) {
        console.log(`[tts-auto-preview] job=${newJob.id} status=${newJob.status} progress=${newJob.progress ?? ""} stage=${newJob.stage || ""}`);
        lastStatus = newJob.status;
        lastHeartbeat = Date.now();
      }
      if (newJob.status === "completed") break;
      if (newJob.status === "failed") throw new Error(`真实 TTS 任务失败：${newJob.error || "未知错误"}`);
      await sleep(1000);
    }
    if (newJob.status !== "completed") throw new Error(`真实 TTS 任务在 360 秒内未完成：${newJob.status}`);
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
  const beforePlay = await page.evaluate(`(function(){
    const audio = document.querySelector('#ttsAudio');
    audio.muted = true;
    const rect = audio.getBoundingClientRect();
    return {
      src: audio.currentSrc || audio.src || '',
      readyState: audio.readyState,
      duration: audio.duration,
      currentTime: audio.currentTime,
      clickPoint: { x: rect.left + 20, y: rect.top + rect.height / 2 },
      previewTitle: document.querySelector('#ttsPreviewTitle')?.textContent || '',
      previewMeta: document.querySelector('#ttsPreviewMeta')?.textContent || '',
      resultLaneVisible: Boolean(document.querySelector('.tts-result-lane')?.getBoundingClientRect().width),
      previewHidden: document.querySelector('#ttsPreview')?.hidden,
    };
  })()`);
  await page._send("Input.dispatchMouseEvent", { type: "mousePressed", x: beforePlay.clickPoint.x, y: beforePlay.clickPoint.y, button: "left", buttons: 1, clickCount: 1 });
  await page._send("Input.dispatchMouseEvent", { type: "mouseReleased", x: beforePlay.clickPoint.x, y: beforePlay.clickPoint.y, button: "left", buttons: 0, clickCount: 1 });
  await page.waitForFunction('document.querySelector("#ttsAudio")?.currentTime > 0.15', 15000);
  browserState = await page.evaluate(`(function(){
    const audio = document.querySelector('#ttsAudio');
    const state = {
      src: audio.currentSrc || audio.src || '',
      readyState: audio.readyState,
      duration: audio.duration,
      currentTime: audio.currentTime,
      paused: audio.paused,
      previewTitle: document.querySelector('#ttsPreviewTitle')?.textContent || '',
      previewMeta: document.querySelector('#ttsPreviewMeta')?.textContent || '',
      resultLaneVisible: Boolean(document.querySelector('.tts-result-lane')?.getBoundingClientRect().width),
      previewHidden: document.querySelector('#ttsPreview')?.hidden,
      activeJobId: typeof activeTtsRailJob === 'object' ? String(activeTtsRailJob?.id || '') : '',
    };
    audio.pause();
    return state;
  })()`);
  if (browserState.previewHidden || !browserState.resultLaneVisible || browserState.activeJobId !== String(newJob.id) || browserState.currentTime <= 0.15) {
    throw new Error(`新任务没有自动显示并播放正确预览：${JSON.stringify(browserState)}`);
  }

  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "tts-auto-preview.png"));
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
  generationMode: reuseJobId ? "completed-job-replay" : "new-browser-generation",
  elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
  fixturePath,
  fixtureSha256: crypto.createHash("sha256").update(fixtureBuffer).digest("hex").toUpperCase(),
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
  noHistoryAudioButtonClick: true,
  passed: true,
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "tts-auto-preview.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`TTS auto preview: OK (job=${newJob.id}, duration=${media.duration?.duration}s, played=${browserState.currentTime.toFixed(3)}s)`);
console.log(`Evidence: ${reportPath}`);
