import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, testSource] = await Promise.all([
  readFile(new URL("./scripts/verify-production-media.mjs", import.meta.url), "utf8"),
  readFile(new URL("./test-production-media-verification.mjs", import.meta.url), "utf8"),
]);

assert.match(source, /--line/u, "production media CLI must identify the production line");
assert.match(source, /--artifact/u, "production media CLI must receive the actual output path");
assert.match(source, /--narration/u, "production media CLI must accept the narration path for duration comparison");
assert.match(source, /--bgm/u, "production media CLI must accept the BGM path for duration/frequency checks");
assert.doesNotMatch(source, /audio-reference/u, "production media CLI must not silently substitute a historical sample");
assert.match(testSource, /PRODUCTION_MEDIA_EVIDENCE_DIR/u, "production media test must optionally retain this-run evidence outside its temporary directory");

console.log("Production media proof scope: OK");
