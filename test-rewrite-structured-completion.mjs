import assert from "node:assert/strict";
import fs from "node:fs";

let structuredCompletionModule;
try {
  structuredCompletionModule = await import("./server/core/rewrite-structured-completion.js");
} catch (error) {
  assert.fail(`缺少改写结构化输出强制边界：${error instanceof Error ? error.message : String(error)}`);
}

const {
  DEFAULT_REWRITE_JSON_MAX_TOKENS,
  runRewriteStructuredCompletion,
  runRewriteStructuredJson,
} = structuredCompletionModule;

{
  const calls = [];
  const provider = { id: "deepseek", model: "deepseek-v4-flash" };
  const messages = [{ role: "system", content: "只输出 JSON" }];
  const signal = new AbortController().signal;
  const value = await runRewriteStructuredCompletion(
    async (...args) => {
      calls.push(args);
      return '{"ok":true}';
    },
    provider,
    messages,
    signal,
    {
      temperature: 0.2,
      requestName: "文案连贯性质检",
      jsonMode: false,
    },
  );

  assert.equal(value, '{"ok":true}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], provider);
  assert.equal(calls[0][1], messages);
  assert.equal(calls[0][2], signal);
  assert.deepEqual(calls[0][3], {
    temperature: 0.2,
    requestName: "文案连贯性质检",
    jsonMode: true,
    maxTokens: DEFAULT_REWRITE_JSON_MAX_TOKENS,
  });
}

{
  const calls = [];
  const provider = { id: "deepseek", model: "deepseek-v4-flash" };
  const parsed = await runRewriteStructuredJson(
    async (...args) => {
      calls.push(args);
      return calls.length === 1 ? "" : '{"versions":{"parentAction":"可用文案"}}';
    },
    JSON.parse,
    provider,
    [{ role: "system", content: "只输出 JSON" }],
    undefined,
    { requestName: "行动号召版质检" },
  );

  assert.deepEqual(parsed, { versions: { parentAction: "可用文案" } });
  assert.equal(calls.length, 2, "JSON 模式偶发空内容时只重试当前结构化阶段一次");
  assert.equal(calls[0][3].jsonMode, true);
  assert.equal(calls[1][3].jsonMode, false, "第二次应避开 DeepSeek JSON Mode 偶发空内容问题");
  assert.match(calls[1][1].at(-1).content, /上一轮结构化输出为空或无法解析/u);
}

const serverSource = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const wordCountStart = serverSource.indexOf("async function repairRewriteWordCounts");
const wordCountEnd = serverSource.indexOf("\nasync function ensureRewriteCoherence", wordCountStart);
const coherenceStart = wordCountEnd + 1;
const coherenceEnd = serverSource.indexOf("\nasync function rewriteTranscriptWithProvider", coherenceStart);
const rewritePipelineStart = serverSource.indexOf("async function rewriteTranscriptWithProvider");
const rewritePipelineEnd = serverSource.indexOf("\nfunction saveAnalysis", rewritePipelineStart);
assert.ok(
  wordCountStart >= 0
    && wordCountEnd > wordCountStart
    && coherenceStart >= 0
    && coherenceEnd > coherenceStart
    && rewritePipelineStart >= 0
    && rewritePipelineEnd > rewritePipelineStart,
  "必须能定位真实改写 pipeline 的四个结构化阶段",
);
const structuredStageSources = [
  serverSource.slice(wordCountStart, wordCountEnd),
  serverSource.slice(coherenceStart, coherenceEnd),
  serverSource.slice(rewritePipelineStart, rewritePipelineEnd),
];
const structuredStageSource = structuredStageSources.join("\n");

assert.equal(
  (structuredStageSource.match(/rewriteStructuredJson\(/gu) || []).length,
  4,
  "初稿、去 AI 味、字数校准、连贯性质检必须全部强制 JSON 输出",
);
assert.doesNotMatch(
  structuredStageSource,
  /chatCompletion\(/u,
  "真实改写 pipeline 不得绕过统一的结构化输出边界",
);

console.log("Rewrite structured completion: OK");
