// test-error-codes.mjs
//
// 错误码和重试策略测试（09.05）。
// 验证 ErrorCodes / isRetryable / inferErrorCode / CodedError。
//
// 运行：node test-error-codes.mjs

import { ErrorCodes, isRetryable, inferErrorCode, CodedError, toErrorResponse } from "./server/core/error-codes.mjs";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("ErrorCodes 常量完整", () => {
  const required = ["UPSTREAM_OFFLINE", "JOB_NOT_FOUND", "MAPPING_NOT_FOUND", "JOB_FAILED", "TEMPORARY_FAILURE", "BUSINESS_FAILURE", "UNKNOWN"];
  for (const code of required) {
    if (!ErrorCodes[code]) throw new Error(`缺少错误码 ${code}`);
  }
});

test("isRetryable: UPSTREAM_OFFLINE 可重试", () => {
  if (!isRetryable(ErrorCodes.UPSTREAM_OFFLINE)) throw new Error("UPSTREAM_OFFLINE 应可重试");
});

test("isRetryable: TEMPORARY_FAILURE 可重试", () => {
  if (!isRetryable(ErrorCodes.TEMPORARY_FAILURE)) throw new Error("TEMPORARY_FAILURE 应可重试");
});

test("isRetryable: JOB_NOT_FOUND 不可重试", () => {
  if (isRetryable(ErrorCodes.JOB_NOT_FOUND)) throw new Error("JOB_NOT_FOUND 不应可重试");
});

test("isRetryable: BUSINESS_FAILURE 不可重试", () => {
  if (isRetryable(ErrorCodes.BUSINESS_FAILURE)) throw new Error("BUSINESS_FAILURE 不应可重试");
});

test("inferErrorCode: ECONNREFUSED → UPSTREAM_OFFLINE", () => {
  const e = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  if (inferErrorCode(e) !== ErrorCodes.UPSTREAM_OFFLINE) throw new Error(`期望 UPSTREAM_OFFLINE，得到 ${inferErrorCode(e)}`);
});

test("inferErrorCode: ENOENT → JOB_NOT_FOUND", () => {
  const e = Object.assign(new Error("no such file"), { code: "ENOENT" });
  if (inferErrorCode(e) !== ErrorCodes.JOB_NOT_FOUND) throw new Error(`期望 JOB_NOT_FOUND，得到 ${inferErrorCode(e)}`);
});

test("inferErrorCode: timeout → TEMPORARY_FAILURE", () => {
  const e = new Error("request timeout");
  if (inferErrorCode(e) !== ErrorCodes.TEMPORARY_FAILURE) throw new Error(`期望 TEMPORARY_FAILURE，得到 ${inferErrorCode(e)}`);
});

test("inferErrorCode: 映射丢失 → MAPPING_NOT_FOUND", () => {
  const e = new Error("任务映射不存在");
  if (inferErrorCode(e) !== ErrorCodes.MAPPING_NOT_FOUND) throw new Error(`期望 MAPPING_NOT_FOUND，得到 ${inferErrorCode(e)}`);
});

test("inferErrorCode: 无效输入 → BUSINESS_FAILURE", () => {
  const e = new Error("参数无效");
  if (inferErrorCode(e) !== ErrorCodes.BUSINESS_FAILURE) throw new Error(`期望 BUSINESS_FAILURE，得到 ${inferErrorCode(e)}`);
});

test("CodedError 创建 + retryable 自动判断", () => {
  const err = new CodedError("服务离线", ErrorCodes.UPSTREAM_OFFLINE);
  if (err.code !== ErrorCodes.UPSTREAM_OFFLINE) throw new Error("code 不匹配");
  if (!err.retryable) throw new Error("UPSTREAM_OFFLINE 应 retryable=true");
  if (err.name !== "CodedError") throw new Error("name 不匹配");
});

test("CodedError toJSON", () => {
  const err = new CodedError("任务失败", ErrorCodes.JOB_FAILED);
  const json = err.toJSON();
  if (json.code !== ErrorCodes.JOB_FAILED || json.retryable !== false) throw new Error("toJSON 不正确");
});

test("离线错误返回 503 且允许重试", () => {
  const result = toErrorResponse(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
  if (result.status !== 503 || result.body.category !== "offline" || result.body.retryable !== true) throw new Error("离线策略错误");
});

test("永久不存在返回 404 且禁止重试", () => {
  const result = toErrorResponse(new Error("missing"), { code: ErrorCodes.JOB_NOT_FOUND });
  if (result.status !== 404 || result.body.category !== "permanent" || result.body.retryable !== false) throw new Error("不存在策略错误");
});

test("临时失败返回 503 和 retryAfterMs", () => {
  const result = toErrorResponse(new Error("busy"));
  if (result.body.code !== ErrorCodes.TEMPORARY_FAILURE || result.body.category !== "temporary" || result.body.retryAfterMs <= 0) throw new Error("临时失败策略错误");
});

test("业务失败返回 400 且禁止重试", () => {
  const result = toErrorResponse(new Error("参数无效"));
  if (result.status !== 400 || result.body.category !== "business" || result.body.retryable !== false) throw new Error("业务失败策略错误");
});

// Run all
let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`✅ ${t.name}`);
  } catch (e) {
    failed++;
    console.error(`❌ ${t.name}: ${e.message}`);
  }
}
console.log(`\n📊 错误码测试: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
