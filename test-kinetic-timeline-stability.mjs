import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createKineticTextService, constrainKineticTimelineToVoiceScript } from "./server/kinetic-text/kinetic-text-service.js";

function plainText(value = "") {
  return String(value).replace(/[^\p{L}\p{N}]/gu, "");
}

const voiceScript = "你不是学不进去，而是掉进了一个认知陷阱，叫过度求源主义。";
const asrTimeline = [
  { id: "asr-1", start: 0, end: 1.15, text: "你不是学习不进去", words: [{ text: "学习", start: 0.2, end: 0.6 }] },
  { id: "asr-2", start: 1.15, end: 3.45, text: "而是调进一个认知现井" },
  { id: "asr-3", start: 3.45, end: 5.2, text: "叫过度求援主义" },
];

const corrected = constrainKineticTimelineToVoiceScript(asrTimeline, voiceScript);
assert.equal(corrected.length, asrTimeline.length, "subtitle row count must not change");
assert.deepEqual(
  corrected.map((row) => [row.start, row.end]),
  asrTimeline.map((row) => [row.start, row.end]),
  "subtitle start/end times must not change",
);
assert.equal(plainText(corrected.map((row) => row.text).join("")), plainText(voiceScript));
assert.equal(corrected.some((row, index) => row.text !== asrTimeline[index].text), true);
assert.deepEqual(corrected.map((row) => row.words), [[], [], []], "stale ASR word rows must not override corrected sentence text");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "kinetic-timeline-stability-"));
try {
  const service = createKineticTextService({
    baseDir: root,
    downloadsDir: path.join(root, "downloads"),
    getDownloadsDir: () => path.join(root, "downloads"),
    ffmpegPath: "",
    ffprobePath: "",
    onOutput: () => {},
  });

  const project = await service.create({
    tts: {
      id: 88,
      alignment_status: "confirmed",
      final_text: voiceScript,
      subtitle_timeline: asrTimeline,
      audio_path: "",
      duration: 5.2,
    },
    effectId: "rolling-focus-subtitle",
  });

  assert.equal(project.segments.length, asrTimeline.length);
  assert.deepEqual(project.segments.map((row) => [row.start, row.end]), asrTimeline.map((row) => [row.start, row.end]));
  assert.equal(plainText(project.segments.map((row) => row.text).join("")), plainText(voiceScript));

  const noisySharedRows = [
    { start: 0, end: 1.15, text: "离题很远也要继续" },
    { start: 1.15, end: 3.45, text: "完全不匹配也不能阻断" },
    { start: 3.45, end: 5.2, text: "仍然使用最接近原文" },
  ];
  const revisedVoiceScript = "今天先把动态大字视频跑稳定，再继续修其他生产线。";
  const shared = service.update(project.id, {
    text: revisedVoiceScript,
    segments: noisySharedRows,
    sentenceTimeline: noisySharedRows,
    subtitleSource: "shared-production-timeline",
  });
  assert.deepEqual(shared.segments.map((row) => [row.start, row.end]), noisySharedRows.map((row) => [row.start, row.end]));
  assert.equal(plainText(shared.segments.map((row) => row.text).join("")), plainText(revisedVoiceScript));

  const manualText = "我手工在字幕时间轴里修改";
  const manual = service.update(project.id, {
    segments: [{ ...shared.segments[0], text: manualText }],
  });
  assert.equal(manual.segments[0].text, manualText, "manual timeline edits must remain editable");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("Kinetic timeline stability rules passed");
