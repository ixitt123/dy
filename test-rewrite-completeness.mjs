import assert from "node:assert/strict";
import fs from "node:fs";

const server = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("./ui/modules/legacy-runtime.js", import.meta.url), "utf8");
const pipelinePrompt = fs.readFileSync(new URL("./prompts/rewrite_pipeline.md", import.meta.url), "utf8");
const humanizePrompt = fs.readFileSync(new URL("./prompts/humanize_zh.md", import.meta.url), "utf8");

assert.doesNotMatch(server, /function truncateRewriteToLimit/u);
assert.doesNotMatch(server, /function padRewriteToMinimum/u);
assert.match(server, /REWRITE_WORD_COUNT_OVERFLOW_RATE = 0\.2/u);
assert.match(server, /function rewriteHasNaturalEnding/u);
assert.match(server, /count <= softMax/u);
assert.match(server, /绝对禁止用 substring、slice 或按字符数量直接截断/u);
assert.match(server, /结尾仍不完整。系统没有截断或输出残缺文案/u);
assert.match(server, /字数略超：[\s\S]*已优先保留完整表达/u);
assert.match(runtime, /rewrite-word-count-warning/u);
assert.match(pipelinePrompt, /exceed the selected maximum by up to 20%/u);
assert.match(humanizePrompt, /Never cut or truncate at a character boundary/u);

console.log("Rewrite completeness: OK");
