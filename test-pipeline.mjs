import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PipelineBus } from "./server/core/pipeline-bus/PipelineBus.js";
import {
  getNextStage,
  getNextStageId,
  getStageIdList,
  normalizePipelineStage,
} from "./server/core/pipeline-bus/PipelineEvents.js";

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dy-pipeline-"));
const bus = new PipelineBus(testRoot);

try {
  assert.deepEqual(PipelineBus.STAGES, getStageIdList());
  assert.deepEqual(PipelineBus.STAGES, [
    "collect", "normalize", "analyze", "rewrite", "director", "storyboard",
    "image", "tts", "timeline", "render", "export", "qa",
  ]);
  assert.equal(normalizePipelineStage("asset"), "image");
  assert.equal(normalizePipelineStage("video"), "render");
  assert.equal(normalizePipelineStage("jianying"), "export");
  assert.equal(getNextStage("video")?.id, "export");
  assert.equal(getNextStageId("export"), "qa");
  assert.equal(getNextStageId("qa"), null);

  const sourceId = "shared-bank-source";
  const collect = bus.insertStageRecord("collect", { sourceId, data: { value: 1 } });
  const normalize = bus.insertStageRecord("normalize", { sourceId, data: { value: 2 } });
  const analyze = bus.insertStageRecord("analyze", { sourceId, data: { value: 3 } });
  assert.notEqual(collect.id, normalize.id);
  assert.notEqual(normalize.id, analyze.id);
  assert.equal(collect.source_type, "pipeline:collect");
  assert.equal(normalize.source_type, "pipeline:normalize");
  assert.equal(analyze.source_type, "pipeline:analyze");

  const pipeline = bus.getPipelineBySourceId(sourceId);
  assert.equal(pipeline.stages.collect.record.id, collect.id);
  assert.equal(pipeline.stages.normalize.record.id, normalize.id);
  assert.equal(pipeline.stages.analyze.record.id, analyze.id);

  const image = bus.insertStageRecord("asset", { sourceId: "alias-image", data: {} });
  assert.equal(image.source_type, "pipeline:image");
  assert.equal(bus.getBank("asset"), bus.imageBank);
  assert.equal(bus.getBank("video"), bus.videoBank);
  assert.equal(bus.getBank("jianying"), bus.jianyingBank);

  const exportRecord = bus.insertStageRecord("export", { sourceId: "canonical-export", data: {} });
  const canonicalResult = bus.onStageComplete("export", {
    sourceId: "canonical-export",
    recordId: exportRecord.id,
    data: { exported: true },
  });
  assert.equal(canonicalResult.nextStage, "qa");
  assert.equal(canonicalResult.nextRecord.source_type, "pipeline:qa");

  let legacyCompleted = false;
  let legacyQaSkipped = false;
  bus.once("pipeline:complete", (event) => { legacyCompleted = event.compatibility === true; });
  bus.once("stage:skip", (event) => { legacyQaSkipped = event.stage === "qa"; });
  const legacyRecord = bus.insertStageRecord("jianying", { sourceId: "legacy-jianying", data: {} });
  const legacyResult = bus.onStageComplete("jianying", {
    sourceId: "legacy-jianying",
    recordId: legacyRecord.id,
    data: { exported: true },
  });
  assert.equal(legacyResult.nextStage, null);
  assert.equal(legacyCompleted, true);
  assert.equal(legacyQaSkipped, true);
  assert.equal(bus.videoBank.getBySourceIdAndType("legacy-jianying", "pipeline:qa"), null);

  const legacyVideoSource = "legacy-video";
  const timelineRecord = bus.insertStageRecord("timeline", { sourceId: legacyVideoSource, data: { timeline: true } });
  const legacyVideoResult = bus.onStageComplete("video", { sourceId: legacyVideoSource, data: { rendered: true } });
  const storedTimeline = bus.videoBank.getById(timelineRecord.id);
  assert.equal(storedTimeline.data.skipped, true);
  assert.equal(legacyVideoResult.currentRecord.source_type, "pipeline:render");
  assert.notEqual(legacyVideoResult.currentRecord.id, timelineRecord.id);

  console.log("Pipeline stage, alias and shared-bank tests passed.");
} finally {
  bus.destroy();
  fs.rmSync(testRoot, { recursive: true, force: true });
}
