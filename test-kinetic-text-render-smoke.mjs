import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

  const job = service.startRender(project.id);
  const completed = await waitForJob(service, job.id);
  const renderedProject = completed.result?.project || service.get(project.id);
  const videoPath = completed.result?.videoPath || renderedProject?.outputs?.finalVideo;

  assert.equal(completed.status, "completed");
  assert.equal(renderedProject.status, "completed");
  assert.ok(fs.existsSync(renderedProject.outputs.assPath), "Expected generated ASS subtitle file");
  assert.ok(fs.existsSync(renderedProject.outputs.srtPath), "Expected generated SRT subtitle file");
  assertMp4(videoPath);
} finally {
  if (process.env.KEEP_KINETIC_SMOKE_OUTPUT !== "1") {
    fs.rmSync(root, { recursive: true, force: true });
  } else {
    console.log(`Kinetic smoke output kept at ${root}`);
  }
}

console.log("Kinetic text render smoke test passed");
