import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyProductionMedia } from "./scripts/media-verifier.mjs";

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-production-media-"));
const narrationPath = path.join(tempDir, "narration.wav");
const bgmPath = path.join(tempDir, "bgm.wav");
const artifactPath = path.join(tempDir, "final.mp4");
const evidenceDir = String(process.env.PRODUCTION_MEDIA_EVIDENCE_DIR || "").trim();
const reportPath = evidenceDir ? path.resolve(evidenceDir, "production-media-report.json") : path.join(tempDir, "report.json");

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, ["-y", ...args], { encoding: "utf8", timeout: 120000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || "ffmpeg failed");
}

try {
  if (evidenceDir) fs.mkdirSync(path.resolve(evidenceDir), { recursive: true });
  runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2", narrationPath]);
  runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=110:sample_rate=48000:duration=5.5", bgmPath]);
  runFfmpeg([
    "-f", "lavfi", "-i", "color=c=black:s=320x180:r=24:d=2",
    "-i", narrationPath,
    "-i", bgmPath,
    "-filter_complex", "[2:a]atrim=duration=2,volume=0.18[bgm];[1:a][bgm]amix=inputs=2:normalize=0[a]",
    "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", artifactPath,
  ]);

  const report = verifyProductionMedia({
    line: "xiaohei",
    artifactPath,
    narrationPath,
    bgmPath,
    expectVideo: true,
  });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.artifact.streams.hasVideo, true);
  assert.equal(report.artifact.streams.hasAudio, true);
  assert.ok(report.artifact.fingerprint.sha256.length === 64);
  assert.ok(report.bgm.tailSeconds >= 3 && report.bgm.tailSeconds <= 4, `tail=${report.bgm.tailSeconds}`);

  const cli = spawnSync(process.execPath, [
    "scripts/verify-production-media.mjs",
    "--line", "xiaohei",
    "--artifact", artifactPath,
    "--narration", narrationPath,
    "--bgm", bgmPath,
    "--report", reportPath,
  ], { encoding: "utf8", timeout: 180000 });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const cliReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(cliReport.ok, true, JSON.stringify(cliReport.errors));
  assert.equal(cliReport.line, "xiaohei");

  const missing = verifyProductionMedia({ line: "kinetic-text", artifactPath: path.join(tempDir, "missing.mp4") });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join("\n"), /最终产物/u);

  if (evidenceDir) {
    for (const [sourcePath, fileName] of [[artifactPath, "final.mp4"], [narrationPath, "narration.wav"], [bgmPath, "bgm.wav"]]) {
      fs.copyFileSync(sourcePath, path.join(path.resolve(evidenceDir), fileName));
    }
    console.log(`Production media evidence retained: ${path.resolve(evidenceDir)}`);
  }

  console.log("Production media verification: OK");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
