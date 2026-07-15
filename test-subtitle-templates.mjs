import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { KINETIC_TEXT_EFFECTS, effectById } from "./server/kinetic-text/effects.js";
import { buildAss, createKineticTextService } from "./server/kinetic-text/kinetic-text-service.js";

assert.equal(KINETIC_TEXT_EFFECTS.length, 10, "正式注册表必须恰好包含首批 10 套");
assert.equal(KINETIC_TEXT_EFFECTS.some((item) => item.id === "glitch-jitter"), false, "旧 24 字效不得继续注册");

const segments = [
  { id: "s1", start: 0, end: 1.2, text: "效率来自正确选择。", keywords: ["效率", "选择"], speaker: "主讲人" },
  { id: "s2", start: 1.2, end: 2.6, text: "每一步都更接近结果。", keywords: ["每一步", "结果"], speaker: "嘉宾" },
];

const words = segments.flatMap((segment) => [...segment.text].map((text, index, list) => ({
  text,
  start: segment.start + (segment.end - segment.start) * index / list.length,
  end: segment.start + (segment.end - segment.start) * (index + 1) / list.length,
})));

for (const template of KINETIC_TEXT_EFFECTS) {
  for (const aspectRatio of ["9:16", "16:9"]) {
    const ass = buildAss({ id: "test", effectId: template.id, effectParams: template.defaultParams, aspectRatio, duration: 2.6, text: segments.map((item) => item.text).join(""), wordTimeline: words, segments, showBottomSubtitles: false });
    assert.match(ass, new RegExp(`PlayResX: ${aspectRatio === "9:16" ? 1080 : 1920}`));
    assert.match(ass, new RegExp(`PlayResY: ${aspectRatio === "9:16" ? 1920 : 1080}`));
    assert.match(ass, /Dialogue:/, `${template.id} 必须产生正式 ASS event`);
    assert.equal(/NaN|undefined/.test(ass), false, `${template.id} 不得产生无效数值`);
    if (["word-highlight", "karaoke-sweep"].includes(template.id)) assert.match(ass, /\\k(?:f)?\d+/, `${template.id} 必须使用真实 karaoke timing tag`);
  }

  const dir = path.join("subtitle-templates", template.id);
  for (const name of ["index.ts", "Template.tsx", "defaultConfig.ts", "metadata.ts", "preview.mp4", "preview.png", "preview-9x16.mp4", "preview-16x9.mp4", "SOURCE.md"]) {
    assert.equal(fs.existsSync(path.join(dir, name)), true, `${template.id} 缺少 ${name}`);
  }
  assert.equal(fs.statSync(path.join(dir, "preview.mp4")).size > 10_000, true, `${template.id} preview.mp4 无效`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "subtitle-template-test-"));
const service = createKineticTextService({ baseDir: process.cwd(), downloadsDir: path.join(tempRoot, "downloads"), ffmpegPath, ffprobePath: ffprobeStatic.path, modelRouter: null });
const created = await service.create({
  aspectRatio: "9:16",
  effectId: "word-highlight",
  tts: {
    id: 20260715,
    alignment_status: "confirmed",
    final_text: segments.map((segment) => segment.text).join(""),
    duration: 2.6,
    sentence_timeline: segments,
    word_timeline: words,
  },
});
assert.equal(created.wordTimeline.length, words.length, "确认后的 TTS wordTimeline 必须原样进入字幕项目");
assert.equal(created.segments.every((segment) => segment.words.length > 0), true, "逐词时间必须附着到对应句段");
assert.equal(created.aspectRatio, "9:16");
assert.equal(effectById(created.effectId).id, "word-highlight");

console.log(`subtitle templates ok: ${KINETIC_TEXT_EFFECTS.length} templates, 2 aspect ratios, confirmed word timeline preserved`);
