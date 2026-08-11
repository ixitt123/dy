import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./ui/modules/kinetic-text.js", import.meta.url), "utf8");

assert.doesNotMatch(
  source,
  /function triggerKineticVideoDownload/u,
  "dynamic text must not duplicate a file already written to the unified download directory",
);

const clickStart = source.indexOf('$("#kineticRenderFinal").addEventListener("click"');
const clickEnd = source.indexOf('window.addEventListener("kinetic-text-handoff"', clickStart);
assert.ok(clickStart >= 0 && clickEnd > clickStart, "download button handler must exist");
const clickHandler = source.slice(clickStart, clickEnd);
const existingOutputCheck = clickHandler.indexOf("state.project?.outputs?.finalVideo");
const renderRequest = clickHandler.indexOf('postJson("/api/kinetic-text/render"');
assert.ok(existingOutputCheck >= 0, "download button must check for an existing final video");
assert.ok(renderRequest > existingOutputCheck, "existing final video must be checked before starting a render");
assert.match(
  clickHandler,
  /outputs\?\.finalVideo[\s\S]*postJson\("\/api\/open-path"[\s\S]*return/u,
  "an existing final video must reveal the already-saved file without creating a duplicate browser download",
);

assert.doesNotMatch(
  source,
  /job\.status === "completed"[\s\S]*options\.downloadOnComplete[\s\S]*triggerKineticVideoDownload\(\)/u,
  "a completed render is already in the unified download directory and must not be downloaded a second time",
);
assert.doesNotMatch(
  source,
  /saveActiveJob\(data\.job,\s*\{\s*renderOnComplete:\s*true,\s*downloadOnComplete:\s*true\s*\}\)/u,
  "render polling must not persist a second browser-download intent",
);

console.log("kinetic browser download flow: OK");
