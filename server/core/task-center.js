// 任务中心 (轻量版)
import fs from "node:fs";
import path from "node:path";

export function createTaskCenter(baseDir, { onProgress } = {}) {
  const dataDir = path.join(baseDir, ".data", "tasks");
  fs.mkdirSync(dataDir, { recursive: true });

  function getAllTasks() {
    const tasks = [];
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
        tasks.push(data);
      } catch {}
    }
    return tasks.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  function addTask(type, data) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const task = { id, type, data, status: "waiting", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(dataDir, `${id}.json`), JSON.stringify(task, null, 2));
    return task;
  }

  function updateTask(id, updates) {
    const filePath = path.join(dataDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    const task = JSON.parse(fs.readFileSync(filePath, "utf8"));
    Object.assign(task, updates, { updatedAt: new Date().toISOString() });
    fs.writeFileSync(filePath, JSON.stringify(task, null, 2));
    if (onProgress) onProgress({ taskId: id, ...updates });
    return task;
  }

  function getStats() {
    const tasks = getAllTasks();
    return {
      total: tasks.length,
      waiting: tasks.filter(t => t.status === "waiting").length,
      running: tasks.filter(t => t.status === "running").length,
      done: tasks.filter(t => t.status === "done").length,
      failed: tasks.filter(t => t.status === "failed").length,
      recent: tasks.slice(0, 10),
    };
  }

  return { getAllTasks, addTask, updateTask, getStats };
}
