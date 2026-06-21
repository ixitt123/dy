import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ModelRouter } from "./server/core/model-router/model-router.js";
import { ProviderRegistry } from "./server/core/provider-registry.js";

const isolatedRouter = new ModelRouter();
isolatedRouter.init({
  rewriteProviders: {
    deepseek: {
      apiKey: "test-only-key",
      baseUrl: "https://example.invalid/v1",
      model: "deepseek-chat",
    },
  },
});
assert.equal(isolatedRouter.getProviders().includes("deepseek"), true);
assert.equal(isolatedRouter.getProviders().includes("gemini"), false);
assert.equal(isolatedRouter.getConfiguredProviders().includes("deepseek"), true);

const instances = new Map([
  ["deepseek", { defaultModel: "deepseek-chat", validateConfig: () => ({ valid: true }) }],
  ["qwen", { defaultModel: "qwen-plus", validateConfig: () => ({ valid: true }) }],
  ["openai", { defaultModel: "gpt-test", validateConfig: () => ({ valid: false }) }],
]);
let setTaskProviderCalls = 0;
let directCall = null;
let primaryCalls = 0;
const fakeRouter = {
  getLoadedProviders: () => ["deepseek", "qwen", "openai"],
  getConfiguredProviders: () => ["deepseek", "qwen"],
  getProvider: (id) => instances.get(id) || null,
  getModelMap: () => ({ rewrite: { provider: "deepseek", model: "deepseek-chat" } }),
  generate: async () => {
    primaryCalls += 1;
    throw new Error("primary unavailable");
  },
  generateWithProvider: async (providerId, messages, options) => {
    directCall = { providerId, messages, options };
    return { providerId, content: "fallback ok", model: instances.get(providerId).defaultModel };
  },
  setTaskProvider: () => { setTaskProviderCalls += 1; },
};

const registry = new ProviderRegistry(fakeRouter).initFromModelRouter();
const providers = registry.getAll();
const unconfigured = providers.find((provider) => provider.id === "openai");
assert.equal(unconfigured.configured, false);
assert.equal(unconfigured.enabled, false);
assert.equal(unconfigured.health.status, "unconfigured");
assert.equal(registry.getFallback("deepseek"), "qwen");

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("healthCheck must not invent an endpoint"); };
try {
  const health = await registry.healthCheck("qwen");
  assert.equal(health.status, "unknown");
} finally {
  globalThis.fetch = originalFetch;
}

const result = await registry.generate("rewrite", [{ role: "user", content: "test" }], { temperature: 0.2 });
assert.equal(result.providerId, "qwen");
assert.equal(primaryCalls, 1);
assert.equal(directCall.providerId, "qwen");
assert.equal(directCall.options.model, undefined);
assert.equal(setTaskProviderCalls, 0);

const registrySource = fs.readFileSync(fileURLToPath(new URL("./server/core/provider-registry.js", import.meta.url)), "utf8");
assert.equal(/modelRouter\._modelMap|this\._modelRouter\._modelMap/.test(registrySource), false);
assert.equal(/api\.\$\{providerId\}\.com/.test(registrySource), false);

console.log("ProviderRegistry and ModelRouter tests passed.");
