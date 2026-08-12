import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPathInsideRoot, resolveStaticRequestPath } from "./server/core/static-path-safety.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui");

assert.equal(isPathInsideRoot(root, path.join(root, "index.html")), true, "normal static file should be inside ui root");
assert.equal(isPathInsideRoot(root, path.join(root, "assets", "app.css")), true, "nested static file should be inside ui root");
assert.equal(isPathInsideRoot(root, path.join(path.dirname(root), "ui-server.mjs")), false, "same-prefix sibling must not pass as inside ui root");

const allowed = [
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/modules/cs1-video.js", path.join("modules", "cs1-video.js")],
];

for (const [requestPath, expectedSuffix] of allowed) {
  const resolved = resolveStaticRequestPath(root, requestPath);
  assert.ok(resolved, `${requestPath} should resolve`);
  assert.equal(path.relative(root, resolved), expectedSuffix);
}

const rejected = [
  "/..%5cui-server.mjs",
  "/..%2fui-server.mjs",
  "/..%5c..%5csettings.json",
  "/assets%5c..%5c..%5cui-server.mjs",
  "/%2e%2e%2fui-server.mjs",
  "/%252e%252e%252fui-server.mjs",
  "/%255cui-server.mjs",
  "/bad%00name",
  "/bad%zzname",
  "/\\ui-server.mjs",
];

for (const requestPath of rejected) {
  assert.equal(resolveStaticRequestPath(root, requestPath), null, `${requestPath} must be rejected`);
}

console.log("Static path safety: OK");
