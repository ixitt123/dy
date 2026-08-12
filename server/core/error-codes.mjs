// server/core/error-codes.mjs
//
// 统一错误码和重试策略（09.05）。
// 区分：离线 / 永久不存在 / 临时失败 / 业务失败，支持可重试判断。
//
// 用途：任务恢复、上游服务调用、生产线 handoff 等场景统一错误码，
//   避免静默吞异常或无法区分"临时失败可重试"与"永久失败不重试"。

export const ErrorCodes = Object.freeze({
  // 上游服务离线（网络不可达 / 服务未启动）
  UPSTREAM_OFFLINE: "UPSTREAM_OFFLINE",
  // 任务/资源永久不存在（已被删除或从未创建）
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
  // 任务映射不存在（如 MPT 任务映射丢失）
  MAPPING_NOT_FOUND: "MAPPING_NOT_FOUND",
  // 任务执行失败（上游返回失败结果）
  JOB_FAILED: "JOB_FAILED",
  // 临时失败（超时 / 限流 / 短暂错误，可重试）
  TEMPORARY_FAILURE: "TEMPORARY_FAILURE",
  // 业务失败（输入无效 / 逻辑约束，不可重试）
  BUSINESS_FAILURE: "BUSINESS_FAILURE",
  // 未知错误（默认）
  UNKNOWN: "UNKNOWN",
});

// 可重试的错误码
const RETRYABLE_CODES = new Set([
  ErrorCodes.UPSTREAM_OFFLINE,
  ErrorCodes.TEMPORARY_FAILURE,
]);

const ERROR_CATEGORIES = Object.freeze({
  [ErrorCodes.UPSTREAM_OFFLINE]: "offline",
  [ErrorCodes.JOB_NOT_FOUND]: "permanent",
  [ErrorCodes.MAPPING_NOT_FOUND]: "permanent",
  [ErrorCodes.JOB_FAILED]: "business",
  [ErrorCodes.TEMPORARY_FAILURE]: "temporary",
  [ErrorCodes.BUSINESS_FAILURE]: "business",
  [ErrorCodes.UNKNOWN]: "unknown",
});

const HTTP_STATUS_BY_CODE = Object.freeze({
  [ErrorCodes.UPSTREAM_OFFLINE]: 503,
  [ErrorCodes.JOB_NOT_FOUND]: 404,
  [ErrorCodes.MAPPING_NOT_FOUND]: 404,
  [ErrorCodes.JOB_FAILED]: 422,
  [ErrorCodes.TEMPORARY_FAILURE]: 503,
  [ErrorCodes.BUSINESS_FAILURE]: 400,
  [ErrorCodes.UNKNOWN]: 500,
});

// 判断错误码是否可重试
export function isRetryable(code) {
  return RETRYABLE_CODES.has(code);
}

export function errorCategory(code) {
  return ERROR_CATEGORIES[code] || ERROR_CATEGORIES[ErrorCodes.UNKNOWN];
}

export function errorHttpStatus(code) {
  return HTTP_STATUS_BY_CODE[code] || HTTP_STATUS_BY_CODE[ErrorCodes.UNKNOWN];
}

// 根据错误对象推断错误码
export function inferErrorCode(error) {
  if (!error) return ErrorCodes.UNKNOWN;
  if (Object.values(ErrorCodes).includes(error.code)) return error.code;
  const msg = String(error.message || error.code || error).toLowerCase();
  // 网络离线
  if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ECONNRESET" || error.code === "ETIMEDOUT") {
    return ErrorCodes.UPSTREAM_OFFLINE;
  }
  if (/offline|无法连接|服务未启动|connection refused|network error/.test(msg)) {
    return ErrorCodes.UPSTREAM_OFFLINE;
  }
  // 映射不存在（更具体，先于 JOB_NOT_FOUND 检查）
  if (/mapping.*not.*found|映射.*丢失|映射.*不存在/.test(msg)) {
    return ErrorCodes.MAPPING_NOT_FOUND;
  }
  // 资源不存在
  if (error.code === "ENOENT" || /not found|不存在|未找到|no such/.test(msg)) {
    return ErrorCodes.JOB_NOT_FOUND;
  }
  // 临时失败
  if (error.code === 429 || error.code === "ESOCKETTIMEDOUT" || /timeout|超时|rate limit|限流|busy|繁忙/.test(msg)) {
    return ErrorCodes.TEMPORARY_FAILURE;
  }
  // 业务失败
  if (/invalid|无效|illegal|非法|constraint|约束|不允许|禁止/.test(msg)) {
    return ErrorCodes.BUSINESS_FAILURE;
  }
  // 任务失败
  if (/failed|失败|error|错误/.test(msg)) {
    return ErrorCodes.JOB_FAILED;
  }
  return ErrorCodes.UNKNOWN;
}

export function toErrorResponse(error, options = {}) {
  const code = options.code || inferErrorCode(error);
  const retryable = options.retryable ?? isRetryable(code);
  const message = String(options.message || error?.message || error || "未知错误");
  return {
    status: options.status || errorHttpStatus(code),
    body: {
      ok: false,
      code,
      category: errorCategory(code),
      retryable,
      retryAfterMs: retryable ? Number(options.retryAfterMs || 2000) : 0,
      message,
    },
  };
}

// 创建带错误码的错误
export class CodedError extends Error {
  constructor(message, code = ErrorCodes.UNKNOWN, { cause, retryable } = {}) {
    super(message, { cause });
    this.name = "CodedError";
    this.code = code;
    this.retryable = retryable !== undefined ? retryable : isRetryable(code);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}
