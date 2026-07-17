import assert from "node:assert/strict";
import fs from "node:fs";

const server = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("./ui/modules/legacy-runtime.js", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("./server/tts/tts-service.js", import.meta.url), "utf8");

assert.match(server, /function validateStrictSubtitleCorrection/u);
assert.match(server, /original\.length !== corrected\.length/u);
assert.match(server, /严格禁止增加、删除、调换字词/u);
assert.match(server, /\/api\/tts\/subtitle\/correct-before-handoff/u);
assert.match(server, /const warning = `字幕文字校正失败：[\s\S]*已保留原字幕继续发送/u);
assert.match(server, /corrected: false,[\s\S]*fallback: true,[\s\S]*warning,/u);
assert.match(service, /async function alignCorrectedText/u);
assert.match(service, /recognized_word_timeline[\s\S]*word_timeline/u);
assert.match(service, /aligned\.matchRatio < ALIGNMENT_AUTO_APPROVE_RATIO/u);
assert.match(service, /confirmationMode: "ai_corrected_before_handoff"/u);
assert.match(runtime, /正在用当前大模型校正错字和标点/u);
assert.match(runtime, /已采用原字幕继续发送/u);
assert.match(runtime, /const payload = confirmedTtsAudioPayload\(handoffJob\) \|\| originalPayload/u);

console.log("TTS handoff subtitle correction: OK");
