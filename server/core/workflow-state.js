export const WORKFLOW_STATES = [
  "input_ready",
  "transcript_ready",
  "titles_ready",
  "rewrite_ready",
  "tts_ready",
  "image_ready",
  "timeline_ready",
  "draft_ready",
];

const WORKFLOW_STATE_SET = new Set(WORKFLOW_STATES);

export const WORKFLOW_TO_PROJECT_STATUS = {
  input_ready: "created",
  transcript_ready: "transcribed",
  titles_ready: "transcribed",
  rewrite_ready: "rewritten",
  tts_ready: "voiced",
  image_ready: "assets_ready",
  timeline_ready: "assets_ready",
  draft_ready: "draft_ready",
};

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(String(value || "").trim());
}

export function normalizeWorkflowState(value, fallback = "input_ready") {
  const state = String(value || "").trim();
  if (WORKFLOW_STATE_SET.has(state)) return state;
  return WORKFLOW_STATE_SET.has(fallback) ? fallback : "input_ready";
}

export function workflowStateRank(value) {
  return Math.max(0, WORKFLOW_STATES.indexOf(normalizeWorkflowState(value)));
}

export function workflowStatusForState(value) {
  return WORKFLOW_TO_PROJECT_STATUS[normalizeWorkflowState(value)] || "created";
}

export function nextWorkflowState(value) {
  const index = workflowStateRank(value);
  return WORKFLOW_STATES[Math.min(WORKFLOW_STATES.length - 1, index + 1)];
}

export function canAdvanceWorkflow(current, target) {
  return workflowStateRank(target) >= workflowStateRank(current);
}

export function workflowStateFromProject(project = {}) {
  if (hasValue(project.outputHistory) || hasValue(project.jianyingDraft)) return "draft_ready";
  if (hasValue(project.timelineProject) || hasValue(project.lastTimelineProjectId)) return "timeline_ready";
  if (hasValue(project.selectedAssets)) return "image_ready";
  if (hasValue(project.selectedTtsAudio) || hasValue(project.lastTtsJobId)) return "tts_ready";
  if (hasValue(project.selectedRewriteText) || hasValue(project.lastRewriteId)) return "rewrite_ready";
  if (hasValue(project.platformTitles) || hasValue(project.seoKeywords) || hasValue(project.hashtags)) return "titles_ready";
  if (hasValue(project.transcriptText)) return "transcript_ready";
  return "input_ready";
}
