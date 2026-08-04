import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const scripts = packageJson.scripts || {};

assert.equal(scripts["test:e2e"], undefined, "test:e2e must not label HTTP/source checks as browser E2E");
assert.equal(scripts["test:http-contract"], "node test-http-contract.mjs");
assert.equal(scripts["test:browser"], "node test-browser-smoke.mjs");
const mediaCommand = String(scripts["test:media"] || "");
for (const testName of [
  "test-media-verifier.mjs",
  "test-production-media-verification.mjs",
  "test-cs1-bgm-mix.mjs",
  "test-money-printer-final-render.mjs",
  "test-xiaohei-video-render.mjs",
  "test-kinetic-text-render-smoke.mjs",
  "test-production-media-line-binding-scope.mjs",
]) {
  assert.match(mediaCommand, new RegExp(testName.replaceAll(".", "\\.")), `test:media must include ${testName}`);
}
assert.equal(scripts["test:restart"], "node test-service-restart.mjs");
assert.equal(scripts["test:gate"], "node scripts/release-gate.mjs");
assert.match(String(scripts["check:gate"] || ""), /test-release-gate-scope\.mjs/u, "check:gate must retain the release-gate blocker regression");

const [httpContract, browserSmoke, mediaVerifier, productionVerifier, restartTest] = await Promise.all([
  readFile(new URL("./test-http-contract.mjs", import.meta.url), "utf8"),
  readFile(new URL("./test-browser-smoke.mjs", import.meta.url), "utf8"),
  readFile(new URL("./test-media-verifier.mjs", import.meta.url), "utf8"),
  readFile(new URL("./scripts/verify-production-media.mjs", import.meta.url), "utf8"),
  readFile(new URL("./test-service-restart.mjs", import.meta.url), "utf8"),
]);

assert.match(httpContract, /HTTP\s*\/\s*源码契约/u);
assert.match(browserSmoke, /真实浏览器|Chrome/u);
assert.match(mediaVerifier, /ffprobe|媒体/u);
assert.match(productionVerifier, /--artifact/u, "production verifier must require an explicit current artifact path");
assert.match(restartTest, /restart|重启/u);

console.log("Test proof scopes: OK");
