import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { renderFinalVideo } from "./server/routes/money-printer-routes.js";
import { verifyDuration, verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(ROOT, "fixtures", "money-printer");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
const evidenceDir = path.resolve(process.env.MPT_FINAL_MIX_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "05.03", "manual"));
const source = fs.readFileSync(path.join(ROOT, "server", "routes", "money-printer-routes.js"), "utf8");
for (const token of ["aloop=loop=-1", "atrim=duration=", "asetpts=N/SR/TB", "afade=t=in", "afade=t=out", "normalize=0"]) {
  assert.ok(source.includes(token), `最终 BGM 滤镜缺少 ${token}`);
}

fs.mkdirSync(path.join(evidenceDir, "media"), { recursive: true });
const result = await renderFinalVideo({
  title: "money-printer-final-bgm-mix-05.03",
  audio_path: path.join(fixtureDir, fixture.narration),
  background_video: path.join(fixtureDir, fixture.background),
  bgm_file: path.join(fixtureDir, fixture.bgm),
  bgm_volume: fixture.feature.bgmVolume,
  segments: fixture.segments,
  settings: fixture.settings,
}, {
  rootDir: ROOT,
  workflowDir: path.join(evidenceDir, "workflow"),
  downloadsDir: path.join(evidenceDir, "media"),
  ffmpegPath,
  ffprobePath: ffprobeStatic.path,
});

function windowRms(filePath, start, duration, frequency = 110) {
  const filter = `atrim=start=${start}:duration=${duration},asetpts=N/SR/TB,bandpass=f=${frequency}:width_type=h:w=10,astats=metadata=1:reset=0`;
  const run = spawnSync(ffmpegPath, ["-hide_banner", "-i", filePath, "-af", filter, "-f", "null", "-"], { encoding: "utf8", windowsHide: true, timeout: 120000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const matches = `${run.stdout}\n${run.stderr}`.match(/RMS level dB:\s*(-?(?:\d+(?:\.\d+)?)|-inf)/gi) || [];
  assert.ok(matches.length, `无法测量 ${start}s 窗口`);
  return Number(matches.at(-1).match(/-?(?:\d+(?:\.\d+)?)|-inf/i)?.[0]);
}

const duration = verifyDuration(result.outputPath).duration;
const startRms = windowRms(result.outputPath, 0, 0.08);
const middleRms = windowRms(result.outputPath, 0.8, 0.2);
const endRms = windowRms(result.outputPath, 1.92, 0.08);
const narrationMiddleRms = windowRms(result.outputPath, 0.8, 0.2, 440);
const media = verifyMedia(result.outputPath, { expectAudio: true, expectVideo: true, minDuration: 1 });
const report = {
  result,
  duration,
  featureDetection: {
    bgmFrequencyHz: 110,
    bgmMiddleRmsDb: middleRms,
    narrationFrequencyHz: 440,
    narrationMiddleRmsDb: narrationMiddleRms,
    bothDetected: Number.isFinite(middleRms) && middleRms > -55 && Number.isFinite(narrationMiddleRms) && narrationMiddleRms > -55,
  },
  startRms,
  middleRms,
  endRms,
  media,
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "tests", "money-printer-final-bgm-mix.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

assert.equal(result.bgmMixed, true);
assert.equal(media.ok, true, JSON.stringify(media.errors));
assert.ok(duration >= 1.95 && duration <= 2.05, `最终时长应以 2 秒旁白为主，实际 ${duration}s`);
assert.ok(middleRms - startRms >= 3, `BGM 淡入不足: start=${startRms}, middle=${middleRms}`);
assert.ok(middleRms - endRms >= 6, `BGM 淡出不足: middle=${middleRms}, end=${endRms}`);
assert.equal(report.featureDetection.bothDetected, true, `最终 MP4 未同时检测到旁白/BGM: narration=${narrationMiddleRms}, bgm=${middleRms}`);
console.log(`MoneyPrinter final BGM mix: OK (${duration}s, narration440 ${narrationMiddleRms}dB, bgm110 ${middleRms}dB, fade-in ${Number((middleRms - startRms).toFixed(3))}dB, fade-out ${Number((middleRms - endRms).toFixed(3))}dB)`);
