import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:8787";
const sourceJobId = String(process.env.BGM_SOURCE_JOB_ID || "94").trim();
const evidenceDir = String(process.env.BGM_LOUDNESS_EVIDENCE_DIR || "").trim();

const session = await fetch(`${BASE}/`);
const cookie = String(session.headers.get("set-cookie") || "").split(";")[0];
const headers = { cookie, origin: BASE };
async function getJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || `${response.status}`);
  return data;
}

const source = (await getJson(`${BASE}/api/tts/job?id=${encodeURIComponent(sourceJobId)}`)).job;
const parentId = String(source.parent_tts_job_id || source.metadata?.parent_tts_job_id || "");
if (!parentId || !source.audio_path || !fs.existsSync(source.audio_path)) throw new Error("源 BGM 缺少父旁白或真实文件");
const jobs = (await getJson(`${BASE}/api/tts/jobs?limit=200`)).jobs || [];
let normalized = jobs.find((job) => String(job.parent_tts_job_id || job.metadata?.parent_tts_job_id || "") === parentId
  && job.metadata?.background_volume_is_mix_gain === true
  && Number(job.metadata?.normalized_from_bgm_job_id || 0) === Number(source.id));
let created = false;
if (!normalized) {
  const metadata = {
    ...(source.metadata || {}),
    parent_tts_job_id: Number(parentId),
    source_tts_job_id: Number(parentId),
    background_volume: 0.18,
    source_normalized_lufs: -20,
    source_peak_limit_dbfs: -1.5,
    background_volume_is_mix_gain: true,
    normalized_from_bgm_job_id: Number(source.id),
  };
  const data = await getJson(`${BASE}/api/tts/import-generated`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: source.provider || "minimax",
      project_id: source.project_id || "",
      text: source.text || source.final_text || "",
      voice_id: source.voice_id || "music:clean_education_bgm",
      voice_name: source.voice_name || "清爽教育 BGM",
      voice_asset_id: source.voice_asset_id || 0,
      model: source.model || "music-2.6-free",
      source: "minimax_music_bgm",
      asset_kind: source.asset_kind || "minimax_music_preset",
      format: source.format || "mp3",
      audio_path: source.audio_path,
      duration: source.duration || source.audio_duration || 0,
      metadata,
    }),
  });
  normalized = data.job;
  created = true;
}
const result = { checkedAt: new Date().toISOString(), sourceJobId: source.id, parentJobId: Number(parentId), normalizedJobId: normalized.id, audioPath: path.resolve(normalized.audio_path), created };
if (evidenceDir) {
  const report = path.resolve(evidenceDir, "tests", "bgm-loudness-backfill.json");
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(result));
