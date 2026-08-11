export const DEFAULT_REWRITE_JSON_MAX_TOKENS = 4096;

export function rewriteStructuredCompletionOptions(options = {}) {
  const requestedMaxTokens = Number(options.maxTokens || 0);
  return {
    ...options,
    jsonMode: true,
    maxTokens: requestedMaxTokens > 0
      ? requestedMaxTokens
      : DEFAULT_REWRITE_JSON_MAX_TOKENS,
  };
}

export function runRewriteStructuredCompletion(
  complete,
  provider,
  messages,
  signal,
  options = {},
) {
  if (typeof complete !== "function") {
    throw new TypeError("缺少文案结构化生成函数");
  }
  return complete(
    provider,
    messages,
    signal,
    rewriteStructuredCompletionOptions(options),
  );
}

export async function runRewriteStructuredJson(
  complete,
  parse,
  provider,
  messages,
  signal,
  options = {},
) {
  if (typeof parse !== "function") {
    throw new TypeError("缺少文案结构化解析函数");
  }
  const firstContent = await runRewriteStructuredCompletion(
    complete,
    provider,
    messages,
    signal,
    options,
  );
  try {
    return parse(firstContent);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }

  const retryInstruction = {
    role: "user",
    content: [
      "上一轮结构化输出为空或无法解析，请只重做当前步骤。",
      "直接返回一个完整 JSON 对象，不要 Markdown、代码围栏、注释或解释。",
      "保持原要求中的字段完整，并确保 JSON 在一次响应内正常结束。",
    ].join("\n"),
  };
  const retryOptions = {
    ...rewriteStructuredCompletionOptions(options),
    temperature: 0.1,
    jsonMode: false,
  };
  const retryContent = await complete(
    provider,
    [...messages, retryInstruction],
    signal,
    retryOptions,
  );
  return parse(retryContent);
}
