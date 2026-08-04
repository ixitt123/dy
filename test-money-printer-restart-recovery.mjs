import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { findPidByPort, getCookie, getMoneyPrinterTasks, startMoneyPrinter, startUiServer, stopService, waitForHealth } from "./scripts/service-restart.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.MPT_RESTART_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "05.05", "manual"));
const fixtureDir = path.join(ROOT, "fixtures", "money-printer");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function authenticatedFetch(url, options = {}) {
  const cookie = await getCookie(BASE);
  return fetch(url, { ...options, headers: { ...(options.headers || {}), cookie } });
}

const browser = new BrowserCDP({ debuggingPort: 9245 });
let page;
let created;
let beforePid;
let afterPid;
let recovery;
let managedTask;

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

await waitForMoneyPrinter();
try {
  await browser.launch();
  page = await browser.newPage(`${BASE}/#money-printer`);
  await page.waitForFunction("globalThis.moneyPrinterProduction?.showFinalAsset && globalThis.ttsHandoffStore?.hydrate", 30000);
  created = await page.evaluate(`(async function(){
    const job = (await fetchJson('/api/tts/job?id=93')).job;
    await resolveTtsBgmForHandoff(job);
    const payload = confirmedTtsAudioPayload(job);
    await sendTtsPayloadToTargets(payload, ['money-printer']);
    const handoff = await globalThis.ttsHandoffStore.hydrate('money-printer');
    const response = await fetch('/api/money-printer/render-final', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'mpt-restart-recovery-05.05',
        tts: { ...handoff, audio_path: ${JSON.stringify(path.join(fixtureDir, fixture.narration))} },
        text: '重启恢复固定回归字幕',
        handoff_id: handoff.handoff_id,
        revision: handoff.handoff_revision,
        includeBgm: true,
        bgm_file: handoff.bgm_path,
        bgm_volume: handoff.bgm_volume,
        background_video: ${JSON.stringify(path.join(fixtureDir, fixture.background))},
        segments: ${JSON.stringify(fixture.segments)},
        settings: ${JSON.stringify(fixture.settings)},
      }),
    });
    return { status: response.status, body: await response.json() };
  })()`);
  assert.equal(created.status, 200, created.body?.message);
  const taskResponse = await authenticatedFetch(`${BASE}/api/money-printer/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({
      video_subject: "05.05 重启恢复探针",
      video_script: "这是 MoneyPrinter 包装任务映射的固定回归任务。",
      video_source: "local",
      video_materials: [path.join(fixtureDir, fixture.background)],
      custom_audio_file: path.join(fixtureDir, fixture.narration),
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
  const officialTasks = await getMoneyPrinterTasks();
  assert.ok(officialTasks.some((task) => String(task.task_id || task.id || "") === managedTask.official_task_id), "官方 8080 未登记新任务");
} finally {
  await browser.close().catch(() => {});
}

const beforeResponse = await authenticatedFetch(`${BASE}${created.body.videoUrl}`);
const beforeBytes = Buffer.from(await beforeResponse.arrayBuffer());
assert.equal(beforeResponse.status, 200);
beforePid = await stopService(8787, BASE).then((result) => result.pid);
startUiServer(ROOT);
assert.equal(await waitForHealth(BASE, 20000), true, "8787 重启后未恢复健康");
afterPid = findPidByPort(8787);
assert.ok(afterPid, "8787 重启后没有监听 PID");

const afterResponse = await authenticatedFetch(`${BASE}${created.body.videoUrl}`);
const afterBytes = Buffer.from(await afterResponse.arrayBuffer());
const afterDownloadResponse = await authenticatedFetch(`${BASE}${created.body.videoUrl}&download=1`);
const afterDownloadBytes = Buffer.from(await afterDownloadResponse.arrayBuffer());
const recoveredTaskResponse = await authenticatedFetch(`${BASE}/api/money-printer/task?id=${encodeURIComponent(managedTask.task_id)}`);
const recoveredTaskPayload = await recoveredTaskResponse.json();
const retainedMediaDir = path.join(evidenceDir, "media");
fs.mkdirSync(retainedMediaDir, { recursive: true });
const retainedMediaPath = path.join(retainedMediaDir, "mpt-restart-recovered.mp4");
fs.writeFileSync(retainedMediaPath, afterDownloadBytes);
const media = verifyMedia(retainedMediaPath, { expectAudio: true, expectVideo: true, minDuration: 1 });
recovery = {
  assetId: created.body.id,
  videoUrl: created.body.videoUrl,
  outputPath: created.body.outputPath,
  beforePid,
  afterPid,
  beforeStatus: beforeResponse.status,
  afterStatus: afterResponse.status,
  beforeSha256: sha256Buffer(beforeBytes),
  afterSha256: sha256Buffer(afterBytes),
  downloadStatus: afterDownloadResponse.status,
  downloadSha256: sha256Buffer(afterDownloadBytes),
  retainedMediaPath,
  media,
  managedTaskId: managedTask.task_id,
  officialTaskId: managedTask.official_task_id,
  recoveredTaskStatus: recoveredTaskResponse.status,
  recoveredOfficialTaskId: recoveredTaskPayload?.task?.official_task_id || "",
};

assert.notEqual(afterPid, beforePid, "8787 PID 没有变化，未发生真实重启");
assert.equal(afterResponse.status, 200, `8787 重启后最终 assetId ${created.body.id} 无法恢复`);
assert.equal(recovery.afterSha256, recovery.beforeSha256, "重启后最终文件哈希发生变化");
assert.equal(afterDownloadResponse.status, 200, "重启后的下载入口无法读取最终文件");
assert.equal(recovery.downloadSha256, recovery.beforeSha256, "重启后下载文件哈希发生变化");
assert.equal(recoveredTaskResponse.status, 200, `8787 重启后包装任务 ${managedTask.task_id} 无法恢复`);
assert.equal(recovery.recoveredOfficialTaskId, managedTask.official_task_id, "重启后恢复的官方 taskId 不一致");
assert.equal(media.ok, true, JSON.stringify(media.errors));
fs.writeFileSync(path.join(evidenceDir, "tests", "money-printer-restart-recovery.json"), `${JSON.stringify(recovery, null, 2)}\n`, "utf8");
console.log(`MoneyPrinter restart recovery: OK (${created.body.id}, ${recovery.beforeSha256})`);
