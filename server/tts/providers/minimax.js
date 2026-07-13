import fs from "node:fs";
import path from "node:path";
import { TtsProviderAdapter, clampNumber, redactSecrets } from "../provider-adapter.js";

const DEFAULT_BASE_URL = "https://api.minimaxi.com";
const DEFAULT_MODEL = "speech-2.6-hd";
const PREVIEW_TEXT = "你好，这是我的短视频配音试听。表达自然，节奏清楚，重点明确。";

const PRESET_VOICES = [
  {
    id: "Chinese (Mandarin)_News_Anchor",
    name: "知性主播",
    gender: "female",
    category: "常用口播",
    useCase: "新闻、知识口播",
    description: "清晰专业的普通话女声",
  },
  {
    id: "Chinese (Mandarin)_Mature_Woman",
    name: "成熟讲师",
    gender: "female",
    category: "常用口播",
    useCase: "教育、课程讲解",
    description: "稳重自然的成熟女声",
  },
  {
    id: "Chinese (Mandarin)_Warm_Bestie",
    name: "亲切学姐",
    gender: "female",
    category: "常用口播",
    useCase: "经验分享、生活口播",
    description: "亲切、有交流感的女声",
  },
  {
    id: "Chinese (Mandarin)_Sweet_Lady",
    name: "甜美女声",
    gender: "female",
    category: "常用口播",
    useCase: "课程介绍、亲和讲解",
    description: "甜美清楚，适合轻教育和产品介绍",
  },
  {
    id: "Chinese (Mandarin)_IntellectualGirl",
    name: "知性青年",
    gender: "female",
    category: "常用口播",
    useCase: "学习技巧、科普",
    description: "轻快但不幼稚的知性女声",
  },
  {
    id: "Chinese (Mandarin)_Reliable_Executive",
    name: "可靠经理",
    gender: "male",
    category: "常用口播",
    useCase: "商业、管理口播",
    description: "沉稳可信的商务男声",
  },
  {
    id: "Chinese (Mandarin)_Unrestrained_Young_Man",
    name: "活力青年",
    gender: "male",
    category: "常用口播",
    useCase: "短视频、广告",
    description: "节奏鲜明的青年男声",
  },
  {
    id: "Chinese (Mandarin)_Gentleman",
    name: "温和绅士",
    gender: "male",
    category: "常用口播",
    useCase: "故事、品牌介绍",
    description: "温和克制的叙述男声",
  },
  {
    id: "Chinese (Mandarin)_Male_Announcer",
    name: "专业播音",
    gender: "male",
    category: "常用口播",
    useCase: "新闻、宣传",
    description: "洪亮清楚的播音男声",
  },
  {
    id: "Chinese (Mandarin)_Southern_Young_Man",
    name: "自然青年",
    gender: "male",
    category: "方言口味",
    useCase: "知识口播、故事",
    description: "生活化、自然的青年男声",
  },
  {
    id: "Chinese (Mandarin)_Radio_Host",
    name: "电台主持",
    gender: "male",
    category: "氛围叙事",
    useCase: "故事感、情绪化旁白",
    description: "带电台感的叙述声音，适合情绪开场",
  },
  {
    id: "Chinese (Mandarin)_Lyrical_Voice",
    name: "抒情男声",
    gender: "male",
    category: "唱歌/类唱腔",
    useCase: "抒情文案、慢节奏旁白",
    description: "更柔和的抒情声线；注意这不是歌曲生成",
  },
  {
    id: "Arrogant_Miss",
    name: "嚣张小姐",
    gender: "female",
    category: "特殊角色",
    useCase: "反差角色、吐槽短视频",
    description: "更有态度和戏剧感的女声",
    previewText: "别急，重点来了。这段内容要讲得有态度，也要让人记得住。",
  },
  {
    id: "Robot_Armor",
    name: "机械战甲",
    gender: "male",
    category: "特殊角色",
    useCase: "科技感、AI梗、夸张开场",
    description: "机械化角色音色，适合搞怪或科技包装",
    previewText: "系统已启动。请注意，接下来进入高能知识点。",
  },
  {
    id: "Chinese (Mandarin)_Kind-hearted_Antie",
    name: "热心大婶",
    gender: "female",
    category: "搞怪角色",
    useCase: "生活化、接地气、搞笑点评",
    description: "热情、口语化，适合轻松吐槽",
    previewText: "我跟你讲，这个方法真不是玄学，照着做就能看见变化。",
  },
  {
    id: "Chinese (Mandarin)_HK_Flight_Attendant",
    name: "港普空姐",
    gender: "female",
    category: "方言口味",
    useCase: "港普风、反差开场",
    description: "带港普味道的女声，适合轻松或搞怪场景",
  },
  {
    id: "Chinese (Mandarin)_Humorous_Elder",
    name: "搞笑大爷",
    gender: "male",
    category: "搞怪角色",
    useCase: "搞笑点评、反差口播",
    description: "幽默、年长角色感，适合梗视频",
    previewText: "年轻人，别光收藏不行动。这个办法，今天就能用起来。",
  },
  {
    id: "Chinese (Mandarin)_Kind-hearted_Elder",
    name: "花甲奶奶",
    gender: "female",
    category: "搞怪角色",
    useCase: "温和提醒、生活口播",
    description: "年长、亲切的女声，适合温柔劝导",
  },
  {
    id: "Chinese (Mandarin)_Cute_Spirit",
    name: "憨憨萌兽",
    gender: "neutral",
    category: "搞怪角色",
    useCase: "萌系、卡通、轻松转场",
    description: "偏可爱卡通感的特殊音色",
    previewText: "叮咚，今天的小技巧已经送到，请马上开始行动。",
  },
  {
    id: "cartoon_pig",
    name: "卡通猪小琪",
    gender: "neutral",
    category: "搞怪角色",
    useCase: "卡通搞怪、儿童向、反差梗",
    description: "卡通角色声，适合趣味提示和片头梗",
    previewText: "嘿嘿，今天这个知识点，听完你就不容易忘啦。",
  },
  {
    id: "bingjiao_didi",
    name: "病娇弟弟",
    gender: "male",
    category: "特殊角色",
    useCase: "角色扮演、剧情反差",
    description: "更强角色感的男声，适合剧情化短视频",
  },
  {
    id: "badao_shaoye",
    name: "霸道少爷",
    gender: "male",
    category: "特殊角色",
    useCase: "广告梗、剧情口播",
    description: "夸张角色男声，适合娱乐化包装",
  },
  {
    id: "diadia_xuemei",
    name: "嗲嗲学妹",
    gender: "female",
    category: "特殊角色",
    useCase: "轻娱乐、剧情反差",
    description: "偏甜、偏角色化的女声",
  },
  {
    id: "qiaopi_mengmei",
    name: "俏皮萌妹",
    gender: "female",
    category: "搞怪角色",
    useCase: "轻松知识、趣味提醒",
    description: "俏皮、有活力，适合轻松短视频",
  },
  {
    id: "Cantonese_PlayfulMan",
    name: "粤语活泼男声",
    gender: "male",
    category: "方言口味",
    useCase: "粤语内容、轻松口播",
    description: "粤语男声，适合粤语文案或方言风格测试",
  },
  {
    id: "Cantonese_CuteGirl",
    name: "粤语可爱女孩",
    gender: "female",
    category: "方言口味",
    useCase: "粤语内容、可爱口播",
    description: "粤语女声，适合粤语文案或趣味内容",
  },
].map((voice) => ({
  ...voice,
  model: DEFAULT_MODEL,
  supportsEmotion: true,
  supportsSpeed: true,
  previewText: PREVIEW_TEXT,
}));

export const MINIMAX_PRESET_VOICE_IDS = new Set(PRESET_VOICES.map((voice) => voice.id));

const EMOTION_MAP = {
  "自然": "neutral",
  "亲切": "happy",
  "专业": "neutral",
  "热情": "happy",
  "兴奋": "happy",
  "沉稳": "calm",
  "激励": "surprised",
  "严肃": "calm",
  "温柔": "calm",
  "焦急": "fearful",
  "震惊": "surprised",
  "痞里带刺": "angry",
  "家长劝告": "calm",
  "招生转化": "happy",
};

function normalizeMiniMaxEmotion(emotion = "", stylePrompt = "") {
  const selected = String(emotion || "").trim();
  if (EMOTION_MAP[selected]) return EMOTION_MAP[selected];
  const text = [selected, stylePrompt].map((item) => String(item || "")).join(" ");
  if (/开心|高兴|亲切|热情|兴奋|鼓励|转化|积极|活力|明亮|轻快/i.test(text)) return "happy";
  if (/焦急|紧迫|担心|害怕|恐惧|催促|急迫/i.test(text)) return "fearful";
  if (/震惊|惊讶|意外|惊喜|激励|高能|强调/i.test(text)) return "surprised";
  if (/愤怒|生气|强硬|犀利|吐槽|讽刺|痞|带刺/i.test(text)) return "angry";
  if (/难过|悲伤|遗憾|低落/i.test(text)) return "sad";
  if (/嫌弃|厌恶|反感/i.test(text)) return "disgusted";
  if (/温柔|沉稳|严肃|克制|耐心|家长|老师|平稳|安静|稳重/i.test(text)) return "calm";
  if (/流畅|顺滑|连贯|自然讲述/i.test(text)) return "fluent";
  return "neutral";
}

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
    stylePrompt = "",
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
    const normalizedEmotion = normalizeMiniMaxEmotion(emotion, stylePrompt);

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
