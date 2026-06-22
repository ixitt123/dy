import assert from "node:assert/strict";
import { generatePlatformTitles } from "./server/core/title-generator.js";

const result = generatePlatformTitles({
  transcriptText: "不要一上来就背单词。孩子半年说不好英语，问题往往不是努力不够，而是方法错了。",
  videoType: "english-improvement",
});

assert.ok(result.douyinTitle.length >= 2);
assert.ok(result.xiaohongshuTitle.length >= result.douyinTitle.length);
assert.ok(result.shipinhaoTitle.length >= result.douyinTitle.length);
assert.ok(result.projectTitle.endsWith(new Date().toISOString().slice(0, 10).replaceAll("-", "")));
assert.ok(Array.isArray(result.seoKeywords));
assert.ok(Array.isArray(result.hashtags));
assert.ok(result.hashtags.every((item) => item.startsWith("#")));

console.log("Title generator tests passed.");
