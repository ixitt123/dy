import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import {
  buildXiaoheiVideoFilter,
  normalizeXiaoheiTransitionMode,
  renderXiaoheiVideo,
  xiaoheiVideoResolution,
} from "./server/xiaohei-video-renderer.js";
import { xiaoheiVideoDownloadName } from "./server/routes/ian-xiaohei-routes.js";

const scenes = [
  { scene_index: 1, start_time: 0, end_time: 0.8, duration: 0.8, subtitle: "第一段测试字幕" },
  { scene_index: 2, start_time: 0.8, end_time: 1.6, duration: 0.8, subtitle: "第二段测试字幕" },
];

assert.deepEqual(xiaoheiVideoResolution("16:9"), { width: 1920, height: 1080 });
assert.deepEqual(xiaoheiVideoResolution("9:16"), { width: 1080, height: 1920 });
assert.equal(normalizeXiaoheiTransitionMode("unknown"), "smart");
assert.equal(xiaoheiVideoDownloadName("学习：告诉你，这不是你笨"), "学习：告诉你，这不是你笨.mp4");
assert.equal(xiaoheiVideoDownloadName('学习:方法/第一课?'), "学习-方法-第一课-.mp4");
assert.equal(xiaoheiVideoDownloadName("小黑视频.mp4"), "小黑视频.mp4");

const smart = buildXiaoheiVideoFilter({
  scenes,
  width: 1920,
  height: 1080,
  transitionMode: "smart",
  assPath: "C:\\temp\\subtitles.ass",
});
assert.ok(smart.filter.includes("xfade=transition=fade"));
assert.ok(smart.filter.includes("offset=0.800"));
assert.ok(smart.filter.includes("ass='C\\:/temp/subtitles.ass'"));

const direct = buildXiaoheiVideoFilter({
  scenes,
  width: 1920,
  height: 1080,
  transitionMode: "none",
  assPath: "C:\\temp\\subtitles.ass",
});
assert.ok(direct.filter.includes("concat=n=2:v=1:a=0"));

const contain = buildXiaoheiVideoFilter({
  scenes,
  width: 1920,
  height: 1080,
  transitionMode: "fade",
  imageFit: "contain",
  assPath: "C:\\temp\\subtitles.ass",
});
assert.ok(contain.filter.includes("force_original_aspect_ratio=decrease,pad=1920:1080"));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xiaohei-video-render-"));
try {
  const sourceRoot = path.resolve("integrations/moneyprinterturbo/test/resources");
  const renderScenes = scenes.map((scene, index) => ({
    ...scene,
    image_path: path.join(sourceRoot, `${index + 1}.png`),
    text: scene.subtitle,
    keywords: [String(scene.subtitle).slice(0, 2)],
  }));
  const outputPath = path.join(tempDir, "final.mp4");
  await renderXiaoheiVideo({
    ffmpegPath,
    scenes: renderScenes,
    audioPath: path.resolve("integrations/moneyprinterturbo/resource/songs/output000.mp3"),
    backgroundAudioPath: path.resolve("integrations/moneyprinterturbo/resource/songs/output000.mp3"),
    outputPath,
    aspectRatio: "16:9",
    transitionMode: "fade",
    fps: 30,
    compose: {
      imageFit: "contain",
      ttsVolume: 100,
      bgmVolume: 8,
      showSubtitles: true,
      subtitleSize: 48,
      keywordColor: "#b7ff5a",
      intro: { enabled: true, text: "Intro" },
      outro: { enabled: true, text: "Follow" },
    },
  });
  assert.ok(fs.existsSync(outputPath));
  assert.ok(fs.statSync(outputPath).size > 10_000);
  assert.ok(fs.readFileSync(path.join(tempDir, "video-subtitles.ass"), "utf8").includes("\\t("));
  console.log(`Xiaohei MP4 render verified: ${fs.statSync(outputPath).size} bytes.`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
