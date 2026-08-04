import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.MPT_PROGRESS_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "05.06", "manual"));
const browserDir = path.join(evidenceDir, "browser");
const testsDir = path.join(evidenceDir, "tests");
fs.mkdirSync(browserDir, { recursive: true });
fs.mkdirSync(testsDir, { recursive: true });

const browser = new BrowserCDP({ debuggingPort: 9246 });
let page;
const report = {};
try {
  await browser.launch();
  page = await browser.newPage(`${BASE}/#money-printer`);
  await page.waitForFunction("globalThis.moneyPrinterProduction?.showTaskProgress", 30000);
  report.slow = await page.evaluate(`(function(){
    const display = globalThis.moneyPrinterProduction.showTaskProgress({
      task_id: 'fixture-slow-50', state: 4, progress: 50,
      status_kind: 'processing', processing_stage: 'video',
      stateLabel: '视频合成仍在进行', progress_unchanged_seconds: 125,
      heartbeat_at: '2026-08-02T04:10:00.000Z',
      activity_message: '任务服务心跳正常；当前百分比已 125 秒未变化，长视频 FFmpeg 合成可能需要较长时间。'
    });
    return {
      display,
      percent: document.querySelector('#moneyPrinterProgressPercent')?.textContent || '',
      stage: document.querySelector('#moneyPrinterProgressStage')?.textContent || '',
      title: document.querySelector('#moneyPrinterStatus')?.textContent || '',
      detail: document.querySelector('#moneyPrinterDetail')?.textContent || '',
      isError: document.querySelector('#moneyPrinterPage')?.classList.contains('money-printer-error') || false,
    };
  })()`);
  await page.screenshot(path.join(browserDir, "money-printer-slow-50.png"));
  report.failed = await page.evaluate(`(function(){
    const display = globalThis.moneyPrinterProduction.showTaskProgress({
      task_id: 'fixture-failed-video', state: -1, progress: 50,
      status_kind: 'failed', processing_stage: 'video',
      stateLabel: '任务已经失败 · 视频合成', error: 'FFmpeg 退出码 1'
    });
    return {
      display,
      percent: document.querySelector('#moneyPrinterProgressPercent')?.textContent || '',
      stage: document.querySelector('#moneyPrinterProgressStage')?.textContent || '',
      title: document.querySelector('#moneyPrinterStatus')?.textContent || '',
      detail: document.querySelector('#moneyPrinterDetail')?.textContent || '',
      isError: document.querySelector('#moneyPrinterPage')?.classList.contains('money-printer-error') || false,
    };
  })()`);
  await page.screenshot(path.join(browserDir, "money-printer-real-failure.png"));
} finally {
  await browser.close().catch(() => {});
}

assert.equal(report.slow.percent, "50%");
assert.equal(report.slow.stage, "视频合成仍在进行");
assert.equal(report.slow.title, "视频合成仍在进行");
assert.match(report.slow.detail, /心跳正常.*125 秒未变化.*FFmpeg/);
assert.equal(report.slow.isError, false);
assert.equal(report.failed.percent, "50%");
assert.equal(report.failed.stage, "任务已经失败 · 视频合成");
assert.equal(report.failed.title, "任务已经失败");
assert.equal(report.failed.detail, "FFmpeg 退出码 1");
assert.equal(report.failed.isError, true);
fs.writeFileSync(path.join(testsDir, "money-printer-progress-browser.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log("MoneyPrinter slow 50% vs failure browser: OK");
