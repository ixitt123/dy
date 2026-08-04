import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BGM_GENERATION_DIR || path.join(ROOT, ".data", "repair-evidence", "04.03", "manual"));
const parentJobId = String(process.env.TTS_BGM_PARENT_JOB_ID || "93").trim();
const fixturePath = path.join(ROOT, "fixtures", "tts", "input.json");
const fixtureBuffer = fs.readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBuffer.toString("utf8"));
const nativeFetch = globalThis.fetch.bind(globalThis);
let localApiCookie = "";

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}

function linkedParentId(job = {}) {
  return String(job.parent_tts_job_id || job.metadata?.parent_tts_job_id || job.metadata?.source_tts_job_id || "");
}

function isManagedBgm(job = {}) {
  const source = String(job.source || job.metadata?.source || "");
  return source === "minimax_music_bgm"
    && String(job.voice_id || "") === "music:clean_education_bgm";
}

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
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.jobs)) throw new Error(`读取 TTS 任务失败：${data.message || response.status}`);
  return data.jobs;
}

async function jobById(id) {
  const response = await apiFetch(`${BASE}/api/tts/job?id=${encodeURIComponent(id)}`);
  const data = await response.json();
  if (!response.ok || !data.job) throw new Error(`读取 TTS 任务 ${id} 失败：${data.message || response.status}`);
  return data.job;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

await establishLocalSession();
const parentBefore = await jobById(parentJobId);
if (parentBefore.status !== "completed") throw new Error(`父旁白 #${parentJobId} 未完成：${parentBefore.status}`);
if (String(parentBefore.text || "").trim() !== fixture.text) throw new Error(`父旁白 #${parentJobId} 不是冻结文案`);
const narrationDuration = Number(parentBefore.duration || parentBefore.audio_duration || parentBefore.metadata?.audio_duration || 0);
if (!(narrationDuration > 0)) throw new Error(`父旁白 #${parentJobId} 缺少真实时长`);
const requestedDuration = Math.round((narrationDuration + 3.5) * 10) / 10;
const jobsBefore = await jobs();
const existingBgm = jobsBefore.find((job) => isManagedBgm(job) && linkedParentId(job) === parentJobId) || null;
const beforeIds = new Set(jobsBefore.map((job) => String(job.id)));
const startedAt = Date.now();
let browser;
let page;
let bgmJob = null;
let browserState = null;
const reusedExisting = Boolean(existingBgm);

try {
  browser = new BrowserCDP({ debuggingPort: 9230 });
  await browser.launch();
  page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("document.readyState === 'complete' && typeof generateCleanEducationBgm === 'function'", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 10000);
  await page.waitForFunction(`!!document.querySelector('[data-tts-job-id="${parentJobId}"] [data-tts-load-file="audio"]')`, 30000);
  await page.click(`[data-tts-job-id="${parentJobId}"] [data-tts-load-file="audio"]`);
  await page.waitForFunction(`String(activeTtsRailJob?.id || '') === ${JSON.stringify(parentJobId)}`, 30000);
  if (existingBgm) {
    bgmJob = existingBgm;
    await page.waitForFunction(`!!document.querySelector('[data-tts-job-id="${parentJobId}"] [data-tts-load-file="bgm"]')`, 30000);
    await page.click(`[data-tts-job-id="${parentJobId}"] [data-tts-load-file="bgm"]`);
    await page.waitForFunction(`(document.querySelector('#ttsBgmAudio')?.currentSrc || '').includes('id=${existingBgm.id}')`, 30000);
  } else {
    await page.waitForFunction('Boolean(document.querySelector("#generateTtsBgmForCurrent")) && !document.querySelector("#generateTtsBgmForCurrent").disabled', 10000);
    await page.click("#generateTtsBgmForCurrent");

    const deadline = Date.now() + 600000;
    let lastHeartbeat = 0;
    while (Date.now() < deadline && !bgmJob) {
      const candidates = await jobs();
      bgmJob = candidates.find((job) => !beforeIds.has(String(job.id)) && isManagedBgm(job) && linkedParentId(job) === parentJobId) || null;
      if (!bgmJob && Date.now() - lastHeartbeat > 15000) {
        const status = await page.evaluate(`(function(){
          return {
            ttsStatus: document.querySelector('#ttsStatus')?.textContent?.trim() || '',
            bgmStatus: document.querySelector('#ttsBgmMissing')?.textContent?.trim() || '',
            bgmProgress: document.querySelector('#ttsBgmProgressLabel')?.textContent?.trim() || '',
          };
        })()`);
        console.log(`[tts-bgm-generation] waiting parent=${parentJobId} elapsed=${Math.round((Date.now() - startedAt) / 1000)}s ${JSON.stringify(status)}`);
        lastHeartbeat = Date.now();
      }
      if (!bgmJob) await sleep(1000);
    }
    if (!bgmJob) {
      const failureState = await page.evaluate(`({
        ttsStatus: document.querySelector('#ttsStatus')?.textContent?.trim() || '',
        bgmStatus: document.querySelector('#ttsBgmMissing')?.textContent?.trim() || ''
      })`);
      throw new Error(`600 秒内没有生成与父旁白 #${parentJobId} 关联的新 BGM：${JSON.stringify(failureState)}`);
    }
  }

  await page.waitForFunction(`(function(){
    const row = document.querySelector('[data-tts-job-id="${parentJobId}"]');
    return Boolean(row?.querySelector('[data-tts-load-file="bgm"]') && row.textContent.includes('四件套'));
  })()`, 30000);
  browserState = await page.evaluate(`(function(){
    const row = document.querySelector('[data-tts-job-id="${parentJobId}"]');
    return {
      parentJobId: String(activeTtsRailJob?.id || ''),
      rowText: row?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasBgmButton: Boolean(row?.querySelector('[data-tts-load-file="bgm"]')),
      ttsStatus: document.querySelector('#ttsStatus')?.textContent?.trim() || '',
      bgmProgress: document.querySelector('#ttsBgmProgressLabel')?.textContent?.trim() || '',
    };
  })()`);
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", `tts-parent-${parentJobId}-four-piece.png`));
} finally {
  if (browser) await browser.close().catch(() => {});
}

bgmJob = await jobById(bgmJob.id);
const parentAfter = await jobById(parentJobId);
const narrationPath = path.resolve(String(parentAfter.audio_path || ""));
const bgmPath = path.resolve(String(bgmJob.audio_path || ""));
if (!fs.existsSync(narrationPath)) throw new Error(`旁白文件不存在：${narrationPath}`);
if (!fs.existsSync(bgmPath)) throw new Error(`BGM 文件不存在：${bgmPath}`);
if (narrationPath === bgmPath) throw new Error("BGM 与旁白错误地指向同一文件");
if (String(bgmJob.text || "").trim() !== fixture.text) throw new Error("BGM 记录没有使用父旁白的当前文案");
if (linkedParentId(bgmJob) !== parentJobId) throw new Error("BGM 记录缺少正确的父旁白关联");

const narrationMedia = verifyMedia(narrationPath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
const bgmMedia = verifyMedia(bgmPath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
if (!narrationMedia.ok) throw new Error(`旁白媒体检查失败：${narrationMedia.errors.join("；")}`);
if (!bgmMedia.ok) throw new Error(`BGM 媒体检查失败：${bgmMedia.errors.join("；")}`);
const actualBgmDuration = Number(bgmMedia.duration?.duration || 0);
const metadataNarrationDuration = Number(bgmJob.metadata?.narration_duration || 0);
const metadataRequestedDuration = Number(bgmJob.metadata?.requested_duration || 0);
if (Math.abs(metadataNarrationDuration - narrationDuration) > 0.05) {
  throw new Error(`BGM 元数据旁白时长不一致：${metadataNarrationDuration} vs ${narrationDuration}`);
}
if (Math.abs(metadataRequestedDuration - requestedDuration) > 0.05) {
  throw new Error(`BGM 请求时长未按旁白计算：${metadataRequestedDuration} vs ${requestedDuration}`);
}
if (Math.abs(actualBgmDuration - requestedDuration) > 0.35) {
  throw new Error(`BGM 实际时长没有匹配旁白+3.5秒：${actualBgmDuration} vs ${requestedDuration}`);
}
const narrationHash = sha256(narrationPath);
const bgmHash = sha256(bgmPath);
if (narrationHash === bgmHash) throw new Error("BGM 与旁白文件内容哈希相同，不是独立产物");

const result = {
  generatedAt: new Date().toISOString(),
  reusedExisting,
  elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
  fixturePath,
  fixtureSha256: crypto.createHash("sha256").update(fixtureBuffer).digest("hex").toUpperCase(),
  parent: {
    id: parentAfter.id,
    status: parentAfter.status,
    textExact: String(parentAfter.text || "").trim() === fixture.text,
    duration: narrationDuration,
    audioPath: narrationPath,
    bytes: fs.statSync(narrationPath).size,
    sha256: narrationHash,
    media: narrationMedia,
  },
  bgm: {
    id: bgmJob.id,
    status: bgmJob.status,
    parentTtsJobId: linkedParentId(bgmJob),
    textExact: String(bgmJob.text || "").trim() === fixture.text,
    requestedDuration,
    actualDuration: actualBgmDuration,
    tailSeconds: Number((actualBgmDuration - narrationDuration).toFixed(3)),
    audioPath: bgmPath,
    bytes: fs.statSync(bgmPath).size,
    sha256: bgmHash,
    backgroundVolume: Number(bgmJob.metadata?.background_volume || 0),
    fadeOutSeconds: Number(bgmJob.metadata?.fade_out_seconds || 0),
    media: bgmMedia,
  },
  browser: browserState,
  independentFiles: narrationPath !== bgmPath && narrationHash !== bgmHash,
  passed: true,
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "tts-bgm-generation.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
const reportSha256 = crypto.createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex").toUpperCase();
console.log(`TTS BGM generation: OK (parent=${parentJobId}, bgm=${bgmJob.id}, narration=${narrationDuration}s, bgm=${actualBgmDuration}s, tail=${result.bgm.tailSeconds}s)`);
console.log(`Evidence: ${reportPath} (${reportSha256})`);
