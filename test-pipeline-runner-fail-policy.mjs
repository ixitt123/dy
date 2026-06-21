import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PIPELINE_EVENTS, getStageIdList } from "./server/core/pipeline-bus/PipelineEvents.js";
import { PipelineRunner } from "./server/core/pipeline-bus/PipelineRunner.js";
import { PipelineState } from "./server/core/pipeline-bus/PipelineState.js";

const testRoots = [];
process.on("exit", () => {
  for (const root of testRoots) fs.rmSync(root, { recursive: true, force: true });
});

function completeHandlers(overrides = {}, omitted = []) {
  return Object.fromEntries(getStageIdList()
    .filter((stage) => !omitted.includes(stage))
    .map((stage) => [stage, overrides[stage] || (async (data) => ({ ...data, [stage]: true }))]));
}

async function runScenario(handlers, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dy-runner-"));
  testRoots.push(root);
  const state = new PipelineState(root);
  const bus = new EventEmitter();
  const events = [];
  for (const event of Object.values(PIPELINE_EVENTS)) bus.on(event, (data) => events.push({ event, data }));
  const runner = new PipelineRunner({ bus, state, handlers, stagePolicies: options.stagePolicies });
  const result = await runner.start({ sourceId: "test", inputData: { seed: true }, startFrom: options.startFrom || "collect" });
  return { result, state, events, runner };
}

const criticalThrow = await runScenario(completeHandlers({
  analyze: async () => { throw new Error("analyze failed"); },
}));
assert.equal(criticalThrow.result.status, "failed");
assert.equal(criticalThrow.result.failedStage, "analyze");
assert.equal(criticalThrow.result.completedStages.includes("rewrite"), false);
assert.equal(criticalThrow.events.some(({ event }) => event === PIPELINE_EVENTS.PIPELINE_ERROR), true);
assert.equal(criticalThrow.events.some(({ event }) => event === PIPELINE_EVENTS.PIPELINE_COMPLETE), false);
criticalThrow.state.completeJob(criticalThrow.result.jobId);
assert.equal(criticalThrow.state.getJobState(criticalThrow.result.jobId).status, "failed");

const nonCriticalThrow = await runScenario(completeHandlers({
  storyboard: async () => { throw new Error("storyboard failed"); },
}));
assert.equal(nonCriticalThrow.result.status, "done");
assert.equal(nonCriticalThrow.result.skippedStages.includes("storyboard"), true);
assert.equal(nonCriticalThrow.result.warnings.length > 0, true);
assert.equal(nonCriticalThrow.result.completedStages.includes("image"), true);

const criticalMissing = await runScenario(completeHandlers({}, ["collect"]));
assert.equal(criticalMissing.result.status, "failed");
assert.equal(criticalMissing.result.failedStage, "collect");
assert.equal(criticalMissing.result.errors.length, 1);

const nonCriticalMissing = await runScenario(completeHandlers({}, ["storyboard"]));
assert.equal(nonCriticalMissing.result.status, "done");
assert.equal(nonCriticalMissing.result.skippedStages.includes("storyboard"), true);

const aliasRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dy-runner-alias-"));
testRoots.push(aliasRoot);
try {
  const runner = new PipelineRunner({ bus: new EventEmitter(), state: new PipelineState(aliasRoot), handlers: {} });
  runner.registerHandler("video", async (data) => ({ ...data, rendered: true }));
  const result = await runner.runStage("video", { seed: true });
  assert.equal(result.rendered, true);
} finally {
  fs.rmSync(aliasRoot, { recursive: true, force: true });
}

console.log("Pipeline runner failure-policy tests passed.");
