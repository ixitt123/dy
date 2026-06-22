import assert from "node:assert/strict";
import { parseSceneIndexFromFilename } from "./server/image/image-service.js";

assert.equal(parseSceneIndexFromFilename("01.png"), 1);
assert.equal(parseSceneIndexFromFilename("02_人物出场.png"), 2);
assert.equal(parseSceneIndexFromFilename("scene_03.png"), 3);
assert.equal(parseSceneIndexFromFilename("镜头04.png"), 4);
assert.equal(parseSceneIndexFromFilename("分镜 05.webp"), 5);
assert.equal(parseSceneIndexFromFilename("微信图片.png"), 0);

console.log("Image scene index tests passed.");
