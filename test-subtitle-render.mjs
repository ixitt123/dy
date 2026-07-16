import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { buildAss, createKineticTextService } from "./server/kinetic-text/kinetic-text-service.js";
import { sanitizeClientProjectChanges } from "./server/routes/kinetic-text-routes.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "subtitle-render-test-"));
let selectedDownloadsDir = path.join(root, "downloads-a");
const service = createKineticTextService({ baseDir: root, downloadsDir: selectedDownloadsDir, getDownloadsDir: () => selectedDownloadsDir, ffmpegPath, ffprobePath: ffprobeStatic.path, modelRouter: null });
const segment = { id: "s1", start: 0, end: 1.25, text: "真正重要的是结果。", keywords: ["重要", "结果"], speaker: "主讲人" };
const words = [...segment.text].map((text, index, list) => ({ text, start: 1.25 * index / list.length, end: 1.25 * (index + 1) / list.length }));

function countBottomDialogues(ass) {
  return ass.split(/\r?\n/).filter((line) => line.startsWith("Dialogue:") && line.includes(",Bottom,")).length;
}

assert.deepEqual(
  sanitizeClientProjectChanges({ showBottomSubtitles: false, outputs: { finalVideo: "old.mp4" } }),
  { showBottomSubtitles: false },
  "client project updates must not preserve stale render outputs",
);

async function waitFor(jobId) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const job = service.getJob(jobId);
    if (job?.status === "completed") return job;
    if (job?.status === "failed") throw new Error(job.error || job.stage);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`render timeout: ${jobId}`);
}

for (const [index, [effectId, aspectRatio, expected, expectedFrameRate]] of [
  ["rolling-focus", "9:16", "1080x1920", 30],
  ["rolling-focus-subtitle", "16:9", "1920x1080", 60],
].entries()) {
  if (index === 1) selectedDownloadsDir = path.join(root, "downloads-b");
  const withBookends = effectId === "rolling-focus-subtitle";
  const renderDuration = withBookends ? 2.5 : 1.25;
  const renderSegment = withBookends ? { ...segment, start: 0.65, end: 1.85 } : segment;
  const renderWords = [...renderSegment.text].map((text, wordIndex, list) => ({
    text,
    start: renderSegment.start + (renderSegment.end - renderSegment.start) * wordIndex / list.length,
    end: renderSegment.start + (renderSegment.end - renderSegment.start) * (wordIndex + 1) / list.length,
  }));
  const project = await service.create({
    effectId,
    aspectRatio,
    frameRate: expectedFrameRate,
    text: renderSegment.text,
    segments: [renderSegment],
    bookends: withBookends ? {
      intro: { enabled: true, preset: "custom", text: "片头标题" },
      outro: { enabled: true, preset: "custom", text: "记得关注" },
    } : {},
    tts: { alignment_status: "confirmed", final_text: renderSegment.text, duration: renderDuration, sentence_timeline: [renderSegment], word_timeline: renderWords },
  });
  const bottomDisabledAss = buildAss({ ...project, keywordPlacement: "line", showBottomSubtitles: false });
  assert.equal(countBottomDialogues(bottomDisabledAss), 0, `${effectId} must not burn bottom subtitles when disabled`);
  const bottomEnabledAss = buildAss({ ...project, keywordPlacement: "bottom", showBottomSubtitles: true });
  assert.equal(countBottomDialogues(bottomEnabledAss) > 0, true, `${effectId} must burn bottom subtitles when enabled`);
  if (withBookends) {
    assert.equal(project.bookendWindows.intro.available, true, "正式渲染必须识别可用片头留白");
    assert.equal(project.bookendWindows.outro.available, true, "正式渲染必须识别可用片尾留白");
  }
  const job = service.startRender(project.id);
  const finished = await waitFor(job.id);
  const videoPath = finished.result?.videoPath;
  assert.equal(Boolean(videoPath && fs.existsSync(videoPath)), true, `${effectId} 正式 MP4 未生成`);
  assert.equal(path.dirname(path.resolve(videoPath)), path.resolve(selectedDownloadsDir), `${effectId} 没有直接保存到重新选择的下载目录`);
  const probe = spawnSync(ffprobeStatic.path, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "default=nw=1", videoPath], { encoding: "utf8", windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, new RegExp(`width=${expected.split("x")[0]}[\\s\\S]*height=${expected.split("x")[1]}`));
  assert.match(probe.stdout, new RegExp(`r_frame_rate=${expectedFrameRate}\\/1`));
}

fs.rmSync(root, { recursive: true, force: true });
console.log("subtitle formal render ok: retained rolling focus templates at 9:16/30fps and 16:9/60fps");
