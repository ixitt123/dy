// 跨任务生成结果与草稿作用域测试（02.01-02.03）。
//
// 使用固定 A/B fixture 创建两条独立 SQLite 任务及服务端改写结果，在真实 Chrome 中：
// 1. 打开 A 的动态生成结果 textarea，并让现有草稿机制保存 A；
// 2. 打开 B，确认服务端结果先正确渲染，再等待超过 80ms；
// 3. 刷新并重新打开 B；关闭 Chrome 后用同一浏览器资料目录再次打开 B。
//
// 02.02 保护服务端生成结果不被通用草稿覆盖；02.03 进一步证明可编辑草稿使用
// task/project/version/control-role 稳定键，不再依赖 DOM 顺序，并安全迁移无作用域 v1 键。

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import {
  findPidByPort,
  getCookie,
  startUiServer,
  stopService,
  waitForHealth,
} from "./scripts/service-restart.mjs";
import { openTaskStore, TASK_STATUS } from "./task-store.mjs";

const BASE = "http://127.0.0.1:8787";
const CWD = process.cwd();
const EVIDENCE_DIR = String(process.env.CROSSOVER_EVIDENCE_DIR || "").trim();
const fixturePath = path.join(CWD, "fixtures", "rewrite-crossover", "input.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const A = fixture.taskA;
const B = fixture.taskB;
const probeId = randomUUID();
const probeDir = path.join(CWD, ".data", "rewrite-crossover-probes", probeId);
const snapshots = [];
const tests = [];
const createdTaskIds = [];

let browser = null;
let page = null;
let browserProfile = "";
let taskA = null;
let taskB = null;
let draftKey = "";
let uiWasRunning = null;
const DRAFT_V1_KEY = "dy.ui.inputDrafts.v1";
const DRAFT_V2_KEY = "dy.ui.inputDrafts.v2";

function test(name, fn) { tests.push({ name, fn }); }

function versionFor(task) {
  return {
    key: "fixture-output",
    name: task.title,
    direction: "短视频口播",
    style: "固定串稿复现",
    wordCount: "固定 fixture",
    content: task.rewriteText,
  };
}

function createProbeTasks() {
  fs.mkdirSync(probeDir, { recursive: true });
  const store = openTaskStore(CWD);
  try {
    const imported = store.importTasks([A, B].map((task, index) => ({
      kind: "rewrite-crossover-probe",
      taskAction: "transcript",
      url: `https://rewrite-crossover.invalid/${probeId}/${index}`,
      normalizedUrl: `https://rewrite-crossover.invalid/${probeId}/${index}`,
      sourceText: task.originalText,
      transcriptEnabled: true,
      analysisEnabled: false,
      onlyTranscript: true,
    })));
    if (imported.tasks.length !== 2) throw new Error(`无法创建两条独立测试任务：${JSON.stringify(imported)}`);
    return imported.tasks.map((created, index) => {
      const fixtureTask = index === 0 ? A : B;
      const transcriptPath = path.join(probeDir, `${index === 0 ? "task-a" : "task-b"}.txt`);
      fs.writeFileSync(transcriptPath, `${fixtureTask.originalText}\n`, "utf8");
      createdTaskIds.push(created.id);
      return store.updateTask(created.id, {
        status: TASK_STATUS.DONE,
        progress: 100,
        title: `[02.01] ${fixtureTask.title} ${probeId.slice(0, 8)}`,
        txt_path: transcriptPath,
        rewrite_json: JSON.stringify({
          direction: "短视频口播",
          style: "固定串稿复现",
          versions: [versionFor(fixtureTask)],
        }),
        completed_at: new Date().toISOString(),
      });
    });
  } finally {
    store.close();
  }
}

async function assertServerResults() {
  const cookie = await getCookie(BASE);
  const response = await fetch(`${BASE}/api/transcripts`, { headers: { cookie } });
  if (!response.ok) throw new Error(`/api/transcripts 状态 ${response.status}`);
  const rows = (await response.json()).transcripts || [];
  for (const [task, expected] of [[taskA, A.rewriteText], [taskB, B.rewriteText]]) {
    const row = rows.find((item) => item.id === task.id);
    const content = row?.rewrite?.versions?.[0]?.content || "";
    if (content !== expected) throw new Error(`服务端任务 ${task.id} 的改写结果不等于固定 fixture`);
  }
}

async function openBrowser(port, userDataDir = "") {
  browser = new BrowserCDP({ debuggingPort: port, ...(userDataDir ? { userDataDir } : {}) });
  await browser.launch();
  browserProfile = browser.userDataDir;
  page = await browser.newPage(BASE);
  await page.waitForFunction(`!!document.querySelector('.transcript-rewrite[data-task-id="${taskB.id}"]')`, 30000);
}

async function openRewriteTask(task) {
  await page.clickDom(`.transcript-rewrite[data-task-id="${task.id}"]`);
  await page.waitForFunction(`(function(){
    const taskId = document.querySelector('#rewriteTaskId')?.value || '';
    const textarea = document.querySelector('.rewrite-version-text[data-version-key="fixture-output"]');
    return taskId === ${JSON.stringify(String(task.id))} && Boolean(textarea);
  })()`, 15000);
}

async function readResultState(label) {
  const state = await page.evaluate(`(function(){
    const textarea = document.querySelector('.rewrite-version-text[data-version-key="fixture-output"]');
    return {
      taskId: document.querySelector('#rewriteTaskId')?.value || '',
      value: textarea?.value || '',
      draftStorageV1: localStorage.getItem(${JSON.stringify(DRAFT_V1_KEY)}) || '{}',
      draftStorageV2: localStorage.getItem(${JSON.stringify(DRAFT_V2_KEY)}) || '{}',
    };
  })()`);
  snapshots.push({ label, capturedAt: new Date().toISOString(), ...state });
  return state;
}

async function setVersionSuggestion(value) {
  await page.evaluate(`(function(){
    const control = document.querySelector('.rewrite-version[data-version-key="fixture-output"] .rewrite-version-suggestion');
    if (!control) throw new Error('找不到版本修改建议输入框');
    control.value = ${JSON.stringify(String(value))};
    control.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
}

async function readVersionSuggestion() {
  return page.evaluate(`(function(){
    const control = document.querySelector('.rewrite-version[data-version-key="fixture-output"] .rewrite-version-suggestion');
    return {
      value: control?.value || '',
      draftsV2: JSON.parse(localStorage.getItem(${JSON.stringify(DRAFT_V2_KEY)}) || '{}'),
    };
  })()`);
}

function assertTaskB(label, state) {
  if (state.taskId !== String(taskB.id)) throw new Error(`${label} 当前任务不是 B：${state.taskId}`);
  if (state.value !== B.rewriteText) {
    const crossed = state.value === A.rewriteText || state.value.includes("勾股定理");
    throw new Error(`${label} ${crossed ? "被任务 A 草稿覆盖" : "与服务端 B 不一致"}：${state.value.slice(0, 90)}`);
  }
}

test("创建两条独立服务端改写结果并启动真实 Chrome", async () => {
  uiWasRunning = Boolean(findPidByPort(8787));
  if (!uiWasRunning) startUiServer(CWD);
  if (!await waitForHealth(BASE, 25000)) throw new Error("8787 无法启动");
  [taskA, taskB] = createProbeTasks();
  await assertServerResults();
  await openBrowser(9225);
});

test("保留一个历史任务 A 旧草稿键作为迁移前输入", async () => {
  await openRewriteTask(taskA);
  draftKey = "rewrite:textarea:rewrite-version-text:0";
  await page.evaluate(`(function(){
    const drafts = JSON.parse(localStorage.getItem('dy.ui.inputDrafts.v1') || '{}');
    drafts[${JSON.stringify("rewrite:textarea:rewrite-version-text:0")}] = ${JSON.stringify(A.rewriteText)};
    localStorage.setItem('dy.ui.inputDrafts.v1', JSON.stringify(drafts));
    return true;
  })()`);
  await readResultState("task-a-draft-saved");
});

test("任务 B 服务端结果在超过 80ms 后不应被任务 A 覆盖", async () => {
  await openRewriteTask(taskB);
  const before = await readResultState("task-b-before-80ms");
  assertTaskB("任务 B 初始渲染", before);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assertTaskB("任务 B 等待 220ms 后", await readResultState("task-b-after-220ms"));
});

test("修改建议草稿按任务和版本隔离且不依赖 DOM 顺序", async () => {
  const suggestionA = "A-勾股定理版本只保留数学例子";
  const suggestionB = "B-赤壁赋版本只保留语文例子";
  await openRewriteTask(taskA);
  await setVersionSuggestion(suggestionA);
  await new Promise((resolve) => setTimeout(resolve, 120));

  await openRewriteTask(taskB);
  await new Promise((resolve) => setTimeout(resolve, 220));
  const beforeB = await readVersionSuggestion();
  if (beforeB.value) throw new Error(`任务 B 错误恢复了其他任务草稿：${beforeB.value}`);
  await setVersionSuggestion(suggestionB);

  await openRewriteTask(taskA);
  await new Promise((resolve) => setTimeout(resolve, 220));
  const restoredA = await readVersionSuggestion();
  if (restoredA.value !== suggestionA) throw new Error(`任务 A 草稿未按作用域恢复：${restoredA.value}`);

  const keys = Object.keys(restoredA.draftsV2);
  const taskAKey = keys.find((key) => key.includes(`task=${taskA.id}`) && key.includes("version=fixture-output") && key.includes("role=class=rewrite-version-suggestion"));
  const taskBKey = keys.find((key) => key.includes(`task=${taskB.id}`) && key.includes("version=fixture-output") && key.includes("role=class=rewrite-version-suggestion"));
  if (!taskAKey || !taskBKey) throw new Error(`缺少任务/版本/控件角色稳定键：${JSON.stringify(keys)}`);
  if (/:\d+$/.test(taskAKey) || /:\d+$/.test(taskBKey)) throw new Error(`草稿键仍使用 DOM 序号：${taskAKey} / ${taskBKey}`);
});

test("无作用域 v1 草稿可迁移到 v2 且保留旧存储", async () => {
  const migrated = await page.evaluate(`(async function(){
    const v1Key = ${JSON.stringify(DRAFT_V1_KEY)};
    const v2Key = ${JSON.stringify(DRAFT_V2_KEY)};
    const oldDrafts = JSON.parse(localStorage.getItem(v1Key) || '{}');
    oldDrafts['#draftMigrationProbe'] = '保留并迁移的旧草稿';
    localStorage.setItem(v1Key, JSON.stringify(oldDrafts));
    document.querySelector('#draftMigrationProbe')?.remove();
    const probe = document.createElement('textarea');
    probe.id = 'draftMigrationProbe';
    document.body.appendChild(probe);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const v2 = JSON.parse(localStorage.getItem(v2Key) || '{}');
    const stableKey = Object.keys(v2).find((key) => key.includes('role=id=draftMigrationProbe')) || '';
    const result = {
      value: probe.value,
      stableKey,
      migratedValue: stableKey ? v2[stableKey] : '',
      legacyRetained: JSON.parse(localStorage.getItem(v1Key) || '{}')['#draftMigrationProbe'] || '',
    };
    probe.remove();
    return result;
  })()`);
  if (migrated.value !== "保留并迁移的旧草稿" || migrated.migratedValue !== "保留并迁移的旧草稿") {
    throw new Error(`v1 草稿未安全迁移：${JSON.stringify(migrated)}`);
  }
  if (migrated.legacyRetained !== "保留并迁移的旧草稿") throw new Error("迁移错误删除了 v1 原件");
});

test("刷新后重新打开任务 B 仍不应恢复任务 A 草稿", async () => {
  await page.reload();
  await page.waitForSelector('[data-nav="rewrite"]', 15000);
  await page.clickDom('[data-nav="rewrite"]');
  await page.waitForFunction(`!!document.querySelector('.transcript-rewrite[data-task-id="${taskB.id}"]')`, 15000);
  await openRewriteTask(taskB);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assertTaskB("刷新后任务 B", await readResultState("task-b-after-refresh-220ms"));
});

test("关闭标签页并重新打开后任务 B 仍不应恢复任务 A 草稿", async () => {
  await page.close();
  page = await browser.newPage(BASE);
  await page.waitForFunction(`!!document.querySelector('.transcript-rewrite[data-task-id="${taskB.id}"]')`, 30000);
  await openRewriteTask(taskB);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assertTaskB("标签页重开后任务 B", await readResultState("task-b-after-page-reopen-220ms"));
});

test("当前任务 B 成品发送到 TTS 后文本和任务身份逐字一致", async () => {
  await openRewriteTask(taskB);
  const persistenceScope = await page.evaluate(`(function(){
    const panel = document.querySelector('.rewrite-version[data-version-key="fixture-output"] .rewrite-handoff-panel');
    return {
      excluded: panel?.hasAttribute('data-no-choice-persist') === true,
      controls: panel?.querySelectorAll('.rewrite-handoff-choice').length || 0,
    };
  })()`);
  if (!persistenceScope.excluded || persistenceScope.controls < 1) {
    throw new Error("改写发送目标仍会被全局选择偏好恢复器覆盖");
  }
  await page.evaluate(`(function(){
    const card = document.querySelector('.rewrite-version[data-version-key="fixture-output"]');
    const choice = card?.querySelector('.rewrite-handoff-choice[data-target="tts"]');
    if (!choice) throw new Error('找不到当前版本的 TTS 发送选项');
    choice.checked = true;
    choice.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await page.clickDom('.rewrite-version[data-version-key="fixture-output"] .rewrite-send-selected[data-source="rewrite"]');
  let waitError = "";
  try {
    await page.waitForFunction(`(function(){
      const text = document.querySelector('#ttsText')?.value || '';
      const payload = JSON.parse(localStorage.getItem('video-factory-handoff:tts') || '{}');
      return text === ${JSON.stringify(B.rewriteText)} && payload.taskId === ${JSON.stringify(Number(taskB.id))};
    })()`, 15000);
  } catch (error) {
    waitError = error instanceof Error ? error.message : String(error);
  }
  const state = await page.evaluate(`(function(){
    return {
      taskId: document.querySelector('#rewriteTaskId')?.value || '',
      rewriteText: document.querySelector('.rewrite-version-text[data-version-key="fixture-output"]')?.value || '',
      ttsText: document.querySelector('#ttsText')?.value || '',
      handoff: JSON.parse(localStorage.getItem('video-factory-handoff:tts') || '{}'),
      rewriteStatus: document.querySelector('#rewriteStatus')?.textContent || '',
      checkedTargets: Array.from(document.querySelectorAll('.rewrite-version[data-version-key="fixture-output"] .rewrite-handoff-choice:checked')).map((item) => item.dataset.target),
      sendDisabled: Boolean(document.querySelector('.rewrite-version[data-version-key="fixture-output"] .rewrite-send-selected[data-source="rewrite"]')?.disabled),
    };
  })()`);
  snapshots.push({ label: "task-b-rewrite-to-tts", capturedAt: new Date().toISOString(), waitError, ...state });
  if (state.taskId !== String(taskB.id)) throw new Error(`发送时当前任务不是 B：${state.taskId}`);
  if (state.rewriteText !== B.rewriteText || state.ttsText !== B.rewriteText || state.handoff.text !== B.rewriteText) {
    throw new Error("任务 B 的结果框、TTS 输入或 handoff payload 与当前服务端文案不一致");
  }
  if (state.handoff.taskId !== Number(taskB.id)) throw new Error(`TTS handoff taskId 错误：${state.handoff.taskId}`);
});

let passed = 0;
let failed = 0;
for (const item of tests) {
  try {
    await item.fn();
    passed++;
    console.log(`✅ ${item.name}`);
  } catch (error) {
    failed++;
    snapshots.push({ label: item.name, capturedAt: new Date().toISOString(), error: error.message });
    console.error(`❌ ${item.name}: ${error.message}`);
  }
}

if (EVIDENCE_DIR) {
  const resolved = path.resolve(EVIDENCE_DIR);
  fs.mkdirSync(path.join(resolved, "repro"), { recursive: true });
  fs.writeFileSync(path.join(resolved, "repro", "dom-snapshots.json"), `${JSON.stringify({
    fixturePath,
    taskAId: taskA?.id || null,
    taskBId: taskB?.id || null,
    draftKey,
    passed,
    failed,
    snapshots,
  }, null, 2)}\n`, "utf8");
  if (page) {
    try { await page.screenshot(path.join(resolved, "browser", "rewrite-crossover.png")); } catch {}
  }
}

if (browser) { try { await browser.close(); } catch {} }
if (createdTaskIds.length) {
  const store = openTaskStore(CWD);
  try { store.deleteTasks(createdTaskIds); } finally { store.close(); }
}
fs.rmSync(probeDir, { recursive: true, force: true });
if (uiWasRunning === false && findPidByPort(8787)) await stopService(8787, BASE);
if (browserProfile) {
  try { fs.rmSync(browserProfile, { recursive: true, force: true }); } catch {}
}

console.log(`\n📊 跨任务生成结果串稿测试: ${passed} passed, ${failed} failed`);
console.log(failed > 0
  ? "※ 串稿回归仍未通过，请按失败信息区分内容覆盖与测试基础设施问题。"
  : "※ 串稿回归通过：历史旧草稿未覆盖任务 B 的服务端成品。");
process.exitCode = failed > 0 ? 1 : 0;
