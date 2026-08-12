import fs from "node:fs";
import path from "node:path";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import {
  findPidByPort,
  startUiServer,
  stopService,
  waitForHealth,
} from "./scripts/service-restart.mjs";

const BASE = "http://127.0.0.1:8787";
const CWD = process.cwd();
const EVIDENCE_DIR = String(process.env.DRAFT_MIGRATION_EVIDENCE_DIR || "").trim();
const V1_KEY = "dy.ui.inputDrafts.v1";
const QUARANTINE_KEY = "dy.ui.inputDrafts.quarantine.v1";
const MARKER_KEY = "dy.ui.inputDrafts.migration.v2";
const snapshots = [];
let browser = null;
let page = null;
let browserProfile = "";
let uiWasRunning = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function storageSnapshot(label) {
  const snapshot = await page.evaluate(`(function(){
    const values = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      values[key] = localStorage.getItem(key);
    }
    return values;
  })()`);
  snapshots.push({ label, capturedAt: new Date().toISOString(), values: snapshot });
  return snapshot;
}

function parsed(storage, key) {
  return JSON.parse(storage[key] || "{}");
}

try {
  uiWasRunning = Boolean(findPidByPort(8787));
  if (!uiWasRunning) startUiServer(CWD);
  if (!await waitForHealth(BASE, 25000)) throw new Error("8787 无法启动");

  browser = new BrowserCDP({ debuggingPort: 9226 });
  await browser.launch();
  browserProfile = browser.userDataDir;
  page = await browser.newPage(BASE);
  await page.waitForSelector("#rewritePanel", 30000);

  await page.evaluate(`(function(){
    localStorage.clear();
    localStorage.setItem(${JSON.stringify(V1_KEY)}, JSON.stringify({
      '#rewriteOriginal': '必须保留的普通旧草稿',
      'rewrite:textarea:rewrite-version-text:0': '任务 A 污染结果',
      'rewrite:textarea:rewrite-version-text:3': '任务 B 污染结果'
    }));
    localStorage.setItem(${JSON.stringify(QUARANTINE_KEY)}, JSON.stringify({
      version: 1,
      entries: { 'existing:backup': '必须保留的既有备份' }
    }));
    localStorage.setItem('repair.migration.unrelated', '逐字不变的其他业务值');
    localStorage.setItem('dy.ui.choicePreferences.v1', JSON.stringify({ sentinel: '不得改变' }));
    return true;
  })()`);
  const seeded = await storageSnapshot("seeded-before-reload");

  await page.reload();
  await page.waitForSelector("#rewritePanel", 30000);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const first = await storageSnapshot("after-first-migration");
  const v1 = parsed(first, V1_KEY);
  const quarantine = parsed(first, QUARANTINE_KEY);
  const marker = parsed(first, MARKER_KEY);

  assert(v1["#rewriteOriginal"] === "必须保留的普通旧草稿", "迁移删除了未命中白名单的 v1 草稿");
  assert(!Object.prototype.hasOwnProperty.call(v1, "rewrite:textarea:rewrite-version-text:0"), "污染键 0 未从 v1 定向删除");
  assert(!Object.prototype.hasOwnProperty.call(v1, "rewrite:textarea:rewrite-version-text:3"), "污染键 3 未从 v1 定向删除");
  assert(quarantine.entries?.["existing:backup"] === "必须保留的既有备份", "迁移覆盖了既有隔离备份");
  assert(quarantine.entries?.["rewrite:textarea:rewrite-version-text:0"] === "任务 A 污染结果", "污染键 0 未备份");
  assert(quarantine.entries?.["rewrite:textarea:rewrite-version-text:3"] === "任务 B 污染结果", "污染键 3 未备份");
  assert(marker.version === 2 && marker.quarantinedCount === 2, `迁移记录不正确：${JSON.stringify(marker)}`);
  assert(first["repair.migration.unrelated"] === seeded["repair.migration.unrelated"], "无关 localStorage 值发生变化");
  assert(first["dy.ui.choicePreferences.v1"] === seeded["dy.ui.choicePreferences.v1"], "选择偏好被迁移误改");

  await page.reload();
  await page.waitForSelector("#rewritePanel", 30000);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const second = await storageSnapshot("after-second-idempotent-load");
  assert(second[V1_KEY] === first[V1_KEY], "重复加载再次改写了 v1");
  assert(second[QUARANTINE_KEY] === first[QUARANTINE_KEY], "重复加载再次改写了隔离备份");
  assert(second[MARKER_KEY] === first[MARKER_KEY], "重复加载再次改写了迁移记录");
  assert(second["repair.migration.unrelated"] === first["repair.migration.unrelated"], "重复加载改写了无关值");

  if (EVIDENCE_DIR) {
    const resolved = path.resolve(EVIDENCE_DIR);
    fs.mkdirSync(path.join(resolved, "repro"), { recursive: true });
    fs.mkdirSync(path.join(resolved, "browser"), { recursive: true });
    fs.writeFileSync(path.join(resolved, "repro", "migration-snapshots.json"), `${JSON.stringify({
      passed: true,
      pollutedKeys: [
        "rewrite:textarea:rewrite-version-text:0",
        "rewrite:textarea:rewrite-version-text:3",
      ],
      snapshots,
    }, null, 2)}\n`, "utf8");
    await page.screenshot(path.join(resolved, "browser", "draft-migration.png"));
  }
  console.log("Rewrite draft targeted migration: OK");
} catch (error) {
  if (EVIDENCE_DIR) {
    const resolved = path.resolve(EVIDENCE_DIR);
    fs.mkdirSync(path.join(resolved, "repro"), { recursive: true });
    fs.writeFileSync(path.join(resolved, "repro", "migration-snapshots.json"), `${JSON.stringify({
      passed: false,
      error: error.message,
      snapshots,
    }, null, 2)}\n`, "utf8");
  }
  console.error(`Rewrite draft targeted migration: FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) { try { await browser.close(); } catch {} }
  if (uiWasRunning === false && findPidByPort(8787)) await stopService(8787, BASE);
  if (browserProfile) {
    try { fs.rmSync(browserProfile, { recursive: true, force: true }); } catch {}
  }
}
