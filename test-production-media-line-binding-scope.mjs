import assert from "node:assert/strict";
import fs from "node:fs";

const requiredLines = [
  ["test-cs1-bgm-mix.mjs", "cs1"],
  ["test-money-printer-final-render.mjs", "money-printer"],
  ["test-xiaohei-video-render.mjs", "xiaohei"],
  ["test-kinetic-text-render-smoke.mjs", "kinetic-text"],
];

for (const [file, line] of requiredLines) {
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /verifyProductionMedia/, `${file} must bind its fresh renderer output to the production media verifier`);
  assert.match(source, new RegExp(`line:\\s*["']${line}["']`), `${file} must identify the production line it is verifying`);
}

console.log("Production media line binding scope: OK");
