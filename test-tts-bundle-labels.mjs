import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BUNDLE_LABELS_DIR || path.join(ROOT, ".data", "repair-evidence", "04.09", "manual"));
const threePieceJobId = String(process.env.TTS_THREE_PIECE_JOB_ID || "92");
const fourPieceJobId = String(process.env.TTS_FOUR_PIECE_JOB_ID || "93");

function stateExpression(jobId) {
  return `(function(){
    const row = document.querySelector('[data-tts-job-id="${jobId}"]');
    return {
      jobId: '${jobId}',
      rowText: row?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      historyBundle: row?.querySelector('.tts-job-handoff-head strong')?.textContent?.trim() || '',
      hasBgmButton: Boolean(row?.querySelector('[data-tts-load-file="bgm"]')),
      saveButton: document.querySelector('#ttsSaveTimeline')?.textContent?.trim() || '',
      centralStatus: document.querySelector('#ttsCentralHandoffStatus')?.textContent?.trim() || '',
    };
  })()`;
}

let browser;
let page;
const result = {};
try {
  browser = new BrowserCDP({ debuggingPort: 9235 });
  await browser.launch();
  page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 10000);
  for (const jobId of [threePieceJobId, fourPieceJobId]) {
    const selector = `[data-tts-job-id="${jobId}"] [data-tts-load-file="audio"]`;
    await page.waitForFunction(`!!document.querySelector(${JSON.stringify(selector)})`, 30000);
    await page.click(selector);
    await page.waitForFunction(`String(activeTtsRailJob?.id || '') === ${JSON.stringify(jobId)}`, 30000);
    const expected = jobId === fourPieceJobId ? "四件套" : "三件套";
    await page.waitForFunction(`document.querySelector('#ttsSaveTimeline')?.textContent?.includes('${expected}')`, 30000);
    result[jobId === fourPieceJobId ? "fourPiece" : "threePiece"] = await page.evaluate(stateExpression(jobId));
    fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
    await page.screenshot(path.join(evidenceDir, "browser", `${expected}-${jobId}.png`));
  }
} finally {
  if (browser) await browser.close().catch(() => {});
}

fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "tts-bundle-labels.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

assert.equal(result.threePiece.historyBundle, "已生成三件套");
assert.equal(result.threePiece.hasBgmButton, false);
assert.equal(result.threePiece.saveButton, "确定修改并发送三件套到：");
assert.equal(result.threePiece.centralStatus, "点“确定修改”后发送当前三件套。");
assert.equal(result.threePiece.rowText.includes("四件套"), false, "无 BGM 记录不能显示四件套");
assert.equal(result.fourPiece.historyBundle, "已生成四件套（含独立 BGM）");
assert.equal(result.fourPiece.hasBgmButton, true);
assert.equal(result.fourPiece.saveButton, "确定修改并发送四件套（含独立 BGM）到：");
assert.equal(result.fourPiece.centralStatus, "点“确定修改”后发送当前四件套（含独立 BGM）。");
assert.equal(result.fourPiece.rowText.includes("已生成三件套"), false, "有 BGM 记录不能仍显示三件套");
console.log(`TTS bundle labels: OK (job #${threePieceJobId}=三件套, job #${fourPieceJobId}=四件套)`);
console.log(`Evidence: ${reportPath}`);
