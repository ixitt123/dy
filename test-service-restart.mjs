// test-service-restart.mjs
//
// 服务重启恢复测试（01.04）。
// 真实测试 8787 服务重启后任务/文件状态恢复、浏览器刷新恢复，
// 以及本机 8080 MoneyPrinter API 的真实停止与重新启动。
//
// 测试流程：
//   1. 确认 8787 健康，获取任务快照（runtimeVersion）；
//   2. 启动 Chrome 打开 8787，等待版本徽标显示；
//   3. 停止 8787 服务（kill pid）；
//   4. 验证 8787 已停止；
//   5. 重新启动 8787 服务（detached）；
//   6. 等待 8787 恢复健康；
//   7. 验证 /api/status 恢复（runtimeVersion commit 一致，服务从 SQLite 恢复）；
//   8. 浏览器刷新，验证版本徽标重新显示（页面状态恢复）；
//   9. 在 8080 原本离线时真实启动、停止、重启并检查官方任务接口。
//
// 运行：node test-service-restart.mjs  （前置：8787 已启动）

import {
  findPidByPort, waitForHealth, confirmStopped,
  getCookie, getStatus, getMoneyPrinterTasks, startUiServer, startMoneyPrinter, stopService,
} from "./scripts/service-restart.mjs";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openTaskStore, TASK_STATUS } from "./task-store.mjs";

const BASE = "http://127.0.0.1:8787";
const CWD = process.cwd();
const EVIDENCE_DIR = String(process.env.RESTART_EVIDENCE_DIR || "").trim();
const EVIDENCE_FILE = String(process.env.RESTART_EVIDENCE_FILE || (EVIDENCE_DIR
  ? path.join(EVIDENCE_DIR, "tests", "restart-result.json")
  : "")).trim();
const runStartedAt = new Date().toISOString();
const fixturePath = path.join(CWD, "fixtures", "restart", "input.json");
const fixtureText = fs.readFileSync(fixturePath, "utf8");
const fixture = JSON.parse(fixtureText);
const fixtureSha256 = createHash("sha256").update(fixtureText).digest("hex");

function expandFixture(value, probeId) {
  return String(value || "").replaceAll("{{probeId}}", probeId);
}

const tests = [];
const results = [];
function test(name, fn) { tests.push({ name, fn }); }

let browser = null;
let page = null;
let originalStatus = null;
let originalPid = null;
let uiWasRunningAtStart = null;
let probeTask = null;
let probeFile = "";
let probeTaskCleaned = null;
let moneyPrinterStartedByTest = false;
let browserScreenshot = "";
let restartedUiPid = null;
let moneyPrinterEvidence = {
  wasRunning: null,
  beforeTaskCount: null,
  afterTaskCount: null,
  restarted: false,
};

async function getUiTasks() {
  const cookie = await getCookie(BASE);
  const response = await fetch(`${BASE}/api/tasks?limit=1000`, { headers: { cookie } });
  if (!response.ok) throw new Error(`/api/tasks 状态 ${response.status}`);
  return (await response.json()).tasks || [];
}

test("确认 8787 健康 + 获取任务快照", async () => {
  uiWasRunningAtStart = Boolean(findPidByPort(8787));
  if (!uiWasRunningAtStart) startUiServer(CWD);
  const ok = await waitForHealth(BASE, 15000);
  if (!ok) throw new Error("8787 无法启动并恢复健康");
  originalStatus = await getStatus(BASE);
  originalPid = findPidByPort(8787);
  if (!originalPid) throw new Error("未找到 8787 pid");
  if (!originalStatus.runtimeVersion?.commit) throw new Error("快照缺少 runtimeVersion.commit");
  const probeId = randomUUID();
  probeFile = path.join(CWD, fixture.asset.relativeDirectory, expandFixture(fixture.asset.fileNameTemplate, probeId));
  fs.mkdirSync(path.dirname(probeFile), { recursive: true });
  fs.writeFileSync(probeFile, expandFixture(fixture.asset.contentTemplate, probeId), "utf8");
  const store = openTaskStore(CWD);
  try {
    const imported = store.importTasks([{
      kind: fixture.job.kind,
      taskAction: fixture.job.taskAction,
      url: expandFixture(fixture.job.urlTemplate, probeId),
      normalizedUrl: expandFixture(fixture.job.urlTemplate, probeId),
      sourceText: expandFixture(fixture.job.sourceTextTemplate, probeId),
      transcriptEnabled: fixture.job.transcriptEnabled,
      audioEnabled: fixture.job.audioEnabled,
      analysisEnabled: fixture.job.analysisEnabled,
    }]);
    probeTask = imported.tasks[0];
    if (!probeTask?.id) throw new Error("无法创建重启恢复探针任务");
    store.updateTask(probeTask.id, {
      status: fixture.completion.status === "done" ? TASK_STATUS.DONE : fixture.completion.status,
      progress: fixture.completion.progress,
      title: expandFixture(fixture.completion.titleTemplate, probeId),
      video_path: probeFile,
      file_size: fs.statSync(probeFile).size,
      completed_at: new Date().toISOString(),
    });
  } finally {
    store.close();
  }
  const tasks = await getUiTasks();
  if (!tasks.some((task) => task.id === probeTask.id && task.video_path === probeFile)) {
    throw new Error("重启前 API 未返回探针任务及文件映射");
  }
  if (EVIDENCE_DIR) {
    const baselinePath = path.resolve(EVIDENCE_DIR, "baseline.json");
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, `${JSON.stringify({
      item: "01.04",
      capturedAt: new Date().toISOString(),
      fixturePath,
      fixtureSha256,
      uiPid: originalPid,
      runtimeCommit: originalStatus.runtimeVersion.commit,
      runtimeBranch: originalStatus.runtimeVersion.branch,
      moneyPrinterPid: findPidByPort(8080),
      probeTaskId: probeTask.id,
      probeFile,
    }, null, 2)}\n`, "utf8");
  }
});

test("启动 Chrome 打开 8787，等待版本徽标显示", async () => {
  browser = new BrowserCDP({ debuggingPort: 9224 });
  await browser.launch();
  page = await browser.newPage(BASE);
  await page.waitForFunction(
    `(function(){ const el = document.querySelector("#runtimeVersionBadge"); return el && (el.textContent||"").includes(${JSON.stringify(originalStatus.runtimeVersion.commit)}); })()`,
    15000
  );
});

test("停止 8787 服务", async () => {
  const r = await stopService(8787, BASE);
  if (!r.stopped) throw new Error(`停止 8787 失败 (pid=${r.pid}): ${r.reason}`);
});

test("验证 8787 已停止", async () => {
  const stopped = await confirmStopped(BASE, 4000);
  if (!stopped) throw new Error("8787 仍可访问，停止未生效");
});

test("重新启动 8787 服务（detached）", async () => {
  startUiServer(CWD);
  const ok = await waitForHealth(BASE, 25000);
  if (!ok) throw new Error("8787 重启后未在 25s 内恢复健康");
});

test("验证 /api/status 恢复（runtimeVersion commit 一致，服务从持久化恢复）", async () => {
  const newStatus = await getStatus(BASE);
  if (!newStatus.runtimeVersion?.commit) throw new Error("恢复后 /api/status 缺少 runtimeVersion");
  if (newStatus.runtimeVersion.commit !== originalStatus.runtimeVersion.commit) {
    throw new Error(`commit 不一致: ${newStatus.runtimeVersion.commit} vs 原始 ${originalStatus.runtimeVersion.commit}`);
  }
  if (newStatus.runtimeVersion.branch !== originalStatus.runtimeVersion.branch) {
    throw new Error(`branch 不一致: ${newStatus.runtimeVersion.branch} vs ${originalStatus.runtimeVersion.branch}`);
  }
  const tasks = await getUiTasks();
  const recovered = tasks.find((task) => task.id === probeTask.id);
  if (!recovered || recovered.video_path !== probeFile || !fs.existsSync(recovered.video_path)) {
    throw new Error("8787 重启后未恢复同一任务和最终文件映射");
  }
});

test("浏览器刷新后验证版本徽标重新显示（页面状态恢复）", async () => {
  await page.reload();
  await page.waitForFunction(
    `(function(){ const el = document.querySelector("#runtimeVersionBadge"); if (!el) return false; const cs = window.getComputedStyle(el); if (cs.display === "none") return false; return (el.textContent||"").includes(${JSON.stringify(originalStatus.runtimeVersion.commit)}); })()`,
    20000
  );
  if (EVIDENCE_DIR) {
    browserScreenshot = await page.screenshot(path.resolve(EVIDENCE_DIR, "browser", "after-restart.png"));
  }
});

test("验证 8787 重启后新 pid 不同于原 pid", async () => {
  const newPid = findPidByPort(8787);
  if (!newPid) throw new Error("重启后未找到 8787 新 pid");
  if (newPid === originalPid) throw new Error(`新 pid ${newPid} 等于原 pid，可能未真正重启`);
  restartedUiPid = newPid;
});

test("启动并真实重启 8080 MoneyPrinter API", async () => {
  const wasRunning = Boolean(findPidByPort(8080));
  moneyPrinterEvidence.wasRunning = wasRunning;
  if (!wasRunning) {
    startMoneyPrinter(CWD);
    moneyPrinterStartedByTest = true;
  }
  if (!await waitForHealth("http://127.0.0.1:8080/docs", 30000)) throw new Error("8080 未能启动");
  const beforeTasks = await getMoneyPrinterTasks();
  moneyPrinterEvidence.beforeTaskCount = beforeTasks.length;
  if (wasRunning) {
    moneyPrinterEvidence.afterTaskCount = beforeTasks.length;
    return;
  }
  const stopped = await stopService(8080, "http://127.0.0.1:8080/docs");
  if (!stopped.stopped) throw new Error("8080 停止失败");
  startMoneyPrinter(CWD);
  if (!await waitForHealth("http://127.0.0.1:8080/docs", 30000)) throw new Error("8080 重启后未恢复");
  const afterTasks = await getMoneyPrinterTasks();
  moneyPrinterEvidence.afterTaskCount = afterTasks.length;
  moneyPrinterEvidence.restarted = true;
  const beforeIds = beforeTasks.map((task) => task.task_id).filter(Boolean).sort();
  const afterIds = afterTasks.map((task) => task.task_id).filter(Boolean).sort();
  if (JSON.stringify(afterIds) !== JSON.stringify(beforeIds)) {
    throw new Error(`8080 重启前后任务 ID 不一致：${beforeIds.length} -> ${afterIds.length}`);
  }
});

// Run all
let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    results.push({ name: t.name, status: "passed" });
    console.log(`✅ ${t.name}`);
  } catch (e) {
    failed++;
    results.push({ name: t.name, status: "failed", error: e.message });
    console.error(`❌ ${t.name}: ${e.message}`);
  }
}

if (browser) { try { await browser.close(); } catch {} }
if (probeTask?.id) {
  const store = openTaskStore(CWD);
  try {
    store.deleteTasks([probeTask.id]);
    probeTaskCleaned = !store.getTask(probeTask.id);
  } finally { store.close(); }
}
if (probeFile && fs.existsSync(probeFile)) fs.unlinkSync(probeFile);
if (moneyPrinterStartedByTest && findPidByPort(8080)) await stopService(8080, "http://127.0.0.1:8080/docs");
if (uiWasRunningAtStart === true && !findPidByPort(8787)) {
  startUiServer(CWD);
  await waitForHealth(BASE, 25000);
} else if (uiWasRunningAtStart === false && findPidByPort(8787)) {
  await stopService(8787, BASE);
}
if (EVIDENCE_FILE) {
  const resolvedEvidenceFile = path.resolve(EVIDENCE_FILE);
  fs.mkdirSync(path.dirname(resolvedEvidenceFile), { recursive: true });
  fs.writeFileSync(resolvedEvidenceFile, `${JSON.stringify({
    item: "01.04",
    startedAt: runStartedAt,
    finishedAt: new Date().toISOString(),
    passed,
    failed,
    results,
    fixture: { path: fixturePath, sha256: fixtureSha256 },
    ui: {
      wasRunningAtStart: uiWasRunningAtStart,
      originalPid,
      restartedPid: restartedUiPid,
      finalPid: findPidByPort(8787),
      probeTaskId: probeTask?.id || null,
      probeTaskCleaned,
      probeFile,
      probeFileCleaned: probeFile ? !fs.existsSync(probeFile) : null,
      restoredOriginalState: uiWasRunningAtStart === true
        ? Boolean(findPidByPort(8787))
        : uiWasRunningAtStart === false
          ? !findPidByPort(8787)
          : null,
      browserScreenshot,
    },
    moneyPrinter: {
      ...moneyPrinterEvidence,
      finalPid: findPidByPort(8080),
      restoredOriginalOfflineState: moneyPrinterEvidence.wasRunning === false ? !findPidByPort(8080) : null,
    },
  }, null, 2)}\n`, "utf8");
}
if (EVIDENCE_DIR) {
  const handoffPath = path.resolve(EVIDENCE_DIR, "handoff.md");
  fs.writeFileSync(handoffPath, [
    "# 01.04 服务重启测试交接",
    "",
    `- 结果：${passed} passed, ${failed} failed。`,
    `- 固定 fixture：${fixturePath}`,
    `- fixture SHA-256：${fixtureSha256}`,
    `- 8787 PID：${originalPid} -> ${restartedUiPid}`,
    `- 探针任务清理：${probeTaskCleaned === true ? "是" : "否"}`,
    `- 探针文件清理：${probeFile ? !fs.existsSync(probeFile) : false}`,
    `- 8080 真实重启：${moneyPrinterEvidence.restarted === true ? "是" : "否"}`,
    `- 浏览器截图：${browserScreenshot || "未生成"}`,
    "- 范围：未发起 TTS、BGM、视频或外部付费生成；未改写历史业务数据。",
    "",
  ].join("\n"), "utf8");
}
console.log(`\n📊 服务重启恢复测试: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
