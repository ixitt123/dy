import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAss } from "./server/kinetic-text/kinetic-text-service.js";

const project = {
  id: "overlay-position-test",
  title: "拖动定位测试",
  text: "正文字幕",
  duration: 4,
  aspectRatio: "16:9",
  effectId: "rolling-focus",
  showBottomSubtitles: true,
  keywordPlacement: "bottom",
  bottomSubtitlePosition: { x: 31, y: 84 },
  segments: [{ id: "segment-1", start: 1, end: 3, text: "正文字幕", keywords: ["正文"] }],
  bookends: {
    intro: { enabled: true, preset: "custom", text: "开头文字", position: { x: 22, y: 33 } },
    outro: { enabled: true, preset: "custom", text: "结尾文字", position: { x: 73, y: 72 } },
  },
};

const ass = buildAss(project);
assert.match(ass, /\\pos\(595,907\)/, "底部关键词字幕应使用独立拖动坐标");
assert.match(ass, /\\move\(422,\d+,422,356,0,\d+\).*开头文字/, "开头文字应使用独立拖动坐标");
assert.match(ass, /\\move\(1402,\d+,1402,778,0,\d+\).*结尾文字/, "结尾文字应使用独立拖动坐标");

const uiSource = fs.readFileSync(new URL("./ui/modules/kinetic-text.js", import.meta.url), "utf8");
assert.match(uiSource, /beginOverlayDrag/);
assert.match(uiSource, /bottomSubtitlePosition/);
assert.match(uiSource, /bookends: \{ \[drag\.target\]/);
assert.match(uiSource, /suppressCanvasClick/);

console.log("Kinetic overlay position tests passed");
