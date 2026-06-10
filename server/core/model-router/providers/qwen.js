import { OpenAICompatibleProvider } from "./base.js";

/**
 * Qwen (通义千问) Provider — 阿里百炼 DashScope
 * API: https://dashscope.aliyuncs.com/compatible-mode/v1 (OpenAI 兼容)
 * 文档: https://help.aliyun.com/zh/model-studio
 */
export class QwenProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      providerId: "qwen",
      label: "通义千问 (Qwen)",
      baseUrl: config.baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: config.apiKey || "",
      model: config.model || "qwen-plus",
    });
  }
}
