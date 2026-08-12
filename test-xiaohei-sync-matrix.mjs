import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { renderXiaoheiVideo } from "./server/xiaohei-video-renderer.js";

const evidenceDir = path.resolve(process.env.XIAOHEI_SYNC_EVIDENCE_DIR || path.join(".data", "repair-evidence", "07.06", "manual"));
const mediaDir = path.join(evidenceDir, "media");
fs.mkdirSync(mediaDir, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xiaohei-sync-matrix-"));
const report = [];
try {
  const narrationPath = path.join(tempDir, "narration.wav");
  const bgmPath = path.join(tempDir, "bgm.wav");
  for (const [file, filter] of [[narrationPath, "sine=frequency=440:sample_rate=48000:duration=3"], [bgmPath, "sine=frequency=110:sample_rate=48000:duration=6.5"]]) {
    const created = spawnSync(ffmpegPath, ["-y", "-f", "lavfi", "-i", filter, file], { encoding: "utf8", windowsHide: true });
    assert.equal(created.status, 0, created.stderr || created.stdout);
  }
  const scenes = [{
    scene_index: 1,
    start_time: 0,
    end_time: 3,
    duration: 3,
    visual_duration: 3,
    subtitle: "字幕、画面、旁白和背景音乐同步结束",
    text: "字幕、画面、旁白和背景音乐同步结束",
    keywords: ["同步结束"],
    image_path: path.resolve("integrations", "moneyprinterturbo", "test", "resources", "1.png"),
  }];
  for (const speed of [1, 1.1, 1.2, 1.3]) {
    const outputPath = path.join(tempDir, `speed-${speed.toFixed(1)}x.mp4`);
    const rendered = await renderXiaoheiVideo({
      ffmpegPath,
      scenes,
      audioPath: narrationPath,
      backgroundAudioPath: bgmPath,
      outputPath,
      aspectRatio: "16:9",
      transitionMode: "none",
      fps: 30,
      compose: { playbackSpeed: speed, ttsVolume: 100, bgmVolume: 18, showSubtitles: true, subtitleSize: 48 },
    });
    assert.equal(rendered.playbackSpeed, speed);
    const probe = spawnSync(ffprobeStatic.path, [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type,duration", "-of", "json", outputPath,
    ], { encoding: "utf8", windowsHide: true });
    assert.equal(probe.status, 0, probe.stderr || probe.stdout);
    const media = JSON.parse(probe.stdout);
    const videoDuration = Number(media.streams.find((stream) => stream.codec_type === "video")?.duration || 0);
    const audioDuration = Number(media.streams.find((stream) => stream.codec_type === "audio")?.duration || 0);
    const formatDuration = Number(media.format?.duration || 0);
    const expectedDuration = 3 / speed;
    const endDelta = Math.abs(videoDuration - audioDuration);
    assert.ok(Math.abs(formatDuration - expectedDuration) <= 0.08, `${speed}x total duration mismatch: ${formatDuration}s vs ${expectedDuration}s`);
    assert.ok(endDelta <= 0.045, `${speed}x audio/video end delta ${endDelta}s exceeds 45ms`);
    const retainedPath = path.join(mediaDir, path.basename(outputPath));
    fs.copyFileSync(outputPath, retainedPath);
    const assPath = path.join(tempDir, "video-subtitles.ass");
    const ass = fs.readFileSync(assPath, "utf8");
    assert.match(ass, /Dialogue: 2,0:00:00\.00,0:00:03\.00/u, `${speed}x subtitle source timeline was lost`);
    fs.copyFileSync(assPath, path.join(mediaDir, `speed-${speed.toFixed(1)}x.ass`));
    report.push({
      speed,
      expectedDuration,
      formatDuration,
      videoDuration,
      audioDuration,
      endDelta,
      sha256: createHash("sha256").update(fs.readFileSync(retainedPath)).digest("hex"),
      bytes: fs.statSync(retainedPath).size,
      subtitleSourceEnd: 3,
      bgmSourceTailSeconds: 3.5,
      bgmVolumePercent: 18,
    });
  }
  fs.writeFileSync(path.join(evidenceDir, "xiaohei-sync-matrix.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2)}\n`, "utf8");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(`Xiaohei sync matrix: OK (${report.length} actual MP4 files)`);
