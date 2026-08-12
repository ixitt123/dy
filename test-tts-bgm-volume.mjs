import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BGM_VOLUME_DIR || path.join(ROOT, ".data", "repair-evidence", "04.06", "manual"));
const parentJobId = String(process.env.TTS_BGM_PARENT_JOB_ID || "93").trim();
const targetPercent = 34;

function volumeStateExpression() {
  return `(function(){
    const input = document.querySelector('#ttsBgmVolume');
    const audio = document.querySelector('#ttsBgmAudio');
    return {
      inputPercent: Number(input?.value || 0),
      label: document.querySelector('#ttsBgmVolumeValue')?.textContent?.trim() || '',
      audioVolume: Number(audio?.volume ?? -1),
      storedChoices: localStorage.getItem('dy.ui.choicePreferences.v1') || '',
    };
  })()`;
}

let browser;
let page;
let result = {};
try {
  browser = new BrowserCDP({ debuggingPort: 9234 });
  await browser.launch();
  page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("document.readyState === 'complete' && typeof confirmedTtsAudioPayload === 'function'", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 10000);
  const bgmButton = `[data-tts-job-id="${parentJobId}"] [data-tts-load-file="bgm"]`;
  await page.waitForFunction(`!!document.querySelector(${JSON.stringify(bgmButton)})`, 30000);
  await page.click(bgmButton);
  await page.waitForFunction('document.querySelector("#ttsBgmAudio")?.readyState >= 1', 30000);
  result.defaultState = await page.evaluate(volumeStateExpression());

  await page.evaluate(`(function(){
    const input = document.querySelector('#ttsBgmVolume');
    input.value = '${targetPercent}';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  result.adjustedState = await page.evaluate(volumeStateExpression());

  await page.reload();
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("document.readyState === 'complete' && typeof confirmedTtsAudioPayload === 'function'", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction(`!!document.querySelector(${JSON.stringify(bgmButton)})`, 30000);
  await page.click(bgmButton);
  await page.waitForFunction('document.querySelector("#ttsBgmAudio")?.readyState >= 1', 30000);
  result.restoredState = await page.evaluate(volumeStateExpression());
  result.payload = await page.evaluate(`(async function(){
    const parent = (await fetchJson('/api/tts/job?id=${parentJobId}')).job;
    const payload = confirmedTtsAudioPayload(parent);
    return {
      has_bgm: payload?.has_bgm,
      bgm_volume: payload?.bgm_volume,
      bgm_volume_percent: payload?.bgm_volume_percent,
      bgm_path: payload?.bgm_path || '',
    };
  })()`);
  result.delivery = await page.evaluate(`(async function(){
    const parent = (await fetchJson('/api/tts/job?id=${parentJobId}')).job;
    const payload = confirmedTtsAudioPayload(parent);
    const targets = ['cs1-video', 'xiaohei-video', 'money-printer', 'kinetic-text'];
    const shared = await saveSharedTtsHandoff(payload, { sourceTarget: 'volume-regression', targets });
    const cs1 = window.cs1VideoProduction.receiveTts(shared, { navigate: false });
    const money = window.moneyPrinterProduction.receiveTts(shared, { navigate: false });
    const xiaohei = window.xiaoheiProduction.receiveTts(shared);
    const kinetic = await window.kineticTextProduction.receiveTts(shared, { navigate: false });
    return {
      stored: Object.fromEntries(targets.map((target) => {
        const item = globalThis.ttsHandoffStore.read(target);
        return [target, { bgm_volume: item?.bgm_volume, bgm_volume_percent: item?.bgm_volume_percent }];
      })),
      cs1: { bgm_volume: cs1?.bgm_volume, bgm_volume_percent: cs1?.bgm_volume_percent },
      money: { bgm_volume: money?.bgm_volume, bgm_volume_percent: money?.bgm_volume_percent },
      xiaohei: {
        bgm_volume: xiaohei?.bgm_volume,
        bgm_volume_percent: xiaohei?.bgm_volume_percent,
        job_bgm_volume: xiaohei?.ttsJob?.bgm_volume,
      },
      kinetic: {
        backgroundVolume: kinetic?.audioMix?.backgroundVolume,
        localPath: kinetic?.audioMix?.localPath || '',
      },
    };
  })()`);
  await page.waitForFunction(`(function(){
    const frame = document.querySelector('#xiaoheiProductionFrame');
    return Number(frame?.contentDocument?.querySelector('#xiaoheiBgmVolume')?.value || 0) === ${targetPercent};
  })()`, 30000);
  result.xiaoheiFrame = await page.evaluate(`(function(){
    const doc = document.querySelector('#xiaoheiProductionFrame')?.contentDocument;
    return {
      inputPercent: Number(doc?.querySelector('#xiaoheiBgmVolume')?.value || 0),
      label: doc?.querySelector('#xiaoheiBgmVolumeValue')?.textContent?.trim() || '',
    };
  })()`);
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "bgm-volume-restored.png"));
} finally {
  if (browser) await browser.close().catch(() => {});
}

fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "tts-bgm-volume.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

assert.deepEqual(
  { inputPercent: result.defaultState.inputPercent, label: result.defaultState.label, audioVolume: result.defaultState.audioVolume },
  { inputPercent: 18, label: "18%", audioVolume: 0.18 },
  `BGM 默认音量不一致：${JSON.stringify(result.defaultState)}`,
);
assert.deepEqual(
  { inputPercent: result.adjustedState.inputPercent, label: result.adjustedState.label, audioVolume: result.adjustedState.audioVolume },
  { inputPercent: targetPercent, label: `${targetPercent}%`, audioVolume: targetPercent / 100 },
  `BGM 调整后页面与预览不一致：${JSON.stringify(result.adjustedState)}`,
);
assert.deepEqual(
  { inputPercent: result.restoredState.inputPercent, label: result.restoredState.label, audioVolume: result.restoredState.audioVolume },
  { inputPercent: targetPercent, label: `${targetPercent}%`, audioVolume: targetPercent / 100 },
  `BGM 刷新恢复值不一致：${JSON.stringify(result.restoredState)}`,
);
assert.deepEqual(
  { has_bgm: result.payload.has_bgm, bgm_volume: result.payload.bgm_volume, bgm_volume_percent: result.payload.bgm_volume_percent },
  { has_bgm: true, bgm_volume: targetPercent / 100, bgm_volume_percent: targetPercent },
  `BGM 音量没有进入四件套交接数据：${JSON.stringify(result.payload)}`,
);
for (const [target, received] of Object.entries(result.delivery.stored)) {
  assert.deepEqual(received, { bgm_volume: targetPercent / 100, bgm_volume_percent: targetPercent }, `${target} 保存的 BGM 音量不一致`);
}
assert.deepEqual(result.delivery.cs1, { bgm_volume: targetPercent / 100, bgm_volume_percent: targetPercent }, "CS1 接收音量不一致");
assert.deepEqual(result.delivery.money, { bgm_volume: targetPercent / 100, bgm_volume_percent: targetPercent }, "MoneyPrinter 接收音量不一致");
assert.deepEqual(
  result.delivery.xiaohei,
  { bgm_volume: targetPercent / 100, bgm_volume_percent: targetPercent, job_bgm_volume: targetPercent / 100 },
  "小黑接收音量不一致",
);
assert.equal(result.delivery.kinetic.backgroundVolume, targetPercent, "动态大字视频接收音量不一致");
assert.equal(result.delivery.kinetic.localPath, result.payload.bgm_path, "动态大字视频接收了错误的 BGM 文件");
assert.deepEqual(result.xiaoheiFrame, { inputPercent: targetPercent, label: `${targetPercent}%` }, "小黑页面音量控件未同步");
console.log(`TTS BGM volume chain: OK (default=18%, adjusted/restored/sent=${targetPercent}%)`);
console.log(`Evidence: ${reportPath}`);
