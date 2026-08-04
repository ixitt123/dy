import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { createKineticTextService } from "./server/kinetic-text/kinetic-text-service.js";
import { verifyMedia, verifyProductionMedia } from "./scripts/media-verifier.mjs";

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

function renderedBandRms(filePath, frequency) {
  const filter = `atrim=start=0.3:duration=0.4,asetpts=N/SR/TB,bandpass=f=${frequency}:width_type=h:w=10,astats=metadata=1:reset=0`;
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-i", filePath, "-af", filter, "-f", "null", "-"], { encoding: "utf8" });
  assert.equal(result.status, 0, `Unable to inspect ${frequency}Hz band: ${result.stderr || result.stdout}`);
  const matches = `${result.stdout}\n${result.stderr}`.match(/RMS level dB:\s*(-?(?:\d+(?:\.\d+)?)|-inf)/gi) || [];
  assert.ok(matches.length, `Expected ${frequency}Hz RMS output`);
  return Number(matches.at(-1).match(/-?(?:\d+(?:\.\d+)?)|-inf/i)?.[0]);
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

  // Distinct 440Hz narration and 110Hz BGM make all three branches measurable.
  const narrationTonePath = path.join(root, "narration-tone.wav");
  const bgmTonePath = path.join(root, "bgm-tone.wav");
  runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "1.2", narrationTonePath], "Creating narration tone fixture");
  runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=110:sample_rate=44100", "-t", "4.7", bgmTonePath], "Creating BGM tone fixture");

  const threePieceProject = await service.create({
    title: "kinetic-three-piece",
    text: "三件套旁白验证。",
    tts: { audio_path: narrationTonePath, final_text: "三件套旁白验证。", duration: 1.2, handoff_revision: "kinetic-three-v1" },
    aspectRatio: "9:16",
    effectId: "rolling-focus-subtitle",
    frameRate: 30,
  });
  assert.equal(threePieceProject.audioMix.source, "none");
  const threePieceJob = await waitForJob(service, service.startRender(threePieceProject.id).id);
  const threePieceVideoPath = threePieceJob.result?.videoPath || service.get(threePieceProject.id)?.outputs?.finalVideo;
  assert.equal(verifyMedia(threePieceVideoPath, { expectAudio: true, expectVideo: true, minDuration: 1 }).ok, true);

  const bgmProject = await service.create({
    title: "kinetic-bgm-mix-smoke",
    text: "背景音乐混音验证。",
    tts: {
      audio_path: narrationTonePath,
      final_text: "背景音乐混音验证。",
      duration: 1.2,
      handoff_revision: "kinetic-atomic-bgm-v1",
      include_bgm: true,
      bgm_path: bgmTonePath,
      bgm_name: "BGM 混音回归音调",
      bgm_volume: 0.18,
    },
    aspectRatio: "9:16",
    effectId: "rolling-focus-subtitle",
    frameRate: 30,
  });
  const firstVisibleManifest = JSON.parse(fs.readFileSync(path.join(root, ".data", "kinetic-text", "projects", bgmProject.id, "project.json"), "utf8"));
  assert.equal(bgmProject.audioMix.source, "local", "四件套项目第一次返回时就必须含 BGM");
  assert.equal(bgmProject.audioMix.localPath, bgmTonePath);
  assert.equal(bgmProject.audioMix.backgroundVolume, 18);
  assert.equal(bgmProject.ttsHandoffRevision, "kinetic-atomic-bgm-v1");
  assert.equal(firstVisibleManifest.audioMix.source, "local", "第一次可见 project.json 不能先写 audioMix:none");
  assert.equal(firstVisibleManifest.audioMix.localPath, bgmTonePath);
  assert.equal(firstVisibleManifest.ttsHandoffRevision, "kinetic-atomic-bgm-v1");

  const bgmJob = service.startRender(bgmProject.id);
  const completedBgmJob = await waitForJob(service, bgmJob.id);
  const renderedBgmProject = completedBgmJob.result?.project || service.get(bgmProject.id);
  const bgmVideoPath = completedBgmJob.result?.videoPath || renderedBgmProject?.outputs?.finalVideo;

  assert.equal(completedBgmJob.status, "completed");
  assertMp4(bgmVideoPath);
  assert.ok(renderedMaxVolume(bgmVideoPath) > -70, "Expected the rendered BGM mix to contain audible audio");
  const productionReport = verifyProductionMedia({
    line: "kinetic-text",
    artifactPath: bgmVideoPath,
    narrationPath: narrationTonePath,
    bgmPath: bgmTonePath,
  });
  assert.equal(productionReport.ok, true, JSON.stringify(productionReport.errors));
  assert.ok(productionReport.bgm.tailSeconds >= 3 && productionReport.bgm.tailSeconds <= 4, `Expected BGM tail in 3-4s range, got ${productionReport.bgm.tailSeconds}s`);

  const manualOffProject = await service.create({
    title: "kinetic-four-piece-manual-off",
    text: "四件套关闭背景音乐验证。",
    tts: {
      audio_path: narrationTonePath,
      final_text: "四件套关闭背景音乐验证。",
      duration: 1.2,
      handoff_revision: "kinetic-manual-off-v1",
      include_bgm: true,
      bgm_path: bgmTonePath,
      bgm_name: "BGM 混音回归音调",
      bgm_volume: 0.18,
    },
    aspectRatio: "9:16",
    effectId: "rolling-focus-subtitle",
    frameRate: 30,
  });
  assert.equal(manualOffProject.audioMix.source, "local");
  const manualOffSaved = service.update(manualOffProject.id, { audioMix: { source: "none" } });
  assert.equal(manualOffSaved.audioMix.source, "none");
  assert.equal(manualOffSaved.audioMix.localPath, bgmTonePath, "手动关闭只关开关，保留 BGM 原件供重新启用");
  const manualOffJob = await waitForJob(service, service.startRender(manualOffProject.id).id);
  const manualOffVideoPath = manualOffJob.result?.videoPath || service.get(manualOffProject.id)?.outputs?.finalVideo;
  assert.equal(verifyMedia(manualOffVideoPath, { expectAudio: true, expectVideo: true, minDuration: 1 }).ok, true);

  const threePiece110 = renderedBandRms(threePieceVideoPath, 110);
  const fourPiece110 = renderedBandRms(bgmVideoPath, 110);
  const manualOff110 = renderedBandRms(manualOffVideoPath, 110);
  assert.ok(fourPiece110 - threePiece110 >= 6, `四件套应检测到额外 110Hz BGM: three=${threePiece110}, four=${fourPiece110}`);
  assert.ok(Math.abs(manualOff110 - threePiece110) <= 3, `手动关闭 BGM 后应回到旁白基线: three=${threePiece110}, off=${manualOff110}`);
  if (process.env.PRODUCTION_MEDIA_EVIDENCE_DIR) {
    const evidenceDir = path.resolve(process.env.PRODUCTION_MEDIA_EVIDENCE_DIR);
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.copyFileSync(threePieceVideoPath, path.join(evidenceDir, "kinetic-three-piece.mp4"));
    fs.copyFileSync(bgmVideoPath, path.join(evidenceDir, "kinetic-four-piece.mp4"));
    fs.copyFileSync(manualOffVideoPath, path.join(evidenceDir, "kinetic-four-piece-manual-off.mp4"));
    fs.writeFileSync(path.join(evidenceDir, "kinetic-four-piece-first-manifest.json"), `${JSON.stringify(firstVisibleManifest, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(evidenceDir, "kinetic-three-branch-report.json"), `${JSON.stringify({
      threePiece: { projectId: threePieceProject.id, videoPath: threePieceVideoPath, rms110: threePiece110 },
      fourPiece: { projectId: bgmProject.id, videoPath: bgmVideoPath, rms110: fourPiece110, productionReport },
      manualOff: { projectId: manualOffProject.id, videoPath: manualOffVideoPath, rms110: manualOff110 },
    }, null, 2)}\n`, "utf8");
  }
} finally {
  if (process.env.KEEP_KINETIC_SMOKE_OUTPUT !== "1") {
    fs.rmSync(root, { recursive: true, force: true });
  } else {
    console.log(`Kinetic smoke output kept at ${root}`);
  }
}

console.log("Kinetic text render smoke test passed");
