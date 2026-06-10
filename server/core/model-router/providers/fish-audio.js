import { BaseProvider } from "./base.js";

/**
 * Fish Audio Provider (TTS)
 * API: https://api.fish.audio (自有格式)
 * 文档: https://fish.audio/docs
 */
export class FishAudioProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      providerId: "fish-audio",
      label: "Fish Audio",
      baseUrl: config.baseUrl || "https://api.fish.audio",
      apiKey: config.apiKey || "",
      model: config.model || "fish-speech-1.5",
    });
    this.defaultVoice = config.defaultVoice || "default";
  }

  buildHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * TTS 生成（非流式）
   * @param {object} params - {text, voice, speed, format, outputPath}
   */
  async generateSpeech({ text, voice, speed = 1, format = "mp3" } = {}) {
    const validation = this.validateConfig();
    if (!validation.valid) throw new Error(validation.error);
    if (!text) throw new Error("Fish Audio: 合成文本不能为空");

    const startTime = Date.now();
    const response = await fetch(`${this.baseUrl}/v1/tts`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        text: text.trim(),
        voice: voice || this.defaultVoice,
        speed,
        format,
      }),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Fish Audio 请求失败 (${response.status}): ${errorText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return {
      success: true,
      provider: this.providerId,
      audio: audioBuffer,
      format,
      duration,
      voice: voice || this.defaultVoice,
    };
  }

  /**
   * TTS 流式生成
   */
  async generateSpeechStream({ text, voice, speed = 1, format = "mp3" } = {}, onChunk) {
    const validation = this.validateConfig();
    if (!validation.valid) throw new Error(validation.error);
    if (!text) throw new Error("Fish Audio: 合成文本不能为空");

    const startTime = Date.now();
    const response = await fetch(`${this.baseUrl}/v1/tts`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        text: text.trim(),
        voice: voice || this.defaultVoice,
        speed,
        format,
        streaming: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Fish Audio 流式请求失败 (${response.status}): ${errorText}`);
    }

    const chunks = [];
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          if (onChunk) onChunk({ chunk: Buffer.from(value) });
        }
      }
    } finally {
      reader.releaseLock();
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      provider: this.providerId,
      audio: Buffer.concat(chunks),
      format,
      duration,
      voice: voice || this.defaultVoice,
    };
  }

  // 实现 BaseProvider 接口（将 TTS 结果包装为文本）
  async chat(messages, options = {}) {
    const lastMessage = messages[messages.length - 1];
    const text = typeof lastMessage?.content === "string" ? lastMessage.content : "";
    const result = await this.generateSpeech({ text, ...options });
    return {
      content: JSON.stringify({ audio_base64: result.audio.toString("base64"), format: result.format }),
      usage: { promptTokens: text.length, completionTokens: result.audio.length, totalTokens: text.length + result.audio.length },
      model: options.model || this.defaultModel,
      duration: result.duration,
    };
  }

  async chatStream(messages, options = {}, onChunk) {
    const lastMessage = messages[messages.length - 1];
    const text = typeof lastMessage?.content === "string" ? lastMessage.content : "";
    const result = await this.generateSpeechStream({ text, ...options }, onChunk);
    return {
      content: JSON.stringify({ audio_base64: result.audio.toString("base64"), format: result.format }),
      usage: { promptTokens: text.length, completionTokens: result.audio.length, totalTokens: text.length + result.audio.length },
      model: options.model || this.defaultModel,
      duration: result.duration,
    };
  }
}
