import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createKineticTextService } from "./server/kinetic-text/kinetic-text-service.js";

const confirmedRows = [
  { id: "tts-sentence-1", start: 0, end: 17.8, text: "听不懂的本质是基础不牢,记不住的本质是理解不深。" },
  { id: "tts-sentence-2", start: 17.8, end: 21.52, text: "听不懂的本质是基础不牢" },
  { id: "tts-sentence-3", start: 21.52, end: 26.6, text: "记不住的本质是理解不深" },
  { id: "tts-sentence-4", start: 26.6, end: 28.96, text: "总出错的本质是审题不轻" },
  { id: "tts-sentence-5", start: 28.96, end: 32.68, text: "学的慢的本质是方法不对" },
  { id: "tts-sentence-6", start: 32.68, end: 35.52, text: "会偏科的本质是" },
];
const confirmedText = "听不懂的本质是基础不牢，记不住的本质是理解不深。不会做的本质是练习不够。";
const coreRows = (rows) => rows.map((row) => ({
  start: Number(row.start),
  end: Number(row.end),
  text: String(row.text),
}));

const root = fs.mkdtempSync(path.join(os.tmpdir(), "production-tts-integrity-"));
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
      id: 70,
      alignment_status: "confirmed",
      alignment_revision: 4,
      handoff_id: "tts-70-regression",
      handoff_revision: "tts-70-revision-1",
      final_text: confirmedText,
      sentence_timeline: confirmedRows,
      subtitle_timeline: confirmedRows,
      duration: 35.52,
    },
    effectId: "rolling-focus-subtitle",
  });

  assert.deepEqual(
    coreRows(project.segments),
    coreRows(confirmedRows),
    "dynamic text creation must preserve every confirmed TTS row without rewriting or re-segmenting",
  );
  assert.equal(project.text, confirmedText);
  assert.equal(project.subtitleSource, "shared-production-timeline");
  assert.equal(project.timelineAuthority, "tts-confirmed");
  assert.equal(project.ttsHandoffRevision, "tts-70-revision-1");

  const reopened = service.get(project.id);
  assert.deepEqual(
    coreRows(reopened.segments),
    coreRows(confirmedRows),
    "reopening a production project must not self-heal or rewrite confirmed TTS rows",
  );

  const blockedLocalEdit = service.update(project.id, {
    text: "生产线自行修改的错误文案",
    segments: project.segments.map((row, index) => ({
      ...row,
      text: index === 0 ? "生产线自行修改的错误字幕" : row.text,
    })),
  });
  assert.equal(blockedLocalEdit.text, confirmedText, "production pages must not replace the TTS source text");
  assert.deepEqual(
    coreRows(blockedLocalEdit.segments),
    coreRows(confirmedRows),
    "production pages must not replace confirmed TTS row text or timing",
  );

  const resentRows = confirmedRows.map((row, index) => ({
    ...row,
    text: index === 0 ? "TTS 页面重新确认后的第一段" : row.text,
  }));
  const resent = service.update(project.id, {
    text: confirmedText,
    originalText: confirmedText,
    segments: resentRows,
    sentenceTimeline: resentRows,
    subtitleTimeline: resentRows,
    subtitleSource: "shared-production-timeline",
    timelineAuthority: "tts-confirmed",
    ttsHandoffRevision: "tts-70-revision-2",
  });
  assert.deepEqual(
    coreRows(resent.segments),
    coreRows(resentRows),
    "only a new confirmed TTS handoff may replace production timeline content",
  );

  const sources = {
    cs1: fs.readFileSync(new URL("./ui/modules/cs1-video.js", import.meta.url), "utf8"),
    xiaohei: fs.readFileSync(new URL("./ui/modules/ian-xiaohei-app.js", import.meta.url), "utf8"),
    moneyPrinter: fs.readFileSync(new URL("./ui/modules/money-printer.js", import.meta.url), "utf8"),
    kinetic: fs.readFileSync(new URL("./ui/modules/kinetic-text.js", import.meta.url), "utf8"),
  };
  for (const [name, source] of Object.entries(sources)) {
    assert.match(
      source,
      /textarea data-field="text"[^>]*readonly[^>]*aria-readonly="true"/u,
      `${name} production timeline text must be read-only`,
    );
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("Production TTS content integrity: OK");
