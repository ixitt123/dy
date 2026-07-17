import assert from "node:assert/strict";
import fs from "node:fs";

const server = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("./ui/modules/legacy-runtime.js", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("./server/tts/tts-service.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./ui/index.html", import.meta.url), "utf8");
const cs1 = fs.readFileSync(new URL("./ui/modules/cs1-video.js", import.meta.url), "utf8");
const xiaohei = fs.readFileSync(new URL("./ui/modules/ian-xiaohei-app.js", import.meta.url), "utf8");
const xiaoheiParent = fs.readFileSync(new URL("./ui/modules/xiaohei-production.js", import.meta.url), "utf8");
const moneyPrinter = fs.readFileSync(new URL("./ui/modules/money-printer.js", import.meta.url), "utf8");
const kinetic = fs.readFileSync(new URL("./ui/modules/kinetic-text.js", import.meta.url), "utf8");

assert.match(server, /function validateStrictSubtitleCorrection/u);
assert.match(server, /original\.length !== corrected\.length/u);
assert.match(server, /严格禁止增加、删除、调换字词/u);
assert.match(server, /isMusic26FreeJob\(job\)/u);
assert.match(server, /correctMusicSubtitleBeforeHandoff/u);
assert.match(server, /句子级、短语级、拼音级、音节级、语义级/u);
assert.match(server, /禁止只做机械错别字替换/u);
assert.match(server, /mergeSourceConstrainedRows/u);
assert.match(server, /syncSourceConstrainedRows/u);
assert.match(server, /\/api\/tts\/subtitle\/correct-before-handoff/u);
assert.match(server, /const warning = `字幕文字校正失败：[\s\S]*已保留原字幕继续发送/u);
assert.match(server, /corrected: false,[\s\S]*fallback: true,[\s\S]*warning,/u);
assert.match(service, /async function alignCorrectedText/u);
assert.match(service, /async function syncSourceConstrainedRows/u);
assert.match(service, /rows\.length !== currentTimeline\.length/u);
assert.match(service, /const preservedWordTimeline = Array\.isArray\(metadata\.word_timeline\)/u);
assert.match(service, /wordTimeline: preservedWordTimeline/u);
assert.match(service, /preserveTimelineValues: true/u);
assert.match(service, /input\.preserveTimelineValues === true[\s\S]*providedTimeline\.map\(\(row\) => \(\{ \.\.\.row \}\)\)/u);
const musicSyncFunction = service.slice(
  service.indexOf("async function syncSourceConstrainedRows"),
  service.indexOf("async function confirmAlignment"),
);
assert.doesNotMatch(musicSyncFunction, /estimatedWordTimelineFromSentences/u);
assert.match(service, /recognized_word_timeline[\s\S]*word_timeline/u);
assert.match(service, /aligned\.matchRatio < ALIGNMENT_AUTO_APPROVE_RATIO/u);
assert.match(service, /confirmationMode: "ai_corrected_before_handoff"/u);
assert.match(runtime, /正在用当前大模型校正错字和标点/u);
assert.match(runtime, /实际歌唱识别稿做句子、短语和拼音对齐修复/u);
assert.match(runtime, /source_constrained_music_asr_repair/u);
assert.match(runtime, /已采用原字幕继续发送/u);
assert.match(runtime, /const payload = confirmedTtsAudioPayload\(handoffJob\) \|\| originalPayload/u);
assert.match(runtime, /async function syncSharedTtsTimeline/u);
assert.match(runtime, /start: source\.start,[\s\S]*end: source\.end/u);
assert.match(runtime, /syncTimeline: syncSharedTtsTimeline/u);
assert.match(html, /id="cs1SubtitleTimeline"/u);
assert.match(cs1, /readonly aria-readonly="true"/u);
assert.match(cs1, /focusout[\s\S]*publishTimelineEdit/u);
assert.match(moneyPrinter, /money-printer-timeline-row" data-segment-index/u);
assert.match(moneyPrinter, /focusout[\s\S]*syncTimelineText/u);
assert.match(kinetic, /data-field="start"[\s\S]*readonly aria-readonly="true"/u);
assert.match(kinetic, /focusout[\s\S]*syncKineticSubtitleText/u);
assert.match(xiaohei, /data-field="start"[\s\S]*readonly aria-readonly="true"/u);
assert.match(xiaohei, /focusout[\s\S]*persistSharedSubtitleText/u);
assert.match(xiaoheiParent, /video-factory:xiaohei-shared-timeline-updated/u);
assert.match(xiaoheiParent, /const latestText = String\(event\.data\.payload\.final_text \|\| event\.data\.payload\.text/u);
assert.match(service, /subtitle_vtt_path/u);
assert.match(service, /timeline_json_path/u);
assert.match(service, /WEBVTT/u);

console.log("TTS handoff subtitle correction: OK");
