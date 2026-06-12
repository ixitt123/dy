import { ImageProviderAdapter } from "../provider-adapter.js";

export class JimengProvider extends ImageProviderAdapter {
  constructor(options = {}) {
    super(options);
    this.name = "jimeng";
    this.apiKey = options.config?.jimeng?.apiKey || process.env.JIMENG_API_KEY || "";
    this.baseUrl = options.config?.jimeng?.baseUrl || "https://api.jimeng.io/v1";
  }

  async generateImage({ prompt, aspectRatio = "1:1", outputPath = "" }) {
    if (!this.apiKey) throw new Error("即梦: 请先在设置中配置 API Key");

    const resp = await fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
      body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, n: 1, response_format: outputPath ? "b64_json" : "url" }),
    });

    if (!resp.ok) throw new Error(`即梦 API 错误 (${resp.status}): ${await resp.text()}`);

    const data = await resp.json();
    const first = data.data?.[0] || data.output?.images?.[0] || data.images?.[0] || {};
    const rawBase64 = first.b64_json || first.base64 || first.image_base64 || data.b64_json || "";
    const imageBase64 = String(rawBase64 || "").replace(/^data:image\/\w+;base64,/, "");
    return {
      imageUrl: first.url || first.image_url || data.url || data.image_url || "",
      imageBase64,
      revisedPrompt: first.revised_prompt || data.revised_prompt || prompt,
    };
  }

  async validateConfig() {
    return this.apiKey ? { valid: true } : { valid: false, error: "即梦: 未配置 API Key" };
  }
}
