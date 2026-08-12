import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.PRODUCTION_RECEIPTS_DIR || path.join(ROOT, ".data", "repair-evidence", "04.12", "manual"));
const jobId = String(process.env.TTS_FOUR_PIECE_JOB_ID || "93");
const existingHandoffId = String(process.env.PRODUCTION_RECEIPT_EXISTING_ID || "").trim();
const targets = ["cs1-video", "xiaohei-video", "money-printer", "kinetic-text"];
const wiring = {
  "cs1-video": fs.readFileSync(path.join(ROOT, "ui", "modules", "cs1-video.js"), "utf8"),
  "xiaohei-video": fs.readFileSync(path.join(ROOT, "ui", "modules", "ian-xiaohei-app.js"), "utf8"),
  "money-printer": fs.readFileSync(path.join(ROOT, "ui", "modules", "money-printer.js"), "utf8"),
  "kinetic-text": fs.readFileSync(path.join(ROOT, "ui", "modules", "kinetic-text.js"), "utf8"),
};

let browser;
let page;
let result = {};
try {
  browser = new BrowserCDP({ debuggingPort: 9238 });
  await browser.launch();
  page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("globalThis.ttsHandoffStore?.hydrate && window.kineticTextProduction?.receiveTts", 30000);
  if (existingHandoffId) {
    result.existingAfterRestart = await page.evaluate(`(async function(){
      const response = await fetch('/api/tts/handoff/receipts?handoffId=' + encodeURIComponent(${JSON.stringify(existingHandoffId)}));
      const data = await response.json();
      return { status: response.status, receipts: data.receipts || [] };
    })()`);
  }
  const workflow = await page.evaluate(`(async function(){
    clearProductionTtsHandoffStorage();
    const job = (await fetchJson('/api/tts/job?id=${jobId}')).job;
    await resolveTtsBgmForHandoff(job);
    const payload = confirmedTtsAudioPayload(job);
    await sendTtsPayloadToTargets(payload, ${JSON.stringify(targets)});
    const handoffId = globalThis.ttsHandoffStore.latestId('cs1-video');
    const initialResponse = await fetch('/api/tts/handoff/receipts?handoffId=' + encodeURIComponent(handoffId));
    const initial = await initialResponse.json();
    const assetIds = {};
    for (const target of ${JSON.stringify(targets)}) {
      const response = await fetch('/api/final-assets/list?source=' + encodeURIComponent(target) + '&limit=100');
      const data = await response.json();
      const asset = (data.assets || []).find((item) => item.assetId && !String(item.fileName || '').includes('.pre-bgm-'));
      if (!asset) throw new Error(target + ' 没有可验证的统一最终资产');
      assetIds[target] = asset.assetId;
    }
    const final = {};
    for (const target of ${JSON.stringify(targets)}) {
      const assetId = assetIds[target];
      const rendered = await globalThis.ttsHandoffStore.updateReceipt(target, 'rendered', { assetId });
      const verified = await globalThis.ttsHandoffStore.updateReceipt(target, 'verified', { assetId });
      const duplicate = await globalThis.ttsHandoffStore.updateReceipt(target, 'verified', { assetId });
      final[target] = { rendered, verified, duplicate };
    }
    const finalResponse = await fetch('/api/tts/handoff/receipts?handoffId=' + encodeURIComponent(handoffId));
    const finalQuery = await finalResponse.json();
    let regression = null;
    try { await globalThis.ttsHandoffStore.updateReceipt('cs1-video', 'received'); }
    catch (error) { regression = error instanceof Error ? error.message : String(error); }
    return { handoffId, assetIds, initialStatus: initialResponse.status, initial, final, finalStatus: finalResponse.status, finalQuery, regression };
  })()`);
  result = { ...result, ...workflow };
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", `production-receipts-${jobId}.png`));
} finally {
  if (browser) await browser.close().catch(() => {});
}

fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "production-receipts.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

assert.equal(result.initialStatus, 200, "服务端没有四线 receipt 查询接口");
if (existingHandoffId) {
  assert.equal(result.existingAfterRestart?.status, 200, "8787 重启后无法查询原 receipt");
  assert.equal(result.existingAfterRestart?.receipts?.length, targets.length);
  assert.equal(result.existingAfterRestart.receipts.every((item) => item.state === "verified" && item.assetId), true, "8787 重启后 receipt 状态或 assetId 丢失");
}
assert.equal(result.initial.receipts.length, targets.length);
for (const target of targets) {
  const receipt = result.initial.receipts.find((item) => item.target === target);
  assert.ok(receipt, `${target} 缺少回执`);
  assert.equal(receipt.state, "staged", `${target} 实际接收后未进入已暂存`);
  assert.deepEqual(receipt.timeline.map((item) => item.state), ["sent", "received", "staged"]);
  const verified = result.finalQuery.receipts.find((item) => item.target === target);
  assert.equal(verified.state, "verified");
  assert.equal(verified.assetId, result.assetIds[target]);
  assert.match(verified.assetId, /^asset_[a-f0-9]{24}_[a-f0-9]{8}$/, `${target} 回执不是统一最终资产 ID`);
  assert.deepEqual(verified.timeline.map((item) => item.state), ["sent", "received", "staged", "rendered", "verified"]);
  assert.equal(result.final[target].verified.timeline.length, result.final[target].duplicate.timeline.length, `${target} 幂等重报生成了重复状态`);
}
assert.match(result.regression, /不能从.*回退|状态回退/);
for (const [target, source] of Object.entries(wiring)) {
  assert.match(source, new RegExp(`updateReceipt\\("${target}", "rendered"`), `${target} 最终渲染没有登记 assetId`);
  assert.match(source, new RegExp(`updateReceipt\\("${target}", "verified"`), `${target} 成功验证没有推进 receipt`);
}
console.log(`Production receipts: OK (${targets.length} targets, sent -> received -> staged -> rendered -> verified)`);
console.log(`Evidence: ${reportPath}`);
