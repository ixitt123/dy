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

const FPS = 30;
const DEFAULT_FONT = "Microsoft YaHei";
const OUTPUT_SIZES = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);
const TIMELINE_SKILL_IDS = ["subtitle-timeline", "audio-subtitle-align"];
const TIMELINE_GAP_TOLERANCE = 0.35;

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

function resolutionForProject(project = {}) {
  const aspectRatio = Object.hasOwn(OUTPUT_SIZES, project.aspectRatio) ? project.aspectRatio : "9:16";
  return { aspectRatio, ...OUTPUT_SIZES[aspectRatio] };
}

function frameRateForProject(project = {}) {
  return Number(project.frameRate) === 60 ? 60 : 30;
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

function loadTimelineSkillRules(baseDir) {
  return TIMELINE_SKILL_IDS.map((id) => {
    const filePath = path.join(baseDir, "skills", id, "SKILL.md");
    if (!fs.existsSync(filePath)) return `# ${id}\n- Skill file missing.`;
    return fs.readFileSync(filePath, "utf8").trim();
  }).join("\n\n");
}

function textLength(value) {
  return [...normalizeText(value).replace(/\s/g, "")].length;
}

const KEYWORD_STOP_WORDS = new Set([
  "一个", "一种", "一些", "一下", "这个", "那个", "这些", "那些",
  "我们", "你们", "他们", "它们", "就是", "还是", "可以", "需要",
  "应该", "然后", "最后", "因为", "所以", "如果", "但是", "而且",
  "已经", "正在", "进行", "出现", "其实", "真的", "非常", "比较",
  "怎么", "什么", "为什么", "不用", "不要", "没有", "不是",
]);

function cleanKeyword(value) {
  return normalizeText(value)
    .replace(/^[\s，。！？；：、,.!?;:“”‘’'"（）()【】\[\]《》<>]+|[\s，。！？；：、,.!?;:“”‘’'"（）()【】\[\]《》<>]+$/g, "")
    .replace(/\s+/g, "")
    .slice(0, 12);
}

function keywordTargetCount(text) {
  const length = textLength(text);
  if (length >= 18) return 3;
  if (length >= 8) return 2;
  return 1;
}

function keywordCandidateScore(candidate, source, wholeClause = false) {
  const length = [...candidate].length;
  const position = Math.max(0, source.indexOf(candidate));
  let score = Math.min(length, 6) * 2 + Math.max(0, 4 - position * 0.15);
  if (wholeClause) score += 4;
  if (/[A-Za-z0-9%]/.test(candidate)) score += 3;
  if (length >= 2 && length <= 5) score += 2;
  if (/^[的了着过呢吗吧啊呀哦嘛]|[的了着过呢吗吧啊呀哦嘛]$/.test(candidate)) score -= 5;
  if (/^第[一二三四五六七八九十百千万\d]+$/.test(candidate)) score -= 20;
  if (KEYWORD_STOP_WORDS.has(candidate)) score -= 20;
  return score;
}

function inferKeywords(text) {
  const normalized = normalizeText(text);
  const source = normalized.replace(/[\s，。！？；：、,.!?;:“”‘’'"（）()【】\[\]《》<>]/g, "");
  if (!source) return [];
  if ([...source].length <= 4 && !/[，。！？；：、,.!?;:]/.test(normalized.slice(0, -1))) return [source];

  const candidates = new Map();
  const addCandidate = (value, wholeClause = false) => {
    const candidate = cleanKeyword(value).replace(wholeClause ? /[的了着过呢吗吧啊呀哦嘛]+$/ : /$^/, "");
    const length = [...candidate].length;
    if (!candidate || length < 2 || length > 12 || KEYWORD_STOP_WORDS.has(candidate)) return;
    if ([...source].length > 4 && candidate === source) return;
    const score = keywordCandidateScore(candidate, source, wholeClause);
    if (score > (candidates.get(candidate) ?? -Infinity)) candidates.set(candidate, score);
  };

  for (const token of normalized.match(/[A-Za-z][A-Za-z0-9+.#-]{1,15}|\d+(?:\.\d+)?%?/g) || []) addCandidate(token);
  const clauses = normalized.split(/[，。！？；：、,.!?;:\s]+/).map(cleanKeyword).filter(Boolean);
  let segmenter = null;
  try { segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" }); } catch {}

  for (const clause of clauses) {
    const clauseLength = [...clause].length;
    if (clauseLength >= 2 && clauseLength <= 4) addCandidate(clause, true);
    const tokens = segmenter
      ? [...segmenter.segment(clause)].filter((item) => item.isWordLike).map((item) => cleanKeyword(item.segment)).filter(Boolean)
      : (clause.match(/[A-Za-z0-9%]+|[\u4e00-\u9fff]/g) || []);
    for (let start = 0; start < tokens.length; start += 1) {
      let phrase = "";
      for (let size = 1; size <= 3 && start + size <= tokens.length; size += 1) {
        const token = tokens[start + size - 1];
        if (KEYWORD_STOP_WORDS.has(token) || /^[的了着过呢吗吧啊呀哦嘛个]$/.test(token)) break;
        phrase += token;
        const phraseLength = [...phrase].length;
        if (phraseLength >= 2 && phraseLength <= 6) addCandidate(phrase);
        if (phraseLength > 6) break;
      }
    }
  }

  const targetCount = keywordTargetCount(normalized);
  const selected = [];
  for (const [candidate] of [...candidates.entries()].sort((a, b) => b[1] - a[1])) {
    if (selected.some((item) => item.includes(candidate) || candidate.includes(item))) continue;
    selected.push(candidate);
    if (selected.length >= targetCount) break;
  }
  if (!selected.length) selected.push(source.slice(0, Math.min(6, [...source].length)));
  return selected.slice(0, 3);
}

function normalizeSegmentKeywords(keywords, text) {
  const source = normalizeText(text).replace(/[\s，。！？；：、,.!?;:“”‘’'"（）()【】\[\]《》<>—-]/g, "");
  const supplied = Array.isArray(keywords) ? keywords.map(cleanKeyword).filter(Boolean) : [];
  const selected = [];
  for (const candidate of supplied) {
    const length = [...candidate].length;
    if (length < 2 || length > 6 || KEYWORD_STOP_WORDS.has(candidate)) continue;
    if (!source.includes(candidate)) continue;
    if (source.length > 4 && candidate === source) continue;
    if (selected.some((item) => item.includes(candidate) || candidate.includes(item))) continue;
    selected.push(candidate);
    if (selected.length >= keywordTargetCount(text)) break;
  }
  return selected.length ? selected.slice(0, 3) : inferKeywords(text);
}

const BOOKEND_MIN_SECONDS = 0.18;
const BOOKEND_PRESETS = Object.freeze({
  intro: {
    title: "",
    remember: "先记住这句话",
    core: "今天只讲一个重点",
    method: "正确方法只有一个",
    custom: "",
  },
  outro: {
    follow: "记得关注，持续分享实用内容",
    private: "需要完整资料，可以私聊我",
    save: "点赞收藏，方便以后再看",
    next: "关注我，下期继续",
    custom: "",
  },
});

function normalizeBookendItem(value, kind, title) {
  const source = value && typeof value === "object" ? value : {};
  const presets = BOOKEND_PRESETS[kind];
  const fallbackPreset = kind === "intro" ? "title" : "follow";
  const preset = Object.hasOwn(presets, source.preset) ? source.preset : fallbackPreset;
  const presetText = kind === "intro" && preset === "title" ? title : presets[preset];
  return {
    enabled: source.enabled === true,
    preset,
    text: (normalizeText(source.text) || normalizeText(presetText)).slice(0, 80),
  };
}

function normalizeBookends(value, title) {
  const source = value && typeof value === "object" ? value : {};
  return {
    intro: normalizeBookendItem(source.intro, "intro", title),
    outro: normalizeBookendItem(source.outro, "outro", title),
  };
}

function calculateBookendWindows(segments, duration) {
  const rows = (Array.isArray(segments) ? segments : []).slice().sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
  const total = Math.max(0, Number(duration || 0));
  if (!rows.length || total <= 0) {
    return {
      minimumSeconds: BOOKEND_MIN_SECONDS,
      intro: { start: 0, end: 0, duration: 0, blankSeconds: 0, available: false },
      outro: { start: total, end: total, duration: 0, blankSeconds: 0, available: false },
    };
  }
  const firstStart = Math.max(0, Math.min(total, Number(rows[0].start || 0)));
  const lastEnd = Math.max(0, Math.min(total, Number(rows[rows.length - 1].end || 0)));
  const introEnd = Math.max(0, firstStart - 0.09);
  const outroStart = Math.min(total, lastEnd + 0.03);
  const introDuration = Math.max(0, introEnd);
  const outroDuration = Math.max(0, total - outroStart);
  return {
    minimumSeconds: BOOKEND_MIN_SECONDS,
    intro: {
      start: 0,
      end: introEnd,
      duration: introDuration,
      blankSeconds: firstStart,
      available: introDuration >= BOOKEND_MIN_SECONDS,
    },
    outro: {
      start: outroStart,
      end: total,
      duration: outroDuration,
      blankSeconds: Math.max(0, total - lastEnd),
      available: outroDuration >= BOOKEND_MIN_SECONDS,
    },
  };
}

function validateTimelineRules(segments, audioDuration = 0) {
  const warnings = [];
  const rows = (Array.isArray(segments) ? segments : []).slice().sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
  if (!rows.length) {
    return { ok: false, skillRules: TIMELINE_SKILL_IDS, warnings: ["没有可用字幕时间轴。"] };
  }
  const firstStart = safeNumber(rows[0].start, 0, 0);
  if (firstStart > 0.25) warnings.push("第一条字幕没有从 0 秒附近开始。");
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const start = safeNumber(row.start, 0, 0);
    const end = safeNumber(row.end, 0, 0);
    if (end <= start) warnings.push(`第 ${index + 1} 条结束时间不大于开始时间。`);
    if (index > 0) {
      const previousEnd = safeNumber(rows[index - 1].end, 0, 0);
      if (start < previousEnd - 0.02) warnings.push(`第 ${index + 1} 条与上一条字幕时间重叠。`);
      if (start - previousEnd > TIMELINE_GAP_TOLERANCE) warnings.push(`第 ${index + 1} 条与上一条间隔偏长。`);
    }
    const length = textLength(row.text);
    if (length > 24) warnings.push(`第 ${index + 1} 条字幕偏长，建议按语义拆短。`);
    if (!Array.isArray(row.keywords) || row.keywords.length < 1) warnings.push(`第 ${index + 1} 条缺少重点词。`);
    if (Array.isArray(row.keywords) && row.keywords.length > 3) warnings.push(`第 ${index + 1} 条重点词超过 3 个。`);
  }
  const lastEnd = safeNumber(rows[rows.length - 1].end, 0, 0);
  const duration = safeNumber(audioDuration, 0, 0);
  if (duration > 0 && lastEnd > duration + 0.35) warnings.push("最后一条字幕明显超过音频时长。");
  return { ok: warnings.length === 0, skillRules: TIMELINE_SKILL_IDS, warnings: warnings.slice(0, 8) };
}

function normalizeWordRows(rawWords = []) {
  return (Array.isArray(rawWords) ? rawWords : []).map((word, index) => {
    const start = safeNumber(word.start ?? word.start_time ?? word.startMs / 1000, 0, 0);
    const end = safeNumber(word.end ?? word.end_time ?? word.endMs / 1000, start + 0.08, start + 0.01);
    return {
      index: Number(word.index || index + 1),
      text: normalizeText(word.text || word.word || word.value),
      start,
      end,
      confidence: Number.isFinite(Number(word.confidence)) ? Number(word.confidence) : null,
      estimated: word.estimated === true,
    };
  }).filter((word) => word.text && word.end > word.start).sort((a, b) => a.start - b.start);
}

function attachWordTiming(segments, rawWords = []) {
  const globalWords = normalizeWordRows(rawWords);
  return segments.map((segment) => {
    const ownWords = normalizeWordRows(segment.words);
    const words = ownWords.length ? ownWords : globalWords.filter((word) => (
      word.end > segment.start + 0.005 && word.start < segment.end - 0.005
    ));
    return { ...segment, words };
  });
}

function normalizeSegments(rawSegments, text, duration = 0) {
  const rows = Array.isArray(rawSegments) ? rawSegments : [];
  const parsed = rows.map((item, index) => {
    const start = safeNumber(item.start ?? item.start_time ?? item.begin, 0, 0);
    const end = safeNumber(item.end ?? item.end_time ?? item.finish, start + 0.5, start + 0.1);
    const segmentText = normalizeText(item.text || item.content || item.subtitle);
    return {
      id: String(item.id || `segment-${index + 1}`),
      index: index + 1,
      start,
      end,
      text: segmentText,
      words: normalizeWordRows(item.words || item.wordTimeline || item.word_timeline),
      speaker: normalizeText(item.speaker || item.speakerName || item.speaker_name),
      keywords: normalizeSegmentKeywords(item.keywords, segmentText),
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
      words: [],
      speaker: "",
      keywords: inferKeywords(piece),
      lineBreaks: [],
      overrides: {},
    };
    cursor = row.end;
    return row;
  });
}

function normalizeProject(project) {
  const effectId = normalizeEffectId(project.effectId);
  const duration = safeNumber(project.duration, 0, 0);
  const wordTimeline = normalizeWordRows(project.wordTimeline || project.word_timeline);
  const segments = attachWordTiming(normalizeSegments(project.segments, project.text, duration), wordTimeline);
  const computedDuration = Math.max(duration, ...segments.map((item) => item.end), 0);
  const title = normalizeText(project.title) || "动态大字视频";
  const bookends = normalizeBookends(project.bookends, title);
  const bookendWindows = calculateBookendWindows(segments, computedDuration);
  const timelineValidation = validateTimelineRules(segments, duration);
  const background = project.background && typeof project.background === "object" ? project.background : {};
  const audioMix = project.audioMix && typeof project.audioMix === "object" ? project.audioMix : {};
  return {
    ...project,
    title,
    text: normalizeText(project.text) || segments.map((item) => item.text).join(""),
    effectId,
    effectParams: { ...defaultEffectParams(effectId), ...(project.effectParams || {}) },
    aspectRatio: resolutionForProject(project).aspectRatio,
    frameRate: frameRateForProject(project),
    duration: computedDuration,
    segments,
    wordTimeline,
    bookends,
    bookendWindows,
    subtitleSource: String(project.subtitleSource || "estimated"),
    timelineSkillRules: TIMELINE_SKILL_IDS,
    timelineValidation,
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

function splitByMode(line, tokenMode = "char") {
  const source = normalizeText(line);
  if (!source) return [];
  if (tokenMode === "line") return [source];
  if (tokenMode === "phrase") return source.match(/.{1,6}/g) || [source];
  if (tokenMode === "word") {
    const spaced = source.split(/\s+/).filter(Boolean);
    if (spaced.length > 1) return spaced;
    return source.match(/[A-Za-z0-9%]+|[\u4e00-\u9fff]{1,3}|[^\s]/g) || [source];
  }
  return [...source].filter((item) => item.trim());
}

function effectTags(effectId, introMs, index, highlighted) {
  const effect = effectById(effectId);
  const motion = effect.motion || "pop";
  const delay = Math.round(index * 55);
  const start = Math.min(delay, Math.max(0, introMs - 80));
  const end = Math.max(start + 100, introMs);
  const accent = highlighted ? "\\b1\\fscx112\\fscy112" : "";
  const tags = {
    pop: `\\fscx35\\fscy35\\alpha&HFF&\\t(${start},${end},\\fscx100\\fscy100\\alpha&H00&)`,
    karaoke: `\\fscx92\\fscy92\\alpha&H55&\\t(${start},${end},\\fscx100\\fscy100\\alpha&H00&)`,
    "mask-rise": `\\fscy20\\alpha&HFF&\\t(${start},${end},\\fscy100\\alpha&H00&)`,
    focus: `\\fscx185\\fscy185\\blur12\\alpha&HEE&\\t(${start},${end},\\fscx100\\fscy100\\blur0\\alpha&H00&)`,
    slam: `\\fscx230\\fscy230\\blur3\\alpha&HFF&\\t(${start},${end},\\fscx100\\fscy100\\blur0\\alpha&H00&)`,
    glitch: `\\frz-5\\fax0.12\\blur1.4\\alpha&HFF&\\t(${start},${end},\\frz0\\fax0\\blur0\\alpha&H00&)\\t(${end},${end + 80},\\frz3\\fax-0.08)\\t(${end + 80},${end + 150},\\frz0\\fax0)`,
    neon: `\\fry75\\blur6\\alpha&HFF&\\t(${start},${end},\\fry0\\blur0.5\\alpha&H00&)`,
    block: `\\fscx50\\fscy50\\alpha&HFF&\\t(${start},${end},\\fscx100\\fscy100\\alpha&H00&)`,
    slide: `\\frz-18\\fscx70\\fscy70\\alpha&HFF&\\t(${start},${end},\\frz0\\fscx100\\fscy100\\alpha&H00&)`,
    typewriter: `\\alpha&HFF&\\t(${start},${Math.max(start + 70, end - 60)},\\alpha&H00&)`,
    wipe: `\\fscx12\\alpha&HFF&\\t(${start},${end},\\fscx100\\alpha&H00&)`,
    "soft-blur": `\\blur10\\alpha&HDD&\\t(${start},${end},\\blur0\\alpha&H00&)`,
    wave: `\\frz-8\\fscx70\\fscy70\\alpha&HFF&\\t(${start},${end},\\frz0\\fscx100\\fscy100\\alpha&H00&)`,
    assemble: `\\fscx40\\fscy40\\blur5\\alpha&HFF&\\t(${start},${end},\\fscx100\\fscy100\\blur0\\alpha&H00&)`,
    outline: `\\bord5\\blur1.2\\alpha&HDD&\\t(${start},${end},\\bord1.4\\blur0\\alpha&H00&)`,
    elastic: `\\fscx20\\fscy20\\frz-10\\alpha&HFF&\\t(${start},${end},\\fscx108\\fscy108\\frz0\\alpha&H00&)\\t(${end},${end + 120},\\fscx100\\fscy100)`,
    fade: `\\alpha&HDD&\\t(${start},${end},\\alpha&H00&)`,
    orbit: `\\fscx55\\fscy55\\frz18\\alpha&HFF&\\t(${start},${end},\\fscx100\\fscy100\\frz0\\alpha&H00&)`,
  };
  return `${tags[motion] || tags.pop}${accent}`;
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
  const effect = effectById(effectId);
  const lines = splitTextLines(segment);
  return lines.flatMap((line, row) => {
    const values = splitByMode(line, effect.tokenMode);
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
  const effect = effectById(effectId);
  const layoutId = effect.layout || "center";
  const centered = (index - (count - 1) / 2);
  const rowOffset = (Number(layout.row || 0) - (Number(layout.rowCount || 1) - 1) / 2) * 190;
  const horizontalStep = Math.min(130, 1500 / Math.max(1, count - 1));
  if (layoutId === "lower-third") return [baseX + centered * Math.min(110, horizontalStep), Math.round(HEIGHT * 0.78) + rowOffset * 0.22];
  if (layoutId === "impact") return [baseX + centered * Math.min(150, horizontalStep), baseY + rowOffset + (index % 2 ? 42 : -28)];
  if (layoutId === "diagonal") return [baseX + centered * horizontalStep, baseY + rowOffset + centered * Math.min(58, 500 / Math.max(1, count - 1))];
  if (layoutId === "stack") return [baseX + centered * Math.min(120, horizontalStep), baseY + rowOffset + (index % 2 ? 70 : -38)];
  if (layoutId === "stairs") return [baseX - 420 + index * Math.min(145, horizontalStep), baseY + rowOffset - 120 + index * 54];
  if (layoutId === "side-notes") {
    if (index === Math.floor((count - 1) / 2)) return [baseX, baseY + rowOffset];
    return [baseX + (index % 2 ? 430 : -430), baseY + rowOffset + (index - count / 2) * 54];
  }
  if (layoutId === "scatter") {
    const points = [[-470, -240], [-180, -90], [360, -210], [-380, 190], [150, 150], [430, 255], [-40, 260], [255, 30]];
    const point = points[index % points.length];
    return [baseX + point[0], baseY + rowOffset + point[1]];
  }
  if (layoutId === "vertical") return [baseX + Number(layout.row || 0) * 130, baseY + (index - (count - 1) / 2) * 116];
  if (layoutId === "wave") return [baseX + centered * Math.min(108, horizontalStep), baseY + rowOffset + Math.sin(index * 0.95) * 85];
  if (layoutId === "line-left") return [Math.max(220, baseX - 390) + index * Math.min(96, horizontalStep), baseY + rowOffset];
  if (layoutId === "question-card") return [baseX + centered * Math.min(112, horizontalStep), baseY + rowOffset - 38];
  if (layoutId === "title-card") return [baseX + centered * Math.min(118, horizontalStep), baseY + rowOffset];
  if (layoutId === "sticker") return [baseX + centered * Math.min(138, horizontalStep), baseY + rowOffset + (index % 2 ? 58 : -42)];
  if (layoutId === "orbit") {
    if (index === 0) return [baseX, baseY + rowOffset];
    const angle = ((index - 1) / Math.max(1, count - 1)) * Math.PI * 2 - Math.PI / 2;
    const radiusX = 430;
    const radiusY = 210;
    return [baseX + Math.cos(angle) * radiusX, baseY + rowOffset + Math.sin(angle) * radiusY];
  }
  return [baseX + centered * horizontalStep, baseY + rowOffset];
}

function buildLegacyAss(project, options = {}) {
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
      const alternatingAccent = ["beast-highlight", "keyword-orbit", "lyric-wave", "gaming-stream", "sticker-bounce"].includes(normalized.effectId) && index % 2;
      const color = highlighted || alternatingAccent ? accent : primary;
      const outline = ["neon-pulse", "gaming-stream", "outline-trace"].includes(normalized.effectId)
        ? 4.6
        : ["beast-highlight", "punch-zoom", "question-pop", "sticker-bounce"].includes(normalized.effectId)
          ? 3
          : normalized.effectId === "minimal-subtitle"
            ? 2.4
            : 1.2;
      const blur = ["neon-pulse", "gaming-stream", "soft-ai-glass"].includes(normalized.effectId) ? "\\blur0.8" : "";
      const prefix = normalized.effectId === "podcast-lower-third" ? "• " : "";
      const tokenFontSize = ["scatter-assemble", "main-side-notes", "podcast-lower-third", "minimal-subtitle"].includes(normalized.effectId)
        ? Math.round(fontSize * 0.72)
        : ["beat-word-pop", "punch-zoom", "gaming-stream"].includes(normalized.effectId)
          ? Math.round(fontSize * 1.08)
          : fontSize;
      const tags = [
        "\\an5",
        `\\pos(${Math.round(x)},${Math.round(y)})`,
        `\\fn${font}`,
        `\\fs${tokenFontSize}`,
        `\\1c${color}`,
        `\\3c${assColor(["neon-pulse", "gaming-stream"].includes(normalized.effectId) ? effect.accent : "#111111")}`,
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

function assBackColor(value, opacity = 72, fallback = "#101216") {
  const match = String(value || fallback).match(/^#?([0-9a-f]{6})$/i);
  const hex = (match ? match[1] : fallback.replace("#", "")).toUpperCase();
  const alpha = Math.round(255 - safeNumber(opacity, 72, 0, 100) * 2.55)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `&H${alpha}${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`;
}

function escapeAssText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/[{}]/g, "")
    .replace(/\r?\n/g, "\\N");
}

function wrapSubtitleText(value, maxChars = 14, maxLines = 2) {
  const source = normalizeText(value);
  if (!source || source.length <= maxChars || maxLines <= 1) return source;
  const chars = [...source];
  const lines = [];
  let cursor = 0;
  while (cursor < chars.length && lines.length < maxLines) {
    const remaining = chars.length - cursor;
    if (lines.length === maxLines - 1 || remaining <= maxChars) {
      lines.push(chars.slice(cursor).join(""));
      break;
    }
    const ideal = Math.min(chars.length, cursor + maxChars);
    let split = ideal;
    for (let index = ideal; index > Math.max(cursor + Math.floor(maxChars * 0.62), cursor); index -= 1) {
      if (/[，。！？；：、,.!?;:\s]/u.test(chars[index - 1] || "")) {
        split = index;
        break;
      }
    }
    lines.push(chars.slice(cursor, split).join("").trim());
    cursor = split;
  }
  return lines.filter(Boolean).join("\\N");
}

function fallbackTimedWords(segment) {
  const source = normalizeText(segment.text);
  const tokens = source.includes(" ")
    ? source.split(/\s+/).filter(Boolean)
    : source.match(/[A-Za-z0-9%]+|[\u4e00-\u9fff]|[^\s]/g) || [];
  if (!tokens.length) return [];
  const duration = Math.max(0.12, segment.end - segment.start);
  const weights = tokens.map((token) => Math.max(1, [...token].length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let cursor = segment.start;
  return tokens.map((text, index) => {
    const end = index === tokens.length - 1
      ? segment.end
      : cursor + duration * (weights[index] / totalWeight);
    const word = { index: index + 1, text, start: cursor, end: Math.max(cursor + 0.04, end), estimated: true };
    cursor = word.end;
    return word;
  });
}

function timedWordsForSegment(segment) {
  const words = normalizeWordRows(segment.words).filter((word) => word.end > segment.start && word.start < segment.end);
  return words.length ? words : fallbackTimedWords(segment);
}

function joinTimedWords(words, sourceText = "") {
  const separator = String(sourceText || "").includes(" ") ? " " : "";
  return words.map((word) => word.text).join(separator).trim();
}

function groupTimedWords(words, sourceText = "") {
  const groups = [];
  let current = [];
  let charCount = 0;
  for (const word of words) {
    if (/^[，。！？；：、,.!?;:]$/u.test(String(word.text || ""))) {
      if (current.length) current.push(word);
      else if (groups.length) groups[groups.length - 1].push(word);
      continue;
    }
    const size = Math.max(1, [...String(word.text || "")].length);
    const shouldFlush = current.length >= 5 || (current.length >= 2 && charCount + size > 8);
    if (shouldFlush) {
      groups.push(current);
      current = [];
      charCount = 0;
    }
    current.push(word);
    charCount += size;
  }
  if (current.length) groups.push(current);
  if (groups.length > 1 && groups[groups.length - 1].length === 1) {
    groups[groups.length - 2].push(...groups.pop());
  }
  return groups.map((group) => ({
    words: group,
    text: joinTimedWords(group, sourceText),
    start: group[0].start,
    end: group[group.length - 1].end,
  }));
}

function rollingFocusDisplayRows(segments = []) {
  return segments.flatMap((segment) => {
    const words = timedWordsForSegment(segment);
    if (!words.length) return [{ ...segment, sourceSegmentId: segment.id }];
    const clauses = [];
    let current = [];
    const flush = () => {
      if (current.length) clauses.push(current);
      current = [];
    };
    words.forEach((word, index) => {
      const token = String(word.text || "");
      const punctuation = /^[，。！？；：、,.!?;:]$/u.test(token);
      if (punctuation) {
        if (current.length) {
          current.push(word);
          flush();
        } else if (clauses.length) {
          clauses[clauses.length - 1].push(word);
        }
        return;
      }
      const previous = current[current.length - 1];
      const pauseBefore = previous && Number(word.start) - Number(previous.end) >= 0.18;
      if (pauseBefore) flush();
      current.push(word);
      const next = words[index + 1];
      const pauseAfter = next && Number(next.start) - Number(word.end) >= 0.18;
      if (pauseAfter) flush();
    });
    flush();

    const visibleLength = (group) => group.reduce((sum, word) => (
      sum + [...String(word.text || "").replace(/[，。！？；：、,.!?;:\s]/gu, "")].length
    ), 0);
    const groups = clauses.flatMap((clause) => {
      const total = visibleLength(clause);
      if (total <= 8) return [clause];
      const chunkCount = Math.ceil(total / 8);
      const target = Math.ceil(total / chunkCount);
      const chunks = [];
      let chunk = [];
      let count = 0;
      clause.forEach((word) => {
        const token = String(word.text || "");
        const size = [...token.replace(/[，。！？；：、,.!?;:\s]/gu, "")].length;
        if (size === 0) {
          if (chunk.length) chunk.push(word);
          else if (chunks.length) chunks[chunks.length - 1].push(word);
          return;
        }
        if (chunk.length && count >= 3 && count + size > target) {
          chunks.push(chunk);
          chunk = [];
          count = 0;
        }
        chunk.push(word);
        count += size;
      });
      if (chunk.length) chunks.push(chunk);
      return chunks;
    });

    return groups.map((group, index) => ({
      ...segment,
      id: `${segment.id}-focus-${index + 1}`,
      sourceSegmentId: segment.id,
      text: joinTimedWords(group, segment.text).replace(/[，。！？；：、,.!?;:]/gu, "").trim(),
      start: Math.max(segment.start, group[0].start),
      end: Math.min(segment.end, Math.max(group[0].start + 0.1, group[group.length - 1].end)),
      words: group,
    })).filter((row) => row.text);
  }).sort((a, b) => a.start - b.start);
}

function keywordMatch(value, keywords = []) {
  const token = String(value || "").replace(/\s/g, "");
  return keywords.some((keyword) => {
    const clean = String(keyword || "").replace(/\s/g, "");
    return clean && (token.includes(clean) || clean.includes(token));
  });
}

const KEYWORD_EMPHASIS_PALETTE = Object.freeze([
  { style: "KeywordBoxGold", color: "#FFD84D" },
  { style: "KeywordBoxCyan", color: "#69E7FF" },
  { style: "KeywordBoxLime", color: "#B7FF5A" },
  { style: "KeywordBoxViolet", color: "#C59CFF" },
]);
const KEYWORD_EMPHASIS_MODES = Object.freeze(["color", "scale", "box", "underline"]);

function stableKeywordHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function keywordEmphasisSpec(seed, keyword) {
  const hash = stableKeywordHash(`${seed}:${keyword}`);
  return {
    mode: KEYWORD_EMPHASIS_MODES[hash % KEYWORD_EMPHASIS_MODES.length],
    palette: KEYWORD_EMPHASIS_PALETTE[(hash >>> 8) % KEYWORD_EMPHASIS_PALETTE.length],
  };
}

function keywordStyledText(value, keywords, primary, options = {}) {
  const source = String(value || "");
  const ordered = [...new Set((keywords || []).map(String).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!ordered.length) return escapeAssText(source);
  const pattern = new RegExp(`(${ordered.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const font = String(options.font || DEFAULT_FONT).replace(/,/g, " ");
  const fontSize = Math.round(safeNumber(options.fontSize, 82, 24, 240));
  const outline = options.outline || assColor("#101216");
  const baseOutline = safeNumber(options.baseOutline, 0, 0, 12);
  const reset = `\\fn${font}\\fs${fontSize}\\1c${primary}\\3c${outline}\\bord${baseOutline}\\b1\\u0\\fscx100\\fscy100`;
  return source.split(pattern).map((part) => {
    if (!ordered.includes(part)) return escapeAssText(part);
    const { mode, palette } = keywordEmphasisSpec(options.seed || "", part);
    const color = assColor(palette.color);
    if (mode === "scale") {
      return `{\\1c${color}\\b1\\fscx116\\fscy116}${escapeAssText(part)}{${reset}}`;
    }
    if (mode === "box") {
      return `{\\r${palette.style}\\fn${font}\\fs${fontSize}}${escapeAssText(part)}{${reset}}`;
    }
    if (mode === "underline") {
      return `{\\1c${color}\\b1\\u1}${escapeAssText(part)}{${reset}}`;
    }
    return `{\\1c${color}\\b1}${escapeAssText(part)}{${reset}}`;
  }).join("");
}

function karaokeText(words, sourceText, mode = "k") {
  const separator = String(sourceText || "").includes(" ") ? " " : "";
  return words.map((word, index) => {
    const centiseconds = Math.max(1, Math.round((word.end - word.start) * 100));
    const suffix = index < words.length - 1 ? separator : "";
    return `{\\${mode}${centiseconds}}${escapeAssText(word.text + suffix)}`;
  }).join("");
}

function assEvent(layer, start, end, style, tags, text) {
  return `Dialogue: ${layer},${formatAssTime(start)},${formatAssTime(end)},${style},,0,0,0,,{${tags}}${text}`;
}

function buildBookendAssEvents({ project, template, params, width, height, fontSize, primary, maxChars, maxLines }) {
  const events = [];
  const x = Math.round((safeNumber(params.x, 50, 5, 95) / 100) * width);
  const y = Math.round((safeNumber(params.y, 64, 8, 92) / 100) * height);
  for (const kind of ["intro", "outro"]) {
    const item = project.bookends?.[kind];
    const window = project.bookendWindows?.[kind];
    if (!item?.enabled || !window?.available || !item.text) continue;
    const start = Number(window.start || 0);
    const end = Number(window.end || 0);
    const durationMs = Math.max(1, Math.round((end - start) * 1000));
    if (durationMs < BOOKEND_MIN_SECONDS * 1000) continue;
    const baseTransitionMs = template.renderMode === "rolling-focus-left"
      ? safeNumber(params.transitionMs, 220, 180, 260)
      : 150;
    const transitionMs = Math.max(90, Math.min(Math.round(baseTransitionMs / safeNumber(params.animationSpeed, 1, 0.5, 2)), Math.round(durationMs / 3)));
    const fadeMs = Math.max(70, Math.min(150, Math.round(durationMs / 4)));
    const text = escapeAssText(wrapSubtitleText(item.text, maxChars, Math.max(2, maxLines)));
    if (template.renderMode === "rolling-focus-left") {
      const markerGap = Math.round(fontSize * 0.62);
      const moveY = y + Math.round(fontSize * 0.18);
      events.push(assEvent(6, start, end, "Modern", `\\an4\\bord0\\shad0\\q2\\move(${x + markerGap},${moveY},${x + markerGap},${y},0,${transitionMs})\\fs${fontSize}\\b1\\1c${primary}\\fad(${fadeMs},${fadeMs})`, text));
      const markerStart = Math.min(end - 0.04, start + transitionMs / 1000);
      if (markerStart < end) {
        events.push(assEvent(7, markerStart, end, "Modern", `\\an4\\bord0\\shad0\\pos(${x},${y})\\fs${Math.round(fontSize * 0.72)}\\1c${primary}\\fad(40,${fadeMs})`, "▶"));
      }
    } else {
      const moveY = y + Math.round(fontSize * 0.18);
      events.push(assEvent(6, start, end, "Modern", `\\an5\\move(${x},${moveY},${x},${y},0,${transitionMs})\\fs${fontSize}\\1c${primary}\\fad(${fadeMs},${fadeMs})`, `▶  ${text}`));
    }
  }
  return events;
}

export function buildAss(project, options = {}) {
  const normalized = normalizeProject(project);
  const template = effectById(normalized.effectId);
  const params = { ...template.defaultParams, ...normalized.effectParams };
  const { width, height } = resolutionForProject(normalized);
  const landscapeScale = width > height ? 1.12 : 1;
  const fontSize = Math.round(safeNumber(params.fontSize, 82, 34, 180) * landscapeScale);
  const font = String(params.fontFamily || DEFAULT_FONT).replace(/,/g, " ");
  const primary = assColor(params.primaryColor || template.primary);
  const accent = assColor(params.accentColor || template.accent);
  const muted = assColor(template.muted || "#8B94A3");
  const outline = assColor("#101216");
  const cardBack = assBackColor(params.backgroundColor || "#101216", params.backgroundOpacity, "#101216");
  const outlineWidth = params.outlineEnabled === false ? 0 : Math.max(1.2, Math.round(fontSize * 0.034 * 10) / 10);
  const shadow = params.shadowEnabled === false ? 0 : Math.max(1, Math.round(fontSize * 0.02));
  const offset = safeNumber(options.offset, 0);
  const limitToId = options.segmentId ? String(options.segmentId) : "";
  const maxChars = normalized.aspectRatio === "16:9" ? 24 : normalized.aspectRatio === "1:1" ? 16 : 13;
  const maxLines = Math.round(safeNumber(params.maxLines, 2, 1, 3));
  const events = [];
  const renderSegments = template.renderMode === "rolling-focus-left"
    ? rollingFocusDisplayRows(normalized.segments)
    : normalized.segments;

  renderSegments.forEach((segment, segmentIndex) => {
    if (limitToId && String(segment.sourceSegmentId || segment.id) !== limitToId) return;
    const start = Math.max(0, segment.start - offset);
    const end = Math.max(start + 0.1, segment.end - offset);
    const durationMs = Math.max(100, Math.round((end - start) * 1000));
    const overrides = segment.overrides || {};
    const x = Math.round((safeNumber(overrides.x ?? params.x, 50, 5, 95) / 100) * width);
    const y = Math.round((safeNumber(overrides.y ?? params.y, 64, 8, 92) / 100) * height);
    const keywords = [...new Set((segment.keywords || []).map(normalizeText).filter(Boolean))].slice(0, 3);
    const words = timedWordsForSegment(segment).map((word) => ({
      ...word,
      start: Math.max(start, word.start - offset),
      end: Math.min(end, Math.max(start + 0.01, word.end - offset)),
    })).filter((word) => word.end > word.start);
    const wrappedText = wrapSubtitleText(segment.text, maxChars, maxLines);
    const enterMs = Math.min(220, Math.max(90, Math.round(150 / safeNumber(params.animationSpeed, 1, 0.5, 2))));

    if (template.renderMode === "rolling-focus-left") {
      const leadSeconds = safeNumber(params.leadMs, 90, 0, 180) / 1000;
      const transitionMs = Math.round(safeNumber(params.transitionMs, 220, 180, 260) / safeNumber(params.animationSpeed, 1, 0.5, 2));
      const resetGap = safeNumber(params.resetGapMs, 1200, 500, 3000) / 1000;
      const contextRows = Math.round(safeNumber(params.contextRows, 5, 3, 5));
      const beforeRows = Math.floor((contextRows - 1) / 2);
      const afterRows = contextRows - beforeRows - 1;
      const previous = renderSegments[segmentIndex - 1];
      const reset = !previous || segment.start - previous.end > resetGap;
      const focusStart = Math.max(0, start - leadSeconds);
      const next = renderSegments[segmentIndex + 1];
      const nextFocusStart = next ? Math.max(0, next.start - offset - leadSeconds) : end;
      const focusEnd = Math.max(focusStart + 0.1, Math.min(end, nextFocusStart));
      const lineGap = Math.round(fontSize * 1.28);
      const smallSize = Math.round(fontSize * 0.54);
      const firstIndex = reset ? segmentIndex : Math.max(0, segmentIndex - beforeRows);
      const lastIndex = Math.min(renderSegments.length - 1, segmentIndex + afterRows);
      for (let rowIndex = firstIndex; rowIndex <= lastIndex; rowIndex += 1) {
        const row = renderSegments[rowIndex];
        const delta = rowIndex - segmentIndex;
        const current = delta === 0;
        const wasCurrent = delta === -1 && !reset;
        const rowY = y + delta * lineGap;
        const moveStartY = reset ? rowY : rowY + lineGap;
        const markerGap = Math.round(fontSize * 0.62);
        const moveStartX = current && !reset ? x : wasCurrent ? x + markerGap : current ? x + markerGap : x;
        const moveEndX = current ? x + markerGap : x;
        const distanceAlpha = Math.min(0x72, 0x30 + Math.max(0, Math.abs(delta) - 1) * 0x20).toString(16).padStart(2, "0").toUpperCase();
        let tags = `\\an4\\bord0\\shad0\\q2\\move(${moveStartX},${moveStartY},${moveEndX},${rowY},0,${transitionMs})`;
        if (current && !reset) {
          tags += `\\fs${smallSize}\\b0\\1c${muted}\\alpha&H55&\\t(0,${transitionMs},\\fs${fontSize}\\b1\\1c${primary}\\alpha&H00&)`;
        } else if (current) {
          tags += `\\fs${fontSize}\\b1\\1c${primary}\\alpha&H00&\\fad(90,0)`;
        } else if (wasCurrent) {
          tags += `\\fs${fontSize}\\b1\\1c${primary}\\alpha&H00&\\t(0,${transitionMs},\\fs${smallSize}\\b0\\1c${muted}\\alpha&H${distanceAlpha}&)`;
        } else {
          tags += `\\fs${smallSize}\\b0\\1c${muted}\\alpha&H${distanceAlpha}&`;
        }
        const rowText = current
          ? keywordStyledText(row.text, row.keywords, primary, {
            seed: row.sourceSegmentId || row.id,
            font,
            fontSize,
            outline,
            baseOutline: 0,
          })
          : escapeAssText(row.text);
        events.push(assEvent(current ? 4 : 2, focusStart, focusEnd, "Modern", tags, rowText));
        if (current) {
          const markerStart = reset ? focusStart : Math.min(focusEnd - 0.04, focusStart + transitionMs / 1000);
          if (markerStart < focusEnd) {
            events.push(assEvent(5, markerStart, focusEnd, "Modern", `\\an4\\bord0\\shad0\\pos(${x},${rowY})\\fs${Math.round(fontSize * 0.72)}\\1c${primary}\\fad(40,0)`, "▶"));
          }
        }
      }
    } else if (template.renderMode === "rolling-focus") {
      const lineGap = Math.round(fontSize * 1.32);
      const neighbors = [
        { row: renderSegments[segmentIndex - 1], delta: -1 },
        { row: segment, delta: 0 },
        { row: renderSegments[segmentIndex + 1], delta: 1 },
      ].filter((item) => item.row);
      neighbors.forEach(({ row, delta }) => {
        const current = delta === 0;
        const rowY = y + delta * lineGap;
        const rowSize = current ? fontSize : Math.round(fontSize * 0.64);
        const rowColor = current ? primary : muted;
        const alpha = current ? "" : "\\alpha&H55&";
        const marker = current ? "▶  " : "";
        const visibleText = wrapSubtitleText(row.text, maxChars, current ? 2 : 1);
        const text = current
          ? keywordStyledText(visibleText, row.keywords, primary, {
            seed: row.sourceSegmentId || row.id,
            font,
            fontSize: rowSize,
            outline,
            baseOutline: outlineWidth,
          })
          : escapeAssText(visibleText);
        events.push(assEvent(current ? 3 : 1, start, end, current ? "Modern" : "Muted", `\\an5\\move(${x},${rowY + Math.round(lineGap * 0.18)},${x},${rowY},0,${enterMs})\\fs${rowSize}\\1c${rowColor}${alpha}\\fad(${enterMs},90)`, `${marker}${text}`));
      });
    }

    if (normalized.showBottomSubtitles) {
      events.push(assEvent(5, start, end, "Bottom", `\\an2\\pos(${Math.round(width / 2)},${Math.round(height * 0.94)})\\fad(100,80)`, escapeAssText(wrappedText)));
    }
  });

  if (!limitToId && offset === 0) {
    events.push(...buildBookendAssEvents({
      project: normalized,
      template,
      params,
      width,
      height,
      fontSize,
      primary,
      maxChars,
      maxLines,
    }));
  }

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Modern,${font},${fontSize},${primary},${primary},${outline},&H00000000,-1,0,0,0,100,100,0,0,1,${outlineWidth},${shadow},5,70,70,70,1`,
    `Style: Muted,${font},${Math.round(fontSize * 0.64)},${muted},${muted},${outline},&H00000000,-1,0,0,0,100,100,0,0,1,1.2,0,5,70,70,70,1`,
    `Style: Bottom,${font},${Math.max(34, Math.round(fontSize * 0.48))},&H00FFFFFF,&H00FFFFFF,${outline},&H00000000,-1,0,0,0,100,100,0,0,1,2.4,0,2,80,80,48,1`,
    ...KEYWORD_EMPHASIS_PALETTE.map(({ style, color }) => `Style: ${style},${font},${fontSize},&H00101216,&H00101216,${assColor(color)},${assColor(color)},-1,0,0,0,100,100,0,0,3,4,0,5,70,70,70,1`),
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
  getDownloadsDir,
  ffmpegPath,
  ffprobePath,
  modelRouter,
  onOutput = () => {},
}) {
  const rootDir = path.join(baseDir, ".data", "kinetic-text");
  const projectsDir = path.join(rootDir, "projects");
  const jobs = new Map();
  const timelineSkillRules = loadTimelineSkillRules(baseDir);
  fs.mkdirSync(projectsDir, { recursive: true });

  function activeDownloadsDir() {
    const configured = typeof getDownloadsDir === "function" ? getDownloadsDir() : downloadsDir;
    const resolved = path.resolve(String(configured || downloadsDir || path.join(baseDir, "downloads")));
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }

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
    if (tts.id && String(tts.alignment_status || "") !== "confirmed") {
      throw new Error("TTS 最终文案和字幕时间轴尚未确认，不能进入动态大字生产线。");
    }
    const audioPath = String(tts.audio_path || tts.audioPath || "");
    const scriptPath = String(tts.script_path || tts.scriptPath || "");
    const subtitlePath = String(tts.subtitle_path || tts.timed_subtitle_path || "");
    const timestampedTextPath = String(tts.timestamped_text_path || tts.timestampedTextPath || tts.timed_subtitle_path || "");
    const payloadTimeline = Array.isArray(tts.sentence_timeline) && tts.sentence_timeline.length
      ? tts.sentence_timeline
      : Array.isArray(tts.subtitle_timeline)
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
    const duration = safeNumber(tts.duration || tts.audio_duration || tts.metadata?.audio_duration, 0, 0) || await probeDuration(audioPath);
    const subtitleSource = String(
      tts.subtitle_source
      || tts.subtitleSource
      || tts.metadata?.subtitle_source
      || (hasTimedTimeline ? "estimated" : "estimated")
    );
    const effectId = normalizeEffectId(input.effectId);
    const finalText = String(tts.final_text || tts.text || input.text || "");
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
      text: finalText,
      originalText: String(tts.original_text || ""),
      recognizedText: String(tts.recognized_text || ""),
      wordTimeline: Array.isArray(tts.word_timeline) ? tts.word_timeline : [],
      sentenceTimeline: payloadTimeline,
      alignmentStatus: String(tts.alignment_status || ""),
      alignmentConfirmedAt: String(tts.alignment_confirmed_at || ""),
      duration,
      subtitleSource,
      segments: normalizeSegments(timeline, finalText, duration),
      effectId,
      effectParams: defaultEffectParams(effectId),
      aspectRatio: Object.hasOwn(OUTPUT_SIZES, input.aspectRatio) ? input.aspectRatio : "9:16",
      frameRate: Number(input.frameRate) === 60 ? 60 : 30,
      showBottomSubtitles: false,
      bookends: input.bookends && typeof input.bookends === "object" ? input.bookends : {},
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
      bookends: {
        intro: { ...current.bookends?.intro, ...(changes.bookends?.intro || {}) },
        outro: { ...current.bookends?.outro, ...(changes.bookends?.outro || {}) },
      },
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

  async function analyze(projectId, providerId = "", options = {}) {
    const project = get(projectId);
    if (!project) throw new Error("动态大字项目不存在。");
    const keywordsOnly = options.keywordsOnly === true;
    let analyzed = null;
    let usedProvider = "local";
    const available = typeof modelRouter?.listProviders === "function" ? modelRouter.listProviders().map((item) => item.id) : [];
    const candidates = [...new Set([providerId, "deepseek", "mimo"].filter((item) => item && available.includes(item)))];
    const systemPrompt = [
      "你负责中文动态大字字幕的重点词识别。只返回 JSON 数组。",
      keywordsOnly
        ? "每一项必须包含 id 和 keywords（每句 1-3 个、每个 2-6 字、必须是原句中连续出现的重点词）。"
        : "每一项必须包含 id、keywords（每句 1-3 个、每个 2-6 字、必须是原句中连续出现的重点词）和 lineBreaks（建议换行的字符索引数组）。",
      "关键词优先选择主题、动作、结果、数字、转折或结论；禁止整句当关键词，禁止互相包含或语义重复。",
      "不得改写字幕原文，不得改变字幕时间戳。",
      "必须遵守下面的项目 skill 规则：",
      timelineSkillRules,
    ].join("\n\n");
    for (const candidate of candidates) {
      try {
        const response = await modelRouter.generateWithProvider(candidate, [
          { role: "system", content: systemPrompt },
          { role: "system", content: keywordsOnly
            ? "只返回 JSON 数组，每项包含 id 和 keywords（1-3 个原句里的重点词）。不要解释。"
            : "只返回 JSON 数组，每项包含 id、keywords（1-3 个重点词）和 lineBreaks（建议换行的字符索引数组）。不要解释。" },
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
        keywords: normalizeSegmentKeywords(item?.keywords, segment.text),
        lineBreaks: keywordsOnly
          ? segment.lineBreaks
          : (Array.isArray(item?.lineBreaks) ? item.lineBreaks.map(Number).filter(Number.isFinite) : segment.lineBreaks),
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
    const { width, height } = resolutionForProject(project);
    const frameRate = frameRateForProject(project);
    const clipDuration = Math.max(0.2, segment.end - segment.start);
    const assPath = path.join(path.dirname(outputPath), `${safeFileName(segment.id)}.ass`);
    fs.writeFileSync(assPath, buildAss(project, { segmentId: segment.id, offset: segment.start }), "utf8");
    const vf = `format=rgba,subtitles='${escapeFilterPath(assPath)}',format=yuva420p`;
    await spawnLogged(ffmpegPath, [
      "-y", "-f", "lavfi", "-i", `color=c=black@0.0:s=${width}x${height}:r=${frameRate}:d=${clipDuration.toFixed(3)}`,
      "-vf", vf, "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-r", String(frameRate), outputPath,
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
      if (!project.segments.length) throw new Error("没有可渲染的字幕片段。");
      updateJob(jobId, { status: "running", progress: 8, stage: "准备最新字幕" });
      const renderAssetsDir = path.join(projectDir(projectId), "render");
      const assPath = path.join(renderAssetsDir, "effects.ass");
      const srtPath = path.join(renderAssetsDir, "subtitles.srt");
      fs.mkdirSync(renderAssetsDir, { recursive: true });
      fs.writeFileSync(assPath, buildAss(project), "utf8");
      fs.writeFileSync(srtPath, buildSrt(project), "utf8");
      project = update(projectId, { outputs: { assPath, srtPath } });
      const hasTtsAudio = Boolean(project.audioPath && fs.existsSync(project.audioPath));
      const { width, height } = resolutionForProject(project);
      const frameRate = frameRateForProject(project);
      const duration = Math.max(project.duration, hasTtsAudio ? await probeDuration(project.audioPath) : 0, 0.5);
      const outputDir = activeDownloadsDir();
      fs.mkdirSync(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `${safeFileName(project.title, project.id)}.mp4`);
      const args = ["-y"];
      const bg = project.background || { mode: "black" };
      if (bg.mode === "image" && bg.path && fs.existsSync(bg.path)) args.push("-loop", "1", "-i", bg.path);
      else if (bg.mode === "video" && bg.path && fs.existsSync(bg.path)) args.push("-stream_loop", "-1", "-i", bg.path);
      else args.push("-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:r=${frameRate}:d=${duration.toFixed(3)}`);
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
      const videoFilter = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${frameRate},subtitles='${escapeFilterPath(assPath)}'[v]`;
      const ttsVolume = (project.audioMix.ttsVolume / 100).toFixed(3);
      const bgVolume = (project.audioMix.backgroundVolume / 100).toFixed(3);
      const filters = [videoFilter, `[1:a]volume=${ttsVolume}[tts]`];
      if (backgroundAudioIndex >= 0) {
        const fadeOut = Math.max(0, duration - 0.8).toFixed(3);
        filters.push(`[${backgroundAudioIndex}:a]volume=${bgVolume},afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOut}:d=0.8[bgm]`);
        filters.push("[tts][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]");
      }
      args.push("-filter_complex", filters.join(";"), "-map", "[v]", "-map", backgroundAudioIndex >= 0 ? "[a]" : "[tts]");
      args.push("-t", duration.toFixed(3), "-r", String(frameRate), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath);
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
