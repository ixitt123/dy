import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateSeoTitlePackage } from "../core/title-generator.js";
import { createTtsProvider } from "./providers/index.js";
import { redactSecrets } from "./provider-adapter.js";
import { alignTranscriptToAudio, buildScriptLockedAlignment, validateAlignment } from "./alignment.js";

const PROMPT_FILES = ["tts_script_prepare.md", "tts_emotion_prompt.md", "seo_title_generation.md"];
const ALIGNMENT_AUTO_APPROVE_RATIO = 0.8;
const ALIGNMENT_MAX_AUTO_RECOGNITION_ATTEMPTS = 3;
const ALIGNMENT_POLICY_VERSION = "audio_transcript_auto_confirm_v5";

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function cleanTtsText(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/[*_`>|]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(text) {
  const sentences = text
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const output = [];
  for (const sentence of sentences) {
    if (sentence.length <= 180) {
      output.push(sentence);
      continue;
    }
    let current = "";
    for (const part of sentence.split(/(?<=[，,、])/)) {
      if (current && current.length + part.length > 180) {
        output.push(current.trim());
        current = "";
      }
      current += part;
    }
    if (current.trim()) output.push(current.trim());
  }
  return output;
}

function prepareScript(text) {
  const cleaned = cleanTtsText(text);
  const segments = splitSentences(cleaned);
  return {
    text: segments.join("\n"),
    metadata: {
      original_characters: String(text || "").length,
      prepared_characters: segments.join("").length,
      segment_count: segments.length,
      prompts: PROMPT_FILES,
    },
  };
}

function ttsTitleMetadata(text = "", input = {}) {
  const existingTitle = String(input.title || input.seo_title || input.publish_title || "").trim();
  const titlePackage = generateSeoTitlePackage({
    transcriptText: text,
    videoType: input.video_type || input.videoType || input.source || "",
    fallbackTitle: existingTitle,
  });
  return {
    title: titlePackage.title,
    seo_title: titlePackage.seoTitle,
    publish_title: titlePackage.publishTitle,
    platform_titles: titlePackage.platformTitles,
    seo_keywords: titlePackage.seoKeywords,
    hashtags: titlePackage.hashtags,
    title_score: titlePackage.titleScore,
    title_source: titlePackage.source,
    title_prompt: titlePackage.prompt,
  };
}

function formatClock(seconds = 0, separator = ".") {
  const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${separator}${String(ms).padStart(3, "0")}`;
}

function parseClockTime(value) {
  const match = String(value || "").trim().match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const ms = Number(String(match[4] || "0").padEnd(3, "0").slice(0, 3));
  const total = hours * 3600 + minutes * 60 + seconds + ms / 1000;
  return Number.isFinite(total) && total >= 0 ? total : null;
}

function timestampNumber(value, key = "") {
  if (typeof value === "string" && value.includes(":")) {
    const clock = parseClockTime(value);
    if (clock !== null) return clock;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return /(?:^|[_-])ms$|milliseconds?|_ms$|Ms$/i.test(String(key || "")) || number > 1000
    ? number / 1000
    : number;
}

function pickTimestamp(item, keys = []) {
  for (const key of keys) {
    if (item?.[key] !== undefined) {
      const value = timestampNumber(item[key], key);
      if (value !== null) return value;
    }
  }
  return null;
}

function pickDurationEnd(item, start = 0) {
  for (const key of ["duration", "duration_ms", "durationMs", "length", "length_ms"]) {
    if (item?.[key] === undefined) continue;
    const value = timestampNumber(item[key], key);
    if (value !== null) return Math.max(start, start + value);
  }
  return null;
}

function subtitleText(item) {
  return String(
    item?.text
    || item?.word
    || item?.content
    || item?.subtitle
    || item?.caption
    || item?.value
    || ""
  ).trim();
}

function parseTimedSubtitleString(content = "") {
  const rows = [];
  const source = String(content || "").replace(/\r/g, "");
  const srtBlocks = source.split(/\n{2,}/);
  for (const block of srtBlocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex < 0) continue;
    const [startRaw, endRaw] = lines[timeLineIndex].split("-->").map((item) => item.trim());
    const start = parseClockTime(startRaw);
    const end = parseClockTime(endRaw);
    const text = lines.slice(timeLineIndex + 1).join("").trim();
    if (text && start !== null && end !== null && end > start) rows.push({ text, start, end });
  }
  if (rows.length) return rows;
  const pattern = /\[([^\]]+?)\s*-->\s*([^\]]+?)\]\s*([^\n]+)/g;
  let match;
  while ((match = pattern.exec(source))) {
    const start = parseClockTime(match[1]);
    const end = parseClockTime(match[2]);
    const text = String(match[3] || "").trim();
    if (text && start !== null && end !== null && end > start) rows.push({ text, start, end });
  }
  return rows;
}

function subtitleEntries(raw) {
  if (typeof raw === "string") {
    const parsed = safeJson(raw, null);
    return parsed !== null ? subtitleEntries(parsed) : parseTimedSubtitleString(raw);
  }
  const value = raw;
  const list = Array.isArray(value)
    ? value
    : [
        value?.subtitle_timeline,
        value?.subtitleTimeline,
        value?.subtitles,
        value?.subtitle,
        value?.words,
        value?.word_timestamps,
        value?.wordTimestamps,
        value?.sentences,
        value?.segments,
        value?.chunks,
        value?.items,
        value?.data?.subtitle,
        value?.data?.subtitles,
        value?.data?.words,
      ].find(Array.isArray) || [];
  return list
    .map((item) => {
      const text = subtitleText(item);
      const start = pickTimestamp(item, [
        "start",
        "start_time",
        "startTime",
        "start_ms",
        "startMs",
        "begin",
        "begin_time",
        "beginTime",
        "begin_ms",
        "beginMs",
        "time_begin",
        "offset",
        "offset_ms",
        "offsetStart",
        "offset_start",
        "offset_start_ms",
        "from",
      ]);
      const end = pickTimestamp(item, [
        "end",
        "end_time",
        "endTime",
        "end_ms",
        "endMs",
        "stop",
        "stop_time",
        "finish",
        "finish_time",
        "time_end",
        "duration_end",
        "offsetEnd",
        "offset_end",
        "offset_end_ms",
        "to",
      ]) ?? (start !== null ? pickDurationEnd(item, start) : null);
      return text && start !== null ? { text, start, end: end ?? start } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function appendTimedText(a = "", b = "") {
  if (!a) return b;
  if (!b) return a;
  return /[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? `${a} ${b}` : `${a}${b}`;
}

function collapseSubtitleEntries(entries = []) {
  const rows = [];
  let current = null;
  for (const entry of entries) {
    if (!current) {
      current = { start: entry.start, end: Math.max(entry.end, entry.start + 0.25), text: entry.text };
      continue;
    }
    current.text = appendTimedText(current.text, entry.text);
    current.end = Math.max(entry.end, current.end, current.start + 0.25);
    const duration = current.end - current.start;
    if (/[。！？!?；;]$/.test(current.text) || current.text.length >= 28 || duration >= 4) {
      rows.push(current);
      current = null;
    }
  }
  if (current) rows.push(current);
  return rows.map((row, index) => ({
    index: index + 1,
    start: Math.max(0, row.start),
    end: Math.max(row.start + 0.25, row.end),
    text: row.text.trim(),
  }));
}

function normalizeProviderTimeline(metadata = {}) {
  const directTimeline = subtitleEntries(metadata.subtitle_timeline || metadata.subtitleTimeline);
  if (directTimeline.length) {
    return directTimeline.map((row, index) => ({
      index: index + 1,
      start: Math.max(0, row.start),
      end: Math.max(row.start + 0.25, row.end),
      text: row.text.trim(),
    }));
  }
  const providerEntries = subtitleEntries(
    metadata.subtitles
      || metadata.subtitle
      || metadata.words
      || metadata.word_timestamps
      || metadata.wordTimestamps
      || metadata.sentences
      || metadata.segments
  );
  if (!providerEntries.length) return [];
  const looksSegmented = providerEntries.some((entry) => /[。！？!?；;]/.test(entry.text) || entry.text.length >= 4);
  if (looksSegmented) {
    return providerEntries.map((row, index) => ({
      index: index + 1,
      start: Math.max(0, row.start),
      end: Math.max(row.start + 0.25, row.end),
      text: row.text.trim(),
    }));
  }
  return collapseSubtitleEntries(providerEntries);
}

function estimatedSubtitleTimeline(text = "", duration = 0) {
  const segments = splitSentences(text).length ? splitSentences(text) : [String(text || "").trim()].filter(Boolean);
  if (!segments.length) return [];
  const totalChars = segments.reduce((sum, segment) => sum + Math.max(4, segment.length), 0);
  const totalDuration = Number(duration || 0) > 0
    ? Number(duration)
    : Math.max(2, Math.min(900, totalChars / 4.2));
  let cursor = 0;
  return segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    const weight = Math.max(4, segment.length) / totalChars;
    const span = isLast ? totalDuration - cursor : Math.max(0.8, totalDuration * weight);
    const start = cursor;
    const end = Math.min(totalDuration, cursor + span);
    cursor = end;
    return { index: index + 1, start, end: Math.max(start + 0.25, end), text: segment };
  });
}

function normalizeManualSentenceTimeline(raw = [], fallbackText = "", duration = 0) {
  const rows = subtitleEntries(raw);
  if (!rows.length) return estimatedSubtitleTimeline(fallbackText, duration);
  return rows.map((row, index) => {
    const start = Math.max(0, Number(row.start || 0));
    const end = Math.max(start + 0.25, Number(row.end || start + 0.25));
    return {
      ...row,
      id: String(row.id || `sentence-${index + 1}`),
      index: index + 1,
      start,
      end,
      text: String(row.text || "").trim(),
    };
  }).filter((row) => row.text).sort((a, b) => a.start - b.start);
}

function estimatedWordTimelineFromSentences(sentenceTimeline = []) {
  const words = [];
  for (const sentence of sentenceTimeline) {
    const tokens = [...String(sentence.text || "").replace(/\s+/g, "")];
    const duration = Math.max(0.05, Number(sentence.end || 0) - Number(sentence.start || 0));
    const step = duration / Math.max(1, tokens.length);
    tokens.forEach((token, index) => {
      const start = Number(sentence.start || 0) + step * index;
      words.push({
        text: token,
        start,
        end: Math.min(Number(sentence.end || start + step), start + step),
        estimated: true,
      });
    });
  }
  return words;
}

function resultDuration(result = {}) {
  return Number(result.duration || result.metadata?.duration || result.metadata?.audio_duration || 0)
    || (Number(result.metadata?.audio_length_ms || result.metadata?.duration_ms || result.metadata?.music_duration_ms || 0) / 1000)
    || Number(result.probedDuration || 0)
    || 0;
}

function writeTimedTextFiles({ directory, job, preparedText, result, fileBaseName, title = "" }) {
  const providerTimeline = normalizeProviderTimeline(result.metadata || {});
  const duration = resultDuration(result);
  const timeline = providerTimeline.length ? providerTimeline : estimatedSubtitleTimeline(preparedText, duration);
  if (!timeline.length) return {};
  fs.mkdirSync(directory, { recursive: true });
  const safeBaseName = String(fileBaseName || `tts-${job.id}`).replace(/[^a-z0-9_-]+/gi, "_") || `tts-${job.id}`;
  const scriptPath = path.join(directory, `${safeBaseName}.txt`);
  const srtPath = path.join(directory, `${safeBaseName}.srt`);
  const vttPath = path.join(directory, `${safeBaseName}.vtt`);
  const textPath = path.join(directory, `${safeBaseName}-timestamped.txt`);
  const timelineJsonPath = path.join(directory, `${safeBaseName}-timeline.json`);
  const srt = timeline.map((item, index) => [
    String(index + 1),
    `${formatClock(item.start, ",")} --> ${formatClock(item.end, ",")}`,
    item.text,
  ].join("\n")).join("\n\n") + "\n";
  const timestampedText = timeline
    .map((item) => `[${formatClock(item.start)} --> ${formatClock(item.end)}] ${item.text}`)
    .join("\n") + "\n";
  const vtt = `WEBVTT\n\n${timeline.map((item) => [
    `${formatClock(item.start)} --> ${formatClock(item.end)}`,
    item.text,
  ].join("\n")).join("\n\n")}\n`;
  const cleanTitle = String(title || "").trim();
  const titlePrefix = cleanTitle ? `标题：${cleanTitle}\n\n` : "";
  fs.writeFileSync(scriptPath, `${titlePrefix}${preparedText.trim()}\n`, "utf8");
  fs.writeFileSync(srtPath, srt, "utf8");
  fs.writeFileSync(vttPath, vtt, "utf8");
  fs.writeFileSync(textPath, `${titlePrefix}${timestampedText}`, "utf8");
  fs.writeFileSync(timelineJsonPath, `${JSON.stringify(timeline, null, 2)}\n`, "utf8");
  return {
    script_path: scriptPath,
    subtitle_path: srtPath,
    subtitle_vtt_path: vttPath,
    timestamped_text_path: textPath,
    timeline_json_path: timelineJsonPath,
    subtitle_timeline: timeline,
    subtitle_source: providerTimeline.length ? "provider" : (duration > 0 ? "estimated_audio_duration" : "estimated"),
    audio_duration: duration,
  };
}

function writeAlignedTextFiles({ directory, job, finalText, sentenceTimeline, wordTimeline, fileBaseName, title = "" }) {
  fs.mkdirSync(directory, { recursive: true });
  const safeBaseName = String(fileBaseName || `tts-${job.id}`).replace(/[^a-z0-9_-]+/gi, "_") || `tts-${job.id}`;
  const scriptPath = path.join(directory, `${safeBaseName}.txt`);
  const srtPath = path.join(directory, `${safeBaseName}.srt`);
  const vttPath = path.join(directory, `${safeBaseName}.vtt`);
  const textPath = path.join(directory, `${safeBaseName}-timestamped.txt`);
  const timelineJsonPath = path.join(directory, `${safeBaseName}-timeline.json`);
  const wordTimelinePath = path.join(directory, `${safeBaseName}-word-timeline.json`);
  const srt = sentenceTimeline.map((item, index) => [
    String(index + 1),
    `${formatClock(item.start, ",")} --> ${formatClock(item.end, ",")}`,
    item.text,
  ].join("\n")).join("\n\n") + "\n";
  const timestampedText = sentenceTimeline
    .map((item) => `[${formatClock(item.start)} --> ${formatClock(item.end)}] ${item.text}${item.estimated ? "【估算】" : ""}`)
    .join("\n") + "\n";
  const vtt = `WEBVTT\n\n${sentenceTimeline.map((item) => [
    `${formatClock(item.start)} --> ${formatClock(item.end)}`,
    item.text,
  ].join("\n")).join("\n\n")}\n`;
  const cleanTitle = String(title || "").trim();
  const titlePrefix = cleanTitle ? `标题：${cleanTitle}\n\n` : "";
  fs.writeFileSync(scriptPath, `${titlePrefix}${String(finalText || "").trim()}\n`, "utf8");
  fs.writeFileSync(srtPath, srt, "utf8");
  fs.writeFileSync(vttPath, vtt, "utf8");
  fs.writeFileSync(textPath, `${titlePrefix}${timestampedText}`, "utf8");
  fs.writeFileSync(timelineJsonPath, `${JSON.stringify(sentenceTimeline, null, 2)}\n`, "utf8");
  fs.writeFileSync(wordTimelinePath, `${JSON.stringify(wordTimeline, null, 2)}\n`, "utf8");
  return {
    script_path: scriptPath,
    subtitle_path: srtPath,
    subtitle_vtt_path: vttPath,
    timestamped_text_path: textPath,
    timeline_json_path: timelineJsonPath,
    word_timeline_path: wordTimelinePath,
  };
}

function ttsJobMetadata(job = {}) {
  return safeJson(job.metadata_json, {});
}

function ttsSequenceNumber(job = {}) {
  const metadata = ttsJobMetadata(job);
  const value = Number(metadata.sequence_number || metadata.display_number || metadata.slot_number || 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function ttsFileBaseName(sequenceNumber) {
  return `tts-${Number(sequenceNumber || 0) || 1}`;
}

function providerConfig(settings, providerId) {
  const tts = settings.tts || {};
  return tts[providerId] || {};
}

function resolveVoiceSelection(provider, config = {}, input = {}) {
  const requestedVoice = String(input.voice_id || config.default_voice || config.voice || "").trim();
  const requestedModel = String(input.model || config.default_model || config.model || "").trim();
  const presets = typeof provider?.listPresetVoices === "function" ? provider.listPresetVoices() : [];
  const selectedPreset = requestedVoice
    ? presets.find((voice) => voice.id === requestedVoice)
    : presets.find((voice) => requestedModel && voice.model === requestedModel) || presets[0] || null;
  const voiceId = requestedVoice || selectedPreset?.id || "";
  return {
    voiceId,
    voiceName: String(input.voice_name || selectedPreset?.name || "").trim(),
    model: String(input.model || selectedPreset?.model || "").trim(),
    usedFallback: !requestedVoice && Boolean(voiceId),
  };
}

function voicePreviewTone(voiceId = "") {
  const text = String(voiceId || "voice");
  let hash = 0;
  for (const char of text) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return 220 + (hash % 380);
}

function createVoicePreviewWav(voiceId = "") {
  const sampleRate = 16000;
  const duration = 0.7;
  const frames = Math.floor(sampleRate * duration);
  const dataSize = frames * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  const base = voicePreviewTone(voiceId);
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.max(0, Math.min(1, i / (sampleRate * 0.04), (frames - i) / (sampleRate * 0.05)));
    const value = Math.sin(2 * Math.PI * base * t) * 0.25
      + Math.sin(2 * Math.PI * (base * 1.5) * t) * 0.08;
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value * envelope)) * 32767), 44 + i * 2);
  }
  return buffer;
}

const CURATED_TTS_PROVIDER_IDS = new Set(["aliyun_bailian", "minimax"]);
const CURATED_REGULAR_LIMIT = 10;
const CURATED_SPECIAL_BUCKETS = new Set(["funny", "rap", "singing", "quirky", "special"]);

function presetVoiceText(voice = {}) {
  return [
    voice.id,
    voice.name,
    voice.category,
    voice.useCase,
    voice.description,
  ].filter(Boolean).join(" ");
}

function presetVoiceBucket(voice = {}) {
  const text = presetVoiceText(voice);
  if (/rap|hip.?hop|说唱/i.test(text)) return "rap";
  if (/sing|song|lyrical|jingle|唱歌|歌唱|歌曲|副歌|小调|音乐|抒情|类唱腔|类咏腔/i.test(text)) return "singing";
  if (/funny|humor|Humorous|搞笑|幽默|吐槽|反差|大爷|大婶|奶奶|热心/i.test(text)) return "funny";
  if (/quirky|cartoon|Cute|萌|搞怪|卡通|顽皮|调皮|童声|泡泡|小孩|萌兽|猪/i.test(text)) return "quirky";
  if (/special|robot|armor|arrogant|角色|特殊|机械|战甲|病娇|霸道|嚣张|剧情/i.test(text)) return "special";
  return "regular";
}

function curatedPresetVoices(providerId, voices = []) {
  if (!CURATED_TTS_PROVIDER_IDS.has(providerId)) return [];
  const regular = [];
  const special = [];
  for (const voice of voices) {
    const bucket = presetVoiceBucket(voice);
    if (CURATED_SPECIAL_BUCKETS.has(bucket)) special.push(voice);
    else regular.push(voice);
  }
  return [...regular.slice(0, CURATED_REGULAR_LIMIT), ...special];
}

export function createTtsService({
  baseDir,
  taskStore,
  getSettings,
  ffmpegPath,
  ffprobePath = "",
  transcribeFinalAudio = null,
  onJobCompleted = () => {},
}) {
  const outputDir = path.join(baseDir, ".data", "tts", "audio");
  const subtitleDir = path.join(baseDir, ".data", "tts", "subtitles");
  const promptsDir = path.join(baseDir, "prompts");
  const pending = [];
  const alignmentRunning = new Set();
  let working = false;

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(subtitleDir, { recursive: true });
  for (const file of PROMPT_FILES) {
    if (!fs.existsSync(path.join(promptsDir, file))) {
      throw new Error(`缺少 TTS Prompt：${file}`);
    }
  }

  function updateJobMetadata(jobId, changes = {}, jobChanges = {}) {
    const current = taskStore.getTtsJob(Number(jobId || 0));
    if (!current) return null;
    const metadata = safeJson(current.metadata_json, {});
    return taskStore.updateTtsJob(current.id, {
      ...jobChanges,
      metadata_json: JSON.stringify({ ...metadata, ...changes }),
    });
  }

  function setJobProgress(jobId, progress, stage, changes = {}, jobChanges = {}) {
    const value = Math.max(0, Math.min(100, Math.round(Number(progress || 0))));
    return updateJobMetadata(jobId, {
      ...changes,
      progress: value,
      stage: String(stage || ""),
      progress_updated_at: new Date().toISOString(),
    }, jobChanges);
  }

  function explicitMusicLyricsText(metadata = {}) {
    const candidates = [
      metadata.final_lyrics,
      metadata.generated_lyrics,
      metadata.provider_lyrics,
      metadata.music_lyrics,
      metadata.lyrics,
      metadata.formatted_lyrics,
    ];
    return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
  }

  function explicitLyricsText(metadata = {}) {
    return explicitMusicLyricsText(metadata) || String(metadata.subtitle_text || "").trim();
  }

  function isSingingAlignmentJob(job, metadata = safeJson(job?.metadata_json, {})) {
    const text = [
      metadata.source,
      metadata.asset_kind,
      metadata.provider_kind,
      metadata.model,
      metadata.voice_name,
      metadata.preset_label,
      metadata.preset_id,
      job?.voice_id,
      job?.voice_name,
      job?.emotion,
      job?.style_prompt,
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    return /music|song|sing|rap|lyric|melody|vocal|唱|歌|小调|说唱|旋律|歌曲|歌词|人声音乐/.test(text);
  }

  function preferredAlignmentText(job, metadata = safeJson(job?.metadata_json, {})) {
    const singingJob = isSingingAlignmentJob(job, metadata);
    const lyricText = singingJob ? explicitMusicLyricsText(metadata) : explicitLyricsText(metadata);
    if (lyricText) return lyricText;
    const finalText = String(metadata.final_text || "").trim();
    const recognizedText = String(metadata.recognized_text || "").trim();
    if (singingJob && recognizedText) return recognizedText;
    // Preserve an explicit manual correction. Older automatic alignments used
    // the ASR transcript as final copy, so fall back to the original TTS copy
    // when both values are identical.
    if (finalText && finalText !== recognizedText) return finalText;
    return String(
      metadata.original_text
      || job?.text
      || metadata.tts_prepared_text
      || finalText
      || recognizedText
      || "",
    ).trim();
  }

  function scriptLockedFallbackText({ job, metadata = {}, targetText = "", recognizedText = "" } = {}) {
    const singingJob = isSingingAlignmentJob(job, metadata);
    const lyricText = singingJob ? explicitMusicLyricsText(metadata) : explicitLyricsText(metadata);
    if (lyricText) return lyricText;
    const asrText = String(recognizedText || "").trim();
    if (singingJob && asrText) return asrText;
    return String(targetText || asrText || preferredAlignmentText(job, metadata) || "").trim();
  }

  function hasAlignmentPayload(job, metadata = safeJson(job?.metadata_json, {})) {
    const text = String(
      metadata.final_text
      || metadata.recognized_text
      || metadata.original_text
      || job?.text
      || "",
    ).trim();
    if (!text) return false;
    const hasTimeline = [metadata.word_timeline, metadata.sentence_timeline, metadata.subtitle_timeline]
      .some((timeline) => Array.isArray(timeline) && timeline.length > 0);
    const hasSubtitleFiles = [metadata.script_path, metadata.subtitle_path, metadata.timestamped_text_path]
      .some((filePath) => String(filePath || "").trim());
    return hasTimeline || hasSubtitleFiles;
  }

  function requiresAlignment(job, metadata = safeJson(job?.metadata_json, {})) {
    // Older generated records may be marked as not_required even though they
    // already contain narration text and subtitle artifacts. Keep those
    // records behind the same calibration gate as newly generated TTS jobs.
    if (hasAlignmentPayload(job, metadata)) return true;
    const source = String(metadata.source || "").toLowerCase();
    if (["voice_test", "generated_preview", "static_preview"].includes(source)) return false;
    const musicLike = isSingingAlignmentJob(job, metadata)
      || source === "minimax_music"
      || String(metadata.asset_kind || "").toLowerCase().includes("music")
      || String(job?.voice_id || "").startsWith("music:")
      || String(job?.emotion || "").toLowerCase() === "music";
    if (musicLike) {
      const instrumental = metadata.instrumental === true || String(metadata.instrumental || "").toLowerCase() === "true";
      const lyricText = explicitLyricsText(metadata) || String(job?.text || metadata.original_text || "").trim();
      return !instrumental && Boolean(lyricText);
    }
    return true;
  }

  function ensureSequenceNumbers() {
    const rows = taskStore.listTtsJobs({ limit: 500 })
      .slice()
      .sort((a, b) => {
        const left = Date.parse(a.created_at || "") || Number(a.id || 0);
        const right = Date.parse(b.created_at || "") || Number(b.id || 0);
        return left === right ? Number(a.id || 0) - Number(b.id || 0) : left - right;
      });
    const used = new Set();
    for (const row of rows) {
      const metadata = ttsJobMetadata(row);
      let sequenceNumber = ttsSequenceNumber(row);
      if (!sequenceNumber || used.has(sequenceNumber)) {
        sequenceNumber = 1;
        while (used.has(sequenceNumber)) sequenceNumber += 1;
      }
      used.add(sequenceNumber);
      const fileBaseName = String(metadata.file_base_name || "").trim() || ttsFileBaseName(sequenceNumber);
      if (Number(metadata.sequence_number || 0) !== sequenceNumber || metadata.file_base_name !== fileBaseName) {
        taskStore.updateTtsJob(row.id, {
          metadata_json: JSON.stringify({
            ...metadata,
            sequence_number: sequenceNumber,
            file_base_name: fileBaseName,
          }),
        });
      }
    }
  }

  function nextSequenceNumber() {
    ensureSequenceNumbers();
    const used = new Set(taskStore.listTtsJobs({ limit: 500 }).map(ttsSequenceNumber).filter(Boolean));
    let sequenceNumber = 1;
    while (used.has(sequenceNumber)) sequenceNumber += 1;
    return sequenceNumber;
  }

  function getProvider(providerId) {
    const settings = getSettings();
    return createTtsProvider(providerId, {
      config: providerConfig(settings, providerId),
      ffmpegPath,
    });
  }

  function probeAudioDurationSync(filePath = "") {
    const target = path.resolve(String(filePath || ""));
    if (!ffprobePath || !fs.existsSync(ffprobePath) || !target || !fs.existsSync(target)) return 0;
    const result = spawnSync(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      target,
    ], { encoding: "utf8", windowsHide: true });
    if (result.error || result.status !== 0) return 0;
    const duration = Number(String(result.stdout || "").trim());
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }

  function visibleError(job, metadata = safeJson(job?.metadata_json, {})) {
    const error = String(job?.error || "").trim();
    const detail = String(metadata.provider_detail || metadata.error_detail || "").trim();
    if (job?.status !== "failed") return error;
    if (error && detail && !error.includes(detail)) return `${error} 详情：${detail}`;
    return error || detail || "语音生成失败。";
  }

  function publicJob(job) {
    if (!job) return null;
    const rawMetadata = safeJson(job.metadata_json, {});
    const fallbackTitleMetadata = rawMetadata.title || rawMetadata.seo_title || rawMetadata.publish_title
      ? {}
      : ttsTitleMetadata(job.text, rawMetadata);
    const metadata = { ...fallbackTitleMetadata, ...rawMetadata };
    const platformTitles = metadata.platform_titles || metadata.platformTitles || {};
    const seoKeywords = Array.isArray(metadata.seo_keywords) ? metadata.seo_keywords : Array.isArray(metadata.seoKeywords) ? metadata.seoKeywords : [];
    const hashtags = Array.isArray(metadata.hashtags) ? metadata.hashtags : [];
    const title = String(metadata.title || metadata.seo_title || metadata.publish_title || platformTitles.douyin || "").trim();
    return {
      ...job,
      error: visibleError(job, metadata),
      title,
      seo_title: String(metadata.seo_title || title),
      publish_title: String(metadata.publish_title || title),
      platform_titles: platformTitles,
      seo_keywords: seoKeywords,
      hashtags,
      title_score: metadata.title_score || metadata.titleScore || {},
      model: String(metadata.model || metadata.target_model || ""),
      provider_kind: String(metadata.provider_kind || ""),
      audio_url: ["processing", "completed"].includes(job.status) && job.audio_path ? `/api/tts/audio?id=${job.id}` : "",
      script_url: job.status === "completed" && metadata.script_path ? `/api/tts/script?id=${job.id}` : "",
      subtitle_url: job.status === "completed" && metadata.subtitle_path ? `/api/tts/subtitle?id=${job.id}` : "",
      timestamped_text_url: job.status === "completed" && metadata.timestamped_text_path ? `/api/tts/timestamped-text?id=${job.id}` : "",
      sequence_number: ttsSequenceNumber(job),
      display_number: ttsSequenceNumber(job) || Number(job.id || 0),
      file_base_name: String(metadata.file_base_name || ""),
      script_path: String(metadata.script_path || ""),
      subtitle_path: String(metadata.subtitle_path || ""),
      subtitle_vtt_path: String(metadata.subtitle_vtt_path || ""),
      timestamped_text_path: String(metadata.timestamped_text_path || ""),
      timeline_json_path: String(metadata.timeline_json_path || ""),
      word_timeline_path: String(metadata.word_timeline_path || ""),
      word_timeline: Array.isArray(metadata.word_timeline) ? metadata.word_timeline : [],
      sentence_timeline: Array.isArray(metadata.sentence_timeline) ? metadata.sentence_timeline : [],
      subtitle_timeline: Array.isArray(metadata.sentence_timeline)
        ? metadata.sentence_timeline
        : Array.isArray(metadata.subtitle_timeline)
          ? metadata.subtitle_timeline
          : [],
      subtitle_source: String(metadata.subtitle_source || metadata.subtitleSource || ""),
      subtitleSource: String(metadata.subtitle_source || metadata.subtitleSource || ""),
      subtitle_correction_status: String(metadata.subtitle_correction_status || ""),
      subtitle_correction_provider: String(metadata.subtitle_correction_provider || ""),
      subtitle_correction_model: String(metadata.subtitle_correction_model || ""),
      subtitle_correction_changed_characters: Number(metadata.subtitle_correction_changed_characters || 0),
      subtitle_correction_at: String(metadata.subtitle_correction_at || ""),
      original_text: String(metadata.original_text || job.text || ""),
      tts_prepared_text: String(metadata.tts_prepared_text || metadata.prepared_text || job.text || ""),
      recognized_text: String(metadata.recognized_text || ""),
      final_text: String(metadata.final_text || metadata.recognized_text || ""),
      alignment_status: String(metadata.alignment_status || ""),
      alignment_confirmed: metadata.alignment_status === "confirmed",
      alignment_confirmed_at: String(metadata.alignment_confirmed_at || ""),
      alignment_error: String(metadata.alignment_error || ""),
      alignment_revision: Number(metadata.alignment_revision || 0),
      alignment_attempts: Number(metadata.alignment_attempts || 0),
      alignment_max_attempts: Number(metadata.alignment_max_attempts || 0),
      alignment_failure_action: String(metadata.alignment_failure_action || ""),
      alignment_confirmation_mode: String(metadata.alignment_confirmation_mode || ""),
      shared_sync_source: String(metadata.shared_sync_source || ""),
      alignment_fallback_reason: String(metadata.alignment_fallback_reason || ""),
      estimated_count: Number(metadata.estimated_count || 0),
      low_confidence_count: Number(metadata.low_confidence_count || 0),
      match_ratio: Number(metadata.match_ratio || 0),
      recognition_match_ratio: Number(metadata.recognition_match_ratio || metadata.alignment_best_asr_match_ratio || 0),
      progress: Math.max(0, Math.min(100, Number(metadata.progress || (job.status === "completed" ? 100 : 0)))),
      stage: String(metadata.stage || (job.status === "completed" ? "生成完成" : "")),
      duration: Number(metadata.audio_duration || metadata.duration || 0)
        || (Number(metadata.audio_length_ms || metadata.duration_ms || metadata.music_duration_ms || 0) / 1000)
        || 0,
      audio_duration: Number(metadata.audio_duration || 0),
      metadata,
    };
  }

  function validateRequest(input) {
    const settings = getSettings();
    const providerId = String(input.provider || settings.tts?.default_provider || "aliyun_bailian");
    const config = providerConfig(settings, providerId);
    if (!createTtsProvider(providerId, { config, ffmpegPath })) return "未知 TTS Provider。";
    if (!String(input.text || "").trim()) return "请输入需要生成语音的文案。";
    if (providerId === "aliyun_bailian" && !String(config.api_key || "").trim()) {
      return "请先在语音实验室保存阿里云百炼 API Key。";
    }
    if (providerId === "fish_audio") {
      if (!String(config.api_key || "").trim()) return "Fish Audio：未配置 API Key。";
      if (!String(config.model || "").trim()) return "Fish Audio：模型为空。";
      if (!String(input.voice_id || config.voice || config.reference_id || "").trim()) {
        return "Fish Audio：请填写 voice_id / reference_id。";
      }
    }
    if (providerId === "minimax") {
      if (!String(config.api_key || "").trim()) return "MiniMax：未配置 API Key。";
      if (!String(input.voice_id || config.voice || "").trim()) return "MiniMax：请选择预设音色或克隆音色。";
    }
    if (providerId === "custom_tts" && !String(config.base_url || "").trim()) {
      return "请先填写自定义 Provider 的 base_url。";
    }
    return "";
  }

  async function processAlignment(jobId, { finalText = "", reuseRecognition = false } = {}) {
    const numericId = Number(jobId || 0);
    const initial = taskStore.getTtsJob(numericId);
    if (!initial) return { error: "没有找到这条语音任务。" };
    if (!initial.audio_path || !fs.existsSync(initial.audio_path)) return { error: "最终音频文件不存在。" };
    if (alignmentRunning.has(numericId)) return { job: publicJob(initial), running: true };
    alignmentRunning.add(numericId);
    let currentProgress = 15;
    try {
      const initialMetadata = safeJson(initial.metadata_json, {});
      const audioDuration = probeAudioDurationSync(initial.audio_path)
        || Number(initialMetadata.audio_duration || initialMetadata.duration || 0)
        || 0;
      if (audioDuration <= 0) throw new Error("无法读取最终音频时长，不能生成同步字幕。");
      const maxAttempts = reuseRecognition ? 1 : ALIGNMENT_MAX_AUTO_RECOGNITION_ATTEMPTS;
      const targetText = String(finalText || preferredAlignmentText(initial, initialMetadata) || "").trim();
      setJobProgress(numericId, 10, "读取最终音频信息", {
        alignment_status: "processing",
        alignment_error: "",
        alignment_attempts: 0,
        alignment_max_attempts: maxAttempts,
        alignment_failure_action: "",
        audio_duration: audioDuration,
        original_text: initialMetadata.original_text || initial.text,
      }, { status: "processing", error: "" });

      let best = null;
      let attemptsMade = 0;
      let recognitionError = "";
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        attemptsMade = attempt;
        let recognizedText = reuseRecognition ? String(initialMetadata.recognized_text || "").trim() : "";
        let recognizedWords = reuseRecognition && Array.isArray(initialMetadata.recognized_word_timeline)
          ? initialMetadata.recognized_word_timeline
          : [];
        let recognizedSentences = reuseRecognition && Array.isArray(initialMetadata.recognized_sentence_timeline)
          ? initialMetadata.recognized_sentence_timeline
          : [];

        if (!recognizedText) {
          if (typeof transcribeFinalAudio !== "function") {
            recognitionError = "recognition_unavailable";
            break;
          }
          let lastMappedProgress = -1;
          let transcription = null;
          try {
            transcription = await transcribeFinalAudio(initial.audio_path, (progress = {}) => {
              const raw = Math.max(0, Math.min(100, Number(progress.percent || 0)));
              const mapped = Math.max(15, Math.min(40, Math.round(15 + raw * 0.25)));
              if (mapped === lastMappedProgress) return;
              lastMappedProgress = mapped;
              currentProgress = mapped;
              setJobProgress(numericId, mapped, progress.message || `第 ${attempt}/${maxAttempts} 次识别实际音频内容`, {
                alignment_status: "processing",
                alignment_attempts: attempt,
                alignment_max_attempts: maxAttempts,
              }, { status: "processing" });
            });
          } catch (error) {
            recognitionError = error instanceof Error ? error.message : String(error);
            continue;
          }
          recognizedText = String(typeof transcription === "string" ? transcription : transcription?.text || "").trim();
          recognizedWords = Array.isArray(transcription?.words) ? transcription.words : [];
          recognizedSentences = Array.isArray(transcription?.sentences) ? transcription.sentences : [];
        }
        if (!recognizedText) {
          recognitionError = "empty_recognition";
          continue;
        }

        currentProgress = 42;
        setJobProgress(numericId, 42, `第 ${attempt}/${maxAttempts} 次识别完成，正在强制对齐`, {
          alignment_status: "processing",
          alignment_attempts: attempt,
          alignment_max_attempts: maxAttempts,
          recognized_text: recognizedText,
          recognized_word_timeline: recognizedWords,
          recognized_sentence_timeline: recognizedSentences,
        }, { status: "processing" });
        const useRecognizedLyricsAsText = isSingingAlignmentJob(initial, initialMetadata) && !explicitMusicLyricsText(initialMetadata) && recognizedText;
        const alignmentText = useRecognizedLyricsAsText
          ? recognizedText
          : String(targetText || recognizedText).trim();
        const aligned = alignTranscriptToAudio({
          text: alignmentText,
          recognizedText,
          recognizedWords,
          recognizedSentences,
          duration: audioDuration,
        });
        const validation = validateAlignment({
          text: aligned.finalText,
          wordTimeline: aligned.wordTimeline,
          sentenceTimeline: aligned.sentenceTimeline,
          duration: audioDuration,
        });
        if (!validation.valid) throw new Error(`字幕时间轴检查失败：${validation.errors.join("；")}`);
        const referenceAligned = useRecognizedLyricsAsText && targetText
          ? alignTranscriptToAudio({
              text: targetText,
              recognizedText,
              recognizedWords,
              recognizedSentences,
              duration: audioDuration,
            })
          : aligned;

        if (!best || aligned.matchRatio > best.aligned.matchRatio) {
          best = {
            attempt,
            recognizedText,
            recognizedWords,
            recognizedSentences,
            aligned,
            validation,
            recognitionMatchRatio: referenceAligned.matchRatio,
            singingAudioLyricsFallback: Boolean(useRecognizedLyricsAsText),
          };
        }

        currentProgress = 70;
        setJobProgress(numericId, 70, `第 ${attempt}/${maxAttempts} 次匹配率 ${(aligned.matchRatio * 100).toFixed(1)}%`, {
          alignment_status: "processing",
          alignment_attempts: attempt,
          alignment_max_attempts: maxAttempts,
          alignment_best_match_ratio: best.aligned.matchRatio,
          alignment_best_asr_match_ratio: best.recognitionMatchRatio,
          recognized_text: recognizedText,
          recognized_word_timeline: recognizedWords,
          recognized_sentence_timeline: recognizedSentences,
          word_timeline: aligned.wordTimeline,
          sentence_timeline: aligned.sentenceTimeline,
          subtitle_timeline: aligned.sentenceTimeline,
          estimated_count: aligned.estimatedCount,
          low_confidence_count: aligned.lowConfidenceCount,
          match_ratio: aligned.matchRatio,
          alignment_validation: validation,
        }, { status: "processing" });

        if (aligned.matchRatio >= ALIGNMENT_AUTO_APPROVE_RATIO || attempt >= maxAttempts) break;
        currentProgress = Math.min(88, 70 + attempt * 6);
        setJobProgress(numericId, currentProgress, `匹配率 ${(aligned.matchRatio * 100).toFixed(1)}%，低于 ${(ALIGNMENT_AUTO_APPROVE_RATIO * 100).toFixed(0)}%，自动重新识别 ${attempt + 1}/${maxAttempts}`, {
          alignment_status: "processing",
          alignment_attempts: attempt,
          alignment_max_attempts: maxAttempts,
          alignment_retry_reason: "low_match_ratio",
          alignment_best_match_ratio: best.aligned.matchRatio,
          alignment_best_asr_match_ratio: best.recognitionMatchRatio,
        }, { status: "processing" });
      }

      if (!best || best.recognitionMatchRatio < ALIGNMENT_AUTO_APPROVE_RATIO) {
        const latestForFallback = taskStore.getTtsJob(numericId) || initial;
        const latestMetadataForFallback = {
          ...initialMetadata,
          ...safeJson(latestForFallback?.metadata_json, {}),
        };
        const singingJob = isSingingAlignmentJob(latestForFallback, latestMetadataForFallback);
        const audioTranscriptFallback = String(best?.recognizedText || "").trim();
        if (!audioTranscriptFallback && singingJob && !explicitMusicLyricsText(latestMetadataForFallback)) {
          throw new Error("唱歌音频没有识别到实际歌词，不能生成可靠同步字幕。请检查语音识别配置或换文案重新生成。");
        }
        const fallbackText = audioTranscriptFallback || scriptLockedFallbackText({
          job: latestForFallback,
          metadata: latestMetadataForFallback,
          targetText,
          recognizedText: best?.recognizedText || "",
        });
        let fallbackAligned = audioTranscriptFallback
          ? alignTranscriptToAudio({
              text: fallbackText,
              recognizedText: best.recognizedText,
              recognizedWords: best.recognizedWords,
              recognizedSentences: best.recognizedSentences,
              duration: audioDuration,
            })
          : buildScriptLockedAlignment({
              text: fallbackText,
              duration: audioDuration,
            });
        if (audioTranscriptFallback && fallbackAligned.matchRatio < ALIGNMENT_AUTO_APPROVE_RATIO) {
          const sentenceAligned = alignTranscriptToAudio({
            text: fallbackText,
            recognizedText: best.recognizedText,
            recognizedWords: [],
            recognizedSentences: best.recognizedSentences,
            duration: audioDuration,
          });
          fallbackAligned = sentenceAligned.matchRatio >= ALIGNMENT_AUTO_APPROVE_RATIO
            ? sentenceAligned
            : {
                ...buildScriptLockedAlignment({ text: fallbackText, duration: audioDuration }),
                source: "audio_transcript_duration_fallback",
              };
        }
        const fallbackValidation = validateAlignment({
          text: fallbackAligned.finalText,
          wordTimeline: fallbackAligned.wordTimeline,
          sentenceTimeline: fallbackAligned.sentenceTimeline,
          duration: audioDuration,
        });
        if (!fallbackValidation.valid) throw new Error(`字幕时间轴检查失败：${fallbackValidation.errors.join("；")}`);
        const previousRecognitionRatio = best?.recognitionMatchRatio ?? 0;
        best = {
          attempt: best?.attempt || attemptsMade || 0,
          recognizedText: best?.recognizedText || "",
          recognizedWords: best?.recognizedWords || [],
          recognizedSentences: best?.recognizedSentences || [],
          aligned: fallbackAligned,
          validation: fallbackValidation,
          recognitionMatchRatio: previousRecognitionRatio,
          singingAudioLyricsFallback: Boolean(audioTranscriptFallback) && singingJob,
          audioTranscriptFallback: Boolean(audioTranscriptFallback) && !singingJob,
          scriptLockedFallback: !audioTranscriptFallback,
          fallbackReason: best
            ? (audioTranscriptFallback ? (singingJob ? "singing_audio_lyrics" : "audio_transcript_after_low_match") : "low_match_ratio")
            : (recognitionError || "recognition_unavailable"),
        };
        currentProgress = 76;
        setJobProgress(numericId, 76, best.singingAudioLyricsFallback
          ? "唱歌音频已按实际识别歌词生成同步字幕"
          : best.audioTranscriptFallback
            ? "字幕已按音频实际识别内容生成同步时间轴"
            : "字幕已按可用歌词/文案生成兜底时间轴", {
          alignment_status: "processing",
          alignment_attempts: attemptsMade,
          alignment_max_attempts: maxAttempts,
          alignment_retry_reason: best.fallbackReason,
          alignment_best_match_ratio: fallbackAligned.matchRatio,
          alignment_best_asr_match_ratio: previousRecognitionRatio,
          recognition_match_ratio: previousRecognitionRatio,
          final_text: fallbackAligned.finalText,
          word_timeline: fallbackAligned.wordTimeline,
          sentence_timeline: fallbackAligned.sentenceTimeline,
          subtitle_timeline: fallbackAligned.sentenceTimeline,
          subtitle_source: fallbackAligned.source,
          estimated_count: fallbackAligned.estimatedCount,
          low_confidence_count: fallbackAligned.lowConfidenceCount,
          match_ratio: fallbackAligned.matchRatio,
          alignment_validation: fallbackValidation,
        }, { status: "processing" });
      }
      const { attempt: bestAttempt, recognizedText, recognizedWords, recognizedSentences, aligned, validation } = best;
      currentProgress = 82;
      setJobProgress(numericId, 82, "逐句时间轴完成，正在生成 SRT", {
        sentence_timeline: aligned.sentenceTimeline,
        subtitle_timeline: aligned.sentenceTimeline,
      }, { status: "processing" });
      const latest = taskStore.getTtsJob(numericId);
      const latestMetadata = safeJson(latest?.metadata_json, {});
      const sequenceNumber = Number(latestMetadata.sequence_number || 0) || ttsSequenceNumber(latest) || numericId;
      const fileBaseName = String(latestMetadata.file_base_name || "").trim() || ttsFileBaseName(sequenceNumber);
      const files = writeAlignedTextFiles({
        directory: subtitleDir,
        job: latest,
        finalText: aligned.finalText,
        sentenceTimeline: aligned.sentenceTimeline,
        wordTimeline: aligned.wordTimeline,
        fileBaseName,
        title: latestMetadata.title || latestMetadata.seo_title || "",
      });

      currentProgress = 90;
      setJobProgress(numericId, 90, "正在检查字幕时间戳", files, { status: "processing" });
      currentProgress = 96;
      setJobProgress(numericId, 96, "字幕检查完成", {
        alignment_validation: validation,
      }, { status: "processing" });
      const revision = Number(latestMetadata.alignment_revision || 0) + 1;
      const autoApproved = aligned.matchRatio >= ALIGNMENT_AUTO_APPROVE_RATIO;
      const completedAt = new Date().toISOString();
      const completedAttempts = autoApproved ? (attemptsMade || bestAttempt) : attemptsMade;
      const recognitionMatchRatio = Number(best.recognitionMatchRatio ?? aligned.matchRatio ?? 0);
      const confirmationMode = best.singingAudioLyricsFallback
        ? "automatic_singing_audio_lyrics"
        : best.audioTranscriptFallback
          ? "automatic_audio_transcript_fallback"
          : best.scriptLockedFallback
            ? "automatic_script_locked_fallback"
            : "automatic_match_threshold";
      const completedMessage = best.singingAudioLyricsFallback
        ? "唱歌音频已按实际识别歌词同步，可以发送"
        : best.audioTranscriptFallback
          ? "字幕已按音频实际识别内容同步，可以发送"
          : best.scriptLockedFallback
            ? "字幕已按可用歌词/文案生成兜底时间轴，可以发送"
            : `字幕匹配率 ${(aligned.matchRatio * 100).toFixed(1)}%，可以发送`;
      const failedMessage = `已自动重新识别 ${completedAttempts}/${maxAttempts} 次，仍无法得到可用歌词时间轴。请换文案重新生成音频。`;
      const completed = setJobProgress(numericId, 100, autoApproved ? completedMessage : failedMessage, {
        ...files,
        original_text: initialMetadata.original_text || initial.text,
        tts_prepared_text: initialMetadata.tts_prepared_text || initialMetadata.prepared_text || initial.text,
        recognized_text: recognizedText,
        recognized_word_timeline: recognizedWords,
        recognized_sentence_timeline: recognizedSentences,
        final_text: aligned.finalText,
        word_timeline: aligned.wordTimeline,
        sentence_timeline: aligned.sentenceTimeline,
        subtitle_timeline: aligned.sentenceTimeline,
        subtitle_source: aligned.source,
        estimated_count: aligned.estimatedCount,
        low_confidence_count: aligned.lowConfidenceCount,
        match_ratio: aligned.matchRatio,
        recognition_match_ratio: recognitionMatchRatio,
        alignment_validation: validation,
        alignment_status: autoApproved ? "confirmed" : "failed",
        alignment_confirmed_at: autoApproved ? completedAt : "",
        alignment_confirmation_mode: autoApproved ? confirmationMode : "",
        alignment_auto_approve_ratio: ALIGNMENT_AUTO_APPROVE_RATIO,
        alignment_attempts: completedAttempts,
        alignment_max_attempts: maxAttempts,
        alignment_best_attempt: bestAttempt,
        alignment_best_match_ratio: aligned.matchRatio,
        alignment_best_asr_match_ratio: recognitionMatchRatio,
        alignment_fallback_reason: best.fallbackReason || "",
        alignment_policy_version: ALIGNMENT_POLICY_VERSION,
        alignment_failure_action: autoApproved ? "" : "rewrite_script_required",
        alignment_error: autoApproved ? "" : failedMessage,
        alignment_revision: revision,
        alignment_completed_at: completedAt,
        audio_duration: audioDuration,
      }, { status: "completed", error: "", completed_at: new Date().toISOString() });
      if (autoApproved) await Promise.resolve(onJobCompleted(completed));
      return { job: publicJob(completed) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = setJobProgress(numericId, currentProgress, "字幕校准失败", {
        alignment_status: "failed",
        alignment_error: message,
        alignment_failure_action: "rewrite_script_required",
      }, { status: "completed", error: "", completed_at: new Date().toISOString() });
      return { error: message, job: publicJob(failed) };
    } finally {
      alignmentRunning.delete(numericId);
    }
  }

  function retryAlignment(id) {
    const job = taskStore.getTtsJob(Number(id || 0));
    if (!job) return { error: "没有找到这条语音任务。" };
    if (!job.audio_path || !fs.existsSync(job.audio_path)) return { error: "最终音频文件不存在。" };
    if (alignmentRunning.has(job.id)) return { job: publicJob(job), running: true };
    processAlignment(job.id, { reuseRecognition: false }).catch(() => {});
    return { job: publicJob(taskStore.getTtsJob(job.id)) };
  }

  async function realignJob(id, text) {
    const job = taskStore.getTtsJob(Number(id || 0));
    if (!job) return { error: "没有找到这条语音任务。" };
    if (!String(text || "").trim()) return { error: "最终文案不能为空。" };
    return processAlignment(job.id, { finalText: String(text).trim(), reuseRecognition: true });
  }

  async function alignCorrectedText(id, text, input = {}) {
    const job = taskStore.getTtsJob(Number(id || 0));
    if (!job) return { error: "没有找到这条语音任务。" };
    if (job.status !== "completed") return { error: "只有已完成的 TTS 音频才能校正字幕。" };
    if (!job.audio_path || !fs.existsSync(job.audio_path)) return { error: "最终音频文件不存在。" };
    const correctedText = String(text || "").trim();
    if (!correctedText) return { error: "校正后的字幕文案不能为空。" };
    const metadata = safeJson(job.metadata_json, {});
    if (metadata.alignment_status !== "confirmed") return { error: "现有字幕尚未确认，不能执行发送前校正。" };
    const duration = probeAudioDurationSync(job.audio_path)
      || Number(metadata.audio_duration || metadata.duration || 0)
      || 0;
    if (duration <= 0) return { error: "无法读取最终音频时长。" };
    const recognizedText = String(metadata.recognized_text || metadata.final_text || job.text || "").trim();
    const recognizedWords = Array.isArray(metadata.recognized_word_timeline) && metadata.recognized_word_timeline.length
      ? metadata.recognized_word_timeline
      : Array.isArray(metadata.word_timeline)
        ? metadata.word_timeline
        : [];
    const recognizedSentences = Array.isArray(metadata.recognized_sentence_timeline) && metadata.recognized_sentence_timeline.length
      ? metadata.recognized_sentence_timeline
      : Array.isArray(metadata.sentence_timeline)
        ? metadata.sentence_timeline
        : [];
    if (!recognizedText) return { error: "缺少已识别的音频文字，无法微调时间戳。" };
    const aligned = alignTranscriptToAudio({
      text: correctedText,
      recognizedText,
      recognizedWords,
      recognizedSentences,
      duration,
    });
    const validation = validateAlignment({
      text: aligned.finalText,
      wordTimeline: aligned.wordTimeline,
      sentenceTimeline: aligned.sentenceTimeline,
      duration,
    });
    if (!validation.valid) return { error: `校正字幕时间轴检查失败：${validation.errors.join("；")}` };
    if (aligned.matchRatio < ALIGNMENT_AUTO_APPROVE_RATIO) {
      return { error: `校正文字与音频匹配率 ${(aligned.matchRatio * 100).toFixed(1)}%，低于 80%，已保留原字幕。` };
    }
    return syncConfirmedTimeline(job.id, {
      text: aligned.finalText,
      sentenceTimeline: aligned.sentenceTimeline,
      wordTimeline: aligned.wordTimeline,
      duration,
      source: String(input.source || "ai_corrected_before_handoff"),
      confirmationMode: "ai_corrected_before_handoff",
      correctionStatus: "corrected",
      correctionProvider: String(input.provider || ""),
      correctionModel: String(input.model || ""),
      correctionChangedCharacters: Number(input.changedCharacters || 0),
      correctionScore: Number(input.correctionScore || 0),
      lowConfidenceRows: Array.isArray(input.lowConfidenceRows) ? input.lowConfidenceRows : [],
      correctionAt: new Date().toISOString(),
      title: metadata.title || metadata.seo_title || "",
    });
  }

  async function syncSourceConstrainedRows(id, rows = [], input = {}) {
    const job = taskStore.getTtsJob(Number(id || 0));
    if (!job) return { error: "没有找到这条语音任务。" };
    if (job.status !== "completed") return { error: "只有已完成的歌唱音频才能修复字幕。" };
    if (!job.audio_path || !fs.existsSync(job.audio_path)) return { error: "最终音频文件不存在。" };
    const metadata = safeJson(job.metadata_json, {});
    if (metadata.alignment_status !== "confirmed") return { error: "现有字幕尚未确认，不能执行发送前修复。" };
    const storedTimeline = Array.isArray(metadata.sentence_timeline) && metadata.sentence_timeline.length
      ? metadata.sentence_timeline
      : Array.isArray(metadata.subtitle_timeline)
        ? metadata.subtitle_timeline
        : [];
    const currentTimeline = storedTimeline.map((row) => ({ ...row }));
    if (!currentTimeline.length) return { error: "缺少现有字幕时间轴。" };
    const preservedWordTimeline = Array.isArray(metadata.word_timeline)
      ? metadata.word_timeline.map((row) => ({ ...row }))
      : [];
    if (!preservedWordTimeline.length) return { error: "缺少现有逐字/逐词时间轴，不能在不重估时间的前提下修复文字。" };
    if (!Array.isArray(rows) || rows.length !== currentTimeline.length) {
      return { error: `修复结果必须保持 ${currentTimeline.length} 行字幕，当前为 ${Array.isArray(rows) ? rows.length : 0} 行。` };
    }
    const sentenceTimeline = currentTimeline.map((source, index) => ({
      ...source,
      text: String(rows[index]?.text || "").trim() || source.text,
    }));
    const duration = Number(metadata.audio_duration || metadata.duration || 0)
      || Number(sentenceTimeline.at(-1)?.end || 0)
      || probeAudioDurationSync(job.audio_path);
    return syncConfirmedTimeline(job.id, {
      text: sentenceTimeline.map((row) => row.text).join(""),
      sentenceTimeline,
      wordTimeline: preservedWordTimeline,
      preserveTimelineValues: true,
      duration,
      source: String(input.source || "source_constrained_music_asr_repair"),
      confirmationMode: "source_constrained_music_asr_repair",
      correctionStatus: input.partial ? "partially_corrected" : "corrected",
      correctionProvider: String(input.provider || ""),
      correctionModel: String(input.model || ""),
      correctionChangedCharacters: Number(input.changedCharacters || 0),
      correctionAt: new Date().toISOString(),
      title: metadata.title || metadata.seo_title || "",
    });
  }

  async function confirmAlignment(id) {
    const job = taskStore.getTtsJob(Number(id || 0));
    if (!job) return { error: "没有找到这条语音任务。" };
    const metadata = safeJson(job.metadata_json, {});
    if (job.status !== "completed" || metadata.alignment_status !== "review_required") {
      if (metadata.alignment_status === "confirmed") return { job: publicJob(job) };
      return { error: "字幕尚未完成校准，不能确认发送。" };
    }
    const validation = validateAlignment({
      text: metadata.final_text,
      wordTimeline: metadata.word_timeline,
      sentenceTimeline: metadata.sentence_timeline,
      duration: metadata.audio_duration,
    });
    if (!validation.valid) return { error: `字幕时间轴检查失败：${validation.errors.join("；")}` };
    const confirmed = setJobProgress(job.id, 100, "字幕已确认，可以发送", {
      alignment_status: "confirmed",
      alignment_confirmed_at: new Date().toISOString(),
      alignment_confirmation_mode: "manual_override",
      alignment_auto_approve_ratio: ALIGNMENT_AUTO_APPROVE_RATIO,
      alignment_policy_version: ALIGNMENT_POLICY_VERSION,
      alignment_validation: validation,
    }, { status: "completed", error: "" });
    await Promise.resolve(onJobCompleted(confirmed));
    return { job: publicJob(confirmed) };
  }

  async function syncConfirmedTimeline(id, input = {}) {
    const job = taskStore.getTtsJob(Number(id || 0));
    if (!job) return { error: "没有找到这条语音任务。" };
    if (job.status !== "completed") return { error: "只有已完成的 TTS 音频才能同步公共文案。" };
    if (!job.audio_path || !fs.existsSync(job.audio_path)) return { error: "最终音频文件不存在。" };
    const metadata = safeJson(job.metadata_json, {});
    const duration = Number(input.duration || metadata.audio_duration || metadata.duration || 0);
    const providedTimeline = input.sentenceTimeline || input.sentence_timeline || input.subtitleTimeline || input.subtitle_timeline || input.segments || [];
    let finalText = String(input.text || input.final_text || "").trim();
    let sentenceTimeline = input.preserveTimelineValues === true && Array.isArray(providedTimeline)
      ? providedTimeline.map((row) => ({ ...row }))
      : normalizeManualSentenceTimeline(providedTimeline, finalText, duration);
    if (!finalText) finalText = sentenceTimeline.map((row) => row.text).join("");
    if (!sentenceTimeline.length) sentenceTimeline = normalizeManualSentenceTimeline(metadata.sentence_timeline || metadata.subtitle_timeline || [], finalText, duration);
    const wordTimeline = Array.isArray(input.wordTimeline) && input.wordTimeline.length
      ? input.wordTimeline
      : Array.isArray(input.word_timeline) && input.word_timeline.length
        ? input.word_timeline
        : Array.isArray(metadata.word_timeline) && metadata.word_timeline.length
          ? metadata.word_timeline
          : estimatedWordTimelineFromSentences(sentenceTimeline);
    const validation = validateAlignment({
      text: finalText,
      wordTimeline,
      sentenceTimeline,
      duration,
    });
    if (!validation.valid) return { error: `字幕时间轴同步失败：${validation.errors.join("；")}` };
    const sequenceNumber = Number(metadata.sequence_number || 0) || ttsSequenceNumber(job) || Number(job.id || 0);
    const fileBaseName = String(metadata.file_base_name || "").trim() || ttsFileBaseName(sequenceNumber);
    const files = writeAlignedTextFiles({
      directory: subtitleDir,
      job,
      finalText,
      sentenceTimeline,
      wordTimeline,
      fileBaseName,
      title: String(input.title || metadata.title || metadata.seo_title || ""),
    });
    const syncedAt = new Date().toISOString();
    const synced = setJobProgress(job.id, 100, "公共文案和字幕时间轴已同步", {
      ...files,
      final_text: finalText,
      word_timeline: wordTimeline,
      sentence_timeline: sentenceTimeline,
      subtitle_timeline: sentenceTimeline,
      subtitle_source: String(input.source || "shared_manual_sync"),
      alignment_status: "confirmed",
      alignment_confirmed_at: metadata.alignment_confirmed_at || syncedAt,
      alignment_confirmation_mode: String(input.confirmationMode || "shared_manual_sync"),
      alignment_validation: validation,
      alignment_error: "",
      alignment_failure_action: "",
      alignment_revision: Number(metadata.alignment_revision || 0) + 1,
      shared_sync_updated_at: syncedAt,
      shared_sync_source: String(input.source || ""),
      subtitle_correction_status: String(input.correctionStatus || metadata.subtitle_correction_status || ""),
      subtitle_correction_provider: String(input.correctionProvider || metadata.subtitle_correction_provider || ""),
      subtitle_correction_model: String(input.correctionModel || metadata.subtitle_correction_model || ""),
      subtitle_correction_changed_characters: Number(input.correctionChangedCharacters || 0),
      subtitle_correction_score: Number(input.correctionScore || metadata.subtitle_correction_score || 0),
      subtitle_correction_low_confidence_rows_json: JSON.stringify(Array.isArray(input.lowConfidenceRows) ? input.lowConfidenceRows : []),
      subtitle_correction_at: String(input.correctionAt || metadata.subtitle_correction_at || ""),
    }, { status: "completed", error: "" });
    return { job: publicJob(synced) };
  }

  async function processJob(jobId) {
    const job = taskStore.getTtsJob(jobId);
    if (!job) return;
    const provider = getProvider(job.provider);
    if (!provider) {
      taskStore.updateTtsJob(job.id, {
        status: "failed",
        error: "未知 TTS Provider。",
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const prepared = prepareScript(job.text);
    const jobMetadata = safeJson(job.metadata_json, {});
    const titleMetadata = ttsTitleMetadata(prepared.text, jobMetadata);
    const sequenceNumber = Number(jobMetadata.sequence_number || 0) || ttsSequenceNumber(job) || Number(job.id || 0);
    const fileBaseName = String(jobMetadata.file_base_name || "").trim() || ttsFileBaseName(sequenceNumber);
    const outputPath = path.join(outputDir, `${fileBaseName}.${job.format === "wav" ? "wav" : "mp3"}`);
    setJobProgress(job.id, 5, "正在生成最终 TTS 音频", {
      original_text: job.text,
      tts_prepared_text: prepared.text,
      alignment_status: requiresAlignment(job, jobMetadata) ? "waiting" : "not_required",
      alignment_error: "",
    }, { status: "processing", error: "" });
    const result = await provider.generateSpeech({
      text: prepared.text,
      voiceId: job.voice_id,
      voiceType: "preset",
      emotion: job.emotion,
      stylePrompt: job.style_prompt,
      speed: job.speed,
      volume: job.volume,
      pitch: job.pitch,
      format: job.format,
      outputPath,
      model: jobMetadata.model || "",
    });

    if (!result.success) {
      const failureDetail = redactSecrets(result.detail || "", Object.values(provider.config || {}));
      const failureError = visibleError({
        status: "failed",
        error: redactSecrets(result.error || "语音生成失败。", Object.values(provider.config || {})),
      }, { provider_detail: failureDetail });
      taskStore.updateTtsJob(job.id, {
        status: "failed",
        error: failureError,
        metadata_json: JSON.stringify({
          ...jobMetadata,
          ...prepared.metadata,
          original_text: job.text,
          tts_prepared_text: prepared.text,
          progress: 5,
          stage: "TTS 音频生成失败",
          provider_detail: failureDetail,
        }),
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const resolvedAudioPath = result.audio_path || outputPath;
    const probedDuration = probeAudioDurationSync(resolvedAudioPath);
    const audioDuration = result.duration || probedDuration || resultDuration(result);
    const baseMetadata = {
      ...jobMetadata,
      ...prepared.metadata,
      ...(result.metadata || {}),
      ...titleMetadata,
      sequence_number: sequenceNumber,
      file_base_name: fileBaseName,
      original_text: job.text,
      tts_prepared_text: prepared.text,
      audio_duration: audioDuration,
    };
    if (requiresAlignment(job, baseMetadata)) {
      taskStore.updateTtsJob(job.id, {
        audio_path: resolvedAudioPath,
        status: "processing",
        error: "",
        metadata_json: JSON.stringify({
          ...baseMetadata,
          progress: 10,
          stage: "读取最终音频信息",
          alignment_status: "processing",
          alignment_error: "",
        }),
      });
      await processAlignment(job.id, { reuseRecognition: false });
      return;
    }

    const timedText = writeTimedTextFiles({
      directory: subtitleDir,
      job,
      preparedText: prepared.text,
      result: {
        ...result,
        duration: audioDuration,
        probedDuration,
        metadata: {
          ...(result.metadata || {}),
          audio_duration: audioDuration,
        },
      },
      fileBaseName,
      title: titleMetadata.title,
    });

    taskStore.updateTtsJob(job.id, {
      audio_path: resolvedAudioPath,
      status: "completed",
      error: "",
      metadata_json: JSON.stringify({
        ...baseMetadata,
        ...timedText,
        alignment_status: "not_required",
        progress: 100,
        stage: "生成完成",
      }),
      completed_at: new Date().toISOString(),
    });
    Promise.resolve(onJobCompleted(taskStore.getTtsJob(job.id))).catch(() => {});
  }

  async function drain() {
    if (working) return;
    working = true;
    try {
      while (pending.length) {
        const jobId = pending.shift();
        await processJob(jobId);
      }
    } finally {
      working = false;
    }
  }

  function enqueue(input) {
    const validationError = validateRequest(input);
    if (validationError) return { error: validationError };
    const settings = getSettings();
    const provider = String(input.provider || settings.tts?.default_provider || "aliyun_bailian");
    const providerAdapter = getProvider(provider);
    const voiceSelection = resolveVoiceSelection(providerAdapter, providerConfig(settings, provider), input);
    const sequenceNumber = nextSequenceNumber();
    const fileBaseName = ttsFileBaseName(sequenceNumber);
    const preparedForTitle = prepareScript(input.text);
    const titleMetadata = ttsTitleMetadata(preparedForTitle.text, {
      ...input,
      source: String(input.source || ""),
    });
    const job = taskStore.createTtsJob({
      task_id: input.task_id,
      rewrite_id: input.rewrite_id,
      provider,
      voice_id: voiceSelection.voiceId,
      voice_name: voiceSelection.voiceName,
      text: String(input.text || "").trim(),
      emotion: String(input.emotion || "自然"),
      style_prompt: String(input.style_prompt || ""),
      speed: Number(input.speed || settings.tts?.default_speed || 1),
      volume: Number(input.volume ?? 50),
      pitch: Number(input.pitch || 1),
      format: input.format === "wav" ? "wav" : "mp3",
      status: "waiting",
      metadata_json: JSON.stringify({
        queued: true,
        ...titleMetadata,
        sequence_number: sequenceNumber,
        file_base_name: fileBaseName,
        model: voiceSelection.model,
        voice_asset_id: Number(input.voice_asset_id || 0),
        project_id: String(input.project_id || input.projectId || ""),
        source: String(input.source || ""),
        selected_for_project: false,
        workflow_auto_director: input.workflow_auto_director !== false,
        default_voice_fallback: voiceSelection.usedFallback,
        original_text: String(input.text || "").trim(),
        progress: 0,
        stage: "等待处理",
        alignment_status: "waiting",
      }),
    });
    if (Number(input.voice_asset_id || 0) > 0) taskStore.recordVoiceUse(Number(input.voice_asset_id));
    pending.push(job.id);
    drain().catch(() => {});
    return { job: publicJob(job) };
  }

  function retryJob(id) {
    const source = taskStore.getTtsJob(Number(id || 0));
    if (!source) return { error: "没有找到这条语音任务。" };
    const metadata = safeJson(source.metadata_json, {});
    return enqueue({
      task_id: source.task_id,
      rewrite_id: source.rewrite_id,
      provider: source.provider,
      text: source.text,
      voice_id: source.voice_id,
      voice_name: source.voice_name,
      voice_asset_id: Number(metadata.voice_asset_id || 0),
      model: metadata.model || "",
      project_id: metadata.project_id || "",
      source: metadata.source || "",
      speed: source.speed,
      emotion: source.emotion,
      style_prompt: source.style_prompt,
      volume: source.volume,
      pitch: source.pitch,
      format: source.format,
    });
  }

  function listJobs(limit = 50) {
    ensureSequenceNumbers();
    return taskStore.listTtsJobs({ limit }).map(publicJob);
  }

  async function importGenerated(input = {}) {
    const sourceRaw = String(input.audio_path || "").trim();
    if (!sourceRaw) return { error: "Missing generated audio path." };
    const sourcePath = path.resolve(sourceRaw);
    const allowedRoots = [
      path.resolve(baseDir, "voices"),
      path.resolve(baseDir, "ui", "assets", "voice-previews"),
      path.resolve(outputDir),
    ];
    if (!allowedRoots.some((root) => sourcePath !== root && sourcePath.startsWith(`${root}${path.sep}`))) {
      return { error: "Generated audio path is not allowed." };
    }
    if (!fs.existsSync(sourcePath)) return { error: "Generated audio file does not exist." };
    const text = String(input.text || "").trim();
    if (!text) return { error: "Missing text for generated audio." };

    const sequenceNumber = nextSequenceNumber();
    const fileBaseName = ttsFileBaseName(sequenceNumber);
    const sourceExtension = path.extname(sourcePath).toLowerCase();
    const format = input.format === "wav" || sourceExtension === ".wav" ? "wav" : "mp3";
    const targetPath = path.join(outputDir, `${fileBaseName}.${format}`);
    if (path.resolve(sourcePath) !== path.resolve(targetPath)) fs.copyFileSync(sourcePath, targetPath);
    const inputMetadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    const probedDuration = probeAudioDurationSync(targetPath);
    const declaredDuration = Number(input.duration || inputMetadata.duration || 0)
      || (Number(inputMetadata.duration_ms || inputMetadata.music_duration_ms || inputMetadata.audio_length_ms || 0) / 1000)
      || 0;
    const audioDuration = probedDuration || declaredDuration;

    const prepared = prepareScript(text);
    const provider = String(input.provider || "minimax");
    const voiceAssetId = Number(input.voice_asset_id || 0);
    const titleMetadata = ttsTitleMetadata(prepared.text, {
      ...input,
      source: String(input.source || "generated_preview"),
    });
    const metadata = {
      imported_generated_audio: true,
      ...inputMetadata,
      ...titleMetadata,
      sequence_number: sequenceNumber,
      file_base_name: fileBaseName,
      model: String(input.model || ""),
      voice_asset_id: voiceAssetId,
      project_id: String(input.project_id || input.projectId || ""),
      source: String(input.source || "generated_preview"),
      asset_kind: String(input.asset_kind || ""),
      selected_for_project: false,
      workflow_auto_director: input.workflow_auto_director !== false,
      audio_duration: audioDuration,
      ...prepared.metadata,
      original_text: text,
      tts_prepared_text: prepared.text,
    };
    const job = taskStore.createTtsJob({
      task_id: input.task_id,
      rewrite_id: input.rewrite_id,
      provider,
      voice_id: String(input.voice_id || ""),
      voice_name: String(input.voice_name || input.voice_id || ""),
      text,
      emotion: String(input.emotion || "music"),
      style_prompt: String(input.style_prompt || ""),
      speed: Number(input.speed || 1),
      volume: Number(input.volume ?? 50),
      pitch: Number(input.pitch || 1),
      format,
      audio_path: targetPath,
      status: "completed",
      error: "",
      metadata_json: JSON.stringify(metadata),
      completed_at: new Date().toISOString(),
    });
    const timedText = writeTimedTextFiles({
      directory: subtitleDir,
      job,
      preparedText: prepared.text,
      result: {
        duration: audioDuration,
        probedDuration,
        metadata: {
          ...inputMetadata,
          audio_duration: audioDuration,
        },
      },
      fileBaseName,
      title: titleMetadata.title,
    });
    const imported = taskStore.updateTtsJob(job.id, {
      metadata_json: JSON.stringify({
        ...metadata,
        ...timedText,
        alignment_status: requiresAlignment(job, metadata) ? "waiting" : "not_required",
        progress: requiresAlignment(job, metadata) ? 10 : 100,
        stage: requiresAlignment(job, metadata) ? "读取最终音频信息" : "生成完成",
      }),
    });
    if (voiceAssetId > 0) taskStore.recordVoiceUse(voiceAssetId);
    if (requiresAlignment(imported, metadata)) {
      const alignmentResult = await processAlignment(job.id, { reuseRecognition: false });
      if (alignmentResult?.error) return { error: alignmentResult.error, job: getJob(job.id) };
      return { job: getJob(job.id) };
    }
    Promise.resolve(onJobCompleted(taskStore.getTtsJob(job.id))).catch(() => {});
    return { job: getJob(job.id) };
  }

  function listProjectJobs(projectId, limit = 100) {
    const cleanProjectId = String(projectId || "").trim();
    return listJobs(limit).filter((job) => String(job.metadata?.project_id || "") === cleanProjectId);
  }

  function selectProjectJob(projectId, jobId) {
    const cleanProjectId = String(projectId || "").trim();
    const targetId = Number(jobId || 0);
    if (!cleanProjectId) return { error: "缺少项目 ID。" };
    const target = taskStore.getTtsJob(targetId);
    if (!target || target.status !== "completed" || !target.audio_path || !fs.existsSync(target.audio_path)) {
      return { error: "只能选择已完成且音频文件存在的语音。" };
    }
    const targetMetadata = safeJson(target.metadata_json, {});
    if (requiresAlignment(target, targetMetadata) && targetMetadata.alignment_status !== "confirmed") {
      return { error: "请先在 TTS 页面完成字幕校准并确认，再发送到生产线。" };
    }
    if (String(targetMetadata.project_id || "") !== cleanProjectId) {
      return { error: "该音频不属于当前项目。" };
    }
    for (const job of taskStore.listTtsJobs({ limit: 500 })) {
      const metadata = safeJson(job.metadata_json, {});
      if (String(metadata.project_id || "") !== cleanProjectId) continue;
      const selected = Number(job.id) === targetId;
      if (Boolean(metadata.selected_for_project) === selected) continue;
      taskStore.updateTtsJob(job.id, {
        metadata_json: JSON.stringify({ ...metadata, selected_for_project: selected }),
      });
    }
    return { job: getJob(targetId) };
  }

  function getSelectedProjectJob(projectId) {
    return listProjectJobs(projectId, 500)
      .find((job) => job.status === "completed" && job.metadata?.selected_for_project) || null;
  }

  function getJob(id) {
    return publicJob(taskStore.getTtsJob(id));
  }

  function removeJob(id, { deleteFile = true } = {}) {
    const job = taskStore.getTtsJob(Number(id || 0));
    if (!job) return { deleted: 0, message: "语音记录不存在。" };
    if (["waiting", "processing"].includes(job.status)) {
      throw new Error("语音正在生成，完成或失败后才能删除。");
    }
    const metadata = safeJson(job.metadata_json, {});
    if (deleteFile && job.audio_path) {
      const root = path.resolve(outputDir);
      const target = path.resolve(job.audio_path);
      if (target !== root && target.startsWith(`${root}${path.sep}`) && fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
      }
    }
    if (deleteFile) {
      const root = path.resolve(subtitleDir);
      for (const filePath of [metadata.script_path, metadata.subtitle_path, metadata.subtitle_vtt_path, metadata.timestamped_text_path, metadata.timeline_json_path, metadata.word_timeline_path]) {
        const target = filePath ? path.resolve(filePath) : "";
        if (target && target !== root && target.startsWith(`${root}${path.sep}`) && fs.existsSync(target)) {
          fs.rmSync(target, { force: true });
        }
      }
    }
    return { deleted: taskStore.deleteTtsJobs([job.id]), id: job.id };
  }

  function clearJobs({ scope = "all", deleteFiles = true } = {}) {
    const candidates = taskStore.listTtsJobs({ limit: 500 }).filter((job) => {
      if (["waiting", "processing"].includes(job.status)) return false;
      return scope === "failed" ? job.status === "failed" : true;
    });
    let deleted = 0;
    for (const job of candidates) deleted += removeJob(job.id, { deleteFile: deleteFiles }).deleted;
    return { deleted, skipped: taskStore.listTtsJobs({ limit: 500 }).filter((job) => ["waiting", "processing"].includes(job.status)).length };
  }

  function repairEstimatedTimelines() {
    for (const job of taskStore.listTtsJobs({ limit: 500 })) {
      if (job.status !== "completed" || !job.audio_path || !fs.existsSync(job.audio_path)) continue;
      const metadata = ttsJobMetadata(job);
      const audioDuration = probeAudioDurationSync(job.audio_path)
        || Number(metadata.audio_duration || metadata.duration || 0)
        || (Number(metadata.audio_length_ms || metadata.duration_ms || metadata.music_duration_ms || 0) / 1000)
        || 0;
      if (audioDuration <= 0) continue;
      const timeline = Array.isArray(metadata.subtitle_timeline) ? metadata.subtitle_timeline : [];
      const lastEnd = Number(timeline.at(-1)?.end || 0);
      const source = String(metadata.subtitle_source || "");
      if (source === "provider" && Number(metadata.audio_duration || 0) > 0) continue;
      if (source !== "provider" && Math.abs(lastEnd - audioDuration) <= 0.35 && Number(metadata.audio_duration || 0) > 0) continue;

      const repairMetadata = { ...metadata, audio_duration: audioDuration };
      delete repairMetadata.subtitle_timeline;
      delete repairMetadata.subtitle_source;
      delete repairMetadata.script_path;
      delete repairMetadata.subtitle_path;
      delete repairMetadata.timestamped_text_path;
      const sequenceNumber = ttsSequenceNumber(job) || Number(metadata.sequence_number || job.id || 0);
      const fileBaseName = String(metadata.file_base_name || "").trim() || ttsFileBaseName(sequenceNumber);
      const prepared = prepareScript(job.text);
      const timedText = writeTimedTextFiles({
        directory: subtitleDir,
        job,
        preparedText: prepared.text,
        result: {
          duration: audioDuration,
          metadata: repairMetadata,
        },
        fileBaseName,
        title: metadata.title || metadata.seo_title || "",
      });
      taskStore.updateTtsJob(job.id, {
        metadata_json: JSON.stringify({
          ...metadata,
          ...timedText,
          audio_duration: audioDuration,
          subtitle_source: timedText.subtitle_source || "estimated_audio_duration",
        }),
      });
    }
  }

  function listVoices(providerId) {
    if (!CURATED_TTS_PROVIDER_IDS.has(providerId)) return [];
    const provider = getProvider(providerId);
    if (!provider) return [];
    const presets = curatedPresetVoices(providerId, provider.listPresetVoices());
    for (const voice of presets) {
      taskStore.upsertVoice({
        provider: providerId,
        voice_id: voice.id,
        voice_name: voice.name,
        voice_type: "preset",
        metadata_json: JSON.stringify(voice),
      });
    }
    return presets.map((voice) => ({
      ...voice,
      sample_url: `/api/tts/voice-preview?provider=${encodeURIComponent(providerId)}&voice_id=${encodeURIComponent(voice.id)}`,
    }));
  }

  function voicePreview(voiceId = "") {
    return createVoicePreviewWav(voiceId);
  }

  async function generateStaticPreview({
    provider: providerId,
    voice_id: voiceId,
    voice_name: voiceName = "",
    model = "",
    text = "你好，这是我的短视频配音试听。表达自然，节奏清楚，重点明确。",
    outputPath,
  } = {}) {
    const provider = getProvider(providerId);
    if (!provider) return { error: "未知 TTS Provider。" };
    if (!String(voiceId || "").trim()) return { error: "缺少试听音色。" };
    if (!String(outputPath || "").trim()) return { error: "缺少试听音频保存路径。" };
    const result = await provider.generateSpeech({
      text,
      voiceId,
      voiceName,
      model,
      emotion: "自然",
      speed: 1,
      volume: 50,
      pitch: 1,
      format: "mp3",
      outputPath,
    });
    return result.success
      ? result
      : {
          error: result.error || result.detail || "?????????",
          detail: result.detail || "",
        };
  }

  ensureSequenceNumbers();
  repairEstimatedTimelines();
  const resumeAlignmentIds = [];
  const recheckAlignmentJobs = [];
  for (const job of taskStore.listTtsJobs({ limit: 500 })) {
    const metadata = ttsJobMetadata(job);
    if (
      job.status === "completed"
      && ["review_required", "failed", "not_required"].includes(String(metadata.alignment_status || ""))
      && metadata.alignment_policy_version !== ALIGNMENT_POLICY_VERSION
      && job.audio_path
      && fs.existsSync(job.audio_path)
      && requiresAlignment(job, metadata)
    ) {
      recheckAlignmentJobs.push({ id: job.id, text: preferredAlignmentText(job, metadata) });
      continue;
    }
    if (!["waiting", "processing"].includes(job.status)) continue;
    if (job.audio_path && fs.existsSync(job.audio_path) && requiresAlignment(job, metadata)) {
      taskStore.updateTtsJob(job.id, {
        status: "completed",
        error: "",
        metadata_json: JSON.stringify({
          ...metadata,
          alignment_status: "failed",
          alignment_error: "服务重启后需要恢复字幕校准。",
          stage: "等待恢复字幕校准",
        }),
      });
      resumeAlignmentIds.push(job.id);
      continue;
    }
    taskStore.updateTtsJob(job.id, { status: "waiting", error: "" });
    pending.push(job.id);
  }
  if (pending.length) setTimeout(() => drain().catch(() => {}), 0);
  if (resumeAlignmentIds.length) setTimeout(() => {
    for (const id of resumeAlignmentIds) retryAlignment(id);
  }, 0);
  if (recheckAlignmentJobs.length) setTimeout(async () => {
    for (const item of recheckAlignmentJobs) {
      await processAlignment(item.id, { finalText: item.text, reuseRecognition: true });
    }
  }, 0);

  function isBusy() {
    return working
      || pending.length > 0
      || alignmentRunning.size > 0
      || taskStore.listTtsJobs({ limit: 500 }).some((job) => ["waiting", "processing"].includes(job.status));
  }

  return {
    enqueue,
    importGenerated,
    retryJob,
    retryAlignment,
    realignJob,
    alignCorrectedText,
    syncSourceConstrainedRows,
    confirmAlignment,
    syncConfirmedTimeline,
    getJob,
    listJobs,
    listProjectJobs,
    selectProjectJob,
    getSelectedProjectJob,
    removeJob,
    clearJobs,
    listVoices,
    voicePreview,
    generateStaticPreview,
    isBusy,
    outputDir,
    subtitleDir,
  };
}
