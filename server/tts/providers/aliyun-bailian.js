import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { TtsProviderAdapter, clampNumber, redactSecrets } from "../provider-adapter.js";

const COSYVOICE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer";
const QWEN_TTS_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const VOICE_CLONE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization";

const PRESET_VOICES = [
  { id: "longxiaochun_v2", name: "龙小淳", model: "cosyvoice-v2", description: "知性积极女声" },
  { id: "longxiaoxia_v2", name: "龙小夏", model: "cosyvoice-v2", description: "沉稳权威女声" },
  { id: "longshuo_v2", name: "龙硕", model: "cosyvoice-v2", description: "博才干练男声" },
  { id: "longshu_v2", name: "龙书", model: "cosyvoice-v2", description: "沉稳青年男声" },
  { id: "longanpei", name: "龙安培", model: "cosyvoice-v3-plus", description: "青少年教师女声" },
  { id: "longanyang", name: "龙安洋", model: "cosyvoice-v3-flash", description: "阳光活力男声，支持指令", supportsInstruction: true },
  { id: "Cherry", name: "芊悦", model: "qwen3-tts-flash", description: "阳光亲切女声" },
  { id: "Serena", name: "苏瑶", model: "qwen3-tts-flash", description: "温柔女声" },
  { id: "Ethan", name: "晨煦", model: "qwen3-tts-flash", description: "阳光温暖男声" },
  { id: "Chelsie", name: "千雪", model: "qwen3-tts-flash", description: "活泼虚拟女声" },
];

function runFfmpeg(ffmpegPath, inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-y", "-i", inputPath, outputPath], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || "音频格式转换失败"));
    });
  });
}

async function saveAudioResponse(audioUrl, outputPath, ffmpegPath) {
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error(`下载合成音频失败（${response.status}）`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const tempPath = `${outputPath}.source`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(tempPath, buffer);
  try {
    await runFfmpeg(ffmpegPath, tempPath, outputPath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function isQwenModel(model) {
  return /^qwen/i.test(model);
}

function buildInstruction(emotion, stylePrompt) {
  return [emotion ? `情绪：${emotion}` : "", stylePrompt].filter(Boolean).join("；").slice(0, 100);
}

export class AliyunBailianProvider extends TtsProviderAdapter {
  constructor(options = {}) {
    super({ id: "aliyun_bailian", label: "阿里云百炼 CosyVoice / Qwen-TTS", ...options });
  }

  listPresetVoices() {
    return PRESET_VOICES;
  }

  async cloneVoice({
    name,
    audioPath,
    consentConfirmed,
    targetModel = "qwen3-tts-vc-2026-01-22",
    mimeType = "audio/mpeg",
    transcript = "",
  }) {
    const apiKey = String(this.config.api_key || "").trim();
    if (!consentConfirmed) return this.failure("必须先确认拥有声音授权。");
    if (!apiKey) return this.failure("请先在语音实验室保存阿里云百炼 API Key。");
    if (!audioPath || !fs.existsSync(audioPath)) return this.failure("没有找到可用于复刻的参考音频。");
    const safeMime = ["audio/wav", "audio/mpeg", "audio/mp4"].includes(mimeType) ? mimeType : "audio/mpeg";
    const preferredName = String(name || "voice")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 16) || `voice${Date.now().toString().slice(-6)}`;
    const audioData = fs.readFileSync(audioPath).toString("base64");

    try {
      const response = await fetch(VOICE_CLONE_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(this.config.workspace_id ? { "X-DashScope-WorkSpace": this.config.workspace_id } : {}),
        },
        body: JSON.stringify({
          model: "qwen-voice-enrollment",
          input: {
            action: "create",
            target_model: targetModel,
            preferred_name: preferredName,
            audio: { data: `data:${safeMime};base64,${audioData}` },
            language: "zh",
            ...(String(transcript || "").trim() ? { text: String(transcript).trim() } : {}),
          },
        }),
      });
      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (!response.ok || data.code || data.status_code >= 400) {
        return this.failure(data.message || data.code || `阿里云百炼声音复刻失败（${response.status}）`);
      }
      const voiceId = data.output?.voice || data.output?.voice_id || "";
      if (!voiceId) return this.failure("阿里云百炼未返回 voice_id。");
      return {
        success: true,
        provider: this.id,
        voice_id: voiceId,
        metadata: {
          target_model: data.output?.target_model || targetModel,
          preferred_name: preferredName,
          request_id: data.request_id || "",
          fallback_mode: Boolean(data.output?.fallback_mode),
          fallback_reason: String(data.output?.fallback_reason || ""),
        },
      };
    } catch (error) {
      return this.failure("声音复刻失败。", redactSecrets(error instanceof Error ? error.message : error, [apiKey]));
    }
  }

  async generateSpeech({
    text,
    voiceId,
    emotion = "",
    stylePrompt = "",
    speed = 1,
    volume = 50,
    pitch = 1,
    format = "mp3",
    outputPath,
    model: requestedModel = "",
  }) {
    const apiKey = String(this.config.api_key || "").trim();
    const model = String(requestedModel || this.config.default_model || "cosyvoice-v2").trim();
    const voice = String(voiceId || this.config.default_voice || "").trim();
    const safeFormat = format === "wav" ? "wav" : "mp3";
    if (!apiKey) return this.failure("请先在语音实验室保存阿里云百炼 API Key。");
    if (!text?.trim()) return this.failure("请输入需要生成语音的文案。");
    if (!voice) return this.failure("请选择预设音色或填写 voice_id。");
    if (!this.ffmpegPath) return this.failure("本地 FFmpeg 组件不可用。");

    const normalizedSpeed = clampNumber(speed, 0.5, 2, 1);
    const normalizedVolume = Math.round(clampNumber(volume, 0, 100, 50));
    const normalizedPitch = clampNumber(pitch, 0.5, 2, 1);
    const instruction = buildInstruction(emotion, stylePrompt);
    const qwen = isQwenModel(model);
    const preset = PRESET_VOICES.find((item) => item.id === voice);
    const cosyInstructionSupported = /cosyvoice-v3\.5/i.test(model)
      || (/cosyvoice-v3-(?:flash|plus)/i.test(model) && (!preset || preset.supportsInstruction));
    const ignoredParameters = [];
    const locallyConvertedParameters = [];
    const input = qwen
      ? {
          text: text.trim(),
          voice,
          language_type: "Chinese",
        }
      : {
          text: text.trim(),
          voice,
          format: safeFormat,
          sample_rate: 24000,
          volume: normalizedVolume,
          rate: normalizedSpeed,
          pitch: normalizedPitch,
        };

    if (qwen) {
      if (/instruct/i.test(model) && instruction) {
        input.instructions = instruction;
        input.optimize_instructions = true;
      } else if (instruction) {
        ignoredParameters.push("emotion", "stylePrompt");
      }
      if (normalizedSpeed !== 1) ignoredParameters.push("speed");
      if (normalizedVolume !== 50) ignoredParameters.push("volume");
      if (normalizedPitch !== 1) ignoredParameters.push("pitch");
      locallyConvertedParameters.push("format");
    } else if (instruction && cosyInstructionSupported) {
      input.instruction = instruction;
    } else if (instruction) {
      ignoredParameters.push("emotion", "stylePrompt");
    }

    try {
      const response = await fetch(qwen ? QWEN_TTS_ENDPOINT : COSYVOICE_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(this.config.workspace_id ? { "X-DashScope-WorkSpace": this.config.workspace_id } : {}),
        },
        body: JSON.stringify({ model, input }),
      });
      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (!response.ok || data.code || data.status_code >= 400) {
        const message = data.message || data.code || `阿里云百炼请求失败（${response.status}）`;
        return this.failure(message);
      }
      const audioUrl = data.output?.audio?.url || data.output?.audio_url || data.audio?.url || "";
      if (!audioUrl) return this.failure("阿里云百炼未返回可下载的音频地址。");

      await saveAudioResponse(audioUrl, outputPath, this.ffmpegPath);
      return this.success({
        voice_id: voice,
        audio_path: outputPath,
        format: safeFormat,
        speed: normalizedSpeed,
        emotion,
        metadata: {
          model,
          request_id: data.request_id || "",
          characters: data.usage?.characters || 0,
          ignored_parameters: [...new Set(ignoredParameters)],
          locally_converted_parameters: [...new Set(locallyConvertedParameters)],
          source_format: path.extname(new URL(audioUrl).pathname).slice(1) || "unknown",
        },
      });
    } catch (error) {
      return this.failure("语音生成失败。", redactSecrets(error instanceof Error ? error.message : error, [apiKey]));
    }
  }
}
