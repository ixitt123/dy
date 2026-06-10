import { OpenAICompatibleProvider } from "./base.js";

/**
 * 阿里百炼 (Ali Bailian) Provider — 集中式 Provider
 * API: https://dashscope.aliyuncs.com/compatible-mode/v1 (OpenAI 兼容)
 * 文档: https://help.aliyun.com/zh/model-studio
 */
export class AliBailianProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      providerId: "ali-bailian",
      label: "阿里百炼 (Ali Bailian)",
      baseUrl: config.baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: config.apiKey || "",
      model: config.model || "qwen-plus",
    });
  }
}
