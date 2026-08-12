import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measureLoudness } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BGM_LOUDNESS_DIR || path.join(ROOT, ".data", "repair-evidence", "04.08", "manual"));
const parentJobId = String(process.env.TTS_BGM_PARENT_JOB_ID || "93").trim();
const defaultMixGain = 0.18;

const session = await fetch(`${BASE}/`);
const cookie = String(session.headers.get("set-cookie") || "").split(";")[0];
const headers = { cookie, origin: BASE };
const [parentResponse, jobsResponse] = await Promise.all([
  fetch(`${BASE}/api/tts/job?id=${encodeURIComponent(parentJobId)}`, { headers }),
  fetch(`${BASE}/api/tts/jobs?limit=100`, { headers }),
]);
const parent = (await parentResponse.json()).job;
const jobs = (await jobsResponse.json()).jobs || [];
const bgm = jobs.find((job) => String(job.parent_tts_job_id || job.metadata?.parent_tts_job_id || "") === parentJobId
  && String(job.source || job.metadata?.source || "") === "minimax_music_bgm");
if (!parent?.audio_path || !bgm?.audio_path) throw new Error("缺少真实旁白或关联 BGM");
const parentPath = path.resolve(parent.audio_path);
const bgmPath = path.resolve(bgm.audio_path);
if (!fs.existsSync(parentPath) || !fs.existsSync(bgmPath)) throw new Error("真实旁白或 BGM 文件不存在");

const narration = measureLoudness(parentPath);
const sourceBgm = measureLoudness(bgmPath);
const mixGainDb = 20 * Math.log10(defaultMixGain);
const effectiveBgmLufs = sourceBgm.integratedLufs + mixGainDb;
const voiceLeadDb = narration.integratedLufs - effectiveBgmLufs;
const effectiveBgmPeakDbfs = Number(sourceBgm.truePeakDbfs) + mixGainDb;
const result = {
  checkedAt: new Date().toISOString(),
  parent: { id: parent.id, path: parentPath, loudness: narration },
  bgm: {
    id: bgm.id,
    path: bgmPath,
    sourceNormalizedLufs: bgm.metadata?.source_normalized_lufs,
    sourcePeakLimitDbfs: bgm.metadata?.source_peak_limit_dbfs,
    backgroundVolume: bgm.metadata?.background_volume,
    backgroundVolumeIsMixGain: bgm.metadata?.background_volume_is_mix_gain,
    loudness: sourceBgm,
  },
  defaultMixGain,
  mixGainDb: Number(mixGainDb.toFixed(3)),
  effectiveBgmLufs: Number(effectiveBgmLufs.toFixed(3)),
  effectiveBgmPeakDbfs: Number(effectiveBgmPeakDbfs.toFixed(3)),
  voiceLeadDb: Number(voiceLeadDb.toFixed(3)),
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "tts-bgm-loudness.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

assert.equal(bgm.metadata?.background_volume_is_mix_gain, true, "BGM 文件仍把滑块增益烘焙进源文件，最终会重复衰减");
assert.ok(sourceBgm.integratedLufs >= -24 && sourceBgm.integratedLufs <= -17, `BGM 源响度未标准化到约 -20 LUFS：${sourceBgm.integratedLufs}`);
assert.ok(voiceLeadDb >= 8 && voiceLeadDb <= 18, `默认 18% 时人声领先应为 8–18dB，实际 ${voiceLeadDb.toFixed(3)}dB`);
assert.ok(effectiveBgmPeakDbfs <= -6, `默认混音 BGM 峰值过高：${effectiveBgmPeakDbfs.toFixed(3)}dBFS`);
console.log(`TTS BGM loudness: OK (source=${sourceBgm.integratedLufs} LUFS, effective=${effectiveBgmLufs.toFixed(3)} LUFS, voice lead=${voiceLeadDb.toFixed(3)}dB)`);
console.log(`Evidence: ${reportPath}`);
