// 流水线执行器 — 按顺序执行各阶段
import { PIPELINE_EVENTS, PIPELINE_STAGES, getNextStage } from "./PipelineEvents.js";
import { PipelineBus } from "./PipelineBus.js";
import { PipelineState } from "./PipelineState.js";

export class PipelineRunner {
  constructor({ bus, state, baseDir = "", handlers = {} }) {
    this._bus = bus || new PipelineBus(baseDir);
    this._state = state || new PipelineState(baseDir);
    this._handlers = handlers; // { stageId: async (data, context) => result }
  }

  registerHandler(stageId, handler) {
    this._handlers[stageId] = handler;
  }

  async start({ sourceId, inputData, startFrom = "collect" }) {
    const jobId = `pipeline_${Date.now()}`;
    this._state.initJob(jobId, sourceId);

    this._bus.emit(PIPELINE_EVENTS.PIPELINE_START, { jobId, sourceId, startFrom });

    let stageIdx = PIPELINE_STAGES.findIndex(s => s.id === startFrom);
    if (stageIdx < 0) stageIdx = 0;

    let currentData = inputData;

    for (let i = stageIdx; i < PIPELINE_STAGES.length; i++) {
      const stage = PIPELINE_STAGES[i];
      const handler = this._handlers[stage.id];

      // 阶段开始
      this._state.setStageStatus(jobId, stage.id, "running", { startedAt: new Date().toISOString() });
      this._bus.emit(PIPELINE_EVENTS.STAGE_START, { jobId, stageId: stage.id, data: currentData });

      try {
        if (!handler) {
          // 无处理器，跳过
          this._state.setStageStatus(jobId, stage.id, "skipped");
          this._bus.emit(PIPELINE_EVENTS.STAGE_SKIP, { jobId, stageId: stage.id });
          continue;
        }

        // 执行阶段
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

      } catch (error) {
        this._state.setStageStatus(jobId, stage.id, "failed", { error: error.message });
        this._bus.emit(PIPELINE_EVENTS.STAGE_ERROR, { jobId, stageId: stage.id, error: error.message });
        
        // 失败不终止，继续下一阶段
        continue;
      }
    }

    this._state.completeJob(jobId);
    this._bus.emit(PIPELINE_EVENTS.PIPELINE_COMPLETE, { jobId, finalData: currentData });

    return { jobId, finalData: currentData, state: this._state.getJobState(jobId) };
  }

  async runStage(stageId, data) {
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
      this._state.setStageStatus(jobId, stageId, "failed", { error: error.message });
      throw error;
    }
  }
}
