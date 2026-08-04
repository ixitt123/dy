// 真实浏览器行为测试（01.02）。
// 通过 CDP 启动真实 Chrome，操作本机 8787 页面。测试自建两条非敏感本地 TTS fixture，
// 不调用外部 TTS/BGM，也不依赖用户历史记录；验证异步记录恢复、真实控件加载音频、播放器时间推进、
// 刷新后重新恢复列表、切换到第二条任务，以及正常页面导航。

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { openTaskStore } from "./task-store.mjs";

const BASE = "http://127.0.0.1:8787";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BROWSER_EVIDENCE_FILE = String(process.env.BROWSER_EVIDENCE_FILE || "").trim();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

let browser = null;
let page = null;
let firstJobId = "";
let secondJobId = "";
const fixtureRunId = randomUUID();
const fixtureJobIds = [];
const fixtureAudioPaths = [];

function prepareBrowserTtsFixtures() {
  const outputDir = path.join(ROOT, ".data", "tts", "audio");
  fs.mkdirSync(outputDir, { recursive: true });
  const store = openTaskStore(ROOT);
  try {
    for (const [index, frequency] of [440, 660].entries()) {
      const audioPath = path.join(outputDir, `browser-smoke-${fixtureRunId}-${index + 1}.mp3`);
      const generated = spawnSync(ffmpegPath, [
        "-y", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=1.2`,
        "-c:a", "libmp3lame", "-q:a", "4", audioPath,
      ], { encoding: "utf8", windowsHide: true });
      if (generated.status !== 0 || !fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
        throw new Error(`无法生成浏览器 TTS fixture：${generated.stderr || generated.stdout || generated.status}`);
      }
      const now = new Date().toISOString();
      const job = store.createTtsJob({
        provider: "browser_fixture",
        voice_id: `fixture-${index + 1}`,
        voice_name: `浏览器测试音色 ${index + 1}`,
        text: `浏览器播放器固定测试文案 ${index + 1}`,
        format: "mp3",
        audio_path: audioPath,
        status: "completed",
        completed_at: now,
        metadata_json: JSON.stringify({ browser_smoke_fixture: true, fixture_run_id: fixtureRunId, audio_duration: 1.2 }),
      });
      fixtureJobIds.push(job.id);
      fixtureAudioPaths.push(audioPath);
    }
  } finally {
    store.close();
  }
}

function cleanupBrowserTtsFixtures() {
  const store = openTaskStore(ROOT);
  try { store.deleteTtsJobs(fixtureJobIds); } finally { store.close(); }
  for (const audioPath of fixtureAudioPaths) fs.rmSync(audioPath, { force: true });
}

function audioButtonSelector(jobId) {
  return `[data-tts-job-id="${jobId}"] [data-tts-load-file="audio"]`;
}

prepareBrowserTtsFixtures();

test("启动 Chrome 并打开本机工作台", async () => {
  browser = new BrowserCDP({ debuggingPort: 9223 });
  await browser.launch();
  page = await browser.newPage(BASE);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
});

test("版本徽标来自当前运行实例，而不是写死的历史提交", async () => {
  await page.waitForFunction(
    '(function(){ const el = document.querySelector("#runtimeVersionBadge"); const cs = el && window.getComputedStyle(el); return Boolean(el && cs && cs.display !== "none" && (el.textContent || "").trim()); })()',
    15000,
  );
  const text = await page.getVisibleText("#runtimeVersionBadge");
  const parts = String(text || "").split("·").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3 || !parts[0] || !/[0-9a-f]{7,}/i.test(parts[1])) {
    throw new Error(`版本徽标不是当前实例的 branch / commit / build 信息：${text}`);
  }
});

test("进入 TTS 页面并等待完成记录异步恢复", async () => {
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 8000);
  await page.waitForFunction(
    'document.querySelectorAll(\'#ttsHistory [data-tts-job-id] [data-tts-load-file="audio"]\').length >= 2',
    15000,
  );
  const ids = await page.evaluate(`(function(){
    return [...document.querySelectorAll('#ttsHistory [data-tts-job-id] [data-tts-load-file="audio"]')]
      .map((button) => button.closest('[data-tts-job-id]')?.dataset.ttsJobId)
      .filter(Boolean)
      .slice(0, 2);
  })()`);
  [firstJobId, secondJobId] = ids || [];
  if (!firstJobId || !secondJobId || firstJobId === secondJobId) {
    throw new Error(`未取得两条可试听的独立 TTS 记录：${JSON.stringify(ids)}`);
  }
});

test("点击真实“音频”控件后，预览播放器加载第一条任务", async () => {
  await page.click(audioButtonSelector(firstJobId));
  await page.waitForFunction(
    '(function(){ const preview = document.querySelector("#ttsPreview"); const audio = document.querySelector("#ttsAudio"); return preview && !preview.hidden && audio && Boolean(audio.currentSrc || audio.src) && audio.readyState >= 1; })()',
    15000,
  );
  const loaded = await page.evaluate(`(function(){
    const audio = document.querySelector('#ttsAudio');
    const title = document.querySelector('#ttsPreviewTitle');
    return { src: audio?.currentSrc || audio?.src || '', title: title?.textContent || '' };
  })()`);
  if (!loaded?.src || !loaded.title) throw new Error(`第一条任务未加载到真实播放器：${JSON.stringify(loaded)}`);
});

test("真实播放器可播放，播放时间确实推进", async () => {
  const started = await page.evaluate(`(async function(){
    const audio = document.querySelector('#ttsAudio');
    if (!audio || !audio.currentSrc) return { ok: false, reason: '播放器没有已加载资源' };
    audio.muted = true;
    const before = audio.currentTime;
    try { await audio.play(); } catch (error) { return { ok: false, reason: String(error?.message || error) }; }
    return { ok: true, before };
  })()`);
  if (!started?.ok) throw new Error(`浏览器无法播放已加载音频：${started?.reason || '未知原因'}`);
  await page.waitForFunction('document.querySelector("#ttsAudio")?.currentTime > 0.15', 12000);
  await page.evaluate('(function(){ document.querySelector("#ttsAudio")?.pause(); return true; })()');
});

test("点击第二条真实任务，播放器资源随任务切换", async () => {
  const before = await page.evaluate('(function(){ const a = document.querySelector("#ttsAudio"); return a?.currentSrc || a?.src || ""; })()');
  await page.click(audioButtonSelector(secondJobId));
  await page.waitForFunction(`(function(){ const a = document.querySelector('#ttsAudio'); return Boolean(a && (a.currentSrc || a.src) && (a.currentSrc || a.src) !== ${JSON.stringify(before)}); })()`, 15000);
  const after = await page.evaluate('(function(){ const a = document.querySelector("#ttsAudio"); return a?.currentSrc || a?.src || ""; })()');
  if (!after || after === before) throw new Error("第二条任务没有替换播放器资源");
});

test("在刷新前切换至动态大字页面并检查预览画布", async () => {
  await page.clickDom('[data-nav="kinetic-text"]');
  try {
    await page.waitForFunction('!!document.querySelector(\'[data-page="kinetic-text"].active\')', 15000);
  } catch (error) {
    const activePages = await page.evaluate("[...document.querySelectorAll('[data-page].active')].map((el) => el.dataset.page)");
    throw new Error(`动态大字导航未切换，当前活动页：${JSON.stringify(activePages)}；${error.message}`);
  }
  const hasCanvas = await page.evaluate('!!document.querySelector("#kineticPreviewCanvas")');
  if (!hasCanvas) throw new Error("动态大字页面缺少预览画布");
});

test("刷新后异步恢复记录，再次通过真实控件加载音频", async () => {
  await page.reload();
  await page.waitForFunction(
    'document.querySelectorAll(\'#ttsHistory [data-tts-job-id] [data-tts-load-file="audio"]\').length >= 2',
    15000,
  );
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 8000);
  await page.evaluate(`(function(){
    window.__browserSmokePhysicalClick = null;
    document.addEventListener('click', function capture(event) {
      const button = event.target?.closest?.('[data-tts-load-file]');
      window.__browserSmokePhysicalClick = {
        tag: event.target?.tagName || '',
        loadFile: button?.dataset?.ttsLoadFile || '',
        jobId: button?.closest?.('[data-tts-job-id]')?.dataset?.ttsJobId || '',
      };
    }, { capture: true, once: true });
    return true;
  })()`);
  await page.click(audioButtonSelector(firstJobId));
  try {
    await page.waitForFunction('(function(){ const a = document.querySelector("#ttsAudio"); return Boolean(a && (a.currentSrc || a.src) && a.readyState >= 1); })()', 15000);
  } catch (error) {
    const diagnostic = await page.evaluate(`(function(){
      const audio = document.querySelector('#ttsAudio');
      const button = document.querySelector(${JSON.stringify(audioButtonSelector(firstJobId))});
      const row = button?.closest('[data-tts-job-id]');
      return {
        firstJobId: ${JSON.stringify(firstJobId)},
        buttonPresent: Boolean(button),
        rowPresent: Boolean(row),
        rowText: row?.textContent?.trim().slice(0, 240) || '',
        src: audio?.currentSrc || audio?.src || '',
        readyState: audio?.readyState ?? -1,
        networkState: audio?.networkState ?? -1,
        mediaError: audio?.error ? { code: audio.error.code, message: audio.error.message || '' } : null,
        physicalClick: window.__browserSmokePhysicalClick,
      };
    })()`);
    const domClickControl = await page.evaluate(`(async function(){
      const button = document.querySelector(${JSON.stringify(audioButtonSelector(firstJobId))});
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const audio = document.querySelector('#ttsAudio');
      return {
        buttonPresent: Boolean(button),
        src: audio?.currentSrc || audio?.src || '',
        readyState: audio?.readyState ?? -1,
        mediaError: audio?.error ? { code: audio.error.code, message: audio.error.message || '' } : null,
      };
    })()`);
    throw new Error(`${error.message}；诊断=${JSON.stringify(diagnostic)}；DOM 点击对照=${JSON.stringify(domClickControl)}`);
  }
});

test("刷新后仍能切换回控制台页面", async () => {
  await page.clickDom('[data-nav="dashboard"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="dashboard"].active\')', 8000);
});

let passed = 0;
let failed = 0;
for (const item of tests) {
  try {
    await item.fn();
    passed++;
    console.log(`✅ ${item.name}`);
  } catch (error) {
    failed++;
    console.error(`❌ ${item.name}: ${error.message}`);
  }
}

if (BROWSER_EVIDENCE_FILE && page) {
  try {
    const screenshotPath = await page.screenshot(BROWSER_EVIDENCE_FILE);
    console.log(`✅ 浏览器证据截图: ${screenshotPath}`);
  } catch (error) {
    failed++;
    console.error(`❌ 浏览器证据截图失败: ${error.message}`);
  }
}

if (browser) {
  try { await browser.close(); } catch {}
}
cleanupBrowserTtsFixtures();

console.log(`\n📊 浏览器行为测试: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
