import { OpenAICompatibleProvider } from "./base.js";

/**
 * 火山方舟 (Volcengine / 豆包) Provider
 * API: https://ark.cn-beijing.volces.com/api/v3 (OpenAI 兼容)
 * 文档: https://www.volcengine.com/docs/82379
 */
export class VolcengineProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      providerId: "volcengine",
      label: "火山方舟 (Volcengine)",
      baseUrl: config.baseUrl || "https://ark.cn-beijing.volces.com/api/v3",
      apiKey: config.apiKey || "",
      model: config.model || "doubao-seed-1-6-250615",
    });
  }

  /**
   * 火山方舟使用 apiKey 作为 Authorization Bearer
   * 部分接入点可能需要额外处理
   */
  buildHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }
}
