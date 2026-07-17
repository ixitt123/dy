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
assert.match(server, /if \(originalMode\) \{[\s\S]*formatOriginalMomentsPost\(sourceText\)[\s\S]*ensureMomentsEmojiMinimum/u);
assert.match(server, /const referenceStyle = originalMode \? "" : resolveMomentsReferenceStyle/u);
assert.match(server, /preserveOriginal: originalMode/u);
assert.match(skill, /原文直用模式/u);

console.log("Moments original mode: OK");
