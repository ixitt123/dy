import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { KINETIC_TEXT_EFFECTS } from "../server/kinetic-text/effects.js";
import { buildAss } from "../server/kinetic-text/kinetic-text-service.js";

const root = path.resolve("subtitle-templates");
const uiRoot = path.resolve("ui", "subtitle-templates");
const duration = 4.8;
const requestedTemplateId = String(process.argv[2] || "").trim();
const templates = requestedTemplateId
  ? KINETIC_TEXT_EFFECTS.filter((template) => template.id === requestedTemplateId)
  : KINETIC_TEXT_EFFECTS;

if (requestedTemplateId && templates.length === 0) throw new Error(`Unknown subtitle template: ${requestedTemplateId}`);

const rawSegments = [
  { id: "preview-1", start: 0, end: 1.45, text: "真正的效率，不是做得更多。", keywords: ["效率", "更多"], speaker: "主讲人" },
  { id: "preview-2", start: 1.45, end: 3.15, text: "而是每一步，都更接近结果。", keywords: ["每一步", "结果"], speaker: "嘉宾" },
  { id: "preview-3", start: 3.15, end: 4.8, text: "把注意力，留给最重要的事。", keywords: ["注意力", "最重要"], speaker: "主讲人" },
];

function wordsFor(segment) {
  const tokens = segment.text.match(/[A-Za-z0-9%]+|[\u4e00-\u9fff]|[^\s]/g) || [];
  const durationMs = (segment.end - segment.start) * 1000;
  return tokens.map((text, index) => ({
    text,
    start: segment.start + (durationMs * index / tokens.length) / 1000,
    end: segment.start + (durationMs * (index + 1) / tokens.length) / 1000,
  }));
}

function escapeFilterPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function run(args) {
  const result = spawnSync(ffmpegPath, args, { stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error(`ffmpeg failed with exit code ${result.status}`);
}

for (const template of templates) {
  const sourceDir = path.join(root, template.id);
  const publicDir = path.join(uiRoot, template.id);
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  for (const aspectRatio of ["9:16", "16:9"]) {
    const suffix = aspectRatio === "9:16" ? "9x16" : "16x9";
    const size = aspectRatio === "9:16" ? "360x640" : "640x360";
    const project = {
      id: `preview-${template.id}-${suffix}`,
      title: template.name,
      effectId: template.id,
      effectParams: { ...template.defaultParams },
      aspectRatio,
      duration,
      text: rawSegments.map((segment) => segment.text).join(""),
      wordTimeline: rawSegments.flatMap(wordsFor),
      segments: rawSegments.map((segment) => ({ ...segment, words: wordsFor(segment), lineBreaks: [], overrides: {} })),
      background: { mode: "black", path: "", name: "" },
      audioMix: { source: "none", ttsVolume: 100, backgroundVolume: 0 },
      showBottomSubtitles: false,
    };
    const assPath = path.join(sourceDir, `preview-${suffix}.ass`);
    const videoPath = path.join(sourceDir, `preview-${suffix}.mp4`);
    fs.writeFileSync(assPath, buildAss(project), "utf8");
    const pureBlack = template.id === "rolling-focus-subtitle";
    run([
      "-y", "-f", "lavfi", "-i", `color=c=${pureBlack ? "0x000000" : "0x0b0f17"}:s=${size}:r=30:d=${duration}`,
      "-vf", pureBlack
        ? `subtitles='${escapeFilterPath(assPath)}'`
        : `drawbox=x=0:y=0:w=iw:h=ih:color=0x17202e@0.30:t=fill,subtitles='${escapeFilterPath(assPath)}'`,
      "-an", "-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", videoPath,
    ]);
  }

  fs.copyFileSync(path.join(sourceDir, "preview-16x9.mp4"), path.join(sourceDir, "preview.mp4"));
  run(["-y", "-ss", "2.15", "-i", path.join(sourceDir, "preview-16x9.mp4"), "-frames:v", "1", path.join(sourceDir, "preview.png")]);
  for (const name of ["preview.mp4", "preview.png", "preview-16x9.mp4", "preview-9x16.mp4"]) {
    fs.copyFileSync(path.join(sourceDir, name), path.join(publicDir, name));
  }
}

console.log(`Generated ${templates.length} template${templates.length === 1 ? "" : "s"} in 16:9 and 9:16.`);
