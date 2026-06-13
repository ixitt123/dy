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

export function createTtsService({ baseDir, taskStore, getSettings, ffmpegPath }) {
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
    const job = taskStore.createTtsJob({
      task_id: input.task_id,
      rewrite_id: input.rewrite_id,
      provider,
      voice_id: String(input.voice_id || providerConfig(settings, provider).default_voice || ""),
      voice_name: String(input.voice_name || ""),
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
        model: String(input.model || ""),
        voice_asset_id: Number(input.voice_asset_id || 0),
      }),
    });
    if (Number(input.voice_asset_id || 0) > 0) taskStore.recordVoiceUse(Number(input.voice_asset_id));
    pending.push(job.id);
    drain().catch(() => {});
    return { job: publicJob(job) };
  }

  function listJobs(limit = 50) {
    return taskStore.listTtsJobs({ limit }).map(publicJob);
  }

  function getJob(id) {
    return publicJob(taskStore.getTtsJob(id));
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
    return presets;
  }

  for (const job of taskStore.listTtsJobs({ limit: 500 })) {
    if (!["waiting", "processing"].includes(job.status)) continue;
    taskStore.updateTtsJob(job.id, { status: "waiting", error: "" });
    pending.push(job.id);
  }
  if (pending.length) setTimeout(() => drain().catch(() => {}), 0);

  return {
    enqueue,
    getJob,
    listJobs,
    listVoices,
    outputDir,
  };
}
