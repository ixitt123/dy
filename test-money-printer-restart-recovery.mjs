import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { findPidByPort, getCookie, getMoneyPrinterTasks, startMoneyPrinter, startUiServer, stopService, waitForHealth } from "./scripts/service-restart.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.MPT_RESTART_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "R2-01.08", "manual-restart"));
const browserDir = path.join(evidenceDir, "browser");
const testsDir = path.join(evidenceDir, "tests");
const mediaDir = path.join(evidenceDir, "media");
const fixtureDir = path.join(ROOT, "fixtures", "money-printer");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
const narrationPath = path.join(fixtureDir, fixture.narration);
const bgmPath = path.join(fixtureDir, fixture.bgm);
const backgroundPath = path.join(fixtureDir, fixture.background);
const probeId = `r2-01-08-restart-${Date.now()}`;
const handoffId = `${probeId}-handoff`;
const handoffRevision = `${probeId}-revision`;
const title = `${probeId}-final-asset`;
const initialMptPid = findPidByPort(8080);

for (const directory of [browserDir, testsDir, mediaDir]) fs.mkdirSync(directory, { recursive: true });

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function authenticatedFetch(url, options = {}) {
  const cookie = await getCookie(BASE);
  return fetch(url, { ...options, headers: { ...(options.headers || {}), cookie } });
}

function withDatabase(dbPath, action) {
  if (!fs.existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys=ON");
    return action(db);
  } finally {
    db.close();
  }
}

async function waitForMoneyPrinter() {
  startMoneyPrinter(ROOT);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      await getMoneyPrinterTasks();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("MoneyPrinterTurbo 8080 未在 60 秒内恢复健康");
}

async function deleteOfficialTask(taskId) {
  if (!taskId) return { deleted: false, reason: "missing task id" };
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:8080/api/v1/tasks/${encodeURIComponent(taskId)}`);
    if (response.status === 404) return { deleted: true, reason: "already absent" };
    const payload = await response.json().catch(() => ({}));
    const state = Number(payload?.data?.state ?? payload?.state ?? 4);
    if (state !== 4) {
      const deleted = await fetch(`http://127.0.0.1:8080/api/v1/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      return { deleted: deleted.ok, status: deleted.status, payload: await deleted.json().catch(() => ({})) };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { deleted: false, reason: "task remained busy for 60 seconds" };
}

async function cleanupProbe(result) {
  const wrapperId = String(result?.wrapperId || "");
  const assetId = String(result?.assetId || "");
  const managedTaskId = String(result?.managedTaskId || "");
  const officialTaskId = String(result?.officialTaskId || "");
  const cleanup = {
    handoff: false,
    renderedFile: false,
    managedTask: false,
    finalAsset: false,
    outputFile: false,
    workflowDir: false,
    officialTask: await deleteOfficialTask(officialTaskId),
  };
  cleanup.handoff = Boolean(withDatabase(path.join(ROOT, ".data", "tts", "handoffs.sqlite"), (db) => {
    const row = db.prepare("SELECT id, payload_json FROM tts_handoffs WHERE id=?").get(handoffId);
    if (!row) return false;
    const payload = JSON.parse(String(row.payload_json || "{}"));
    assert.equal(String(payload.id), probeId, "拒绝清理非本测试 handoff");
    return Number(db.prepare("DELETE FROM tts_handoffs WHERE id=?").run(handoffId).changes) === 1;
  }));
  withDatabase(path.join(ROOT, ".data", "money-printer.sqlite"), (db) => {
    if (wrapperId) {
      const assetRow = db.prepare("SELECT id, metadata_json FROM money_printer_assets WHERE id=?").get(wrapperId);
      if (assetRow) {
        const metadata = JSON.parse(String(assetRow.metadata_json || "{}"));
        assert.equal(metadata.assetId, assetId, "包装记录与最终资产 ID 不一致，拒绝清理");
        cleanup.renderedFile = Number(db.prepare("DELETE FROM money_printer_assets WHERE id=?").run(wrapperId).changes) === 1;
      }
    }
    if (managedTaskId) {
      const job = db.prepare("SELECT id, official_task_id FROM money_printer_jobs WHERE id=?").get(managedTaskId);
      if (job) {
        assert.equal(job.official_task_id, officialTaskId, "包装任务与上游 ID 不一致，拒绝清理");
        cleanup.managedTask = Number(db.prepare("DELETE FROM money_printer_jobs WHERE id=?").run(managedTaskId).changes) === 1;
      }
    }
  });
  if (assetId) {
    cleanup.finalAsset = Boolean(withDatabase(path.join(ROOT, ".data", "tasks.sqlite"), (db) => {
      const row = db.prepare("SELECT asset_id, source, source_ref FROM final_assets WHERE asset_id=?").get(assetId);
      if (!row) return false;
      assert.equal(row.source, "money-printer", "拒绝清理非 MoneyPrinter 最终资产");
      assert.equal(row.source_ref, wrapperId, "最终资产不属于本测试包装 ID，拒绝清理");
      return Number(db.prepare("DELETE FROM final_assets WHERE asset_id=?").run(assetId).changes) === 1;
    }));
  }
  const rawOutputPath = String(result?.outputPath || "").trim();
  const outputPath = rawOutputPath ? path.resolve(rawOutputPath) : "";
  if (outputPath && fs.existsSync(outputPath)) {
    assert.ok(path.basename(outputPath).startsWith(title), "拒绝删除非本测试输出文件");
    fs.rmSync(outputPath);
    cleanup.outputFile = true;
  }
  if (wrapperId) {
    const workflowRoot = path.resolve(ROOT, ".data", "money-printer");
    const workflowDir = path.resolve(workflowRoot, wrapperId);
    if (fs.existsSync(workflowDir)) {
      assert.equal(path.dirname(workflowDir), workflowRoot, "拒绝清理工作流根目录之外的路径");
      fs.rmSync(workflowDir, { recursive: true, force: true });
      cleanup.workflowDir = true;
    }
  }
  return cleanup;
}

let creationBrowser;
let recoveryBrowser;
let page;
let created;
let managedTask;
let beforePid;
let afterPid;
let moneyPrinterPid;
let moneyPrinterPidAfterRestart;
let thrown;
let recovery = {
  checkedAt: new Date().toISOString(),
  mode: "real-service-restart-fresh-browser",
  probeId,
  handoffId,
  passed: false,
};

try {
  await waitForMoneyPrinter();
  moneyPrinterPid = findPidByPort(8080);
  assert.ok(moneyPrinterPid, "MoneyPrinterTurbo 8080 没有监听 PID");
  creationBrowser = new BrowserCDP({ debuggingPort: 9245 });
  await creationBrowser.launch();
  page = await creationBrowser.newPage(`${BASE}/#money-printer`);
  await page.waitForFunction("globalThis.moneyPrinterProduction?.showFinalAsset && globalThis.ttsHandoffStore?.save", 30000);
  created = await page.evaluate(`(async function(){
    const payload = {
      id: ${JSON.stringify(probeId)},
      title: ${JSON.stringify(title)},
      final_text: '重启恢复固定回归字幕',
      original_text: '重启恢复固定回归字幕',
      audio_path: ${JSON.stringify(narrationPath)},
      audio_duration: 2,
      alignment_status: 'confirmed',
      alignment_confirmed_at: new Date().toISOString(),
      sentence_timeline: ${JSON.stringify(fixture.segments)},
      subtitle_timeline: ${JSON.stringify(fixture.segments)},
      handoff_id: ${JSON.stringify(handoffId)},
      handoff_revision: ${JSON.stringify(handoffRevision)},
      include_bgm: true,
      bgm_path: ${JSON.stringify(bgmPath)},
      bgm_name: '固定 110Hz BGM',
      bgm_volume: ${Number(fixture.feature.bgmVolume)}
    };
    const saved = await globalThis.ttsHandoffStore.save(payload, ['money-printer']);
    const response = await fetch('/api/money-printer/render-final', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: ${JSON.stringify(title)},
        tts: saved,
        text: '重启恢复固定回归字幕',
        handoff_id: saved.handoff_id,
        revision: saved.handoff_revision,
        includeBgm: true,
        bgm_file: saved.bgm_path,
        bgm_volume: saved.bgm_volume,
        background_video: ${JSON.stringify(backgroundPath)},
        segments: ${JSON.stringify(fixture.segments)},
        settings: ${JSON.stringify(fixture.settings)}
      })
    });
    return { status: response.status, body: await response.json() };
  })()`);
  assert.equal(created.status, 200, created.body?.message);
  assert.equal(created.body.id, created.body.wrapperId, "旧 id 没有保持包装 ID");
  assert.notEqual(created.body.wrapperId, created.body.assetId, "包装 ID 与最终资产 ID 被错误合并");

  const taskResponse = await authenticatedFetch(`${BASE}/api/money-printer/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({
      video_subject: `${probeId} 包装任务映射`,
      video_script: "这是 MoneyPrinter 包装任务映射的固定回归任务。",
      video_source: "local",
      video_materials: [backgroundPath],
      custom_audio_file: narrationPath,
      subtitle_enabled: false,
      bgm_type: "none",
      video_aspect: "16:9",
      video_count: 1,
      video_clip_duration: 2,
    }),
  });
  const taskPayload = await taskResponse.json();
  assert.equal(taskResponse.status, 202, taskPayload?.message);
  managedTask = taskPayload.task;
  assert.ok(managedTask?.task_id && managedTask?.official_task_id, "包装任务或官方 taskId 缺失");
  assert.notEqual(managedTask.task_id, managedTask.official_task_id, "主程序包装任务 ID 与上游 ID 被错误合并");
  const officialTasks = await getMoneyPrinterTasks();
  assert.ok(officialTasks.some((task) => String(task.task_id || task.id || "") === managedTask.official_task_id), "官方 8080 未登记新任务");
  await creationBrowser.close();
  creationBrowser = null;
  page = null;

  const beforeResponse = await authenticatedFetch(`${BASE}${created.body.videoUrl}`);
  const beforeBytes = Buffer.from(await beforeResponse.arrayBuffer());
  const legacyBefore = await authenticatedFetch(`${BASE}/api/money-printer/file?id=${encodeURIComponent(created.body.wrapperId)}`);
  const legacyBeforeBytes = Buffer.from(await legacyBefore.arrayBuffer());
  assert.equal(beforeResponse.status, 200);
  assert.equal(beforeResponse.headers.get("x-final-asset-id"), created.body.assetId);
  assert.equal(legacyBefore.status, 200);
  assert.equal(sha256Buffer(legacyBeforeBytes), sha256Buffer(beforeBytes), "兼容包装文件入口与注册表文件不一致");

  beforePid = await stopService(8787, BASE).then((result) => result.pid);
  startUiServer(ROOT);
  assert.equal(await waitForHealth(BASE, 20000), true, "8787 重启后未恢复健康");
  afterPid = findPidByPort(8787);
  assert.ok(afterPid, "8787 重启后没有监听 PID");
  assert.notEqual(afterPid, beforePid, "8787 PID 没有变化，未发生真实重启");
  moneyPrinterPidAfterRestart = findPidByPort(8080);
  assert.equal(moneyPrinterPidAfterRestart, moneyPrinterPid, "8787 重启不应替换独立的 MoneyPrinterTurbo 8080 进程");

  const afterResponse = await authenticatedFetch(`${BASE}${created.body.videoUrl}`);
  const afterBytes = Buffer.from(await afterResponse.arrayBuffer());
  const afterDownloadResponse = await authenticatedFetch(`${BASE}${created.body.downloadUrl}`);
  const afterDownloadBytes = Buffer.from(await afterDownloadResponse.arrayBuffer());
  const legacyAfter = await authenticatedFetch(`${BASE}/api/money-printer/file?id=${encodeURIComponent(created.body.wrapperId)}`);
  const legacyAfterBytes = Buffer.from(await legacyAfter.arrayBuffer());
  const recoveredTaskResponse = await authenticatedFetch(`${BASE}/api/money-printer/task?id=${encodeURIComponent(managedTask.task_id)}`);
  const recoveredTaskPayload = await recoveredTaskResponse.json();
  const registryResponse = await authenticatedFetch(`${BASE}/api/final-assets/list?source=money-printer&limit=100`);
  const registryPayload = await registryResponse.json();
  const registryAsset = (registryPayload.assets || []).find((asset) => asset.assetId === created.body.assetId);
  const retainedMediaPath = path.join(mediaDir, "mpt-restart-recovered.mp4");
  fs.writeFileSync(retainedMediaPath, afterDownloadBytes);
  const media = verifyMedia(retainedMediaPath, { expectAudio: true, expectVideo: true, minDuration: 1 });

  recoveryBrowser = new BrowserCDP({ debuggingPort: 9245 });
  await recoveryBrowser.launch();
  page = await recoveryBrowser.newPage(`${BASE}/#money-printer`);
  await page.waitForFunction("globalThis.moneyPrinterProduction?.showFinalAsset", 30000);
  const pageRecovery = await page.evaluate(`(function(){
    const urls = globalThis.moneyPrinterProduction.showFinalAsset(${JSON.stringify(created.body)});
    return {
      urls,
      taskId: document.querySelector('#moneyPrinterTaskId')?.textContent?.trim() || '',
      assetId: document.querySelector('.money-printer-final-asset')?.dataset.finalAssetId || '',
      previewSrc: document.querySelector('#moneyPrinterFinalVideo')?.getAttribute('src') || '',
      downloadHref: document.querySelector('#moneyPrinterFinalDownload')?.getAttribute('href') || ''
    };
  })()`);
  await page.waitForFunction("document.querySelector('#moneyPrinterFinalVideo')?.readyState >= 1 && document.querySelector('#moneyPrinterFinalVideo')?.duration > 0", 15000);
  await page.click("#moneyPrinterFinalVideo");
  await page.waitForFunction("document.querySelector('#moneyPrinterFinalVideo')?.currentTime > 0.1", 10000);
  pageRecovery.playbackTime = await page.evaluate("document.querySelector('#moneyPrinterFinalVideo').currentTime");
  await page.screenshot(path.join(browserDir, "money-printer-recovered-after-restart.png"));
  await recoveryBrowser.close();
  recoveryBrowser = null;
  page = null;

  recovery = {
    ...recovery,
    wrapperId: created.body.wrapperId,
    assetId: created.body.assetId,
    videoUrl: created.body.videoUrl,
    downloadUrl: created.body.downloadUrl,
    outputPath: created.body.outputPath,
    beforePid,
    afterPid,
    moneyPrinterPid,
    moneyPrinterPidAfterRestart,
    beforeStatus: beforeResponse.status,
    afterStatus: afterResponse.status,
    beforeAssetHeader: beforeResponse.headers.get("x-final-asset-id") || "",
    afterAssetHeader: afterResponse.headers.get("x-final-asset-id") || "",
    beforeSha256: sha256Buffer(beforeBytes),
    afterSha256: sha256Buffer(afterBytes),
    downloadStatus: afterDownloadResponse.status,
    downloadSha256: sha256Buffer(afterDownloadBytes),
    legacyAfterStatus: legacyAfter.status,
    legacyAfterSha256: sha256Buffer(legacyAfterBytes),
    retainedMediaPath,
    media,
    managedTaskId: managedTask.task_id,
    officialTaskId: managedTask.official_task_id,
    recoveredTaskStatus: recoveredTaskResponse.status,
    recoveredOfficialTaskId: recoveredTaskPayload?.task?.official_task_id || "",
    registryAsset,
    pageRecovery,
  };
  assert.equal(afterResponse.status, 200, `8787 重启后最终 assetId ${recovery.assetId} 无法恢复`);
  assert.equal(recovery.afterAssetHeader, recovery.assetId, "重启后响应头最终资产 ID 不一致");
  assert.equal(recovery.afterSha256, recovery.beforeSha256, "重启后最终文件哈希发生变化");
  assert.equal(afterDownloadResponse.status, 200, "重启后的下载入口无法读取最终文件");
  assert.equal(recovery.downloadSha256, recovery.beforeSha256, "重启后下载文件哈希发生变化");
  assert.equal(recovery.legacyAfterStatus, 200, "重启后包装文件兼容入口无法恢复");
  assert.equal(recovery.legacyAfterSha256, recovery.beforeSha256, "包装文件兼容入口哈希不一致");
  assert.equal(recoveredTaskResponse.status, 200, `8787 重启后包装任务 ${managedTask.task_id} 无法恢复`);
  assert.equal(recovery.recoveredOfficialTaskId, managedTask.official_task_id, "重启后恢复的官方 taskId 不一致");
  assert.equal(registryAsset?.assetId, recovery.assetId, "重启后注册表没有相同最终资产 ID");
  assert.equal(registryAsset?.sourceRef, recovery.wrapperId, "重启后注册表包装引用不一致");
  assert.equal(pageRecovery.taskId, recovery.wrapperId, "刷新页面显示的包装 ID 不一致");
  assert.equal(pageRecovery.assetId, recovery.assetId, "刷新页面显示的最终资产 ID 不一致");
  assert.equal(pageRecovery.urls.assetId, recovery.assetId);
  assert.equal(pageRecovery.previewSrc, recovery.videoUrl);
  assert.equal(pageRecovery.downloadHref, recovery.downloadUrl);
  assert.ok(pageRecovery.playbackTime > 0.1, "重启后最终成片不能播放");
  assert.equal(media.ok, true, JSON.stringify(media.errors));
  recovery.passed = true;
} catch (error) {
  thrown = error;
  recovery.error = error instanceof Error ? error.stack || error.message : String(error);
  if (page) await page.screenshot(path.join(browserDir, "money-printer-restart-failure.png")).catch(() => {});
} finally {
  await creationBrowser?.close().catch(() => {});
  await recoveryBrowser?.close().catch(() => {});
  if (!findPidByPort(8787)) {
    startUiServer(ROOT);
    await waitForHealth(BASE, 20000).catch(() => false);
  }
  try {
    recovery.wrapperId ||= String(created?.body?.wrapperId || created?.body?.id || "");
    recovery.assetId ||= String(created?.body?.assetId || "");
    recovery.outputPath ||= String(created?.body?.outputPath || "");
    recovery.managedTaskId ||= String(managedTask?.task_id || "");
    recovery.officialTaskId ||= String(managedTask?.official_task_id || "");
    recovery.cleanup = await cleanupProbe(recovery);
    if (!initialMptPid) recovery.cleanup.moneyPrinterService = await stopService(8080, "http://127.0.0.1:8080");
  } catch (cleanupError) {
    recovery.cleanupError = cleanupError instanceof Error ? cleanupError.stack || cleanupError.message : String(cleanupError);
    thrown ||= cleanupError;
  }
  fs.writeFileSync(path.join(testsDir, "money-printer-restart-recovery.json"), `${JSON.stringify(recovery, null, 2)}\n`, "utf8");
}

if (thrown) throw thrown;
console.log(`MoneyPrinter restart recovery: OK (asset ${recovery.assetId}, wrapper ${recovery.wrapperId}, task ${recovery.managedTaskId})`);
