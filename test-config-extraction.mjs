import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_MODEL_MAPPING, DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL, SETTINGS_TASKS } from "./server/config/model-defaults.js";
import { AUTO_MODEL_VALUE, REWRITE_PROVIDER_ORDER, REWRITE_PROVIDER_PRESETS } from "./server/config/provider-presets.js";
import { DEFAULT_REWRITE_REFERENCE, REWRITE_DIRECTIONS, REWRITE_STYLES, REWRITE_VERSION_DEFS, REWRITE_VERSION_DEFAULTS } from "./server/config/rewrite-presets.js";
import { ROUTE_A_DEFAULT_STYLE_ID, ROUTE_A_STYLE_PRESETS } from "./server/config/video-style-presets.js";

assert.equal(DEFAULT_MODEL_MAPPING.image.model, DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL);
assert.equal(Object.keys(SETTINGS_TASKS).length > 0, true);
assert.equal(DEFAULT_REWRITE_REFERENCE.length > 20, true);
assert.equal(REWRITE_DIRECTIONS.includes("招生引流"), true);
assert.equal(REWRITE_STYLES.includes("痞里带刺"), true);
assert.equal(REWRITE_VERSION_DEFS.length, Object.keys(REWRITE_VERSION_DEFAULTS).length);
assert.equal(AUTO_MODEL_VALUE, "__auto_latest__");
assert.deepEqual(Object.keys(REWRITE_PROVIDER_PRESETS), REWRITE_PROVIDER_ORDER);
assert.equal(ROUTE_A_DEFAULT_STYLE_ID, "black_gold_knowledge");
assert.equal(Boolean(ROUTE_A_STYLE_PRESETS[ROUTE_A_DEFAULT_STYLE_ID]), true);

const prompt = fs.readFileSync("prompts/storyboard-image/default-commercial.md", "utf8");
for (const placeholder of ["{{title}}", "{{visual_style}}", "{{platform}}", "{{aspectRatio}}"] ) {
  assert.equal(prompt.includes(placeholder), true);
}

const uiServerSource = fs.readFileSync("ui-server.mjs", "utf8");
assert.equal(uiServerSource.includes("const DEFAULT_REWRITE_REFERENCE"), false);
assert.equal(uiServerSource.includes("const DEFAULT_MODEL_MAPPING"), false);
assert.equal(uiServerSource.includes("const REWRITE_PROVIDER_PRESETS"), false);

console.log("Config extraction tests passed.");
