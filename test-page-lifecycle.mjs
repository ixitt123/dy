import assert from "node:assert/strict";
import fs from "node:fs";
import { createPageLifecycle } from "./server/core/page-lifecycle.js";

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
assert.match(runtime, /pagehide[\s\S]*\/api\/page-close/u, "Page close and refresh must notify the lifecycle endpoint.");
assert.match(server, /graceMs:\s*30_000/u, "Production lifecycle grace period must remain 30 seconds.");
assert.match(runtime, /navigationType === "reload"[\s\S]*reason: pageExitReason/u, "Refresh and close must be reported separately when the browser exposes navigation intent.");
assert.match(server, /lifecycle:\s*pageLifecycle\.status\(\)/u, "Status API must expose lifecycle state for verification.");
assert.match(runtime, /UI_DRAFT_STORAGE_KEY[\s\S]*restoreUiDraftValues/u, "Text inputs and ordinary parameters must be restored after refresh.");
assert.match(runtime, /api\.\?key\|secret\|token\|cookie\|password/u, "Sensitive credentials must never be stored in browser drafts.");
assert.match(workbench, /short-video-workbench-page/u, "The active feature page must be restored after refresh.");
assert.match(launcher, /const url = await existingServerUrl\(\)/u, "The launcher must always reuse an existing backend.");
assert.doesNotMatch(launcher, /syncChanged\s*\?\s*""\s*:\s*await existingServerUrl/u, "A repository sync must never bypass single-instance reuse.");
assert.match(server, /fs\.openSync\(pidPath, "wx"\)/u, "The backend must use an exclusive single-instance lock.");

console.log("Page lifecycle: OK");
