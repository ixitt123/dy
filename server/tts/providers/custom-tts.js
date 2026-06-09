import fs from "node:fs";
import path from "node:path";
import { TtsProviderAdapter, redactSecrets } from "../provider-adapter.js";

export class CustomTtsProvider extends TtsProviderAdapter {
  constructor(options = {}) {
    super({ id: "custom_tts", label: "自定义 Provider", ...options });
  }

  async generateSpeech(payload) {
    const baseUrl = String(this.config.base_url || "").trim();
    const apiKey = String(this.config.api_key || "").trim();
    if (!baseUrl) return this.failure("请先填写自定义 Provider 的 base_url。");
    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          text: payload.text,
          voice_id: payload.voiceId || this.config.voice || "",
          model: this.config.model || "",
          emotion: payload.emotion || "",
          style_prompt: payload.stylePrompt || "",
          speed: payload.speed,
          volume: payload.volume,
          pitch: payload.pitch,
          format: payload.format,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        return this.failure(data.error || data.message || `自定义 Provider 请求失败（${response.status}）`);
      }
      const base64 = data.audio_base64 || data.audio?.data || "";
      if (!base64) return this.failure("自定义 Provider 未返回 audio_base64。");
      fs.mkdirSync(path.dirname(payload.outputPath), { recursive: true });
      fs.writeFileSync(payload.outputPath, Buffer.from(base64, "base64"));
      return this.success({
        voice_id: payload.voiceId || this.config.voice || "",
        audio_path: payload.outputPath,
        format: payload.format,
        speed: payload.speed,
        emotion: payload.emotion,
        metadata: data.metadata || {},
      });
    } catch (error) {
      return this.failure("自定义 Provider 调用失败。", redactSecrets(error instanceof Error ? error.message : error, [apiKey]));
    }
  }
}
