import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(process.env.TTS_BGM_OPTION_DIR || path.join(ROOT, ".data", "repair-evidence", "04.02", "manual"));
const narrationJobId = String(process.env.TTS_BGM_OPTION_JOB_ID || "93").trim();
let browser;
let page;
let result;
try {
  browser = new BrowserCDP({ debuggingPort: 9229 });
  await browser.launch();
  page = await browser.newPage("http://127.0.0.1:8787/#tts");
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("document.readyState === 'complete' && typeof syncTtsBgmSelectionState === 'function'", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 10000);
  await page.waitForFunction(`!!document.querySelector('[data-tts-job-id="${narrationJobId}"]')`, 20000);

  const initial = await page.evaluate(`(function(){
    const option = document.querySelector('#ttsGenerateCleanEducationBgm');
    const wrapper = option?.closest('.tts-bgm-option');
    const voiceGrid = document.querySelector('#ttsPresetVoice')?.closest('.tts-control-grid');
    const generateRow = document.querySelector('#generateTts')?.closest('.tts-generate-row');
    const row = document.querySelector('[data-tts-job-id="${narrationJobId}"]');
    const relationAfterVoice = voiceGrid?.compareDocumentPosition(wrapper) || 0;
    const relationBeforeGenerate = wrapper?.compareDocumentPosition(generateRow) || 0;
    return {
      checked: Boolean(option?.checked),
      status: document.querySelector('#ttsBgmSelectionState')?.textContent?.trim() || '',
      hasNoPersistMarker: option?.hasAttribute('data-no-choice-persist') || false,
      afterVoiceControls: Boolean(relationAfterVoice & Node.DOCUMENT_POSITION_FOLLOWING),
      beforeGenerateButton: Boolean(relationBeforeGenerate & Node.DOCUMENT_POSITION_FOLLOWING),
      rowText: row?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasBgmFileButton: Boolean(row?.querySelector('[data-tts-load-file="bgm"]')),
      linkedBgm: Boolean(linkedTtsBgmJob({ id: ${JSON.stringify(narrationJobId)} })),
    };
  })()`);
  if (initial.checked || !initial.status.includes("未选择") || !initial.status.includes("三件套")) {
    throw new Error(`BGM 默认状态错误：${JSON.stringify(initial)}`);
  }
  if (!initial.hasNoPersistMarker || !initial.afterVoiceControls || !initial.beforeGenerateButton) {
    throw new Error(`BGM 独立勾选项位置/持久化标记错误：${JSON.stringify(initial)}`);
  }
  if (!initial.rowText.includes("三件套") || initial.hasBgmFileButton || initial.linkedBgm) {
    throw new Error(`未勾选生成的旁白 ${narrationJobId} 不是纯三件套：${JSON.stringify(initial)}`);
  }

  await page.click("#ttsGenerateCleanEducationBgm");
  await page.waitForFunction('document.querySelector("#ttsGenerateCleanEducationBgm")?.checked === true', 5000);
  const selected = await page.evaluate(`(function(){
    return {
      checked: document.querySelector('#ttsGenerateCleanEducationBgm')?.checked,
      status: document.querySelector('#ttsBgmSelectionState')?.textContent?.trim() || '',
    };
  })()`);
  if (!selected.checked || !selected.status.includes("已选择")) throw new Error(`BGM 勾选没有生效：${JSON.stringify(selected)}`);

  await page.reload();
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("document.readyState === 'complete' && typeof syncTtsBgmSelectionState === 'function'", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 10000);
  const refreshed = await page.evaluate(`(function(){
    return {
      checked: Boolean(document.querySelector('#ttsGenerateCleanEducationBgm')?.checked),
      status: document.querySelector('#ttsBgmSelectionState')?.textContent?.trim() || '',
    };
  })()`);
  if (refreshed.checked || !refreshed.status.includes("未选择") || !refreshed.status.includes("三件套")) {
    throw new Error(`BGM 刷新后没有恢复默认未选中：${JSON.stringify(refreshed)}`);
  }

  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "tts-bgm-option-default.png"));
  result = { narrationJobId, initial, selected, refreshed, passed: true };
} finally {
  if (browser) await browser.close().catch(() => {});
}

fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "tts-bgm-option.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
const reportSha256 = crypto.createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex").toUpperCase();
console.log(`TTS BGM option: OK (job=${narrationJobId}, report=${reportSha256})`);
