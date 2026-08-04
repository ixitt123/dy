import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [toolSource, testSource] = await Promise.all([
  readFile(new URL("./scripts/service-restart.mjs", import.meta.url), "utf8"),
  readFile(new URL("./test-service-restart.mjs", import.meta.url), "utf8"),
]);

assert.doesNotMatch(toolSource, /待 05\.x 实现|仅占位/u, "MoneyPrinter restart helper must use the installed runtime instead of a placeholder");
assert.match(toolSource, /path\.join\(root, "\.venv", "Scripts", "python\.exe"\)/u, "MoneyPrinter restart helper must resolve the installed virtualenv Python");
assert.match(toolSource, /\["run", "--frozen", "python", entryPath\]/u, "clean installs must fall back to the locked uv runtime instead of borrowing an old virtualenv");
assert.match(toolSource, /main\.py/u, "MoneyPrinter restart helper must launch the real API entrypoint");
assert.match(toolSource, /--no-auto-close/u, "restarted UI service must use the desktop launcher's persistent mode");
assert.doesNotMatch(toolSource, /taskkill[\s\S]{0,160}"\/T"/u, "restart tool must not terminate the whole desktop process tree");
assert.doesNotMatch(testSource, /c61dfbe/u, "restart test must not hard-code a historical commit");
assert.match(testSource, /fixture\.job\.kind/u, "restart test must create its persisted business probe from the frozen fixture");
assert.match(testSource, /randomUUID/u, "restart test must isolate each fixture-backed probe instance");
assert.match(testSource, /fixtures[\s\S]{0,120}restart[\s\S]{0,120}input\.json/u, "restart test must load the frozen restart fixture");
assert.match(testSource, /fixtureSha256/u, "restart test must record the frozen fixture hash");
assert.match(testSource, /screenshot/u, "restart test must retain browser evidence when an evidence directory is supplied");
assert.match(testSource, /8080/u, "restart test must exercise the MoneyPrinter API port");
assert.match(toolSource, /api\/v1\/tasks/u, "restart tool must inspect the real MoneyPrinter task endpoint");
assert.match(testSource, /getMoneyPrinterTasks/u, "restart test must call the MoneyPrinter task inspection helper");

console.log("Service restart proof scope: OK");
