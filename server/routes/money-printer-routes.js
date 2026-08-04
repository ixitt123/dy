import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { HttpBodyError, readJsonBody } from "../utils/http-body.js";
import { buildAss, safeNumber } from "../kinetic-text/kinetic-text-service.js";
import { KINETIC_TEXT_EFFECTS, defaultEffectParams, normalizeEffectId } from "../kinetic-text/effects.js";
import { createMoneyPrinterStore } from "../core/money-printer-store.js";

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
const MAX_OPEN_URL_LENGTH = 2048;

let apiProcess = null;
let apiStartPromise = null;
const apiLogs = [];
export function createMoneyPrinterRoutes({ baseDir, sendJson, ffmpegPath, ffprobePath, getDownloadsDir, modelRouter, ttsHandoffService, finalAssetRegistry = null }) {
  const defaultRoot = path.resolve(process.env.MONEY_PRINTER_TURBO_ROOT || path.join(baseDir, "integrations", "moneyprinterturbo"));
  const workflowDir = path.join(baseDir, ".data", "money-printer");
  const moneyPrinterStore = createMoneyPrinterStore(baseDir);
  const materialSearchPrompt = readOptionalText(path.join(baseDir, "prompts", "money-printer-material-search.md"));
  if (finalAssetRegistry) {
    for (const record of moneyPrinterStore.listRenderedFiles()) {
      if (!record.filePath || !fs.existsSync(record.filePath)) continue;
      const finalAsset = finalAssetRegistry.register({
        filePath: record.filePath,
        kind: "video",
        source: "money-printer",
        sourceRef: record.id,
        metadata: { ...(record.metadata || {}), discoveredFromHistory: true },
      });
      if (record.metadata?.assetId !== finalAsset.assetId) {
        moneyPrinterStore.saveRenderedFile(record.id, { ...record, metadata: { ...(record.metadata || {}), assetId: finalAsset.assetId } });
      }
    }
  }

  const handleMoneyPrinterRoutes = async function handleMoneyPrinterRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/money-printer/")) return false;
    const route = url.pathname.replace("/api/money-printer/", "");

    if (req.method === "GET" && route === "status") {
      const status = await buildStatus(defaultRoot);
      sendJson(res, 200, {
        ok: true,
        ...status,
        downloadDir: typeof getDownloadsDir === "function" ? getDownloadsDir() : path.join(baseDir, "downloads"),
      });
      return true;
    }

    if (req.method === "GET" && route === "effects") {
      sendJson(res, 200, { ok: true, effects: KINETIC_TEXT_EFFECTS });
      return true;
    }

    if (req.method === "GET" && route === "file") {
      const id = String(url.searchParams.get("id") || "").trim();
      const record = id ? moneyPrinterStore.getRenderedFile(id) : null;
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
        sendJson(res, 200, {
          ok: true,
          ...status,
          downloadDir: typeof getDownloadsDir === "function" ? getDownloadsDir() : path.join(baseDir, "downloads"),
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error), logs: apiLogs.slice(-80) });
      }
      return true;
    }

    if (req.method === "POST" && route === "render-final") {
      try {
        const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
        const status = await buildStatus(defaultRoot);
        const trustedBody = applyTrustedMoneyPrinterBgm(body, ttsHandoffService);
        const result = await renderFinalVideo(trustedBody, {
          rootDir: status.root,
          workflowDir,
          downloadsDir: typeof getDownloadsDir === "function" ? getDownloadsDir() : path.join(baseDir, "downloads"),
          ffmpegPath,
          ffprobePath,
        });
        const finalAsset = finalAssetRegistry?.register({
          filePath: result.outputPath,
          kind: "video",
          source: "money-printer",
          sourceRef: result.id,
          metadata: { title: result.title, manifestPath: result.manifestPath, bgmMixed: result.bgmMixed === true },
        });
        moneyPrinterStore.saveRenderedFile(result.id, {
          filePath: result.outputPath,
          createdAt: new Date().toISOString(),
          metadata: { title: result.title, manifestPath: result.manifestPath, bgmMixed: result.bgmMixed === true, assetId: finalAsset?.assetId || "" },
        });
        sendJson(res, 200, {
          ok: true,
          ...result,
          assetId: finalAsset?.assetId || "",
          videoUrl: finalAsset?.videoUrl || `/api/money-printer/file?id=${encodeURIComponent(result.id)}`,
          downloadUrl: finalAsset?.downloadUrl || `/api/money-printer/file?id=${encodeURIComponent(result.id)}&download=1`,
        });
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
        const materialMode = normalizeMaterialMode(body.material_mode);
        const materialPlan = materialMode === "fast"
          ? buildFastMaterialPlan(body.video_term_segments)
          : null;
        const plannedBody = materialPlan?.groups?.length
          ? {
              ...body,
              video_terms: materialPlan.groups.map((group) => group.searchTerm),
              video_term_texts: materialPlan.groups.map((group) => group.text),
              video_clip_duration: materialPlan.clipDuration,
            }
          : body;
        const payload = buildGeneratePayload({ ...plannedBody, video_source: materialSources[0] });
        if (payload.bgm_type === "custom" && payload.bgm_file) {
          payload.bgm_file = stageTtsBgmForMoneyPrinter({
            sourcePath: payload.bgm_file,
            ttsAudioRoot: path.join(baseDir, ".data", "tts", "audio"),
            moneyPrinterRoot: status.root,
          });
        }
        if (materialMode === "fast" || shouldRefineTerms(payload.video_terms)) {
          try {
            const refined = await refineVideoTermsWithLlm({
              modelRouter,
              terms: payload.video_terms,
              script: payload.video_script,
              subject: payload.video_subject,
              termTexts: Array.isArray(plannedBody.video_term_texts) ? plannedBody.video_term_texts : null,
              promptGuide: materialSearchPrompt,
            });
            if (refined) payload.video_terms = refined;
          } catch (refineError) {
            // 关键词提炼失败不阻塞生成，继续用前端正则映射的原词
            console.warn(`[MoneyPrinter] LLM 关键词提炼失败，沿用原始搜索词: ${refineError instanceof Error ? refineError.message : String(refineError)}`);
          }
        }
        if (materialPlan?.groups?.length) {
          materialPlan.groups.forEach((group, index) => {
            group.searchTerm = payload.video_terms?.[index] || group.searchTerm;
          });
        }
        const managed = await createManagedTask(status, payload, materialSources, {
          materialMode,
          materialPlan,
        }, moneyPrinterStore);
        sendJson(res, 202, {
          ok: true,
          task: managedTaskSnapshot(managed),
          payload,
          materialMode,
          materialPlan,
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
        const managed = moneyPrinterStore.getManagedTask(taskId);
        if (managed) {
          const task = await pollManagedTask(status, managed, moneyPrinterStore);
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
        const status = {
          ...(await buildStatus(defaultRoot)),
          downloadDir: typeof getDownloadsDir === "function" ? getDownloadsDir() : path.join(baseDir, "downloads"),
        };
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
  return handleMoneyPrinterRoutes;
}

export function applyTrustedMoneyPrinterBgm(body = {}, ttsHandoffService = null) {
  const tts = body.tts && typeof body.tts === "object" ? body.tts : {};
  const includeBgm = body.includeBgm === true;
  if (!includeBgm) {
    return { ...body, includeBgm: false, bgm_file: "", bgm_path: "", bgm_volume: 0 };
  }
  const handoffId = String(body.handoff_id || tts.handoff_id || "").trim();
  const revision = String(body.revision || body.handoff_revision || tts.handoff_revision || tts.revision || "").trim();
  if (!handoffId || !revision || typeof ttsHandoffService?.get !== "function") {
    throw new Error("最终 BGM 请求缺少可验证的 handoff ID 或 revision。");
  }
  const handoff = ttsHandoffService.get(handoffId);
  if (!handoff || !handoff.targets?.includes("money-printer")) {
    throw new Error("当前 handoff 不存在或未发送给 MoneyPrinter。");
  }
  if (handoff.revision !== revision) throw new Error("最终 BGM 请求 revision 与已确认 handoff 不一致。");
  const trustedPath = String(handoff.payload?.bgm_path || "").trim();
  const requestedPath = String(body.bgm_file || body.bgm_path || "").trim();
  if (!trustedPath || !requestedPath || path.resolve(trustedPath).toLowerCase() !== path.resolve(requestedPath).toLowerCase()) {
    throw new Error("最终 BGM 路径不是当前 handoff 的受信任资产。");
  }
  const trustedVolume = clampFloat(handoff.payload?.bgm_volume, 0, 1, 0.18);
  const requestedVolume = Number(body.bgm_volume);
  if (!Number.isFinite(requestedVolume) || Math.abs(requestedVolume - trustedVolume) > 0.000001) {
    throw new Error("最终 BGM 音量与已确认 handoff 不一致。");
  }
  return {
    ...body,
    handoff_id: handoff.id,
    revision: handoff.revision,
    includeBgm: true,
    bgm_file: trustedPath,
    bgm_path: trustedPath,
    bgm_volume: trustedVolume,
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

export function readMaterialProviderStatus(configPath) {
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

export function resolveMaterialSourceOrder(preferred, materials = {}) {
  const selected = ALLOWED_SOURCES.has(String(preferred || "")) ? String(preferred) : "pexels";
  if (selected === "local") return ["local"];
  const configured = Array.isArray(materials.fallbackOrder) ? materials.fallbackOrder : [];
  if (!configured.length) {
    throw new Error("MoneyPrinterTurbo 素材 API 尚未配置：Pexels、Pixabay、Coverr 均没有可用 API Key。");
  }
  return [selected, ...configured].filter((source, index, all) => configured.includes(source) && all.indexOf(source) === index);
}

async function createManagedTask(status, payload, materialSources, options = {}, store) {
  const managed = {
    id: `dy-mpt-${randomUUID()}`,
    payload: { ...payload },
    materialSources: [...materialSources],
    sourceIndex: 0,
    officialTaskId: "",
    attempts: [],
    createdAt: new Date().toISOString(),
    materialMode: normalizeMaterialMode(options.materialMode),
    materialPlan: options.materialPlan || null,
    runtime: {},
  };
  managed.officialTaskId = await submitOfficialTask(status, managed.payload);
  store.saveManagedTask(managed);
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
    material_mode: managed.materialMode || "standard",
    material_plan: managed.materialPlan || null,
    ...overrides,
  };
}

async function pollManagedTask(status, managed, store) {
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
    managed.runtime = {};
    store.saveManagedTask(managed);
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
  managed.runtime = updateMoneyPrinterTaskRuntime(managed.runtime, official);
  const presentation = moneyPrinterTaskPresentation(official, managed.runtime);
  store.saveManagedTask(managed);
  return {
    ...official,
    ...presentation,
    task_id: managed.id,
    official_task_id: managed.officialTaskId,
    material_source: source,
    material_sources: managed.materialSources,
    fallback_attempts: attempts,
    material_mode: managed.materialMode || "standard",
    material_plan: managed.materialPlan || null,
    error: official.state === TASK_STATE_FAILED
      ? attempts.map((item) => `${item.source}: ${item.error}`).join("；")
      : sanitizeMptError(official.error || ""),
  };
}

export function updateMoneyPrinterTaskRuntime(previous = {}, task = {}, now = new Date()) {
  const observedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const progress = Number(task.progress || 0);
  const state = Number(task.state || 0);
  const progressChanged = Number(previous.lastProgress) !== progress || Number(previous.lastState) !== state;
  return {
    lastProgress: progress,
    lastState: state,
    progressChangedAt: progressChanged || !previous.progressChangedAt ? observedAt : previous.progressChangedAt,
    lastPolledAt: observedAt,
  };
}

export function moneyPrinterTaskPresentation(task = {}, runtime = {}, now = Date.now()) {
  const state = Number(task.state || 0);
  const progress = Math.max(0, Math.min(100, Number(task.progress || 0)));
  const changedAtMs = Date.parse(String(runtime.progressChangedAt || runtime.lastPolledAt || ""));
  const unchangedSeconds = Number.isFinite(changedAtMs) ? Math.max(0, Math.floor((Number(now) - changedAtMs) / 1000)) : 0;
  const common = {
    heartbeat_at: String(runtime.lastPolledAt || ""),
    progress_changed_at: String(runtime.progressChangedAt || ""),
    progress_unchanged_seconds: unchangedSeconds,
  };
  if (state === TASK_STATE_FAILED) {
    const failedStage = String(task.failed_stage || "").toLowerCase();
    const stageLabel = failedStage === "materials" ? "素材准备" : failedStage === "video" ? "视频合成" : failedStage ? failedStage : "未知阶段";
    return { ...common, status_kind: "failed", processing_stage: failedStage, stateLabel: `任务已经失败 · ${stageLabel}` };
  }
  if (state === TASK_STATE_COMPLETE) {
    return { ...common, status_kind: "complete", processing_stage: "complete", stateLabel: "已完成" };
  }
  if (state === TASK_STATE_PROCESSING && progress >= 50) {
    return {
      ...common,
      status_kind: "processing",
      processing_stage: "video",
      stateLabel: "视频合成仍在进行",
      activity_message: unchangedSeconds > 0
        ? `任务服务心跳正常；当前百分比已 ${unchangedSeconds} 秒未变化，长视频 FFmpeg 合成可能需要较长时间。`
        : "任务服务心跳正常；正在进入视频 FFmpeg 合成阶段。",
    };
  }
  return { ...common, status_kind: "processing", processing_stage: progress >= 40 ? "materials" : "preparing", stateLabel: "生成中" };
}

export function shouldTryNextMaterialSource(task, managed) {
  if (managed.sourceIndex >= managed.materialSources.length - 1) return false;
  const stage = String(task.failed_stage || "").toLowerCase();
  const error = String(task.error || task.message || "").toLowerCase();
  return stage === "materials"
    || Number(task.progress || 0) === 40
    || /pexels|pixabay|coverr|material|素材|api[_ ]keys?/.test(error);
}

export function sanitizeMptError(value) {
  const text = String(value || "").replace(/\u001b\[[0-9;]*m/g, "").trim();
  if (!text) return "";
  const missingKey = /(pexels|pixabay|coverr)_api_keys? is not set/i.exec(text);
  if (missingKey) return `${missingKey[1][0].toUpperCase()}${missingKey[1].slice(1)} 素材 API Key 未配置`;
  return text
    .replace(/("[^"\r\n]*(?:key|secret|token)[^"\r\n]*"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/\s+/g, " ")
    .slice(0, 800);
}

export function stageTtsBgmForMoneyPrinter({ sourcePath, ttsAudioRoot, moneyPrinterRoot }) {
  const source = path.resolve(String(sourcePath || ""));
  const allowedRoot = path.resolve(String(ttsAudioRoot || ""));
  const relativeSource = path.relative(allowedRoot, source);
  if (!sourcePath || !ttsAudioRoot) {
    throw new Error("TTS BGM 缺少源文件或受信任音频目录。");
  }
  if (!relativeSource || relativeSource === ".." || relativeSource.startsWith(`..${path.sep}`) || path.isAbsolute(relativeSource)) {
    throw new Error("TTS BGM 文件不在允许的音频目录中。");
  }
  const extension = path.extname(source).toLowerCase();
  if (!new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]).has(extension) || !fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error("TTS BGM 文件不存在或格式不受支持。");
  }
  const targetDir = path.join(path.resolve(String(moneyPrinterRoot || "")), "storage", "bgm");
  fs.mkdirSync(targetDir, { recursive: true });
  const stagedName = `tts-bgm-${randomUUID()}${extension}`;
  fs.copyFileSync(source, path.join(targetDir, stagedName));
  return stagedName;
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
    video_clip_duration: clampInteger(body.video_clip_duration, 1, 20, 5),
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

// 前端 automaticSearchTerm 用 9 条中文正则把字幕映射到固定英文词组，
// 命中不了就统一兜底 "daily life people"，导致大量段落撞同一关键词、
// 素材雷同且与文案语义无关。这里在提交 MPT 前用 LLM 逐段提炼 2-4 词的
// 英文搜索词；LLM 不可用时回退前端原词，不阻塞生成流程。
const FALLBACK_SEARCH_TERMS = new Set([
  "daily life people",
  "city daily life people",
]);

function shouldRefineTerms(terms) {
  if (!Array.isArray(terms) || !terms.length) return false;
  const unique = new Set(terms.map((item) => String(item).toLowerCase()));
  const fallbackCount = terms.filter((item) => FALLBACK_SEARCH_TERMS.has(String(item).toLowerCase())).length;
  // 去重后种类过少，或超过 1/4 段落撞兜底词，都说明关键词区分度不够
  return unique.size <= Math.max(2, Math.ceil(terms.length / 3)) || fallbackCount >= Math.ceil(terms.length / 4);
}

async function refineVideoTermsWithLlm({ modelRouter, terms, script, subject, termTexts, promptGuide = "" }) {
  if (!modelRouter || typeof modelRouter.generate !== "function") return null;
  if (!Array.isArray(terms) || !terms.length) return null;
  // 优先用前端按字幕时间轴切好的段文本（与 terms 严格同序对齐）；
  // 没有时再退化为按标点断句（段数可能与 terms 不一致，靠下标兜底）。
  const sentences = (Array.isArray(termTexts) && termTexts.length
    ? termTexts
    : String(script || "").split(/[\n。！？!?.；;]+/)
  )
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (!sentences.length) return null;

  const prompt = [
    promptGuide,
    subject ? `视频主题：${subject}` : "",
    `以下是短视频口播文案的 ${sentences.length} 个字幕段落：`,
    ...sentences.map((sentence, index) => `${index + 1}. ${sentence}`),
    "",
    "请为每个段落提炼一条英文视频素材搜索词（用于 Pexels 素材库检索）。要求：",
    "1. 每条 2-4 个英文单词，描述与该段文案语义相关的画面；",
    "2. 必须是 Pexels 上真实常见素材类别（人物、场景、动作、物品），避免抽象概念；",
    "3. 段落之间搜索词尽量不重复，体现叙事推进；",
    "4. 只输出 JSON 数组，不要输出其他内容。数组长度必须与段落数一致。",
    '示例输出：["mother helping child homework","frustrated student desk","teacher explaining math"]',
  ].filter(Boolean).join("\n");

  const result = await modelRouter.generate({
    taskType: "director",
    messages: [{ role: "user", content: prompt }],
    options: { temperature: 0.3 },
  });
  const content = String(result?.content || "").trim();
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("LLM 未返回 JSON 数组");
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("LLM 返回空关键词数组");

  const refined = parsed
    .map((item) => String(item || "").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim())
    .map((item) => (item.split(" ").length > 6 ? item.split(" ").slice(0, 6).join(" ") : item));

  // LLM 返回条数与字幕段数可能不一致：以原 terms 为底，逐段覆盖有效提炼词，
  // 保证最终数组长度与段落数严格一致（MPT 按段序匹配素材）。
  return terms.map((original, index) => refined[index] || original);
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
    failed_stage: String(task.failed_stage || ""),
    error: sanitizeMptError(task.error || ""),
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

export function sanitizeMoneyPrinterTaskVideoUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_OPEN_URL_LENGTH) return "";
  if (/[\u0000-\u001f\u007f\s\\`"'<>|;]/.test(raw)) return "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (parsed.username || parsed.password) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

export function openTarget(target, status, body = {}) {
  if (target === "root") return status.root;
  if (target === "docs") return status.api.docsUrl;
  if (target === "api") return status.api.baseUrl;
  if (target === "webui") return status.webui.baseUrl;
  if (target === "downloads") return status.downloadDir || "";
  if (target === "task-video") return sanitizeMoneyPrinterTaskVideoUrl(body.url);
  if (target === "tasks") {
    const root = String(status.root || "");
    const pathApi = /^[a-z]:[\\/]/i.test(root)
      ? path.win32
      : root.startsWith("/")
        ? path.posix
        : path;
    return pathApi.join(root, "storage", "tasks");
  }
  return "";
}

function normalizeMaterialMode(value) {
  return String(value || "").trim().toLowerCase() === "fast" ? "fast" : "standard";
}

export function buildFastMaterialPlan(value) {
  const segments = (Array.isArray(value) ? value : [])
    .map((item, index) => {
      const start = safeNumber(item?.start, NaN);
      const end = safeNumber(item?.end, NaN);
      const text = String(item?.text || "").trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return null;
      return {
        index,
        start,
        end,
        text,
        searchTerm: String(item?.searchTerm || "").trim() || "daily life people",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  if (!segments.length) return { mode: "fast", clipDuration: 15, groups: [] };

  const timelineStart = segments[0].start;
  const timelineEnd = Math.max(...segments.map((item) => item.end));
  const totalDuration = Math.max(1, timelineEnd - timelineStart);
  const desiredGroups = Math.max(1, Math.ceil(totalDuration / 18));
  const targetDuration = totalDuration / desiredGroups;
  const buckets = Array.from({ length: desiredGroups }, () => []);

  for (const segment of segments) {
    const midpoint = (segment.start + segment.end) / 2;
    const bucketIndex = Math.min(
      desiredGroups - 1,
      Math.max(0, Math.floor((midpoint - timelineStart) / targetDuration)),
    );
    buckets[bucketIndex].push(segment);
  }

  const groups = buckets.filter((bucket) => bucket.length).map((bucket, index) => {
    const uniqueTerms = [...new Set(bucket.map((item) => item.searchTerm).filter(Boolean))];
    return {
      id: `fast-scene-${index + 1}`,
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      text: bucket.map((item) => item.text).join(""),
      searchTerm: uniqueTerms[0] || "daily life people",
      segmentIndexes: bucket.map((item) => item.index),
    };
  });
  const clipDuration = clampInteger(Math.ceil(totalDuration / Math.max(1, groups.length)), 12, 20, 15);
  return { mode: "fast", clipDuration, groups };
}

export function openExternalCommand(target, platform = process.platform) {
  if (platform === "win32") return { command: "explorer.exe", args: [target] };
  return { command: platform === "darwin" ? "open" : "xdg-open", args: [target] };
}

function openExternal(target) {
  const { command, args } = openExternalCommand(target);
  spawn(command, args, { windowsHide: true, detached: true, stdio: "ignore", shell: false }).unref();
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

export async function renderFinalVideo(body = {}, context = {}) {
  if (!context.ffmpegPath || !fs.existsSync(context.ffmpegPath)) throw new Error("没有找到 ffmpeg，无法合成最终视频。");
  const tts = body.tts && typeof body.tts === "object" ? body.tts : {};
  const audioPath = String(body.audio_path || tts.audio_path || tts.audioPath || "").trim();
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error("缺少已确认 TTS 音频文件，无法合成。");
  const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
  const textEffectEnabled = settings.textEffectEnabled === true;
  const showBottomSubtitles = settings.showBottomSubtitles !== false;
  const subtitleTrackEnabled = textEffectEnabled || showBottomSubtitles;
  const segments = normalizeRenderSegments(body.segments || body.timeline || tts.sentence_timeline || tts.subtitle_timeline);
  if (subtitleTrackEnabled && !segments.length) throw new Error("开启文字或底部字幕时必须提供已确认时间戳字幕。");
  const backgroundPath = resolveMptFilePath(body.background_video || body.backgroundVideo || body.combined_video || firstLocalCombinedVideo(body.task), context.rootDir);
  if (!backgroundPath || !fs.existsSync(backgroundPath)) throw new Error("缺少 MoneyPrinterTurbo 混剪背景视频，请先完成素材匹配预览。");

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
    showBottomSubtitles,
    textEffectEnabled,
    bottomSubtitlePosition: settings.bottomSubtitlePosition || { x: 50, y: 94 },
    bookends: settings.bookends || {},
  };

  const runId = `mpt-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const runDir = path.join(context.workflowDir, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const assPath = subtitleTrackEnabled ? path.join(runDir, "dynamic-subtitles.ass") : "";
  if (assPath) {
    fs.writeFileSync(assPath, buildAss(project, {
      includeMainText: textEffectEnabled,
      includeBookends: textEffectEnabled,
    }), "utf8");
  }
  fs.writeFileSync(path.join(runDir, "manifest.json"), `${JSON.stringify({ project, backgroundPath, sourceTask: body.task || {} }, null, 2)}\n`, "utf8");

  const outputDir = context.downloadsDir || process.cwd();
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = uniqueOutputPath(path.join(outputDir, `${safeFileName(project.title, "moneyprinter-video")}.mp4`));
  const { width, height } = outputSize(project.aspectRatio);
  const duration = await probeDuration(context.ffprobePath, audioPath) || project.duration;
  const ttsVolume = clampFloat(settings.ttsVolume, 0, 2, 1);
  // 05.03：解析 BGM 参数，最终 FFmpeg 合成混入独立 BGM（修复最终成片丢失 BGM）
  const bgmPath = resolveMptFilePath(body.bgm_file || body.bgm_path || body.bgm, context.rootDir);
  const bgmVolume = clampFloat(body.bgm_volume, 0, 1, 0.18);
  const hasBgm = Boolean(bgmPath) && fs.existsSync(bgmPath);
  const videoFilter = buildMoneyPrinterVideoFilter({
    width,
    height,
    frameRate: project.frameRate,
    textEffectEnabled,
    showBottomSubtitles,
    assPath,
  });
  // 音频滤镜：无 BGM 时只调 TTS 音量；有 BGM 时 TTS + BGM 混音（BGM 循环到 TTS 时长、淡出 2s、音量按 bgmVolume）
  let audioFilter;
  if (hasBgm) {
    const fadeInDuration = Math.min(0.5, Math.max(0.1, duration * 0.1));
    const fadeOutDuration = Math.min(2, Math.max(0.5, duration / 3));
    const fadeStart = Math.max(fadeInDuration, duration - fadeOutDuration);
    audioFilter = `[1:a]volume=${ttsVolume.toFixed(3)}[a1];[2:a]aloop=loop=-1:size=2e9,atrim=duration=${duration.toFixed(3)},asetpts=N/SR/TB,volume=${bgmVolume.toFixed(3)},afade=t=in:st=0:d=${fadeInDuration.toFixed(3)},afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeOutDuration.toFixed(3)}[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;
  } else {
    audioFilter = `[1:a]volume=${ttsVolume.toFixed(3)}[a]`;
  }
  const args = [
    "-y",
    "-stream_loop", "-1", "-i", backgroundPath,
    "-i", audioPath,
  ];
  if (hasBgm) {
    args.push("-i", bgmPath);
  }
  args.push(
    "-filter_complex",
    `${videoFilter};${audioFilter}`,
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
  );
  await spawnLogged(context.ffmpegPath, args);
  return {
    id: runId,
    outputPath,
    assPath,
    manifestPath: path.join(runDir, "manifest.json"),
    title: project.title,
    bgmMixed: hasBgm,
    bgmPath: hasBgm ? bgmPath : "",
  };
}

export function buildMoneyPrinterVideoFilter({
  width,
  height,
  frameRate,
  textEffectEnabled = false,
  showBottomSubtitles = false,
  assPath = "",
} = {}) {
  const base = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${frameRate}`;
  return (textEffectEnabled || showBottomSubtitles) && assPath
    ? `${base},subtitles='${escapeFilterPath(assPath)}'[v]`
    : `${base}[v]`;
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

function readOptionalText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
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
