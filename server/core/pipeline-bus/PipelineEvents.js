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
  { id: "collect",   name: "内容采集",   store: "copybank" },
  { id: "analyze",   name: "内容分析",   store: "copybank" },
  { id: "rewrite",   name: "AI改写",     store: "copybank" },
  { id: "director",  name: "AI导演",     store: "director-bank" },
  { id: "storyboard", name: "分镜",      store: "storyboard-bank" },
  { id: "asset",     name: "素材生成",   store: "image-bank" },
  { id: "tts",       name: "TTS语音",    store: "voice-bank" },
  { id: "video",     name: "视频工厂",   store: "video-bank" },
  { id: "export",    name: "剪映导出",   store: "jianying-bank" },
];

export function getStageById(id) {
  return PIPELINE_STAGES.find(s => s.id === id);
}

export function getNextStage(id) {
  const idx = PIPELINE_STAGES.findIndex(s => s.id === id);
  return idx >= 0 && idx < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[idx + 1] : null;
}
