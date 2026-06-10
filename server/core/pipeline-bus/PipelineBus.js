/**
 * PipelineBus — 流水线数据总线
 *
 * 基于 EventEmitter 的流水线编排引擎。
 * 当上游阶段完成时自动将数据传递给下游，实现：
 *
 *   rewrite → director → storyboard → image → tts → video → jianying export
 *
 * 特点：
 * - 事件驱动：各阶段完成时发出 stage:complete 事件，触发下一阶段
 * - 7 个资产存储库（banks）：每个阶段独立 SQLite 表
 * - 每个 bank 存储：source_id、status、data_json、created_at
 * - 自动触发：上游 done → 下游自动进入 processing
 * - 支持暂停/恢复/重试失败的阶段
 */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import {
  CopyBank,
  DirectorBank,
  StoryboardBank,
  ImageBank,
  VoiceBank,
  VideoBank,
  JianyingBank,
} from "../asset-stores/index.js";

// ============================================================
// 流水线阶段定义
// ============================================================

const PIPELINE_STAGES = [
  "rewrite",     // 0: 文案改写
  "director",    // 1: 导演稿生成
  "storyboard",  // 2: 分镜生成
  "image",       // 3: 图片生成
  "tts",         // 4: 语音合成
  "video",       // 5: 视频合成
  "jianying",    // 6: 剪映导出
];

const STAGE_BANKS = {
  rewrite: "copyBank",
  director: "directorBank",
  storyboard: "storyboardBank",
  image: "imageBank",
  tts: "voiceBank",
  video: "videoBank",
  jianying: "jianyingBank",
};

const STAGE_LABELS = {
  rewrite: "文案改写",
  director: "导演稿",
  storyboard: "分镜",
  image: "图片生成",
  tts: "语音合成",
  video: "视频合成",
  jianying: "剪映导出",
};

// ============================================================
// PipelineBus 类
// ============================================================

export class PipelineBus extends EventEmitter {
  /**
   * @param {string} baseDir - 项目根目录
   */
  constructor(baseDir) {
    super();

    this.baseDir = baseDir;
    this.dataDir = path.join(baseDir, ".data", "pipeline");
    fs.mkdirSync(this.dataDir, { recursive: true });

    // -------- 初始化 7 个资产存储库 --------
    this.copyBank = new CopyBank(baseDir);
    this.directorBank = new DirectorBank(baseDir);
    this.storyboardBank = new StoryboardBank(baseDir);
    this.imageBank = new ImageBank(baseDir);
    this.voiceBank = new VoiceBank(baseDir);
    this.videoBank = new VideoBank(baseDir);
    this.jianyingBank = new JianyingBank(baseDir);

    // 初始化所有 banks
    for (const bank of this.allBanks) {
      bank.init();
    }

    // -------- 注册内部事件监听 --------
    this._setupInternalListeners();

    // -------- 运行时状态 --------
    /** @type {Map<string, object>} jobId -> pipeline job */
    this.jobs = new Map();

    /** @type {Map<string, Function[]>} jobId -> 等待触发的回调队列 */
    this._pendingTriggers = new Map();
  }

  // ==========================================================
  // 公共属性
  // ==========================================================

  /** 所有阶段名称列表 */
  static get STAGES() {
    return PIPELINE_STAGES;
  }

  /** 阶段中文标签 */
  static get STAGE_LABELS() {
    return STAGE_LABELS;
  }

  /** 获取所有 bank 实例 */
  get allBanks() {
    return [
      this.copyBank,
      this.directorBank,
      this.storyboardBank,
      this.imageBank,
      this.voiceBank,
      this.videoBank,
      this.jianyingBank,
    ];
  }

  /** 根据阶段名获取对应的 bank */
  getBank(stage) {
    const bankKey = STAGE_BANKS[stage];
    return bankKey ? this[bankKey] : null;
  }

  // ==========================================================
  // 任务管理
  // ==========================================================

  /**
   * 创建一条流水线任务
   *
   * 从第一个阶段 (rewrite) 开始，自动插入 copybank，
   * 后续阶段记录由各阶段完成事件自动创建。
   *
   * @param {object} params
   * @param {string} params.type - 任务类型标识
   * @param {object} params.data - 初始数据（如 source_text, title 等）
   * @param {string} [params.sourceType='manual'] - 来源类型
   * @param {string} [params.sourceId] - 来源 ID，不传则自动生成
   * @returns {object} { jobId, sourceId, rewriteRecord }
   */
  createJob({ type = "manual", data = {}, sourceType = "manual", sourceId } = {}) {
    const finalSourceId = sourceId || `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 插入 copybank（第一阶段）
    const rewriteRecord = this.copyBank.insert({
      sourceType,
      sourceId: finalSourceId,
      status: "waiting",
      data: {
        pipeline_type: type,
        ...data,
      },
    });

    // 记录 job 元信息
    const job = {
      id: `job_${rewriteRecord.id}`,
      sourceId: finalSourceId,
      sourceType,
      type,
      currentStage: "rewrite",
      status: "running",
      stages: {
        rewrite: { recordId: rewriteRecord.id, status: "waiting" },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);

    // 发出事件
    this.emit("job:created", { job, rewriteRecord });
    this.emit("stage:ready", { jobId: job.id, stage: "rewrite", sourceId: finalSourceId, data: rewriteRecord.data });

    return {
      jobId: job.id,
      sourceId: finalSourceId,
      rewriteRecord,
    };
  }

  /**
   * 手动向某个阶段插入一条记录（用于外部模块将已有任务接入 pipeline）
   *
   * @param {string} stage - 阶段名
   * @param {object} params
   * @param {string} params.sourceId - 来源 ID
   * @param {object} [params.data={}] - 阶段数据
   * @param {string} [params.sourceType=''] - 来源类型
   * @param {string} [params.jobId] - 关联的 job ID
   * @returns {object} 插入的记录
   */
  insertStageRecord(stage, { sourceId, data = {}, sourceType = "", jobId } = {}) {
    const bank = this.getBank(stage);
    if (!bank) throw new Error(`未知阶段：${stage}`);

    const record = bank.insert({
      sourceType,
      sourceId,
      status: "waiting",
      data,
    });

    // 如果有关联的 job，更新 stages
    if (jobId && this.jobs.has(jobId)) {
      const job = this.jobs.get(jobId);
      job.stages[stage] = { recordId: record.id, status: "waiting" };
      job.updatedAt = new Date().toISOString();
    }

    this.emit("stage:record:created", { stage, sourceId, record, jobId });
    return record;
  }

  // ==========================================================
  // 阶段完成处理 — 核心自动流转逻辑
  // ==========================================================

  /**
   * 标记某个阶段完成，自动触发下一阶段
   *
   * @param {string} stage - 当前完成的阶段名
   * @param {object} params
   * @param {string} params.sourceId - 来源 ID
   * @param {object} [params.data={}] - 阶段产出数据
   * @param {string} [params.jobId] - 关联的 job ID
   * @param {number} [params.recordId] - 已存在的 bank 记录 ID（可选）
   * @returns {object} { currentRecord, nextStage, nextRecord }
   */
  onStageComplete(stage, { sourceId, data = {}, jobId, recordId } = {}) {
    const bank = this.getBank(stage);
    if (!bank) throw new Error(`未知阶段：${stage}`);

    // 1. 查找或创建当前阶段的 bank 记录
    let currentRecord;
    if (recordId) {
      currentRecord = bank.getById(recordId);
    } else {
      currentRecord = bank.getBySourceId(sourceId);
    }

    if (!currentRecord) {
      // 自动创建一条记录（兼容没有预插入的场景）
      currentRecord = this.insertStageRecord(stage, { sourceId, data, jobId });
    }

    // 2. 更新当前阶段状态为 done
    currentRecord = bank.updateStatus(currentRecord.id, "done", { data });

    // 3. 更新 job 状态
    if (jobId && this.jobs.has(jobId)) {
      const job = this.jobs.get(jobId);
      job.stages[stage] = { recordId: currentRecord.id, status: "done" };
      job.currentStage = this._nextStage(stage);
      job.updatedAt = new Date().toISOString();
    }

    // 4. 发出完成事件
    this.emit("stage:complete", {
      stage,
      label: STAGE_LABELS[stage],
      sourceId,
      jobId,
      record: currentRecord,
    });

    // 5. 自动触发下一阶段
    const next = this._nextStage(stage);
    if (next) {
      const nextRecord = this._autoTriggerNextStage(next, sourceId, currentRecord.data, jobId);

      this.emit("pipeline:progress", {
        fromStage: stage,
        toStage: next,
        sourceId,
        jobId,
        nextRecord,
      });

      return { currentRecord, nextStage: next, nextRecord };
    }

    // 6. 流水线终点：jianying 完成后触发 pipeline:complete
    if (stage === "jianying") {
      if (jobId && this.jobs.has(jobId)) {
        const job = this.jobs.get(jobId);
        job.status = "completed";
        job.updatedAt = new Date().toISOString();
      }
      this.emit("pipeline:complete", {
        sourceId,
        jobId,
        finalRecord: currentRecord,
      });
    }

    return { currentRecord, nextStage: null, nextRecord: null };
  }

  /**
   * 标记某个阶段失败
   *
   * @param {string} stage - 失败的阶段名
   * @param {object} params
   * @param {string} params.sourceId - 来源 ID
   * @param {string} params.error - 错误信息
   * @param {string} [params.jobId] - 关联 job ID
   * @param {number} [params.recordId] - bank 记录 ID
   */
  onStageError(stage, { sourceId, error, jobId, recordId } = {}) {
    const bank = this.getBank(stage);
    if (!bank) throw new Error(`未知阶段：${stage}`);

    let record;
    if (recordId) {
      record = bank.getById(recordId);
    } else {
      record = bank.getBySourceId(sourceId);
    }

    if (record) {
      record = bank.updateStatus(record.id, "failed", { error });
    }

    if (jobId && this.jobs.has(jobId)) {
      const job = this.jobs.get(jobId);
      if (record) {
        job.stages[stage] = { recordId: record.id, status: "failed" };
      }
      job.status = "failed";
      job.updatedAt = new Date().toISOString();
    }

    this.emit("stage:error", {
      stage,
      label: STAGE_LABELS[stage],
      sourceId,
      jobId,
      error,
      record,
    });

    this.emit("pipeline:error", {
      stage,
      sourceId,
      jobId,
      error,
    });
  }

  /**
   * 重试失败的阶段
   *
   * @param {string} stage - 阶段名
   * @param {string} sourceId - 来源 ID
   * @returns {object} 重试的记录
   */
  retryStage(stage, sourceId) {
    const bank = this.getBank(stage);
    if (!bank) throw new Error(`未知阶段：${stage}`);

    const record = bank.getBySourceId(sourceId);
    if (!record || record.status !== "failed") {
      throw new Error(`未找到 source_id=${sourceId} 的失败记录`);
    }

    const updated = bank.updateStatus(record.id, "waiting", { error: "" });

    this.emit("stage:retry", {
      stage,
      sourceId,
      record: updated,
    });

    // 触发该阶段的处理就绪事件
    this.emit("stage:ready", {
      jobId: null,
      stage,
      sourceId,
      data: updated.data,
    });

    return updated;
  }

  // ==========================================================
  // 查询方法
  // ==========================================================

  /**
   * 获取一个 job 的完整流水线状态
   * @param {string} jobId
   * @returns {object|null}
   */
  getJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    const stages = {};
    for (const [stage, info] of Object.entries(job.stages)) {
      const bank = this.getBank(stage);
      stages[stage] = {
        ...info,
        record: bank ? bank.getById(info.recordId) : null,
        label: STAGE_LABELS[stage] || stage,
      };
    }

    return {
      ...job,
      stages,
      progress: this._calcProgress(job),
    };
  }

  /**
   * 根据 sourceId 获取完整流水线状态
   * @param {string} sourceId
   * @returns {object}
   */
  getPipelineBySourceId(sourceId) {
    const stages = {};
    for (const stage of PIPELINE_STAGES) {
      const bank = this.getBank(stage);
      const record = bank.getBySourceId(sourceId);
      stages[stage] = {
        label: STAGE_LABELS[stage],
        record,
        status: record ? record.status : "none",
      };
    }

    // 查找关联的 job
    let job = null;
    for (const [, j] of this.jobs) {
      if (j.sourceId === sourceId) {
        job = j;
        break;
      }
    }

    return { sourceId, stages, job };
  }

  /**
   * 列出所有活跃的 jobs
   * @returns {object[]}
   */
  listJobs() {
    return Array.from(this.jobs.values()).map((job) => this.getJob(job.id));
  }

  /**
   * 获取全部 banks 的统计信息
   * @returns {object}
   */
  getAllStats() {
    const stats = {};
    for (const stage of PIPELINE_STAGES) {
      const bank = this.getBank(stage);
      stats[stage] = {
        label: STAGE_LABELS[stage],
        ...bank.getStats(),
      };
    }
    return stats;
  }

  // ==========================================================
  // 销毁
  // ==========================================================

  /**
   * 关闭所有数据库连接，清理事件监听器
   */
  destroy() {
    for (const bank of this.allBanks) {
      bank.close();
    }
    this.jobs.clear();
    this._pendingTriggers.clear();
    this.removeAllListeners();
  }

  // ==========================================================
  // 私有方法
  // ==========================================================

  /**
   * 获取下一个阶段名
   * @param {string} stage
   * @returns {string|null}
   */
  _nextStage(stage) {
    const idx = PIPELINE_STAGES.indexOf(stage);
    if (idx === -1 || idx >= PIPELINE_STAGES.length - 1) return null;
    return PIPELINE_STAGES[idx + 1];
  }

  /**
   * 自动触发下一阶段：在下游 bank 中创建 waiting 记录
   *
   * @param {string} nextStage - 下一阶段名
   * @param {string} sourceId - 来源 ID
   * @param {object} upstreamData - 上游传下来的数据
   * @param {string} [jobId] - 关联 job ID
   * @returns {object} 下游新创建的记录
   */
  _autoTriggerNextStage(nextStage, sourceId, upstreamData, jobId) {
    const bank = this.getBank(nextStage);
    if (!bank) return null;

    // 检查是否已存在记录
    let existing = bank.getBySourceId(sourceId);
    if (existing) {
      // 如果状态是 done 或 processing，跳过
      if (existing.status === "done") return existing;
      if (existing.status === "processing") return existing;

      // 否则重置为 waiting
      existing = bank.updateStatus(existing.id, "waiting", {
        data: { ...(existing.data || {}), _upstream: upstreamData },
      });
    } else {
      existing = bank.insert({
        sourceType: "pipeline",
        sourceId,
        status: "waiting",
        data: {
          _upstream: upstreamData,
          _stage: nextStage,
        },
      });
    }

    // 更新 job
    if (jobId && this.jobs.has(jobId)) {
      const job = this.jobs.get(jobId);
      job.stages[nextStage] = { recordId: existing.id, status: "waiting" };
      job.updatedAt = new Date().toISOString();
    }

    // 发出就绪事件，通知下游模块可以开始处理
    this.emit("stage:ready", {
      jobId,
      stage: nextStage,
      label: STAGE_LABELS[nextStage],
      sourceId,
      data: existing.data,
      recordId: existing.id,
    });

    return existing;
  }

  /**
   * 注册内部事件监听
   */
  _setupInternalListeners() {
    // 监听 stage:complete 进行日志记录
    this.on("stage:complete", ({ stage, label, sourceId, jobId }) => {
      console.log(`[PipelineBus] ✅ ${label} 完成 — source: ${sourceId}${jobId ? ` job: ${jobId}` : ""}`);
    });

    // 监听 stage:error 进行日志记录
    this.on("stage:error", ({ stage, label, sourceId, error }) => {
      console.error(`[PipelineBus] ❌ ${label} 失败 — source: ${sourceId}: ${error}`);
    });

    // 监听 pipeline:complete
    this.on("pipeline:complete", ({ sourceId, jobId }) => {
      console.log(`[PipelineBus] 🎉 流水线完成！source: ${sourceId}${jobId ? ` job: ${jobId}` : ""}`);
    });

    // 监听 pipeline:error
    this.on("pipeline:error", ({ stage, sourceId, error }) => {
      console.error(`[PipelineBus] ⚠️ 流水线中断于 ${stage} — source: ${sourceId}: ${error}`);
    });
  }

  /**
   * 计算 job 进度百分比
   * @param {object} job
   * @returns {number} 0-100
   */
  _calcProgress(job) {
    const total = PIPELINE_STAGES.length;
    let done = 0;
    for (const stage of PIPELINE_STAGES) {
      if (job.stages[stage]?.status === "done") done++;
    }
    return Math.round((done / total) * 100);
  }
}
