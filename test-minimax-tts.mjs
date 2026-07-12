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
  assert.equal(voices.length, 10);
  assert.equal(voices.filter((voice) => voice.gender === "female").length, 5);
  assert.equal(voices.filter((voice) => voice.gender === "male").length, 5);
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
