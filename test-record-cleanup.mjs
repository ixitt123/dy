import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openTaskStore } from "./task-store.mjs";
import { createProjectCenter } from "./server/core/project-center.js";
import { createTtsService } from "./server/tts/tts-service.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dy-cleanup-"));
const prompts = path.join(root, "prompts");
fs.mkdirSync(prompts, { recursive: true });
for (const name of ["tts_script_prepare.md", "tts_emotion_prompt.md"]) {
  fs.copyFileSync(path.join(process.cwd(), "prompts", name), path.join(prompts, name));
}

const store = openTaskStore(root);
const projects = createProjectCenter(root);

try {
  const audioDir = path.join(root, ".data", "tts", "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  const audioPath = path.join(audioDir, "cleanup.mp3");
  fs.writeFileSync(audioPath, "test");
  const ttsJob = store.createTtsJob({
    provider: "test",
    voice_id: "voice",
    text: "测试口播",
    audio_path: audioPath,
    status: "completed",
  });
  const tts = createTtsService({ baseDir: root, taskStore: store, getSettings: () => ({}), ffmpegPath: "" });
  assert.equal(tts.removeJob(ttsJob.id).deleted, 1);
  assert.equal(store.getTtsJob(ttsJob.id), null);
  assert.equal(fs.existsSync(audioPath), false);

  const director = store.createDirectorProject({ title: "测试导演稿", source_text: "测试", status: "completed" });
  store.replaceDirectorScenes(director.id, [{ scene_index: 1, duration: 3 }]);
  assert.equal(store.deleteDirectorProjects([director.id]), 1);
  assert.equal(store.getDirectorProject(director.id), null);
  assert.deepEqual(store.listDirectorScenes(director.id), []);

  const timeline = store.createTimelineProject({ status: "completed", output_type: "mp4" });
  store.replaceTimelineScenes(timeline.id, [{ scene_index: 1, duration: 3 }]);
  assert.equal(store.deleteTimelineProjects([timeline.id]), 1);
  assert.equal(store.getTimelineProject(timeline.id), null);
  assert.deepEqual(store.listTimelineScenes(timeline.id), []);

  const project = projects.create({ title: "清理测试" });
  projects.linkAsset(project.id, "tts", "1", "测试配音", { path: "test.mp3" });
  projects.linkAsset(project.id, "director", "2", "测试导演稿", { sceneCount: 1, subtitleTimeline: [{ text: "测试" }] });
  projects.linkAsset(project.id, "image", "3", "测试图片", { path: "test.png" });
  projects.linkAsset(project.id, "bgm", "4", "测试音乐", { path: "test.mp3" });
  const removed = projects.removeAssetsByType(project.id, ["tts", "director"]);
  assert.equal(removed.removed, 2);
  assert.deepEqual(removed.project.selectedTtsAudio, {});
  assert.deepEqual(removed.project.directorScript, {});
  assert.equal(projects.clear(), 1);
  assert.deepEqual(projects.list(), []);

  console.log("record cleanup tests passed");
} finally {
  projects.close();
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
}
