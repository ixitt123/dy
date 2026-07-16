import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeIllustrationConfig } from "./server/kinetic-text/generative-illustration.js";

assert.equal(normalizeIllustrationConfig({}, { duration: 12 }).enabled, false, "动态背景默认应为可选关闭状态");
assert.equal(normalizeIllustrationConfig({ enabled: true }, { duration: 12 }).enabled, true, "用户开启后应保留启用状态");

const page = fs.readFileSync(new URL("./ui/index.html", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("./ui/modules/kinetic-text.js", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("./server/kinetic-text/kinetic-text-service.js", import.meta.url), "utf8");

assert.match(page, /id="kineticIllustrationEnabled"/);
for (const id of ["Scene", "Character", "Density", "Motion", "Tone", "Duration", "ShowText"]) {
  assert.doesNotMatch(page, new RegExp(`kineticIllustration${id}`), `${id} 不是官方参数，不应显示或保存`);
  assert.doesNotMatch(ui, new RegExp(`kineticIllustration${id}`), `${id} 不是官方参数，不应残留绑定逻辑`);
}
assert.match(page, /Generative Illustration 动态背景/);
assert.match(page, /官方原版 · Prompt Garden/);
assert.match(page, /当前文案 · 核心概念/);
assert.match(page, /生成或应用当前预设/);
assert.match(page, /复制全部提示词/);
assert.match(page, /使用已上传图片合成/);
assert.match(ui, /官方 Generative Illustration 分层与确定性渲染流程/);
assert.match(ui, /sourceMode = "api"/);
assert.match(ui, /async function setIllustrationEnabled/);
assert.match(ui, /动态背景特效已关闭，已恢复之前的背景/);
assert.match(service, /background: result\.config\.enabled \? generatedBackground : project\.background/);

console.log("Kinetic illustration optional-toggle tests passed");
