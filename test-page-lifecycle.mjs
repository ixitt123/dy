import assert from "node:assert/strict";
import fs from "node:fs";
import { createPageLifecycle } from "./server/core/page-lifecycle.js";
import { runtimeCommandMatches, runtimeProcessIsRunning } from "./server/core/runtime-process.js";

function fakeClock() {
  let current = 0;
  let nextId = 1;
  const timers = new Map();
  const api = {
    now: () => current,
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, at: current + delay });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advance(ms) {
      current += ms;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= current)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        due[1].callback();
      }
    },
  };
  return api;
}

const clock = fakeClock();
let shutdowns = 0;
const lifecycle = createPageLifecycle({
  graceMs: 30_000,
  heartbeatStaleMs: 12_000,
  onShutdown: () => { shutdowns += 1; },
  now: clock.now,
  setTimer: clock.setTimer,
  clearTimer: clock.clearTimer,
});

lifecycle.scheduleIfDisconnected();
assert.equal(lifecycle.status().shutdownPending, false, "Server must not close before its first page connection.");
lifecycle.touch("page-before-refresh");
lifecycle.close("page-before-refresh");
assert.equal(lifecycle.status().shutdownInSeconds, 30);
clock.advance(29_000);
assert.equal(shutdowns, 0, "A disconnected page must keep the backend alive throughout the grace period.");
lifecycle.touch("page-after-refresh");
assert.equal(lifecycle.status().shutdownPending, false, "A refreshed page must cancel pending shutdown.");
lifecycle.close("page-after-refresh");
clock.advance(30_000);
assert.equal(shutdowns, 1, "The backend must close after 30 seconds without a page.");

const reloadClock = fakeClock();
let reloadShutdowns = 0;
const reloadLifecycle = createPageLifecycle({
  graceMs: 30_000,
  heartbeatStaleMs: 12_000,
  onShutdown: () => { reloadShutdowns += 1; },
  now: reloadClock.now,
  setTimer: reloadClock.setTimer,
  clearTimer: reloadClock.clearTimer,
});
reloadLifecycle.touch("page-being-refreshed");
reloadLifecycle.close("page-being-refreshed", { isReload: true });
assert.equal(reloadLifecycle.status().shutdownPending, false, "A detected refresh must not start the close countdown.");
reloadClock.advance(1_000);
reloadLifecycle.touch("page-after-reload");
assert.equal(reloadShutdowns, 0, "Reload reconnection must keep the backend and tasks alive.");

const crashClock = fakeClock();
let crashShutdowns = 0;
const crashLifecycle = createPageLifecycle({
  graceMs: 30_000,
  heartbeatStaleMs: 12_000,
  onShutdown: () => { crashShutdowns += 1; },
  now: crashClock.now,
  setTimer: crashClock.setTimer,
  clearTimer: crashClock.clearTimer,
});
crashLifecycle.touch("crashed-page");
crashClock.advance(13_000);
crashLifecycle.sweep();
assert.equal(crashLifecycle.status().shutdownInSeconds, 17, "Crash timeout must count from the last heartbeat.");
crashClock.advance(17_000);
assert.equal(crashShutdowns, 1, "A crashed browser must trigger the same 30-second shutdown rule.");

const runtime = fs.readFileSync(new URL("./ui/modules/legacy-runtime.js", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const workbench = fs.readFileSync(new URL("./ui/workbench.js", import.meta.url), "utf8");
const launcher = fs.readFileSync(new URL("./launch-ui.mjs", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./ui/index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./ui/app.css", import.meta.url), "utf8");
assert.equal(
  runtimeCommandMatches(
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\workspace\\ui-server.mjs" --open',
    "C:\\workspace\\ui-server.mjs",
  ),
  true,
  "The runtime lock must recognize the expected Node backend.",
);
assert.equal(
  runtimeCommandMatches(
    '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --type=renderer',
    "C:\\workspace\\ui-server.mjs",
  ),
  false,
  "A recycled PID owned by Edge must not block the backend launcher.",
);
assert.equal(
  runtimeProcessIsRunning(16048, {
    expectedEntryPath: "C:\\workspace\\ui-server.mjs",
    platform: "win32",
    signalProcess: () => {},
    commandLineLookup: () => '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --type=renderer',
  }),
  false,
  "An active recycled PID must be rejected when its command line belongs to another program.",
);
assert.equal(
  runtimeProcessIsRunning(6832, {
    expectedEntryPath: "C:\\workspace\\ui-server.mjs",
    platform: "win32",
    signalProcess: () => {},
    commandLineLookup: () => '"C:\\Program Files\\nodejs\\node.exe" "C:\\workspace\\ui-server.mjs" --open',
  }),
  true,
  "The active backend PID must retain the single-instance lock.",
);
assert.match(runtime, /pagehide[\s\S]*\/api\/page-close/u, "Page close and refresh must notify the lifecycle endpoint.");
assert.match(server, /graceMs:\s*30_000/u, "Production lifecycle grace period must remain 30 seconds.");
assert.match(runtime, /navigationType === "reload"[\s\S]*reason: pageExitReason/u, "Refresh and close must be reported separately when the browser exposes navigation intent.");
assert.match(server, /lifecycle:\s*pageLifecycle\.status\(\)/u, "Status API must expose lifecycle state for verification.");
assert.match(runtime, /UI_DRAFT_STORAGE_KEY[\s\S]*restoreUiDraftValues/u, "Text inputs and ordinary parameters must be restored after refresh.");
assert.match(runtime, /api\.\?key\|secret\|token\|cookie\|password/u, "Sensitive credentials must never be stored in browser drafts.");
assert.match(
  runtime,
  /function beginRewriteEditorLoad[\s\S]*invalidateRewriteAsyncOperations[\s\S]*async function openRewriteEditor[\s\S]*rewriteEditorLoadIsCurrent/u,
  "Opening another rewrite task must invalidate slower editor loads from the previous task.",
);
assert.match(
  runtime,
  /async function generateRewrite[\s\S]*beginRewriteAsyncOperation\("generation", id\)[\s\S]*fetchJson\("\/api\/tasks\/rewrite"[\s\S]*rewriteOperationIsCurrent\(operation\)/u,
  "A late rewrite response must not overwrite the task that is currently open.",
);
assert.match(
  runtime,
  /async function runRewriteInlineAnalysis[\s\S]*beginRewriteAsyncOperation\("analysis", id\)[\s\S]*rewriteOperationIsCurrent\(operation\)/u,
  "A late analysis response must stay bound to the task that started it.",
);
assert.match(workbench, /short-video-workbench-page/u, "The active feature page must be restored after refresh.");
assert.match(launcher, /const existingRuntime = await existingServerRuntime\(\)/u, "The launcher must verify an existing backend before reuse.");
assert.match(launcher, /new URL\("\/api\/runtime\/identity", baseUrl\)/u, "The launcher must obtain a live runtime identity rather than trusting a responsive root page.");
assert.match(launcher, /runtimeIdentityMatches\(identity, baseUrl\)/u, "Existing runtime reuse must validate the returned identity contract.");
assert.match(launcher, /identity\.projectRoot[\s\S]*identity\.entryPath[\s\S]*identity\.commit[\s\S]*identity\.url/u, "Runtime identity reuse must bind the project root, entry, commit and reported URL.");
assert.match(launcher, /pid !== ownerPid \|\| !processExists\(pid\)/u, "Runtime identity reuse must bind a live PID to the local PID file.");
assert.doesNotMatch(launcher, /const response = await fetch\(url\);/u, "A responsive root page alone must never prove runtime identity.");
assert.doesNotMatch(launcher, /fetch\(`\$\{url\}\/api\/status`\)/u, "The launcher must not treat the protected status API as an unauthenticated liveness probe.");
assert.doesNotMatch(launcher, /syncChanged\s*\?\s*null\s*:\s*await existingServerRuntime/u, "A repository sync must never bypass verified single-instance reuse.");
assert.match(server, /fs\.openSync\(pidPath, "wx"\)/u, "The backend must use an exclusive single-instance lock.");
assert.match(server, /runtimeProcessIsRunning\(pid,\s*\{\s*expectedEntryPath:\s*runtimeSourcePath\s*\}\)/u, "The backend lock must verify that an existing PID belongs to this runtime.");
assert.doesNotMatch(html, /class="status-rail"|id="railCurrentTask"|id="railRecentOutput"|id="railErrors"/u, "The right status rail must stay removed from the main page.");
assert.doesNotMatch(html, />任务线程<|>最近生成<|>错误提示<|>快捷操作</u, "Removed right rail blocks must not reappear in the main page.");
assert.match(css, /\.workbench-body\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/u, "The workbench body must let the main workspace take the former rail width.");

console.log("Page lifecycle: OK");
