import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./ui/modules/kinetic-text.js", import.meta.url), "utf8");

assert.match(
  source,
  /function triggerKineticVideoDownload[\s\S]*mediaUrl\("video",\s*\{\s*download:\s*true\s*\}\)/u,
  "dynamic text video must have a browser-native download action",
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
  /outputs\?\.finalVideo[\s\S]*triggerKineticVideoDownload\(\)[\s\S]*return/u,
  "an existing final video must download directly without another render",
);

assert.match(
  source,
  /job\.status === "completed"[\s\S]*options\.downloadOnComplete[\s\S]*triggerKineticVideoDownload\(\)/u,
  "the first completed render must automatically start the browser download",
);
assert.match(
  source,
  /saveActiveJob\(data\.job,\s*\{\s*renderOnComplete:\s*true,\s*downloadOnComplete:\s*true\s*\}\)/u,
  "download intent must survive render polling",
);

console.log("kinetic browser download flow: OK");
