import assert from "node:assert/strict";
import { normalizeModelMapping } from "./server/config/model-defaults.js";

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
assert.equal(legacy.tts.provider, "aliyun_bailian", "normalization must not mutate local settings input");
assert.equal(legacy.video.provider, "kling", "normalization must not mutate local settings input");

const defaults = normalizeModelMapping();
assert.equal(defaults.tts.provider, "ali-bailian");
assert.equal(defaults.video, undefined);

console.log("Model mapping normalization: OK");
