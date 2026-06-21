// 流水线事件定义 — 标准化所有阶段事件

export const PIPELINE_EVENTS = {
  // 阶段状态
  STAGE_START: "stage:start",
  STAGE_PROGRESS: "stage:progress",
  STAGE_COMPLETE: "stage:complete",
  STAGE_ERROR: "stage:error",
  STAGE_SKIP: "stage:skip",

  // 流水线状态
  PIPELINE_START: "pipeline:start",
  PIPELINE_PROGRESS: "pipeline:progress",
  PIPELINE_COMPLETE: "pipeline:complete",
  PIPELINE_ERROR: "pipeline:error",
};

// 流水线阶段定义（按顺序）
export const PIPELINE_STAGES = [
  { id: "collect", name: "内容采集", store: "copybank" },
  { id: "normalize", name: "内容标准化", store: "copybank" },
  { id: "analyze", name: "内容分析", store: "copybank" },
  { id: "rewrite", name: "AI改写", store: "copybank" },
  { id: "director", name: "AI导演", store: "director-bank" },
  { id: "storyboard", name: "分镜", store: "storyboard-bank" },
  { id: "image", name: "图片生成", store: "image-bank" },
  { id: "tts", name: "TTS语音", store: "voice-bank" },
  { id: "timeline", name: "时间线", store: "video-bank" },
  { id: "render", name: "视频渲染", store: "video-bank" },
  { id: "export", name: "导出", store: "jianying-bank" },
  { id: "qa", name: "质量检查", store: "video-bank" },
];

export const PIPELINE_STAGE_ALIASES = {
  asset: "image",
  video: "render",
  jianying: "export",
};

export function normalizePipelineStage(stage) {
  return PIPELINE_STAGE_ALIASES[stage] || stage;
}

export function getStageIdList() {
  return PIPELINE_STAGES.map((stage) => stage.id);
}

export function getStageById(stageId) {
  const normalized = normalizePipelineStage(stageId);
  return PIPELINE_STAGES.find((stage) => stage.id === normalized) || null;
}

export function getNextStage(stageId) {
  const current = getStageById(stageId);
  if (!current) return null;
  const index = PIPELINE_STAGES.findIndex((stage) => stage.id === current.id);
  return index >= 0 && index < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[index + 1] : null;
}

export function getNextStageId(stageId) {
  return getNextStage(stageId)?.id || null;
}
