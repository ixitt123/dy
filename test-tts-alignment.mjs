import assert from "node:assert/strict";
import { alignTranscriptToAudio, validateAlignment } from "./server/tts/alignment.js";

function preciseWords(text, duration = 2) {
  const tokens = [...text];
  return tokens.map((token, index) => ({
    text: token,
    start: duration * (index / tokens.length),
    end: duration * ((index + 1) / tokens.length),
    source: "audio_asr",
  }));
}

const exact = alignTranscriptToAudio({
  text: "你好世界。",
  recognizedText: "你好世界。",
  recognizedWords: preciseWords("你好世界。"),
  duration: 2,
});
assert.equal(exact.finalText, "你好世界。");
assert.equal(exact.estimatedCount, 0);
assert.equal(exact.source, "audio_asr_aligned");
assert.equal(exact.sentenceTimeline.length, 1);
assert.equal(validateAlignment({ text: exact.finalText, ...exact, duration: 2 }).valid, true);

const corrected = alignTranscriptToAudio({
  text: "你好世届。",
  recognizedText: "你好世界。",
  recognizedWords: preciseWords("你好世界。"),
  duration: 2,
});
assert.equal(corrected.estimatedCount, 1);
assert.equal(corrected.wordTimeline.find((item) => item.text === "届")?.estimated, true);
assert.equal(corrected.source, "mixed_audio_estimated");
assert.equal(validateAlignment({ text: corrected.finalText, ...corrected, duration: 2 }).valid, true);

const appended = alignTranscriptToAudio({
  text: "你好世界。再见！",
  recognizedText: "你好世界。",
  recognizedWords: preciseWords("你好世界。"),
  duration: 2,
});
assert.equal(appended.sentenceTimeline.length, 2);
assert.ok(appended.estimatedCount >= 3);
assert.equal(validateAlignment({ text: appended.finalText, ...appended, duration: 2 }).valid, true);

const sentenceFallback = alignTranscriptToAudio({
  text: "第一句。第二句。",
  recognizedText: "第一句。第二句。",
  recognizedSentences: [
    { text: "第一句。", start: 0, end: 1.5 },
    { text: "第二句。", start: 1.5, end: 3 },
  ],
  duration: 3,
});
assert.equal(sentenceFallback.sentenceTimeline.length, 2);
assert.equal(sentenceFallback.source, "estimated_audio_duration");
assert.equal(validateAlignment({ text: sentenceFallback.finalText, ...sentenceFallback, duration: 3 }).valid, true);

console.log("TTS alignment tests passed");
