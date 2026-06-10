import { BaseProvider } from "./base.js";

/**
 * Gemini (Google) Provider
 * API: https://generativelanguage.googleapis.com (非 OpenAI 兼容，使用 Gemini API)
 * 文档: https://ai.google.dev/gemini-api/docs
 */
export class GeminiProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      providerId: "gemini",
      label: "Gemini (Google)",
      baseUrl: config.baseUrl || "https://generativelanguage.googleapis.com",
      apiKey: config.apiKey || "",
      model: config.model || "gemini-2.5-flash",
    });
    this.apiVersion = config.apiVersion || "v1beta";
  }

  /** 将 OpenAI 格式 messages 转换为 Gemini contents 格式 */
  convertMessages(messages) {
    const systemMessages = [];
    const contents = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemMessages.push({ text: msg.content });
      } else {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    return { systemMessages, contents };
  }

  async chat(messages, options = {}) {
    const validation = this.validateConfig();
    if (!validation.valid) throw new Error(validation.error);

    const startTime = Date.now();
    const { systemMessages, contents } = this.convertMessages(messages);
    const model = options.model || this.defaultModel;

    const body = {
      contents,
      ...(systemMessages.length > 0 ? { system_instruction: { parts: systemMessages } } : {}),
      generationConfig: {
        temperature: options.temperature ?? 0.78,
        maxOutputTokens: options.maxTokens || 8192,
        ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    };

    const response = await fetch(
      `${this.baseUrl}/${this.apiVersion}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    const data = await response.json().catch(() => ({}));
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const message = data.error?.message || data.message || `HTTP ${response.status}`;
      throw new Error(`${this.label} 请求失败: ${message}`);
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usage = data.usageMetadata || {};

    return {
      content,
      usage: {
        promptTokens: usage.promptTokenCount || 0,
        completionTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      },
      model: model,
      duration,
      finishReason: data.candidates?.[0]?.finishReason || "",
    };
  }

  async chatStream(messages, options = {}, onChunk) {
    const validation = this.validateConfig();
    if (!validation.valid) throw new Error(validation.error);

    const startTime = Date.now();
    const { systemMessages, contents } = this.convertMessages(messages);
    const model = options.model || this.defaultModel;

    const body = {
      contents,
      ...(systemMessages.length > 0 ? { system_instruction: { parts: systemMessages } } : {}),
      generationConfig: {
        temperature: options.temperature ?? 0.78,
        maxOutputTokens: options.maxTokens || 8192,
        ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    };

    const response = await fetch(
      `${this.baseUrl}/${this.apiVersion}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const data = await response.text().catch(() => "");
      throw new Error(`${this.label} 流式请求失败 (${response.status}): ${data}`);
    }

    let fullContent = "";
    let finishReason = "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const jsonStr = trimmed.slice(5).trim();
          try {
            const chunk = JSON.parse(jsonStr);
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (text) {
              fullContent += text;
              if (onChunk) onChunk({ delta: text, finishReason: null });
            }
            if (chunk.candidates?.[0]?.finishReason) {
              finishReason = chunk.candidates[0].finishReason;
            }
          } catch {
            // 忽略解析失败
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const duration = Date.now() - startTime;

    if (onChunk) onChunk({ delta: "", finishReason: finishReason || "STOP" });

    const estimatedTokens = Math.ceil(fullContent.length / 2);

    return {
      content: fullContent,
      usage: {
        promptTokens: 0,
        completionTokens: estimatedTokens,
        totalTokens: estimatedTokens,
        estimated: true,
      },
      model: model,
      duration,
      finishReason: finishReason || "STOP",
    };
  }
}
