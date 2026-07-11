import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { readJsonBody } from "../utils/http-body.js";

function waitForExit(child) {
  return new Promise((resolve) => child.once("close", (code) => resolve(code)));
}

function withServiceUrl(serviceUrl, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z]:[\\/]/i.test(raw) || raw.startsWith("\\\\")) return raw;
  return `${serviceUrl.replace(/\/$/, "")}/${raw.replace(/^\//, "")}`;
}

function normalizeTaskRecord(task = {}, serviceUrl = "") {
  return {
    ...task,
    videos: Array.isArray(task.videos) ? task.videos.map((item) => withServiceUrl(serviceUrl, item)) : [],
    combined_videos: Array.isArray(task.combined_videos) ? task.combined_videos.map((item) => withServiceUrl(serviceUrl, item)) : [],
    audio_file: withServiceUrl(serviceUrl, task.audio_file || ""),
    subtitle_path: withServiceUrl(serviceUrl, task.subtitle_path || ""),
  };
}

export function createMoneyPrinterTurboRoutes({ baseDir, sendJson, getSettings, writeSettings }) {
  const defaultInstallDir = path.join(baseDir, "integrations", "moneyprinterturbo");
  let childProcess = null;

  function config() {
    const current = getSettings()?.moneyPrinterTurbo || {};
    return {
      installDir: path.resolve(current.installDir || defaultInstallDir),
      serviceUrl: String(current.serviceUrl || "http://127.0.0.1:8501").replace(/\/$/, ""),
    };
  }

  async function isOnline(serviceUrl) {
    try {
      const response = await fetch(serviceUrl, { signal: AbortSignal.timeout(1800) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function status() {
    const current = config();
    const installed = fs.existsSync(path.join(current.installDir, "webui.bat"));
    const online = await isOnline(current.serviceUrl);
    return {
      ok: true,
      installed,
      online,
      running: Boolean(childProcess && childProcess.exitCode === null),
      installDir: current.installDir,
      serviceUrl: current.serviceUrl,
      message: !installed ? "未检测到官方源码。" : online ? "MoneyPrinterTurbo 已就绪。" : "源码已安装，服务尚未启动。",
    };
  }

  async function requestApi(apiPath, { method = "GET", body } = {}) {
    const current = config();
    const url = `${current.serviceUrl}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;
    const response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};
    if (!response.ok) {
      throw new Error(data?.message || `MoneyPrinterTurbo API ${response.status}`);
    }
    return { current, data };
  }

  return async function handleMoneyPrinterTurboRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/moneyprinterturbo")) return false;

    if (req.method === "GET" && url.pathname === "/api/moneyprinterturbo/status") {
      sendJson(res, 200, await status());
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/moneyprinterturbo/settings") {
      const body = await readJsonBody(req);
      const current = getSettings();
      current.moneyPrinterTurbo = {
        installDir: path.resolve(String(body.installDir || defaultInstallDir)),
        serviceUrl: String(body.serviceUrl || "http://127.0.0.1:8501").replace(/\/$/, ""),
      };
      writeSettings(current);
      sendJson(res, 200, await status());
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/moneyprinterturbo/start") {
      const current = config();
      const launcher = path.join(current.installDir, "webui.bat");
      if (!fs.existsSync(launcher)) {
        sendJson(res, 404, { ok: false, message: "未找到 MoneyPrinterTurbo/webui.bat。" });
        return true;
      }
      const example = path.join(current.installDir, "config.example.toml");
      const target = path.join(current.installDir, "config.toml");
      if (!fs.existsSync(target) && fs.existsSync(example)) fs.copyFileSync(example, target);
      if (!childProcess || childProcess.exitCode !== null) {
        childProcess = spawn("cmd.exe", ["/d", "/s", "/c", launcher], {
          cwd: current.installDir,
          windowsHide: true,
          detached: false,
          stdio: "ignore",
        });
        childProcess.once("error", () => { childProcess = null; });
      }
      sendJson(res, 202, { ok: true, message: "MoneyPrinterTurbo 正在后台启动。", ...(await status()) });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/moneyprinterturbo/stop") {
      if (childProcess && childProcess.exitCode === null) childProcess.kill();
      childProcess = null;
      sendJson(res, 200, { ok: true, message: "MoneyPrinterTurbo 已停止。" });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/moneyprinterturbo/update") {
      const current = config();
      if (!fs.existsSync(path.join(current.installDir, ".git"))) {
        sendJson(res, 400, { ok: false, message: "当前目录不是可更新的官方 Git 源码。" });
        return true;
      }
      const child = spawn("git", ["pull", "--ff-only", "origin", "main"], {
        cwd: current.installDir,
        windowsHide: true,
        stdio: "ignore",
      });
      const code = await waitForExit(child);
      sendJson(res, code === 0 ? 200 : 500, {
        ok: code === 0,
        message: code === 0 ? "MoneyPrinterTurbo 已更新。" : "更新失败，请检查网络和上游分支。",
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/moneyprinterturbo/videos") {
      try {
        const currentStatus = await status();
        if (!currentStatus.online) {
          sendJson(res, 503, { ok: false, message: "MoneyPrinterTurbo 服务未启动，暂时无法提交官方任务。" });
          return true;
        }
        const body = await readJsonBody(req, { maxBytes: 512 * 1024 });
        const { current, data } = await requestApi("/api/v1/videos", { method: "POST", body });
        sendJson(res, 202, {
          ok: true,
          serviceUrl: current.serviceUrl,
          task: data?.data || {},
          taskId: data?.data?.task_id || "",
          message: data?.message || "MoneyPrinterTurbo 官方任务已提交。",
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/moneyprinterturbo/tasks") {
      try {
        const currentStatus = await status();
        if (!currentStatus.online) {
          sendJson(res, 503, { ok: false, message: "MoneyPrinterTurbo 服务未启动，暂时无法查询官方任务。" });
          return true;
        }
        const taskId = String(url.searchParams.get("taskId") || "").trim();
        const page = Number(url.searchParams.get("page") || 1);
        const pageSize = Number(url.searchParams.get("pageSize") || 10);
        const apiPath = taskId
          ? `/api/v1/tasks/${encodeURIComponent(taskId)}`
          : `/api/v1/tasks?page=${Math.max(1, page)}&page_size=${Math.max(1, pageSize)}`;
        const { current, data } = await requestApi(apiPath);
        const payload = data?.data || {};
        if (taskId) {
          sendJson(res, 200, {
            ok: true,
            serviceUrl: current.serviceUrl,
            task: normalizeTaskRecord(payload, current.serviceUrl),
          });
          return true;
        }
        sendJson(res, 200, {
          ok: true,
          serviceUrl: current.serviceUrl,
          tasks: Array.isArray(payload.tasks) ? payload.tasks.map((task) => normalizeTaskRecord(task, current.serviceUrl)) : [],
          total: Number(payload.total || 0),
          page: Number(payload.page || page),
          pageSize: Number(payload.page_size || pageSize),
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    return false;
  };
}
