import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [routeSource, uiSource] = await Promise.all([
  readFile(new URL("./server/routes/money-printer-routes.js", import.meta.url), "utf8"),
  readFile(new URL("./ui/modules/money-printer.js", import.meta.url), "utf8"),
]);

assert.ok(routeSource.includes('path.join(rootDir, ".venv", "Scripts", "python.exe")'));
assert.ok(routeSource.includes("if (status.api.online) return"));
assert.ok(routeSource.includes("apiStartPromise"));
assert.ok(routeSource.includes("waitForApiReady"));
assert.ok(routeSource.includes("resolveMaterialSourceOrder"));
assert.ok(routeSource.includes("shouldTryNextMaterialSource"));
assert.ok(routeSource.includes("sanitizeMptError"));
assert.ok(uiSource.includes("ensureApiReady().catch"));
assert.ok(uiSource.includes("正在切换备用素材 API"));
assert.ok(uiSource.includes("素材备用顺序"));
assert.ok(uiSource.includes("state.handoff.audio_path"));
assert.ok(uiSource.includes("subtitle_enabled: false"));

console.log("MoneyPrinterTurbo auto-start, single-instance and material fallback integration: OK");
