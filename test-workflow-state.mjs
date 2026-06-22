import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProjectCenter } from "./server/core/project-center.js";
import {
  canAdvanceWorkflow,
  normalizeWorkflowState,
  nextWorkflowState,
  workflowStatusForState,
} from "./server/core/workflow-state.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dy-workflow-"));
const projectCenter = createProjectCenter(tempDir);

try {
  const created = projectCenter.create({ title: "Workflow Test" });
  assert.equal(created.workflowState, "input_ready");
  assert.equal(created.status, "created");

  const transcript = projectCenter.update(created.id, {
    transcriptText: "这是一段用于测试的短视频文案。",
    workflowState: "transcript_ready",
    status: workflowStatusForState("transcript_ready"),
  });
  assert.equal(transcript.workflowState, "transcript_ready");
  assert.equal(transcript.status, "transcribed");

  const titles = projectCenter.setWorkflowState(created.id, "titles_ready", {
    platformTitles: { douyinTitle: "测试标题" },
  });
  assert.equal(titles.workflowState, "titles_ready");
  assert.equal(titles.status, "transcribed");

  const rewrite = projectCenter.linkAsset(created.id, "selected_rewrite", "rewrite-1", "改写版本", {
    text: "改写后的口播文案。",
  }).project;
  assert.equal(rewrite.workflowState, "rewrite_ready");
  assert.equal(rewrite.status, "rewritten");

  const tts = projectCenter.linkAsset(created.id, "tts", 101, "测试配音", {
    id: 101,
    text: "改写后的口播文案。",
    audio_path: "tts.mp3",
  }).project;
  assert.equal(tts.workflowState, "tts_ready");
  assert.equal(tts.status, "voiced");

  const director = projectCenter.linkAsset(created.id, "director", 202, "测试导演稿", {
    id: 202,
    sceneCount: 2,
  }).project;
  assert.equal(director.workflowState, "director_ready");
  assert.equal(director.status, "directed");

  const image = projectCenter.linkAsset(created.id, "image", "img-1", "镜头 1", {
    sceneIndex: 1,
    path: "01.png",
  }).project;
  assert.equal(image.workflowState, "image_ready");
  assert.equal(image.status, "assets_ready");

  const draft = projectCenter.linkAsset(created.id, "jianying", "draft-1", "剪映草稿", {
    path: "draft",
  }).project;
  assert.equal(draft.workflowState, "draft_ready");
  assert.equal(draft.status, "draft_ready");

  assert.equal(normalizeWorkflowState("bad"), "input_ready");
  assert.equal(nextWorkflowState("rewrite_ready"), "tts_ready");
  assert.equal(canAdvanceWorkflow("transcript_ready", "titles_ready"), true);
  assert.equal(canAdvanceWorkflow("director_ready", "rewrite_ready"), false);

  console.log("Workflow state tests passed.");
} finally {
  projectCenter.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
