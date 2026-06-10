import { BaseProvider } from "./base.js";

/**
 * ElevenLabs Provider (TTS)
 * API: https://api.elevenlabs.io (自有格式)
 * 文档: https://elevenlabs.io/docs
 */
export class ElevenLabsProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      providerId: "elevenlabs",
      label: "ElevenLabs",
      baseUrl: config.baseUrl || "https://api.elevenlabs.io",
      apiKey: config.apiKey || "",
      model: config.model || "eleven_multilingual_v2",
    });
    this.defaultVoice = config.defaultVoice || "21m00Tcm4TlvDq8ikWAM"; // Rachel - 默认声音
  }

  buildHeaders() {
    return {
      "xi-api-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  /**
   * TTS 生成（非流式）
   * @param {object} params - {text, voice, model, stability, similarityBoost}
   */
  async generateSpeech({ text, voice, model, stability = 0.5, similarityBoost = 0.75 } = {}) {
    const validation = this.validateConfig();
    if (!validation.valid) throw new Error(validation.error);
    if (!text) throw new Error("ElevenLabs: 合成文本不能为空");

    const startTime = Date.now();
    const voiceId = voice || this.defaultVoice;
    const url = `${this.baseUrl}/v1/text-to-speech/${voiceId}`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        text: text.trim(),
        model_id: model || this.defaultModel,
        voice_settings: { stability, similarity_boost: similarityBoost },
      }),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      let errorMessage = `HTTP ${response.status}`;
      try {
        const error = JSON.parse(errorBody);
        errorMessage = error.detail?.message || error.detail || errorMessage;
      } catch {}
      throw new Error(`ElevenLabs 请求失败: ${errorMessage}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return {
      success: true,
      provider: this.providerId,
      audio: audioBuffer,
      format: "mp3",
      duration,
      voice: voiceId,
    };
  }

  /**
   * TTS 流式生成
   */
  async generateSpeechStream({ text, voice, model, stability = 0.5, similarityBoost = 0.75 } = {}, onChunk) {
    const validation = this.validateConfig();
    if (!validation.valid) throw new Error(validation.error);
    if (!text) throw new Error("ElevenLabs: 合成文本不能为空");

    const startTime = Date.now();
    const voiceId = voice || this.defaultVoice;
    const url = `${this.baseUrl}/v1/text-to-speech/${voiceId}/stream`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        text: text.trim(),
        model_id: model || this.defaultModel,
        voice_settings: { stability, similarity_boost: similarityBoost },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`ElevenLabs 流式请求失败 (${response.status}): ${errorBody}`);
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
      format: "mp3",
      duration,
      voice: voiceId,
    };
  }

  // 实现 BaseProvider 接口
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
