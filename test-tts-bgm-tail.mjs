import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BGM_TAIL_DIR || path.join(ROOT, ".data", "repair-evidence", "04.07", "manual"));
const parentJobId = String(process.env.TTS_BGM_PARENT_JOB_ID || "93").trim();
const bgmJobId = String(process.env.TTS_BGM_JOB_ID || "94").trim();
const sampleRate = 16000;

async function apiJob(id) {
  const session = await fetch(`${BASE}/`);
  const cookie = String(session.headers.get("set-cookie") || "").split(";")[0];
  const response = await fetch(`${BASE}/api/tts/job?id=${encodeURIComponent(id)}`, { headers: { cookie, origin: BASE } });
  const data = await response.json();
  if (!response.ok || !data.job) throw new Error(`无法读取 TTS 任务 #${id}`);
  return data.job;
}

function pcmStats(samples, startSeconds, endSeconds) {
  const start = Math.max(0, Math.min(samples.length, Math.floor(startSeconds * sampleRate)));
  const end = Math.max(start + 1, Math.min(samples.length, Math.floor(endSeconds * sampleRate)));
  let sumSquares = 0;
  let peak = 0;
  for (let index = start; index < end; index += 1) {
    const value = Number(samples[index] || 0);
    sumSquares += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, end - start));
  return {
    startSeconds: Number((start / sampleRate).toFixed(4)),
    endSeconds: Number((end / sampleRate).toFixed(4)),
    rms: Number(rms.toFixed(8)),
    rmsDbfs: Number((20 * Math.log10(Math.max(rms, 1e-12))).toFixed(3)),
    peak: Number(peak.toFixed(8)),
    peakDbfs: Number((20 * Math.log10(Math.max(peak, 1e-12))).toFixed(3)),
  };
}

const [parent, bgm] = await Promise.all([apiJob(parentJobId), apiJob(bgmJobId)]);
const parentPath = path.resolve(String(parent.audio_path || ""));
const bgmPath = path.resolve(String(bgm.audio_path || ""));
if (!fs.existsSync(parentPath) || !fs.existsSync(bgmPath)) throw new Error("旁白或 BGM 实物不存在");
const parentMedia = verifyMedia(parentPath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
const bgmMedia = verifyMedia(bgmPath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
assert.equal(parentMedia.ok, true, parentMedia.errors?.join("；"));
assert.equal(bgmMedia.ok, true, bgmMedia.errors?.join("；"));

const decoded = spawnSync(ffmpegPath, ["-v", "error", "-i", bgmPath, "-map", "0:a:0", "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "pipe:1"], {
  encoding: null,
  maxBuffer: 128 * 1024 * 1024,
  timeout: 120000,
  windowsHide: true,
});
if (decoded.status !== 0 || !decoded.stdout?.length) throw new Error(`BGM PCM 解码失败：${decoded.stderr?.toString("utf8") || decoded.status}`);
const usableBytes = decoded.stdout.length - (decoded.stdout.length % 4);
const samples = new Float32Array(decoded.stdout.buffer, decoded.stdout.byteOffset, usableBytes / 4);
const decodedDuration = samples.length / sampleRate;
const parentDuration = Number(parentMedia.duration?.duration || 0);
const bgmDuration = Number(bgmMedia.duration?.duration || 0);
const tailSeconds = bgmDuration - parentDuration;
const fadeOutSeconds = Number(bgm.metadata?.fade_out_seconds || 0);
const fadeStart = Math.max(0, decodedDuration - fadeOutSeconds);
const preFade = pcmStats(samples, Math.max(0, fadeStart - 0.75), fadeStart - 0.05);
const fadeFirstHalf = pcmStats(samples, fadeStart, Math.min(decodedDuration, fadeStart + 0.5));
const fadeLastHalf = pcmStats(samples, Math.max(fadeStart, decodedDuration - 0.5), decodedDuration);
const endpoint = pcmStats(samples, Math.max(0, decodedDuration - 0.1), decodedDuration);
const fadeBins = [];
const binSeconds = 0.25;
for (let start = fadeStart; start < decodedDuration - 0.01; start += binSeconds) {
  fadeBins.push(pcmStats(samples, start, Math.min(decodedDuration, start + binSeconds)));
}
const rmsDropDb = Number((preFade.rmsDbfs - endpoint.rmsDbfs).toFixed(3));
const fadeHalfDropDb = Number((fadeFirstHalf.rmsDbfs - fadeLastHalf.rmsDbfs).toFixed(3));

const result = {
  checkedAt: new Date().toISOString(),
  parent: { id: parent.id, path: parentPath, duration: parentDuration, sha256: crypto.createHash("sha256").update(fs.readFileSync(parentPath)).digest("hex").toUpperCase() },
  bgm: { id: bgm.id, path: bgmPath, duration: bgmDuration, decodedDuration, sha256: crypto.createHash("sha256").update(fs.readFileSync(bgmPath)).digest("hex").toUpperCase() },
  policy: { requestedTailSeconds: 3.5, actualTailSeconds: Number(tailSeconds.toFixed(3)), fadeOutSeconds },
  waveform: { preFade, fadeFirstHalf, fadeLastHalf, endpoint, fadeBins, rmsDropDb, fadeHalfDropDb },
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "tts-bgm-tail.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

assert.ok(tailSeconds >= 3 && tailSeconds <= 4, `BGM 尾长应为 3–4 秒，实际 ${tailSeconds.toFixed(3)} 秒`);
assert.ok(fadeOutSeconds >= 2 && fadeOutSeconds <= 3, `BGM 淡出策略应为 2–3 秒，实际 ${fadeOutSeconds} 秒`);
assert.ok(rmsDropDb >= 15, `末尾 100ms 相比淡出前只降低 ${rmsDropDb}dB，可能突停`);
assert.ok(fadeHalfDropDb >= 8, `淡出后半段相比前半段只降低 ${fadeHalfDropDb}dB，实际衰减不足`);
assert.ok(endpoint.peak <= Math.max(0.01, preFade.peak * 0.25), `末尾峰值 ${endpoint.peak} 过高，可能突停`);
assert.ok(fadeBins.length >= 8, `淡出采样窗口不足：${fadeBins.length}`);
console.log(`TTS BGM tail: OK (tail=${tailSeconds.toFixed(3)}s, fade=${fadeOutSeconds}s, endpoint drop=${rmsDropDb}dB)`);
console.log(`Evidence: ${reportPath}`);
