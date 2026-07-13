import fs from "node:fs";
import path from "node:path";
import { generateSeoTitlePackage } from "../core/title-generator.js";
import { createTtsProvider } from "./providers/index.js";
import { redactSecrets } from "./provider-adapter.js";

const PROMPT_FILES = ["tts_script_prepare.md", "tts_emotion_prompt.md", "seo_title_generation.md"];

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

function timestampNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number > 1000 ? number / 1000 : number;
}

function pickTimestamp(item, keys = []) {
  for (const key of keys) {
    if (item?.[key] !== undefined) {
      const value = timestampNumber(item[key]);
      if (value !== null) return value;
    }
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

function subtitleEntries(raw) {
  const value = typeof raw === "string" ? safeJson(raw, []) : raw;
  const list = Array.isArray(value)
    ? value
    : Array.isArray(value?.subtitles)
      ? value.subtitles
      : Array.isArray(value?.words)
        ? value.words
        : [];
  return list
    .map((item) => {
      const text = subtitleText(item);
      const start = pickTimestamp(item, ["start", "start_time", "startTime", "begin", "begin_time", "beginTime", "time_begin", "offset", "offset_ms"]);
      const end = pickTimestamp(item, ["end", "end_time", "endTime", "stop", "stop_time", "time_end", "duration_end"]);
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

function writeTimedTextFiles({ directory, job, preparedText, result, fileBaseName, title = "" }) {
  const providerTimeline = collapseSubtitleEntries(subtitleEntries(result.metadata?.subtitles || result.metadata?.subtitle));
  const duration = Number(result.duration || result.metadata?.duration || 0)
    || (Number(result.metadata?.audio_length_ms || 0) / 1000)
    || 0;
  const timeline = providerTimeline.length ? providerTimeline : estimatedSubtitleTimeline(preparedText, duration);
  if (!timeline.length) return {};
  fs.mkdirSync(directory, { recursive: true });
  const safeBaseName = String(fileBaseName || `tts-${job.id}`).replace(/[^a-z0-9_-]+/gi, "_") || `tts-${job.id}`;
  const scriptPath = path.join(directory, `${safeBaseName}.txt`);
  const srtPath = path.join(directory, `${safeBaseName}.srt`);
  const textPath = path.join(directory, `${safeBaseName}-timestamped.txt`);
  const srt = timeline.map((item, index) => [
    String(index + 1),
    `${formatClock(item.start, ",")} --> ${formatClock(item.end, ",")}`,
    item.text,
  ].join("\n")).join("\n\n") + "\n";
  const timestampedText = timeline
    .map((item) => `[${formatClock(item.start)} --> ${formatClock(item.end)}] ${item.text}`)
    .join("\n") + "\n";
  const cleanTitle = String(title || "").trim();
  const titlePrefix = cleanTitle ? `标题：${cleanTitle}\n\n` : "";
  fs.writeFileSync(scriptPath, `${titlePrefix}${preparedText.trim()}\n`, "utf8");
  fs.writeFileSync(srtPath, srt, "utf8");
  fs.writeFileSync(textPath, `${titlePrefix}${timestampedText}`, "utf8");
  return {
    script_path: scriptPath,
    subtitle_path: srtPath,
    timestamped_text_path: textPath,
    subtitle_timeline: timeline,
    subtitle_source: providerTimeline.length ? "provider" : "estimated",
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

export function createTtsService({ baseDir, taskStore, getSettings, ffmpegPath, onJobCompleted = () => {} }) {
  const outputDir = path.join(baseDir, ".data", "tts", "audio");
  const subtitleDir = path.join(baseDir, ".data", "tts", "subtitles");
  const promptsDir = path.join(baseDir, "prompts");
  const pending = [];
  let working = false;

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(subtitleDir, { recursive: true });
  for (const file of PROMPT_FILES) {
    if (!fs.existsSync(path.join(promptsDir, file))) {
      throw new Error(`缺少 TTS Prompt：${file}`);
    }
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

  function visibleError(job, metadata = safeJson(job?.metadata_json, {})) {
    const error = String(job?.error || "").trim();
    const detail = String(metadata.provider_detail || metadata.error_detail || "").trim();
    if (job?.status !== "failed") return error;
    if (error && detail && !error.includes(detail)) return `${error} 详情：${detail}`;
    return error || detail || "语音生成失败。";
  }

  function publicJob(job) {
    if (!job) return null;
    const metadata = safeJson(job.metadata_json, {});
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
      audio_url: job.status === "completed" && job.audio_path ? `/api/tts/audio?id=${job.id}` : "",
      script_url: job.status === "completed" && metadata.script_path ? `/api/tts/script?id=${job.id}` : "",
      subtitle_url: job.status === "completed" && metadata.subtitle_path ? `/api/tts/subtitle?id=${job.id}` : "",
      timestamped_text_url: job.status === "completed" && metadata.timestamped_text_path ? `/api/tts/timestamped-text?id=${job.id}` : "",
      sequence_number: ttsSequenceNumber(job),
      display_number: ttsSequenceNumber(job) || Number(job.id || 0),
      file_base_name: String(metadata.file_base_name || ""),
      script_path: String(metadata.script_path || ""),
      subtitle_path: String(metadata.subtitle_path || ""),
      timestamped_text_path: String(metadata.timestamped_text_path || ""),
      subtitle_timeline: Array.isArray(metadata.subtitle_timeline) ? metadata.subtitle_timeline : [],
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

    taskStore.updateTtsJob(job.id, { status: "processing", error: "" });
    const prepared = prepareScript(job.text);
    const jobMetadata = safeJson(job.metadata_json, {});
    const titleMetadata = ttsTitleMetadata(prepared.text, jobMetadata);
    const sequenceNumber = Number(jobMetadata.sequence_number || 0) || ttsSequenceNumber(job) || Number(job.id || 0);
    const fileBaseName = String(jobMetadata.file_base_name || "").trim() || ttsFileBaseName(sequenceNumber);
    const outputPath = path.join(outputDir, `${fileBaseName}.${job.format === "wav" ? "wav" : "mp3"}`);
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
          provider_detail: failureDetail,
        }),
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const timedText = writeTimedTextFiles({
      directory: subtitleDir,
      job,
      preparedText: prepared.text,
      result,
      fileBaseName,
      title: titleMetadata.title,
    });

    taskStore.updateTtsJob(job.id, {
      audio_path: result.audio_path,
      status: "completed",
      error: "",
      metadata_json: JSON.stringify({
        ...jobMetadata,
        ...prepared.metadata,
        ...(result.metadata || {}),
        ...titleMetadata,
        sequence_number: sequenceNumber,
        file_base_name: fileBaseName,
        ...timedText,
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

    const prepared = prepareScript(text);
    const provider = String(input.provider || "minimax");
    const voiceAssetId = Number(input.voice_asset_id || 0);
    const titleMetadata = ttsTitleMetadata(prepared.text, {
      ...input,
      source: String(input.source || "generated_preview"),
    });
    const metadata = {
      imported_generated_audio: true,
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
      ...prepared.metadata,
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
        duration: Number(input.duration || 0),
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      },
      fileBaseName,
      title: titleMetadata.title,
    });
    taskStore.updateTtsJob(job.id, {
      metadata_json: JSON.stringify({
        ...metadata,
        ...timedText,
      }),
    });
    if (voiceAssetId > 0) taskStore.recordVoiceUse(voiceAssetId);
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
      for (const filePath of [metadata.script_path, metadata.subtitle_path, metadata.timestamped_text_path]) {
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
  for (const job of taskStore.listTtsJobs({ limit: 500 })) {
    if (!["waiting", "processing"].includes(job.status)) continue;
    taskStore.updateTtsJob(job.id, { status: "waiting", error: "" });
    pending.push(job.id);
  }
  if (pending.length) setTimeout(() => drain().catch(() => {}), 0);

  return {
    enqueue,
    importGenerated,
    retryJob,
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
    outputDir,
    subtitleDir,
  };
}
