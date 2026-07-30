import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { createKineticTextService } from "./server/kinetic-text/kinetic-text-service.js";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJob(service, jobId, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = service.getJob(jobId);
    if (job?.status === "completed") return job;
    if (job?.status === "failed") {
      throw new Error(`${job.stage || "Kinetic render failed"}: ${job.error || "unknown error"}`);
    }
    await wait(250);
  }
  throw new Error(`Timed out waiting for kinetic text render job ${jobId}`);
}

function assertMp4(filePath) {
  assert.ok(fs.existsSync(filePath), `Expected MP4 output at ${filePath}`);
  const stat = fs.statSync(filePath);
  assert.ok(stat.size > 1024, `Expected non-empty MP4 output, got ${stat.size} bytes`);
  const header = fs.readFileSync(filePath).subarray(0, 16).toString("latin1");
  assert.match(header, /ftyp/, "Expected MP4 ftyp box in output header");
}

function runFfmpeg(args, description) {
  const result = spawnSync(ffmpegPath, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `${description} failed: ${result.stderr || result.stdout}`);
}

function renderedMaxVolume(filePath) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  assert.equal(result.status, 0, `Unable to inspect rendered audio: ${result.stderr || result.stdout}`);
  const match = `${result.stdout}\n${result.stderr}`.match(/max_volume:\s*(-?(?:\d+(?:\.\d+)?)|-inf) dB/i);
  assert.ok(match, "Expected FFmpeg to report a maximum rendered audio volume");
  return match[1] === "-inf" ? Number.NEGATIVE_INFINITY : Number(match[1]);
}

assert.ok(ffmpegPath, "ffmpeg-static must provide an ffmpeg binary");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "kinetic-render-smoke-"));
const downloadsDir = path.join(root, "downloads");

try {
  const service = createKineticTextService({
    baseDir: root,
    downloadsDir,
    getDownloadsDir: () => downloadsDir,
    ffmpegPath,
    ffprobePath: ffprobeStatic?.path || "",
    onOutput: () => {},
  });

  const project = await service.create({
    title: "kinetic-smoke",
    text: "\u52a8\u6001\u5927\u5b57\u89c6\u9891\u70df\u6d4b\u3002\u4eca\u5929\u5148\u786e\u4fdd\u80fd\u8dd1\u901a\u3002",
    aspectRatio: "9:16",
    effectId: "rolling-focus-subtitle",
    frameRate: 30,
  });

  assert.equal(project.status, "editing");
  assert.ok(project.segments.length >= 1, "Expected subtitle segments to be created");
  const projectList = service.list();
  assert.equal(projectList.length, 1, "Expected the project to appear in the history list");
  assert.equal(projectList[0].id, project.id);
  assert.equal(Object.hasOwn(projectList[0], "segments"), false, "Project history must stay lightweight and avoid loading every subtitle timeline");

  const job = service.startRender(project.id);
  const completed = await waitForJob(service, job.id);
  const renderedProject = completed.result?.project || service.get(project.id);
  const videoPath = completed.result?.videoPath || renderedProject?.outputs?.finalVideo;

  assert.equal(completed.status, "completed");
  assert.equal(renderedProject.status, "completed");
  assert.ok(fs.existsSync(renderedProject.outputs.assPath), "Expected generated ASS subtitle file");
  assert.ok(fs.existsSync(renderedProject.outputs.srtPath), "Expected generated SRT subtitle file");
  assertMp4(videoPath);

  // A silent narration plus a tone-only BGM proves the actual output uses the BGM mix branch.
  // If the BGM is not passed into FFmpeg's amix filter, the final MP4 remains digital silence.
  const silentNarrationPath = path.join(root, "silent-narration.wav");
  const bgmTonePath = path.join(root, "bgm-tone.wav");
  runFfmpeg(["-y", "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-t", "1.2", silentNarrationPath], "Creating silent narration fixture");
  runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=44100", "-t", "1.2", bgmTonePath], "Creating BGM tone fixture");

  const bgmProject = await service.create({
    title: "kinetic-bgm-mix-smoke",
    text: "背景音乐混音验证。",
    tts: {
      audio_path: silentNarrationPath,
      final_text: "背景音乐混音验证。",
      duration: 1.2,
    },
    aspectRatio: "9:16",
    effectId: "rolling-focus-subtitle",
    frameRate: 30,
  });
  const updatedBgmProject = service.update(bgmProject.id, {
    audioMix: {
      source: "local",
      localPath: bgmTonePath,
      localName: "BGM 混音回归音调",
      ttsVolume: 100,
      backgroundVolume: 18,
    },
  });
  assert.equal(updatedBgmProject.audioMix.source, "local");
  assert.equal(updatedBgmProject.audioMix.localPath, bgmTonePath);

  const bgmJob = service.startRender(bgmProject.id);
  const completedBgmJob = await waitForJob(service, bgmJob.id);
  const renderedBgmProject = completedBgmJob.result?.project || service.get(bgmProject.id);
  const bgmVideoPath = completedBgmJob.result?.videoPath || renderedBgmProject?.outputs?.finalVideo;

  assert.equal(completedBgmJob.status, "completed");
  assertMp4(bgmVideoPath);
  assert.ok(renderedMaxVolume(bgmVideoPath) > -70, "Expected the rendered BGM mix to contain audible audio");
} finally {
  if (process.env.KEEP_KINETIC_SMOKE_OUTPUT !== "1") {
    fs.rmSync(root, { recursive: true, force: true });
  } else {
    console.log(`Kinetic smoke output kept at ${root}`);
  }
}

console.log("Kinetic text render smoke test passed");
