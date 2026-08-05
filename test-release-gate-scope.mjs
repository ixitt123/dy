import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./scripts/release-gate.mjs", import.meta.url), "utf8");

assert.match(source, /--only/u, "release gate must support a category selector");
assert.match(source, /test-media-verifier\.mjs/u, "media category must retain verifier coverage");
assert.match(source, /test-production-media-verification\.mjs/u, "media category must include current-artifact binding coverage");
assert.match(source, /test-cs1-bgm-mix\.mjs/u, "media category must include CS1 final mix coverage");
assert.match(source, /test-money-printer-final-render\.mjs/u, "media category must include MoneyPrinter final render coverage");
assert.match(source, /test-xiaohei-video-render\.mjs/u, "media category must include Xiaohei renderer coverage");
assert.match(source, /test-kinetic-text-render-smoke\.mjs/u, "media category must include Kinetic renderer coverage");
assert.doesNotMatch(source, /cmd:\s*"npm\.cmd"/u, "release gate must not use a Windows command wrapper as a direct spawn executable");
assert.match(source, /name:\s*"security"/u, "security must be a separate release-gate category");
for (const file of [
  "test-error-code-http.mjs",
  "test-error-code-integration.mjs",
  "test-image-delete-boundary.mjs",
  "test-settings-concurrency.mjs",
  "test-task-export-xlsx-browser.mjs",
  "test-ui-server-read-observability.mjs",
  "test-ui-server-streamed-file-response.mjs",
  "test-xlsx-export-compatibility.mjs",
]) {
  assert.match(source, new RegExp(file.replaceAll(".", "\\."), "u"), `release gate must include ${file}`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-gate-scope-"));
const reportPath = path.join(tempRoot, "external-report.json");
try {
  const external = spawnSync(process.execPath, [
    "scripts/release-gate.mjs",
    "--only", "external",
    "--report", reportPath,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(external.status, 2, "an empty required external category must block the release with exit code 2");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.exitCode, 2, "aggregate report must retain the blocking exit code");
  assert.equal(report.categories.external.status, "blocked", "external category must be reported as blocked");
  assert.equal(report.categories.external.exitCode, 2, "external category must have its own exit code");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Release gate scope: OK");
