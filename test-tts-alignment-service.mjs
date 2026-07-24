import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { createTtsService } from "./server/tts/tts-service.js";
import { tokenizeAlignmentText } from "./server/tts/alignment.js";

const PROMPT_FILES = ["tts_script_prepare.md", "tts_emotion_prompt.md", "seo_title_generation.md"];

function jsonClone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

class MemoryTaskStore {
  constructor() {
    this.jobs = new Map();
    this.nextId = 1;
  }

  createTtsJob(input = {}) {
    const now = new Date().toISOString();
    const job = {
      id: this.nextId,
      task_id: input.task_id || "",
      rewrite_id: input.rewrite_id || "",
      provider: input.provider || "minimax",
      voice_id: input.voice_id || "",
      voice_name: input.voice_name || "",
      text: input.text || "",
      emotion: input.emotion || "",
      style_prompt: input.style_prompt || "",
      speed: Number(input.speed || 1),
      volume: Number(input.volume ?? 50),
      pitch: Number(input.pitch || 1),
      format: input.format || "mp3",
      audio_path: input.audio_path || "",
      status: input.status || "waiting",
      error: input.error || "",
      metadata_json: input.metadata_json || "{}",
      created_at: now,
      updated_at: now,
      completed_at: input.completed_at || "",
    };
    this.nextId += 1;
    this.jobs.set(job.id, job);
    return jsonClone(job);
  }

  getTtsJob(id) {
    return jsonClone(this.jobs.get(Number(id)));
  }

  updateTtsJob(id, changes = {}) {
    const current = this.jobs.get(Number(id));
    if (!current) return null;
    const updated = {
      ...current,
      ...changes,
      updated_at: new Date().toISOString(),
    };
    this.jobs.set(updated.id, updated);
    return jsonClone(updated);
  }

  listTtsJobs({ limit = 500 } = {}) {
    return Array.from(this.jobs.values())
      .slice(-Number(limit || 500))
      .map(jsonClone);
  }

  recordVoiceUse() {}

  upsertVoice() {}
}

function createTempProject() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "dy-tts-align-"));
  fs.mkdirSync(path.join(baseDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(baseDir, "voices"), { recursive: true });
  for (const file of PROMPT_FILES) {
    fs.writeFileSync(path.join(baseDir, "prompts", file), "test prompt\n", "utf8");
  }
  return baseDir;
}

function createAudioFile(baseDir, name) {
  const audioPath = path.join(baseDir, "voices", name);
  const result = spawnSync(ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=24000:duration=1.6",
    "-q:a",
    "9",
    "-acodec",
    "libmp3lame",
    audioPath,
  ], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(audioPath), true);
  return audioPath;
}

function timedWords(text, duration = 1.6) {
  const tokens = tokenizeAlignmentText(text).filter((token) => /\S/.test(token));
  return tokens.map((token, index) => ({
    text: token,
    start: duration * (index / tokens.length),
    end: duration * ((index + 1) / tokens.length),
    confidence: 0.96,
    source: "test_asr",
  }));
}

function createService({ baseDir, taskStore, transcript, onCompleted = () => {} }) {
  let calls = 0;
  const service = createTtsService({
    baseDir,
    taskStore,
    getSettings: () => ({}),
    ffmpegPath,
    ffprobePath: ffprobeStatic?.path || ffprobeStatic,
    transcribeFinalAudio: async () => {
      calls += 1;
      return {
        text: transcript,
        words: timedWords(transcript),
        sentences: [{ text: transcript, start: 0, end: 1.6, confidence: 0.96 }],
      };
    },
    onJobCompleted: onCompleted,
  });
  return { service, calls: () => calls };
}

const originalScript = "还在被夜宵馋吗？散几句大白话，AI直接给你成片。";
const audioLyrics = "你问我 AI 怎么拍成片 我用一段旋律唱给你听";

{
  const baseDir = createTempProject();
  const audioPath = createAudioFile(baseDir, "strict-text-correction.mp3");
  const taskStore = new MemoryTaskStore();
  const spokenText = "学习不是靠熬时间，而是靠方法。";
  const { service, calls } = createService({
    baseDir,
    taskStore,
    transcript: spokenText,
  });
  const imported = await service.importGenerated({
    audio_path: audioPath,
    text: "学习不是靠熬时间，而是靠方发。",
    provider: "minimax",
    voice_name: "普通旁白",
    emotion: "natural",
    source: "tts_generated",
  });
  assert.equal(imported.error, undefined);
  assert.equal(imported.job.alignment_status, "confirmed");
  const corrected = await service.alignCorrectedText(imported.job.id, spokenText, {
    provider: "deepseek",
    model: "deepseek-chat",
    changedCharacters: 1,
  });
  assert.equal(corrected.error, undefined);
  assert.equal(corrected.job.final_text, spokenText);
  assert.equal(corrected.job.subtitle_source, "ai_corrected_before_handoff");
  assert.equal(corrected.job.alignment_confirmation_mode, "ai_corrected_before_handoff");
  assert.equal(corrected.job.subtitle_correction_changed_characters, 1);
  assert.equal(corrected.job.subtitle_correction_provider, "deepseek");
  assert.ok(corrected.job.subtitle_timeline.length > 0);
  assert.ok(corrected.job.subtitle_timeline.at(-1).end <= corrected.job.audio_duration + 0.05);
  assert.equal(fs.existsSync(corrected.job.subtitle_path), true);
  assert.equal(fs.existsSync(corrected.job.subtitle_vtt_path), true);
  assert.equal(fs.existsSync(corrected.job.timestamped_text_path), true);
  assert.equal(fs.existsSync(corrected.job.timeline_json_path), true);
  assert.equal(JSON.parse(fs.readFileSync(corrected.job.timeline_json_path, "utf8"))[0].text, spokenText);
  assert.match(fs.readFileSync(corrected.job.subtitle_vtt_path, "utf8"), /^WEBVTT\n\n/u);
  assert.equal(calls(), 1, "send-time correction must reuse the existing word timeline");

  const manualRows = [
    { id: "manual-1", index: 1, start: 0, end: 0.8, text: "第一句已经核对。" },
    { id: "manual-2", index: 2, start: 0.8, end: 1.6, text: "第二句也没问题。" },
  ];
  const manualFinalText = manualRows.map((row) => row.text).join("");
  const synced = await service.syncConfirmedTimeline(corrected.job.id, {
    title: "TTS 页面字幕核对",
    text: manualFinalText,
    sentenceTimeline: manualRows,
    subtitleTimeline: manualRows,
    wordTimeline: timedWords(manualFinalText),
    source: "tts_page_timeline_editor",
    confirmationMode: "tts_page_timeline_editor",
    preserveTimelineValues: true,
  });
  assert.equal(synced.error, undefined);
  assert.equal(synced.job.final_text, manualFinalText);
  assert.equal(synced.job.shared_sync_source, "tts_page_timeline_editor");
  assert.equal(synced.job.alignment_confirmation_mode, "tts_page_timeline_editor");
  assert.deepEqual(synced.job.subtitle_timeline.map((row) => [row.start, row.end]), manualRows.map((row) => [row.start, row.end]));
  assert.equal(JSON.parse(fs.readFileSync(synced.job.timeline_json_path, "utf8"))[1].text, "第二句也没问题。");
}

{
  const baseDir = createTempProject();
  const audioPath = createAudioFile(baseDir, "low-match.mp3");
  const completed = [];
  const taskStore = new MemoryTaskStore();
  const { service, calls } = createService({
    baseDir,
    taskStore,
    transcript: audioLyrics,
    onCompleted: (job) => completed.push(job),
  });
  const result = await service.importGenerated({
    audio_path: audioPath,
    text: originalScript,
    provider: "minimax",
    voice_name: "普通旁白",
    emotion: "natural",
    source: "tts_generated",
  });
  assert.equal(result.error, undefined);
  assert.equal(calls(), 3, "low original/audio match should retry three ASR passes");
  assert.equal(result.job.alignment_status, "confirmed");
  assert.equal(result.job.final_text, audioLyrics);
  assert.equal(result.job.alignment_confirmation_mode, "automatic_audio_transcript_fallback");
  assert.ok(result.job.recognition_match_ratio < 0.8);
  assert.equal(result.job.match_ratio, 1);
  assert.ok(result.job.subtitle_timeline.length > 0);
  assert.equal(fs.existsSync(result.job.timestamped_text_path), true);
  assert.equal(completed.length, 1);
}

{
  const baseDir = createTempProject();
  const audioPath = createAudioFile(baseDir, "singing.mp3");
  const taskStore = new MemoryTaskStore();
  const { service, calls } = createService({
    baseDir,
    taskStore,
    transcript: audioLyrics,
  });
  const result = await service.importGenerated({
    audio_path: audioPath,
    text: originalScript,
    provider: "minimax",
    voice_name: "国风记忆小调",
    emotion: "music",
    source: "minimax_music",
  });
  assert.equal(result.error, undefined);
  assert.equal(calls(), 1, "singing jobs should use recognized lyrics immediately");
  assert.equal(result.job.alignment_status, "confirmed");
  assert.equal(result.job.final_text, audioLyrics);
  assert.equal(result.job.alignment_confirmation_mode, "automatic_singing_audio_lyrics");
  assert.equal(result.job.match_ratio, 1);
  assert.ok(result.job.subtitle_timeline.at(-1).end <= result.job.audio_duration + 0.05);
}

{
  const baseDir = createTempProject();
  const audioPath = createAudioFile(baseDir, "singing-empty-asr.mp3");
  const taskStore = new MemoryTaskStore();
  const { service, calls } = createService({
    baseDir,
    taskStore,
    transcript: "",
  });
  const result = await service.importGenerated({
    audio_path: audioPath,
    text: originalScript,
    provider: "minimax",
    voice_name: "国风记忆小调",
    emotion: "music",
    source: "minimax_music",
  });
  assert.ok(result.error, JSON.stringify({
    alignment_status: result.job?.alignment_status,
    confirmation_mode: result.job?.alignment_confirmation_mode,
    final_text: result.job?.final_text,
    source: result.job?.metadata?.source,
    lyrics: result.job?.metadata?.lyrics,
    generated_lyrics: result.job?.metadata?.generated_lyrics,
    subtitle_text: result.job?.metadata?.subtitle_text,
  }));
  assert.match(result.error, /唱歌音频没有识别到实际歌词/);
  assert.equal(calls(), 3);
  assert.equal(result.job.alignment_status, "failed");
  assert.equal(result.job.alignment_failure_action, "rewrite_script_required");
}

console.log("TTS alignment service tests passed");
