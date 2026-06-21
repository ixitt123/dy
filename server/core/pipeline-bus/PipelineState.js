// 流水线状态跟踪器
import fs from "node:fs";
import path from "node:path";
import { PIPELINE_STAGES } from "./PipelineEvents.js";

const STAGE_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  DONE: "done",
  FAILED: "failed",
  SKIPPED: "skipped",
};

export class PipelineState {
  constructor(baseDir) {
    this._baseDir = baseDir;
    this._states = new Map(); // jobId -> state object
    this._stateFile = path.join(baseDir, ".data", "pipeline-states.json");
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._stateFile)) {
        const data = JSON.parse(fs.readFileSync(this._stateFile, "utf8"));
        for (const [k, v] of Object.entries(data)) {
          this._states.set(k, v);
        }
      }
    } catch {}
  }

  _save() {
    try {
      const dir = path.dirname(this._stateFile);
      fs.mkdirSync(dir, { recursive: true });
      const obj = {};
      for (const [k, v] of this._states) { obj[k] = v; }
      fs.writeFileSync(this._stateFile, JSON.stringify(obj, null, 2), "utf8");
    } catch {}
  }

  initJob(jobId, sourceId = "") {
    if (!this._states.has(jobId)) {
      this._states.set(jobId, {
        jobId,
        sourceId,
        status: "running",
        currentStage: null,
        stages: {},
        startedAt: new Date().toISOString(),
        completedAt: null,
      });
    }
    this._save();
  }

  setStageStatus(jobId, stageId, status, meta = {}) {
    const state = this._states.get(jobId);
    if (!state) return;
    const previous = state.stages[stageId] || {};
    state.currentStage = stageId;
    state.stages[stageId] = {
      status,
      startedAt: previous.startedAt || meta.startedAt || new Date().toISOString(),
      completedAt: ["done", "failed", "skipped"].includes(status) ? new Date().toISOString() : null,
      error: meta.error || null,
      output: meta.output ?? previous.output ?? null,
      progress: meta.progress ?? previous.progress ?? 0,
      warning: meta.warning || null,
      fallback: Boolean(meta.fallback),
    };
    if (status === "failed") state.status = "failed";
    this._save();
    return state.stages[stageId];
  }

  setStageProgress(jobId, stageId, progress, currentStep = "") {
    const state = this._states.get(jobId);
    if (!state || !state.stages[stageId]) return;
    state.stages[stageId].progress = progress;
    state.stages[stageId].currentStep = currentStep;
    this._save();
  }

  completeJob(jobId) {
    const state = this._states.get(jobId);
    if (!state || state.status === "failed") return state || null;
    state.status = "done";
    state.completedAt = new Date().toISOString();
    this._save();
    return state;
  }

  failJob(jobId, meta = {}) {
    const state = this._states.get(jobId);
    if (!state) return null;
    state.status = "failed";
    state.failedStage = meta.failedStage || state.currentStage || null;
    state.error = meta.error || state.error || "Pipeline failed";
    state.errors = Array.isArray(meta.errors) ? meta.errors : state.errors || [];
    state.completedAt = new Date().toISOString();
    this._save();
    return state;
  }

  getJobState(jobId) {
    return this._states.get(jobId) || null;
  }

  getActiveJobs() {
    return [...this._states.values()].filter(s => s.status === "running");
  }

  getJobProgress(jobId) {
    const state = this._states.get(jobId);
    if (!state) return { stages: [] };
    const stages = PIPELINE_STAGES.length;
    let done = 0;
    for (const s of Object.values(state.stages)) {
      if (s.status === "done" || s.status === "skipped") done++;
    }
    const current = state.currentStage ? state.stages[state.currentStage] : null;
    return {
      stages,
      done,
      total: stages,
      percent: Math.round((done / stages) * 100),
      currentStage: state.currentStage,
      currentStep: current?.currentStep || "",
      stageProgress: current?.progress || 0,
      status: state.status,
    };
  }

  static get STAGES() {
    return PIPELINE_STAGES;
  }
}
