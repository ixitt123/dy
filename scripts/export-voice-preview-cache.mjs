import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { openTaskStore } from "../task-store.mjs";

const baseDir = process.cwd();
const staticRoot = path.join(baseDir, "ui", "assets", "voice-previews");
const dryRun = process.argv.includes("--dry-run");

function safeProviderName(provider) {
  return String(provider || "unknown").replace(/[^a-z0-9_-]+/gi, "_") || "unknown";
}

function staticPreviewPath(provider, voiceId) {
  const safeProvider = safeProviderName(provider);
  const key = createHash("sha1").update(`${safeProvider}:${voiceId}`).digest("hex").slice(0, 20);
  return path.join(staticRoot, safeProvider, `${key}.mp3`);
}

function isExportableVoice(asset) {
  if (!asset) return false;
  if (asset.archived || asset.status !== "active") return false;
  return asset.voice_type !== "clone";
}

const store = openTaskStore(baseDir);
const copied = [];
const skipped = [];

try {
  for (const asset of store.listVoices({})) {
    if (!isExportableVoice(asset)) {
      skipped.push({
        provider: asset?.provider || "",
        voice_id: asset?.voice_id || "",
        voice_name: asset?.voice_name || "",
        reason: "not_exportable",
      });
      continue;
    }

    if (!asset.preview_path || !fs.existsSync(asset.preview_path)) {
      skipped.push({
        provider: asset.provider,
        voice_id: asset.voice_id,
        voice_name: asset.voice_name,
        reason: "missing_preview",
      });
      continue;
    }

    const targetPath = staticPreviewPath(asset.provider, asset.voice_id);
    const targetRelative = path.relative(baseDir, targetPath);
    const sourceSize = fs.statSync(asset.preview_path).size;

    if (!dryRun) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(asset.preview_path, targetPath);
    }

    copied.push({
      provider: asset.provider,
      voice_id: asset.voice_id,
      voice_name: asset.voice_name,
      voice_type: asset.voice_type,
      source: path.relative(baseDir, asset.preview_path),
      target: targetRelative,
      bytes: sourceSize,
    });
  }
} finally {
  store.close();
}

const summary = {
  dryRun,
  copied: copied.length,
  skipped: skipped.length,
  totalBytes: copied.reduce((sum, item) => sum + item.bytes, 0),
  targets: copied.map((item) => item.target),
  skippedReasons: skipped.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {}),
};

console.log(JSON.stringify(summary, null, 2));
