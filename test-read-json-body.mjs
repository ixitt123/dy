import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { HttpBodyError, readBody, readJsonBody } from "./server/utils/http-body.js";

const request = (chunks) => Readable.from(chunks);

assert.deepEqual(await readJsonBody(request([Buffer.from('{"ok":true}')])) , { ok: true });
assert.deepEqual(await readJsonBody(request([]), { fallback: { empty: true } }), { empty: true });
assert.equal(await readBody(request(["legacy"]), 32), "legacy");
assert.equal(await readBody(request(["options"]), { maxBytes: 32 }), "options");

await assert.rejects(
  () => readJsonBody(request(["{bad json"])),
  (error) => error instanceof HttpBodyError && error.statusCode === 400 && error.message === "请求格式错误，请检查 JSON",
);

await assert.rejects(
  () => readJsonBody(request(["123456789"]), { maxBytes: 4 }),
  (error) => error instanceof HttpBodyError && error.statusCode === 413 && error.message === "请求内容过大",
);

console.log("HTTP body parsing tests passed.");
