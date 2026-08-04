import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BGM_PLAYER_DIR || path.join(ROOT, ".data", "repair-evidence", "04.05", "manual"));
const parentJobId = String(process.env.TTS_BGM_PARENT_JOB_ID || "93").trim();
const bgmJobId = String(process.env.TTS_BGM_JOB_ID || "94").trim();
const nativeFetch = globalThis.fetch.bind(globalThis);

const session = await nativeFetch(`${BASE}/`);
const cookie = String(session.headers.get("set-cookie") || "").split(";")[0];
if (!session.ok || !cookie) throw new Error("无法建立本机 API 会话");
const bgmResponse = await nativeFetch(`${BASE}/api/tts/job?id=${encodeURIComponent(bgmJobId)}`, { headers: { cookie, origin: BASE } });
const bgmData = await bgmResponse.json();
if (!bgmResponse.ok || !bgmData.job) throw new Error(`无法读取真实 BGM #${bgmJobId}`);
const bgmJob = bgmData.job;
const bgmPath = path.resolve(String(bgmJob.audio_path || ""));
if (!fs.existsSync(bgmPath)) throw new Error(`真实 BGM 文件不存在：${bgmPath}`);
const media = verifyMedia(bgmPath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
if (!media.ok) throw new Error(`真实 BGM 媒体失败：${media.errors.join("；")}`);

let browser;
let page;
let firstLoad;
let afterPhysicalPlay;
let afterReload;
try {
  browser = new BrowserCDP({ debuggingPort: 9233 });
  await browser.launch();
  page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 10000);
  const bgmButton = `[data-tts-job-id="${parentJobId}"] [data-tts-load-file="bgm"]`;
  await page.waitForFunction(`!!document.querySelector(${JSON.stringify(bgmButton)})`, 30000);
  await page.click(bgmButton);
  await page.waitForFunction(`(function(){
    const preview = document.querySelector('#ttsBgmPreview');
    const audio = document.querySelector('#ttsBgmAudio');
    const rect = preview?.getBoundingClientRect();
    const style = preview && getComputedStyle(preview);
    return Boolean(preview && !preview.hidden && rect?.width > 0 && rect?.height > 0
      && style?.display !== 'none' && style?.visibility !== 'hidden'
      && audio?.controls && (audio.currentSrc || audio.src).includes('id=${bgmJobId}')
      && audio.readyState >= 1);
  })()`, 30000);
  await page.waitForFunction('document.querySelector("#ttsBgmAudio")?.currentTime > 0.15', 15000);
  firstLoad = await page.evaluate(`(function(){
    const preview = document.querySelector('#ttsBgmPreview');
    const audio = document.querySelector('#ttsBgmAudio');
    const rect = preview.getBoundingClientRect();
    audio.pause();
    audio.currentTime = 0;
    audio.muted = true;
    audio.scrollIntoView({ behavior: 'instant', block: 'center' });
    const audioRect = audio.getBoundingClientRect();
    return {
      visible: !preview.hidden && rect.width > 0 && rect.height > 0,
      controls: audio.controls,
      src: audio.currentSrc || audio.src || '',
      duration: audio.duration,
      autoPlayedBeforePause: true,
      clickPoint: { x: audioRect.left + 20, y: audioRect.top + audioRect.height / 2 },
      title: document.querySelector('#ttsBgmPreviewTitle')?.textContent?.trim() || '',
      meta: document.querySelector('#ttsBgmPreviewMeta')?.textContent?.trim() || '',
    };
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page._send("Input.dispatchMouseEvent", { type: "mousePressed", x: firstLoad.clickPoint.x, y: firstLoad.clickPoint.y, button: "left", buttons: 1, clickCount: 1 });
  await page._send("Input.dispatchMouseEvent", { type: "mouseReleased", x: firstLoad.clickPoint.x, y: firstLoad.clickPoint.y, button: "left", buttons: 0, clickCount: 1 });
  await page.waitForFunction('document.querySelector("#ttsBgmAudio")?.currentTime > 0.15', 15000);
  afterPhysicalPlay = await page.evaluate(`(function(){
    const audio = document.querySelector('#ttsBgmAudio');
    const state = { currentTime: audio.currentTime, paused: audio.paused, readyState: audio.readyState };
    audio.pause();
    return state;
  })()`);
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "bgm-visible-player-playing.png"));

  await page.reload();
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction(`!!document.querySelector(${JSON.stringify(bgmButton)})`, 30000);
  await page.click(bgmButton);
  await page.waitForFunction(`(function(){
    const preview = document.querySelector('#ttsBgmPreview');
    const audio = document.querySelector('#ttsBgmAudio');
    return Boolean(preview && !preview.hidden && audio?.controls && (audio.currentSrc || audio.src).includes('id=${bgmJobId}') && audio.readyState >= 1);
  })()`, 30000);
  afterReload = await page.evaluate(`(function(){
    const preview = document.querySelector('#ttsBgmPreview');
    const audio = document.querySelector('#ttsBgmAudio');
    const state = {
      visible: !preview.hidden && preview.getBoundingClientRect().height > 0,
      controls: audio.controls,
      src: audio.currentSrc || audio.src || '',
      duration: audio.duration,
    };
    audio.pause();
    return state;
  })()`);
} finally {
  if (browser) await browser.close().catch(() => {});
}

if (!firstLoad.visible || !firstLoad.controls || !firstLoad.src.includes(`id=${bgmJobId}`)) throw new Error(`BGM 播放器不可见或加载错误：${JSON.stringify(firstLoad)}`);
if (Math.abs(Number(firstLoad.duration || 0) - Number(media.duration?.duration || 0)) > 0.35) throw new Error(`播放器时长与真实 BGM 文件不一致：${firstLoad.duration}`);
if (!(afterPhysicalPlay.currentTime > 0.15) || afterPhysicalPlay.readyState < 1) throw new Error(`物理点击后 BGM 时间没有推进：${JSON.stringify(afterPhysicalPlay)}`);
if (!afterReload.visible || !afterReload.controls || !afterReload.src.includes(`id=${bgmJobId}`)) throw new Error(`刷新后 BGM 播放器没有恢复：${JSON.stringify(afterReload)}`);

const result = {
  checkedAt: new Date().toISOString(),
  parentJobId,
  bgmJobId,
  bgmPath,
  bgmSha256: crypto.createHash("sha256").update(fs.readFileSync(bgmPath)).digest("hex").toUpperCase(),
  media,
  firstLoad,
  afterPhysicalPlay,
  afterReload,
  passed: true,
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "tts-bgm-player.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`TTS BGM visible player: OK (job=${bgmJobId}, duration=${media.duration?.duration}s, played=${afterPhysicalPlay.currentTime.toFixed(3)}s)`);
console.log(`Evidence: ${reportPath}`);
