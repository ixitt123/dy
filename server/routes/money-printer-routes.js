import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { HttpBodyError, readJsonBody } from "../utils/http-body.js";

const DEFAULT_API_PORT = 8080;
const DEFAULT_WEBUI_PORT = 8501;
const LOCAL_HOST = "127.0.0.1";
const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural-Female";
const ALLOWED_ASPECTS = new Set(["16:9", "9:16", "1:1"]);
const ALLOWED_SOURCES = new Set(["pexels", "pixabay", "coverr", "local"]);
const ALLOWED_CONCAT_MODES = new Set(["random", "sequential"]);
const ALLOWED_TRANSITIONS = new Set(["", "Shuffle", "FadeIn", "FadeOut", "SlideIn", "SlideOut"]);
const TASK_STATE_FAILED = -1;
const TASK_STATE_COMPLETE = 1;
const TASK_STATE_PROCESSING = 4;

let apiProcess = null;
const apiLogs = [];

export function createMoneyPrinterRoutes({ baseDir, sendJson }) {
  const defaultRoot = path.resolve(baseDir, "..", "MoneyPrinterTurbo");

  return async function handleMoneyPrinterRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/money-printer/")) return false;
    const route = url.pathname.replace("/api/money-printer/", "");

    if (req.method === "GET" && route === "status") {
      const status = await buildStatus(defaultRoot);
      sendJson(res, 200, { ok: true, ...status });
      return true;
    }

    if (req.method === "POST" && route === "start-api") {
      try {
        const status = await startApi(defaultRoot);
        sendJson(res, 200, { ok: true, ...status });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error), logs: apiLogs.slice(-80) });
      }
      return true;
    }

    if (req.method === "GET" && route === "assets") {
      const status = await buildStatus(defaultRoot);
      if (!status.api.online) {
        sendJson(res, 200, { ok: true, apiOnline: false, bgm: [], materials: [], message: "MoneyPrinterTurbo API 未运行。" });
        return true;
      }
      const [bgm, materials] = await Promise.all([
        fetchMptJson(`${status.api.v1BaseUrl}/musics`).catch((error) => ({ ok: false, error: error.message })),
        fetchMptJson(`${status.api.v1BaseUrl}/video_materials`).catch((error) => ({ ok: false, error: error.message })),
      ]);
      sendJson(res, 200, {
        ok: true,
        apiOnline: true,
        bgm: Array.isArray(bgm?.data?.files) ? bgm.data.files : [],
        materials: Array.isArray(materials?.data?.files) ? materials.data.files : [],
      });
      return true;
    }

    if (req.method === "POST" && route === "generate") {
      try {
        const body = await readJsonBody(req, { maxBytes: 96 * 1024 });
        const status = await buildStatus(defaultRoot);
        if (!status.api.online) throw new Error("MoneyPrinterTurbo API 未运行，请先点击“启动 API”。");
        const payload = buildGeneratePayload(body);
        const result = await fetchMptJson(`${status.api.v1BaseUrl}/videos`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (Number(result?.status || 0) !== 200) throw new Error(result?.message || "MoneyPrinterTurbo 创建任务失败。");
        sendJson(res, 202, {
          ok: true,
          task: result.data,
          payload,
          apiBaseUrl: status.api.baseUrl,
        });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "GET" && route === "task") {
      try {
        const taskId = String(url.searchParams.get("id") || "").trim();
        if (!taskId) throw new Error("缺少 MoneyPrinterTurbo 任务 ID。");
        const status = await buildStatus(defaultRoot);
        if (!status.api.online) throw new Error("MoneyPrinterTurbo API 未运行。");
        const task = await fetchMptJson(`${status.api.v1BaseUrl}/tasks/${encodeURIComponent(taskId)}`);
        if (Number(task?.status || 0) !== 200) throw new Error(task?.message || "读取任务失败。");
        sendJson(res, 200, {
          ok: true,
          task: normalizeTask(task.data || {}, status.api.baseUrl),
          apiBaseUrl: status.api.baseUrl,
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }

    if (req.method === "GET" && route === "tasks") {
      try {
        const status = await buildStatus(defaultRoot);
        if (!status.api.online) {
          sendJson(res, 200, { ok: true, tasks: [], apiOnline: false });
          return true;
        }
        const result = await fetchMptJson(`${status.api.v1BaseUrl}/tasks?page=1&page_size=20`);
        sendJson(res, 200, {
          ok: true,
          apiOnline: true,
          tasks: (result?.data?.tasks || []).map((task) => normalizeTask(task, status.api.baseUrl)),
          total: Number(result?.data?.total || 0),
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }

    if (req.method === "POST" && route === "open") {
      try {
        const body = await readJsonBody(req, { maxBytes: 16 * 1024 });
        const status = await buildStatus(defaultRoot);
        const target = openTarget(String(body.target || ""), status, body);
        if (!target) throw new Error("没有可打开的 MoneyPrinterTurbo 目标。");
        openExternal(target);
        sendJson(res, 200, { ok: true, target });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    return false;
  };
}

async function buildStatus(rootDir) {
  const root = path.resolve(rootDir);
  const installed = fs.existsSync(path.join(root, "main.py")) && fs.existsSync(path.join(root, "app"));
  const configPath = path.join(root, "config.toml");
  const configExamplePath = path.join(root, "config.example.toml");
  const serverConfig = readServerConfig(fs.existsSync(configPath) ? configPath : configExamplePath);
  const apiBaseUrl = `http://${LOCAL_HOST}:${serverConfig.port || DEFAULT_API_PORT}`;
  const apiV1BaseUrl = `${apiBaseUrl}/api/v1`;
  const webuiBaseUrl = `http://${LOCAL_HOST}:${DEFAULT_WEBUI_PORT}`;
  const api = await checkApi(apiV1BaseUrl);
  return {
    root,
    installed,
    configPath,
    hasConfig: fs.existsSync(configPath),
    uv: commandAvailable("uv"),
    python: pythonVersion(),
    api: {
      baseUrl: apiBaseUrl,
      v1BaseUrl: apiV1BaseUrl,
      docsUrl: `${apiBaseUrl}/docs`,
      online: api.online,
      message: api.message,
    },
    webui: {
      baseUrl: webuiBaseUrl,
    },
    process: {
      startedByDy: Boolean(apiProcess && !apiProcess.killed),
      pid: apiProcess?.pid || 0,
      logs: apiLogs.slice(-80),
    },
    defaults: {
      aspect: "16:9",
      source: "pexels",
      voice: DEFAULT_VOICE,
      clipDuration: 5,
      videoCount: 1,
    },
  };
}

async function startApi(rootDir) {
  const status = await buildStatus(rootDir);
  if (!status.installed) throw new Error(`没有找到 MoneyPrinterTurbo：${status.root}`);
  if (status.api.online) return { ...status, started: false, message: "MoneyPrinterTurbo API 已经在运行。" };
  if (apiProcess && !apiProcess.killed) return { ...status, started: false, message: "MoneyPrinterTurbo API 正在启动中。" };
  if (!status.uv) throw new Error("没有找到 uv，请先安装 uv 或在 MoneyPrinterTurbo 目录准备 Python 环境。");

  apiLogs.length = 0;
  appendLog(`Starting MoneyPrinterTurbo API in ${status.root}`);
  apiProcess = spawn("uv", ["run", "python", "main.py"], {
    cwd: status.root,
    env: {
      ...process.env,
      PYTHONPATH: status.root,
      PYTHONIOENCODING: "utf-8",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  apiProcess.stdout?.on("data", (chunk) => appendLog(chunk.toString("utf8")));
  apiProcess.stderr?.on("data", (chunk) => appendLog(chunk.toString("utf8")));
  apiProcess.on("exit", (code) => appendLog(`MoneyPrinterTurbo API exited with code ${code}`));

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await wait(1000);
    const nextStatus = await buildStatus(rootDir);
    if (nextStatus.api.online) return { ...nextStatus, started: true, message: "MoneyPrinterTurbo API 已启动。" };
  }
  return { ...(await buildStatus(rootDir)), started: true, message: "已发起启动，请稍后刷新状态。首次 uv 安装依赖可能需要几分钟。" };
}

function buildGeneratePayload(body = {}) {
  const subject = String(body.video_subject || body.subject || "").trim();
  const script = String(body.video_script || body.script || "").trim();
  if (!subject && !script) throw new Error("请填写视频主题或完整脚本。");
  const aspect = ALLOWED_ASPECTS.has(String(body.video_aspect || "")) ? String(body.video_aspect) : "16:9";
  const source = ALLOWED_SOURCES.has(String(body.video_source || "")) ? String(body.video_source) : "pexels";
  const concatMode = ALLOWED_CONCAT_MODES.has(String(body.video_concat_mode || "")) ? String(body.video_concat_mode) : "random";
  const transition = normalizeTransition(body.video_transition_mode);
  const payload = {
    video_subject: subject,
    video_script: script,
    video_terms: parseTerms(body.video_terms),
    video_aspect: aspect,
    video_source: source,
    video_count: clampInteger(body.video_count, 1, 4, 1),
    video_clip_duration: clampInteger(body.video_clip_duration, 1, 12, 5),
    video_concat_mode: concatMode,
    video_transition_mode: transition || null,
    match_materials_to_script: body.match_materials_to_script === true,
    voice_name: String(body.voice_name || DEFAULT_VOICE).trim() || DEFAULT_VOICE,
    voice_rate: clampFloat(body.voice_rate, 0.5, 2, 1.0),
    voice_volume: clampFloat(body.voice_volume, 0, 2, 1.0),
    bgm_type: normalizeBgmType(body.bgm_type),
    bgm_file: String(body.bgm_file || "").trim(),
    bgm_volume: clampFloat(body.bgm_volume, 0, 1, 0.2),
    subtitle_enabled: body.subtitle_enabled !== false,
    subtitle_position: String(body.subtitle_position || "bottom"),
    font_name: String(body.font_name || "STHeitiMedium.ttc"),
    font_size: clampInteger(body.font_size, 20, 120, 60),
    text_fore_color: String(body.text_fore_color || "#FFFFFF"),
    stroke_color: String(body.stroke_color || "#000000"),
    stroke_width: clampFloat(body.stroke_width, 0, 8, 1.5),
    n_threads: clampInteger(body.n_threads, 1, 8, 2),
    paragraph_number: clampInteger(body.paragraph_number, 1, 10, 1),
    video_language: String(body.video_language || "zh-CN"),
    video_script_prompt: String(body.video_script_prompt || "").slice(0, 2000),
    custom_system_prompt: String(body.custom_system_prompt || "").slice(0, 8000),
  };
  if (source === "local") payload.video_materials = parseLocalMaterials(body.video_materials);
  return payload;
}

function parseTerms(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return null;
  return text.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function parseLocalMaterials(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\n,，]/);
  return source
    .map((item) => String(item?.url || item).trim())
    .filter(Boolean)
    .map((url) => ({ provider: "local", url, duration: 0 }));
}

function normalizeTransition(value) {
  const map = {
    none: "",
    shuffle: "Shuffle",
    fade_in: "FadeIn",
    fade_out: "FadeOut",
    slide_in: "SlideIn",
    slide_out: "SlideOut",
  };
  const raw = String(value || "").trim();
  const normalized = map[raw] ?? raw;
  return ALLOWED_TRANSITIONS.has(normalized) ? normalized : "";
}

function normalizeBgmType(value) {
  const raw = String(value || "random").trim().toLowerCase();
  return ["none", "random", "custom"].includes(raw) ? raw : "random";
}

function normalizeTask(task, apiBaseUrl) {
  const state = Number(task.state || 0);
  return {
    ...task,
    state,
    stateLabel: state === TASK_STATE_COMPLETE ? "已完成" : state === TASK_STATE_FAILED ? "失败" : state === TASK_STATE_PROCESSING ? "生成中" : "等待中",
    progress: Number(task.progress || 0),
    videos: normalizeTaskUrls(task.videos, apiBaseUrl),
    combined_videos: normalizeTaskUrls(task.combined_videos, apiBaseUrl),
  };
}

function normalizeTaskUrls(value, apiBaseUrl) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || ""))
    .filter(Boolean)
    .map((item) => item.startsWith("http") ? item : `${apiBaseUrl}${item.startsWith("/") ? "" : "/"}${item}`);
}

async function checkApi(baseUrl) {
  try {
    const result = await fetchMptJson(`${baseUrl}/tasks?page=1&page_size=1`, {}, 1800);
    return Number(result?.status || 0) === 200
      ? { online: true, message: "online" }
      : { online: false, message: result?.message || "not ready" };
  } catch (error) {
    return { online: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchMptJson(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!response.ok) throw new Error(data?.message || `MoneyPrinterTurbo HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function readServerConfig(filePath) {
  const fallback = { host: LOCAL_HOST, port: DEFAULT_API_PORT };
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  const text = fs.readFileSync(filePath, "utf8");
  const host = matchTomlString(text, "listen_host") || LOCAL_HOST;
  const port = Number(matchTomlNumber(text, "listen_port") || DEFAULT_API_PORT);
  return {
    host: host === "0.0.0.0" ? LOCAL_HOST : host,
    port: Number.isFinite(port) ? port : DEFAULT_API_PORT,
  };
}

function matchTomlString(text, key) {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m").exec(text);
  return match?.[1] || "";
}

function matchTomlNumber(text, key) {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)`, "m").exec(text);
  return match?.[1] || "";
}

function commandAvailable(command) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], { windowsHide: true, encoding: "utf8" });
  return result.status === 0;
}

function pythonVersion() {
  const result = spawnSync("python", ["--version"], { windowsHide: true, encoding: "utf8" });
  return (result.stdout || result.stderr || "").trim();
}

function openTarget(target, status, body = {}) {
  if (target === "root") return status.root;
  if (target === "docs") return status.api.docsUrl;
  if (target === "api") return status.api.baseUrl;
  if (target === "webui") return status.webui.baseUrl;
  if (target === "task-video") return String(body.url || "").startsWith("http") ? String(body.url) : "";
  if (target === "tasks") return path.join(status.root, "storage", "tasks");
  return "";
}

function openExternal(target) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", target], { windowsHide: true, detached: true, stdio: "ignore" }).unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [target], { detached: true, stdio: "ignore" }).unref();
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampFloat(value, min, max, fallback) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function appendLog(value) {
  for (const line of String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    apiLogs.push(line);
  }
  while (apiLogs.length > 200) apiLogs.shift();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
