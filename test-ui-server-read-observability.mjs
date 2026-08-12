import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const start = source.indexOf("function readTextFileSafe");
const end = source.indexOf("function readSkill", start);
assert.ok(start >= 0 && end > start, "readTextFileSafe implementation must be available");

const warnings = [];
const context = vm.createContext({
  fs: { existsSync: () => true, readFileSync: () => { const error = new Error("access denied"); error.code = "EACCES"; throw error; } },
  console: { warn: (...args) => warnings.push(args) },
});
vm.runInContext(`${source.slice(start, end)}; globalThis.readTextFileSafe = readTextFileSafe;`, context);

assert.equal(context.readTextFileSafe("C:/safe/skill.md", "fallback"), "fallback");
assert.equal(warnings.length, 1, "a failed server-side text read must emit one diagnosable warning");
assert.match(String(warnings[0][0]), /readTextFileSafe/);
assert.equal(warnings[0][1]?.code, "EACCES");
console.log("UI server text-read observability: OK");

const referenceStart = source.indexOf("function normalizeReferenceExamples");
const referenceEnd = source.indexOf("function writeReferenceExamples", referenceStart);
assert.ok(referenceStart >= 0 && referenceEnd > referenceStart, "reference example reader must be available");
const referenceWarnings = [];
const referenceContext = vm.createContext({
  fs: { existsSync: () => true, readFileSync: () => "{broken-json" },
  referenceExamplesPath: "C:/safe/reference_examples.json",
  console: { warn: (...args) => referenceWarnings.push(args) },
});
vm.runInContext(`${source.slice(referenceStart, referenceEnd)}; globalThis.readReferenceExamples = readReferenceExamples;`, referenceContext);
assert.deepEqual([...referenceContext.readReferenceExamples()], []);
assert.equal(referenceWarnings.length, 1, "invalid reference JSON must emit one diagnosable warning");
assert.match(String(referenceWarnings[0][0]), /readReferenceExamples/);
console.log("Reference example read observability: OK");
