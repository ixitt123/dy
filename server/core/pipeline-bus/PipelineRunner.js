// 流水线执行器 — 按顺序执行各阶段
import { PIPELINE_EVENTS, PIPELINE_STAGES, normalizePipelineStage } from "./PipelineEvents.js";
import { PipelineBus } from "./PipelineBus.js";
import { PipelineState } from "./PipelineState.js";

export const DEFAULT_STAGE_POLICIES = {
  collect: { critical: true, onError: "stop" },
  normalize: { critical: true, onError: "stop" },
  analyze: { critical: true, onError: "stop" },
  rewrite: { critical: true, onError: "stop" },
  director: { critical: true, onError: "stop" },
  storyboard: { critical: false, onError: "skip" },
  image: { critical: false, onError: "fallback" },
  tts: { critical: true, onError: "stop" },
  timeline: { critical: true, onError: "stop" },
  render: { critical: true, onError: "stop" },
  export: { critical: true, onError: "stop" },
  qa: { critical: false, onError: "skip" },
};

export class PipelineRunner {
  constructor({ bus, state, baseDir = "", handlers = {}, stagePolicies = {} }) {
    this._bus = bus || new PipelineBus(baseDir);
    this._state = state || new PipelineState(baseDir);
    this._handlers = {};
    for (const [stageId, handler] of Object.entries(handlers)) this.registerHandler(stageId, handler);
    this._stagePolicies = Object.fromEntries(PIPELINE_STAGES.map(({ id }) => [
      id,
      { ...DEFAULT_STAGE_POLICIES[id], ...(stagePolicies[id] || {}) },
    ]));
  }

  registerHandler(stageId, handler) {
    this._handlers[normalizePipelineStage(stageId)] = handler;
  }

  async start({ sourceId, inputData, startFrom = "collect" }) {
    const jobId = `pipeline_${Date.now()}`;
    this._state.initJob(jobId, sourceId);

    this._bus.emit(PIPELINE_EVENTS.PIPELINE_START, { jobId, sourceId, startFrom });

    const normalizedStart = normalizePipelineStage(startFrom);
    let stageIdx = PIPELINE_STAGES.findIndex(s => s.id === normalizedStart);
    if (stageIdx < 0) stageIdx = 0;

    let currentData = inputData;
    const completedStages = [];
    const skippedStages = [];
    const warnings = [];
    const errors = [];
    let failedStage = null;

    for (let i = stageIdx; i < PIPELINE_STAGES.length; i++) {
      const stage = PIPELINE_STAGES[i];
      const handler = this._handlers[stage.id];
      const policy = this._stagePolicies[stage.id] || { critical: true, onError: "stop" };

      // 阶段开始
      this._state.setStageStatus(jobId, stage.id, "running", { startedAt: new Date().toISOString() });
      this._bus.emit(PIPELINE_EVENTS.STAGE_START, { jobId, stageId: stage.id, data: currentData });

      if (!handler) {
        const message = `${stage.name}缺少处理器`;
        if (policy.critical) {
          failedStage = stage.id;
          errors.push({ stage: stage.id, message });
          this._state.setStageStatus(jobId, stage.id, "failed", { error: message });
          this._state.failJob(jobId, { failedStage, error: message, errors });
          this._bus.emit(PIPELINE_EVENTS.STAGE_ERROR, { jobId, stageId: stage.id, error: message });
          this._bus.emit(PIPELINE_EVENTS.PIPELINE_ERROR, { jobId, stageId: stage.id, error: message });
          break;
        }
        skippedStages.push(stage.id);
        warnings.push({ stage: stage.id, message });
        this._state.setStageStatus(jobId, stage.id, "skipped", { warning: message });
        this._bus.emit(PIPELINE_EVENTS.STAGE_SKIP, { jobId, stageId: stage.id, warning: message });
        continue;
      }

      try {
        this._state.setStageProgress(jobId, stage.id, 10, `开始${stage.name}`);
        this._bus.emit(PIPELINE_EVENTS.STAGE_PROGRESS, { jobId, stageId: stage.id, progress: 10, step: `开始${stage.name}` });

        const result = await handler(currentData, {
          jobId,
          stage,
          onProgress: (pct, step) => {
            this._state.setStageProgress(jobId, stage.id, pct, step);
            this._bus.emit(PIPELINE_EVENTS.STAGE_PROGRESS, { jobId, stageId: stage.id, progress: pct, step });
          },
        });

        // 输出传递给下一阶段
        if (result) currentData = result;

        this._state.setStageStatus(jobId, stage.id, "done", { output: result });
        this._bus.emit(PIPELINE_EVENTS.STAGE_COMPLETE, { jobId, stageId: stage.id, data: result });
        completedStages.push(stage.id);

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this._bus.emit(PIPELINE_EVENTS.STAGE_ERROR, { jobId, stageId: stage.id, error: message });
        if (policy.critical || policy.onError === "stop") {
          failedStage = stage.id;
          errors.push({ stage: stage.id, message });
          this._state.setStageStatus(jobId, stage.id, "failed", { error: message });
          this._state.failJob(jobId, { failedStage, error: message, errors });
          this._bus.emit(PIPELINE_EVENTS.PIPELINE_ERROR, { jobId, stageId: stage.id, error: message });
          break;
        }
        const fallback = policy.onError === "fallback";
        const warning = `${stage.name}失败，已${fallback ? "使用上一阶段数据继续" : "跳过"}：${message}`;
        skippedStages.push(stage.id);
        warnings.push({ stage: stage.id, message: warning, fallback });
        this._state.setStageStatus(jobId, stage.id, "skipped", { warning, fallback });
        this._bus.emit(PIPELINE_EVENTS.STAGE_SKIP, { jobId, stageId: stage.id, warning, fallback });
      }
    }

    if (!failedStage) {
      this._state.completeJob(jobId);
      this._bus.emit(PIPELINE_EVENTS.PIPELINE_COMPLETE, { jobId, finalData: currentData });
    }

    return {
      jobId,
      status: failedStage ? "failed" : "done",
      finalData: currentData,
      completedStages,
      skippedStages,
      failedStage,
      warnings,
      errors,
      state: this._state.getJobState(jobId),
    };
  }

  async runStage(stageId, data) {
    stageId = normalizePipelineStage(stageId);
    const handler = this._handlers[stageId];
    if (!handler) return null;
    const jobId = `stage_${stageId}_${Date.now()}`;
    this._state.initJob(jobId);
    this._state.setStageStatus(jobId, stageId, "running");
    
    try {
      const result = await handler(data, {
        jobId,
        stage: { id: stageId },
        onProgress: (pct, step) => {
          this._state.setStageProgress(jobId, stageId, pct, step);
        },
      });
      this._state.setStageStatus(jobId, stageId, "done", { output: result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._state.setStageStatus(jobId, stageId, "failed", { error: message });
      this._state.failJob(jobId, { failedStage: stageId, error: message, errors: [{ stage: stageId, message }] });
      throw error;
    }
  }
}
