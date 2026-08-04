import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.SERVER_HANDOFF_DIR || path.join(ROOT, ".data", "repair-evidence", "04.11", "manual"));
const jobId = String(process.env.TTS_FOUR_PIECE_JOB_ID || "93");
const existingHandoffId = String(process.env.SERVER_HANDOFF_EXISTING_ID || "").trim();
const targets = ["cs1-video", "xiaohei-video", "money-printer", "kinetic-text"];

let browser;
let page;
let result = {};
try {
  browser = new BrowserCDP({ debuggingPort: 9237 });
  await browser.launch();
  page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("typeof confirmedTtsAudioPayload === 'function'", 15000);
  await page.waitForFunction("window.cs1VideoProduction?.receiveTts && window.xiaoheiProduction?.receiveHandoff && window.moneyPrinterProduction?.receiveTts && window.kineticTextProduction?.receiveTts", 30000);
  if (existingHandoffId) {
    result.existingAfterRestart = await page.evaluate(`(async function(){
      const response = await fetch('/api/tts/handoff?id=' + encodeURIComponent(${JSON.stringify(existingHandoffId)}));
      const data = await response.json();
      return { status: response.status, id: String(data?.handoff?.id || ''), revision: String(data?.handoff?.revision || '') };
    })()`);
  }
  result.beforeReload = await page.evaluate(`(async function(){
    clearProductionTtsHandoffStorage();
    const job = (await fetchJson('/api/tts/job?id=${jobId}')).job;
    await resolveTtsBgmForHandoff(job);
    const payload = confirmedTtsAudioPayload(job);
    await sendTtsPayloadToTargets(payload, ${JSON.stringify(targets)});
    const entries = Object.fromEntries(Object.keys(localStorage)
      .filter((key) => key.startsWith('dy:tts:handoff:'))
      .map((key) => [key, localStorage.getItem(key)]));
    const ids = ${JSON.stringify(targets)}.map((target) => globalThis.ttsHandoffStore.latestId(target));
    const handoffId = ids[0] || '';
    let server = null;
    let serverStatus = 0;
    try {
      const response = await fetch('/api/tts/handoff?id=' + encodeURIComponent(handoffId));
      serverStatus = response.status;
      server = await response.json();
    } catch {}
    return { entries, ids, handoffId, serverStatus, server };
  })()`);
  result.overwriteGuard = await page.evaluate(`(async function(){
    const handoffId = ${JSON.stringify(result.beforeReload.handoffId)};
    const beforeResponse = await fetch('/api/tts/handoff?id=' + encodeURIComponent(handoffId));
    const before = await beforeResponse.json();
    const changed = { ...before.handoff.payload, text: '禁止覆盖的篡改文案' };
    const writeResponse = await fetch('/api/tts/handoff', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: changed, targets: before.handoff.targets }),
    });
    const write = await writeResponse.json();
    const afterResponse = await fetch('/api/tts/handoff?id=' + encodeURIComponent(handoffId));
    const after = await afterResponse.json();
    return { writeStatus: writeResponse.status, message: String(write.message || ''), beforeText: before.handoff.payload.text, afterText: after.handoff.payload.text };
  })()`);
  await page.reload();
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("globalThis.ttsHandoffStore?.hydrate", 15000);
  result.afterReload = await page.evaluate(`(async function(){
    const restored = {};
    for (const target of ${JSON.stringify(targets)}) {
      restored[target] = await globalThis.ttsHandoffStore.hydrate(target);
    }
    return Object.fromEntries(Object.entries(restored).map(([target, item]) => [target, item ? {
      id: String(item.id || ''),
      handoffId: String(item.handoff_id || ''),
      revision: String(item.handoff_revision || ''),
      hasBgm: Boolean(item.has_bgm),
      bgmPath: String(item.bgm_path || ''),
      target: String(item.handoff_target || ''),
    } : null]));
  })()`);
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", `server-handoff-restored-${jobId}.png`));
} finally {
  if (browser) await browser.close().catch(() => {});
}

fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "server-handoff-persistence.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

assert.equal(result.beforeReload.serverStatus, 200, "服务端 handoff API 没有返回完整记录");
if (existingHandoffId) {
  assert.deepEqual(
    { status: result.existingAfterRestart?.status, id: result.existingAfterRestart?.id },
    { status: 200, id: existingHandoffId },
    "8787 重启后无法读取重启前已保存的 handoff",
  );
  assert.ok(result.existingAfterRestart?.revision);
}
assert.ok(result.beforeReload.handoffId, "浏览器没有保存最近 handoff ID");
assert.equal(new Set(result.beforeReload.ids).size, 1, "四条生产线最近 ID 不一致");
assert.equal(Object.keys(result.beforeReload.entries).length, targets.length, "localStorage 应只保留四个目标的最近 ID 键");
for (const [key, value] of Object.entries(result.beforeReload.entries)) {
  assert.match(key, /^dy:tts:handoff:id:v1:/);
  assert.equal(value, result.beforeReload.handoffId, `${key} 不应保存完整 payload`);
  assert.equal(value.includes("{"), false, `${key} 仍保存 JSON 资产`);
}
assert.equal(result.beforeReload.server?.handoff?.payload?.id, Number(jobId));
assert.equal(result.beforeReload.server?.handoff?.payload?.has_bgm, true);
assert.ok(result.beforeReload.server?.handoff?.payload?.bgm_path);
assert.equal(result.overwriteGuard.writeStatus, 400, "同一 handoff ID 的不同内容不应覆盖服务端记录");
assert.match(result.overwriteGuard.message, /内容不一致|禁止覆盖/);
assert.equal(result.overwriteGuard.afterText, result.overwriteGuard.beforeText, "被拒绝的迟到/冲突写入改变了原记录");
const revisions = new Set();
for (const target of targets) {
  const restored = result.afterReload[target];
  assert.ok(restored, `${target} 刷新后未从服务端恢复`);
  assert.equal(restored.id, jobId);
  assert.equal(restored.handoffId, result.beforeReload.handoffId);
  assert.equal(restored.hasBgm, true);
  assert.ok(restored.bgmPath);
  assert.equal(restored.target, target);
  revisions.add(restored.revision);
}
assert.equal(revisions.size, 1, "服务端恢复的四目标 revision 不一致");
console.log(`Server TTS handoff persistence: OK (job #${jobId}, ${targets.length} targets)`);
console.log(`Evidence: ${reportPath}`);
