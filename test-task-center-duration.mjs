import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { calculateDurationMs, createTaskCenterV2 } from "./server/core/task-center.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dy-task-center-"));
const taskCenter = createTaskCenterV2(root, { maxConcurrency: 1 });

async function waitForTask(taskId, status) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const row = taskCenter.getTasks({ limit: 20 }).find((task) => task.id === taskId);
    if (row?.status === status) return row;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Task ${taskId} did not reach ${status}`);
}

try {
  let successContext = null;
  const successId = taskCenter.submit("duration", "success", {}, async (ctx) => {
    successContext = ctx;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { ok: true };
  });
  const success = await waitForTask(successId, "done");
  assert.equal(successContext.taskId, successId);
  assert.equal(Number.isFinite(successContext.startedAt), true);
  assert.equal(Number.isFinite(successContext.queuedAt), true);
  assert.equal(Number.isFinite(success.duration_ms), true);
  assert.equal(Number.isNaN(success.duration_ms), false);
  assert.equal(success.duration_ms >= 0, true);

  const failedId = taskCenter.submit("duration", "failure", {}, async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    throw new Error("expected failure");
  });
  const failed = await waitForTask(failedId, "failed");
  assert.equal(Number.isFinite(failed.duration_ms), true);
  assert.equal(Number.isNaN(failed.duration_ms), false);
  assert.equal(calculateDurationMs(undefined), null);
  assert.equal(calculateDurationMs(Number.NaN), null);

  console.log("TaskCenter duration tests passed.");
} finally {
  taskCenter.close();
  fs.rmSync(root, { recursive: true, force: true });
}
