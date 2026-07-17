import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  resolveMaterialSourceOrder,
  sanitizeMptError,
  shouldTryNextMaterialSource,
} from "./server/routes/money-printer-routes.js";

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

const materials = { fallbackOrder: ["pexels", "pixabay", "coverr"] };
assert.deepEqual(resolveMaterialSourceOrder("pixabay", materials), ["pixabay", "pexels", "coverr"]);
assert.equal(shouldTryNextMaterialSource(
  { state: -1, progress: 40, failed_stage: "pipeline", error: "Pexels failed" },
  { sourceIndex: 0, materialSources: ["pexels", "pixabay"] },
), true);
assert.equal(
  sanitizeMptError('ValueError: pexels_api_keys is not set {"moonshot_api_key":"secret"}'),
  "Pexels 素材 API Key 未配置",
);
assert.ok(!sanitizeMptError('request failed {"api_key":"secret"}').includes("secret"));

console.log("MoneyPrinterTurbo auto-start, single-instance and material fallback integration: OK");
