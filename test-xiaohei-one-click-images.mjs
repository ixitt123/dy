import assert from "node:assert/strict";
import fs from "node:fs";

const routes = fs.readFileSync(new URL("./server/routes/ian-xiaohei-routes.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./ui/modules/ian-xiaohei-app.js", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const workbench = fs.readFileSync(new URL("./ui/workbench.js", import.meta.url), "utf8");

const generateShotRoute = routes.slice(
  routes.indexOf('route === "generate-shot"'),
  routes.indexOf('route === "upload-shot-image"'),
);

assert.doesNotMatch(generateShotRoute, /410/u);
assert.match(generateShotRoute, /imageService\.generateImage/u);
assert.match(generateShotRoute, /provider: String\(body\.provider \|\| ""\)/u);
assert.match(generateShotRoute, /source: "ai_generated"/u);
assert.match(generateShotRoute, /confirmed: true/u);
assert.match(app, /data-prompt-action="generate-all-images"/u);
assert.match(app, /async function generateAllMissingShotImages/u);
assert.match(app, /for \(const \[position, index\] of indexes\.entries\(\)\)/u);
assert.match(app, /await generateShotImage\(index\)/u);
assert.match(app, /!bound\.has\(index\) && !pending\.has\(index\)/u);
assert.match(app, /prompt: shotPromptBlock\(shot, state\.plan\)/u);
assert.match(app, /锁定 Skill/u);
assert.match(app, /成功后会立即绑定/u);
assert.match(server, /group: "图片生成"/u);
assert.match(server, /imageService\.testProviderConnection\(providerId\)/u);
assert.match(server, /settings\.modelMap\.image = \{ provider: id, model: nextModel \}/u);
assert.match(workbench, /"图片生成"/u);
assert.match(workbench, /taskKey === "image"/u);

console.log("Xiaohei one-click image generation: OK");
