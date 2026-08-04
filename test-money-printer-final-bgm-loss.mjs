import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { renderFinalVideo } from "./server/routes/money-printer-routes.js";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(ROOT, "fixtures", "money-printer");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
const narrationPath = path.join(fixtureDir, fixture.narration);
const bgmPath = path.join(fixtureDir, fixture.bgm);
const backgroundPath = path.join(fixtureDir, fixture.background);
const evidenceDir = path.resolve(process.env.MPT_BGM_LOSS_EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "mpt-bgm-loss-evidence-")));
const workflowDir = path.join(evidenceDir, "workflow");
const mediaDir = path.join(evidenceDir, "media");
fs.mkdirSync(mediaDir, { recursive: true });

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rms(filePath, filter) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-i", filePath, "-af", `${filter},astats=metadata=1:reset=0`, "-f", "null", "-"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const matches = `${result.stdout}\n${result.stderr}`.match(/RMS level dB:\s*(-?(?:\d+(?:\.\d+)?)|-inf)/gi) || [];
  assert.ok(matches.length, `无法测量频段 RMS: ${filter}`);
  const value = matches.at(-1).match(/(-?(?:\d+(?:\.\d+)?)|-inf)$/i)?.[1];
  return value === "-inf" ? Number.NEGATIVE_INFINITY : Number(value);
}

function currentFinalRequestSource() {
  const source = fs.readFileSync(path.join(ROOT, "ui", "modules", "money-printer.js"), "utf8");
  const start = source.indexOf('postJson("/api/money-printer/render-final", {');
  assert.ok(start >= 0, "找不到 MoneyPrinter 最终请求真实落点");
  const end = source.indexOf("\n    });", start);
  assert.ok(end > start, "无法截取 MoneyPrinter 最终请求 payload");
  return source.slice(start, end + 8);
}

const requestSource = currentFinalRequestSource();
const finalFieldsPresent = ["includeBgm", "bgm_file", "bgm_volume", "revision", "handoff_id"]
  .every((field) => new RegExp(`\\b${field}\\b`).test(requestSource));

const commonPayload = {
  title: fixture.title,
  tts: { audio_path: narrationPath, final_text: fixture.segments.map((item) => item.text).join(""), revision: "fixture-revision-05.01" },
  text: fixture.segments.map((item) => item.text).join(""),
  background_video: backgroundPath,
  segments: fixture.segments,
  settings: fixture.settings,
};

const currentPayload = finalFieldsPresent
  ? {
      ...commonPayload,
      includeBgm: true,
      handoff_id: "fixture-handoff-05.02",
      revision: "fixture-revision-05.01",
      bgm_file: bgmPath,
      bgm_volume: fixture.feature.bgmVolume,
    }
  : commonPayload;
const currentResult = await renderFinalVideo(currentPayload, {
  rootDir: ROOT,
  workflowDir,
  downloadsDir: mediaDir,
  ffmpegPath,
  ffprobePath: ffprobeStatic.path,
});
const controlResult = await renderFinalVideo({
  ...commonPayload,
  includeBgm: true,
  bgm_file: bgmPath,
  bgm_volume: fixture.feature.bgmVolume,
  revision: "fixture-revision-05.01",
}, {
  rootDir: ROOT,
  workflowDir,
  downloadsDir: mediaDir,
  ffmpegPath,
  ffprobePath: ffprobeStatic.path,
});

const currentLowRms = rms(currentResult.outputPath, "bandpass=f=110:width_type=h:w=10");
const controlLowRms = rms(controlResult.outputPath, "bandpass=f=110:width_type=h:w=10");
const lowBandGain = Number((controlLowRms - currentLowRms).toFixed(3));
const report = {
  item: "05.01",
  checkedAt: new Date().toISOString(),
  fixture: {
    input: path.join(fixtureDir, "input.json"),
    inputSha256: sha256(path.join(fixtureDir, "input.json")),
    narrationSha256: sha256(narrationPath),
    bgmSha256: sha256(bgmPath),
    backgroundSha256: sha256(backgroundPath),
  },
  liveFinalRequestSource: requestSource,
  finalFieldsPresent,
  omittedFields: fixture.feature.expectedCurrentFinalPayloadOmits.filter((field) => !new RegExp(`\\b${field}\\b`).test(requestSource)),
  current: {
    outputPath: currentResult.outputPath,
    outputSha256: sha256(currentResult.outputPath),
    bgmMixed: currentResult.bgmMixed,
    lowBandRmsDb: currentLowRms,
    media: verifyMedia(currentResult.outputPath, { expectAudio: true, expectVideo: true }),
  },
  control: {
    outputPath: controlResult.outputPath,
    outputSha256: sha256(controlResult.outputPath),
    bgmMixed: controlResult.bgmMixed,
    lowBandRmsDb: controlLowRms,
    media: verifyMedia(controlResult.outputPath, { expectAudio: true, expectVideo: true }),
  },
  lowBandGainDbWhenBgmIsPassed: lowBandGain,
  lossProven: currentResult.bgmMixed === false && controlResult.bgmMixed === true && lowBandGain > 5,
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "money-printer-final-bgm-loss.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

assert.equal(report.current.media.ok, true, JSON.stringify(report.current.media.errors));
assert.equal(report.control.media.ok, true, JSON.stringify(report.control.media.errors));
if (process.env.EXPECT_MPT_BGM_LOSS === "1") {
  assert.equal(report.lossProven, true, `固定输入没有稳定复现 BGM 丢失: lowBandGain=${lowBandGain}dB`);
  console.log(`MoneyPrinter final BGM loss reproduced: ${lowBandGain}dB low-band difference`);
  console.log(`Evidence: ${reportPath}`);
} else {
  assert.equal(currentResult.bgmMixed, true, "MoneyPrinter 最终请求未携带 BGM，最终二次合成丢失 BGM");
}
