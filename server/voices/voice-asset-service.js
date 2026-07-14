import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createTtsProvider } from "../tts/providers/index.js";
import { MINIMAX_MUSIC_MODEL, MINIMAX_MUSIC_PRESETS, minimaxMusicPresetFromVoiceId, minimaxMusicPresetToVoiceAsset } from "../tts/minimax-music-presets.js";

const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;
const CLONE_PREVIEW_TEXT = "你好，这是一段克隆音色试听。请用自然、清晰、有交流感的方式讲述，重点明确，节奏舒适。";
const STYLE_PRESET_VERSION = 1;
const MIME_EXTENSIONS = {
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
};

const VISIBLE_TTS_PROVIDER_IDS = ["aliyun_bailian", "minimax"];
const DEFAULT_VOICE_PREVIEW_TEXT = "你好，这是当前音色试听。表达自然，节奏清楚，重点明确。";
const CLONE_PROVIDER_REQUIREMENTS = {
  aliyun_bailian: {
    provider: "aliyun_bailian",
    label: "阿里云百炼 CosyVoice / Qwen-TTS",
    formats: ["wav", "mp3", "m4a"],
    min_duration_seconds: 10,
    max_duration_seconds: 60,
    recommended_duration: "10–20 秒",
    max_file_bytes: 7 * 1024 * 1024,
    max_file_label: "原文件建议不超过 7 MB（Base64 请求体需小于 10 MB）",
    min_sample_rate: 24000,
    channels: 1,
    text_required: true,
    models: [
      { value: "qwen3-tts-vc-2026-01-22", label: "Qwen3-TTS VC（质量优先）" },
      { value: "qwen3-tts-vc-realtime-2026-01-15", label: "Qwen3-TTS VC Realtime（速度优先）" },
    ],
  },
  minimax: {
    provider: "minimax",
    label: "MiniMax Speech",
    formats: ["wav", "mp3", "m4a"],
    min_duration_seconds: 10,
    max_duration_seconds: 300,
    recommended_duration: "10 秒以上，建议使用清晰连续朗读",
    max_file_bytes: MAX_SAMPLE_BYTES,
    max_file_label: "不超过 20 MB",
    min_sample_rate: 0,
    channels: 0,
    text_required: true,
    models: [
      { value: "speech-2.6-hd", label: "MiniMax speech-2.6-hd（质量优先）" },
      { value: "speech-2.6-turbo", label: "MiniMax speech-2.6-turbo（速度优先）" },
    ],
  },
};

function cloneProviderRequirements(providerId = "aliyun_bailian") {
  const source = CLONE_PROVIDER_REQUIREMENTS[String(providerId || "").trim()] || CLONE_PROVIDER_REQUIREMENTS.aliyun_bailian;
  return {
    ...source,
    formats: [...source.formats],
    models: source.models.map((model) => ({ ...model })),
  };
}

function minimaxEndpoint(baseUrl, pathname) {
  const base = String(baseUrl || "https://api.minimaxi.com").replace(/\/+$/, "");
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return base.endsWith("/v1") ? `${base}${suffix.replace(/^\/v1(?=\/|$)/, "")}` : `${base}${suffix}`;
}

function parseJsonObject(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function redactSecret(value, secret) {
  const text = String(value || "");
  return secret ? text.split(secret).join("[REDACTED]") : text;
}

function minimaxMusicError(status, data, raw, apiKey) {
  const code = Number(data?.base_resp?.status_code || data?.status_code || 0);
  const message = String(data?.base_resp?.status_msg || data?.message || data?.error?.message || raw || "").trim();
  if (status === 401 || status === 403 || /unauthorized|invalid.*key|鉴权|密钥/i.test(message)) {
    return "MiniMax：API Key 无效或未授权音乐生成。";
  }
  if (/balance|quota|insufficient|余额|额度|欠费/i.test(message)) return "MiniMax：余额不足或音乐生成额度不可用。";
  if (/model/i.test(message)) return `MiniMax Music：模型不可用。${message ? ` ${message}` : ""}`;
  const fallback = code || status ? `MiniMax Music 请求失败（${status || code}）：${message}` : "MiniMax Music 请求失败。";
  return redactSecret(fallback, apiKey);
}

function formatMusicLyrics(text, preset = {}) {
  const clean = String(text || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!clean) return "";
  if (/^\s*\[(Intro|Verse|Pre Chorus|Chorus|Interlude|Bridge|Outro|Post Chorus|Transition|Break|Hook|Build Up|Inst|Solo)\]/im.test(clean)) {
    return clean.slice(0, 3500);
  }
  const lines = clean
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((item) => item.replace(/[。！？!?；;]+$/u, "").trim())
    .filter(Boolean)
    .slice(0, 16);
  if (!lines.length) return "";
  const hook = lines[0].length <= 26 ? lines[0] : `${lines[0].slice(0, 24)}...`;
  const midpoint = Math.max(1, Math.ceil(lines.length / 2));
  return [
    "[Intro]",
    hook,
    "[Verse]",
    ...lines.slice(0, midpoint),
    "[Chorus]",
    ...(lines.slice(midpoint).length ? lines.slice(midpoint) : [preset.outro || hook]),
    "[Outro]",
    preset.outro || hook,
  ].join("\n").slice(0, 3500);
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function sanitizeName(value) {
  return String(value || "voice")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim()
    .slice(0, 60) || "voice";
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function safeFileSegment(value) {
  return sanitizeName(value).replace(/\s+/g, "-").slice(0, 40) || "voice";
}

function isWithin(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget !== resolvedRoot && resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

function normalizeStyleProfile(value = {}) {
  const number = (input, fallback, min, max) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  return {
    estimated_bpm: number(value.estimated_bpm, 120, 80, 180),
    target_bpm: number(value.target_bpm, 120, 80, 180),
    target_lufs: number(value.target_lufs, -14, -20, -8),
    ending_fade_seconds: number(value.ending_fade_seconds, 2.5, 1, 6),
    bgm_ducking: value.bgm_ducking !== false,
    voice_priority: value.voice_priority !== false,
    bpm_range: Array.isArray(value.bpm_range) ? value.bpm_range.slice(0, 2) : [120, 150],
  };
}

function parseTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,，、\n]/);
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))].slice(0, 20);
}

function parseTestScripts(markdown) {
  const scripts = [];
  const pattern = /^##\s+([^|\n]+)\|\s*([^|\n]+)\|\s*([^\n]+)\s*\n+([\s\S]*?)(?=^##\s+|\s*$)/gm;
  let match;
  while ((match = pattern.exec(markdown))) {
    scripts.push({
      type: match[1].trim(),
      name: match[2].trim(),
      emotion: match[3].trim(),
      text: match[4].trim(),
    });
  }
  return scripts;
}

function decodeAudio(dataUrl, mimeHint = "") {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  const mimeType = String(match?.[1] || mimeHint || "").toLowerCase();
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("参考音频只支持 WAV、MP3 或 M4A。");
  const buffer = Buffer.from(match?.[2] || "", "base64");
  if (!buffer.length) throw new Error("参考音频为空。");
  if (buffer.length > MAX_SAMPLE_BYTES) throw new Error("参考音频不能超过 20MB。");
  return { buffer, mimeType: mimeType === "audio/x-wav" ? "audio/wav" : mimeType, extension };
}

export function createVoiceAssetService({ baseDir, taskStore, ttsService, getSettings, ffmpegPath }) {
  const voicesDir = path.join(baseDir, "voices");
  const samplesDir = path.join(voicesDir, "samples");
  const clonesDir = path.join(voicesDir, "clones");
  const previewsDir = path.join(voicesDir, "previews");
  const staticPreviewsDir = path.join(baseDir, "ui", "assets", "voice-previews");
  const cloneDraftsDir = path.join(voicesDir, "clone-drafts");
  const stylePresetPath = path.join(voicesDir, "audio-style-presets.json");
  const promptPath = path.join(baseDir, "prompts", "voice_test_script.md");

  for (const directory of [voicesDir, samplesDir, clonesDir, previewsDir, cloneDraftsDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  if (!fs.existsSync(promptPath)) throw new Error("缺少声音测试 Prompt：voice_test_script.md");

  const testScripts = parseTestScripts(fs.readFileSync(promptPath, "utf8"));
  if (testScripts.length !== 5) throw new Error("声音测试 Prompt 必须包含 5 类测试脚本。");

  function writeSample(dataUrl, mimeType, voiceName) {
    const audio = decodeAudio(dataUrl, mimeType);
    const filePath = path.join(samplesDir, `${Date.now()}-${sanitizeName(voiceName)}-${randomUUID().slice(0, 8)}${audio.extension}`);
    fs.writeFileSync(filePath, audio.buffer);
    return { path: filePath, mimeType: audio.mimeType, size: audio.buffer.length };
  }

  function writeCloneRecord(asset) {
    const filePath = path.join(clonesDir, `voice-${asset.id}-v${asset.version}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      id: asset.id,
      provider: asset.provider,
      voice_id: asset.voice_id,
      voice_name: asset.voice_name,
      version: asset.version,
      parent_voice_id: asset.parent_voice_id,
      status: asset.status,
      updated_at: asset.updated_at,
    }, null, 2), "utf8");
  }

  function staticVoicePreview(provider, voiceId) {
    const safeProvider = String(provider || "unknown").replace(/[^a-z0-9_-]+/gi, "_") || "unknown";
    const key = createHash("sha1").update(`${safeProvider}:${voiceId}`).digest("hex").slice(0, 20);
    return {
      path: path.join(staticPreviewsDir, safeProvider, `${key}.mp3`),
      url: `/assets/voice-previews/${encodeURIComponent(safeProvider)}/${key}.mp3`,
    };
  }

  function resolveStaticPreviewUrl(row) {
    if (!row?.provider || !row?.voice_id) return "";
    const preview = staticVoicePreview(row.provider, row.voice_id);
    return fs.existsSync(preview.path) ? preview.url : "";
  }

  function providerFor(providerId) {
    const settings = getSettings();
    return createTtsProvider(providerId, {
      config: settings.tts?.[providerId] || {},
      ffmpegPath,
    });
  }

  async function cloneSample({ providerId, name, samplePath, mimeType, targetModel, transcript, consentConfirmed }) {
    const provider = providerFor(providerId);
    if (!provider) return { success: false, error: "未知 TTS Provider。" };
    return provider.cloneVoice({
      name,
      audioPath: samplePath,
      consentConfirmed,
      targetModel,
      mimeType,
      transcript,
    });
  }

  function enrichAsset(row, ratings = []) {
    if (!row) return null;
    const metadata = safeJson(row.metadata_json, {});
    const tags = safeJson(row.tags_json, []);
    const ownRatings = ratings.filter((rating) => Number(rating.voice_asset_id) === Number(row.id));
    const averageScore = ownRatings.length
      ? Math.round(ownRatings.reduce((sum, rating) => sum + Number(rating.score || 0), 0) / ownRatings.length)
      : 0;
    const averageStars = ownRatings.length
      ? Number((ownRatings.reduce((sum, rating) => sum + Number(rating.stars || 0), 0) / ownRatings.length).toFixed(1))
      : 0;
    const previewTest = taskStore.listVoiceTests({ voiceAssetId: row.id })
      .find((test) => test.status === "completed" && test.tts_job_id);
    return {
      ...row,
      tags,
      metadata,
      sample_url: row.sample_path ? `/api/voice-assets/audio?id=${row.id}&kind=sample` : metadata.sample_url || "",
      preview_url: resolveStaticPreviewUrl(row) || (previewTest
        ? `/api/tts/audio?id=${previewTest.tts_job_id}`
        : row.preview_path
          ? `/api/voice-assets/audio?id=${row.id}&kind=preview`
          : String(metadata.demo_audio || "")),
      supports_emotion: metadata.supports_emotion !== false,
      supports_speed: metadata.supports_speed !== false,
      rating_count: ownRatings.length,
      average_score: averageScore,
      average_stars: averageStars,
    };
  }

  function ensurePresetAssets() {
    for (const providerId of VISIBLE_TTS_PROVIDER_IDS) {
      ttsService.listVoices(providerId);
    }
    for (const preset of MINIMAX_MUSIC_PRESETS) {
      taskStore.upsertVoice(minimaxMusicPresetToVoiceAsset(preset));
    }
  }

  function pruneHiddenPresetAssets(rows = []) {
    const allowed = new Set();
    for (const providerId of VISIBLE_TTS_PROVIDER_IDS) {
      for (const voice of ttsService.listVoices(providerId)) {
        allowed.add(`${providerId}:${voice.id}`);
      }
    }
    let changed = false;
    for (const row of rows) {
      if (row.voice_type !== "preset") continue;
      if (allowed.has(`${row.provider}:${row.voice_id}`)) continue;
      taskStore.updateVoiceAsset(row.id, {
        archived: true,
        is_default: false,
        is_favorite: false,
        status: "deleted",
      });
      changed = true;
    }
    return changed ? taskStore.listVoices({}) : rows;
  }

  function readStylePresets() {
    if (!fs.existsSync(stylePresetPath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(stylePresetPath, "utf8"));
      return Array.isArray(parsed?.presets) ? parsed.presets : [];
    } catch {
      return [];
    }
  }

  function writeStylePresets(presets) {
    fs.writeFileSync(stylePresetPath, JSON.stringify({
      version: STYLE_PRESET_VERSION,
      presets,
      updated_at: new Date().toISOString(),
    }, null, 2), "utf8");
  }

  function listStylePresets() {
    return readStylePresets()
      .filter((preset) => preset && preset.id && preset.status !== "deleted")
      .map((preset) => ({
        ...preset,
        profile: normalizeStyleProfile(preset.profile),
      }));
  }

  function getStylePreset(id) {
    const targetId = String(id || "").trim();
    return listStylePresets().find((preset) => preset.id === targetId) || null;
  }

  function saveStylePreset({ name, profile, sourceVoiceAssetId = 0 }) {
    const presets = readStylePresets();
    const timestamp = new Date().toISOString();
    const preset = {
      id: uniqueId("audio-style"),
      name: sanitizeName(name),
      profile: normalizeStyleProfile(profile),
      source_voice_asset_id: Number(sourceVoiceAssetId || 0),
      is_default: presets.length === 0,
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    };
    presets.push(preset);
    writeStylePresets(presets);
    return preset;
  }

  function setDefaultStylePreset(id) {
    const targetId = String(id || "").trim();
    const presets = readStylePresets();
    const target = presets.find((preset) => preset.id === targetId && preset.status !== "deleted");
    if (!target) return { error: "没有找到这个配乐风格模板。" };
    const timestamp = new Date().toISOString();
    for (const preset of presets) {
      preset.is_default = preset.id === targetId;
      preset.updated_at = timestamp;
    }
    writeStylePresets(presets);
    return { preset: { ...target, is_default: true } };
  }

  function deleteStylePreset(id) {
    const targetId = String(id || "").trim();
    const presets = readStylePresets();
    const index = presets.findIndex((preset) => preset.id === targetId && preset.status !== "deleted");
    if (index < 0) return { error: "没有找到这个配乐风格模板。" };
    const [removed] = presets.splice(index, 1);
    if (!presets.some((preset) => preset.is_default) && presets[0]) presets[0].is_default = true;
    writeStylePresets(presets);
    return { deleted: 1, id: removed.id, permanent: true };
  }

  function cloneDraftPath(id) {
    return path.join(cloneDraftsDir, `${String(id || "").replace(/[^a-zA-Z0-9_-]/g, "")}.json`);
  }

  function readCloneDraft(id) {
    const filePath = cloneDraftPath(id);
    if (!isWithin(cloneDraftsDir, filePath) || !fs.existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return parsed?.id ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeCloneDraft(draft) {
    const filePath = cloneDraftPath(draft.id);
    fs.writeFileSync(filePath, JSON.stringify(draft, null, 2), "utf8");
  }

  function removeCloneDraftFiles(draft) {
    for (const filePath of [draft?.sample_path, draft?.preview_path, cloneDraftPath(draft?.id)]) {
      if (!filePath) continue;
      const resolved = path.resolve(filePath);
      if (isWithin(cloneDraftsDir, resolved) && fs.existsSync(resolved)) fs.rmSync(resolved, { force: true });
    }
  }

  function listAssets() {
    ensurePresetAssets();
    const rows = pruneHiddenPresetAssets(taskStore.listVoices({}));
    const ratings = taskStore.listVoiceRatings({});
    return rows.map((row) => enrichAsset(row, ratings));
  }

  function getAsset(id) {
    const ratings = taskStore.listVoiceRatings({ voiceAssetId: id });
    return enrichAsset(taskStore.getVoiceAsset(id), ratings);
  }

  async function createAsset(input) {
    const rawVoiceName = String(input.voice_name || "").trim();
    if (!rawVoiceName) return { error: "请填写声音名称。" };
    const voiceName = sanitizeName(rawVoiceName);
    const provider = String(input.provider || "aliyun_bailian");
    const consentConfirmed = input.consent_confirmed === true;
    const manualVoiceId = String(input.voice_id || "").trim();
    const referenceId = String(input.reference_id || "").trim();
    const effectiveManualVoiceId = manualVoiceId || referenceId;
    let sample = null;
    if (input.sample_data) {
      try {
        sample = writeSample(input.sample_data, input.sample_mime, voiceName);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (!effectiveManualVoiceId && !sample) return { error: "请上传参考音频，或填写已有 voice_id / reference_id。" };
    if (!effectiveManualVoiceId && !consentConfirmed) return { error: "必须确认拥有声音授权后才能复刻。" };

    const targetModel = String(input.target_model || "qwen3-tts-vc-2026-01-22").trim();
    let cloneResult = null;
    if (!effectiveManualVoiceId && sample) {
      cloneResult = await cloneSample({
        providerId: provider,
        name: String(input.preferred_name || voiceName),
        samplePath: sample.path,
        mimeType: sample.mimeType,
        targetModel,
        transcript: String(input.sample_transcript || ""),
        consentConfirmed,
      });
    }
    const voiceId = effectiveManualVoiceId || cloneResult?.voice_id || `pending-${randomUUID()}`;
    const status = effectiveManualVoiceId || cloneResult?.success ? "active" : "clone_failed";
    const metadata = {
      target_model: cloneResult?.metadata?.target_model || targetModel,
      reference_id: referenceId,
      fish_audio: provider === "fish_audio" ? { reference_id: referenceId || voiceId } : {},
      sample_mime: sample?.mimeType || "",
      sample_size: sample?.size || 0,
      sample_transcript: String(input.sample_transcript || ""),
      clone_request: cloneResult?.metadata || {},
      clone_error: cloneResult?.success === false ? String(cloneResult.error || cloneResult.detail || "复刻失败") : "",
      demo_audio: String(cloneResult?.metadata?.demo_audio || ""),
      supports_emotion: cloneResult?.metadata?.supports_emotion !== false,
      supports_speed: cloneResult?.metadata?.supports_speed !== false,
      consent_confirmed: consentConfirmed,
    };
    const asset = taskStore.createVoiceAsset({
      provider,
      voice_id: voiceId,
      voice_name: voiceName,
      voice_type: "clone",
      description: String(input.description || "").trim(),
      tags_json: JSON.stringify(parseTags(input.tags)),
      sample_path: sample?.path || "",
      preview_path: "",
      version: Number(input.version || 1),
      parent_voice_id: Number(input.parent_voice_id || 0),
      status,
      metadata_json: JSON.stringify(metadata),
    });
    writeCloneRecord(asset);
    return {
      asset: getAsset(asset.id),
      clone_error: metadata.clone_error,
    };
  }

  async function createCloneDraft(input) {
    const rawVoiceName = String(input.voice_name || "待命名音色").trim() || "待命名音色";
    const provider = String(input.provider || "minimax").trim() || "minimax";
    const requirements = cloneProviderRequirements(provider);
    const voiceName = sanitizeName(rawVoiceName);
    const draftId = uniqueId("clone-draft");
    const sourcePath = path.resolve(String(input.sample_path || ""));
    const previewPath = path.join(cloneDraftsDir, `${draftId}-preview.mp3`);
    const sampleDataMime = String(input.sample_data || "").trim().match(/^data:([^;,]+)/i)?.[1] || "";
    const sampleMimeHint = String(input.sample_mime || sampleDataMime || "").toLowerCase();
    const sampleExtension = String(input.sample_data || "").trim()
      ? ({ "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a" }[sampleMimeHint] || ".wav")
      : path.extname(sourcePath).toLowerCase() || ".wav";
    const samplePath = path.join(cloneDraftsDir, `${draftId}-${safeFileSegment(voiceName)}${sampleExtension}`);
    let sampleMime = sampleMimeHint || "audio/wav";
    if (String(input.sample_data || "").trim()) {
      try {
        const audio = decodeAudio(input.sample_data, sampleMime);
        if (audio.buffer.length > Number(requirements.max_file_bytes || MAX_SAMPLE_BYTES)) {
          return { error: `${requirements.label}：${requirements.max_file_label}。` };
        }
        fs.writeFileSync(samplePath, audio.buffer);
        sampleMime = audio.mimeType;
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    } else {
      if (!sourcePath || !fs.existsSync(sourcePath)) return { error: "没有找到自动提取的人声样本。请重新分析参考音频。" };
      if (fs.statSync(sourcePath).size > Number(requirements.max_file_bytes || MAX_SAMPLE_BYTES)) {
        return { error: `${requirements.label}：${requirements.max_file_label}。` };
      }
      fs.copyFileSync(sourcePath, samplePath);
    }

    const targetModel = String(input.target_model || requirements.models[0]?.value || "speech-2.6-hd").trim()
      || requirements.models[0]?.value || "speech-2.6-hd";
    const cloned = await cloneSample({
      providerId: provider,
      name: String(input.preferred_name || voiceName),
      samplePath,
      mimeType: sampleMime,
      targetModel,
      transcript: String(input.sample_transcript || ""),
      consentConfirmed: true,
    });
    if (!cloned?.success || !cloned.voice_id) {
      removeCloneDraftFiles({ id: draftId, sample_path: samplePath, preview_path: previewPath });
      return { error: cloned?.error || cloned?.detail || `${requirements.label}：声音克隆失败。` };
    }

    const providerAdapter = providerFor(provider);
    const preview = await providerAdapter.generateSpeech({
      text: CLONE_PREVIEW_TEXT,
      voiceId: cloned.voice_id,
      voiceName,
      model: String(cloned.metadata?.target_model || targetModel),
      emotion: "自然",
      speed: 1,
      volume: 50,
      pitch: 1,
      format: "mp3",
      outputPath: previewPath,
    });
    if (!preview?.success || !fs.existsSync(previewPath)) {
      await providerAdapter.deleteVoice?.({ voiceId: cloned.voice_id, voiceType: "voice_cloning" }).catch(() => null);
      removeCloneDraftFiles({ id: draftId, sample_path: samplePath, preview_path: previewPath });
      return { error: [preview?.error || "克隆音色试听生成失败。", preview?.detail || ""].filter(Boolean).join(" ") };
    }

    const draft = {
      id: draftId,
      provider,
      voice_id: cloned.voice_id,
      voice_name: voiceName,
      sample_path: samplePath,
      preview_path: previewPath,
      sample_mime: sampleMime,
      sample_transcript: String(input.sample_transcript || ""),
      style_profile: normalizeStyleProfile(input.style_profile),
      metadata: cloned.metadata || {},
      status: "preview_ready",
      created_at: new Date().toISOString(),
    };
    writeCloneDraft(draft);
    return { draft };
  }

  async function confirmCloneDraft(id, input = {}) {
    const draft = readCloneDraft(id);
    if (!draft || draft.status !== "preview_ready") return { error: "克隆试听草稿不存在或已失效，请重新创建。" };
    if (!fs.existsSync(draft.sample_path) || !fs.existsSync(draft.preview_path)) {
      return { error: "克隆试听文件不存在，请重新创建。" };
    }

    const finalVoiceName = sanitizeName(input.voice_name || draft.voice_name || "克隆音色");
    const sampleExtension = path.extname(draft.sample_path).toLowerCase() || ".wav";
    const savedSamplePath = path.join(samplesDir, `${Date.now()}-${safeFileSegment(finalVoiceName)}-${randomUUID().slice(0, 8)}${sampleExtension}`);
    const savedPreviewPath = path.join(previewsDir, `${Date.now()}-${safeFileSegment(finalVoiceName)}-${randomUUID().slice(0, 8)}.mp3`);
    fs.renameSync(draft.sample_path, savedSamplePath);
    fs.renameSync(draft.preview_path, savedPreviewPath);

    const metadata = {
      ...draft.metadata,
      target_model: String(draft.metadata?.target_model || input.target_model || "speech-2.6-hd"),
      sample_mime: draft.sample_mime,
      sample_transcript: draft.sample_transcript,
      consent_confirmed: true,
      supports_emotion: draft.metadata?.supports_emotion !== false,
      supports_speed: draft.metadata?.supports_speed !== false,
      reference_style_profile: normalizeStyleProfile(draft.style_profile),
    };
    const asset = taskStore.createVoiceAsset({
      provider: draft.provider,
      voice_id: draft.voice_id,
      voice_name: finalVoiceName,
      voice_type: "clone",
      description: String(input.description || "授权参考音频创建的克隆音色").trim(),
      tags_json: JSON.stringify(parseTags(input.tags?.length ? input.tags : ["授权克隆", "小黑视频", "口播"])),
      sample_path: savedSamplePath,
      preview_path: savedPreviewPath,
      version: 1,
      parent_voice_id: 0,
      status: "active",
      is_default: input.set_default === true,
      metadata_json: JSON.stringify(metadata),
    });
    writeCloneRecord(asset);
    const stylePreset = input.save_style === false
      ? null
      : saveStylePreset({
        name: `${draft.voice_name} 配乐风格`,
        profile: draft.style_profile,
        sourceVoiceAssetId: asset.id,
      });
    removeCloneDraftFiles(draft);
    return { asset: getAsset(asset.id), style_preset: stylePreset };
  }

  async function discardCloneDraft(id) {
    const draft = readCloneDraft(id);
    if (!draft) return { error: "克隆试听草稿不存在或已清理。" };
    const provider = providerFor(draft.provider);
    if (typeof provider?.deleteVoice === "function") {
      const result = await provider.deleteVoice({ voiceId: draft.voice_id, voiceType: "voice_cloning" });
      if (result?.success === false) return { error: result.error || result.detail || "平台临时克隆音色删除失败。" };
    }
    removeCloneDraftFiles(draft);
    return { deleted: 1, id: draft.id, permanent: true };
  }

  function resolveAssetAudioPath(id, kind = "sample") {
    const asset = taskStore.getVoiceAsset(id);
    const candidate = kind === "preview" ? asset?.preview_path : asset?.sample_path;
    const root = kind === "preview" ? previewsDir : samplesDir;
    const resolved = candidate ? path.resolve(candidate) : "";
    return resolved && isWithin(root, resolved) && fs.existsSync(resolved) ? resolved : "";
  }

  function resolveCloneDraftPreviewPath(id) {
    const draft = readCloneDraft(id);
    const resolved = draft?.preview_path ? path.resolve(draft.preview_path) : "";
    return resolved && isWithin(cloneDraftsDir, resolved) && fs.existsSync(resolved) ? resolved : "";
  }

  async function generateMinimaxMusicPreview({ asset, metadata, input, outputPath }) {
    const settings = getSettings();
    const config = settings.tts?.minimax || {};
    const apiKey = String(config.api_key || "").trim();
    if (!apiKey) return { error: "MiniMax：未配置 API Key，无法生成唱歌或音乐试听。" };
    const preset = minimaxMusicPresetFromVoiceId(asset.voice_id) || metadata;
    const text = String(input.text || metadata.previewText || metadata.preview_text || preset.outro || DEFAULT_VOICE_PREVIEW_TEXT).trim().slice(0, 3200);
    if (!preset.instrumental && !text) return { error: "唱歌和说唱预设需要文案或口号才能生成试听。" };
    const prompt = [
      preset.prompt || metadata.prompt || "中文短视频音乐",
      String(input.prompt_extra || "").trim(),
      input.title ? `视频标题：${String(input.title).trim().slice(0, 80)}` : "",
    ].filter(Boolean).join("，");
    const body = {
      model: String(input.model || preset.model || metadata.model || MINIMAX_MUSIC_MODEL).trim() || MINIMAX_MUSIC_MODEL,
      prompt,
      stream: false,
      output_format: "hex",
      audio_setting: {
        sample_rate: 44100,
        bitrate: 256000,
        format: "mp3",
      },
      aigc_watermark: false,
      lyrics_optimizer: false,
      is_instrumental: Boolean(preset.instrumental),
    };
    if (!preset.instrumental) body.lyrics = formatMusicLyrics(text, preset);

    try {
      const response = await fetch(minimaxEndpoint(config.base_url, "/v1/music_generation"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const raw = await response.text();
      const data = parseJsonObject(raw);
      const statusCode = Number(data?.base_resp?.status_code || 0);
      if (!response.ok || statusCode !== 0) {
        return { error: minimaxMusicError(response.status, data, raw, apiKey) };
      }
      const audioHex = String(data?.data?.audio || "").trim();
      const buffer = audioHex ? Buffer.from(audioHex, "hex") : null;
      if (!buffer?.length) return { error: `MiniMax Music 没有返回可用音频，状态：${String(data?.data?.status || "unknown")}` };
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, buffer);
      return {
        success: true,
        audio_path: outputPath,
        duration: Number(data?.extra_info?.music_duration || 0) / 1000,
        metadata: {
          model: body.model,
          provider: "minimax",
          provider_kind: "minimax_music",
          preset_id: preset.id || metadata.music_preset_id || "",
          prompt,
          instrumental: Boolean(preset.instrumental),
          trace_id: String(data.trace_id || ""),
          bytes: buffer.length,
          duration_ms: Number(data?.extra_info?.music_duration || 0),
        },
      };
    } catch (error) {
      return { error: "MiniMax Music 试听生成失败。", detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async function generatePreview(id, input = {}) {
    const assetId = Number(id || 0);
    const asset = taskStore.getVoiceAsset(assetId);
    if (!asset) return { error: "声音资产不存在。" };
    if (asset.archived || asset.status !== "active") return { error: "该音色不可用，不能生成试听。" };
    if (!String(asset.voice_id || "").trim() || String(asset.voice_id || "").startsWith("pending-")) {
      return { error: "该音色缺少可试听的 voice_id。" };
    }
    if (!VISIBLE_TTS_PROVIDER_IDS.includes(asset.provider)) {
      return { error: "该平台已从 TTS 页面移除，不能生成试听。" };
    }

    const force = input.force === true;
    const externalPreview = getAsset(assetId)?.preview_url || "";
    const localPreviewPath = resolveAssetAudioPath(assetId, "preview");
    if (!force && externalPreview && !externalPreview.includes("/api/voice-assets/audio")) {
      return { asset: getAsset(assetId), cached: true, preview_url: externalPreview };
    }
    if (!force && localPreviewPath) {
      return { asset: getAsset(assetId), cached: true, preview_url: `/api/voice-assets/audio?id=${assetId}&kind=preview`, audio_path: localPreviewPath };
    }

    const metadata = safeJson(asset.metadata_json, {});
    const filePath = path.join(previewsDir, `${Date.now()}-${safeFileSegment(asset.voice_name || asset.voice_id)}-${randomUUID().slice(0, 8)}.mp3`);
    const isMusicPreset = metadata.asset_kind === "minimax_music_preset" || asset.voice_type === "music";
    const result = isMusicPreset
      ? await generateMinimaxMusicPreview({ asset, metadata, input, outputPath: filePath })
      : await ttsService.generateStaticPreview({
        provider: asset.provider,
        voice_id: asset.voice_id,
        voice_name: asset.voice_name,
        model: String(input.model || metadata.target_model || metadata.model || ""),
        text: String(input.text || metadata.previewText || metadata.preview_text || DEFAULT_VOICE_PREVIEW_TEXT).trim() || DEFAULT_VOICE_PREVIEW_TEXT,
        outputPath: filePath,
      });
    if (result.error || !fs.existsSync(filePath)) {
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
      return { error: [result.error || "试听生成失败。", result.detail || ""].filter(Boolean).join(" ") };
    }
    taskStore.updateVoiceAsset(assetId, { preview_path: filePath });
    return {
      asset: getAsset(assetId),
      cached: false,
      preview_url: `/api/voice-assets/audio?id=${assetId}&kind=preview`,
      audio_path: filePath,
      duration: Number(result.duration || result.metadata?.duration || 0)
        || (Number(result.metadata?.duration_ms || result.metadata?.music_duration_ms || result.metadata?.audio_length_ms || 0) / 1000)
        || 0,
      metadata: result.metadata || {},
    };
  }

  async function retryClone(id, input = {}) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    if (!asset.sample_path || !fs.existsSync(asset.sample_path)) return { error: "该声音没有可用的参考音频。" };
    if (input.consent_confirmed !== true) return { error: "必须确认拥有声音授权后才能复刻。" };
    const metadata = safeJson(asset.metadata_json, {});
    const mimeType = metadata.sample_mime || "audio/mpeg";
    const targetModel = String(input.target_model || metadata.target_model || "qwen3-tts-vc-2026-01-22");
    const result = await cloneSample({
      providerId: asset.provider,
      name: asset.voice_name,
      samplePath: asset.sample_path,
      mimeType,
      targetModel,
      transcript: metadata.sample_transcript || "",
      consentConfirmed: true,
    });
    if (!result.success) {
      const updated = taskStore.updateVoiceAsset(asset.id, {
        status: "clone_failed",
        metadata_json: JSON.stringify({
          ...metadata,
          clone_error: String(result.error || result.detail || "复刻失败"),
        }),
      });
      writeCloneRecord(updated);
      return { asset: getAsset(asset.id), error: result.error || result.detail || "复刻失败" };
    }
    const updated = taskStore.updateVoiceAsset(asset.id, {
      voice_id: result.voice_id,
      status: "active",
      metadata_json: JSON.stringify({
        ...metadata,
        target_model: result.metadata?.target_model || targetModel,
        clone_request: result.metadata || {},
        clone_error: "",
      }),
    });
    writeCloneRecord(updated);
    return { asset: getAsset(asset.id) };
  }

  function updateAsset(id, input) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    const changes = {};
    if (input.voice_name !== undefined) changes.voice_name = sanitizeName(input.voice_name);
    if (input.description !== undefined) changes.description = String(input.description || "").trim();
    if (input.tags !== undefined) changes.tags_json = JSON.stringify(parseTags(input.tags));
    if (input.voice_id !== undefined && String(input.voice_id || "").trim()) {
      changes.voice_id = String(input.voice_id).trim();
      changes.status = "active";
    }
    if (input.reference_id !== undefined) {
      const metadata = safeJson(asset.metadata_json, {});
      const referenceId = String(input.reference_id || "").trim();
      changes.metadata_json = JSON.stringify({
        ...metadata,
        reference_id: referenceId,
        fish_audio: { ...(metadata.fish_audio || {}), reference_id: referenceId },
      });
      if (!changes.voice_id && referenceId) {
        changes.voice_id = referenceId;
        changes.status = "active";
      }
    }
    if (input.is_favorite !== undefined) changes.is_favorite = Boolean(input.is_favorite);
    if (input.status !== undefined) changes.status = String(input.status || asset.status);
    const updated = taskStore.updateVoiceAsset(id, changes);
    if (updated.voice_type === "clone") writeCloneRecord(updated);
    return { asset: getAsset(id) };
  }

  function createVersion(id) {
    const source = taskStore.getVoiceAsset(id);
    if (!source) return { error: "声音资产不存在。" };
    const rootId = source.parent_voice_id || source.id;
    const versions = taskStore.listVoices({ provider: source.provider })
      .filter((row) => (row.parent_voice_id || row.id) === rootId);
    const version = Math.max(source.version, ...versions.map((row) => row.version || 1)) + 1;
    const metadata = safeJson(source.metadata_json, {});
    const asset = taskStore.createVoiceAsset({
      provider: source.provider,
      voice_id: source.voice_id,
      voice_name: source.voice_name,
      voice_type: source.voice_type,
      description: source.description,
      tags_json: source.tags_json,
      sample_path: source.sample_path,
      preview_path: source.preview_path,
      version,
      parent_voice_id: rootId,
      status: source.status,
      metadata_json: JSON.stringify({ ...metadata, copied_from_voice_asset_id: source.id }),
    });
    if (asset.voice_type === "clone") writeCloneRecord(asset);
    return { asset: getAsset(asset.id) };
  }

  function setDefault(id) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    const metadata = safeJson(asset.metadata_json, {});
    if (metadata.supports_emotion === false || metadata.supports_speed === false) {
      return { error: "该音色不同时支持情感与语速，不能设为默认。" };
    }
    return { asset: enrichAsset(taskStore.setDefaultVoice(id), taskStore.listVoiceRatings({ voiceAssetId: id })) };
  }

  function getDefault() {
    const asset = taskStore.getDefaultVoice();
    return asset ? getAsset(asset.id) : null;
  }

  function archive(id) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    if (asset.is_default) taskStore.setDefaultVoice(0);
    return { asset: taskStore.updateVoiceAsset(id, { archived: true, is_default: false }) };
  }

  async function deletePermanent(id) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    if (asset.is_default) taskStore.setDefaultVoice(0);

    if (asset.voice_type === "preset") {
      taskStore.updateVoiceAsset(id, {
        archived: true,
        is_default: false,
        status: "deleted",
      });
      return { deleted: 1, id: asset.id, permanent: true };
    }

    const provider = providerFor(asset.provider);
    if (asset.voice_type === "clone" && typeof provider?.deleteVoice === "function") {
      const remote = await provider.deleteVoice({
        voiceId: asset.voice_id,
        voiceType: "voice_cloning",
      });
      if (remote?.success === false) {
        return { error: remote.error || remote.detail || "平台音色删除失败。" };
      }
    }

    for (const filePath of [asset.sample_path, asset.preview_path]) {
      if (!filePath) continue;
      const resolved = path.resolve(filePath);
      if (
        [path.resolve(samplesDir), path.resolve(previewsDir)].some((root) => (
          resolved !== root && resolved.startsWith(`${root}${path.sep}`)
        ))
        && fs.existsSync(resolved)
      ) {
        fs.rmSync(resolved, { force: true });
      }
    }
    for (const file of fs.readdirSync(clonesDir)) {
      if (file.startsWith(`voice-${asset.id}-v`)) {
        fs.rmSync(path.join(clonesDir, file), { force: true });
      }
    }
    return {
      deleted: taskStore.deleteVoiceAsset(asset.id),
      id: asset.id,
      permanent: true,
    };
  }

  function reconcileTests(voiceAssetId = 0) {
    const tests = taskStore.listVoiceTests({ voiceAssetId });
    for (const test of tests) {
      if (!test.tts_job_id || !["waiting", "processing"].includes(test.status)) continue;
      const job = taskStore.getTtsJob(test.tts_job_id);
      if (!job) continue;
      if (job.status === "completed") {
        taskStore.updateVoiceTest(test.id, {
          status: "completed",
          audio_path: job.audio_path,
          error: "",
          completed_at: job.completed_at || new Date().toISOString(),
        });
        const asset = taskStore.getVoiceAsset(test.voice_asset_id);
        if (asset && !asset.preview_path) taskStore.updateVoiceAsset(asset.id, { preview_path: job.audio_path });
      } else if (job.status === "failed") {
        taskStore.updateVoiceTest(test.id, {
          status: "failed",
          error: job.error || "测试语音生成失败。",
          completed_at: job.completed_at || new Date().toISOString(),
        });
      } else if (job.status !== test.status) {
        taskStore.updateVoiceTest(test.id, { status: job.status });
      }
    }
    const ratings = taskStore.listVoiceRatings({ voiceAssetId });
    return taskStore.listVoiceTests({ voiceAssetId }).map((test) => ({
      ...test,
      audio_url: test.status === "completed" && test.tts_job_id ? `/api/tts/audio?id=${test.tts_job_id}` : "",
      rating: ratings.find((rating) => Number(rating.voice_test_id) === Number(test.id)) || null,
    }));
  }

  function createTests(id) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    if (asset.status !== "active" || !asset.voice_id || asset.voice_id.startsWith("pending-")) {
      return { error: "该声音尚未完成复刻，不能生成测试样音。" };
    }
    const metadata = safeJson(asset.metadata_json, {});
    const created = [];
    for (const script of testScripts) {
      const queued = ttsService.enqueue({
        provider: asset.provider,
        voice_id: asset.voice_id,
        voice_name: asset.voice_name,
        voice_asset_id: asset.id,
        model: metadata.target_model || "",
        text: script.text,
        emotion: script.emotion,
        style_prompt: `声音资产测试：${script.name}`,
        speed: 1,
        volume: 50,
        pitch: 1,
        format: "mp3",
      });
      if (queued.error) return { error: queued.error, tests: created };
      created.push(taskStore.createVoiceTest({
        voice_asset_id: asset.id,
        test_type: script.type,
        test_name: script.name,
        script: script.text,
        emotion: script.emotion,
        tts_job_id: queued.job.id,
        status: "waiting",
        metadata_json: JSON.stringify({ prompt: "voice_test_script.md" }),
      }));
    }
    return { tests: reconcileTests(asset.id) };
  }

  function saveRating(input) {
    const asset = taskStore.getVoiceAsset(input.voice_asset_id);
    if (!asset) return { error: "声音资产不存在。" };
    if (input.voice_test_id && !taskStore.getVoiceTest(input.voice_test_id)) return { error: "声音测试不存在。" };
    return { rating: taskStore.saveVoiceRating(input), asset: getAsset(asset.id) };
  }

  function resolveSamplePath(id) {
    return resolveAssetAudioPath(id, "sample");
  }

  return {
    listAssets,
    getAsset,
    createAsset,
    retryClone,
    updateAsset,
    createVersion,
    setDefault,
    getDefault,
    archive,
    deletePermanent,
    generatePreview,
    createCloneDraft,
    confirmCloneDraft,
    discardCloneDraft,
    resolveCloneDraftPreviewPath,
    cloneProviderRequirements,
    listStylePresets,
    getStylePreset,
    setDefaultStylePreset,
    deleteStylePreset,
    resolveAssetAudioPath,
    createTests,
    listTests: reconcileTests,
    saveRating,
    resolveSamplePath,
    testScripts,
  };
}
