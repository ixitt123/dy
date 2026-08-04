import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTaskCenterV2 } from "./server/core/task-center.js";

const server = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const workbench = fs.readFileSync(new URL("./ui/workbench.js", import.meta.url), "utf8");
const handoffStore = fs.readFileSync(new URL("./ui/modules/tts-handoff-store.js", import.meta.url), "utf8");

assert.match(server, /from "\.\/server\/core\/error-codes\.mjs"/u, "生产服务未导入统一错误码模块");
assert.match(server, /toErrorResponse\(/u, "HTTP 失败尚未输出统一错误结构");
assert.match(server, /JOB_NOT_FOUND/u, "永久不存在响应没有统一 code");
assert.match(server, /BUSINESS_FAILURE/u, "业务失败响应没有统一 code");
assert.match(workbench, /error\.code\s*=\s*data\.code/u, "前端请求错误没有保留 code");
assert.match(workbench, /error\.retryable\s*=\s*Boolean\(data\.retryable\)/u, "前端请求错误没有保留 retryable");
assert.match(handoffStore, /throw codedError\(data,/u, "四线 handoff 前端没有消费统一错误结构");
assert.match(handoffStore, /error\.retryable\s*=\s*Boolean\(data\?\.retryable\)/u, "四线 handoff 前端没有保留 retryable");

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
globalThis.localStorage = { getItem: () => "", setItem() {}, removeItem() {} };
globalThis.fetch = async () => new Response(JSON.stringify({
  ok: false,
  code: "TEMPORARY_FAILURE",
  category: "temporary",
  retryable: true,
  retryAfterMs: 2500,
  message: "上游繁忙",
}), { status: 503, headers: { "content-type": "application/json" } });
await import(`./ui/modules/tts-handoff-store.js?error-contract=${Date.now()}`);
await assert.rejects(
  () => globalThis.ttsHandoffStore.save({ id: "job-1", handoff_id: "handoff-1", handoff_revision: "rev-1" }, ["cs1-video"]),
  (error) => error.code === "TEMPORARY_FAILURE" && error.category === "temporary" && error.retryable === true && error.retryAfterMs === 2500,
  "前端没有把临时失败保留为可重试错误",
);
globalThis.fetch = originalFetch;
if (originalStorage === undefined) delete globalThis.localStorage;
else globalThis.localStorage = originalStorage;

const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "error-code-task-"));
const taskCenter = createTaskCenterV2(taskRoot);
const failedTaskId = taskCenter.submit("error-contract", "offline", {}, async () => {
  throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
});
let failedTask = null;
for (let attempt = 0; attempt < 50; attempt += 1) {
  failedTask = taskCenter.getAllTasks().find((task) => task.id === failedTaskId) || null;
  if (failedTask?.status === "failed") break;
  await new Promise((resolve) => setTimeout(resolve, 20));
}
assert.equal(failedTask?.output?.errorCode, "UPSTREAM_OFFLINE");
assert.equal(failedTask?.output?.retryable, true);
const failedEvent = taskCenter.getJobEvents(failedTaskId).find((event) => event.event_type === "failed");
assert.equal(failedEvent?.payload?.category, "offline");
assert.equal(failedEvent?.payload?.retryable, true);
taskCenter.close();
fs.rmSync(taskRoot, { recursive: true, force: true });

console.log("Error code production integration: OK");
