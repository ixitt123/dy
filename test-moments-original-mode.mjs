import assert from "node:assert/strict";
import fs from "node:fs";
import { formatOriginalMomentsPost } from "./server/core/moments-original.js";

const compact = (value) => String(value || "").replace(/\s/gu, "");
const original = "今天和家长聊了很久，真正影响孩子学习状态的，往往不是某一次分数，而是他有没有找到适合自己的节奏。很多时候我们急着催结果，却忘了先帮孩子把目标拆小、把行动落地。只要每天向前走一点，变化就会慢慢出现。";
const formatted = formatOriginalMomentsPost(original);

assert.equal(compact(formatted), compact(original), "Original mode may only change whitespace and paragraph breaks.");
assert.match(formatted, /\n\n/u, "Long original copy should be split into readable Moments paragraphs.");

const existingEmoji = "今天也在认真进步🙂\n明天继续。";
assert.equal(
  compact(formatOriginalMomentsPost(existingEmoji)),
  compact(existingEmoji),
  "Formatting must preserve existing emoji and original characters.",
);

const html = fs.readFileSync(new URL("./ui/index.html", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("./ui/modules/legacy-runtime.js", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const skill = fs.readFileSync(new URL("./skills/wechat-moments-copy-emoji/SKILL.md", import.meta.url), "utf8");

assert.match(html, /改写朋友圈文案\+图片提示词[\s\S]*原文生成朋友圈文案\+图片提示词/u);
assert.match(runtime, /payload\.copyMode = originalMode \? "original" : "rewrite"/u);
assert.match(runtime, /if \(originalMode\) \{[\s\S]*payload\.wordCount = "";[\s\S]*payload\.tone = "";[\s\S]*payload\.intent = "";[\s\S]*payload\.referenceStyle = "";/u);
assert.match(server, /if \(originalMode\) \{[\s\S]*formatOriginalMomentsPost\(sourceText\)[\s\S]*ensureMomentsEmojiMinimum/u);
assert.match(server, /const referenceStyle = originalMode \? "" : resolveMomentsReferenceStyle/u);
assert.match(server, /const imageSourcePost = originalMode \? formatOriginalMomentsPost\(sourceText\) : post/u);
assert.match(server, /原文模式图片硬约束：[\s\S]*图片视觉风格只能使用当前选择的 Skill：[\s\S]*必须且只能返回/u);
assert.match(server, /不得使用人设、分享语气、生成方式、引用素材或建议字数/u);
assert.match(server, /const fixedImageCount = clampMomentsImageCount\(fallback\.imageCount\);[\s\S]*const imageCount = fixedImageCount/u);
assert.match(server, /rawImages\.length < fixedImageCount[\s\S]*实际只生成/u);
assert.match(server, /preserveOriginal: originalMode/u);
assert.match(skill, /原文直用模式/u);

console.log("Moments original mode: OK");
