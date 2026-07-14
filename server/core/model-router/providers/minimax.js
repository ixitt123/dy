import { OpenAICompatibleProvider } from "./base.js";

/**
 * MiniMax Provider
 * API: https://api.minimaxi.com (OpenAI 兼容)
 * 文档: https://platform.minimaxi.com/docs
 */
export class MiniMaxProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      providerId: "minimax",
      label: "MiniMax",
      baseUrl: config.baseUrl || "https://api.minimaxi.com/v1",
      apiKey: config.apiKey || "",
      model: config.model || "MiniMax-M2.5",
    });
  }
}
