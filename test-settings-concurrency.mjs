import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSettingsCenter } from "./server/core/settings-center.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "settings-concurrency-"));
const file = path.join(root, "settings.json");
const center = createSettingsCenter(root, file);
center.write({ revision: 1, providers: {}, tts: {}, preserved: { enabled: true } });

assert.equal(typeof center.update, "function", "设置中心缺少串行 update，异步调用仍会整份覆盖");
await Promise.all([
  center.update(async (draft) => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    draft.providers.alpha = { model: "alpha-model" };
  }),
  center.update(async (draft) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    draft.tts.default_provider = "minimax";
  }),
  center.update((draft) => {
    draft.revision = 2;
  }),
]);

const saved = center.read();
assert.equal(saved.providers.alpha.model, "alpha-model");
assert.equal(saved.tts.default_provider, "minimax");
assert.equal(saved.revision, 2);
assert.equal(saved.preserved.enabled, true);
assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, "utf8")));

await assert.rejects(
  center.update(async () => {
    throw new Error("expected update failure");
  }),
  /expected update failure/u,
);
await center.update((draft) => {
  draft.afterRejectedUpdate = true;
});
assert.equal(center.read().afterRejectedUpdate, true, "一次更新失败后，设置队列必须继续工作");

const restartedCenter = createSettingsCenter(root, file);
const afterRestart = restartedCenter.read();
assert.equal(afterRestart.providers.alpha.model, "alpha-model");
assert.equal(afterRestart.tts.default_provider, "minimax");
assert.equal(afterRestart.revision, 2);
assert.equal(afterRestart.preserved.enabled, true);
assert.equal(afterRestart.afterRejectedUpdate, true);

const serverSource = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
assert.match(serverSource, /function readSettings\(\) \{\s*return normalizeSettings\(settingsCenter\.read\(\)\);/u, "ui-server 仍绕过设置中心读取");
assert.match(serverSource, /function writeSettings\(settings\) \{\s*settingsCenter\.write\(normalizeSettings\(settings\)\);/u, "ui-server 仍绕过设置中心写入");
const validateStart = serverSource.indexOf("async function validateAndSaveRequiredProvider");
const validateEnd = serverSource.indexOf("\nasync function testProviderSample", validateStart);
const validateSource = serverSource.slice(validateStart, validateEnd);
assert.doesNotMatch(validateSource, /reloadModelRuntime\(draft\)/u, "异步检测后仍会把旧设置草稿整份覆盖回磁盘");
const rewriteProviderStart = serverSource.indexOf("async function getRewriteProvider");
const rewriteProviderEnd = serverSource.indexOf("\nfunction subtitleCoreCharacters", rewriteProviderStart);
const rewriteProviderSource = serverSource.slice(rewriteProviderStart, rewriteProviderEnd);
assert.doesNotMatch(rewriteProviderSource, /writeSettings\(settings\)/u, "自动模型刷新仍会整份写回旧设置快照");

fs.rmSync(root, { recursive: true, force: true });
console.log("Settings concurrency and single-writer integration: OK");
