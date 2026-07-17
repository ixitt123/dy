import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { HttpBodyError, readJsonBody } from "../utils/http-body.js";
import { buildAss } from "../kinetic-text/kinetic-text-service.js";
import { KINETIC_TEXT_EFFECTS, defaultEffectParams, normalizeEffectId } from "../kinetic-text/effects.js";

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
let apiStartPromise = null;
const apiLogs = [];
const renderedFiles = new Map();
const managedTasks = new Map();

export function createMoneyPrinterRoutes({ baseDir, sendJson, ffmpegPath, ffprobePath, getDownloadsDir }) {
  const defaultRoot = path.resolve(process.env.MONEY_PRINTER_TURBO_ROOT || path.join(baseDir, "integrations", "moneyprinterturbo"));
  const workflowDir = path.join(baseDir, ".data", "money-printer");

  const handleMoneyPrinterRoutes = async function handleMoneyPrinterRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/money-printer/")) return false;
    const route = url.pathname.replace("/api/money-printer/", "");

    if (req.method === "GET" && route === "status") {
      const status = await buildStatus(defaultRoot);
      sendJson(res, 200, { ok: true, ...status });
      return true;
    }

    if (req.method === "GET" && route === "effects") {
      sendJson(res, 200, { ok: true, effects: KINETIC_TEXT_EFFECTS });
      return true;
    }

    if (req.method === "GET" && route === "file") {
      const id = String(url.searchParams.get("id") || "").trim();
      const record = id ? renderedFiles.get(id) : null;
      if (!record?.filePath || !fs.existsSync(record.filePath)) {
        sendJson(res, 404, { ok: false, message: "MoneyPrinter 输出文件不存在。" });
      } else {
        sendFile(res, record.filePath, { download: url.searchParams.get("download") === "1" });
      }
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

    if (req.method === "POST" && route === "render-final") {
      try {
        const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
        const status = await buildStatus(defaultRoot);
        const result = await renderFinalVideo(body, {
          rootDir: status.root,
          workflowDir,
          downloadsDir: typeof getDownloadsDir === "function" ? getDownloadsDir() : path.join(baseDir, "downloads"),
          ffmpegPath,
          ffprobePath,
        });
        renderedFiles.set(result.id, { filePath: result.outputPath, createdAt: new Date().toISOString() });
        sendJson(res, 200, { ok: true, ...result, videoUrl: `/api/money-printer/file?id=${encodeURIComponent(result.id)}` });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
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
        const status = await startApi(defaultRoot);
        if (!status.api.online) throw new Error("MoneyPrinterTurbo API 未运行，请先点击“启动 API”。");
        const materialSources = resolveMaterialSourceOrder(body.video_source, status.materials);
        const payload = buildGeneratePayload({ ...body, video_source: materialSources[0] });
        const managed = await createManagedTask(status, payload, materialSources);
        sendJson(res, 202, {
          ok: true,
          task: managedTaskSnapshot(managed),
          payload,
          materialSources,
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
        const managed = managedTasks.get(taskId);
        if (managed) {
          const task = await pollManagedTask(status, managed);
          sendJson(res, 200, { ok: true, task, apiBaseUrl: status.api.baseUrl });
          return true;
        }
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
  handleMoneyPrinterRoutes.shutdown = stopApiProcess;
  return handleMoneyPrinterRoutes;
}

function stopApiProcess() {
  const child = apiProcess;
  apiProcess = null;
  apiStartPromise = null;
  if (!child?.pid || child.killed) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    try { child.kill(); } catch {}
  }
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
  const launcher = resolveApiLauncher(root);
  const materials = readMaterialProviderStatus(configPath);
  return {
    root,
    installed,
    configPath,
    hasConfig: fs.existsSync(configPath),
    uv: commandAvailable("uv"),
    python: pythonVersion(),
    runtime: launcher?.label || "unavailable",
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
    materials,
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
  if (apiStartPromise) return apiStartPromise;
  apiStartPromise = startApiOnce(rootDir).finally(() => {
    apiStartPromise = null;
  });
  return apiStartPromise;
}

async function startApiOnce(rootDir) {
  const status = await buildStatus(rootDir);
  if (!status.installed) throw new Error(`没有找到 MoneyPrinterTurbo：${status.root}`);
  if (status.api.online) return { ...status, started: false, connectedExisting: true, message: "MoneyPrinterTurbo API 已经在运行，已连接现有实例。" };
  if (apiProcess && !apiProcess.killed) {
    return waitForApiReady(status, { started: false, connectedExisting: true });
  }
  if (await isPortListening(LOCAL_HOST, new URL(status.api.baseUrl).port)) {
    appendLog(`Port ${new URL(status.api.baseUrl).port} is occupied; waiting for the existing API instance.`);
    return waitForApiReady(status, { started: false, connectedExisting: true });
  }

  const launcher = resolveApiLauncher(status.root);
  if (!launcher) throw new Error("没有找到 MoneyPrinterTurbo 内置 Python 环境、uv 或可用 Python，无法启动 API。");

  apiLogs.length = 0;
  appendLog(`Starting MoneyPrinterTurbo API with ${launcher.label} in ${status.root}`);
  apiProcess = spawn(launcher.command, launcher.args, {
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
  apiProcess.on("error", (error) => appendLog(`MoneyPrinterTurbo API failed to start: ${error.message}`));
  apiProcess.on("exit", (code) => {
    apiProcess = null;
    appendLog(`MoneyPrinterTurbo API exited with code ${code}`);
  });
  return waitForApiReady(status, { started: true, connectedExisting: false });
}

async function waitForApiReady(initialStatus, flags = {}) {
  const deadline = Date.now() + 120_000;
  let lastMessage = initialStatus.api?.message || "not ready";
  while (Date.now() < deadline) {
    await wait(1000);
    const api = await checkApi(initialStatus.api.v1BaseUrl);
    if (api.online) {
      const ready = await buildStatus(initialStatus.root);
      return {
        ...ready,
        ...flags,
        message: flags.connectedExisting
          ? "已连接现有 MoneyPrinterTurbo API 实例。"
          : "MoneyPrinterTurbo API 已自动启动。",
      };
    }
    lastMessage = api.message || lastMessage;
    if (flags.started && !apiProcess) break;
  }
  const recentLogs = apiLogs.slice(-12).join(" | ");
  throw new Error(`MoneyPrinterTurbo API 启动失败：${sanitizeMptError(recentLogs || lastMessage)}`);
}

function resolveApiLauncher(rootDir) {
  const candidates = process.platform === "win32"
    ? [path.join(rootDir, ".venv", "Scripts", "python.exe"), path.join(rootDir, "venv", "Scripts", "python.exe")]
    : [path.join(rootDir, ".venv", "bin", "python"), path.join(rootDir, "venv", "bin", "python")];
  const projectPython = candidates.find((candidate) => fs.existsSync(candidate));
  if (projectPython) return { command: projectPython, args: ["main.py"], label: "project-venv" };
  if (commandAvailable("uv")) return { command: "uv", args: ["run", "python", "main.py"], label: "uv" };
  if (commandAvailable("python")) return { command: "python", args: ["main.py"], label: "system-python" };
  return null;
}

function isPortListening(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(port) });
    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(800);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function readMaterialProviderStatus(configPath) {
  const text = configPath && fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  const providers = [
    { id: "pexels", label: "Pexels", configKey: "pexels_api_keys" },
    { id: "pixabay", label: "Pixabay", configKey: "pixabay_api_keys" },
    { id: "coverr", label: "Coverr", configKey: "coverr_api_keys" },
  ].map((provider) => {
    const keyCount = tomlArrayValueCount(text, provider.configKey);
    return { id: provider.id, label: provider.label, configured: keyCount > 0, keyCount };
  });
  return {
    providers,
    fallbackOrder: providers.filter((provider) => provider.configured).map((provider) => provider.id),
  };
}

function tomlArrayValueCount(text, key) {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(String(text || ""));
  if (!match) return 0;
  return (match[1].match(/"(?:[^"\\\\]|\\\\.)+"|'(?:[^'\\\\]|\\\\.)+'/g) || []).length;
}

function resolveMaterialSourceOrder(preferred, materials = {}) {
  const selected = ALLOWED_SOURCES.has(String(preferred || "")) ? String(preferred) : "pexels";
  if (selected === "local") return ["local"];
  const configured = Array.isArray(materials.fallbackOrder) ? materials.fallbackOrder : [];
  if (!configured.length) {
    throw new Error("MoneyPrinterTurbo 素材 API 尚未配置：Pexels、Pixabay、Coverr 均没有可用 API Key。");
  }
  return [selected, ...configured].filter((source, index, all) => configured.includes(source) && all.indexOf(source) === index);
}

async function createManagedTask(status, payload, materialSources) {
  const managed = {
    id: `dy-mpt-${randomUUID()}`,
    payload: { ...payload },
    materialSources: [...materialSources],
    sourceIndex: 0,
    officialTaskId: "",
    attempts: [],
    createdAt: new Date().toISOString(),
  };
  managed.officialTaskId = await submitOfficialTask(status, managed.payload);
  managedTasks.set(managed.id, managed);
  return managed;
}

async function submitOfficialTask(status, payload) {
  const result = await fetchMptJson(`${status.api.v1BaseUrl}/videos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (Number(result?.status || 0) !== 200 || !result?.data?.task_id) {
    throw new Error(result?.message || "MoneyPrinterTurbo 创建任务失败。");
  }
  return String(result.data.task_id);
}

function managedTaskSnapshot(managed, overrides = {}) {
  return {
    task_id: managed.id,
    official_task_id: managed.officialTaskId,
    state: 4,
    progress: 0,
    stateLabel: "等待中",
    material_source: managed.materialSources[managed.sourceIndex] || "",
    material_sources: managed.materialSources,
    fallback_attempts: managed.attempts,
    ...overrides,
  };
}

async function pollManagedTask(status, managed) {
  const result = await fetchMptJson(`${status.api.v1BaseUrl}/tasks/${encodeURIComponent(managed.officialTaskId)}`);
  if (Number(result?.status || 0) !== 200) throw new Error(result?.message || "读取任务失败。");
  const official = normalizeTask(result.data || {}, status.api.baseUrl);
  const source = managed.materialSources[managed.sourceIndex] || managed.payload.video_source || "";
  if (official.state === TASK_STATE_FAILED && shouldTryNextMaterialSource(official, managed)) {
    managed.attempts.push({ source, taskId: managed.officialTaskId, error: sanitizeMptError(official.error || official.message || "素材获取失败") });
    managed.sourceIndex += 1;
    const nextSource = managed.materialSources[managed.sourceIndex];
    managed.payload = { ...managed.payload, video_source: nextSource };
    managed.officialTaskId = await submitOfficialTask(status, managed.payload);
    return managedTaskSnapshot(managed, {
      stateLabel: `切换到 ${nextSource}`,
      fallback_message: `${source} 素材失败，已自动切换到 ${nextSource}。`,
    });
  }
  const attempts = [...managed.attempts];
  if (official.state === TASK_STATE_FAILED && !attempts.some((item) => item.taskId === managed.officialTaskId)) {
    attempts.push({ source, taskId: managed.officialTaskId, error: sanitizeMptError(official.error || official.message || "任务失败") });
    managed.attempts = attempts;
  }
  return {
    ...official,
    task_id: managed.id,
    official_task_id: managed.officialTaskId,
    material_source: source,
    material_sources: managed.materialSources,
    fallback_attempts: attempts,
    error: official.state === TASK_STATE_FAILED
      ? attempts.map((item) => `${item.source}: ${item.error}`).join("；")
      : sanitizeMptError(official.error || ""),
  };
}

function shouldTryNextMaterialSource(task, managed) {
  if (managed.sourceIndex >= managed.materialSources.length - 1) return false;
  const stage = String(task.failed_stage || "").toLowerCase();
  const error = String(task.error || task.message || "").toLowerCase();
  return stage === "materials"
    || Number(task.progress || 0) === 40
    || /pexels|pixabay|coverr|material|素材|api[_ ]keys?/.test(error);
}

function sanitizeMptError(value) {
  const text = String(value || "").replace(/\u001b\[[0-9;]*m/g, "").trim();
  const missingKey = /(pexels|pixabay|coverr)_api_keys? is not set/i.exec(text);
  if (missingKey) return `${missingKey[1][0].toUpperCase()}${missingKey[1].slice(1)} 素材 API Key 未配置`;
  return text
    .replace(/("[^"\r\n]*(?:key|secret|token)[^"\r\n]*"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/\s+/g, " ")
    .slice(0, 800) || "未知错误";
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
  const customAudioFile = String(body.custom_audio_file || body.audio_path || "").trim();
  if (customAudioFile) {
    payload.custom_audio_file = customAudioFile;
    payload.subtitle_enabled = body.subtitle_enabled === true;
  }
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
  const taskId = task.task_id || "";
  const localPaths = localTaskPaths(task, taskId);
  return {
    ...task,
    state,
    stateLabel: state === TASK_STATE_COMPLETE ? "已完成" : state === TASK_STATE_FAILED ? "失败" : state === TASK_STATE_PROCESSING ? "生成中" : "等待中",
    progress: Number(task.progress || 0),
    videos: normalizeTaskUrls(task.videos, apiBaseUrl),
    combined_videos: normalizeTaskUrls(task.combined_videos, apiBaseUrl),
    localVideos: localPaths.videos,
    localCombinedVideos: localPaths.combinedVideos,
    localMaterials: localPaths.materials,
  };
}

function localTaskPaths(task, taskId = "") {
  const convert = (items) => (Array.isArray(items) ? items : [])
    .map((item) => String(item || ""))
    .filter(Boolean)
    .map((item) => {
      if (path.isAbsolute(item)) return item;
      const match = item.match(/\/tasks\/([^/]+)\/([^?#]+)/);
      if (match) return path.join("storage", "tasks", match[1], decodeURIComponent(match[2]));
      if (taskId && !/^https?:\/\//i.test(item)) return path.join("storage", "tasks", taskId, item);
      return "";
    })
    .filter(Boolean);
  return {
    videos: convert(task.videos),
    combinedVideos: convert(task.combined_videos),
    materials: convert(task.materials),
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

async function renderFinalVideo(body = {}, context = {}) {
  if (!context.ffmpegPath || !fs.existsSync(context.ffmpegPath)) throw new Error("没有找到 ffmpeg，无法合成最终视频。");
  const tts = body.tts && typeof body.tts === "object" ? body.tts : {};
  const audioPath = String(body.audio_path || tts.audio_path || tts.audioPath || "").trim();
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error("缺少已确认 TTS 音频文件，无法合成。");
  const segments = normalizeRenderSegments(body.segments || body.timeline || tts.sentence_timeline || tts.subtitle_timeline);
  if (!segments.length) throw new Error("缺少已确认时间戳字幕，无法合成。");
  const backgroundPath = resolveMptFilePath(body.background_video || body.backgroundVideo || body.combined_video || firstLocalCombinedVideo(body.task), context.rootDir);
  if (!backgroundPath || !fs.existsSync(backgroundPath)) throw new Error("缺少 MoneyPrinterTurbo 混剪背景视频，请先完成素材匹配预览。");

  const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
  const effectId = normalizeEffectId(settings.effectId);
  const project = {
    id: `money-printer-${Date.now()}`,
    title: String(body.title || tts.title || "MoneyPrinter 视频").trim() || "MoneyPrinter 视频",
    text: String(body.text || tts.final_text || tts.text || segments.map((item) => item.text).join("")).trim(),
    duration: Math.max(...segments.map((item) => Number(item.end || 0)), Number(tts.audio_duration || tts.duration || 0), 0.5),
    audioPath,
    segments,
    effectId,
    effectParams: { ...defaultEffectParams(effectId), ...(settings.effectParams || {}) },
    aspectRatio: ALLOWED_ASPECTS.has(String(settings.aspectRatio || "")) ? String(settings.aspectRatio) : "9:16",
    frameRate: Number(settings.frameRate) === 60 ? 60 : 30,
    showBottomSubtitles: settings.showBottomSubtitles !== false,
    bottomSubtitlePosition: settings.bottomSubtitlePosition || { x: 50, y: 94 },
    bookends: settings.bookends || {},
  };

  const runId = `mpt-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const runDir = path.join(context.workflowDir, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const assPath = path.join(runDir, "dynamic-subtitles.ass");
  fs.writeFileSync(assPath, buildAss(project), "utf8");
  fs.writeFileSync(path.join(runDir, "manifest.json"), `${JSON.stringify({ project, backgroundPath, sourceTask: body.task || {} }, null, 2)}\n`, "utf8");

  const outputDir = context.downloadsDir || process.cwd();
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = uniqueOutputPath(path.join(outputDir, `${safeFileName(project.title, "moneyprinter-video")}.mp4`));
  const { width, height } = outputSize(project.aspectRatio);
  const duration = await probeDuration(context.ffprobePath, audioPath) || project.duration;
  const ttsVolume = clampFloat(settings.ttsVolume, 0, 2, 1);
  const args = [
    "-y",
    "-stream_loop", "-1", "-i", backgroundPath,
    "-i", audioPath,
    "-filter_complex",
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${project.frameRate},subtitles='${escapeFilterPath(assPath)}'[v];[1:a]volume=${ttsVolume.toFixed(3)}[a]`,
    "-map", "[v]",
    "-map", "[a]",
    "-t", Math.max(0.5, duration).toFixed(3),
    "-r", String(project.frameRate),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "19",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outputPath,
  ];
  await spawnLogged(context.ffmpegPath, args);
  return {
    id: runId,
    outputPath,
    assPath,
    manifestPath: path.join(runDir, "manifest.json"),
    title: project.title,
  };
}

function normalizeRenderSegments(value) {
  return (Array.isArray(value) ? value : [])
    .map((item, index) => {
      const start = safeNumber(item.start ?? item.start_time ?? item.startTime, NaN);
      const end = safeNumber(item.end ?? item.end_time ?? item.endTime, NaN);
      const text = String(item.text || item.sentence || item.subtitle || item.sourceText || "").trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return null;
      return {
        id: String(item.id || `mpt-segment-${index + 1}`),
        start,
        end,
        text,
        keywords: Array.isArray(item.keywords) ? item.keywords : inferKeywords(text),
        words: Array.isArray(item.words) ? item.words : [],
        sourceSegmentId: item.sourceSegmentId || "",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function inferKeywords(text) {
  const source = String(text || "").replace(/[，。！？；：、,.!?;:\s]/gu, " ");
  const words = source.match(/[A-Za-z0-9%]+|[\u4e00-\u9fff]{2,6}/gu) || [];
  return [...new Set(words.map((item) => item.trim()).filter((item) => item.length >= 2))].slice(0, 2);
}

function firstLocalCombinedVideo(task = {}) {
  const combined = Array.isArray(task.localCombinedVideos) && task.localCombinedVideos.length
    ? task.localCombinedVideos
    : Array.isArray(task.combined_videos)
      ? task.combined_videos
      : [];
  return combined[0] || "";
}

function resolveMptFilePath(value, rootDir) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (path.isAbsolute(raw)) return path.normalize(raw);
  const decoded = decodeURIComponent(raw);
  const taskMatch = decoded.match(/\/tasks\/([^/?#]+)\/([^?#]+)/);
  if (taskMatch) return path.join(rootDir, "storage", "tasks", taskMatch[1], taskMatch[2]);
  if (/^https?:\/\//i.test(decoded)) {
    try {
      const parsed = new URL(decoded);
      const match = parsed.pathname.match(/\/tasks\/([^/]+)\/([^/]+)$/);
      if (match) return path.join(rootDir, "storage", "tasks", match[1], decodeURIComponent(match[2]));
    } catch {}
    return "";
  }
  return path.resolve(rootDir, decoded);
}

function outputSize(aspectRatio) {
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

async function probeDuration(ffprobePath, filePath) {
  if (!ffprobePath || !fs.existsSync(ffprobePath) || !filePath || !fs.existsSync(filePath)) return 0;
  try {
    const output = await spawnLogged(ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath]);
    return clampFloat(output.trim(), 0, Number.POSITIVE_INFINITY, 0);
  } catch {
    return 0;
  }
}

function spawnLogged(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const output = [];
    const onData = (chunk) => {
      const text = chunk.toString("utf8");
      output.push(text);
      for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) appendLog(line);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output.join(""));
      else reject(new Error(`命令执行失败(${code})：${output.join("").slice(-1600)}`));
    });
  });
}

function sendFile(res, filePath, { download = false } = {}) {
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Content-Length": stat.size,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".ass") return "text/plain; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function escapeFilterPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function safeFileName(value, fallback = "file") {
  const clean = String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").trim();
  return clean.slice(0, 120) || fallback;
}

function uniqueOutputPath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  for (let index = 2; index < 1000; index += 1) {
    const next = path.join(dir, `${base}-${index}${ext}`);
    if (!fs.existsSync(next)) return next;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}
