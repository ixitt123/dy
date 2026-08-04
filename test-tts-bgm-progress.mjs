import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(process.env.TTS_BGM_PROGRESS_DIR || path.join(ROOT, ".data", "repair-evidence", "04.04", "manual"));
const parentJobId = String(process.env.TTS_BGM_PARENT_JOB_ID || "93").trim();

function progressStateExpression() {
  return `(function(){
    const panel = document.querySelector('#ttsBgmProgress');
    const bar = panel?.querySelector('[role="progressbar"]');
    return {
      hidden: Boolean(panel?.hidden),
      state: panel?.dataset?.state || '',
      completedSteps: Number(panel?.dataset?.completedSteps || 0),
      totalSteps: Number(panel?.dataset?.totalSteps || 0),
      label: document.querySelector('#ttsBgmProgressLabel')?.textContent?.trim() || '',
      percentText: document.querySelector('#ttsBgmProgressPercent')?.textContent?.trim() || '',
      ariaNow: bar?.getAttribute('aria-valuenow') || '',
      ariaText: bar?.getAttribute('aria-valuetext') || '',
      width: panel?.querySelector('.tts-main-progress-bar i')?.style?.width || '',
    };
  })()`;
}

let browser;
let page;
let states;
try {
  browser = new BrowserCDP({ debuggingPort: 9232 });
  await browser.launch();
  page = await browser.newPage("http://127.0.0.1:8787/#tts");
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("document.readyState === 'complete' && typeof generateCleanEducationBgm === 'function' && typeof fetchJson === 'function'", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 10000);

  await page.evaluate(`(async function(){
    const parent = (await fetchJson('/api/tts/job?id=${parentJobId}')).job;
    const linked = (await fetchJson('/api/tts/job?id=94')).job;
    const originalFetchJson = fetchJson;
    window.__bgmProgressOriginalFetchJson = originalFetchJson;
    window.__bgmProgressControls = {};
    window.fetchJson = function(url, options) {
      if (url === '/api/voice-assets/preview') {
        return new Promise((resolve, reject) => { window.__bgmProgressControls.preview = { resolve, reject }; });
      }
      if (url === '/api/tts/import-generated') {
        return new Promise((resolve, reject) => { window.__bgmProgressControls.save = { resolve, reject }; });
      }
      return originalFetchJson(url, options);
    };
    window.__bgmProgressLinkedJob = linked;
    window.__bgmProgressPromise = generateCleanEducationBgm(parent, parent.text);
  })()`);
  await page.waitForFunction("Boolean(window.__bgmProgressControls?.preview)", 5000);
  const generating = await page.evaluate(progressStateExpression());
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "bgm-progress-generating.png"));

  await page.evaluate(`window.__bgmProgressControls.preview.resolve({
    audio_path: window.__bgmProgressLinkedJob.audio_path,
    duration: window.__bgmProgressLinkedJob.duration,
    metadata: window.__bgmProgressLinkedJob.metadata
  })`);
  await page.waitForFunction("Boolean(window.__bgmProgressControls?.save)", 5000);
  const saving = await page.evaluate(progressStateExpression());
  await page.screenshot(path.join(evidenceDir, "browser", "bgm-progress-saving.png"));
  await page.evaluate("window.__bgmProgressControls.save.resolve({ job: window.__bgmProgressLinkedJob })");
  await page.evaluate("window.__bgmProgressPromise");
  const completed = await page.evaluate(progressStateExpression());
  await page.screenshot(path.join(evidenceDir, "browser", "bgm-progress-completed.png"));

  await page.evaluate(`(async function(){
    const parent = (await window.__bgmProgressOriginalFetchJson('/api/tts/job?id=${parentJobId}')).job;
    const originalFetchJson = window.__bgmProgressOriginalFetchJson;
    window.fetchJson = function(url, options) {
      if (url === '/api/voice-assets/preview') return Promise.reject(new Error('fixture provider failure'));
      return originalFetchJson(url, options);
    };
    window.__bgmFailurePromise = generateCleanEducationBgm(parent, parent.text);
  })()`);
  await page.evaluate("window.__bgmFailurePromise");
  const failed = await page.evaluate(progressStateExpression());
  await page.screenshot(path.join(evidenceDir, "browser", "bgm-progress-failed.png"));
  await page.evaluate("window.fetchJson = window.__bgmProgressOriginalFetchJson");
  states = { generating, saving, completed, failed };
} finally {
  if (browser) await browser.close().catch(() => {});
}

fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "tests", "tts-bgm-progress.json"), `${JSON.stringify(states, null, 2)}\n`, "utf8");

assert.deepEqual(
  {
    state: states.generating.state,
    completedSteps: states.generating.completedSteps,
    totalSteps: states.generating.totalSteps,
    percentText: states.generating.percentText,
    ariaNow: states.generating.ariaNow,
  },
  { state: "generating", completedSteps: 0, totalSteps: 2, percentText: "0%", ariaNow: "0" },
  `BGM 生成中不能显示固定假进度：${JSON.stringify(states.generating)}`,
);
assert.deepEqual(
  {
    state: states.saving.state,
    completedSteps: states.saving.completedSteps,
    totalSteps: states.saving.totalSteps,
    percentText: states.saving.percentText,
    ariaNow: states.saving.ariaNow,
  },
  { state: "saving", completedSteps: 1, totalSteps: 2, percentText: "50%", ariaNow: "50" },
  `BGM 保存阶段必须来自已完成步骤：${JSON.stringify(states.saving)}`,
);
assert.deepEqual(
  { state: states.completed.state, completedSteps: states.completed.completedSteps, percentText: states.completed.percentText, ariaNow: states.completed.ariaNow },
  { state: "completed", completedSteps: 2, percentText: "100%", ariaNow: "100" },
  `BGM 成功状态错误：${JSON.stringify(states.completed)}`,
);
assert.deepEqual(
  { state: states.failed.state, completedSteps: states.failed.completedSteps, percentText: states.failed.percentText, ariaNow: states.failed.ariaNow },
  { state: "failed", completedSteps: 0, percentText: "0%", ariaNow: "0" },
  `BGM 失败不能冒充 100% 完成：${JSON.stringify(states.failed)}`,
);
assert.match(states.failed.label, /失败/);
console.log("TTS BGM truthful progress: OK (0/2 -> 1/2 -> 2/2; failure preserves actual steps)");
