import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./ui/modules/ian-xiaohei-app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./ui/xiaohei-illustrations.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./ui/xiaohei-illustrations.html", import.meta.url), "utf8");
const routes = fs.readFileSync(new URL("./server/routes/ian-xiaohei-routes.js", import.meta.url), "utf8");
const exportRoute = routes.slice(
  routes.indexOf('route === "export-external-prompts"'),
  routes.indexOf('route === "generate-shot"'),
);

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
  /function firstPromptCopyShot\(/,
  "The toolbar copy action must select one shot instead of copying the whole prompt package.",
);

assert.match(
  source,
  /async function exportExternalPrompts\(/,
  "Xiaohei must provide an external-software prompt export workflow.",
);

assert.match(
  source,
  /\/api\/ian-xiaohei\/export-external-prompts/,
  "The external prompt export workflow must call the export endpoint, not the image API.",
);

assert.match(
  source,
  /保留当前 Skill 原本允许的少量中文手写标注/,
  "Xiaohei prompt format must preserve the selected Skill's handwritten Chinese label style.",
);

assert.doesNotMatch(
  source,
  /批量任务协议|multi-image set|NEXT INDEPENDENT JOB|本次只生成 Scene|分镜编号：\$\{shot\.index\}\/\$\{total\}|共 \$\{imageCount\} 个 Scene|shots\.slice\(0, imageCount\)/,
  "Xiaohei prompt text must not use wording that makes image models produce grouped images.",
);

assert.match(
  source,
  /await navigator\.clipboard\.writeText\(shotPromptBlock\(shot, state\.plan\)\)/,
  "The toolbar copy action must copy exactly one shot prompt.",
);

assert.match(
  html,
  /复制下一张提示词/,
  "The toolbar copy button must advertise single-shot copying.",
);

assert.doesNotMatch(
  html,
  /复制全部提示词/,
  "The Xiaohei page must not keep a copy-all prompt entry point that encourages grouped images.",
);

assert.match(
  html,
  /导出外部生图包/,
  "The Xiaohei page must expose a one-click external prompt package export button.",
);

assert.match(
  exportRoute,
  /exportExternalPromptFiles/,
  "The external prompt export route must write a local prompt package.",
);

assert.doesNotMatch(
  exportRoute,
  /generateImage|imageService/,
  "The external prompt export route must not call the in-app image generation API.",
);

assert.match(
  routes,
  /external-image-prompts/,
  "The external prompt package must use a dedicated folder.",
);

assert.match(
  routes,
  /scene-\$\{String\(index\)\.padStart\(2, "0"\)\}\.txt/,
  "The external prompt package must write one txt file per image.",
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
