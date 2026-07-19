import assert from "node:assert/strict";
import fs from "node:fs";

const server = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("./ui/modules/legacy-runtime.js", import.meta.url), "utf8");
const workbench = fs.readFileSync(new URL("./ui/workbench.js", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("./server/tts/tts-service.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./ui/index.html", import.meta.url), "utf8");
const cs1 = fs.readFileSync(new URL("./ui/modules/cs1-video.js", import.meta.url), "utf8");
const xiaohei = fs.readFileSync(new URL("./ui/modules/ian-xiaohei-app.js", import.meta.url), "utf8");
const xiaoheiParent = fs.readFileSync(new URL("./ui/modules/xiaohei-production.js", import.meta.url), "utf8");
const moneyPrinter = fs.readFileSync(new URL("./ui/modules/money-printer.js", import.meta.url), "utf8");
const kinetic = fs.readFileSync(new URL("./ui/modules/kinetic-text.js", import.meta.url), "utf8");

assert.match(server, /function validateStrictSubtitleCorrection/u);
assert.match(server, /original\.length !== corrected\.length/u);
assert.match(server, /isMusic26FreeJob\(job\)/u);
assert.match(server, /correctMusicSubtitleBeforeHandoff/u);
assert.match(server, /buildFixedAsrRows\(\{ fixedRows, recognizedWords \}\)/u);
assert.match(server, /source-text-dp-aligner/u);
assert.match(server, /lowConfidenceRows/u);
assert.match(server, /mergeSourceConstrainedRows/u);
assert.match(server, /syncSourceConstrainedRows/u);
assert.match(server, /\/api\/tts\/subtitle\/correct-before-handoff/u);
assert.match(server, /corrected: false,[\s\S]*fallback: true,[\s\S]*warning,/u);
assert.match(server, /已使用最接近的配音文案片段继续发送/u);

assert.match(service, /async function alignCorrectedText/u);
assert.match(service, /async function syncSourceConstrainedRows/u);
assert.match(service, /rows\.length !== currentTimeline\.length/u);
assert.match(service, /const preservedWordTimeline = Array\.isArray\(metadata\.word_timeline\)/u);
assert.match(service, /wordTimeline: preservedWordTimeline/u);
assert.match(service, /preserveTimelineValues: true/u);
assert.match(service, /input\.preserveTimelineValues === true[\s\S]*providedTimeline\.map\(\(row\) => \(\{ \.\.\.row \}\)\)/u);
assert.match(service, /correctionScore/u);
assert.match(service, /lowConfidenceRows/u);
const musicSyncFunction = service.slice(
  service.indexOf("async function syncSourceConstrainedRows"),
  service.indexOf("async function confirmAlignment"),
);
assert.doesNotMatch(musicSyncFunction, /estimatedWordTimelineFromSentences/u);
assert.match(service, /recognized_word_timeline[\s\S]*word_timeline/u);
assert.match(service, /aligned\.matchRatio < ALIGNMENT_AUTO_APPROVE_RATIO/u);
assert.match(service, /confirmationMode: "ai_corrected_before_handoff"/u);

assert.match(runtime, /source_constrained_music_asr_repair/u);
assert.match(runtime, /const payload = confirmedTtsAudioPayload\(handoffJob\) \|\| originalPayload/u);
assert.match(runtime, /async function syncSharedTtsTimeline/u);
assert.match(runtime, /start: source\.start,[\s\S]*end: source\.end/u);
assert.match(runtime, /syncTimeline: syncSharedTtsTimeline/u);

assert.match(html, /id="cs1SubtitleTimeline"/u);
assert.match(html, /id="ttsTimelineColumn"[\s\S]*字幕时间轴/u);
assert.match(html, /id="ttsCentralTimeline"/u);
assert.match(html, /id="ttsSaveTimeline"[\s\S]*确定修改/u);
assert.match(workbench, /const timelineColumn = oldWorkbench\.querySelector\("#ttsTimelineColumn"\)/u);
assert.match(workbench, /timelineLane\.appendChild\(timelineColumn\)/u);
assert.match(workbench, /studio\.append\(inputLane, timelineLane, settingsLane, resultLane\)/u);
assert.match(cs1, /readonly aria-readonly="true"/u);
assert.match(cs1, /focusout[\s\S]*publishTimelineEdit/u);
assert.match(moneyPrinter, /money-printer-timeline-row" data-segment-index/u);
assert.match(moneyPrinter, /focusout[\s\S]*syncTimelineText/u);
assert.match(kinetic, /data-field="start"[\s\S]*readonly aria-readonly="true"/u);
assert.match(html, /id="kineticConfirmTimeline"[\s\S]*确定修改/u);
assert.match(kinetic, /function confirmTimelineChanges/u);
assert.match(kinetic, /kineticConfirmTimeline"\)\.addEventListener\("click", \(\) => confirmTimelineChanges\(\)\)/u);
assert.doesNotMatch(kinetic, /focusout[\s\S]*syncKineticSubtitleText/u);
assert.match(runtime, /function saveTtsCentralTimeline/u);
assert.match(runtime, /async function syncGeneratedTtsJobToCentralTimeline/u);
assert.match(runtime, /fetchJson\(`\/api\/tts\/job\?id=\$\{encodeURIComponent\(jobId\)\}`\)/u);
assert.match(runtime, /renderTtsCentralTimeline\(job, \{ preserveDraft \}\)/u);
assert.match(runtime, /const completedJob = await syncGeneratedTtsJobToCentralTimeline\(job\)/u);
assert.match(runtime, /const completedMusicJob = await syncGeneratedTtsJobToCentralTimeline\(musicJob\)/u);
assert.match(runtime, /\/api\/tts\/alignment\/sync/u);
assert.match(runtime, /preserveTimelineValues:\s*true/u);
assert.match(runtime, /source:\s*"tts_page_timeline_editor"/u);
assert.match(runtime, /wordTimeline:\s*ttsEstimatedWordTimeline\(rows\)/u);
assert.match(runtime, /manuallyConfirmedInTtsPage[\s\S]*已使用 TTS 页面确认过的文案、音频和带时间戳字幕发送/u);
assert.match(runtime, /function renderTtsRail\(job = activeTtsRailJob\) \{[\s\S]*if \(!job\) return;[\s\S]*activeTtsRailJob = job;[\s\S]*renderTtsCentralTimeline/u);
assert.match(xiaohei, /data-field="start"[\s\S]*readonly aria-readonly="true"/u);
assert.match(xiaohei, /focusout[\s\S]*persistSharedSubtitleText/u);
assert.match(xiaoheiParent, /video-factory:xiaohei-shared-timeline-updated/u);
assert.match(xiaoheiParent, /const latestText = String\(event\.data\.payload\.final_text \|\| event\.data\.payload\.text/u);
assert.match(service, /subtitle_vtt_path/u);
assert.match(service, /timeline_json_path/u);
assert.match(service, /WEBVTT/u);

console.log("TTS handoff subtitle correction: OK");
