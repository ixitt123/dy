// ProviderRegistry — 统一模型供应商注册 + 健康检查 + 自动降级
import modelRouter from "./model-router/model-router.js";

const FALLBACK_CHAIN = {
  deepseek: ["qwen", "openai"],
  claude: ["openai", "qwen"],
  openai: ["deepseek", "claude"],
  qwen: ["deepseek", "siliconflow"],
  gemini: ["openai", "deepseek"],
};

class ProviderRegistry {
  constructor() {
    this._providers = new Map();
    this._health = new Map();
  }

  register(id, config) {
    this._providers.set(id, { id, ...config, enabled: config.enabled !== false });
    this._health.set(id, { status: "online", latency: 0, lastCheck: new Date().toISOString() });
  }

  async healthCheck(providerId) {
    const p = this._providers.get(providerId);
    if (!p || !p.enabled) return { status: "offline", reason: "disabled" };
    const start = Date.now();
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${p.baseUrl || "https://api." + providerId + ".com"}/models`, {
        headers: { Authorization: `Bearer ${p.apiKey || ""}` },
        signal: ctrl.signal,
      });
      const latency = Date.now() - start;
      const status = res.ok || res.status === 401 ? "online" : "offline";
      this._health.set(providerId, { status, latency, lastCheck: new Date().toISOString() });
      return { status, latency };
    } catch {
      this._health.set(providerId, { status: "offline", latency: 0, lastCheck: new Date().toISOString() });
      return { status: "offline", error: "timeout" };
    }
  }

  getFallback(providerId) {
    const chain = FALLBACK_CHAIN[providerId] || [];
    for (const alt of chain) {
      const health = this._health.get(alt);
      if (health?.status === "online" && this._providers.get(alt)?.enabled) {
        return alt;
      }
    }
    return null;
  }

  async generate(taskType, messages, options = {}) {
    const mapping = modelRouter.getModelMap();
    const target = mapping[taskType] || { provider: "deepseek" };
    let providerId = target.provider;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await modelRouter.generate({ taskType, messages, options });
      } catch (e) {
        const fallback = this.getFallback(providerId);
        if (!fallback) throw e;
        modelRouter._modelMap[taskType] = { provider: fallback, model: target.model };
        providerId = fallback;
      }
    }
    throw new Error("所有 Provider 均不可用");
  }

  getAll() {
    return Array.from(this._providers.entries()).map(([id, p]) => ({
      ...p,
      health: this._health.get(id) || { status: "unknown" },
    }));
  }
}

export const providerRegistry = new ProviderRegistry();
export { FALLBACK_CHAIN };
