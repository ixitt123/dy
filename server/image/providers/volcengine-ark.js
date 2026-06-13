import { ImageProviderAdapter } from "../provider-adapter.js";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL = "doubao-seedream-5-0-lite-260128";

function normalizeModel(model) {
  const value = String(model || "").trim();
  const lower = value.toLowerCase().replace(/_/g, "-");
  if (!lower || ["doubao-seedream-5.0-lite", "doubao-seedream-5-0-lite", "doubao-seedream-5.0-lite-260128", DEFAULT_MODEL].includes(lower)) {
    return DEFAULT_MODEL;
  }
  if (["doubao-seedream-5.0", "doubao-seedream-5-0", "doubao-seedream-5.0-260128", "doubao-seedream-5-0-260128"].includes(lower)) {
    return "doubao-seedream-5-0-260128";
  }
  return value;
}

function sizeForRatio(aspectRatio) {
  // Seedream 5.0 lite requires at least 3,686,400 pixels. Keep the same
  // aspect ratios while meeting that floor: 1440x2560, 2560x1440, 1920x1920.
  return {
    "9:16": "1440x2560",
    "16:9": "2560x1440",
    "1:1": "1920x1920",
  }[String(aspectRatio || "1:1")] || "1920x1920";
}

function preparePrompt(prompt) {
  const cleaned = String(prompt || "")
    .replace(/\b(1[8-9]|2\d|3\d|4\d)\s*岁\s*(左右|上下)?/g, (match) => (
      /3\d|4\d/.test(match) ? "成熟青年成人外观" : "青年成人外观"
    ))
    .replace(/\b(1[8-9]|2\d|3\d|4\d)[-\s]?year[-\s]?old\b/gi, (match) => (
      /\b(3\d|4\d)/.test(match) ? "mature young adult appearance" : "young adult appearance"
    ))
    .replace(/生日快乐|生日|祝福|贺卡/g, "真实生活场景")
    .trim();
  return [
    cleaned,
    "",
    "生成硬约束：真实摄影感，单张竖屏短视频分镜，不是生日卡，不是祝福海报，不是PPT，不是文字海报。",
    "不要生成任何可读文字、数字年龄、标题、字幕、logo、水印、表情符号或海报排版；字幕和标题由后期添加。",
  ].filter(Boolean).join("\n");
}

function normalizeArkError(status, bodyText) {
  let data = {};
  try {
    data = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    data = {};
  }
  const message = String(data.error?.message || data.message || data.error || bodyText || "").trim();
  const code = String(data.error?.code || data.code || "").toLowerCase();
  const raw = `${code} ${message}`.toLowerCase();

  if (status === 401 || status === 403 || raw.includes("unauthorized") || raw.includes("invalid api key")) {
    return "火山方舟：API Key 无效或未授权。";
  }
  if (raw.includes("not found") || raw.includes("model") && (raw.includes("not") || raw.includes("access") || raw.includes("permission"))) {
    return "火山方舟：模型未开通或模型 ID 不正确。请在系统设置把模型改为已开通的图片模型，例如 doubao-seedream-5-0-lite-260128。";
  }
  if (raw.includes("quota") || raw.includes("balance") || raw.includes("insufficient") || raw.includes("余额")) {
    return "火山方舟：余额不足或额度不可用。";
  }
  if (raw.includes("image size") || raw.includes("size") && raw.includes("pixel")) {
    return `火山方舟：图片尺寸不符合模型要求。当前 Provider 已按 9:16=1440x2560、16:9=2560x1440、1:1=1920x1920 发送，请刷新页面后重试。原始错误：${message}`;
  }
  if (status >= 500) return `火山方舟：服务请求失败（${status}）。`;
  return message ? `火山方舟请求失败（${status}）：${message}` : `火山方舟请求失败（${status}）。`;
}

export class VolcengineArkImageProvider extends ImageProviderAdapter {
  constructor(options = {}) {
    super(options);
    this.name = "volcengine_ark";
    this.apiKey = options.config?.volcengine_ark?.apiKey || process.env.VOLCENGINE_ARK_API_KEY || "";
    this.baseUrl = options.config?.volcengine_ark?.baseUrl || process.env.VOLCENGINE_ARK_BASE_URL || DEFAULT_BASE_URL;
    this.model = normalizeModel(options.config?.volcengine_ark?.model || process.env.VOLCENGINE_ARK_IMAGE_MODEL || DEFAULT_MODEL);
  }

  async generateImage({ prompt, aspectRatio = "1:1" }) {
    if (!this.apiKey) throw new Error("火山方舟：未配置 API Key。");
    if (!String(this.model || "").trim()) throw new Error("火山方舟：模型 ID 为空。");
    const requestPrompt = preparePrompt(prompt);

    let response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/images/generations`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt: requestPrompt,
          response_format: "url",
          watermark: false,
          size: sizeForRatio(aspectRatio),
        }),
      });
    } catch (error) {
      throw new Error(`火山方舟：网络错误，${error instanceof Error ? error.message : String(error)}`);
    }

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
    if (!response.ok) throw new Error(normalizeArkError(response.status, raw));

    const first = data.data?.[0] || data.output?.images?.[0] || data.images?.[0] || {};
    const rawBase64 = first.b64_json || first.base64 || first.image_base64 || data.b64_json || "";
    const imageBase64 = String(rawBase64 || "").replace(/^data:image\/\w+;base64,/, "");
    return {
      imageUrl: first.url || first.image_url || data.url || data.image_url || "",
      imageBase64,
      revisedPrompt: first.revised_prompt || data.revised_prompt || requestPrompt,
      model: this.model,
      sourceUrl: first.url || first.image_url || data.url || data.image_url || "",
    };
  }

  async validateConfig() {
    if (!this.apiKey) return { valid: false, error: "火山方舟：未配置 API Key。" };
    if (!String(this.model || "").trim()) return { valid: false, error: "火山方舟：模型 ID 为空。" };
    return { valid: true };
  }

  async testConnection() {
    const validation = await this.validateConfig();
    if (!validation.valid) return validation;
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/models`, {
        headers: { authorization: `Bearer ${this.apiKey}` },
      });
      if (response.ok) return { valid: true, message: "火山方舟连接成功。" };
      if (response.status === 401 || response.status === 403) return { valid: false, error: "火山方舟：API Key 无效或未授权。" };
      return { valid: true, message: `火山方舟地址可访问，模型列表接口返回 ${response.status}。` };
    } catch (error) {
      return { valid: false, error: `火山方舟：网络错误，${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
