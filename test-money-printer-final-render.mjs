import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { renderFinalVideo } from "./server/routes/money-printer-routes.js";
import { verifyProductionMedia } from "./scripts/media-verifier.mjs";

function runFfmpeg(args, label) {
  const result = spawnSync(ffmpegPath, ["-y", ...args], { encoding: "utf8", timeout: 120000, windowsHide: true });
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "money-printer-final-render-"));
try {
  const backgroundPath = path.join(root, "background.mp4");
  const narrationPath = path.join(root, "narration.wav");
  const bgmPath = path.join(root, "bgm.wav");
  runFfmpeg(["-f", "lavfi", "-i", "color=c=black:s=320x180:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", backgroundPath], "Creating MoneyPrinter background fixture");
  runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2", narrationPath], "Creating narration fixture");
  runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=110:sample_rate=48000:duration=5.5", bgmPath], "Creating BGM fixture");

  const result = await renderFinalVideo({
    title: "money-printer-bgm-smoke",
    audio_path: narrationPath,
    background_video: backgroundPath,
    bgm_path: bgmPath,
    bgm_volume: 0.18,
    segments: [{ start: 0, end: 2, text: "本地合成验证" }],
    settings: { aspectRatio: "9:16", frameRate: 30, textEffectEnabled: false, showBottomSubtitles: false },
  }, {
    rootDir: root,
    workflowDir: path.join(root, "workflow"),
    downloadsDir: path.join(root, "downloads"),
    ffmpegPath,
    ffprobePath: ffprobeStatic.path,
  });

  assert.equal(result.bgmMixed, true);
  const report = verifyProductionMedia({ line: "money-printer", artifactPath: result.outputPath, narrationPath, bgmPath });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.ok(report.bgm.tailSeconds >= 3 && report.bgm.tailSeconds <= 4, `Expected BGM tail in 3-4s range, got ${report.bgm.tailSeconds}s`);
  if (process.env.PRODUCTION_MEDIA_EVIDENCE_DIR) {
    const evidencePath = path.join(path.resolve(process.env.PRODUCTION_MEDIA_EVIDENCE_DIR), "money-printer.mp4");
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.copyFileSync(result.outputPath, evidencePath);
  }
  console.log("MoneyPrinter final render: actual output verified");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
