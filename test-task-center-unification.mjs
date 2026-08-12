import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openTaskStore, TASK_STATUS } from "./task-store.mjs";
import { createTaskCenterV2 } from "./server/core/task-center.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "task-center-unified-"));
try {
  const store = openTaskStore(root);
  const imported = store.importTasks([{
    kind: "video",
    taskAction: "download",
    url: "https://example.com/video/09-01",
    normalizedUrl: "https://example.com/video/09-01",
    sourceText: "09.01 fixture",
    transcriptEnabled: true,
  }]);
  assert.equal(imported.inserted, 1);
  const legacyTask = imported.tasks[0];

  const center = createTaskCenterV2(root, { taskStore: store, maxConcurrency: 1 });
  assert.equal(center.dbPath, store.dbPath, "Task center must use the authoritative tasks.sqlite database");
  const collectorJobs = center.getAllTasks({ source: "collector" });
  assert.equal(collectorJobs.length, 1);
  assert.equal(collectorJobs[0].sourceId, String(legacyTask.id));
  assert.equal(collectorJobs[0].status, "waiting");
  assert.equal(center.getJobEvents(collectorJobs[0].id).length, 1, "Initial collector sync must create one durable event");

  store.updateTask(legacyTask.id, { status: TASK_STATUS.DONE, progress: 100, message: "完成" });
  const collectorView = center.getCollectorView();
  assert.equal(collectorView.tasks[0].status, TASK_STATUS.DONE);
  const updatedJob = center.getAllTasks({ source: "collector" })[0];
  assert.equal(updatedJob.status, "done");
  const updatedEvents = center.getJobEvents(updatedJob.id);
  assert.equal(updatedEvents.length, 2, "Status transition must append one job event");
  assert.equal(updatedEvents[1].status, "done");
  center.syncCollectorTasks();
  assert.equal(center.getJobEvents(updatedJob.id).length, 2, "Unchanged sync must not duplicate events");
  const walPath = `${store.dbPath}-wal`;
  const beforeNoopWalSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;
  for (let index = 0; index < 25; index += 1) center.syncCollectorTasks();
  const afterNoopWalSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;
  assert.equal(afterNoopWalSize, beforeNoopWalSize, "Unchanged sync must not grow the authoritative SQLite WAL");

  assert.equal(store.deleteTasks([legacyTask.id]), 1);
  center.syncCollectorTasks();
  assert.equal(center.getAllTasks({ source: "collector" }).length, 0, "Deleted collector tasks must not remain as ghost jobs");
  assert.equal(center.getJobEvents(updatedJob.id).at(-1)?.event_type, "deleted", "Deletion must remain auditable as a job event");

  const internalId = center.submit("fixture", "09.01 internal job", { value: 1 }, async ({ onProgress }) => {
    onProgress(40, "working");
    return { ok: true };
  });
  const deadline = Date.now() + 5000;
  let internalJob;
  while (Date.now() < deadline) {
    internalJob = center.getAllTasks().find((job) => job.id === internalId);
    if (internalJob?.status === "done") break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(internalJob?.status, "done");
  assert.deepEqual(internalJob.output, { ok: true });
  assert.deepEqual(center.getJobEvents(internalId).map((event) => event.event_type), ["created", "started", "progress", "completed"]);
  while (center.queue.getStatus().running > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(center.queue.getStatus().running, 0, "Queue must release the completed executor before database close");

  center.close();
  store.close();

  const reopenedStore = openTaskStore(root);
  const reopenedCenter = createTaskCenterV2(root, { taskStore: reopenedStore });
  assert.equal(reopenedCenter.getAllTasks().find((job) => job.id === internalId)?.status, "done", "Jobs must survive service restart");
  assert.equal(reopenedCenter.getJobEvents(internalId).length, 4, "Job events must survive service restart");
  reopenedCenter.close();
  reopenedStore.close();
  console.log("Unified jobs and job events: authoritative SQLite, collector view, transitions and restart persistence verified");
} finally {
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
  }
}
