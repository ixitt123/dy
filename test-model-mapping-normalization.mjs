import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeDeepSeekModelName,
  normalizeModelMapping,
} from "./server/config/model-defaults.js";
import { REWRITE_PROVIDER_PRESETS } from "./server/config/provider-presets.js";
import { DeepSeekProvider } from "./server/core/model-router/providers/deepseek.js";

const legacy = {
  rewrite: { provider: "deepseek", model: "deepseek-chat" },
  tts: { provider: "aliyun_bailian", model: "cosyvoice-v2" },
  video: { provider: "kling", model: "kling" },
};
const normalized = normalizeModelMapping(legacy);

assert.equal(normalized.tts.provider, "ali-bailian");
assert.equal(normalized.tts.model, "cosyvoice-v2");
assert.equal(normalized.video, undefined);
assert.equal(normalized.rewrite.provider, "deepseek");
assert.equal(normalized.rewrite.model, "deepseek-v4-flash");
assert.equal(normalizeDeepSeekModelName("deepseek-chat"), "deepseek-v4-flash");
assert.equal(normalizeDeepSeekModelName("deepseek-reasoner"), "deepseek-v4-flash");
assert.equal(normalizeDeepSeekModelName("deepseek-v4-pro"), "deepseek-v4-pro");
assert.equal(legacy.tts.provider, "aliyun_bailian", "normalization must not mutate local settings input");
assert.equal(legacy.video.provider, "kling", "normalization must not mutate local settings input");

const defaults = normalizeModelMapping();
assert.equal(defaults.tts.provider, "ali-bailian");
assert.equal(defaults.video, undefined);
assert.equal(defaults.rewrite.model, "deepseek-v4-flash");
assert.equal(REWRITE_PROVIDER_PRESETS.deepseek.model, "deepseek-v4-flash");
assert.deepEqual(REWRITE_PROVIDER_PRESETS.deepseek.models, ["deepseek-v4-flash", "deepseek-v4-pro"]);
const deepSeekProvider = new DeepSeekProvider({ apiKey: "test-key" });
assert.equal(deepSeekProvider.defaultModel, "deepseek-v4-flash");
assert.deepEqual(
  deepSeekProvider.buildRequestBody([{ role: "user", content: "test" }]).thinking,
  { type: "disabled" },
  "The migrated chat model must preserve the legacy non-thinking behavior.",
);
const uiServerSource = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
assert.match(
  uiServerSource,
  /provider\.id === "deepseek"\s*\?\s*deepSeekRequestCompatibility\(provider\.model\)/u,
  "The direct structured-JSON request path must apply DeepSeek V4 compatibility.",
);

console.log("Model mapping normalization: OK");
