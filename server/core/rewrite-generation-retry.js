const DEFAULT_MAX_ATTEMPTS = 2;
const FIRST_RETRY_DELAY_MS = 600;

function rewriteRetryDelayMs(attempt) {
  return FIRST_RETRY_DELAY_MS * Math.max(1, 2 ** Math.max(0, Number(attempt || 1) - 1));
}

export function isRetryableRewriteGenerationError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "");
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");

  if (code === "MODEL_REQUEST_TIMEOUT") return true;
  if ([408, 425, 429].includes(status) || (status >= 500 && status < 600)) return true;
  if (name === "SyntaxError") return true;
  if (/failed to fetch|fetch failed|network|socket|econnreset|econnrefused|terminated/i.test(message)) return true;
  if (/文章连贯性检查未通过|结尾仍不完整|AI 改写没有返回可用内容/u.test(message)) return true;
  return false;
}

function recordAttempts(error, attempts) {
  if (!error || (typeof error !== "object" && typeof error !== "function")) return;
  try {
    error.attempts = attempts;
  } catch {
    // Preserve the original error even when it is non-extensible.
  }
}

export async function runRewriteGenerationWithRetry(runAttempt, {
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  onRetry = null,
} = {}) {
  const attemptsLimit = Math.max(1, Math.floor(Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS));

  for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
    try {
      return {
        value: await runAttempt(attempt),
        attempts: attempt,
        retried: attempt > 1,
      };
    } catch (error) {
      const canRetry = attempt < attemptsLimit && isRetryableRewriteGenerationError(error);
      if (!canRetry) {
        recordAttempts(error, attempt);
        throw error;
      }

      const delayMs = rewriteRetryDelayMs(attempt);
      await onRetry?.({ attempt, nextAttempt: attempt + 1, delayMs, error });
      await wait(delayMs);
    }
  }

  throw new Error("文案版本生成重试状态异常。");
}

