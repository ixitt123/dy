import { OpenAICompatibleProvider } from "./base.js";

export function deepSeekRequestCompatibility(model, thinking) {
  if (!/^deepseek-v4-(?:flash|pro)$/i.test(String(model || "").trim())) return {};
  return {
    thinking: thinking && typeof thinking === "object"
      ? thinking
      : { type: "disabled" },
  };
}

/**
 * DeepSeek Provider
 * API: https://api.deepseek.com (OpenAI 兼容)
 * 文档: https://platform.deepseek.com/api-docs
 */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      providerId: "deepseek",
      label: "DeepSeek",
      baseUrl: config.baseUrl || "https://api.deepseek.com",
      apiKey: config.apiKey || "",
      model: config.model || "deepseek-v4-flash",
    });
  }

  /** DeepSeek 支持 max_tokens 上限 8192 */
  buildRequestBody(messages, options = {}) {
    const body = super.buildRequestBody(messages, options);
    Object.assign(body, deepSeekRequestCompatibility(body.model, options.thinking));
    // DeepSeek 默认 max_tokens 建议不超过 8192
    if (body.max_tokens && body.max_tokens > 8192) {
      body.max_tokens = 8192;
    }
    return body;
  }
}
