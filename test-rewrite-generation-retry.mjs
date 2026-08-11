import assert from "node:assert/strict";
import fs from "node:fs";

let retryModule;
try {
  retryModule = await import("./server/core/rewrite-generation-retry.js");
} catch (error) {
  assert.fail(`缺少文案版本生成重试边界：${error instanceof Error ? error.message : String(error)}`);
}

const {
  isRetryableRewriteGenerationError,
  runRewriteGenerationWithRetry,
} = retryModule;

function errorWithStatus(status, message = `HTTP ${status}`) {
  const error = new Error(message);
  error.status = status;
  return error;
}

{
  let calls = 0;
  const delays = [];
  const result = await runRewriteGenerationWithRetry(async () => {
    calls += 1;
    if (calls === 1) throw errorWithStatus(503, "DeepSeek 服务过载");
    return { rewrite: "行动号召版" };
  }, {
    wait: async (delayMs) => delays.push(delayMs),
  });

  assert.equal(calls, 2, "503 后应只自动重试一次");
  assert.deepEqual(result.value, { rewrite: "行动号召版" });
  assert.equal(result.attempts, 2);
  assert.equal(result.retried, true);
  assert.deepEqual(delays, [600]);
}

{
  let calls = 0;
  const result = await runRewriteGenerationWithRetry(async () => {
    calls += 1;
    if (calls === 1) throw new SyntaxError("Unexpected end of JSON input");
    return "第二次返回有效 JSON";
  }, { wait: async () => {} });

  assert.equal(result.value, "第二次返回有效 JSON");
  assert.equal(result.attempts, 2, "模型 JSON 偶发截断应重试当前版本");
}

{
  let calls = 0;
  const result = await runRewriteGenerationWithRetry(async () => {
    calls += 1;
    if (calls === 1) throw new Error("文章连贯性检查未通过：行动号召版缺少完整结尾。系统未显示不完整成品，请重新生成。");
    return "质检重跑后通过";
  }, { wait: async () => {} });

  assert.equal(result.value, "质检重跑后通过");
  assert.equal(calls, 2, "随机质检失败应重新生成当前版本一次");
}

for (const error of [
  errorWithStatus(400, "请求格式错误"),
  errorWithStatus(401, "API Key 错误"),
  errorWithStatus(402, "余额不足"),
  errorWithStatus(422, "参数错误"),
  new Error("请先保存 DeepSeek API Key"),
]) {
  let calls = 0;
  await assert.rejects(
    runRewriteGenerationWithRetry(async () => {
      calls += 1;
      throw error;
    }, { wait: async () => {} }),
    (received) => received === error,
  );
  assert.equal(calls, 1, `${error.message} 不应重复请求或重复计费`);
  assert.equal(isRetryableRewriteGenerationError(error), false);
}

{
  const error = errorWithStatus(500, "DeepSeek 临时服务错误");
  let calls = 0;
  await assert.rejects(
    runRewriteGenerationWithRetry(async () => {
      calls += 1;
      throw error;
    }, { wait: async () => {} }),
    (received) => received === error && received.attempts === 2,
  );
  assert.equal(calls, 2, "超过一次自动重试后必须停止，不能无限重试");
}

const serverSource = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
assert.match(serverSource, /runRewriteGenerationWithRetry\(\(\) => rewriteTranscriptWithProvider/u);
assert.match(serverSource, /generation:\s*\{[\s\S]*?attempts:[\s\S]*?retried:/u);

console.log("Rewrite generation retry: OK");
