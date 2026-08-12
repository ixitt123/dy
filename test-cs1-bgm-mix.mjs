import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { mixCs1BgmIntoVideo, replaceVerifiedCs1Video, verifyCs1MixedVideo } from "./server/routes/cs1-video-routes.js";
import { verifyProductionMedia } from "./scripts/media-verifier.mjs";

function runFfmpeg(args, label) {
  const result = spawnSync(ffmpegPath, ["-y", ...args], { encoding: "utf8", timeout: 120000, windowsHide: true });
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs1-bgm-mix-"));
try {
  const videoPath = path.join(root, "rendered-video.mp4");
  const narrationPath = path.join(root, "narration.wav");
  const bgmPath = path.join(root, "bgm.wav");
  runFfmpeg(["-f", "lavfi", "-i", "color=c=black:s=320x180:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", videoPath], "Creating CS1 renderer fixture");
  runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2", narrationPath], "Creating narration fixture");
  runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=110:sample_rate=48000:duration=5.5", bgmPath], "Creating BGM fixture");

  const originalHash = createHash("sha256").update(fs.readFileSync(videoPath)).digest("hex");
  const replacement = await mixCs1BgmIntoVideo({ ffmpegPath, ffprobePath: ffprobeStatic.path, outputPath: videoPath, bgmPath, ttsAudioPath: narrationPath });
  assert.ok(fs.existsSync(replacement.manifestPath), "CS1 mix manifest was not created");
  const manifest = JSON.parse(fs.readFileSync(replacement.manifestPath, "utf8"));
  assert.equal(manifest.inputs.video.sha256, originalHash, "Manifest video input hash mismatch");
  assert.equal(manifest.inputs.narration.sha256, createHash("sha256").update(fs.readFileSync(narrationPath)).digest("hex"), "Manifest narration hash mismatch");
  assert.equal(manifest.inputs.bgm.sha256, createHash("sha256").update(fs.readFileSync(bgmPath)).digest("hex"), "Manifest BGM hash mismatch");
  assert.equal(manifest.mix.bgmVolume, 0.18, "Manifest BGM default volume mismatch");
  assert.equal(manifest.mix.fadeInSeconds, 0.5, "Manifest fade-in duration mismatch");
  assert.equal(manifest.mix.fadeOutSeconds, 2, "Manifest fade-out duration mismatch");
  assert.ok(manifest.mix.bgmTailSeconds >= 3 && manifest.mix.bgmTailSeconds <= 4, "Manifest BGM tail must be 3-4 seconds");
  assert.equal(manifest.output.sha256, createHash("sha256").update(fs.readFileSync(videoPath)).digest("hex"), "Manifest output hash mismatch");
  assert.ok(fs.existsSync(replacement.backupPath), "原成片备份没有保留");
  assert.equal(createHash("sha256").update(fs.readFileSync(replacement.backupPath)).digest("hex"), originalHash, "备份哈希与替换前原成片不一致");

  const report = verifyProductionMedia({ line: "cs1", artifactPath: videoPath, narrationPath, bgmPath });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.ok(report.bgm.tailSeconds >= 3 && report.bgm.tailSeconds <= 4, `Expected BGM tail in 3-4s range, got ${report.bgm.tailSeconds}s`);
  const rollbackOutput = path.join(root, "rollback-output.mp4");
  const rollbackTemp = path.join(root, "rollback-temp.mp4");
  fs.copyFileSync(replacement.backupPath, rollbackOutput);
  fs.copyFileSync(videoPath, rollbackTemp);
  const rollbackOriginalHash = createHash("sha256").update(fs.readFileSync(rollbackOutput)).digest("hex");
  let renameCount = 0;
  assert.throws(() => replaceVerifiedCs1Video({
    outputPath: rollbackOutput,
    temporaryPath: rollbackTemp,
    renameFile(from, to) {
      renameCount += 1;
      if (renameCount === 2) throw new Error("fixture commit failure");
      fs.renameSync(from, to);
    },
  }), /原成片已恢复/u);
  assert.equal(createHash("sha256").update(fs.readFileSync(rollbackOutput)).digest("hex"), rollbackOriginalHash, "失败回滚后原成片哈希发生变化");
  const corruptTemp = path.join(root, "corrupt.mp4");
  fs.writeFileSync(corruptTemp, "not a video", "utf8");
  await assert.rejects(() => verifyCs1MixedVideo(ffprobeStatic.path, corruptTemp), /验证失败/u);
  assert.equal(createHash("sha256").update(fs.readFileSync(videoPath)).digest("hex"), report.artifact.fingerprint.sha256, "无效临时文件验证不应改变当前成片");
  if (process.env.PRODUCTION_MEDIA_EVIDENCE_DIR) {
    const evidenceDir = path.resolve(process.env.PRODUCTION_MEDIA_EVIDENCE_DIR);
    const evidencePath = path.join(evidenceDir, "cs1-video.mp4");
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.copyFileSync(videoPath, evidencePath);
    fs.copyFileSync(replacement.backupPath, path.join(evidenceDir, "cs1-video-before-bgm.mp4"));
    fs.copyFileSync(replacement.manifestPath, path.join(evidenceDir, "cs1-bgm-manifest.json"));
    fs.writeFileSync(path.join(evidenceDir, "cs1-safe-replace-report.json"), `${JSON.stringify({
      originalHash,
      backupHash: createHash("sha256").update(fs.readFileSync(replacement.backupPath)).digest("hex"),
      finalHash: report.artifact.fingerprint.sha256,
      rollbackOriginalHash,
      rollbackRestoredHash: createHash("sha256").update(fs.readFileSync(rollbackOutput)).digest("hex"),
      corruptTemporaryRejected: true,
      backupPath: replacement.backupPath,
      productionReport: report,
    }, null, 2)}\n`, "utf8");
  }
  console.log("CS1 BGM final mix: actual output verified");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
