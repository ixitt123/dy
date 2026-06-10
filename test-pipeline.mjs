/**
 * PipelineBus 集成测试
 *
 * 验证：
 * 1. 7 个 asset stores 初始化正常
 * 2. PipelineBus 事件驱动数据流转
 * 3. 自动触发下一阶段
 * 4. 错误处理和重试
 *
 * 运行方式：node test-pipeline.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PipelineBus } from "./server/core/pipeline-bus/PipelineBus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_BASE_DIR = path.join(__dirname, ".test-pipeline");
const PASS = "✅";
const FAIL = "❌";

function assert(condition, message) {
  if (!condition) {
    console.error(`${FAIL} ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`${PASS} ${message}`);
  }
}

async function main() {
  console.log("=" .repeat(60));
  console.log("  PipelineBus 集成测试");
  console.log("=" .repeat(60));
  console.log();

  // ---- 测试 1: 初始化 PipelineBus ----
  console.log("📦 测试 1: 初始化 PipelineBus");
  const bus = new PipelineBus(TEST_BASE_DIR);
  assert(bus instanceof PipelineBus, "PipelineBus 实例创建成功");
  assert(bus.copyBank !== undefined, "copyBank 已初始化");
  assert(bus.directorBank !== undefined, "directorBank 已初始化");
  assert(bus.storyboardBank !== undefined, "storyboardBank 已初始化");
  assert(bus.imageBank !== undefined, "imageBank 已初始化");
  assert(bus.voiceBank !== undefined, "voiceBank 已初始化");
  assert(bus.videoBank !== undefined, "videoBank 已初始化");
  assert(bus.jianyingBank !== undefined, "jianyingBank 已初始化");
  assert(bus.allBanks.length === 7, "共 7 个 asset banks");

  // ---- 测试 2: 各 bank 独立工作 ----
  console.log("\n📦 测试 2: 各 bank CRUD 操作");

  const testSourceId = "test-source-001";

  // copybank
  const copyRecord = bus.copyBank.insert({
    sourceType: "manual",
    sourceId: testSourceId,
    data: { title: "测试视频", text: "这是一条测试文案" },
  });
  assert(copyRecord.id > 0, "copyBank 插入成功");
  assert(copyRecord.status === "waiting", "copyBank 默认状态为 waiting");

  const copyById = bus.copyBank.getById(copyRecord.id);
  assert(copyById !== null, "copyBank getById 成功");
  assert(copyById.data.title === "测试视频", "copyBank data 正确");

  const copyBySource = bus.copyBank.getBySourceId(testSourceId);
  assert(copyBySource !== null, "copyBank getBySourceId 成功");

  const copyUpdated = bus.copyBank.updateStatus(copyRecord.id, "processing");
  assert(copyUpdated.status === "processing", "copyBank 状态更新为 processing");

  const copyDone = bus.copyBank.updateStatus(copyRecord.id, "done", {
    data: { title: "测试视频（已改写）", rewritten: true },
  });
  assert(copyDone.status === "done", "copyBank 状态更新为 done");
  assert(copyDone.data.rewritten === true, "copyBank data 已更新");

  // directorBank
  const dirRecord = bus.directorBank.insert({
    sourceType: "pipeline",
    sourceId: testSourceId,
    data: { scenes_count: 5, platform: "douyin" },
  });
  assert(dirRecord.id > 0, "directorBank 插入成功");

  // storyboardBank
  const sbRecord = bus.storyboardBank.insert({
    sourceType: "pipeline",
    sourceId: testSourceId,
    data: { shots: 5 },
  });
  assert(sbRecord.id > 0, "storyboardBank 插入成功");

  // imageBank
  const imgRecord = bus.imageBank.insert({
    sourceType: "pipeline",
    sourceId: testSourceId,
    data: { images: ["img_001.png"] },
  });
  assert(imgRecord.id > 0, "imageBank 插入成功");

  // voiceBank
  const voiceRecord = bus.voiceBank.insert({
    sourceType: "pipeline",
    sourceId: testSourceId,
    data: { audio: "tts_output.mp3" },
  });
  assert(voiceRecord.id > 0, "voiceBank 插入成功");

  // videoBank
  const videoRecord = bus.videoBank.insert({
    sourceType: "pipeline",
    sourceId: testSourceId,
    data: { video: "final.mp4" },
  });
  assert(videoRecord.id > 0, "videoBank 插入成功");

  // jianyingBank
  const jyRecord = bus.jianyingBank.insert({
    sourceType: "pipeline",
    sourceId: testSourceId,
    data: { draft: "jianying_draft.json" },
  });
  assert(jyRecord.id > 0, "jianyingBank 插入成功");

  // ---- 测试 3: 完整流水线事件流转 ----
  console.log("\n📦 测试 3: 完整流水线事件驱动流转");

  const pipelineSourceId = "pipeline-full-test";

  // 记录事件触发情况
  const events = [];
  function recordEvent(name, detail) {
    events.push({ name, detail, time: new Date().toISOString() });
  }

  bus.on("stage:complete", (detail) => recordEvent("stage:complete", detail));
  bus.on("stage:ready", (detail) => recordEvent("stage:ready", detail));
  bus.on("pipeline:complete", (detail) => recordEvent("pipeline:complete", detail));
  bus.on("pipeline:error", (detail) => recordEvent("pipeline:error", detail));

  // 创建 job
  const { jobId, sourceId } = bus.createJob({
    type: "test_video",
    data: {
      title: "流水线测试视频",
      source_text: "原始文案内容",
    },
    sourceId: pipelineSourceId,
  });
  assert(jobId.startsWith("job_"), "创建 job 成功");
  assert(sourceId === pipelineSourceId, "sourceId 正确");

  // 验证 rewrite 阶段有 waiting 记录
  const rewriteRec = bus.copyBank.getBySourceId(pipelineSourceId);
  assert(rewriteRec !== null, "rewrite 记录已自动创建");
  assert(rewriteRec.status === "waiting", "rewrite 初始状态为 waiting");

  // 手动标记 rewrite → processing → done
  bus.copyBank.updateStatus(rewriteRec.id, "processing");
  const rewriteComplete = bus.onStageComplete("rewrite", {
    sourceId: pipelineSourceId,
    jobId,
    data: { title: "流水线测试视频（改写后）", rewritten_text: "改写后的文案..." },
  });
  assert(rewriteComplete.nextStage === "director", "rewrite 完成后自动触发 director");
  assert(rewriteComplete.nextRecord !== null, "director 阶段已自动创建记录");
  assert(rewriteComplete.nextRecord.status === "waiting", "director 初始状态为 waiting");

  // 验证 director 阶段记录
  const dirRec = bus.directorBank.getBySourceId(pipelineSourceId);
  assert(dirRec !== null, "director 记录已存在");
  assert(dirRec.status === "waiting", "director 状态为 waiting");

  // 模拟 director → done → storyboard
  bus.directorBank.updateStatus(dirRec.id, "processing");
  const dirComplete = bus.onStageComplete("director", {
    sourceId: pipelineSourceId,
    jobId,
    data: { scenes: 5, duration: 60 },
  });
  assert(dirComplete.nextStage === "storyboard", "director → storyboard");

  // 模拟 storyboard → done → image
  const sbRec = bus.storyboardBank.getBySourceId(pipelineSourceId);
  bus.storyboardBank.updateStatus(sbRec.id, "processing");
  const sbComplete = bus.onStageComplete("storyboard", {
    sourceId: pipelineSourceId,
    jobId,
    data: { prompts: ["prompt1", "prompt2"] },
  });
  assert(sbComplete.nextStage === "image", "storyboard → image");

  // 模拟 image → done → tts
  const imgRec = bus.imageBank.getBySourceId(pipelineSourceId);
  bus.imageBank.updateStatus(imgRec.id, "processing");
  const imgComplete = bus.onStageComplete("image", {
    sourceId: pipelineSourceId,
    jobId,
    data: { generated: 2 },
  });
  assert(imgComplete.nextStage === "tts", "image → tts");

  // 模拟 tts → done → video
  const voiceRec = bus.voiceBank.getBySourceId(pipelineSourceId);
  bus.voiceBank.updateStatus(voiceRec.id, "processing");
  const voiceComplete = bus.onStageComplete("tts", {
    sourceId: pipelineSourceId,
    jobId,
    data: { audio_duration: 45 },
  });
  assert(voiceComplete.nextStage === "video", "tts → video");

  // 模拟 video → done → jianying
  const videoRec = bus.videoBank.getBySourceId(pipelineSourceId);
  bus.videoBank.updateStatus(videoRec.id, "processing");
  const videoComplete = bus.onStageComplete("video", {
    sourceId: pipelineSourceId,
    jobId,
    data: { video_path: "final.mp4" },
  });
  assert(videoComplete.nextStage === "jianying", "video → jianying");

  // 模拟 jianying → done → pipeline complete
  const jyRec = bus.jianyingBank.getBySourceId(pipelineSourceId);
  bus.jianyingBank.updateStatus(jyRec.id, "processing");
  const jyComplete = bus.onStageComplete("jianying", {
    sourceId: pipelineSourceId,
    jobId,
    data: { export_path: "jianying_project.json" },
  });
  assert(jyComplete.nextStage === null, "jianying 是终点，无下一阶段");

  // 验证 pipeline:complete 事件已触发
  const completeEvents = events.filter((e) => e.name === "pipeline:complete");
  assert(completeEvents.length > 0, "pipeline:complete 事件已触发");

  // ---- 测试 4: 错误处理 ----
  console.log("\n📦 测试 4: 错误处理与重试");

  const errorSourceId = "error-test-source";
  bus.createJob({
    type: "error_test",
    data: { title: "错误测试" },
    sourceId: errorSourceId,
  });

  // 模拟 rewrite 失败
  bus.onStageError("rewrite", {
    sourceId: errorSourceId,
    error: "AI 服务不可用",
  });

  const failedRec = bus.copyBank.getBySourceId(errorSourceId);
  assert(failedRec.status === "failed", "失败状态正确记录");
  assert(failedRec.error === "AI 服务不可用", "错误信息正确记录");

  // 重试
  const retried = bus.retryStage("rewrite", errorSourceId);
  assert(retried.status === "waiting", "重试后状态重置为 waiting");
  assert(!retried.error, "重试后错误信息已清空");

  // ---- 测试 5: 统计信息 ----
  console.log("\n📦 测试 5: 统计信息");

  const stats = bus.getAllStats();
  assert(typeof stats === "object", "getAllStats 返回对象");
  for (const stage of PipelineBus.STAGES) {
    const s = stats[stage];
    assert(s !== undefined, `包含 ${stage} 统计`);
    assert(typeof s.total === "number", `${stage} total 是数字`);
    assert(typeof s.byStatus === "object", `${stage} byStatus 是对象`);
  }

  // ---- 测试 6: 查询方法 ----
  console.log("\n📦 测试 6: 查询方法");

  const job = bus.getJob(jobId);
  assert(job !== null, "getJob 返回 job");
  assert(job.progress === 100, "完整流水线进度为 100%");
  assert(job.status === "completed", "job 状态为 completed");

  const pipeline = bus.getPipelineBySourceId(pipelineSourceId);
  assert(pipeline !== null, "getPipelineBySourceId 返回数据");
  assert(pipeline.stages.rewrite.record !== null, "rewrite 有记录");
  assert(pipeline.stages.jianying.record !== null, "jianying 有记录");

  const jobs = bus.listJobs();
  assert(jobs.length >= 2, "listJobs 返回 >= 2 个 job");

  // ---- 测试 7: 阶段标签 ----
  console.log("\n📦 测试 7: 阶段标签");
  assert(PipelineBus.STAGES.length === 7, "共 7 个阶段");
  assert(PipelineBus.STAGE_LABELS.rewrite === "文案改写", "rewrite 标签正确");
  assert(PipelineBus.STAGE_LABELS.jianying === "剪映导出", "jianying 标签正确");

  // ---- 清理 ----
  console.log("\n🧹 清理测试数据...");
  bus.destroy();

  // 删除测试数据库文件
  const fs = await import("node:fs");
  const testDataDir = path.join(TEST_BASE_DIR, ".data", "pipeline");
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  // ---- 结果 ----
  console.log("\n" + "=".repeat(60));
  if (process.exitCode !== 1) {
    console.log("  🎉 所有测试通过！");
  } else {
    console.log("  ⚠️ 部分测试失败，请查看上方输出。");
  }
  console.log("=".repeat(60));

  // 强制退出
  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error("测试异常:", err);
  process.exit(1);
});
