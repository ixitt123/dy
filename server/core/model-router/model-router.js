import { createProvider, PROVIDER_REGISTRY } from "./providers/index.js";

// ============================================================================
// 模型映射配置
// Key: 任务类型 (taskType)
// Value: { provider, model } — 自动路由到的提供者和模型
// ============================================================================
const DEFAULT_MODEL_MAP = {
  rewrite: { provider: "deepseek", model: "deepseek-chat" },
  director: { provider: "claude", model: "claude-sonnet-4-20250514" },
  storyboard: { provider: "deepseek", model: "deepseek-chat" },
  image: { provider: "flux", model: "flux" },         // Flux 为外部图像服务，通过 ImageService 调用
  video: { provider: "kling", model: "kling" },       // Kling 为外部视频服务
  tts: { provider: "fish-audio", model: "fish-speech-1.5" },
};

// 成本估算：每百万 token 的美元价格（仅供参考）
const COST_PER_MILLION_TOKENS = {
  deepseek: { prompt: 0.27, completion: 1.10 },
  openai: { prompt: 0.15, completion: 0.60 },    // gpt-4o-mini
  claude: { prompt: 3.00, completion: 15.00 },   // Sonnet
  gemini: { prompt: 0.15, completion: 0.60 },    // Flash
  qwen: { prompt: 0.40, completion: 1.20 },      // Plus
  minimax: { prompt: 0.50, completion: 1.50 },
  siliconflow: { prompt: 0.20, completion: 0.80 },
  "ali-bailian": { prompt: 0.40, completion: 1.20 },
  volcengine: { prompt: 0.10, completion: 0.40 },
  "fish-audio": { prompt: 0, completion: 0 },
  elevenlabs: { prompt: 0, completion: 0 },
};

/**
 * ModelRouter — 统一模型路由（单例）
 *
 * 职责：
 * 1. 从 settings.json 加载 Provider 配置
 * 2. 根据任务类型 (taskType) 自动映射到对应的 Provider + Model
 * 3. 提供统一的 generate() 接口（含流式 SSE 支持）
 * 4. 追踪用量（tokens、成本、耗时）
 */
class ModelRouter {
  constructor() {
    this._initialized = false;
    this._settings = null;
    this._providers = new Map();       // providerId -> BaseProvider 实例
    this._modelMap = { ...DEFAULT_MODEL_MAP };
    this._usageLog = [];               // 用量日志

    // 回调 hooks
    this._onBeforeGenerate = null;     // (taskType, messages, options) => void
    this._onAfterGenerate = null;      // (taskType, result, usage) => void
    this._onError = null;              // (taskType, error) => void
  }

  // ========================================================================
  // 初始化
  // ========================================================================

  /**
   * 初始化路由器：从 settings 对象加载 Provider 配置
   * @param {object} settings - 来自 settings.json 的配置对象
   * @returns {ModelRouter}
   */
  init(settings = {}) {
    if (this._initialized) return this;

    this._settings = settings;

    // 从 rewriteProviders 中加载 LLM Provider 配置
    const rewriteProviders = settings.rewriteProviders || {};

    // 映射 settings 中的 provider ID → 标准 ID
    // settings 中: deepseek, openai, siliconflow, volcengine, minimax, dashscope
    // 标准 ID: deepseek, openai, siliconflow, volcengine, minimax, qwen/ali-bailian
    const providerConfigMap = {
      deepseek: () => rewriteProviders.deepseek,
      openai: () => rewriteProviders.openai,
      siliconflow: () => rewriteProviders.siliconflow,
      volcengine: () => rewriteProviders.volcengine,
      minimax: () => rewriteProviders.minimax,
      qwen: () => rewriteProviders.dashscope,               // dashscope = 通义千问
      "ali-bailian": () => rewriteProviders.dashscope,       // 阿里百炼 = dashscope
      claude: () => settings.claude || {},                   // Claude 独立配置
      gemini: () => settings.gemini || {},                   // Gemini 独立配置
      "fish-audio": () => settings.tts?.fish_audio || {},
      elevenlabs: () => settings.tts?.elevenlabs || {},
    };

    for (const [providerId, configFn] of Object.entries(providerConfigMap)) {
      if (!PROVIDER_REGISTRY[providerId]) continue;

      try {
        const config = configFn() || {};
        if (config.apiKey || config.api_key || providerId === "fish-audio" || providerId === "elevenlabs") {
          const normalizedConfig = this._normalizeConfig(providerId, config);
          const provider = createProvider(providerId, normalizedConfig);
          if (provider) {
            this._providers.set(providerId, provider);
          }
        }
      } catch {
        // Provider 配置不完整，跳过
      }
    }

    // 加载自定义模型映射（如果 settings 中有 modelMap）
    if (settings.modelMap && typeof settings.modelMap === "object") {
      this._modelMap = { ...DEFAULT_MODEL_MAP, ...settings.modelMap };
    }

    this._initialized = true;
    console.log(`[ModelRouter] 初始化完成，已加载 ${this._providers.size} 个 Provider`);
    return this;
  }

  /**
   * 规范化配置（统一 apiKey 字段名）
   */
  _normalizeConfig(providerId, config) {
    return {
      apiKey: config.apiKey || config.api_key || "",
      baseUrl: config.baseUrl || config.base_url || "",
      model: config.model || config.default_model || "",
      ...config, // 保留其他字段
    };
  }

  /**
   * 设置/更新模型映射
   */
  setModelMap(map) {
    this._modelMap = { ...this._modelMap, ...map };
  }

  /**
   * 手动注册一个 Provider
   */
  registerProvider(providerId, config) {
    const entry = PROVIDER_REGISTRY[providerId];
    if (!entry) throw new Error(`未知 Provider: ${providerId}`);

    const normalized = this._normalizeConfig(providerId, config);
    const provider = new entry.Provider(normalized);
    this._providers.set(providerId, provider);
    return provider;
  }

  // ========================================================================
  // 路由方法
  // ========================================================================

  /**
   * 根据任务类型解析 Provider
   */
  resolveProvider(taskType) {
    const mapping = this._modelMap[taskType];
    if (!mapping) return null;

    const { provider: providerId, model } = mapping;
    const provider = this._providers.get(providerId);
    if (!provider) return null;

    return { provider, model: model || provider.defaultModel };
  }

  /**
   * 获取指定 Provider 实例
   */
  getProvider(providerId) {
    return this._providers.get(providerId) || null;
  }

  /**
   * 列出所有已加载的 Provider
   */
  listProviders() {
    return Array.from(this._providers.entries()).map(([id, provider]) => ({
      id,
      label: provider.label,
      model: provider.defaultModel,
      valid: provider.validateConfig().valid,
    }));
  }

  // ========================================================================
  // 统一 generate() 接口
  // ========================================================================

  /**
   * 统一生成入口
   *
   * @param {object} params
   * @param {string} params.taskType  - 任务类型 (rewrite|director|storyboard|image|video|tts)
   * @param {Array}  params.messages  - [{role:"user"|"system"|"assistant", content:"..."}]
   * @param {object} params.options   - {temperature, maxTokens, model, stream, onChunk, ...}
   * @returns {Promise<{content, usage, model, providerId, duration, cost}>}
   */
  async generate({ taskType, messages = [], options = {} } = {}) {
    const resolved = this.resolveProvider(taskType);
    if (!resolved) {
      throw new Error(
        `ModelRouter: 任务类型 "${taskType}" 未配置可用 Provider。` +
        `可用映射: ${JSON.stringify(Object.keys(this._modelMap))}`,
      );
    }

    const { provider, model } = resolved;
    const mergedOptions = { ...options, model: options.model || model };
    const startTime = Date.now();

    // Hook: 生成前回调
    if (this._onBeforeGenerate) {
      try { this._onBeforeGenerate(taskType, messages, mergedOptions); } catch {}
    }

    try {
      let result;

      if (options.stream && typeof options.onChunk === "function") {
        // 流式调用
        result = await provider.chatStream(messages, mergedOptions, options.onChunk);
      } else {
        // 非流式调用
        result = await provider.chat(messages, mergedOptions);
      }

      const totalDuration = Date.now() - startTime;
      const cost = this._estimateCost(provider.providerId, result.usage);
      const usageEntry = this._logUsage(taskType, provider.providerId, result, cost, totalDuration);

      const finalResult = {
        content: result.content,
        usage: result.usage,
        model: result.model,
        providerId: provider.providerId,
        duration: totalDuration,
        cost,
      };

      // Hook: 生成后回调
      if (this._onAfterGenerate) {
        try { this._onAfterGenerate(taskType, finalResult, usageEntry); } catch {}
      }

      return finalResult;
    } catch (error) {
      // Hook: 错误回调
      if (this._onError) {
        try { this._onError(taskType, error); } catch {}
      }
      throw error;
    }
  }

  /**
   * 流式生成（简化接口）
   *
   * @param {string} taskType
   * @param {Array} messages
   * @param {object} options
   * @param {function} onChunk - (chunkData) => void
   * @returns {Promise<{content, usage, model, providerId, duration, cost}>}
   */
  async generateStream(taskType, messages = [], options = {}, onChunk) {
    return this.generate({
      taskType,
      messages,
      options: { ...options, stream: true, onChunk },
    });
  }

  /**
   * 使用特定 Provider 直接生成（跳过路由映射）
   */
  async generateWithProvider(providerId, messages = [], options = {}) {
    const provider = this._providers.get(providerId);
    if (!provider) throw new Error(`ModelRouter: Provider "${providerId}" 未加载`);

    const mergedOptions = { ...options, model: options.model || provider.defaultModel };
    const startTime = Date.now();

    try {
      let result;
      if (options.stream && typeof options.onChunk === "function") {
        result = await provider.chatStream(messages, mergedOptions, options.onChunk);
      } else {
        result = await provider.chat(messages, mergedOptions);
      }

      const totalDuration = Date.now() - startTime;
      const cost = this._estimateCost(providerId, result.usage);
      this._logUsage("direct", providerId, result, cost, totalDuration);

      return {
        content: result.content,
        usage: result.usage,
        model: result.model,
        providerId,
        duration: totalDuration,
        cost,
      };
    } catch (error) {
      if (this._onError) {
        try { this._onError("direct", error); } catch {}
      }
      throw error;
    }
  }

  // ========================================================================
  // SSE / WebSocket 流式支持
  // ========================================================================

  /**
   * 生成 SSE 流（用于 HTTP 响应）
   * 返回 Writer 对象 {write, end}，调用方负责写入 HTTP Response
   *
   * 用法 (Express):
   *   res.setHeader("Content-Type", "text/event-stream");
   *   const writer = modelRouter.generateSSE(taskType, messages, options);
   *   writer.onData = (line) => res.write(line);
   *   writer.onEnd = () => res.end();
   *   await writer.start();
   *
   * @param {string} taskType
   * @param {Array} messages
   * @param {object} options
   * @returns {{start: Function, onData: Function|null, onEnd: Function|null, onError: Function|null}}
   */
  generateSSE(taskType, messages = [], options = {}) {
    const resolved = this.resolveProvider(taskType);
    let onData = null;
    let onEnd = null;
    let onError = null;

    const writer = {
      onData: null,
      onEnd: null,
      onError: null,
      start: async () => {
        if (!resolved) {
          if (typeof writer.onData === "function") {
            writer.onData(`data: ${JSON.stringify({ error: `任务类型 "${taskType}" 未配置可用 Provider` })}\n\n`);
            writer.onData("data: [DONE]\n\n");
          }
          if (typeof writer.onEnd === "function") writer.onEnd();
          return;
        }

        const { provider, model } = resolved;
        const mergedOptions = { ...options, model: options.model || model };

        try {
          const result = await provider.chatStream(messages, mergedOptions, (chunk) => {
            if (chunk.delta && typeof writer.onData === "function") {
              writer.onData(`data: ${JSON.stringify(chunk)}\n\n`);
            }
          });

          const cost = this._estimateCost(provider.providerId, result.usage);
          this._logUsage(taskType, provider.providerId, result, cost, result.duration);

          if (typeof writer.onData === "function") {
            writer.onData(`data: ${JSON.stringify({ delta: "", finishReason: result.finishReason, usage: result.usage, model: result.model, providerId: provider.providerId, cost })}\n\n`);
            writer.onData("data: [DONE]\n\n");
          }
          if (typeof writer.onEnd === "function") writer.onEnd();
        } catch (error) {
          if (typeof writer.onData === "function") {
            writer.onData(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            writer.onData("data: [DONE]\n\n");
          }
          if (typeof writer.onError === "function") writer.onError(error);
          if (typeof writer.onEnd === "function") writer.onEnd();
        }
      },
    };

    return writer;
  }

  /**
   * 通过 WebSocket 发送流式生成结果
   *
   * @param {WebSocket} ws - ws WebSocket 实例
   * @param {string} taskType
   * @param {Array} messages
   * @param {object} options
   */
  async generateViaWebSocket(ws, taskType, messages = [], options = {}) {
    const resolved = this.resolveProvider(taskType);
    if (!resolved) {
      ws.send(JSON.stringify({ type: "error", error: `任务类型 "${taskType}" 未配置可用 Provider` }));
      return;
    }

    const { provider, model } = resolved;
    const mergedOptions = { ...options, model: options.model || model };

    try {
      const result = await provider.chatStream(messages, mergedOptions, (chunk) => {
        if (chunk.delta) {
          ws.send(JSON.stringify({ type: "chunk", ...chunk }));
        }
      });

      const cost = this._estimateCost(provider.providerId, result.usage);
      this._logUsage(taskType, provider.providerId, result, cost, result.duration);

      ws.send(JSON.stringify({
        type: "done",
        finishReason: result.finishReason,
        usage: result.usage,
        model: result.model,
        providerId: provider.providerId,
        cost,
      }));
    } catch (error) {
      ws.send(JSON.stringify({ type: "error", error: error.message }));
    }
  }

  // ========================================================================
  // 用量追踪
  // ========================================================================

  _estimateCost(providerId, usage) {
    const rates = COST_PER_MILLION_TOKENS[providerId];
    if (!rates) return 0;

    const promptCost = ((usage.promptTokens || 0) / 1_000_000) * rates.prompt;
    const completionCost = ((usage.completionTokens || 0) / 1_000_000) * rates.completion;
    return Math.round((promptCost + completionCost) * 10000) / 10000; // 保留 4 位小数
  }

  _logUsage(taskType, providerId, result, cost, duration) {
    const entry = {
      timestamp: new Date().toISOString(),
      taskType,
      providerId,
      model: result.model || "",
      promptTokens: result.usage?.promptTokens || 0,
      completionTokens: result.usage?.completionTokens || 0,
      totalTokens: result.usage?.totalTokens || 0,
      cost,
      duration,
    };

    this._usageLog.push(entry);

    // 只保留最近 1000 条
    if (this._usageLog.length > 1000) {
      this._usageLog.shift();
    }

    return entry;
  }

  /**
   * 获取用量统计
   */
  getUsageStats() {
    const stats = {
      totalRequests: this._usageLog.length,
      totalTokens: 0,
      totalCost: 0,
      totalDuration: 0,
      byProvider: {},
      byTaskType: {},
    };

    for (const entry of this._usageLog) {
      stats.totalTokens += entry.totalTokens;
      stats.totalCost += entry.cost;
      stats.totalDuration += entry.duration;

      if (!stats.byProvider[entry.providerId]) {
        stats.byProvider[entry.providerId] = { requests: 0, tokens: 0, cost: 0 };
      }
      stats.byProvider[entry.providerId].requests += 1;
      stats.byProvider[entry.providerId].tokens += entry.totalTokens;
      stats.byProvider[entry.providerId].cost += entry.cost;

      if (!stats.byTaskType[entry.taskType]) {
        stats.byTaskType[entry.taskType] = { requests: 0, tokens: 0, cost: 0 };
      }
      stats.byTaskType[entry.taskType].requests += 1;
      stats.byTaskType[entry.taskType].tokens += entry.totalTokens;
      stats.byTaskType[entry.taskType].cost += entry.cost;
    }

    stats.totalCost = Math.round(stats.totalCost * 10000) / 10000;
    return stats;
  }

  /**
   * 获取最近的用量日志
   */
  getUsageLog(limit = 50) {
    return this._usageLog.slice(-limit);
  }

  /**
   * 清空用量日志
   */
  clearUsageLog() {
    this._usageLog = [];
  }

  // ========================================================================
  // Hooks
  // ========================================================================

  onBeforeGenerate(fn) {
    this._onBeforeGenerate = fn;
  }

  onAfterGenerate(fn) {
    this._onAfterGenerate = fn;
  }

  onError(fn) {
    this._onError = fn;
  }

  // ========================================================================
  // 状态
  // ========================================================================

  get isReady() {
    return this._initialized && this._providers.size > 0;
  }

  get providerCount() {
    return this._providers.size;
  }

  getModelMap() {
    return { ...this._modelMap };
  }

  getProviders() {
    return Object.keys(PROVIDER_REGISTRY);
  }
}

// ============================================================================
// 单例导出
// ============================================================================

const modelRouter = new ModelRouter();

export { ModelRouter, modelRouter, DEFAULT_MODEL_MAP, COST_PER_MILLION_TOKENS };
export default modelRouter;
