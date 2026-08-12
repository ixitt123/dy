import assert from "node:assert/strict";

const base = "http://127.0.0.1:8787";
const root = await fetch(`${base}/`);
const cookie = String(root.headers.get("set-cookie") || "").split(";")[0];
assert.ok(root.ok && cookie, "无法建立本地 API 会话");

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", cookie);
  headers.set("origin", base);
  if (options.body) headers.set("content-type", "application/json");
  const response = await fetch(`${base}${path}`, { ...options, headers });
  return { status: response.status, body: await response.json() };
}

const missingHandoff = await request("/api/tts/handoff?id=missing-error-contract");
assert.equal(missingHandoff.status, 404);
assert.deepEqual(
  { code: missingHandoff.body.code, category: missingHandoff.body.category, retryable: missingHandoff.body.retryable },
  { code: "JOB_NOT_FOUND", category: "permanent", retryable: false },
);

const missingAsset = await request("/api/final-assets/file?id=asset_missing_error_contract");
assert.equal(missingAsset.status, 404);
assert.equal(missingAsset.body.code, "JOB_NOT_FOUND");
assert.equal(missingAsset.body.retryable, false);

const invalidHandoff = await request("/api/tts/handoff", {
  method: "POST",
  body: JSON.stringify({ payload: {}, targets: [] }),
});
assert.equal(invalidHandoff.status, 400);
assert.deepEqual(
  { code: invalidHandoff.body.code, category: invalidHandoff.body.category, retryable: invalidHandoff.body.retryable },
  { code: "BUSINESS_FAILURE", category: "business", retryable: false },
);

console.log("Error code HTTP integration: OK (permanent + business responses)");
