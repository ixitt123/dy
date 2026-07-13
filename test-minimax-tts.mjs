import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MinimaxProvider } from "./server/tts/providers/minimax.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dy-minimax-"));
const originalFetch = globalThis.fetch;
const requests = [];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

try {
  const provider = new MinimaxProvider({
    config: {
      api_key: "test-key",
      base_url: "https://api.minimax.io/v1",
      model: "speech-2.6-hd",
    },
  });

  const voices = provider.listPresetVoices();
  assert.ok(voices.length >= 20);
  assert.ok(voices.some((voice) => voice.gender === "female"));
  assert.ok(voices.some((voice) => voice.gender === "male"));
  assert.ok(voices.some((voice) => voice.gender === "neutral"));
  assert.ok(voices.some((voice) => voice.id === "Chinese (Mandarin)_News_Anchor"));
  assert.ok(voices.every((voice) => voice.supportsEmotion && voice.supportsSpeed));

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/files/upload")) {
      return jsonResponse({ file: { file_id: 123 }, base_resp: { status_code: 0, status_msg: "success" } });
    }
    if (String(url).endsWith("/voice_clone")) {
      return jsonResponse({ demo_audio: "https://example.test/demo.mp3", base_resp: { status_code: 0, status_msg: "success" } });
    }
    if (String(url).endsWith("/delete_voice")) {
      return jsonResponse({ voice_id: "voice-test", base_resp: { status_code: 0, status_msg: "success" } });
    }
    return jsonResponse({
      data: { audio: Buffer.from("mock-mp3").toString("hex"), status: 2 },
      extra_info: { audio_length: 2100 },
      trace_id: "trace-test",
      base_resp: { status_code: 0, status_msg: "success" },
    });
  };

  const outputPath = path.join(tempDir, "speech.mp3");
  const speech = await provider.generateSpeech({
    text: "这是一条测试文案。",
    voiceId: voices[0].id,
    emotion: "专业",
    speed: 1.2,
    outputPath,
  });
  assert.equal(speech.success, true);
  assert.equal(fs.readFileSync(outputPath, "utf8"), "mock-mp3");
  const speechBody = JSON.parse(requests.at(-1).options.body);
  assert.equal(speechBody.model, "speech-2.6-hd");
  assert.equal(speechBody.voice_setting.speed, 1.2);
  assert.equal(speechBody.voice_setting.emotion, "neutral");

  const expressivePath = path.join(tempDir, "expressive.mp3");
  const expressive = await provider.generateSpeech({
    text: "这是一条情绪测试文案。",
    voiceId: voices[0].id,
    emotion: "痞里带刺",
    stylePrompt: "犀利吐槽，重点词稍微加重。",
    speed: 0.9,
    volume: 80,
    pitch: 1.5,
    format: "wav",
    outputPath: expressivePath,
  });
  assert.equal(expressive.success, true);
  const expressiveBody = JSON.parse(requests.at(-1).options.body);
  assert.equal(expressiveBody.voice_setting.speed, 0.9);
  assert.equal(expressiveBody.voice_setting.vol, 1.6);
  assert.equal(expressiveBody.voice_setting.pitch, 3);
  assert.equal(expressiveBody.voice_setting.emotion, "angry");
  assert.equal(expressiveBody.audio_setting.format, "wav");

  const samplePath = path.join(tempDir, "sample.mp3");
  fs.writeFileSync(samplePath, "sample");
  const cloned = await provider.cloneVoice({
    name: "my-voice",
    audioPath: samplePath,
    consentConfirmed: true,
  });
  assert.equal(cloned.success, true);
  assert.ok(cloned.voice_id.startsWith("my-voice-"));
  assert.equal(cloned.metadata.demo_audio, "https://example.test/demo.mp3");

  const deleted = await provider.deleteVoice({ voiceId: cloned.voice_id });
  assert.equal(deleted.success, true);
  assert.ok(requests.some((request) => request.url.endsWith("/delete_voice")));

  console.log("MiniMax TTS tests passed.");
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
