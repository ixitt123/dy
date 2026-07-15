import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { createKineticTextService } from "./server/kinetic-text/kinetic-text-service.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "subtitle-render-test-"));
const service = createKineticTextService({ baseDir: root, downloadsDir: path.join(root, "downloads"), ffmpegPath, ffprobePath: ffprobeStatic.path, modelRouter: null });
const segment = { id: "s1", start: 0, end: 1.25, text: "真正重要的是结果。", keywords: ["重要", "结果"], speaker: "主讲人" };
const words = [...segment.text].map((text, index, list) => ({ text, start: 1.25 * index / list.length, end: 1.25 * (index + 1) / list.length }));

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

for (const [effectId, aspectRatio, expected] of [
  ["word-highlight", "9:16", "1080x1920"],
  ["caption-card", "16:9", "1920x1080"],
]) {
  const project = await service.create({ effectId, aspectRatio, text: segment.text, segments: [segment], tts: { alignment_status: "confirmed", final_text: segment.text, duration: 1.25, sentence_timeline: [segment], word_timeline: words } });
  const job = service.startRender(project.id);
  const finished = await waitFor(job.id);
  const videoPath = finished.result?.videoPath;
  assert.equal(Boolean(videoPath && fs.existsSync(videoPath)), true, `${effectId} 正式 MP4 未生成`);
  const probe = spawnSync(ffprobeStatic.path, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "default=nw=1", videoPath], { encoding: "utf8", windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, new RegExp(`width=${expected.split("x")[0]}[\\s\\S]*height=${expected.split("x")[1]}`));
  assert.match(probe.stdout, /r_frame_rate=30\/1/);
}

fs.rmSync(root, { recursive: true, force: true });
console.log("subtitle formal render ok: 9:16 word timing + 16:9 card, 30fps MP4");
