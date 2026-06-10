import { OpenAICompatibleProvider } from "./base.js";

/**
 * MiniMax Provider
 * API: https://api.minimax.io/v1 (OpenAI 兼容)
 * 文档: https://platform.minimax.io/docs
 */
export class MiniMaxProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      providerId: "minimax",
      label: "MiniMax",
      baseUrl: config.baseUrl || "https://api.minimax.io/v1",
      apiKey: config.apiKey || "",
      model: config.model || "MiniMax-M2.5",
    });
  }
}
