import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./ui/modules/ian-xiaohei-app.js", import.meta.url), "utf8");

assert.match(
  source,
  /function shotPromptBlock\(/,
  "Xiaohei prompts must be assembled through a single-shot prompt block.",
);

assert.match(
  source,
  /本编号 #[\s\S]*是一个独立任务\(Job\)/,
  "Each Xiaohei image prompt must mark the numbered shot as an independent job.",
);

assert.match(
  source,
  /禁止自动创建 Collage/,
  "Xiaohei prompt copy must explicitly forbid collage output.",
);

assert.match(
  source,
  /禁止自动创建 Contact Sheet/,
  "Xiaohei prompt copy must explicitly forbid contact-sheet output.",
);

assert.match(
  source,
  /shots\.slice\(0, imageCount\)/,
  "Copy-all must cap copied Xiaohei image jobs to the requested maximum.",
);

assert.match(
  source,
  /data-prompt-action="copy-prompt"/,
  "Each Xiaohei shot card must provide a single-shot prompt copy action.",
);

console.log("Xiaohei prompt copy safety: OK");
