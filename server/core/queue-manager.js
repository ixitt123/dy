// 任务队列管理器
export class QueueManager {
  constructor({ maxConcurrency = 3, onProgress } = {}) {
    this._maxConcurrency = maxConcurrency;
    this._running = new Map();     // taskId -> { promise, type }
    this._waiting = [];            // [{ type, data, resolve, reject }]
    this._history = [];            // 最近完成的任务
    this._onProgress = onProgress;
  }

  // 添加任务到队列
  enqueue(type, data, executor) {
    return new Promise((resolve, reject) => {
      const task = { type, data, executor, resolve, reject, addedAt: Date.now() };
      this._waiting.push(task);
      this._emit({ type: "queued", taskType: type });
      this._processNext();
    });
  }

  async _processNext() {
    while (this._running.size < this._maxConcurrency && this._waiting.length > 0) {
      const task = this._waiting.shift();
      const taskId = `${task.type}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
      
      this._running.set(taskId, { type: task.type, startedAt: Date.now() });
      this._emit({ type: "started", taskId, taskType: task.type });

      try {
        const result = await task.executor({
          taskId,
          onProgress: (pct, step) => {
            this._emit({ type: "progress", taskId, taskType: task.type, progress: pct, step });
          },
        });
        this._running.delete(taskId);
        this._history.unshift({ taskId, type: task.type, status: "done", result, completedAt: Date.now() });
        this._history = this._history.slice(0, 100); // 保留最近100条
        this._emit({ type: "completed", taskId, taskType: task.type, result });
        task.resolve(result);
      } catch (error) {
        this._running.delete(taskId);
        this._history.unshift({ taskId, type: task.type, status: "failed", error: error.message, completedAt: Date.now() });
        this._emit({ type: "failed", taskId, taskType: task.type, error: error.message });
        task.reject(error);
      }

      // 继续处理
      setImmediate(() => this._processNext());
    }
  }

  _emit(data) {
    if (this._onProgress) this._onProgress(data);
  }

  getStatus() {
    return {
      running: this._running.size,
      waiting: this._waiting.length,
      maxConcurrency: this._maxConcurrency,
      history: this._history.slice(0, 20),
    };
  }

  cancelAll() {
    this._waiting.forEach(t => t.reject(new Error("cancelled")));
    this._waiting = [];
    this._emit({ type: "cleared" });
  }
}
