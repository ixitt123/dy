import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_SEND_SELECTED_DIR || path.join(ROOT, ".data", "repair-evidence", "04.10", "manual"));
const jobId = String(process.env.TTS_FOUR_PIECE_JOB_ID || "93");
const expectsBgm = String(process.env.TTS_EXPECTS_BGM ?? "true").toLowerCase() !== "false";
const bundleLabel = expectsBgm ? "四件套（含独立 BGM）" : "三件套";
const targets = ["cs1-video", "xiaohei-video", "money-printer", "kinetic-text"];

let browser;
let page;
let result = {};
try {
  browser = new BrowserCDP({ debuggingPort: 9236 });
  await browser.launch();
  page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 10000);
  const audioButton = `[data-tts-job-id="${jobId}"] [data-tts-load-file="audio"]`;
  await page.waitForFunction(`!!document.querySelector(${JSON.stringify(audioButton)})`, 30000);
  await page.click(audioButton);
  await page.waitForFunction(`String(activeTtsRailJob?.id || '') === ${JSON.stringify(jobId)}`, 30000);
  await page.waitForFunction(`document.querySelector('#ttsSaveTimeline')?.textContent?.includes(${JSON.stringify(expectsBgm ? "四件套" : "三件套")})`, 30000);

  await page.evaluate(`(function(){
    clearProductionTtsHandoffStorage();
    window.__ttsSelectedDelivery = { startedAt: Date.now(), calls: [], completed: [] };
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const wrap = (owner, method, target, waitMs) => {
      const original = owner[method].bind(owner);
      owner[method] = async (...args) => {
        const payload = args[0]?.ttsJob || args[0] || {};
        window.__ttsSelectedDelivery.calls.push({ target, id: String(payload.id || ''), revision: String(payload.handoff_revision || args[0]?.handoffRevision || ''), at: Date.now() });
        await delay(waitMs);
        const value = await original(...args);
        window.__ttsSelectedDelivery.completed.push({ target, id: String(payload.id || ''), revision: String(payload.handoff_revision || args[0]?.handoffRevision || ''), at: Date.now() });
        return value;
      };
    };
    wrap(window.cs1VideoProduction, 'receiveTts', 'cs1-video', 650);
    wrap(window.xiaoheiProduction, 'receiveHandoff', 'xiaohei-video', 800);
    wrap(window.moneyPrinterProduction, 'receiveTts', 'money-printer', 950);
    wrap(window.kineticTextProduction, 'receiveTts', 'kinetic-text', 1100);
    const panel = document.querySelector('#ttsCentralHandoff');
    panel.querySelectorAll('.tts-job-handoff-choice, .tts-audio-handoff-choice').forEach((input) => {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  })()`);

  await page.click("#ttsSaveTimeline");
  await page.waitForFunction(`(function(){
    const text = document.querySelector('#ttsCentralHandoffStatus')?.textContent || '';
    return text.includes(${JSON.stringify(`已发送${bundleLabel}`)}) || text.includes('发送失败');
  })()`, 30000);
  result = await page.evaluate(`(function(){
    const delivery = window.__ttsSelectedDelivery;
    const statusObservedAt = Date.now();
    const stored = Object.fromEntries(${JSON.stringify(targets)}.map((target) => {
      const item = globalThis.ttsHandoffStore.read(target);
      return [target, item ? {
        id: String(item.id || ''),
        revision: String(item.handoff_revision || ''),
        hasBgm: Boolean(item.has_bgm),
        bgmPath: String(item.bgm_path || ''),
      } : null];
    }));
    return {
      status: document.querySelector('#ttsCentralHandoffStatus')?.textContent?.trim() || '',
      timelineStatus: document.querySelector('#ttsTimelineStatus')?.textContent?.trim() || '',
      statusObservedAt,
      calls: delivery.calls,
      completed: delivery.completed,
      stored,
      checkedTargets: [...document.querySelectorAll('#ttsCentralHandoff .tts-job-handoff-choice:checked, #ttsCentralHandoff .tts-audio-handoff-choice:checked')].map((input) => input.dataset.target),
    };
  })()`);
  result.failureScenario = await page.evaluate(`(async function(){
    const calls = [];
    const payload = confirmedTtsAudioPayload((await fetchJson('/api/tts/job?id=${jobId}')).job);
    const replacements = [
      [window.cs1VideoProduction, 'receiveTts', 'cs1-video'],
      [window.xiaoheiProduction, 'receiveHandoff', 'xiaohei-video'],
      [window.moneyPrinterProduction, 'receiveTts', 'money-printer'],
      [window.kineticTextProduction, 'receiveTts', 'kinetic-text'],
    ];
    for (const [owner, method, target] of replacements) {
      owner[method] = async (value) => {
        calls.push(target);
        if (target === 'kinetic-text') throw new Error('fixture receiver failure');
        return value?.ttsJob || value;
      };
    }
    let error = '';
    try {
      await sendTtsPayloadToTargets(payload, ${JSON.stringify(targets)});
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    return { calls, error };
  })()`);
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", `${expectsBgm ? "four-piece" : "three-piece"}-send-all-${jobId}.png`));
} finally {
  if (browser) await browser.close().catch(() => {});
}

fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", `tts-send-selected-lines-${jobId}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

assert.deepEqual([...result.checkedTargets].sort(), [...targets].sort(), "中央确认区没有保持四条生产线全部勾选");
assert.ok(result.status.includes(`已发送${bundleLabel}到：`), `发送完成文案不正确：${result.status}`);
assert.equal(result.calls.length, targets.length, `应调用四条生产线，实际 ${result.calls.length}`);
assert.equal(result.completed.length, targets.length, `成功提示出现时只有 ${result.completed.length}/4 条生产线完成接收`);
assert.deepEqual(result.completed.map((item) => item.target).sort(), [...targets].sort());
assert.equal(result.completed.every((item) => item.at <= result.statusObservedAt), true, "页面在生产线完成接收前提前报告发送成功");
const revisions = new Set();
for (const target of targets) {
  const stored = result.stored[target];
  assert.ok(stored, `${target} 没有保存本次 handoff`);
  assert.equal(stored.id, jobId, `${target} 收到错误旁白任务`);
  assert.equal(stored.hasBgm, expectsBgm, `${target} 收到的三/四件套类型不正确`);
  assert.equal(Boolean(stored.bgmPath), expectsBgm, `${target} 的独立 BGM 路径与套件类型不一致`);
  assert.ok(stored.revision, `${target} 缺少 handoff revision`);
  revisions.add(stored.revision);
}
assert.equal(revisions.size, 1, "四条生产线没有收到同一 revision");
assert.deepEqual(result.failureScenario.calls.sort(), [...targets].sort(), "单线失败时没有继续尝试其余勾选生产线");
assert.match(result.failureScenario.error, /动态大字视频.*fixture receiver failure/, "单线失败没有向页面调用者明确报告");
console.log(`TTS selected production lines: OK (${bundleLabel}, ${targets.length}/4 completed before success)`);
console.log(`Evidence: ${reportPath}`);
