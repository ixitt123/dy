import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./test-browser-smoke.mjs", import.meta.url), "utf8");

assert.doesNotMatch(source, /c61dfbe|d994b15/u, "browser test must not be pinned to one historical build");
assert.match(source, /data-tts-load-file=\\?"audio\\?"/u, "browser test must load an audio record through the real history control");
assert.match(source, /currentTime/u, "browser test must prove audio playback time advances");
assert.match(source, /ttsHistory/u, "browser test must wait for asynchronous TTS history recovery after reload");
assert.match(source, /第二条|第二个|second/u, "browser test must switch to a second real task when records are available");

console.log("Browser behavior scope: OK");
