import fs from "node:fs";
import path from "node:path";
import { TtsProviderAdapter, clampNumber, redactSecrets } from "../provider-adapter.js";

const DEFAULT_BASE_URL = "https://api.minimax.io/v1";
const DEFAULT_MODEL = "speech-2.6-hd";
const PREVIEW_TEXT = "你好，这是我的短视频配音试听。表达自然，节奏清楚，重点明确。";

const PRESET_VOICES = [
  {
    id: "Chinese (Mandarin)_News_Anchor",
    name: "知性主播",
    gender: "female",
    useCase: "新闻、知识口播",
    description: "清晰专业的普通话女声",
  },
  {
    id: "Chinese (Mandarin)_Mature_Woman",
    name: "成熟讲师",
    gender: "female",
    useCase: "教育、课程讲解",
    description: "稳重自然的成熟女声",
  },
  {
    id: "Chinese (Mandarin)_Warm_Bestie",
    name: "亲切学姐",
    gender: "female",
    useCase: "经验分享、生活口播",
    description: "亲切、有交流感的女声",
  },
  {
    id: "Chinese (Mandarin)_Wise_Women",
    name: "睿智顾问",
    gender: "female",
    useCase: "商业、方法论",
    description: "冷静可信的知识女声",
  },
  {
    id: "Chinese (Mandarin)_IntellectualGirl",
    name: "知性青年",
    gender: "female",
    useCase: "学习技巧、科普",
    description: "轻快但不幼稚的知性女声",
  },
  {
    id: "Chinese (Mandarin)_Reliable_Executive",
    name: "可靠经理",
    gender: "male",
    useCase: "商业、管理口播",
    description: "沉稳可信的商务男声",
  },
  {
    id: "Chinese (Mandarin)_Unrestrained_Young_Man",
    name: "活力青年",
    gender: "male",
    useCase: "短视频、广告",
    description: "节奏鲜明的青年男声",
  },
  {
    id: "Chinese (Mandarin)_Gentleman",
    name: "温和绅士",
    gender: "male",
    useCase: "故事、品牌介绍",
    description: "温和克制的叙述男声",
  },
  {
    id: "Chinese (Mandarin)_Male_Announcer",
    name: "专业播音",
    gender: "male",
    useCase: "新闻、宣传",
    description: "洪亮清楚的播音男声",
  },
  {
    id: "Chinese (Mandarin)_Southern_Young_Man",
    name: "自然青年",
    gender: "male",
    useCase: "知识口播、故事",
    description: "生活化、自然的青年男声",
  },
].map((voice) => ({
  ...voice,
  model: DEFAULT_MODEL,
  supportsEmotion: true,
  supportsSpeed: true,
  previewText: PREVIEW_TEXT,
}));

const EMOTION_MAP = {
  "自然": "neutral",
  "亲切": "happy",
  "专业": "neutral",
  "热情": "happy",
  "沉稳": "neutral",
  "激励": "surprised",
  "严肃": "neutral",
  "温柔": "calm",
};

function endpoint(baseUrl, pathname) {
  const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return base.endsWith("/v1") ? `${base}${suffix.replace(/^\/v1(?=\/|$)/, "")}` : `${base}${suffix}`;
}

function parseResponse(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function responseError(status, data, raw) {
  const code = Number(data?.base_resp?.status_code || data?.status_code || 0);
  const message = String(
    data?.base_resp?.status_msg
      || data?.message
      || data?.error?.message
      || raw
      || "",
  ).trim();
  if (status === 401 || status === 403 || /unauthorized|invalid.*key|鉴权|密钥/i.test(message)) {
    return "MiniMax：API Key 无效或未授权。";
  }
  if (status === 402 || /balance|quota|insufficient|余额|额度/i.test(message)) {
    return "MiniMax：余额不足或额度不可用。";
  }
  if (/voice/i.test(message)) return `MiniMax：音色不可用。${message ? ` ${message}` : ""}`;
  if (/model/i.test(message)) return `MiniMax：模型不可用。${message ? ` ${message}` : ""}`;
  return message
    ? `MiniMax 请求失败（${status || code}）：${message}`
    : `MiniMax 请求失败（${status || code || "未知"}）。`;
}

function voiceIdFromName(name) {
  const clean = String(name || "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .replace(/^([^A-Za-z])/, "v$1")
    .replace(/[-_]$/, "")
    .slice(0, 180);
  const suffix = Date.now().toString(36);
  const candidate = `${clean || "voice"}-${suffix}`;
  return candidate.length >= 8 ? candidate : `voice-${suffix}`;
}

async function readJsonResponse(response, apiKey) {
  const raw = await response.text();
  const data = parseResponse(raw);
  const statusCode = Number(data?.base_resp?.status_code || 0);
  if (!response.ok || statusCode !== 0) {
    throw new Error(redactSecrets(responseError(response.status, data, raw), [apiKey]));
  }
  return data;
}

export class MinimaxProvider extends TtsProviderAdapter {
  constructor(options = {}) {
    super({ id: "minimax", label: "MiniMax Speech", ...options });
  }

  listPresetVoices() {
    return PRESET_VOICES;
  }

  async healthCheck() {
    const apiKey = String(this.config.api_key || "").trim();
    if (!apiKey) return { status: "unconfigured", message: "MiniMax：未配置 API Key。" };
    try {
      const response = await fetch(endpoint(this.config.base_url, "/v1/get_voice"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ voice_type: "all" }),
      });
      await readJsonResponse(response, apiKey);
      return { status: "online", message: "MiniMax 连接正常。" };
    } catch (error) {
      return { status: "offline", message: error instanceof Error ? error.message : String(error) };
    }
  }

  async cloneVoice({
    name,
    audioPath,
    consentConfirmed,
    targetModel = DEFAULT_MODEL,
  }) {
    const apiKey = String(this.config.api_key || "").trim();
    const model = String(targetModel || this.config.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    if (!consentConfirmed) return this.failure("必须先确认拥有声音授权。");
    if (!apiKey) return this.failure("MiniMax：未配置 API Key。");
    if (!audioPath || !fs.existsSync(audioPath)) return this.failure("没有找到可用于克隆的参考音频。");

    try {
      const form = new FormData();
      form.append("purpose", "voice_clone");
      form.append("file", new Blob([fs.readFileSync(audioPath)]), path.basename(audioPath));
      const uploadResponse = await fetch(endpoint(this.config.base_url, "/v1/files/upload"), {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const uploaded = await readJsonResponse(uploadResponse, apiKey);
      const fileId = uploaded?.file?.file_id;
      if (!fileId) return this.failure("MiniMax：参考音频上传成功，但没有返回 file_id。");

      const voiceId = voiceIdFromName(name);
      const cloneResponse = await fetch(endpoint(this.config.base_url, "/v1/voice_clone"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          file_id: fileId,
          voice_id: voiceId,
          text: PREVIEW_TEXT,
          model,
          language_boost: "Chinese",
          need_noise_reduction: true,
          need_volume_normalization: true,
        }),
      });
      const cloned = await readJsonResponse(cloneResponse, apiKey);
      return {
        success: true,
        provider: this.id,
        voice_id: voiceId,
        metadata: {
          target_model: model,
          file_id: fileId,
          demo_audio: String(cloned.demo_audio || ""),
          supports_emotion: true,
          supports_speed: true,
        },
      };
    } catch (error) {
      return this.failure("MiniMax 声音克隆失败。", error instanceof Error ? error.message : String(error));
    }
  }

  async deleteVoice({ voiceId, voiceType = "voice_cloning" } = {}) {
    const apiKey = String(this.config.api_key || "").trim();
    if (!apiKey) return this.failure("MiniMax：未配置 API Key。");
    if (!String(voiceId || "").trim()) return this.failure("缺少需要删除的 voice_id。");
    try {
      const response = await fetch(endpoint(this.config.base_url, "/v1/delete_voice"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          voice_type: voiceType,
          voice_id: String(voiceId).trim(),
        }),
      });
      await readJsonResponse(response, apiKey);
      return { success: true, provider: this.id, voice_id: String(voiceId).trim() };
    } catch (error) {
      return this.failure("MiniMax 音色删除失败。", error instanceof Error ? error.message : String(error));
    }
  }

  async generateSpeech({
    text,
    voiceId,
    emotion = "自然",
    speed = 1,
    volume = 50,
    pitch = 1,
    format = "mp3",
    outputPath,
    model: requestedModel = "",
  }) {
    const apiKey = String(this.config.api_key || "").trim();
    const model = String(requestedModel || this.config.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const voice = String(voiceId || this.config.voice || "").trim();
    const safeFormat = format === "wav" ? "wav" : "mp3";
    if (!apiKey) return this.failure("MiniMax：未配置 API Key。");
    if (!String(text || "").trim()) return this.failure("请输入需要生成语音的文案。");
    if (!voice) return this.failure("请选择 MiniMax 预设音色或克隆音色。");

    const normalizedSpeed = clampNumber(speed, 0.5, 2, 1);
    const normalizedVolume = clampNumber(Number(volume) / 50, 0.1, 2, 1);
    const normalizedPitch = Math.round(clampNumber((Number(pitch || 1) - 1) * 6, -12, 12, 0));
    const normalizedEmotion = EMOTION_MAP[String(emotion || "").trim()] || "neutral";

    try {
      const response = await fetch(endpoint(this.config.base_url, "/v1/t2a_v2"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          text: String(text).trim(),
          stream: false,
          language_boost: "Chinese",
          output_format: "hex",
          voice_setting: {
            voice_id: voice,
            speed: normalizedSpeed,
            vol: normalizedVolume,
            pitch: normalizedPitch,
            emotion: normalizedEmotion,
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: safeFormat,
            channel: 1,
          },
          subtitle_enable: true,
          subtitle_type: "word",
        }),
      });
      const data = await readJsonResponse(response, apiKey);
      const encoded = String(data?.data?.audio || "").trim();
      if (!encoded) return this.failure("MiniMax：接口没有返回音频数据。");
      const buffer = Buffer.from(encoded, "hex");
      if (!buffer.length) return this.failure("MiniMax：音频数据为空。");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, buffer);
      return this.success({
        voice_id: voice,
        audio_path: outputPath,
        format: safeFormat,
        speed: normalizedSpeed,
        emotion,
        duration: Number(data?.extra_info?.audio_length || 0) / 1000,
        metadata: {
          model,
          provider: "minimax",
          trace_id: String(data.trace_id || ""),
          bytes: buffer.length,
          emotion_sent: normalizedEmotion,
          subtitles: data?.data?.subtitle || data?.subtitle || [],
          audio_length_ms: Number(data?.extra_info?.audio_length || 0),
        },
      });
    } catch (error) {
      return this.failure("MiniMax 语音生成失败。", error instanceof Error ? error.message : String(error));
    }
  }
}
