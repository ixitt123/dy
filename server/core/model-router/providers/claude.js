import { BaseProvider } from "./base.js";

/**
 * Claude (Anthropic) Provider
 * API: https://api.anthropic.com/v1 (非 OpenAI 兼容，使用 Anthropic Messages API)
 * 文档: https://docs.anthropic.com/en/api
 */
export class ClaudeProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      providerId: "claude",
      label: "Claude (Anthropic)",
      baseUrl: config.baseUrl || "https://api.anthropic.com",
      apiKey: config.apiKey || "",
      model: config.model || "claude-sonnet-4-20250514",
    });
    this.apiVersion = config.apiVersion || "2023-06-01";
  }

  buildHeaders() {
    return {
      "x-api-key": this.apiKey,
      "anthropic-version": this.apiVersion,
      "Content-Type": "application/json",
    };
  }

  /** 将 OpenAI 格式 messages 转换为 Anthropic 格式 */
  convertMessages(messages) {
    // Anthropic 需要 system 单独提取，messages 以 user/assistant 交替
    const systemMessages = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    // 确保第一条是 user 消息
    if (conversationMessages.length > 0 && conversationMessages[0].role !== "user") {
      conversationMessages.unshift({ role: "user", content: "Hello" });
    }

    return {
      system: systemMessages || undefined,
      messages: conversationMessages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    };
  }

  async chat(messages, options = {}) {
    const validation = this.validateConfig();
    if (!validation.valid) throw new Error(validation.error);

    const startTime = Date.now();
    const { system, messages: convertedMessages } = this.convertMessages(messages);

    const body = {
      model: options.model || this.defaultModel,
      max_tokens: options.maxTokens || 4096,
      messages: convertedMessages,
      ...(system ? { system } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    };

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const message = data.error?.message || data.message || `HTTP ${response.status}`;
      throw new Error(`${this.label} 请求失败: ${message}`);
    }

    const content = data.content?.[0]?.text || "";
    const usage = data.usage || {};

    return {
      content,
      usage: {
        promptTokens: usage.input_tokens || 0,
        completionTokens: usage.output_tokens || 0,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
      },
      model: data.model || options.model || this.defaultModel,
      duration,
      finishReason: data.stop_reason || "",
    };
  }

  async chatStream(messages, options = {}, onChunk) {
    const validation = this.validateConfig();
    if (!validation.valid) throw new Error(validation.error);

    const startTime = Date.now();
    const { system, messages: convertedMessages } = this.convertMessages(messages);

    const body = {
      model: options.model || this.defaultModel,
      max_tokens: options.maxTokens || 4096,
      messages: convertedMessages,
      ...(system ? { system } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

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
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case "content_block_delta":
                if (event.delta?.text) {
                  fullContent += event.delta.text;
                  if (onChunk) onChunk({ delta: event.delta.text, finishReason: null });
                }
                break;
              case "message_delta":
                if (event.delta?.stop_reason) {
                  finishReason = event.delta.stop_reason;
                }
                break;
              case "message_stop":
                finishReason = finishReason || "end_turn";
                break;
            }
          } catch {
            // 忽略解析失败的 chunk
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const duration = Date.now() - startTime;

    if (onChunk) onChunk({ delta: "", finishReason: finishReason || "stop" });

    const estimatedTokens = Math.ceil(fullContent.length / 2);

    return {
      content: fullContent,
      usage: {
        promptTokens: 0,
        completionTokens: estimatedTokens,
        totalTokens: estimatedTokens,
        estimated: true,
      },
      model: options.model || this.defaultModel,
      duration,
      finishReason: finishReason || "stop",
    };
  }
}
