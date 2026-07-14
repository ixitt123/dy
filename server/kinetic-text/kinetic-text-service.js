import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import archiver from "archiver";
import {
  KINETIC_TEXT_EFFECTS,
  defaultEffectParams,
  effectById,
  motionCanvasProjectDescriptor,
  normalizeEffectId,
} from "./effects.js";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DEFAULT_FONT = "Microsoft YaHei";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);

function nowIso() {
  return new Date().toISOString();
}

function safeNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function safeFileName(value, fallback = "file") {
  const clean = String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").trim();
  return clean.slice(0, 120) || fallback;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

function splitLongSentence(value, maxLength = 24) {
  const chars = [...normalizeText(value)];
  if (chars.length <= maxLength) return [chars.join("")].filter(Boolean);
  const rows = [];
  for (let index = 0; index < chars.length; index += maxLength) {
    rows.push(chars.slice(index, index + maxLength).join("").trim());
  }
  return rows.filter(Boolean);
}

function splitScript(text) {
  const source = normalizeText(text);
  if (!source) return [];
  return source
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[。！？!?；;])\s*/u))
    .flatMap((item) => splitLongSentence(item, 24))
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseClockTime(value) {
  const match = String(value || "").trim().match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?/);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const ms = Number(String(match[4] || "0").padEnd(3, "0").slice(0, 3));
  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

function parseSrtTimeline(content) {
  const blocks = String(content || "").replace(/\r/g, "").split(/\n{2,}/);
  return blocks.map((block, index) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex < 0) return null;
    const [startRaw, endRaw] = lines[timeLineIndex].split("-->").map((item) => item.trim());
    const text = lines.slice(timeLineIndex + 1).join("");
    const start = parseClockTime(startRaw);
    const end = parseClockTime(endRaw);
    if (!text || end <= start) return null;
    return { id: `segment-${index + 1}`, index: index + 1, start, end, text };
  }).filter(Boolean);
}

function parseTimestampedTextTimeline(content) {
  const rows = [];
  const pattern = /\[([^\]]+?)\s*-->\s*([^\]]+?)\]\s*([^\n]+)/g;
  let match;
  while ((match = pattern.exec(String(content || "")))) {
    const start = parseClockTime(match[1]);
    const end = parseClockTime(match[2]);
    const text = normalizeText(match[3]);
    if (text && end > start) rows.push({ id: `segment-${rows.length + 1}`, index: rows.length + 1, start, end, text });
  }
  return rows;
}

function timelineFromFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8");
    return /\.srt$/i.test(filePath)
      ? parseSrtTimeline(content)
      : parseTimestampedTextTimeline(content);
  } catch {
    return [];
  }
}

function normalizeSegments(rawSegments, text, duration = 0) {
  const rows = Array.isArray(rawSegments) ? rawSegments : [];
  const parsed = rows.map((item, index) => {
    const start = safeNumber(item.start ?? item.start_time ?? item.begin, 0, 0);
    const end = safeNumber(item.end ?? item.end_time ?? item.finish, start + 0.5, start + 0.1);
    return {
      id: String(item.id || `segment-${index + 1}`),
      index: index + 1,
      start,
      end,
      text: normalizeText(item.text || item.content || item.subtitle),
      keywords: Array.isArray(item.keywords) ? item.keywords.map(normalizeText).filter(Boolean) : [],
      lineBreaks: Array.isArray(item.lineBreaks) ? item.lineBreaks.map(Number).filter(Number.isFinite) : [],
      overrides: item.overrides && typeof item.overrides === "object" ? { ...item.overrides } : {},
    };
  }).filter((item) => item.text);
  if (parsed.length) return parsed.sort((a, b) => a.start - b.start).map((item, index) => ({ ...item, index: index + 1 }));

  const pieces = splitScript(text);
  if (!pieces.length) return [];
  const total = duration > 0 ? duration : Math.max(2, pieces.length * 2.4);
  const weights = pieces.map((item) => Math.max(1, item.replace(/\s/g, "").length));
  const totalWeight = weights.reduce((sum, item) => sum + item, 0);
  let cursor = 0;
  return pieces.map((piece, index) => {
    const end = index === pieces.length - 1 ? total : cursor + (total * weights[index]) / totalWeight;
    const row = {
      id: `segment-${index + 1}`,
      index: index + 1,
      start: cursor,
      end: Math.max(cursor + 0.5, end),
      text: piece,
      keywords: inferKeywords(piece),
      lineBreaks: [],
      overrides: {},
    };
    cursor = row.end;
    return row;
  });
}

function inferKeywords(text) {
  const clean = normalizeText(text).replace(/[，。！？；：、,.!?;:\s]/g, "");
  if (clean.length <= 4) return clean ? [clean] : [];
  const candidates = clean.match(/[A-Za-z0-9%]+|[\u4e00-\u9fff]{2,5}/g) || [];
  return candidates
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
}

function normalizeProject(project) {
  const effectId = normalizeEffectId(project.effectId);
  const duration = safeNumber(project.duration, 0, 0);
  const segments = normalizeSegments(project.segments, project.text, duration);
  const computedDuration = Math.max(duration, ...segments.map((item) => item.end), 0);
  const background = project.background && typeof project.background === "object" ? project.background : {};
  const audioMix = project.audioMix && typeof project.audioMix === "object" ? project.audioMix : {};
  return {
    ...project,
    title: normalizeText(project.title) || "动态大字视频",
    text: normalizeText(project.text) || segments.map((item) => item.text).join(""),
    effectId,
    effectParams: { ...defaultEffectParams(effectId), ...(project.effectParams || {}) },
    duration: computedDuration,
    segments,
    subtitleSource: String(project.subtitleSource || "estimated"),
    showBottomSubtitles: project.showBottomSubtitles === true,
    background: {
      mode: ["black", "image", "video"].includes(background.mode) ? background.mode : "black",
      path: String(background.path || ""),
      name: String(background.name || ""),
    },
    audioMix: {
      source: ["none", "video", "local"].includes(audioMix.source) ? audioMix.source : "none",
      localPath: String(audioMix.localPath || ""),
      localName: String(audioMix.localName || ""),
      ttsVolume: safeNumber(audioMix.ttsVolume, 100, 0, 200),
      backgroundVolume: safeNumber(audioMix.backgroundVolume, 18, 0, 100),
    },
  };
}

function formatAssTime(value) {
  const total = Math.max(0, safeNumber(value, 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  const centiseconds = Math.round((total - Math.floor(total)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function formatSrtTime(value) {
  const totalMs = Math.round(Math.max(0, safeNumber(value, 0)) * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function assColor(value, fallback = "#ffffff") {
  const match = String(value || fallback).match(/^#?([0-9a-f]{6})$/i);
  const hex = match ? match[1] : fallback.replace("#", "");
  return `&H00${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2).toUpperCase()}`;
}

function escapeAss(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "（")
    .replace(/\}/g, "）")
    .replace(/\r?\n/g, "\\N");
}

function effectTags(effectId, introMs, index, highlighted) {
  const delay = Math.round(index * 55);
  const start = Math.min(delay, Math.max(0, introMs - 80));
  const end = Math.max(start + 100, introMs);
  const accent = highlighted ? "\\b1" : "";
  const tags = {
    "center-stair-flip": `\\fry90\\fscx20\\alpha&HFF&\\t(${start},${end},\\fry0\\fscx100\\alpha&H00&)`,
    "diagonal-scatter-flip": `\\frz-28\\fscx35\\fscy35\\alpha&HFF&\\t(${start},${end},\\frz0\\fscx100\\fscy100\\alpha&H00&)`,
    "vertical-3d-flip": `\\frx88\\fscy15\\blur3\\alpha&HCC&\\t(${start},${end},\\frx0\\fscy100\\blur0\\alpha&H00&)`,
    "perspective-focus-flip": `\\fscx220\\fscy220\\blur10\\alpha&HFF&\\t(${start},${end},\\fscx100\\fscy100\\blur0\\alpha&H00&)`,
    "outline-footer-pop": `\\fscx60\\fscy60\\alpha&HFF&\\t(${start},${end},\\fscx100\\fscy100\\alpha&H00&)`,
    "scatter-copy-reveal": `\\blur4\\alpha&HFF&\\t(${start},${end},\\blur0\\alpha&H00&)`,
    "neon-outline-letters": `\\fry75\\blur6\\alpha&HFF&\\t(${start},${end},\\fry0\\blur0.6\\alpha&H00&)`,
    "blue-yellow-stairs": `\\fscx35\\fscy35\\alpha&HFF&\\t(${start},${end},\\fscx100\\fscy100\\alpha&H00&)`,
    "grayscale-depth-focus": `\\fscx175\\fscy175\\blur12\\alpha&HEE&\\t(${start},${end},\\fscx100\\fscy100\\blur0\\alpha&H00&)`,
    "handwritten-callout": `\\frz-12\\fscx65\\fscy65\\alpha&HFF&\\t(${start},${end},\\frz0\\fscx100\\fscy100\\alpha&H00&)`,
    "scatter-keyword-close": `\\fscx55\\fscy55\\blur5\\alpha&HFF&\\t(${start},${end},\\fscx100\\fscy100\\blur0\\alpha&H00&)`,
    "guide-list-focus": `\\fscx82\\fscy82\\alpha&HDD&\\t(${start},${end},\\fscx100\\fscy100\\alpha&H00&)`,
    "green-white-offset": `\\frz90\\fry65\\fscx25\\alpha&HFF&\\t(${start},${end},\\frz0\\fry0\\fscx100\\alpha&H00&)`,
  };
  return `${tags[effectId] || tags["center-stair-flip"]}${accent}`;
}

function splitTextLines(segment) {
  const source = normalizeText(segment.text);
  const breaks = [...new Set((segment.lineBreaks || [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0 && value < source.length))]
    .sort((a, b) => a - b);
  if (!breaks.length) return [source];
  const lines = [];
  let start = 0;
  for (const end of [...breaks, source.length]) {
    const line = source.slice(start, end).trim();
    if (line) lines.push(line);
    start = end;
  }
  return lines.length ? lines : [source];
}

function splitDisplayTokens(segment, effectId) {
  const lines = splitTextLines(segment);
  return lines.flatMap((line, row) => {
    let values;
    if (["guide-list-focus", "scatter-copy-reveal"].includes(effectId)) values = line.match(/.{1,7}/g) || [line];
    else if (["blue-yellow-stairs", "green-white-offset"].includes(effectId)) values = line.match(/.{1,4}/g) || [line];
    else values = [...line].filter((item) => item.trim());
    return values.map((text, indexInRow) => ({
      text,
      row,
      rowCount: lines.length,
      indexInRow,
      countInRow: values.length,
    }));
  });
}

function tokenPosition(effectId, index, count, baseX, baseY, layout = {}) {
  const centered = (index - (count - 1) / 2);
  const rowOffset = (Number(layout.row || 0) - (Number(layout.rowCount || 1) - 1) / 2) * 190;
  const horizontalStep = Math.min(130, 1500 / Math.max(1, count - 1));
  if (effectId === "center-stair-flip") {
    const verticalStep = Math.min(52, 330 / Math.max(1, (count - 1) / 2));
    return [baseX + centered * horizontalStep, baseY + rowOffset + Math.abs(centered) * verticalStep];
  }
  if (effectId === "diagonal-scatter-flip") return [baseX + centered * horizontalStep, baseY + rowOffset + centered * Math.min(58, 500 / Math.max(1, count - 1))];
  if (effectId === "scatter-copy-reveal") {
    const points = [[-420, -250], [-120, -75], [330, -190], [-350, 190], [160, 160], [420, 270]];
    const point = points[index % points.length];
    return [baseX + point[0], baseY + rowOffset + point[1]];
  }
  if (effectId === "blue-yellow-stairs") return [baseX + (index % 2 ? 180 : -180), baseY + rowOffset + centered * Math.min(100, 520 / Math.max(1, count - 1))];
  if (effectId === "grayscale-depth-focus") return [baseX + centered * horizontalStep, baseY + rowOffset + (index % 2 ? 100 : -70)];
  if (effectId === "handwritten-callout") return [baseX + centered * horizontalStep, baseY + rowOffset + (index % 2 ? 90 : -45)];
  if (effectId === "scatter-keyword-close") return [baseX + centered * horizontalStep, baseY + rowOffset + (index % 3 - 1) * 125];
  if (effectId === "guide-list-focus") return [Math.max(260, baseX - 430), baseY + rowOffset - 190 + index * 95];
  if (effectId === "green-white-offset") return [baseX + (index % 2 ? 190 : -170), baseY + rowOffset + centered * Math.min(86, 500 / Math.max(1, count - 1))];
  return [baseX + centered * horizontalStep, baseY + rowOffset];
}

function buildAss(project, options = {}) {
  const normalized = normalizeProject(project);
  const effect = effectById(normalized.effectId);
  const params = { ...effect.defaultParams, ...normalized.effectParams };
  const primary = assColor(params.primaryColor || effect.primary);
  const accent = assColor(params.accentColor || effect.accent);
  const font = String(params.fontFamily || DEFAULT_FONT).replace(/,/g, " ");
  const fontSize = Math.round(safeNumber(params.fontSize, 92, 28, 220));
  const baseX = Math.round((safeNumber(params.x, 50, 5, 95) / 100) * WIDTH);
  const baseY = Math.round((safeNumber(params.y, 50, 5, 95) / 100) * HEIGHT);
  const offset = safeNumber(options.offset, 0);
  const limitToId = options.segmentId ? String(options.segmentId) : "";
  const rows = normalized.segments.filter((item) => !limitToId || String(item.id) === limitToId);
  const events = [];

  for (const segment of rows) {
    const start = Math.max(0, segment.start - offset);
    const end = Math.max(start + 0.1, segment.end - offset);
    const durationMs = Math.max(160, Math.round((end - start) * 1000));
    const introMs = Math.min(durationMs - 40, Math.round(safeNumber(params.introDuration, 0.42, 0.12, 1.5) * 1000));
    const tokens = splitDisplayTokens(segment, normalized.effectId);
    const keywords = new Set((segment.keywords || []).map((item) => String(item)));
    tokens.forEach((entry, index) => {
      const token = entry.text;
      const highlighted = [...keywords].some((keyword) => keyword && (token.includes(keyword) || keyword.includes(token)));
      const [x, y] = tokenPosition(normalized.effectId, entry.indexInRow, entry.countInRow, baseX, baseY, entry);
      const color = highlighted || (normalized.effectId === "blue-yellow-stairs" && index % 2) || (normalized.effectId === "green-white-offset" && index % 2) ? accent : primary;
      const outline = normalized.effectId === "neon-outline-letters" ? 4 : normalized.effectId === "outline-footer-pop" ? 3 : 1.2;
      const blur = normalized.effectId === "neon-outline-letters" ? "\\blur0.8" : "";
      const prefix = normalized.effectId === "guide-list-focus" ? "▶ " : "";
      const tags = [
        "\\an5",
        `\\pos(${Math.round(x)},${Math.round(y)})`,
        `\\fn${font}`,
        `\\fs${normalized.effectId === "scatter-copy-reveal" || normalized.effectId === "guide-list-focus" ? Math.round(fontSize * 0.68) : fontSize}`,
        `\\1c${color}`,
        `\\3c${assColor(normalized.effectId === "neon-outline-letters" ? "#a65268" : "#111111")}`,
        `\\bord${outline}`,
        "\\shad0",
        blur,
        effectTags(normalized.effectId, introMs, index, highlighted),
      ].join("");
      events.push(`Dialogue: ${highlighted ? 2 : 1},${formatAssTime(start)},${formatAssTime(end)},Dynamic,,0,0,0,,{${tags}}${escapeAss(prefix + token)}`);
    });
    if (normalized.showBottomSubtitles) {
      events.push(`Dialogue: 3,${formatAssTime(start)},${formatAssTime(end)},Subtitle,,80,80,48,,{\\an2\\pos(960,1010)\\fad(120,100)}${escapeAss(segment.text)}`);
    }
  }

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${WIDTH}`,
    `PlayResY: ${HEIGHT}`,
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Dynamic,${font},${fontSize},${primary},${accent},&H00101010,&H00000000,-1,0,0,0,100,100,0,0,1,1.2,0,5,40,40,40,1`,
    `Style: Subtitle,${font},42,&H00FFFFFF,&H00FFFFFF,&H00101010,&H88000000,-1,0,0,0,100,100,0,0,1,3,0,2,80,80,48,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

function buildSrt(project) {
  return normalizeProject(project).segments.map((segment, index) => [
    String(index + 1),
    `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}`,
    segment.text,
  ].join("\n")).join("\n\n") + "\n";
}

function escapeFilterPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function spawnLogged(command, args, { cwd, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    const log = [];
    const collect = (chunk) => {
      const text = String(chunk || "");
      log.push(text);
      if (typeof onLine === "function") onLine(text);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", reject);
    child.on("close", (code) => {
      const output = log.join("").slice(-16000);
      if (code === 0) resolve(output);
      else reject(new Error(`${path.basename(command)} exited with ${code}\n${output}`));
    });
  });
}

async function zipDirectory(sourceDir, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 6 } });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

function dataUrlParts(data) {
  const match = String(data || "").match(/^data:([^;,]+)?(;base64)?,([\s\S]+)$/);
  if (!match) throw new Error("上传文件数据无效。");
  return { mime: match[1] || "application/octet-stream", base64: Boolean(match[2]), data: match[3] };
}

function extensionAllowed(kind, extension) {
  if (kind === "background") return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);
  if (kind === "bgm") return AUDIO_EXTENSIONS.has(extension);
  return false;
}

function projectPublic(project) {
  if (!project) return null;
  return {
    ...project,
    effect: effectById(project.effectId),
    motionCanvas: motionCanvasProjectDescriptor(project),
  };
}

export function createKineticTextService({
  baseDir,
  downloadsDir,
  ffmpegPath,
  ffprobePath,
  modelRouter,
  onOutput = () => {},
}) {
  const rootDir = path.join(baseDir, ".data", "kinetic-text");
  const projectsDir = path.join(rootDir, "projects");
  const jobs = new Map();
  fs.mkdirSync(projectsDir, { recursive: true });

  function projectDir(id) {
    return path.join(projectsDir, String(id || ""));
  }

  function projectPath(id) {
    return path.join(projectDir(id), "project.json");
  }

  function save(project) {
    const normalized = normalizeProject({ ...project, updatedAt: nowIso() });
    writeJson(projectPath(normalized.id), normalized);
    return projectPublic(normalized);
  }

  function get(id) {
    const project = readJson(projectPath(id), null);
    return project ? projectPublic(normalizeProject(project)) : null;
  }

  function list() {
    return fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => get(entry.name))
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function probeDuration(filePath) {
    if (!filePath || !fs.existsSync(filePath) || !ffprobePath) return 0;
    try {
      const output = await spawnLogged(ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath]);
      return safeNumber(output.trim(), 0, 0);
    } catch {
      return 0;
    }
  }

  async function create(input = {}) {
    const id = `kinetic-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const tts = input.tts && typeof input.tts === "object" ? input.tts : input;
    const audioPath = String(tts.audio_path || tts.audioPath || "");
    const scriptPath = String(tts.script_path || tts.scriptPath || "");
    const subtitlePath = String(tts.subtitle_path || tts.timed_subtitle_path || "");
    const timestampedTextPath = String(tts.timestamped_text_path || tts.timestampedTextPath || tts.timed_subtitle_path || "");
    const payloadTimeline = Array.isArray(tts.subtitle_timeline)
      ? tts.subtitle_timeline
      : Array.isArray(tts.subtitleTimeline)
        ? tts.subtitleTimeline
        : Array.isArray(input.segments)
          ? input.segments
          : [];
    const timestampedTimeline = payloadTimeline.length ? [] : timelineFromFile(timestampedTextPath);
    const subtitleFileTimeline = payloadTimeline.length || timestampedTimeline.length ? [] : timelineFromFile(subtitlePath);
    const fileTimeline = timestampedTimeline.length ? timestampedTimeline : subtitleFileTimeline;
    const timeline = payloadTimeline.length ? payloadTimeline : fileTimeline;
    const hasTimedTimeline = timeline.length > 0;
    const hasAudio = Boolean(audioPath || tts.audio_url || tts.audioUrl);
    const duration = safeNumber(tts.duration, 0, 0) || await probeDuration(audioPath);
    const effectId = normalizeEffectId(input.effectId);
    return save({
      id,
      title: input.title || tts.title || `动态大字视频 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      status: "editing",
      stage: hasAudio ? "接收 TTS" : "接收文案",
      progress: 8,
      ttsJobId: Number(tts.id || tts.ttsJobId || 0),
      videoProjectId: String(input.videoProjectId || tts.videoProjectId || ""),
      audioPath,
      audioUrl: String(tts.audio_url || tts.audioUrl || ""),
      scriptPath,
      subtitlePath,
      timestampedTextPath,
      text: String(tts.text || input.text || ""),
      duration,
      subtitleSource: String(tts.subtitle_source || tts.subtitleSource || (hasTimedTimeline ? "provider" : "estimated")),
      segments: normalizeSegments(timeline, tts.text || input.text, duration),
      effectId,
      effectParams: defaultEffectParams(effectId),
      showBottomSubtitles: false,
      background: { mode: "black", path: "", name: "" },
      audioMix: { source: "none", localPath: "", localName: "", ttsVolume: 100, backgroundVolume: 18 },
      outputs: {},
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  function update(id, changes = {}) {
    const current = get(id);
    if (!current) throw new Error("动态大字项目不存在。");
    const merged = {
      ...current,
      ...changes,
      id: current.id,
      background: { ...current.background, ...(changes.background || {}) },
      audioMix: { ...current.audioMix, ...(changes.audioMix || {}) },
      effectParams: { ...current.effectParams, ...(changes.effectParams || {}) },
      outputs: { ...current.outputs, ...(changes.outputs || {}) },
    };
    return save(merged);
  }

  function upload({ projectId, kind, name, data }) {
    const project = get(projectId);
    if (!project) throw new Error("动态大字项目不存在。");
    const extension = path.extname(String(name || "")).toLowerCase();
    if (!extensionAllowed(kind, extension)) throw new Error("文件格式不受支持。");
    const parsed = dataUrlParts(data);
    const targetDir = path.join(projectDir(projectId), "uploads");
    const targetPath = path.join(targetDir, `${kind}-${Date.now()}${extension}`);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetPath, parsed.base64 ? Buffer.from(parsed.data, "base64") : Buffer.from(decodeURIComponent(parsed.data)));
    if (kind === "background") {
      return update(projectId, { background: { mode: IMAGE_EXTENSIONS.has(extension) ? "image" : "video", path: targetPath, name: safeFileName(name) } });
    }
    return update(projectId, { audioMix: { source: "local", localPath: targetPath, localName: safeFileName(name) } });
  }

  async function analyze(projectId, providerId = "") {
    const project = get(projectId);
    if (!project) throw new Error("动态大字项目不存在。");
    let analyzed = null;
    let usedProvider = "local";
    const available = typeof modelRouter?.listProviders === "function" ? modelRouter.listProviders().map((item) => item.id) : [];
    const candidates = [...new Set([providerId, "deepseek", "mimo"].filter((item) => item && available.includes(item)))];
    for (const candidate of candidates) {
      try {
        const response = await modelRouter.generateWithProvider(candidate, [
          { role: "system", content: "你负责中文动态字幕排版。只返回 JSON 数组，每项包含 id、keywords（1-2个重点词）和 lineBreaks（建议换行的字符索引数组）。不要解释。" },
          { role: "user", content: JSON.stringify(project.segments.map(({ id, text }) => ({ id, text }))) },
        ], { temperature: 0.2, maxTokens: 1800 });
        const text = String(response.content || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          analyzed = parsed;
          usedProvider = candidate;
          break;
        }
      } catch {
        // Continue to configured fallback, then local analysis.
      }
    }
    const byId = new Map((analyzed || []).map((item) => [String(item.id), item]));
    const segments = project.segments.map((segment) => {
      const item = byId.get(String(segment.id));
      return {
        ...segment,
        keywords: Array.isArray(item?.keywords) ? item.keywords.map(normalizeText).filter(Boolean).slice(0, 3) : inferKeywords(segment.text),
        lineBreaks: Array.isArray(item?.lineBreaks) ? item.lineBreaks.map(Number).filter(Number.isFinite) : segment.lineBreaks,
      };
    });
    const updated = update(projectId, { segments, analysisProvider: usedProvider, analysisUpdatedAt: nowIso() });
    return { project: updated, provider: usedProvider, aiUsed: usedProvider !== "local" };
  }

  function createJob(projectId, type) {
    const id = `${type}-${Date.now()}-${randomUUID().slice(0, 5)}`;
    const job = { id, projectId, type, status: "queued", progress: 0, stage: "等待处理", error: "", createdAt: nowIso(), updatedAt: nowIso() };
    jobs.set(id, job);
    return job;
  }

  function updateJob(id, changes) {
    const current = jobs.get(id);
    if (!current) return null;
    const next = { ...current, ...changes, updatedAt: nowIso() };
    jobs.set(id, next);
    try { update(next.projectId, { status: next.status, stage: next.stage, progress: next.progress, lastJobId: id, lastError: next.error || "" }); } catch {}
    return next;
  }

  async function renderTransparentClip(project, segment, outputPath) {
    const clipDuration = Math.max(0.2, segment.end - segment.start);
    const assPath = path.join(path.dirname(outputPath), `${safeFileName(segment.id)}.ass`);
    fs.writeFileSync(assPath, buildAss(project, { segmentId: segment.id, offset: segment.start }), "utf8");
    const vf = `format=rgba,subtitles='${escapeFilterPath(assPath)}',format=yuva420p`;
    await spawnLogged(ffmpegPath, [
      "-y", "-f", "lavfi", "-i", `color=c=black@0.0:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${clipDuration.toFixed(3)}`,
      "-vf", vf, "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-r", String(FPS), outputPath,
    ]);
  }

  async function buildMaterials(projectId, jobId) {
    try {
      let project = get(projectId);
      if (!project) throw new Error("动态大字项目不存在。");
      if (!project.segments.length) throw new Error("没有可渲染的字幕片段。");
      const runId = safeFileName(jobId || `materials-${Date.now()}`, "materials");
      const targetRoot = path.join(projectDir(projectId), "materials", runId);
      const clipsDir = path.join(targetRoot, "segments");
      fs.mkdirSync(clipsDir, { recursive: true });
      updateJob(jobId, { status: "running", progress: 8, stage: "分析排版" });

      fs.writeFileSync(path.join(targetRoot, "script.txt"), `${project.text}\n`, "utf8");
      fs.writeFileSync(path.join(targetRoot, "subtitles.srt"), buildSrt(project), "utf8");
      fs.writeFileSync(path.join(targetRoot, "effects.ass"), buildAss(project), "utf8");
      writeJson(path.join(targetRoot, "manifest.json"), project);
      writeJson(path.join(targetRoot, "motion-canvas-project.json"), motionCanvasProjectDescriptor(project));
      if (project.audioPath && fs.existsSync(project.audioPath)) {
        fs.copyFileSync(project.audioPath, path.join(targetRoot, `tts-audio${path.extname(project.audioPath) || ".mp3"}`));
      }

      for (let index = 0; index < project.segments.length; index += 1) {
        const segment = project.segments[index];
        const outputPath = path.join(clipsDir, `${String(index + 1).padStart(3, "0")}-${safeFileName(segment.id)}.webm`);
        await renderTransparentClip(project, segment, outputPath);
        const pct = 15 + Math.round(((index + 1) / project.segments.length) * 60);
        updateJob(jobId, { progress: pct, stage: `渲染透明片段 ${index + 1}/${project.segments.length}` });
      }

      updateJob(jobId, { progress: 82, stage: "生成素材包" });
      const zipPath = path.join(projectDir(projectId), `${safeFileName(project.title, project.id)}-素材包.zip`);
      const uniqueZipPath = path.join(projectDir(projectId), `${safeFileName(project.title, project.id)}-${runId}.zip`);
      await zipDirectory(targetRoot, uniqueZipPath);
      project = update(projectId, { outputs: { materialDir: targetRoot, materialZip: uniqueZipPath, assPath: path.join(targetRoot, "effects.ass"), srtPath: path.join(targetRoot, "subtitles.srt") } });
      updateJob(jobId, { status: "completed", progress: 100, stage: "素材包完成", result: { materialZip: zipPath, project } });
      updateJob(jobId, { result: { materialZip: uniqueZipPath, project } });
      return project;
    } catch (error) {
      updateJob(jobId, { status: "failed", stage: "素材包生成失败", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async function renderFinal(projectId, jobId) {
    try {
      let project = get(projectId);
      if (!project) throw new Error("动态大字项目不存在。");
      if (!project.outputs?.materialZip || !fs.existsSync(project.outputs.materialZip)) {
        const nested = createJob(projectId, "materials");
        await buildMaterials(projectId, nested.id);
        project = get(projectId);
      }
      const hasTtsAudio = Boolean(project.audioPath && fs.existsSync(project.audioPath));
      const duration = Math.max(project.duration, hasTtsAudio ? await probeDuration(project.audioPath) : 0, 0.5);
      const outputDir = path.join(downloadsDir, "kinetic-text", project.id);
      fs.mkdirSync(outputDir, { recursive: true });
      const assPath = project.outputs.assPath;
      const outputPath = path.join(outputDir, `${safeFileName(project.title, project.id)}.mp4`);
      const args = ["-y"];
      const bg = project.background || { mode: "black" };
      if (bg.mode === "image" && bg.path && fs.existsSync(bg.path)) args.push("-loop", "1", "-i", bg.path);
      else if (bg.mode === "video" && bg.path && fs.existsSync(bg.path)) args.push("-stream_loop", "-1", "-i", bg.path);
      else args.push("-f", "lavfi", "-i", `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${duration.toFixed(3)}`);
      if (hasTtsAudio) args.push("-i", project.audioPath);
      else args.push("-f", "lavfi", "-t", duration.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
      let backgroundAudioIndex = -1;
      if (project.audioMix.source === "local" && project.audioMix.localPath && fs.existsSync(project.audioMix.localPath)) {
        backgroundAudioIndex = 2;
        args.push("-stream_loop", "-1", "-i", project.audioMix.localPath);
      } else if (project.audioMix.source === "video" && bg.mode === "video") {
        backgroundAudioIndex = 0;
      }

      updateJob(jobId, { status: "running", progress: 20, stage: "准备背景" });
      const videoFilter = `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},subtitles='${escapeFilterPath(assPath)}'[v]`;
      const ttsVolume = (project.audioMix.ttsVolume / 100).toFixed(3);
      const bgVolume = (project.audioMix.backgroundVolume / 100).toFixed(3);
      const filters = [videoFilter, `[1:a]volume=${ttsVolume}[tts]`];
      if (backgroundAudioIndex >= 0) {
        const fadeOut = Math.max(0, duration - 0.8).toFixed(3);
        filters.push(`[${backgroundAudioIndex}:a]volume=${bgVolume},afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOut}:d=0.8[bgm]`);
        filters.push("[tts][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]");
      }
      args.push("-filter_complex", filters.join(";"), "-map", "[v]", "-map", backgroundAudioIndex >= 0 ? "[a]" : "[tts]");
      args.push("-t", duration.toFixed(3), "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath);
      updateJob(jobId, { progress: 42, stage: "渲染动态文字" });
      await spawnLogged(ffmpegPath, args, { onLine: (line) => {
        const match = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (!match) return;
        const elapsed = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        updateJob(jobId, { progress: Math.min(94, 42 + Math.round((elapsed / duration) * 50)), stage: "合成 MP4" });
      } });
      updateJob(jobId, { progress: 97, stage: "归档完成" });
      project = update(projectId, { status: "completed", stage: "成片完成", progress: 100, outputs: { finalVideo: outputPath } });
      await Promise.resolve(onOutput(project, { videoPath: outputPath, materialZip: project.outputs.materialZip, srtPath: project.outputs.srtPath }));
      updateJob(jobId, { status: "completed", progress: 100, stage: "成片完成", result: { videoPath: outputPath, project } });
      return project;
    } catch (error) {
      updateJob(jobId, { status: "failed", stage: "成片生成失败", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  function startMaterials(projectId) {
    const job = createJob(projectId, "materials");
    setImmediate(() => buildMaterials(projectId, job.id).catch(() => {}));
    return job;
  }

  function startRender(projectId) {
    const job = createJob(projectId, "render");
    setImmediate(() => renderFinal(projectId, job.id).catch(() => {}));
    return job;
  }

  function resolveOutputFile(projectId, key) {
    const project = get(projectId);
    if (!project) return null;
    const allowed = {
      video: project.outputs?.finalVideo,
      package: project.outputs?.materialZip,
      srt: project.outputs?.srtPath,
      background: project.background?.path,
      bgm: project.audioMix?.localPath,
      tts: project.audioPath,
      script: project.scriptPath,
      subtitle: project.subtitlePath,
      timestamped: project.timestampedTextPath,
    };
    const filePath = allowed[key];
    if (!filePath || !fs.existsSync(filePath)) return null;
    return filePath;
  }

  return {
    effects: () => KINETIC_TEXT_EFFECTS,
    providers: () => typeof modelRouter?.listProviders === "function" ? modelRouter.listProviders() : [],
    create,
    get,
    list,
    update,
    upload,
    analyze,
    startMaterials,
    startRender,
    getJob: (id) => jobs.get(String(id || "")) || null,
    resolveOutputFile,
  };
}
