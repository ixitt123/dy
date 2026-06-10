import { OpenAICompatibleProvider } from "./base.js";

/**
 * OpenAI Provider
 * API: https://api.openai.com/v1 (原生 OpenAI)
 * 文档: https://platform.openai.com/docs
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      providerId: "openai",
      label: "OpenAI",
      baseUrl: config.baseUrl || "https://api.openai.com/v1",
      apiKey: config.apiKey || "",
      model: config.model || "gpt-4o-mini",
    });
  }
}
