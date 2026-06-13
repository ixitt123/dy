import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawn } from "node:child_process";
import { TtsProviderAdapter, clampNumber, redactSecrets } from "../provider-adapter.js";

const COSYVOICE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer";
const QWEN_TTS_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const VOICE_CLONE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization";

const PRESET_VOICES = [
  { id: "longanyang", name: "龙安洋", model: "cosyvoice-v3-flash", description: "阳光活力男声，支持指令", supportsInstruction: true },
  { id: "longanhuan_v3", name: "龙安欢（V3）", model: "cosyvoice-v3-flash", description: "欢脱元气女，支持多方言和指令", supportsInstruction: true },
  { id: "longanhuan", name: "龙安欢", model: "cosyvoice-v3-flash", description: "欢脱元气女，支持指令", supportsInstruction: true },
  { id: "longhuhu_v3", name: "龙呼呼", model: "cosyvoice-v3-flash", description: "天真烂漫女童，支持指令", supportsInstruction: true },
  { id: "longpaopao_v3", name: "龙泡泡", model: "cosyvoice-v3-flash", description: "飞天泡泡音" },
  { id: "longjielidou_v3", name: "龙杰力豆", model: "cosyvoice-v3-flash", description: "阳光顽皮男童" },
  { id: "longxian_v3", name: "龙仙", model: "cosyvoice-v3-flash", description: "豪放可爱女声" },
  { id: "longling_v3", name: "龙铃", model: "cosyvoice-v3-flash", description: "稚气呆板女童" },
  { id: "longshanshan_v3", name: "龙闪闪", model: "cosyvoice-v3-flash", description: "戏剧化童声" },
  { id: "longniuniu_v3", name: "龙牛牛", model: "cosyvoice-v3-flash", description: "阳光男童声" },
  { id: "longjiaxin_v3", name: "龙嘉欣", model: "cosyvoice-v3-flash", description: "优雅粤语女声" },
  { id: "longjiayi_v3", name: "龙嘉怡", model: "cosyvoice-v3-flash", description: "知性粤语女声" },
  { id: "longanyue_v3", name: "龙安粤", model: "cosyvoice-v3-flash", description: "欢脱粤语男声" },
  { id: "longlaotie_v3", name: "龙老铁", model: "cosyvoice-v3-flash", description: "东北直率男声" },
  { id: "longshange_v3", name: "龙陕哥", model: "cosyvoice-v3-flash", description: "原味陕北男声" },
  { id: "longanmin_v3", name: "龙安闽", model: "cosyvoice-v3-flash", description: "闽南话女声" },
  { id: "longxiaochun_v2", name: "龙小淳", model: "cosyvoice-v2", description: "知性积极女声" },
  { id: "longxiaoxia_v2", name: "龙小夏", model: "cosyvoice-v2", description: "沉稳权威女声" },
  { id: "longshuo_v2", name: "龙硕", model: "cosyvoice-v2", description: "博才干练男声" },
  { id: "longshu_v2", name: "龙书", model: "cosyvoice-v2", description: "沉稳青年男声" },
  { id: "longanpei", name: "龙安培", model: "cosyvoice-v3-plus", description: "青少年教师女声" },
  { id: "Cherry", name: "芊悦", model: "qwen3-tts-flash", description: "阳光亲切女声" },
  { id: "Serena", name: "苏瑶", model: "qwen3-tts-flash", description: "温柔女声" },
  { id: "Ethan", name: "晨煦", model: "qwen3-tts-flash", description: "阳光温暖男声" },
  { id: "Chelsie", name: "千雪", model: "qwen3-tts-flash", description: "活泼虚拟女声" },
  { id: "Momo", name: "茉兔", model: "qwen3-tts-flash", description: "撒娇搞怪女声" },
  { id: "Vivian", name: "十三", model: "qwen3-tts-flash", description: "拽拽可爱女声" },
  { id: "Moon", name: "月白", model: "qwen3-tts-flash", description: "率性帅气男声" },
  { id: "Maia", name: "四月", model: "qwen3-tts-flash", description: "知性温柔女声" },
  { id: "Kai", name: "凯", model: "qwen3-tts-flash", description: "磁性男声" },
  { id: "Nofish", name: "不吃鱼", model: "qwen3-tts-flash", description: "设计师男声" },
  { id: "Bella", name: "萌宝", model: "qwen3-tts-flash", description: "萝莉女声" },
  { id: "Jennifer", name: "詹妮弗", model: "qwen3-tts-flash", description: "电影质感美语女声" },
  { id: "Ryan", name: "甜茶", model: "qwen3-tts-flash", description: "戏感张力男声" },
  { id: "Katerina", name: "卡捷琳娜", model: "qwen3-tts-flash", description: "御姐女声" },
  { id: "Aiden", name: "艾登", model: "qwen3-tts-flash", description: "美语男声" },
  { id: "Eldric Sage", name: "沧明子", model: "qwen3-tts-flash", description: "沉稳睿智老者" },
  { id: "Mia", name: "乖小妹", model: "qwen3-tts-flash", description: "温顺乖巧女声" },
  { id: "Mochi", name: "沙小弥", model: "qwen3-tts-flash", description: "聪明童声男" },
  { id: "Bellona", name: "燕铮莺", model: "qwen3-tts-flash", description: "洪亮清晰女声" },
  { id: "Vincent", name: "田叔", model: "qwen3-tts-flash", description: "沙哑烟嗓男声" },
  { id: "Bunny", name: "萌小姬", model: "qwen3-tts-flash", description: "萌系萝莉女声" },
  { id: "Neil", name: "阿闻", model: "qwen3-tts-flash", description: "新闻主持男声" },
  { id: "Elias", name: "墨讲师", model: "qwen3-tts-flash", description: "知识讲解女声" },
  { id: "Arthur", name: "徐大爷", model: "qwen3-tts-flash", description: "质朴长者男声" },
  { id: "Nini", name: "邻家妹妹", model: "qwen3-tts-flash", description: "甜软女声" },
  { id: "Seren", name: "小婉", model: "qwen3-tts-flash", description: "温和舒缓女声" },
  { id: "Pip", name: "顽屁小孩", model: "qwen3-tts-flash", description: "调皮童声男" },
  { id: "Stella", name: "少女阿月", model: "qwen3-tts-flash", description: "迷糊少女音" },
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detailedError(error) {
  const parts = [error instanceof Error ? error.message : String(error)];
  const cause = error?.cause;
  if (cause?.code) parts.push(`code=${cause.code}`);
  if (cause?.message && cause.message !== parts[0]) parts.push(cause.message);
  if (cause?.errno) parts.push(`errno=${cause.errno}`);
  return parts.filter(Boolean).join("；");
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (index < attempts - 1) await wait(700 * (index + 1));
    }
  }
  throw new Error(detailedError(lastError));
}

function downloadWithNodeClient(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "http:" ? http : https;
    const request = client.get(parsed, (response) => {
      const status = Number(response.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location && redirectCount < 4) {
        response.resume();
        const nextUrl = new URL(response.headers.location, parsed).toString();
        downloadWithNodeClient(nextUrl, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`下载合成音频失败：${status}`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.setTimeout(30000, () => {
      request.destroy(new Error("下载合成音频超时"));
    });
    request.on("error", reject);
  });
}

async function saveAudioResponse(audioUrl, outputPath, ffmpegPath) {
  let buffer = null;
  try {
    const response = await fetchWithRetry(audioUrl, {}, 3);
    if (!response.ok) throw new Error(`下载合成音频失败（${response.status}）`);
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    try {
      buffer = await downloadWithNodeClient(audioUrl);
    } catch (fallbackError) {
      throw new Error(`下载合成音频失败：${detailedError(error)}；备用下载也失败：${detailedError(fallbackError)}`);
    }
  }
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
      const response = await fetchWithRetry(qwen ? QWEN_TTS_ENDPOINT : COSYVOICE_ENDPOINT, {
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
        const detail = [
          data.request_id ? `request_id=${data.request_id}` : "",
          data.code ? `code=${data.code}` : "",
          raw ? raw.slice(0, 600) : "",
        ].filter(Boolean).join("；");
        return this.failure(message, detail);
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
      return this.failure("语音生成失败。", redactSecrets(detailedError(error), [apiKey]));
    }
  }
}
