// ProviderRegistry — 统一模型供应商注册 + 健康检查 + 自动降级
import modelRouter from "./model-router/model-router.js";

const FALLBACK_CHAIN = {
  deepseek: ["qwen", "openai"],
  claude: ["openai", "qwen"],
  openai: ["deepseek", "claude"],
  qwen: ["deepseek", "siliconflow"],
  gemini: ["openai", "deepseek"],
};

export class ProviderRegistry {
  constructor(router = modelRouter) {
    this._modelRouter = router;
    this._providers = new Map();
    this._health = new Map();
  }

  initFromModelRouter() {
    this._providers.clear();
    this._health.clear();
    const configured = new Set(this._modelRouter.getConfiguredProviders());
    for (const id of this._modelRouter.getLoadedProviders()) {
      this.register(id, {
        name: id,
        configured: configured.has(id),
        enabled: configured.has(id),
        status: configured.has(id) ? "unknown" : "unconfigured",
      });
    }
    return this;
  }

  register(id, config) {
    const configured = config.configured !== false && config.status !== "unconfigured";
    this._providers.set(id, { id, ...config, configured, enabled: configured && config.enabled !== false });
    this._health.set(id, {
      status: configured ? config.status || "unknown" : "unconfigured",
      latency: 0,
      lastCheck: new Date().toISOString(),
    });
  }

  async healthCheck(providerId) {
    const p = this._providers.get(providerId);
    if (!p) return { status: "offline", reason: "not_registered" };
    if (!p.configured) return { status: "unconfigured", reason: "unconfigured" };
    if (!p.enabled) return { status: "offline", reason: "disabled" };
    const start = Date.now();
    const provider = this._modelRouter.getProvider(providerId);
    if (!provider) return { status: "offline", reason: "not_loaded" };
    try {
      let status = "unknown";
      let detail = {};
      if (typeof provider.healthCheck === "function") {
        const result = await provider.healthCheck();
        status = result?.status || (result?.ok ? "online" : "offline");
        detail = result && typeof result === "object" ? result : {};
      } else if (typeof provider.validateConfig === "function") {
        const validation = provider.validateConfig();
        status = validation?.valid === true ? "unknown" : "unconfigured";
        detail = validation && typeof validation === "object" ? validation : {};
      }
      const latency = Date.now() - start;
      this._health.set(providerId, { status, latency, lastCheck: new Date().toISOString() });
      return { status, latency, ...detail };
    } catch (error) {
      this._health.set(providerId, { status: "offline", latency: 0, lastCheck: new Date().toISOString() });
      return { status: "offline", error: error instanceof Error ? error.message : String(error) };
    }
  }

  getFallback(providerId, excluded = new Set()) {
    const chain = FALLBACK_CHAIN[providerId] || [];
    for (const alt of chain) {
      const health = this._health.get(alt);
      const provider = this._providers.get(alt);
      if (!excluded.has(alt) && provider?.configured && provider.enabled && ["online", "unknown"].includes(health?.status)) {
        return alt;
      }
    }
    return null;
  }

  async generate(taskType, messages, options = {}) {
    const mapping = this._modelRouter.getModelMap();
    const target = mapping[taskType] || { provider: "deepseek" };
    let providerId = target.provider;

    const attempted = new Set();
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        attempted.add(providerId);
        if (attempt === 0) return await this._modelRouter.generate({ taskType, messages, options });
        return await this._modelRouter.generateWithProvider(providerId, messages, options);
      } catch (e) {
        lastError = e;
        const fallback = this.getFallback(providerId, attempted);
        if (!fallback) throw e;
        providerId = fallback;
      }
    }
    throw lastError || new Error("所有 Provider 均不可用");
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
