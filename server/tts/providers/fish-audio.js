import fs from "node:fs";
import path from "node:path";
import { TtsProviderAdapter, clampNumber, redactSecrets } from "../provider-adapter.js";

const DEFAULT_BASE_URL = "https://api.fish.audio";
const DEFAULT_MODEL = "s2-pro";

function normalizeFishError(status, bodyText) {
  let data = {};
  try {
    data = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    data = {};
  }
  const message = String(data.message || data.error?.message || data.error || bodyText || "").trim();
  const raw = `${status} ${message}`.toLowerCase();
  if (status === 401 || status === 403 || raw.includes("unauthorized") || raw.includes("invalid")) {
    return "Fish Audio：API Key 无效或未授权。";
  }
  if (status === 402 || raw.includes("balance") || raw.includes("quota") || raw.includes("insufficient")) {
    return "Fish Audio：余额不足或额度不可用。";
  }
  if (raw.includes("reference") || raw.includes("voice")) {
    return "Fish Audio：voice_id / reference_id 无效。";
  }
  if (raw.includes("model")) return "Fish Audio：模型为空、模型无效或未开通。";
  return message ? `Fish Audio 请求失败（${status}）：${message}` : `Fish Audio 请求失败（${status}）。`;
}

export class FishAudioProvider extends TtsProviderAdapter {
  constructor(options = {}) {
    super({ id: "fish_audio", label: "Fish Audio", ...options });
  }

  async generateSpeech({
    text,
    voiceId,
    speed = 1,
    volume = 50,
    format = "mp3",
    outputPath,
    model: requestedModel = "",
  }) {
    const apiKey = String(this.config.api_key || "").trim();
    const baseUrl = String(this.config.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const model = String(requestedModel || this.config.model || DEFAULT_MODEL).trim();
    const referenceId = String(voiceId || this.config.voice || this.config.reference_id || "").trim();
    const safeFormat = ["wav", "mp3", "opus"].includes(String(format || "").toLowerCase())
      ? String(format).toLowerCase()
      : "mp3";

    if (!apiKey) return this.failure("Fish Audio：未配置 API Key。");
    if (!model) return this.failure("Fish Audio：模型为空。");
    if (!String(text || "").trim()) return this.failure("请输入需要生成语音的文案。");
    if (!referenceId) return this.failure("Fish Audio：请填写 voice_id / reference_id。");

    try {
      const response = await fetch(`${baseUrl}/v1/tts`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          model,
        },
        body: JSON.stringify({
          text: String(text).trim(),
          reference_id: referenceId,
          prosody: {
            speed: clampNumber(speed, 0.5, 2, 1),
            volume: Math.round(clampNumber(volume, 0, 100, 50) - 50),
            normalize_loudness: true,
          },
          normalize: true,
          format: safeFormat,
          latency: "normal",
          mp3_bitrate: 128,
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        return this.failure(normalizeFishError(response.status, raw), redactSecrets(raw, [apiKey]));
      }
      if (contentType.includes("application/json")) {
        const raw = await response.text();
        return this.failure(normalizeFishError(response.status, raw), redactSecrets(raw, [apiKey]));
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) return this.failure("Fish Audio：音频保存失败，接口返回空音频。");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, buffer);
      return this.success({
        voice_id: referenceId,
        audio_path: outputPath,
        format: safeFormat,
        speed,
        metadata: {
          model,
          reference_id: referenceId,
          provider: "fish_audio",
          bytes: buffer.length,
        },
      });
    } catch (error) {
      return this.failure("Fish Audio：网络错误或音频保存失败。", redactSecrets(error instanceof Error ? error.message : error, [apiKey]));
    }
  }
}
