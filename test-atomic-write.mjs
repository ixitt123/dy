import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  backupPathFor,
  readJsonWithRecovery,
  writeBufferAtomic,
  writeJsonAtomic,
  writeTextAtomic,
} from "./server/core/atomic-write.mjs";
import { createTtsHandoffService } from "./server/tts/tts-handoff-service.mjs";
import { createSettingsCenter } from "./server/core/settings-center.js";
import { PipelineState } from "./server/core/pipeline-bus/PipelineState.js";
import { createTaskCenterV2 } from "./server/core/task-center.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-write-test-"));
const tests = [];
const test = (name, operation) => tests.push({ name, operation });

test("JSON 写入成功且内容正确", () => {
  const file = path.join(root, "success.json");
  writeJsonAtomic(file, { name: "测试", nested: { value: 42 } });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { name: "测试", nested: { value: 42 } });
});

test("成功写入不残留临时文件", () => {
  const file = path.join(root, "clean.json");
  writeJsonAtomic(file, { ok: true });
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.includes("clean.json") && name.endsWith(".tmp")), []);
});

test("连续覆盖始终保留合法完整 JSON", () => {
  const file = path.join(root, "concurrent.json");
  for (let index = 0; index < 40; index += 1) writeJsonAtomic(file, { index, tag: `writer-${index}` });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { index: 39, tag: "writer-39" });
});

test("覆盖写入保留上一版原子备份", () => {
  const file = path.join(root, "backup.json");
  writeJsonAtomic(file, { version: 1 });
  writeJsonAtomic(file, { version: 2 });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).version, 2);
  assert.equal(JSON.parse(fs.readFileSync(backupPathFor(file), "utf8")).version, 1);
});

test("主 JSON 损坏时从备份恢复并修复主文件", () => {
  const file = path.join(root, "recover.json");
  writeJsonAtomic(file, { version: 1, stable: true });
  writeJsonAtomic(file, { version: 2, stable: true });
  fs.writeFileSync(file, "{damaged", "utf8");
  const recovered = readJsonWithRecovery(file);
  assert.deepEqual(recovered, { version: 1, stable: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), recovered);
});

test("rename 失败不破坏旧状态且不残留临时文件", () => {
  const file = path.join(root, "rename-failure.json");
  writeJsonAtomic(file, { version: 1 });
  const renameSync = fs.renameSync;
  fs.renameSync = () => { throw new Error("injected rename failure"); };
  try {
    assert.throws(() => writeJsonAtomic(file, { version: 2 }), /injected rename failure/u);
  } finally {
    fs.renameSync = renameSync;
  }
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).version, 1);
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith(".tmp")), []);
});

test("文本和二进制写入保持兼容", () => {
  const textPath = path.join(root, "value.txt");
  const bufferPath = path.join(root, "value.bin");
  writeTextAtomic(textPath, "hello 原子写入");
  writeBufferAtomic(bufferPath, Buffer.from([0x00, 0xff, 0x42, 0x01]));
  assert.equal(fs.readFileSync(textPath, "utf8"), "hello 原子写入");
  assert.deepEqual([...fs.readFileSync(bufferPath)], [0x00, 0xff, 0x42, 0x01]);
});

test("设置中心从上一版恢复且不会返回空设置", () => {
  const file = path.join(root, "settings.json");
  const center = createSettingsCenter(root, file);
  center.write({ revision: 1, providers: { local: { enabled: true } } });
  center.write({ revision: 2, providers: { local: { enabled: true } } });
  fs.writeFileSync(file, "{damaged", "utf8");
  assert.equal(center.read().revision, 1);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).revision, 1);
});

test("流水线状态损坏后从备份恢复", () => {
  const baseDir = path.join(root, "pipeline");
  const first = new PipelineState(baseDir);
  first.initJob("job-1", "source-1");
  first.setStageStatus("job-1", "parse", "running");
  first.setStageStatus("job-1", "parse", "done");
  const stateFile = path.join(baseDir, ".data", "pipeline-states.json");
  fs.writeFileSync(stateFile, "{damaged", "utf8");
  const recovered = new PipelineState(baseDir);
  assert.equal(recovered.getJobState("job-1").jobId, "job-1");
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(stateFile, "utf8")));
});

test("新 handoff 任一 receipt 失败时整体回滚", () => {
  const dataDir = path.join(root, "handoff-new");
  const service = createTtsHandoffService(root, { dataDir });
  const injector = new DatabaseSync(service.dbPath);
  injector.exec(`CREATE TRIGGER fail_xiaohei BEFORE INSERT ON tts_handoff_receipts
    WHEN NEW.target='xiaohei-video' BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;`);
  injector.close();
  assert.throws(() => service.save(
    { handoff_id: "atomic-new", handoff_revision: "rev-1", id: "tts-job-1" },
    ["cs1-video", "xiaohei-video"],
  ), /injected receipt failure/u);
  const check = new DatabaseSync(service.dbPath);
  assert.equal(check.prepare("SELECT COUNT(*) AS count FROM tts_handoffs WHERE id='atomic-new'").get().count, 0);
  assert.equal(check.prepare("SELECT COUNT(*) AS count FROM tts_handoff_receipts WHERE handoff_id='atomic-new'").get().count, 0);
  check.close();
  service.close();
});

test("已有 handoff 扩展目标失败时目标和回执一起回滚", () => {
  const dataDir = path.join(root, "handoff-existing");
  const service = createTtsHandoffService(root, { dataDir });
  const payload = { handoff_id: "atomic-existing", handoff_revision: "rev-1", id: "tts-job-2" };
  service.save(payload, ["cs1-video"]);
  const injector = new DatabaseSync(service.dbPath);
  injector.exec(`CREATE TRIGGER fail_xiaohei BEFORE INSERT ON tts_handoff_receipts
    WHEN NEW.target='xiaohei-video' BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;`);
  injector.close();
  assert.throws(() => service.save(payload, ["xiaohei-video"]), /injected receipt failure/u);
  assert.deepEqual(service.get("atomic-existing").targets, ["cs1-video"]);
  assert.deepEqual(service.listReceipts("atomic-existing").map((row) => row.target), ["cs1-video"]);
  service.close();
});

test("重启恢复的 job 状态和 event 任一失败时整体回滚", () => {
  const baseDir = path.join(root, "task-center");
  const center = createTaskCenterV2(baseDir);
  center.upsertJob({
    id: "atomic-job",
    source: "internal",
    sourceId: "atomic-job",
    type: "atomic-test",
    status: "running",
    progress: 55,
  });
  const injector = new DatabaseSync(center.dbPath);
  injector.exec(`CREATE TRIGGER fail_interrupted_event BEFORE INSERT ON job_events
    WHEN NEW.event_type='interrupted' BEGIN SELECT RAISE(ABORT, 'injected event failure'); END;`);
  injector.close();
  assert.throws(() => center.recoverInterruptedJobs(), /injected event failure/u);
  const check = new DatabaseSync(center.dbPath);
  assert.equal(check.prepare("SELECT status FROM jobs WHERE id='atomic-job'").get().status, "running");
  assert.equal(check.prepare("SELECT COUNT(*) AS count FROM job_events WHERE job_id='atomic-job' AND event_type='interrupted'").get().count, 0);
  check.close();
  center.close();
});

let passed = 0;
let failed = 0;
for (const entry of tests) {
  try {
    await entry.operation();
    passed += 1;
    console.log(`✅ ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`❌ ${entry.name}: ${error.stack || error.message}`);
  }
}
try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
console.log(`\n📊 原子写入测试: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
