import { OpenAICompatibleProvider } from "./base.js";

/**
 * SiliconFlow (硅基流动) Provider
 * API: https://api.siliconflow.cn/v1 (OpenAI 兼容)
 * 文档: https://docs.siliconflow.cn
 */
export class SiliconFlowProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      providerId: "siliconflow",
      label: "硅基流动 (SiliconFlow)",
      baseUrl: config.baseUrl || "https://api.siliconflow.cn/v1",
      apiKey: config.apiKey || "",
      model: config.model || "deepseek-ai/DeepSeek-V4-Pro",
    });
  }
}
