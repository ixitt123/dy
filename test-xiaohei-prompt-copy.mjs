import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./ui/modules/ian-xiaohei-app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./ui/xiaohei-illustrations.css", import.meta.url), "utf8");

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

assert.match(
  source,
  /data-prompt-action="confirm-all-images"/,
  "Xiaohei prompt cards must provide a confirm-all button for pending local images.",
);

assert.match(
  source,
  /async function uploadAllPendingShotImages/,
  "Xiaohei confirm-all must upload every pending local image.",
);

assert.match(
  source,
  /setButtonFeedback\(button, "loading", "确认中"\)/,
  "Single-image confirmation must show loading feedback on the clicked button.",
);

assert.match(
  css,
  /\.prompt-batch-actions/,
  "Xiaohei confirm-all controls must have visible layout styling.",
);

assert.match(
  css,
  /button\.action-feedback\.is-loading::before/,
  "Prompt action buttons must show visible loading feedback.",
);

console.log("Xiaohei prompt copy safety: OK");
