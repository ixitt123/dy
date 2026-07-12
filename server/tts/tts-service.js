import fs from "node:fs";
import path from "node:path";
import { createTtsProvider } from "./providers/index.js";
import { redactSecrets } from "./provider-adapter.js";

const PROMPT_FILES = ["tts_script_prepare.md", "tts_emotion_prompt.md"];

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

export function createTtsService({ baseDir, taskStore, getSettings, ffmpegPath, onJobCompleted = () => {} }) {
  const outputDir = path.join(baseDir, ".data", "tts", "audio");
  const promptsDir = path.join(baseDir, "prompts");
  const pending = [];
  let working = false;

  fs.mkdirSync(outputDir, { recursive: true });
  for (const file of PROMPT_FILES) {
    if (!fs.existsSync(path.join(promptsDir, file))) {
      throw new Error(`缺少 TTS Prompt：${file}`);
    }
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
    return {
      ...job,
      error: visibleError(job, metadata),
      audio_url: job.status === "completed" && job.audio_path ? `/api/tts/audio?id=${job.id}` : "",
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
    const outputPath = path.join(outputDir, `tts-${job.id}.${job.format === "wav" ? "wav" : "mp3"}`);
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

    taskStore.updateTtsJob(job.id, {
      audio_path: result.audio_path,
      status: "completed",
      error: "",
      metadata_json: JSON.stringify({
        ...jobMetadata,
        ...prepared.metadata,
        ...(result.metadata || {}),
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
    return taskStore.listTtsJobs({ limit }).map(publicJob);
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
    if (deleteFile && job.audio_path) {
      const root = path.resolve(outputDir);
      const target = path.resolve(job.audio_path);
      if (target !== root && target.startsWith(`${root}${path.sep}`) && fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
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
    const provider = getProvider(providerId);
    if (!provider) return [];
    const presets = provider.listPresetVoices();
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

  for (const job of taskStore.listTtsJobs({ limit: 500 })) {
    if (!["waiting", "processing"].includes(job.status)) continue;
    taskStore.updateTtsJob(job.id, { status: "waiting", error: "" });
    pending.push(job.id);
  }
  if (pending.length) setTimeout(() => drain().catch(() => {}), 0);

  return {
    enqueue,
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
  };
}
