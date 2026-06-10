/**
 * BaseProvider - 所有模型提供者的抽象基类
 * 定义统一的 chat() / chatStream() 接口
 */
export class BaseProvider {
  constructor(config = {}) {
    this.providerId = config.providerId || "unknown";
    this.label = config.label || "Unknown";
    this.apiKey = String(config.apiKey || "").trim();
    this.baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
    this.defaultModel = String(config.model || config.defaultModel || "").trim();
  }

  /** 获取当前可用模型名称 */
  get model() {
    return this.defaultModel;
  }

  /** 验证配置是否就绪 */
  validateConfig() {
    if (!this.apiKey) return { valid: false, error: `${this.label}: 未配置 API Key` };
    if (!this.baseUrl) return { valid: false, error: `${this.label}: 未配置 Base URL` };
    if (!this.defaultModel) return { valid: false, error: `${this.label}: 未配置默认模型` };
    return { valid: true };
  }

  /**
   * 统一聊天补全（非流式）
   * @param {Array} messages - [{role, content}]
   * @param {object} options - {temperature, maxTokens, model, ...}
   * @returns {Promise<{content: string, usage: object, model: string}>}
   */
  async chat(messages, options = {}) {
    throw new Error(`${this.label}: chat() 未实现`);
  }

  /**
   * 流式聊天补全（SSE）
   * @param {Array} messages - [{role, content}]
   * @param {object} options - {temperature, maxTokens, model, ...}
   * @param {function} onChunk - (chunk: {delta: string, finishReason: string|null}) => void
   * @returns {Promise<{content: string, usage: object, model: string}>}
   */
  async chatStream(messages, options = {}, onChunk) {
    throw new Error(`${this.label}: chatStream() 未实现`);
  }
}

/**
 * OpenAICompatibleProvider - 兼容 OpenAI API 格式的提供者基类
 * 大多数中国厂商和部分国际厂商使用此格式
 */
export class OpenAICompatibleProvider extends BaseProvider {
  /**
   * 构建请求头（子类可重写以添加自定义头）
   */
  buildHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * 构建请求体（子类可重写以适配不同 API）
   */
  buildRequestBody(messages, options = {}) {
    return {
      model: options.model || this.defaultModel,
      temperature: options.temperature ?? 0.78,
      messages,
      ...(options.maxTokens > 0 ? { max_tokens: options.maxTokens } : {}),
      ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
    };
  }

  async chat(messages, options = {}) {
    const validation = this.validateConfig();
    if (!validation.valid) throw new Error(validation.error);

    const startTime = Date.now();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(this.buildRequestBody(messages, options)),
    });

    const data = await response.json().catch(() => ({}));
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const message = data.message || data.error?.message || data.error || `HTTP ${response.status}`;
      throw new Error(`${this.label} 请求失败: ${message}`);
    }

    const content = data.choices?.[0]?.message?.content || "";
    const usage = data.usage || {};

    return {
      content,
      usage: {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      },
      model: data.model || options.model || this.defaultModel,
      duration,
      finishReason: data.choices?.[0]?.finish_reason || "",
    };
  }

  async chatStream(messages, options = {}, onChunk) {
    const validation = this.validateConfig();
    if (!validation.valid) throw new Error(validation.error);

    const startTime = Date.now();
    const body = { ...this.buildRequestBody(messages, options), stream: true };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
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
          if (jsonStr === "[DONE]") continue;

          try {
            const chunk = JSON.parse(jsonStr);
            const delta = chunk.choices?.[0]?.delta?.content || "";
            if (delta) {
              fullContent += delta;
              if (onChunk) onChunk({ delta, finishReason: null });
            }
            if (chunk.choices?.[0]?.finish_reason) {
              finishReason = chunk.choices[0].finish_reason;
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

    // 估算流式响应的 token 用量（流式响应通常不返回完整 usage）
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
