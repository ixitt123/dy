// scripts/media-verifier.mjs
//
// 真实媒体验证器（01.03）。
// 基于 ffprobe + ffmpeg，对真实音频/视频文件做六项检查：
//   1. 流（audio/video 流存在）；
//   2. 时长（>0 且有限）；
//   3. 可解码（codec 存在 + ffprobe 无错误）；
//   4. 响度（EBU R128 I，单位 LUFS）；
//   5. 峰值（True Peak，单位 dBFS）；
//   6. BGM 特征频段（低频/中频/高频 RMS 能量分布，用于区分人声与 BGM）。
//
// 用途（04.x–08.x 生产线真实验收）：每条生产线最终 MP4 必须通过本验证器，
// 确认旁白和 BGM 真实存在，而不只是人耳主观判断。
//
// 不依赖 puppeteer/playwright；仅依赖项目已有的 ffmpeg-static / ffprobe-static。

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;

function runFfprobe(file, extraArgs = []) {
  const args = ["-v", "error", "-print_format", "json", ...extraArgs, file];
  const res = spawnSync(ffprobePath, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`ffprobe 失败 (${res.status}): ${res.stderr || res.stdout || "未知错误"}`);
  }
  return JSON.parse(res.stdout);
}

function runFfmpeg(args, timeoutMs = 60000) {
  const res = spawnSync(ffmpegPath, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: timeoutMs });
  return res;
}

// 1. ffprobe 基础探测
export function probe(file) {
  if (!fs.existsSync(file)) throw new Error(`文件不存在: ${file}`);
  return runFfprobe(file, ["-show_format", "-show_streams"]);
}

// 2. 流检查：返回 { audio, video } 各流是否存在及 codec
export function verifyStreams(file) {
  const data = probe(file);
  const audio = (data.streams || []).filter((s) => s.codec_type === "audio");
  const video = (data.streams || []).filter((s) => s.codec_type === "video");
  return {
    hasAudio: audio.length > 0,
    hasVideo: video.length > 0,
    audioCodecs: audio.map((s) => s.codec_name),
    videoCodecs: video.map((s) => s.codec_name),
    audioCount: audio.length,
    videoCount: video.length,
  };
}

// 3. 时长检查（秒）
export function verifyDuration(file) {
  const data = probe(file);
  const dur = Number(data.format?.duration || 0);
  if (!Number.isFinite(dur) || dur <= 0) {
    throw new Error(`时长无效: ${dur}`);
  }
  return { duration: dur, durationMs: Math.round(dur * 1000) };
}

// 4. 可解码检查（codec 存在 + ffprobe 无错误即视为可解码；
//    更严格的解码测试用 ffmpeg -i file -f null - 检测解码错误）
export function verifyDecodable(file) {
  const streams = verifyStreams(file);
  if (!streams.hasAudio && !streams.hasVideo) {
    throw new Error("无音频或视频流，无法解码");
  }
  // 用 ffmpeg 实际解码检测错误
  const res = runFfmpeg(["-v", "error", "-i", file, "-f", "null", "-"], 60000);
  if (res.status !== 0 && /error|invalid|corrupt/i.test(res.stderr || "")) {
    throw new Error(`解码错误: ${(res.stderr || "").split("\n").slice(0, 3).join(" | ")}`);
  }
  return { decodable: true, audioCodecs: streams.audioCodecs, videoCodecs: streams.videoCodecs };
}

// 5. 响度 + 峰值（EBU R128）
//    解析 ffmpeg ebur128 Summary 输出
export function measureLoudness(file) {
  const res = runFfmpeg(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], 120000);
  const out = (res.stderr || "") + (res.stdout || "");
  const summary = out.split("Summary:")[1] || out;
  const i = summary.match(/I:\s*(-?[\d.]+)\s*LUFS/i);
  const lra = summary.match(/LRA:\s*(-?[\d.]+)\s*LU/i);
  const tp = summary.match(/Peak:\s*(-?[\d.]+)\s*dBFS/i);
  const integrated = i ? Number(i[1]) : null;
  const loudnessRange = lra ? Number(lra[1]) : null;
  const truePeak = tp ? Number(tp[1]) : null;
  if (integrated === null) {
    throw new Error(`响度测量失败，无法解析 ebur128 Summary: ${out.slice(-500)}`);
  }
  return { integratedLufs: integrated, loudnessRange: loudnessRange, truePeakDbfs: truePeak };
}

// 6. BGM 特征频段（低频/中频/高频 RMS 能量）
//    用 lowpass/highpass 分频段测 RMS，BGM 通常低频能量占比显著高于人声
export function detectFrequencyBands(file) {
  const bands = [
    { name: "low", filter: "lowpass=f=250", range: "0-250Hz" },
    { name: "mid", filter: "highpass=f=250,lowpass=f=1750", range: "250-1750Hz" },
    { name: "high", filter: "highpass=f=4000", range: "4kHz+" },
  ];
  const result = {};
  for (const band of bands) {
    const res = runFfmpeg(["-i", file, "-af", `${band.filter},astats=metadata=1:reset=0`, "-f", "null", "-"], 120000);
    const out = (res.stderr || "") + (res.stdout || "");
    const rms = out.match(/RMS level dB:\s*(-?[\d.]+)/i);
    result[band.name] = {
      range: band.range,
      rmsDb: rms ? Number(rms[1]) : null,
    };
  }
  const low = result.low.rmsDb;
  const mid = result.mid.rmsDb;
  const high = result.high.rmsDb;
  // BGM 特征：低频能量相对中频/高频更突出（低频 RMS 显著高于中频）
  let bgmLikely = null;
  if (low !== null && mid !== null) {
    bgmLikely = low - mid > 3; // 低频比中频高 3dB 以上倾向于 BGM（粗略阈值）
  }
  return { bands: result, lowMidDiff: low !== null && mid !== null ? low - mid : null, bgmLikely };
}

// 综合验证
export function verifyMedia(file, options = {}) {
  const { expectAudio = true, expectVideo = false, minDuration = 0.1 } = options;
  const report = { file, ok: true, errors: [] };
  try {
    report.streams = verifyStreams(file);
    if (expectAudio && !report.streams.hasAudio) report.errors.push("缺少音频流");
    if (expectVideo && !report.streams.hasVideo) report.errors.push("缺少视频流");
  } catch (e) { report.errors.push(`流检查失败: ${e.message}`); }
  try {
    report.duration = verifyDuration(file);
    if (report.duration.duration < minDuration) report.errors.push(`时长 ${report.duration.duration} < 最小 ${minDuration}`);
  } catch (e) { report.errors.push(`时长检查失败: ${e.message}`); }
  try { report.decodable = verifyDecodable(file); } catch (e) { report.errors.push(`解码检查失败: ${e.message}`); }
  try { report.loudness = measureLoudness(file); } catch (e) { report.errors.push(`响度检查失败: ${e.message}`); }
  try { report.frequencyBands = detectFrequencyBands(file); } catch (e) { report.errors.push(`频段检查失败: ${e.message}`); }
  report.ok = report.errors.length === 0;
  return report;
}

function mediaFingerprint(file) {
  const resolved = path.resolve(file);
  const stat = fs.statSync(resolved);
  return {
    path: resolved,
    bytes: stat.size,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(resolved)).digest("hex"),
  };
}

function verifiedAsset(file, options) {
  const report = verifyMedia(file, options);
  return { ...report, fingerprint: mediaFingerprint(file) };
}

// 生产线最终资产验证。调用方必须显式传入本轮实际产物路径；本函数绝不查找或
// 替换为历史样例。BGM 为独立资产时，会额外核对其时长和频段测量是否真实存在。
export function verifyProductionMedia({
  line,
  artifactPath,
  narrationPath = "",
  bgmPath = "",
  expectVideo = true,
  minDuration = 0.1,
  bgmTailMinSeconds = 3,
  bgmTailMaxSeconds = 4,
} = {}) {
  const report = {
    line: String(line || "").trim(),
    checkedAt: new Date().toISOString(),
    artifact: null,
    narration: null,
    bgm: null,
    errors: [],
    ok: false,
  };
  if (!report.line) report.errors.push("缺少生产线标识 line");
  if (!String(artifactPath || "").trim()) report.errors.push("缺少本轮最终产物路径 artifactPath");
  if (report.errors.length) return report;

  try {
    report.artifact = verifiedAsset(artifactPath, { expectAudio: true, expectVideo, minDuration });
    if (!report.artifact.ok) report.errors.push(...report.artifact.errors.map((error) => `最终产物：${error}`));
  } catch (error) {
    report.errors.push(`最终产物：${error.message}`);
  }

  if (narrationPath) {
    try {
      report.narration = verifiedAsset(narrationPath, { expectAudio: true, expectVideo: false, minDuration });
      if (!report.narration.ok) report.errors.push(...report.narration.errors.map((error) => `旁白：${error}`));
    } catch (error) {
      report.errors.push(`旁白：${error.message}`);
    }
  }

  if (bgmPath) {
    try {
      report.bgm = verifiedAsset(bgmPath, { expectAudio: true, expectVideo: false, minDuration });
      if (!report.bgm.ok) report.errors.push(...report.bgm.errors.map((error) => `BGM：${error}`));
      const bands = report.bgm.frequencyBands;
      if (!bands || bands.lowMidDiff === null || bands.bands?.low?.rmsDb === null || bands.bands?.mid?.rmsDb === null || bands.bands?.high?.rmsDb === null) {
        report.errors.push("BGM：缺少可用的低/中/高频测量");
      }
      if (report.narration?.duration?.duration && report.bgm?.duration?.duration) {
        const tailSeconds = Number((report.bgm.duration.duration - report.narration.duration.duration).toFixed(3));
        report.bgm.tailSeconds = tailSeconds;
        if (tailSeconds < bgmTailMinSeconds || tailSeconds > bgmTailMaxSeconds) {
          report.errors.push(`BGM：收尾时长 ${tailSeconds}s 不在 ${bgmTailMinSeconds}-${bgmTailMaxSeconds}s 范围内`);
        }
      }
    } catch (error) {
      report.errors.push(`BGM：${error.message}`);
    }
  }

  report.ok = report.errors.length === 0;
  return report;
}
