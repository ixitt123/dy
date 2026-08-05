import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const BASE = process.env.CS1_ACCEPTANCE_BASE_URL || "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.PRODUCTION_MEDIA_EVIDENCE_DIR || ".data/repair-evidence/08.04/manual");
fs.mkdirSync(evidenceDir, { recursive: true });

const rootResponse = await fetch(`${BASE}/`);
const cookie = String(rootResponse.headers.get("set-cookie") || "").split(";")[0];
assert.ok(rootResponse.ok && cookie, "Unable to establish local UI session");

async function localFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", cookie);
  headers.set("origin", BASE);
  return fetch(`${BASE}${url}`, { ...options, headers });
}

async function postJson(url, body) {
  const response = await localFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function makeAudio(outputPath, frequency, duration) {
  const result = spawnSync(ffmpegPath, ["-y", "-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`, outputPath], {
    encoding: "utf8",
    timeout: 120000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function probe(filePath) {
  const result = spawnSync(ffprobeStatic.path, ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", filePath], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const narrationPath = path.join(evidenceDir, "fixture-narration.wav");
const bgmPath = path.join(evidenceDir, "fixture-bgm.wav");
makeAudio(narrationPath, 440, 10);
makeAudio(bgmPath, 110, 13.5);

const failed = await postJson("/api/cs1-video/generate", { text: "", style: "cs1" });
assert.equal(failed.response.status, 400, "Invalid request must fail before retry");
assert.equal(failed.payload.ok, false, "Invalid request returned a false success");

const common = {
  title: "CS1 08.04 真实验收",
  text: "先看清问题，再拆解原因，最后给出今天就能执行的行动。",
  style: "cs1",
  aspectRatio: "9:16",
  beatCount: 3,
  cardHoldPreset: "short",
  aiRefine: false,
};

const three = await postJson("/api/cs1-video/generate", { ...common, includeBgm: false, bgmMode: "none", ttsAudioPath: narrationPath });
assert.equal(three.response.status, 200, JSON.stringify(three.payload));
assert.equal(three.payload.ok, true);
assert.ok(fs.existsSync(three.payload.outputPath));
assert.equal(three.payload.bgm, null, "Three-piece render must not mix BGM");
assert.equal(three.payload.narration?.mixedIntoVideo, true, "Three-piece narration was not mixed into final MP4");
const threeEvidence = path.join(evidenceDir, "cs1-three-piece.mp4");
fs.copyFileSync(three.payload.outputPath, threeEvidence);

const four = await postJson("/api/cs1-video/generate", {
  ...common,
  title: "CS1 08.04 四件套验收",
  includeBgm: true,
  bgmMode: "local",
  bgmPath,
  bgmVolume: 0.18,
  ttsAudioPath: narrationPath,
});
assert.equal(four.response.status, 200, JSON.stringify(four.payload));
assert.equal(four.payload.ok, true);
assert.ok(fs.existsSync(four.payload.outputPath));
assert.ok(fs.existsSync(four.payload.bgm?.manifestPath || ""), "Four-piece manifest missing");
const fourEvidence = path.join(evidenceDir, "cs1-four-piece.mp4");
const manifestEvidence = path.join(evidenceDir, "cs1-four-piece.bgm-manifest.json");
fs.copyFileSync(four.payload.outputPath, fourEvidence);
fs.copyFileSync(four.payload.bgm.manifestPath, manifestEvidence);

const inlineResponse = await localFetch(four.payload.videoUrl);
const inlineBytes = Buffer.from(await inlineResponse.arrayBuffer());
assert.equal(inlineResponse.status, 200);
assert.equal(createHash("sha256").update(inlineBytes).digest("hex"), sha256(four.payload.outputPath), "Preview bytes differ from final MP4");

const downloadResponse = await localFetch(four.payload.downloadUrl);
const downloadBytes = Buffer.from(await downloadResponse.arrayBuffer());
assert.equal(downloadResponse.status, 200);
assert.match(String(downloadResponse.headers.get("content-disposition") || ""), /^attachment;/u);
assert.equal(createHash("sha256").update(downloadBytes).digest("hex"), sha256(four.payload.outputPath), "Download bytes differ from final MP4");
fs.writeFileSync(path.join(evidenceDir, "cs1-four-piece-downloaded.mp4"), downloadBytes);

const rangeResponse = await localFetch(four.payload.videoUrl, { headers: { range: "bytes=0-1023" } });
assert.equal(rangeResponse.status, 206, "Preview endpoint must support byte ranges");
assert.equal((await rangeResponse.arrayBuffer()).byteLength, 1024);

const outputsResponse = await localFetch("/api/cs1-video/outputs");
const outputs = await outputsResponse.json();
assert.equal(outputs.outputs?.[0]?.filePath, four.payload.outputPath, "Refresh list did not restore latest final MP4");
assert.ok(
  (outputs.outputs || []).every((entry) => !/\.pre-bgm-\d+\.mp4$/iu.test(String(entry.name || entry.filePath || ""))),
  "Refresh list must exclude recoverable pre-BGM source backups from formal final videos",
);

const threeProbe = probe(threeEvidence);
const fourProbe = probe(fourEvidence);
assert.ok(threeProbe.streams.some((stream) => stream.codec_type === "video") && threeProbe.streams.some((stream) => stream.codec_type === "audio"), "Three-piece final MP4 must contain video and narration audio");
assert.ok(fourProbe.streams.some((stream) => stream.codec_type === "video") && fourProbe.streams.some((stream) => stream.codec_type === "audio"), "Four-piece final MP4 must contain video and mixed audio");
const manifest = JSON.parse(fs.readFileSync(manifestEvidence, "utf8"));
const report = {
  failedThenRetried: true,
  threePiece: {
    sourcePath: three.payload.outputPath,
    evidencePath: threeEvidence,
    sha256: sha256(threeEvidence),
    probe: threeProbe,
    bgm: false,
  },
  fourPiece: {
    sourcePath: four.payload.outputPath,
    evidencePath: fourEvidence,
    downloadedPath: path.join(evidenceDir, "cs1-four-piece-downloaded.mp4"),
    sha256: sha256(fourEvidence),
    downloadedSha256: sha256(path.join(evidenceDir, "cs1-four-piece-downloaded.mp4")),
    probe: fourProbe,
    bgm: true,
    manifestPath: manifestEvidence,
    manifest,
  },
  previewDownloadSameAsset: true,
  refreshLatestOutputPath: outputs.outputs[0].filePath,
};
fs.writeFileSync(path.join(evidenceDir, "cs1-complete-acceptance-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log("CS1 complete acceptance: real three-piece, four-piece, preview, download, refresh and failure retry verified");
