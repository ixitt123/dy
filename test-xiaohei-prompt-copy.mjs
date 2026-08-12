import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./ui/modules/ian-xiaohei-app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./ui/xiaohei-illustrations.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./ui/xiaohei-illustrations.html", import.meta.url), "utf8");
const routes = fs.readFileSync(new URL("./server/routes/ian-xiaohei-routes.js", import.meta.url), "utf8");

assert.match(
  source,
  /function shotPromptBlock\(/,
  "Xiaohei prompts must be assembled through a single-shot prompt block.",
);

assert.match(
  source,
  /请直接生成一张图片素材/,
  "Each Xiaohei image prompt must be a direct single-image generation command.",
);

assert.match(
  source,
  /本次只生成当前这一张独立的 \$\{ratio\} 图片素材/,
  "Each Xiaohei scene prompt must restrict generation to the current scene.",
);

assert.match(
  source,
  /禁止 Collage（拼贴图）/,
  "Xiaohei prompt copy must explicitly forbid collage output.",
);

assert.match(
  source,
  /Contact Sheet（缩略图合集）/,
  "Xiaohei prompt copy must explicitly forbid contact-sheet output.",
);

assert.match(
  source,
  /保留当前 Skill 原本允许的少量中文手写标注/,
  "Xiaohei prompt format must preserve the selected Skill's handwritten Chinese label style.",
);

assert.doesNotMatch(
  source,
  /批量任务协议|multi-image set|NEXT INDEPENDENT JOB|本次只生成 Scene|分镜编号：\$\{shot\.index\}\/\$\{total\}/,
  "Xiaohei prompt text must not use wording that makes image models produce grouped images.",
);

assert.match(
  source,
  /await writeClipboardText\(promptClipboardText\(\)\)/,
  "The toolbar copy action must use the focus-safe clipboard helper.",
);

assert.match(
  source,
  /document\.execCommand\("copy"\)/,
  "Clipboard writes must fall back to the legacy copy command when the embedded document is not focused.",
);

assert.doesNotMatch(
  source,
  /async function copyAllPrompts\(\)[\s\S]*?await createPlan\(\)[\s\S]*?function promptClipboardText/u,
  "Copying prompts must never trigger timeline analysis.",
);

assert.doesNotMatch(
  source,
  /async function copyImageConstraint\(which\)[\s\S]*?await createPlan\(\)[\s\S]*?function syncImageConstraintButtons/u,
  "Copying image constraints must never trigger timeline analysis.",
);

assert.match(
  source,
  /planGenerating/u,
  "Timeline analysis must expose a single-flight state.",
);

assert.match(
  source,
  /function syncPromptActionButtons\(\)/u,
  "Analysis and copy button availability must be synchronized explicitly.",
);

assert.match(
  source,
  /function promptPlanCacheKey\([^)]*job[\s\S]*ttsJobId/u,
  "Prompt plan caches must be keyed by the confirmed TTS job.",
);

assert.doesNotMatch(
  source,
  /const restored = false;/u,
  "A repeated TTS handoff must not hard-code cache restoration to false.",
);

assert.match(
  routes,
  /route === "plan-restore"/u,
  "The server must expose a durable prompt-plan restore endpoint backed by saved plan files.",
);

assert.match(
  html,
  /复制全部提示词/,
  "The toolbar copy button must advertise copying all prompts.",
);

assert.doesNotMatch(
  html,
  /打开 ChatGPT 生图队列|export-external-prompts|chatgpt-image-queue/,
  "The Xiaohei page must not keep the ChatGPT queue export entry point after rollback.",
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
  /function ensurePromptPlanAvailable\(\)/,
  "Xiaohei local-image actions must restore the prompt plan before rendering upload state.",
);

assert.match(
  source,
  /if \(!ensurePromptPlanAvailable\(\)\) return;[\s\S]*data-prompt-action/,
  "Xiaohei prompt action handler must guard actions against a missing in-memory plan.",
);

assert.match(
  source,
  /input\.value = "";/,
  "Xiaohei local-image upload input must reset so selecting the same file again still fires change.",
);

assert.match(
  source,
  /lastStablePlan/,
  "Xiaohei must keep the last valid prompt plan as a local-image upload fallback.",
);

assert.match(
  source,
  /localImagePickerActive[\s\S]*resetVisualWorkflow/,
  "Xiaohei must not reset the prompt plan while the local-image picker is active.",
);

assert.match(
  html,
  /ian-xiaohei-app\.js\?v=\d+/,
  "Xiaohei page must cache-bust the app module after local-image workflow fixes.",
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
