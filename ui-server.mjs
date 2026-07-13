import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import WebSocket, { WebSocketServer } from "ws";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { openTaskStore, TASK_STATUS } from "./task-store.mjs";
import { createTtsService } from "./server/tts/tts-service.js";
import { createImageService } from "./server/image/image-service.js";
import modelRouter from "./server/core/model-router/model-router.js";
import { createSettingsCenter } from "./server/core/settings-center.js";
import { createTaskCenterV2 } from "./server/core/task-center.js";
import { providerRegistry } from "./server/core/provider-registry.js";
import { createAnalysisEngine } from "./server/core/analysis-engine.js";
import { createLegacyJianyingExporter } from "./server/core/jianying-exporter.js";
import { createCapcutCliAdapter } from "./server/core/capcut-cli/capcut-cli-adapter.js";
import { PipelineRunner } from "./server/core/pipeline-bus/PipelineRunner.js";
import { PipelineState } from "./server/core/pipeline-bus/PipelineState.js";
import { PIPELINE_EVENTS } from "./server/core/pipeline-bus/PipelineEvents.js";
import { createProjectCenter } from "./server/core/project-center.js";
import { generatePlatformTitles } from "./server/core/title-generator.js";
import { TTS_PROVIDER_LABELS } from "./server/tts/providers/index.js";
import { createVoiceAssetService } from "./server/voices/voice-asset-service.js";
import { createDirectorService } from "./server/director/director-service.js";
import { createVfoService } from "./server/vfo/vfo-service.js";
import { createVideoProductService } from "./server/video-product/video-product-service.js";
import { createVideoOutputRoutes } from "./server/routes/video-output-routes.js";
import { createCs1VideoRoutes } from "./server/routes/cs1-video-routes.js";
import { createIanXiaoheiRoutes } from "./server/routes/ian-xiaohei-routes.js";
import { createMoneyPrinterRoutes } from "./server/routes/money-printer-routes.js";
import { createYtDlpService } from "./server/core/yt-dlp-service.js";
import { HttpBodyError, readBody, readJsonBody } from "./server/utils/http-body.js";
import { DEFAULT_REWRITE_REFERENCE, REWRITE_DIRECTIONS, REWRITE_STYLES, REWRITE_VERSION_DEFS, REWRITE_VERSION_DEFAULTS } from "./server/config/rewrite-presets.js";
import { DEFAULT_MODEL_MAPPING, DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL, SETTINGS_TASKS } from "./server/config/model-defaults.js";
import { AUTO_MODEL_VALUE, REWRITE_PROVIDER_ORDER, REWRITE_PROVIDER_PRESETS } from "./server/config/provider-presets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.join(__dirname, "ui");
const skillsDir = path.join(__dirname, "skills");
const promptsDir = path.join(__dirname, "prompts");
const rewritesDir = path.join(__dirname, "rewrites");
const personasDir = path.join(__dirname, "personas");
const momentsPersonasPath = path.join(personasDir, "moments-personas.json");
const momentsMaterialsDir = path.join(__dirname, "assets", "moments-materials");
const momentsPublishDir = path.join(__dirname, ".data", "moments-publish");
const wechatMomentsPublisherScript = path.join(__dirname, "scripts", "wechat_moments_publish.py");
const referenceExamplesPath = path.join(__dirname, "reference_examples.json");
const defaultDownloadsDir = path.join(__dirname, "downloads");
const localMediaDir = path.join(__dirname, "local-media");
const pidPath = path.join(__dirname, "ui-server.pid");
const urlPath = path.join(__dirname, "ui-server.url");
const settingsPath = path.join(__dirname, "settings.json");
const ffprobePath = ffprobeStatic?.path || "";
const mcpEntry = path.join(
  __dirname,
  "node_modules",
  "@yc-w-cn",
  "douyin-mcp-server",
  "dist",
  "index.js"
);

function parseEnvFile(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) return values;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

const localEnv = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
].reduce((acc, name) => ({ ...acc, ...parseEnvFile(path.join(__dirname, name)) }), {});

function localConfigValue(keys = []) {
  for (const key of keys) {
    const value = String(process.env[key] || localEnv[key] || "").trim();
    if (value) return value;
  }
  return "";
}
const autoClose = process.argv.includes("--auto-close");
const pageSessions = new Map();
const activeChildProcesses = new Set();
const runningBatchTasks = new Set();
const activeBatchControllers = new Map();
let shutdownTimer = null;
let downloadsDir = defaultDownloadsDir;
downloadsDir = setDownloadsDir(readSettings().downloadsDir);
fs.mkdirSync(downloadsDir, { recursive: true });
fs.mkdirSync(rewritesDir, { recursive: true });
const ytDlpService = createYtDlpService({
  baseDir: __dirname,
  downloadsDir,
  getDownloadsDir: () => downloadsDir,
  getTypedDownloadsDir: (type) => downloadOutputDir(type),
  ffmpegPath,
  ffprobePath,
});
const taskStore = openTaskStore(__dirname);
taskStore.resetActiveTasks();
const projectCenter = createProjectCenter(__dirname);
let directorService;
const ttsService = createTtsService({
  baseDir: __dirname,
  taskStore,
  getSettings: readSettings,
  ffmpegPath,
  onJobCompleted: handleTtsJobCompleted,
});
const voiceAssetService = createVoiceAssetService({
  baseDir: __dirname,
  taskStore,
  ttsService,
  getSettings: readSettings,
  ffmpegPath,
});
directorService = createDirectorService({
  baseDir: __dirname,
  taskStore,
  generateJson: generateDirectorJson,
  onIdle: scheduleShutdownIfIdle,
  onProjectCompleted: handleDirectorProjectCompleted,
});
const vfoService = createVfoService({
  baseDir: __dirname,
  taskStore,
  directorService,
  generateJson: generateStructuredJson,
  onIdle: scheduleShutdownIfIdle,
});

// Image Studio
const imageService = createImageService({
  baseDir: __dirname,
  getSettings: readSettings,
  taskStore,
  ffmpegPath,
});

// VideoProject 是主项目；TimelineProject 作为每次成片输出记录回写到这里。
const capcutCliAdapter = createCapcutCliAdapter({
  baseDir: __dirname,
  ffmpegPath,
  getSettings: readSettings,
});

const videoProductService = createVideoProductService({
  baseDir: __dirname,
  taskStore,
  imageService,
  directorService,
  ffmpegPath,
  capcutCliAdapter,
  projectCenter,
  getSettings: readSettings,
  onProgress: (data) => broadcastProgress({ type: "video-product", ...data }),
  onIdle: scheduleShutdownIfIdle,
});

const handleVideoOutputRoutes = createVideoOutputRoutes({
  videoProductService,
  sendJson,
  sendBuffer,
});
const handleCs1VideoRoutes = createCs1VideoRoutes({
  baseDir: __dirname,
  sendJson,
  modelRouter,
  ffmpegPath,
  ffprobePath,
});
const handleMoneyPrinterRoutes = createMoneyPrinterRoutes({
  baseDir: __dirname,
  sendJson,
});
const handleIanXiaoheiRoutes = createIanXiaoheiRoutes({
  baseDir: __dirname,
  sendJson,
  imageService,
  modelRouter,
  ttsService,
  voiceAssetService,
  videoProductService,
  taskStore,
  getSettings: readSettings,
  ffmpegPath,
  ffprobePath,
  transcribeLocalMedia: transcribeLocalMediaWithDashScope,
});

// ModelRouter 统一模型路由
modelRouter.init(readSettings());

// ProviderRegistry 同步
providerRegistry.initFromModelRouter();

// 统一设置中心
const settingsCenter = createSettingsCenter(__dirname, settingsPath);

// 进度广播占位（WebSocket 初始化后赋值）
let broadcastProgress = () => {};

// 任务中心 2.0
const taskCenter = createTaskCenterV2(__dirname, {
  maxConcurrency: 3,
  onProgress: (data) => broadcastProgress({ type: "task", ...data }),
});

// 统一内容分析引擎
const analysisEngine = createAnalysisEngine(__dirname);

// 剪映导出器
const jianyingExporter = createLegacyJianyingExporter(__dirname);

// P0 流水线执行器
const pipelineState = new PipelineState(__dirname);
const pipelineRunner = new PipelineRunner({
  baseDir: __dirname,
  state: pipelineState,
  handlers: {},
});

// 流水线事件 → WebSocket 广播
for (const event of Object.values(PIPELINE_EVENTS)) {
  pipelineRunner._bus.on(event, (data) => {
    broadcastProgress({ type: "pipeline", event, ...data });
  });
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);
const downloadJobs = new Map();
const transcriptJobs = new Map();

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, body, contentType, fileName = "") {
  const headers = {
    "content-type": `${contentType}; charset=utf-8`,
    "content-length": Buffer.byteLength(body),
  };
  if (fileName) {
    headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }
  res.writeHead(status, headers);
  res.end(body);
}

function sendBuffer(res, status, buffer, contentType, fileName = "") {
  const headers = {
    "content-type": contentType,
    "content-length": buffer.length,
  };
  if (fileName) {
    headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }
  res.writeHead(status, headers);
  res.end(buffer);
}

function getFirstUrl(text) {
  return String(text || "").match(/https?:\/\/\S+/)?.[0] || "";
}

function isLikelyDouyinUrl(value) {
  try {
    const url = new URL(value);
    return /(^|\.)douyin\.com$/i.test(url.hostname) || /(^|\.)iesdouyin\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function cleanUrlToken(value) {
  return String(value || "")
    .trim()
    .replace(/[)"'，。；、！？!?\]]+$/g, "")
    .replace(/&amp;/g, "&");
}

function normalizeTaskUrl(value) {
  try {
    const url = new URL(cleanUrlToken(value));
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function inferTaskKind(value, fallback = "video") {
  if (fallback && fallback !== "auto") return fallback;
  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();
    if (pathname.includes("/user/") || pathname.includes("/share/user/")) return "account";
    if (pathname.includes("collection") || pathname.includes("mix") || pathname.includes("playlist")) return "collection";
    if (pathname.includes("comment")) return "comment";
  } catch {
    // Keep video as the conservative default.
  }
  return "video";
}

function extractDouyinUrls(text, { limit = 1000, kind = "video", taskAction = "download", transcriptEnabled = false, analysisEnabled = false, onlyTranscript = false } = {}) {
  const matches = String(text || "").match(/https?:\/\/[^\s"'<>]+/g) || [];
  const seen = new Set();
  const items = [];

  for (const match of matches) {
    const url = cleanUrlToken(match);
    const normalizedUrl = normalizeTaskUrl(url);
    if (!normalizedUrl || seen.has(normalizedUrl) || !isLikelyDouyinUrl(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    items.push({
      url,
      normalizedUrl,
      kind: inferTaskKind(normalizedUrl, kind),
      taskAction,
      sourceText: url,
      transcriptEnabled,
      analysisEnabled,
      onlyTranscript,
    });
    if (items.length >= limit) break;
  }

  return {
    items,
    discovered: seen.size,
    overflow: Math.max(0, matches.length - items.length),
  };
}

function extractAnyUrls(text, { limit = 1000, kind = "video", taskAction = "download", transcriptEnabled = false, audioEnabled = false, audioFormat = "mp3", analysisEnabled = false, onlyTranscript = false } = {}) {
  const matches = String(text || "").match(/https?:\/\/[^\s"'<>]+/g) || [];
  const seen = new Set();
  const items = [];

  for (const match of matches) {
    const url = cleanUrlToken(match);
    const normalizedUrl = normalizeTaskUrl(url);
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    items.push({
      url,
      normalizedUrl,
      kind: inferTaskKind(normalizedUrl, kind),
      taskAction,
      sourceText: url,
      transcriptEnabled,
      audioEnabled,
      audioFormat: ["mp3", "wav", "m4a"].includes(String(audioFormat || "").toLowerCase())
        ? String(audioFormat).toLowerCase()
        : "mp3",
      analysisEnabled,
      onlyTranscript,
    });
    if (items.length >= limit) break;
  }

  return {
    items,
    discovered: seen.size,
    overflow: Math.max(0, matches.length - items.length),
  };
}

function readSettings() {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    return normalizeSettings({});
  }
}

function writeSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(normalizeSettings(settings), null, 2), "utf8");
}

const DEFAULT_MOMENTS_PERSONA = {
  id: "academic-planner",
  name: "学业规划老师",
  description: "从事多年教培行业的规划老师，服务小学到高中学生家庭，也做高考志愿填报和出国留学规划。表达要真实可信，强调正常学习、长期陪伴、能力提升和效果可见，不夸张承诺，不制造焦虑。",
  updatedAt: "2026-07-13T00:00:00.000Z",
};

function safePersonaId(value = "") {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return cleaned || `persona-${Date.now().toString(36)}`;
}

function normalizeMomentsPersona(input = {}) {
  const name = String(input.name || "").trim().slice(0, 80);
  const description = String(input.description || input.text || "").trim().slice(0, 3000);
  if (!name) throw new Error("请填写人设名称。");
  if (!description) throw new Error("请填写人设说明。");
  return {
    id: safePersonaId(input.id || name),
    name,
    description,
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function readMomentsPersonas() {
  try {
    const parsed = JSON.parse(fs.readFileSync(momentsPersonasPath, "utf8"));
    const rawPersonas = Array.isArray(parsed?.personas) ? parsed.personas : Array.isArray(parsed) ? parsed : [];
    const normalized = rawPersonas
      .map((item) => {
        try {
          return normalizeMomentsPersona(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (!normalized.some((item) => item.id === DEFAULT_MOMENTS_PERSONA.id)) {
      normalized.unshift(DEFAULT_MOMENTS_PERSONA);
    }
    return normalized;
  } catch {
    return [DEFAULT_MOMENTS_PERSONA];
  }
}

function writeMomentsPersonas(personas = []) {
  fs.mkdirSync(personasDir, { recursive: true });
  const deduped = [];
  const seen = new Set();
  for (const persona of personas) {
    const normalized = normalizeMomentsPersona(persona);
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    deduped.push(normalized);
  }
  if (!deduped.some((item) => item.id === DEFAULT_MOMENTS_PERSONA.id)) {
    deduped.unshift(DEFAULT_MOMENTS_PERSONA);
  }
  fs.writeFileSync(momentsPersonasPath, JSON.stringify({ personas: deduped }, null, 2), "utf8");
  return deduped;
}

function decodeMomentsMaterialUpload(body = {}) {
  const raw = String(body.image_data || body.imageData || "").trim();
  const mime = String(body.image_mime || body.imageMime || "").trim().toLowerCase();
  const allowed = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
  };
  const dataUrlMatch = raw.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  const finalMime = (dataUrlMatch?.[1] || mime).toLowerCase();
  const base64 = dataUrlMatch ? dataUrlMatch[2] : raw.replace(/^data:image\/\w+;base64,/, "");
  const ext = allowed[finalMime];
  if (!ext) throw new Error("只支持 png / jpg / webp 图片素材。");
  if (!base64) throw new Error("缺少图片数据。");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw new Error("图片数据为空。");
  if (buffer.length > 12 * 1024 * 1024) throw new Error("单张素材不能超过 12MB。");
  return { buffer, ext, mime: finalMime };
}

function safeMaterialFileName(value = "") {
  const base = path.basename(String(value || "moments-material")).replace(/\.[^.]+$/, "");
  return (base || "moments-material")
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    || "moments-material";
}

function saveMomentsMaterialUpload(body = {}) {
  const decoded = decodeMomentsMaterialUpload(body);
  const date = new Date().toISOString().slice(0, 10);
  const targetDir = path.join(momentsMaterialsDir, date);
  fs.mkdirSync(targetDir, { recursive: true });
  const name = safeMaterialFileName(body.file_name || body.fileName || "moments-material");
  const filePath = path.join(targetDir, `${Date.now()}-${randomUUID().slice(0, 8)}-${name}${decoded.ext}`);
  fs.writeFileSync(filePath, decoded.buffer);
  return {
    name: path.basename(filePath),
    filePath,
    imageUrl: `/api/image/file?path=${encodeURIComponent(filePath)}`,
    mime: decoded.mime,
    size: decoded.buffer.length,
  };
}

function saveDownloadsDir(nextDir) {
  const resolved = setDownloadsDir(nextDir);
  const settings = readSettings();
  settings.downloadsDir = resolved;
  writeSettings(settings);
  downloadsDir = resolved;
  return downloadsDir;
}

function chooseDownloadDir() {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(__dirname, ".data");
    fs.mkdirSync(tempDir, { recursive: true });
    const scriptPath = path.join(tempDir, `choose-download-folder-${process.pid}-${Date.now()}.ps1`);
    const outputPath = path.join(tempDir, `choose-download-folder-${process.pid}-${Date.now()}.txt`);
    const script = [
      "param(",
      "  [Parameter(Mandatory=$true)][string]$OutputPath,",
      "  [string]$InitialPath = \"\"",
      ")",
      "$ErrorActionPreference = \"Stop\"",
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      "$owner = New-Object System.Windows.Forms.Form",
      "$owner.Text = \"选择下载文件夹\"",
      "$owner.TopMost = $true",
      "$owner.ShowInTaskbar = $false",
      "$owner.StartPosition = \"CenterScreen\"",
      "$owner.Size = New-Object System.Drawing.Size(1, 1)",
      "$owner.Opacity = 0",
      "try {",
      "  $explorerPath = Join-Path $env:WINDIR \"explorer.exe\"",
      "  if (Test-Path -LiteralPath $explorerPath) {",
      "    $owner.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($explorerPath)",
      "  }",
      "} catch {}",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = \"选择下载文件夹\"",
      "$dialog.ShowNewFolderButton = $true",
      "if ($InitialPath -and (Test-Path -LiteralPath $InitialPath)) {",
      "  $dialog.SelectedPath = $InitialPath",
      "}",
      "try {",
      "  $owner.Show()",
      "  $owner.Activate()",
      "  $result = $dialog.ShowDialog($owner)",
      "  if ($result -eq [System.Windows.Forms.DialogResult]::OK) {",
      "    [System.IO.File]::WriteAllText($OutputPath, $dialog.SelectedPath, [System.Text.UTF8Encoding]::new($false))",
      "  }",
      "} finally {",
      "  $dialog.Dispose()",
      "  $owner.Close()",
      "  $owner.Dispose()",
      "}",
    ].join("\r\n");
    fs.writeFileSync(scriptPath, `\uFEFF${script}`, "utf8");

    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      outputPath,
      downloadsDir,
    ], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      try {
        fs.unlinkSync(scriptPath);
      } catch {
        // Best effort cleanup only.
      }
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // Best effort cleanup only.
      }
      reject(error);
    });
    child.on("close", (code) => {
      try {
        fs.unlinkSync(scriptPath);
      } catch {
        // Best effort cleanup only.
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || "选择文件夹失败"));
        return;
      }
      let selected = "";
      try {
        selected = fs.readFileSync(outputPath, "utf8").replace(/^\uFEFF/, "").trim();
      } catch {
        selected = "";
      }
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // Best effort cleanup only.
      }
      resolve(selected);
    });
  });
}

function chooseLocalVideoFile() {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(__dirname, ".data");
    fs.mkdirSync(tempDir, { recursive: true });
    const scriptPath = path.join(tempDir, `choose-local-video-${process.pid}-${Date.now()}.ps1`);
    const outputPath = path.join(tempDir, `choose-local-video-${process.pid}-${Date.now()}.txt`);
    const script = [
      "param(",
      "  [Parameter(Mandatory=$true)][string]$OutputPath,",
      "  [string]$InitialPath = \"\"",
      ")",
      "$ErrorActionPreference = \"Stop\"",
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      "$owner = New-Object System.Windows.Forms.Form",
      "$owner.Text = \"选择本地视频文件\"",
      "$owner.TopMost = $true",
      "$owner.ShowInTaskbar = $false",
      "$owner.StartPosition = \"CenterScreen\"",
      "$owner.Size = New-Object System.Drawing.Size(1, 1)",
      "$owner.Opacity = 0",
      "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
      "$dialog.Title = \"选择本地视频文件\"",
      "$dialog.Filter = \"视频文件 (*.mp4;*.mov;*.mkv;*.avi;*.m4v;*.webm)|*.mp4;*.mov;*.mkv;*.avi;*.m4v;*.webm|所有文件 (*.*)|*.*\"",
      "$dialog.Multiselect = $false",
      "if ($InitialPath -and (Test-Path -LiteralPath $InitialPath)) {",
      "  $dialog.InitialDirectory = $InitialPath",
      "}",
      "try {",
      "  $owner.Show()",
      "  $owner.Activate()",
      "  $result = $dialog.ShowDialog($owner)",
      "  if ($result -eq [System.Windows.Forms.DialogResult]::OK) {",
      "    [System.IO.File]::WriteAllText($OutputPath, $dialog.FileName, [System.Text.UTF8Encoding]::new($false))",
      "  }",
      "} finally {",
      "  $dialog.Dispose()",
      "  $owner.Close()",
      "  $owner.Dispose()",
      "}",
    ].join("\r\n");
    fs.writeFileSync(scriptPath, `\uFEFF${script}`, "utf8");

    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      outputPath,
      downloadsDir,
    ], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      try { fs.unlinkSync(scriptPath); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
      reject(error);
    });
    child.on("close", (code) => {
      try { fs.unlinkSync(scriptPath); } catch {}
      if (code !== 0) {
        reject(new Error(stderr.trim() || "选择本地视频失败"));
        return;
      }
      let selected = "";
      try {
        selected = fs.readFileSync(outputPath, "utf8").replace(/^\uFEFF/, "").trim();
      } catch {
        selected = "";
      }
      try { fs.unlinkSync(outputPath); } catch {}
      resolve(selected);
    });
  });
}

function chooseLocalAssetFile({ prefix = "choose-local-asset", title = "选择本地素材", filter = "所有文件 (*.*)|*.*" } = {}) {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(__dirname, ".data");
    fs.mkdirSync(tempDir, { recursive: true });
    const scriptPath = path.join(tempDir, `${prefix}-${process.pid}-${Date.now()}.ps1`);
    const outputPath = path.join(tempDir, `${prefix}-${process.pid}-${Date.now()}.txt`);
    const script = [
      "param(",
      "  [Parameter(Mandatory=$true)][string]$OutputPath,",
      "  [string]$InitialPath = \"\"",
      ")",
      "$ErrorActionPreference = \"Stop\"",
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      "$owner = New-Object System.Windows.Forms.Form",
      `$owner.Text = ${JSON.stringify(title)}`,
      "$owner.TopMost = $true",
      "$owner.ShowInTaskbar = $false",
      "$owner.StartPosition = \"CenterScreen\"",
      "$owner.Size = New-Object System.Drawing.Size(1, 1)",
      "$owner.Opacity = 0",
      "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
      `$dialog.Title = ${JSON.stringify(title)}`,
      `$dialog.Filter = ${JSON.stringify(filter)}`,
      "$dialog.Multiselect = $false",
      "if ($InitialPath -and (Test-Path -LiteralPath $InitialPath)) {",
      "  $dialog.InitialDirectory = $InitialPath",
      "}",
      "try {",
      "  $owner.Show()",
      "  $owner.Activate()",
      "  $result = $dialog.ShowDialog($owner)",
      "  if ($result -eq [System.Windows.Forms.DialogResult]::OK) {",
      "    [System.IO.File]::WriteAllText($OutputPath, $dialog.FileName, [System.Text.UTF8Encoding]::new($false))",
      "  }",
      "} finally {",
      "  $dialog.Dispose()",
      "  $owner.Close()",
      "  $owner.Dispose()",
      "}",
    ].join("\r\n");
    fs.writeFileSync(scriptPath, `\uFEFF${script}`, "utf8");

    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      outputPath,
      downloadsDir,
    ], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      try { fs.unlinkSync(scriptPath); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
      reject(error);
    });
    child.on("close", (code) => {
      try { fs.unlinkSync(scriptPath); } catch {}
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${title}失败`));
        return;
      }
      let selected = "";
      try {
        selected = fs.readFileSync(outputPath, "utf8").replace(/^\uFEFF/, "").trim();
      } catch {
        selected = "";
      }
      try { fs.unlinkSync(outputPath); } catch {}
      resolve(selected);
    });
  });
}

function chooseLocalImageFile() {
  return chooseLocalAssetFile({
    prefix: "choose-local-image",
    title: "选择本地图片素材",
    filter: "图片素材 (*.png;*.jpg;*.jpeg;*.webp;*.gif)|*.png;*.jpg;*.jpeg;*.webp;*.gif|所有文件 (*.*)|*.*",
  });
}

function chooseLocalAudioFile() {
  return chooseLocalAssetFile({
    prefix: "choose-local-audio",
    title: "选择本地背景音乐",
    filter: "音频文件 (*.mp3;*.wav;*.m4a;*.aac;*.ogg)|*.mp3;*.wav;*.m4a;*.aac;*.ogg|所有文件 (*.*)|*.*",
  });
}

function openExplorerPath(targetPath, options = {}) {
  const mode = options.select ? "select" : "folder";
  return new Promise((resolve) => {
    const fallback = () => {
      if (mode === "select") {
        spawn("explorer.exe", ["/select,", targetPath], { detached: true, stdio: "ignore" }).unref();
      } else {
        spawn("explorer.exe", [targetPath], { detached: true, stdio: "ignore" }).unref();
      }
    };

    try {
      const tempDir = path.join(__dirname, ".data");
      fs.mkdirSync(tempDir, { recursive: true });
      const scriptPath = path.join(tempDir, `open-explorer-${process.pid}-${Date.now()}.ps1`);
      const script = [
        "param(",
        "  [Parameter(Mandatory=$true)][string]$TargetPath,",
        "  [string]$Mode = \"folder\"",
        ")",
        "$ErrorActionPreference = \"Stop\"",
        "Add-Type @\"",
        "using System;",
        "using System.Runtime.InteropServices;",
        "public static class ExplorerFocusWin32 {",
        "  public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);",
        "  public static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);",
        "  [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);",
        "  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
        "  [DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);",
        "}",
        "\"@",
        "$target = [System.IO.Path]::GetFullPath($TargetPath)",
        "$focusPath = $target",
        "if ($Mode -eq \"select\") {",
        "  $focusPath = [System.IO.Path]::GetDirectoryName($target)",
        "  Start-Process explorer.exe -ArgumentList (\"/select,`\"$target`\"\")",
        "} else {",
        "  Start-Process explorer.exe -ArgumentList (\"`\"$target`\"\")",
        "}",
        "$focusPath = [System.IO.Path]::GetFullPath($focusPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar)",
        "$shell = New-Object -ComObject Shell.Application",
        "$match = $null",
        "for ($i = 0; $i -lt 24 -and -not $match; $i++) {",
        "  Start-Sleep -Milliseconds 120",
        "  foreach ($window in $shell.Windows()) {",
        "    try {",
        "      $windowPath = [System.IO.Path]::GetFullPath($window.Document.Folder.Self.Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar)",
        "      if ($windowPath -ieq $focusPath) { $match = $window; break }",
        "    } catch {}",
        "  }",
        "}",
        "if ($match -and $match.HWND) {",
        "  $hwnd = [IntPtr]$match.HWND",
        "  [ExplorerFocusWin32]::ShowWindowAsync($hwnd, 9) | Out-Null",
        "  [ExplorerFocusWin32]::SetWindowPos($hwnd, [ExplorerFocusWin32]::HWND_TOPMOST, 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0040) | Out-Null",
        "  Start-Sleep -Milliseconds 160",
        "  [ExplorerFocusWin32]::SetWindowPos($hwnd, [ExplorerFocusWin32]::HWND_NOTOPMOST, 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0040) | Out-Null",
        "  [ExplorerFocusWin32]::SetForegroundWindow($hwnd) | Out-Null",
        "}",
      ].join("\r\n");
      fs.writeFileSync(scriptPath, `\uFEFF${script}`, "utf8");

      const child = spawn("powershell.exe", [
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        targetPath,
        mode,
      ], {
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore"],
      });

      child.on("error", () => {
        try {
          fs.unlinkSync(scriptPath);
        } catch {
          // Best effort cleanup only.
        }
        fallback();
        resolve();
      });
      child.on("close", (code) => {
        try {
          fs.unlinkSync(scriptPath);
        } catch {
          // Best effort cleanup only.
        }
        if (code !== 0) fallback();
        resolve();
      });
    } catch {
      fallback();
      resolve();
    }
  });
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function clampDecimal(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function setDownloadsDir(value) {
  const input = String(value || "").trim();
  const resolved = path.resolve(input || defaultDownloadsDir);
  fs.mkdirSync(resolved, { recursive: true });
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error("下载位置不是文件夹");
  }
  return resolved;
}

function normalizeSettings(settings) {
  const next = settings && typeof settings === "object" ? { ...settings } : {};
  const providers = next.providers && typeof next.providers === "object" ? { ...next.providers } : {};
  const rewriteProviders = next.rewriteProviders && typeof next.rewriteProviders === "object" ? { ...next.rewriteProviders } : {};
  const rewrite = next.rewrite && typeof next.rewrite === "object" ? { ...next.rewrite } : {};
  const legacyKey = next.dashscopeApiKey || "";
  const batch = next.batch && typeof next.batch === "object" ? { ...next.batch } : {};
  const tts = next.tts && typeof next.tts === "object" ? { ...next.tts } : {};
  const imageProviders = next.imageProviders && typeof next.imageProviders === "object" ? { ...next.imageProviders } : {};
  const bgmProviders = next.bgmProviders && typeof next.bgmProviders === "object" ? { ...next.bgmProviders } : {};
  const jianying = next.jianying && typeof next.jianying === "object" ? { ...next.jianying } : {};
  const modelMapping = next.modelMap && typeof next.modelMap === "object"
    ? next.modelMap
    : next.modelMapping && typeof next.modelMapping === "object"
      ? next.modelMapping
      : {};
  const migrations = next.migrations && typeof next.migrations === "object" ? { ...next.migrations } : {};

  providers.dashscope = {
    label: "阿里云百炼 DashScope",
    apiKey: providers.dashscope?.apiKey || legacyKey || "",
    applyUrl: "https://help.aliyun.com/zh/model-studio/get-api-key/",
    docsUrl: "https://www.alibabacloud.com/help/zh/model-studio/paraformer-recorded-speech-recognition-restful-api",
  };

  for (const id of REWRITE_PROVIDER_ORDER) {
    const preset = REWRITE_PROVIDER_PRESETS[id];
    const current = rewriteProviders[id] && typeof rewriteProviders[id] === "object" ? rewriteProviders[id] : {};
    rewriteProviders[id] = {
      label: preset.label,
      baseUrl: String(current.baseUrl || preset.baseUrl || "").trim(),
      model: String(current.model || (id === "dashscope" ? batch.aiModel : "") || preset.model || "").trim(),
      apiKey: String(current.apiKey || (id === "dashscope" ? providers.dashscope.apiKey : "") || "").trim(),
      applyUrl: preset.applyUrl || current.applyUrl || "",
      balanceUrl: preset.balanceUrl || current.balanceUrl || preset.applyUrl || "",
      models: Array.isArray(preset.models) ? preset.models : [],
      autoModel: current.autoModel !== false && !preset.custom,
      custom: Boolean(preset.custom),
    };
  }

  delete next.dashscopeApiKey;
  next.downloadsDir = setDownloadsDir(next.downloadsDir || defaultDownloadsDir);
  next.jianyingAppPath = String(next.jianyingAppPath || next.jianying_app_path || jianying.appPath || "").trim();
  next.jianyingDraftDir = String(next.jianyingDraftDir || next.jianying_draft_dir || jianying.draftDir || "").trim();
  next.jianying = {
    appPath: next.jianyingAppPath,
    draftDir: next.jianyingDraftDir,
  };
  next.activeProvider = next.activeProvider || "dashscope";
  next.providers = providers;
  next.rewriteProviders = rewriteProviders;
  next.rewrite = {
    defaultProvider: rewriteProviders[String(rewrite.defaultProvider || "dashscope")]
      ? String(rewrite.defaultProvider || "dashscope")
      : "dashscope",
    defaultDirection: REWRITE_DIRECTIONS.includes(String(rewrite.defaultDirection || "保留原意优化"))
      ? String(rewrite.defaultDirection || "保留原意优化")
      : "保留原意优化",
    defaultStyle: REWRITE_STYLES.includes(String(rewrite.defaultStyle || "痞里带刺"))
      ? String(rewrite.defaultStyle || "痞里带刺")
      : "痞里带刺",
    referenceStyle: String(rewrite.referenceStyle || DEFAULT_REWRITE_REFERENCE).trim() || DEFAULT_REWRITE_REFERENCE,
  };
  next.batch = {
    concurrency: clampNumber(batch.concurrency, 1, 5, 3),
    limit: clampNumber(batch.limit, 1, 1000, 10),
    skipDownloaded: batch.skipDownloaded !== false,
    aiModel: String(batch.aiModel || "qwen-plus").trim() || "qwen-plus",
  };
  next.tts = {
    aliyun_bailian: {
      api_key: String(tts.aliyun_bailian?.api_key || "").trim(),
      workspace_id: String(tts.aliyun_bailian?.workspace_id || "").trim(),
      default_model: String(tts.aliyun_bailian?.default_model || "cosyvoice-v2").trim() || "cosyvoice-v2",
      default_voice: String(tts.aliyun_bailian?.default_voice || "").trim(),
    },
    volcengine_doubao: {
      api_key: String(tts.volcengine_doubao?.api_key || "").trim(),
      app_id: String(tts.volcengine_doubao?.app_id || "").trim(),
      access_key_id: String(tts.volcengine_doubao?.access_key_id || "").trim(),
      secret_access_key: String(tts.volcengine_doubao?.secret_access_key || "").trim(),
      default_model: String(tts.volcengine_doubao?.default_model || "").trim(),
      default_voice: String(tts.volcengine_doubao?.default_voice || "").trim(),
    },
    tencent_tts: {
      secret_id: String(tts.tencent_tts?.secret_id || "").trim(),
      secret_key: String(tts.tencent_tts?.secret_key || "").trim(),
      region: String(tts.tencent_tts?.region || "ap-shanghai").trim() || "ap-shanghai",
      default_voice: String(tts.tencent_tts?.default_voice || "").trim(),
    },
    custom_tts: {
      base_url: String(tts.custom_tts?.base_url || "").trim(),
      api_key: String(tts.custom_tts?.api_key || "").trim(),
      model: String(tts.custom_tts?.model || "").trim(),
      voice: String(tts.custom_tts?.voice || "").trim(),
    },
    minimax: {
      base_url: String(tts.minimax?.base_url || "https://api.minimax.io/v1").trim(),
      api_key: String(tts.minimax?.api_key || "").trim(),
      model: String(tts.minimax?.model || "minimax-speech").trim() || "minimax-speech",
      voice: String(tts.minimax?.voice || "").trim(),
    },
    fish_audio: {
      base_url: String(tts.fish_audio?.base_url || "https://api.fish.audio").trim(),
      api_key: String(tts.fish_audio?.api_key || "").trim(),
      model: String(tts.fish_audio?.model || "s2-pro").trim() || "s2-pro",
      voice: String(tts.fish_audio?.voice || "").trim(),
      default_format: ["wav", "mp3", "opus"].includes(String(tts.fish_audio?.default_format || "").toLowerCase())
        ? String(tts.fish_audio.default_format).toLowerCase()
        : "mp3",
      reference_id: String(tts.fish_audio?.reference_id || "").trim(),
    },
    elevenlabs: {
      base_url: String(tts.elevenlabs?.base_url || "https://api.elevenlabs.io").trim(),
      api_key: String(tts.elevenlabs?.api_key || "").trim(),
      model: String(tts.elevenlabs?.model || "eleven_multilingual_v2").trim() || "eleven_multilingual_v2",
      voice: String(tts.elevenlabs?.voice || "").trim(),
    },
    default_provider: TTS_PROVIDER_LABELS[String(tts.default_provider || "")]
      ? String(tts.default_provider)
      : "aliyun_bailian",
    default_speed: clampDecimal(tts.default_speed, 0.5, 2, 1),
    default_format: tts.default_format === "wav" ? "wav" : "mp3",
  };
  next.imageProviders = {
    volcengine_ark: {
      label: "火山方舟 Seedream",
      baseUrl: String(imageProviders.volcengine_ark?.baseUrl || "https://ark.cn-beijing.volces.com/api/v3").trim(),
      apiKey: String(imageProviders.volcengine_ark?.apiKey || "").trim(),
      model: normalizeVolcengineArkImageModel(imageProviders.volcengine_ark?.model),
    },
    jimeng: {
      label: "即梦 AI",
      baseUrl: String(imageProviders.jimeng?.baseUrl || "https://api.jimeng.io/v1").trim(),
      apiKey: String(imageProviders.jimeng?.apiKey || "").trim(),
      model: String(imageProviders.jimeng?.model || "flux-dev").trim() || "flux-dev",
    },
  };
  next.bgmProviders = normalizeBgmProviders(bgmProviders);
  next.modelMap = { ...DEFAULT_MODEL_MAPPING, ...modelMapping };
  if (next.modelMap.image?.provider === "volcengine_ark") {
    next.modelMap.image = {
      ...next.modelMap.image,
      model: normalizeVolcengineArkImageModel(next.modelMap.image.model),
    };
  }
  if (!migrations.imageDefaultVolcengineArk && (!modelMapping.image || (modelMapping.image.provider === "jimeng" && modelMapping.image.model === "flux-dev"))) {
    next.modelMap.image = {
      provider: "volcengine_ark",
      model: next.imageProviders.volcengine_ark.model || DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL,
    };
    migrations.imageDefaultVolcengineArk = true;
  }
  next.modelMapping = next.modelMap;
  next.migrations = migrations;
  return next;
}

function normalizeVolcengineArkImageModel(model) {
  const value = String(model || "").trim();
  const lower = value.toLowerCase().replace(/_/g, "-");
  if (!lower || ["doubao-seedream-5.0-lite", "doubao-seedream-5-0-lite", "doubao-seedream-5.0-lite-260128", DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL].includes(lower)) {
    return DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL;
  }
  if (["doubao-seedream-5.0", "doubao-seedream-5-0", "doubao-seedream-5.0-260128", "doubao-seedream-5-0-260128"].includes(lower)) {
    return "doubao-seedream-5-0-260128";
  }
  return value;
}

function maskApiKey(apiKey) {
  if (!apiKey) return "";
  if (apiKey.length <= 10) return "已保存";
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}

function publicTtsSettings(settings = readSettings()) {
  const tts = settings.tts;
  const providers = [
    {
      id: "aliyun_bailian",
      label: TTS_PROVIDER_LABELS.aliyun_bailian,
      phase: "第一阶段",
      enabled: true,
      configured: Boolean(tts.aliyun_bailian.api_key),
      secret_mask: maskApiKey(tts.aliyun_bailian.api_key),
      default_model: tts.aliyun_bailian.default_model,
      default_voice: tts.aliyun_bailian.default_voice,
      workspace_id: tts.aliyun_bailian.workspace_id,
    },
    {
      id: "volcengine_doubao",
      label: TTS_PROVIDER_LABELS.volcengine_doubao,
      phase: "第二阶段预留",
      enabled: false,
      configured: Boolean(tts.volcengine_doubao.api_key || tts.volcengine_doubao.secret_access_key),
      secret_mask: maskApiKey(tts.volcengine_doubao.api_key || tts.volcengine_doubao.secret_access_key),
      default_model: tts.volcengine_doubao.default_model,
      default_voice: tts.volcengine_doubao.default_voice,
    },
    {
      id: "tencent_tts",
      label: TTS_PROVIDER_LABELS.tencent_tts,
      phase: "第三阶段预留",
      enabled: false,
      configured: Boolean(tts.tencent_tts.secret_id && tts.tencent_tts.secret_key),
      secret_mask: maskApiKey(tts.tencent_tts.secret_key),
      region: tts.tencent_tts.region,
      default_voice: tts.tencent_tts.default_voice,
    },
    {
      id: "custom_tts",
      label: TTS_PROVIDER_LABELS.custom_tts,
      phase: "扩展",
      enabled: true,
      configured: Boolean(tts.custom_tts.base_url),
      secret_mask: maskApiKey(tts.custom_tts.api_key),
      base_url: tts.custom_tts.base_url,
      default_model: tts.custom_tts.model,
      default_voice: tts.custom_tts.voice,
    },
    {
      id: "minimax",
      label: TTS_PROVIDER_LABELS.minimax,
      phase: "扩展预留",
      enabled: false,
      configured: Boolean(tts.minimax.api_key),
      secret_mask: maskApiKey(tts.minimax.api_key),
      base_url: tts.minimax.base_url,
      default_model: tts.minimax.model,
      default_voice: tts.minimax.voice,
    },
    {
      id: "fish_audio",
      label: TTS_PROVIDER_LABELS.fish_audio,
      phase: "高级备用",
      enabled: true,
      configured: Boolean(tts.fish_audio.api_key),
      secret_mask: maskApiKey(tts.fish_audio.api_key),
      base_url: tts.fish_audio.base_url,
      default_model: tts.fish_audio.model,
      default_voice: tts.fish_audio.voice,
      default_format: tts.fish_audio.default_format,
    },
    {
      id: "elevenlabs",
      label: TTS_PROVIDER_LABELS.elevenlabs,
      phase: "扩展预留",
      enabled: false,
      configured: Boolean(tts.elevenlabs.api_key),
      secret_mask: maskApiKey(tts.elevenlabs.api_key),
      base_url: tts.elevenlabs.base_url,
      default_model: tts.elevenlabs.model,
      default_voice: tts.elevenlabs.voice,
    },
  ];
  return {
    providers,
    default_provider: tts.default_provider,
    default_speed: tts.default_speed,
    default_format: tts.default_format,
  };
}

function publicRewriteSettings(settings = readSettings()) {
  return {
    options: {
      directions: REWRITE_DIRECTIONS,
      styles: REWRITE_STYLES,
      versions: REWRITE_VERSION_DEFS.map(([key, name]) => ({ key, name })),
      defaultReference: DEFAULT_REWRITE_REFERENCE,
    },
    defaults: settings.rewrite,
    providers: Object.fromEntries(
      REWRITE_PROVIDER_ORDER
        .filter((id) => settings.rewriteProviders[id])
        .map((id) => {
          const provider = settings.rewriteProviders[id];
          return [
            id,
            {
              label: provider.label,
              baseUrl: provider.baseUrl || "",
              model: provider.model || "",
              models: Array.isArray(provider.models) ? provider.models : [],
              applyUrl: provider.applyUrl || "",
              balanceUrl: provider.balanceUrl || provider.applyUrl || "",
              custom: Boolean(provider.custom),
              autoModel: provider.autoModel !== false,
              apiKeyConfigured: Boolean(provider.apiKey),
              apiKeyMask: maskApiKey(provider.apiKey || ""),
            },
          ];
        })
    ),
  };
}

function publicModelMapping(settings = readSettings()) {
  const mapping = settings.modelMap || settings.modelMapping || {};
  return { ...DEFAULT_MODEL_MAPPING, ...mapping };
}

function rewriteProviderIdFromMapping(providerId) {
  const id = String(providerId || "");
  if (id === "qwen" || id === "ali-bailian") return "dashscope";
  return id;
}

var BGM_PROVIDER_DEFS = [
  {
    key: "hifive",
    id: "hifive_bgm",
    label: "HIFIVE 音加加 / 曲多多",
    feature: "正版商用曲库、短视频/在线工具 API、授权下载",
    description: "国内优先的商用音乐 API 候选，适合短视频、在线工具、电商和企业自媒体。申请后保存 App ID/Key/Secret，自动配乐只在授权范围明确后启用。",
    baseUrl: "https://open.haifanwu.com",
    model: "short_video",
    models: ["short_video", "online_tool", "ecommerce", "commercial_license"],
    applyUrl: "https://open.haifanwu.com/",
    balanceUrl: "https://haifanwu.com/",
    apiKeyField: "api_key",
    workspaceField: "app_id",
    secretField: "secret",
  },
  {
    key: "vfine",
    id: "vfine_bgm",
    label: "Vfine Music",
    feature: "商用版权音乐、API/服务端接入、企业授权",
    description: "国内商用版权音乐平台，适合广告、宣传片、短视频和企业内容。申请 API 或企业服务后，把授权素材入库并保留授权证明。",
    baseUrl: "https://www.vfinemusic.com",
    model: "commercial_music",
    models: ["commercial_music", "short_video", "advertising", "enterprise"],
    applyUrl: "https://www.vfinemusic.com/access",
    balanceUrl: "https://www.vfinemusic.com/",
    apiKeyField: "api_key",
    workspaceField: "app_id",
    secretField: "secret",
  },
  {
    key: "kanjian_starlink",
    id: "kanjian_starlink_bgm",
    label: "看见音乐 STARLINK",
    feature: "全球商用音乐资产、API/SDK、配乐/分销授权",
    description: "面向平台或应用的正版音乐 API/SDK 接入方案，适合需要全球授权、短剧配乐、场景 BGM 和批量商业版权的流程。",
    baseUrl: "https://open.kanjian.com",
    model: "soundtrack",
    models: ["soundtrack", "distribution", "scene_music", "short_drama"],
    applyUrl: "https://open.kanjian.com/",
    balanceUrl: "https://open.kanjian.com/",
    apiKeyField: "api_key",
    workspaceField: "app_id",
    secretField: "secret",
  },
  {
    key: "tme_opencloud",
    id: "tme_opencloud_bgm",
    label: "腾讯音乐音乐云",
    feature: "商用版权曲库、音乐定制、版权保护",
    description: "腾讯音乐集团的音乐商业化解决方案，适合企业级商用曲库、版权结算、音乐定制和版权保护。通常需要商务开通。",
    baseUrl: "https://opencloud.tencentmusic.com",
    model: "commercial_catalog",
    models: ["commercial_catalog", "custom_music", "copyright_protection"],
    applyUrl: "https://opencloud.tencentmusic.com/index",
    balanceUrl: "https://opencloud.tencentmusic.com/index",
    apiKeyField: "api_key",
    workspaceField: "app_id",
    secretField: "secret",
  },
  {
    key: "jamendo",
    id: "jamendo_bgm",
    label: "Jamendo",
    feature: "BGM 自动匹配、下载入库、120-150 BPM 合拍筛选",
    description: "免费/海外备用，用于自动搜索可下载的 Creative Commons 音乐。自动流程会过滤 NC/ND 授权，并只使用能确认 120-150 BPM 的曲目；未配置时不影响本地 BGM 和基础节奏。",
    baseUrl: "https://api.jamendo.com/v3.0",
    model: "tracks",
    models: ["tracks"],
    applyUrl: "https://developer.jamendo.com/v3.0",
    balanceUrl: "https://developer.jamendo.com/v3.0",
    apiKeyField: "client_id",
    workspaceField: "",
    secretField: "",
  },
];

function normalizeBgmProviders(bgmProviders = {}) {
  const normalized = {};
  for (const def of BGM_PROVIDER_DEFS || []) {
    const current = bgmProviders[def.key] && typeof bgmProviders[def.key] === "object" ? bgmProviders[def.key] : {};
    const apiKeyField = def.apiKeyField || "api_key";
    const workspaceField = def.workspaceField || "app_id";
    const secretField = def.secretField || "secret";
    normalized[def.key] = {
      label: def.label,
      base_url: String(current.base_url || current.baseUrl || def.baseUrl || "").trim(),
      [apiKeyField]: String(current[apiKeyField] || current.apiKey || current.api_key || current.client_id || "").trim(),
      enabled: current.enabled !== false,
      model: String(current.model || def.model || "").trim(),
      license_plan: String(current.license_plan || current.licensePlan || "").trim(),
      payment_methods: Array.isArray(current.payment_methods) ? current.payment_methods : ["alipay", "wechat_pay"],
    };
    if (workspaceField) normalized[def.key][workspaceField] = String(current[workspaceField] || current.workspaceId || current.workspace_id || current.appId || "").trim();
    if (secretField) normalized[def.key][secretField] = String(current[secretField] || current.secretKey || current.secret_key || "").trim();
  }
  return normalized;
}

function publicUnifiedProviders(settings = readSettings()) {
  const providers = [];
  const textFeatures = "内容分析、AI 改写、AI 导演、分镜生成、图片提示词";
  for (const id of REWRITE_PROVIDER_ORDER) {
    const provider = settings.rewriteProviders[id];
    if (!provider) continue;
    providers.push({
      id,
      label: provider.label || id,
      group: "文本模型",
      feature: textFeatures,
      description: provider.custom
        ? "接入本地模型或其它 OpenAI 兼容服务，填写 Base URL、模型名和可选 Key。"
        : "用于需要大语言模型的文案、分析、导演和提示词任务。",
      configured: Boolean(provider.apiKey),
      apiKeyMask: maskApiKey(provider.apiKey || ""),
      baseUrl: provider.baseUrl || "",
      model: provider.model || "",
      models: Array.isArray(provider.models) ? provider.models : [],
      applyUrl: provider.applyUrl || "",
      balanceUrl: provider.balanceUrl || provider.applyUrl || "",
      activeDefault: settings.rewrite?.defaultProvider === id,
      supportsBaseUrl: true,
      supportsModel: true,
      enabled: true,
    });
  }

  const imageProviderDefs = [
    {
      id: "volcengine_ark",
      label: "火山方舟 Seedream",
      description: "主力图片生成 Provider，调用火山方舟 Seedream 图片生成接口生成本地图片资产。",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      model: DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL,
      models: [
        DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL,
        "doubao-seedream-5-0-260128",
        "doubao-seedream-4-5-251128",
        "doubao-seedream-4-0-250828",
      ],
      applyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
      balanceUrl: "https://console.volcengine.com/finance",
    },
    {
      id: "jimeng",
      label: "即梦 AI",
      description: "保留现有图片生成 Provider，可作为备用。",
      baseUrl: "https://api.jimeng.io/v1",
      model: "flux-dev",
      models: ["flux-dev", "flux-pro", "sdxl"],
      applyUrl: "",
      balanceUrl: "",
    },
  ];
  for (const def of imageProviderDefs) {
    const config = settings.imageProviders?.[def.id] || {};
    providers.push({
      id: def.id,
      label: config.label || def.label,
      group: "图片生成",
      feature: "图片生成",
      description: def.description,
      configured: Boolean(config.apiKey),
      apiKeyMask: maskApiKey(config.apiKey || ""),
      baseUrl: config.baseUrl || def.baseUrl,
      model: config.model || def.model,
      models: def.models,
      applyUrl: def.applyUrl,
      balanceUrl: def.balanceUrl,
      activeDefault: publicModelMapping(settings).image?.provider === def.id,
      supportsBaseUrl: true,
      supportsModel: true,
      enabled: true,
    });
  }

  const tts = settings.tts || {};
  const ttsProviders = [
    {
      id: "aliyun_bailian",
      label: TTS_PROVIDER_LABELS.aliyun_bailian,
      config: tts.aliyun_bailian || {},
      description: "用于 TTS 语音和声音复刻；可与 DashScope 通义千问共用同一个阿里云百炼 Key。",
      baseUrl: "https://dashscope.aliyuncs.com",
      model: tts.aliyun_bailian?.default_model || "cosyvoice-v2",
      workspaceId: tts.aliyun_bailian?.workspace_id || "",
      models: [
        "cosyvoice-v2",
        "cosyvoice-v3-flash",
        "cosyvoice-v3-plus",
        "qwen3-tts-flash",
        "qwen3-tts-instruct-flash",
        "qwen-tts-latest",
      ],
      enabled: true,
    },
    {
      id: "custom_tts",
      label: TTS_PROVIDER_LABELS.custom_tts,
      config: tts.custom_tts || {},
      description: "用于接入你自己的 TTS 服务；Base URL 必填，API Key 可选。",
      baseUrl: tts.custom_tts?.base_url || "",
      model: tts.custom_tts?.model || "",
      models: [],
      enabled: true,
    },
    {
      id: "minimax",
      label: TTS_PROVIDER_LABELS.minimax,
      config: tts.minimax || {},
      description: "扩展预留 Provider，可先保存 Key，正式生成能力后续接入。",
      baseUrl: tts.minimax?.base_url || "https://api.minimax.io/v1",
      model: tts.minimax?.model || "minimax-speech",
      models: ["minimax-speech"],
      enabled: false,
    },
    {
      id: "fish_audio",
      label: TTS_PROVIDER_LABELS.fish_audio,
      config: tts.fish_audio || {},
      description: "高质量 TTS 备用 Provider；填写 API Key 和 voice_id/reference_id 后可生成 MP3。",
      baseUrl: tts.fish_audio?.base_url || "https://api.fish.audio",
      model: tts.fish_audio?.model || "s2-pro",
      models: ["s2-pro", "s1"],
      enabled: true,
    },
    {
      id: "elevenlabs",
      label: TTS_PROVIDER_LABELS.elevenlabs,
      config: tts.elevenlabs || {},
      description: "扩展预留 Provider，可先保存 Key，正式生成能力后续接入。",
      baseUrl: tts.elevenlabs?.base_url || "https://api.elevenlabs.io",
      model: tts.elevenlabs?.model || "eleven_multilingual_v2",
      models: ["eleven_multilingual_v2"],
      enabled: false,
    },
  ];

  for (const provider of ttsProviders) {
    const config = provider.config || {};
    const apiKey = config.api_key || "";
    providers.push({
      id: provider.id,
      label: provider.label,
      group: "TTS 语音",
      feature: "TTS 语音、声音复刻",
      description: provider.description,
      configured: provider.id === "custom_tts" ? Boolean(config.base_url) : Boolean(apiKey),
      apiKeyMask: maskApiKey(apiKey),
      baseUrl: provider.baseUrl,
      workspaceId: provider.workspaceId || "",
      model: provider.model,
      models: provider.models,
      applyUrl: "",
      balanceUrl: "",
      activeDefault: tts.default_provider === provider.id,
      supportsBaseUrl: provider.id !== "aliyun_bailian",
      supportsWorkspace: provider.id === "aliyun_bailian",
      supportsModel: true,
      supportsFormat: provider.id === "fish_audio",
      format: provider.id === "fish_audio" ? tts.fish_audio?.default_format || "mp3" : "",
      enabled: provider.enabled,
    });
  }

  for (const def of BGM_PROVIDER_DEFS) {
    const config = settings.bgmProviders?.[def.key] || {};
    const apiKey = config[def.apiKeyField || "api_key"] || config.apiKey || "";
    providers.push({
      id: def.id,
      label: config.label || def.label,
      group: "BGM 音乐",
      feature: def.feature,
      description: def.description,
      configured: Boolean(apiKey),
      apiKeyMask: maskApiKey(apiKey),
      baseUrl: config.base_url || config.baseUrl || def.baseUrl,
      workspaceId: def.workspaceField ? config[def.workspaceField] || "" : "",
      model: config.model || def.model,
      models: def.models,
      applyUrl: def.applyUrl,
      balanceUrl: def.balanceUrl,
      activeDefault: false,
      supportsBaseUrl: true,
      supportsWorkspace: Boolean(def.workspaceField),
      supportsModel: true,
      enabled: config.enabled !== false,
      paymentMethods: Array.isArray(config.payment_methods) ? config.payment_methods : ["alipay", "wechat_pay"],
    });
  }

  return providers;
}

function saveUnifiedProvider(settings, body) {
  const id = String(body.id || "").trim();
  const apiKey = String(body.apiKey || "").trim();
  const baseUrl = String(body.baseUrl || "").trim();
  const workspaceId = String(body.workspaceId || "").trim();
  const model = String(body.model || "").trim();

  if (settings.rewriteProviders?.[id]) {
    const provider = settings.rewriteProviders[id];
    if (apiKey) provider.apiKey = apiKey;
    if (body.baseUrl !== undefined) provider.baseUrl = baseUrl;
    if (body.model !== undefined) {
      provider.model = model || provider.model || "";
      provider.autoModel = !model && !provider.custom;
    }
    if (id === "dashscope") {
      if (apiKey) {
        settings.providers.dashscope.apiKey = apiKey;
        settings.tts.aliyun_bailian.api_key = apiKey;
      }
      settings.providers.dashscope.label = "阿里云百炼 DashScope";
    }
    if (body.setDefault === true) settings.rewrite.defaultProvider = id;
    return;
  }

  if (["jimeng", "volcengine_ark"].includes(id)) {
    if (!settings.imageProviders) settings.imageProviders = {};
    settings.imageProviders[id] = {
      ...(settings.imageProviders[id] || {}),
      label: id === "volcengine_ark" ? "火山方舟 Seedream" : "即梦 AI",
      ...(apiKey ? { apiKey } : {}),
      ...(body.baseUrl !== undefined ? { baseUrl } : {}),
      ...(body.model !== undefined ? { model } : {}),
    };
    if (body.setDefault === true) {
      settings.modelMap.image = {
        provider: id,
        model: id === "volcengine_ark"
          ? normalizeVolcengineArkImageModel(model || settings.imageProviders[id].model)
          : model || settings.imageProviders[id].model || "flux-dev",
      };
      settings.modelMapping = settings.modelMap;
    }
    return;
  }

  if (id === "aliyun_bailian") {
    if (apiKey) {
      settings.tts.aliyun_bailian.api_key = apiKey;
      settings.providers.dashscope.apiKey = apiKey;
      settings.rewriteProviders.dashscope.apiKey = apiKey;
    }
    if (body.workspaceId !== undefined) settings.tts.aliyun_bailian.workspace_id = workspaceId;
    if (body.model !== undefined) settings.tts.aliyun_bailian.default_model = model || "cosyvoice-v2";
    if (body.setDefault === true) settings.tts.default_provider = id;
    return;
  }

  if (id === "custom_tts") {
    if (apiKey) settings.tts.custom_tts.api_key = apiKey;
    if (body.baseUrl !== undefined) settings.tts.custom_tts.base_url = baseUrl;
    if (body.model !== undefined) settings.tts.custom_tts.model = model;
    if (body.setDefault === true) settings.tts.default_provider = id;
    return;
  }

  if (["minimax", "fish_audio", "elevenlabs"].includes(id)) {
    if (!settings.tts[id]) settings.tts[id] = {};
    if (apiKey) settings.tts[id].api_key = apiKey;
    if (body.baseUrl !== undefined) settings.tts[id].base_url = baseUrl;
    if (body.model !== undefined) settings.tts[id].model = model;
    if (id === "fish_audio") {
      if (body.format !== undefined) settings.tts[id].default_format = ["wav", "mp3", "opus"].includes(String(body.format).toLowerCase())
        ? String(body.format).toLowerCase()
        : "mp3";
    }
    if (body.setDefault === true) settings.tts.default_provider = id;
    return;
  }

  const bgmDef = BGM_PROVIDER_DEFS.find((item) => item.id === id);
  if (bgmDef) {
    if (!settings.bgmProviders) settings.bgmProviders = {};
    const existing = settings.bgmProviders[bgmDef.key] || {};
    const apiKeyField = bgmDef.apiKeyField || "api_key";
    const workspaceField = bgmDef.workspaceField || "app_id";
    const secretField = bgmDef.secretField || "secret";
    const nextProvider = {
      ...existing,
      label: bgmDef.label,
      ...(apiKey ? { [apiKeyField]: apiKey } : {}),
      ...(body.baseUrl !== undefined ? { base_url: baseUrl || bgmDef.baseUrl || "" } : {}),
      ...(body.model !== undefined ? { model: model || bgmDef.model || "" } : {}),
      enabled: body.enabled !== false,
    };
    if (workspaceField && body.workspaceId !== undefined) nextProvider[workspaceField] = workspaceId;
    if (secretField && body.secret !== undefined) nextProvider[secretField] = String(body.secret || "").trim();
    settings.bgmProviders[bgmDef.key] = nextProvider;
    return;
  }

  throw new Error("未知 API 服务");
}

const LOCAL_PROVIDER_ENV = {
  dashscope: {
    apiKey: ["DASHSCOPE_API_KEY", "DASHSCOPE_APIKEY", "QWEN_API_KEY", "BAILIAN_API_KEY", "ALIYUN_API_KEY", "ALIBABA_CLOUD_API_KEY"],
    baseUrl: ["DASHSCOPE_BASE_URL", "QWEN_BASE_URL"],
    model: ["DASHSCOPE_MODEL", "QWEN_MODEL"],
  },
  deepseek: {
    apiKey: ["DEEPSEEK_API_KEY"],
    baseUrl: ["DEEPSEEK_BASE_URL"],
    model: ["DEEPSEEK_MODEL"],
  },
  openai: {
    apiKey: ["OPENAI_API_KEY"],
    baseUrl: ["OPENAI_BASE_URL"],
    model: ["OPENAI_MODEL"],
  },
  moonshot: {
    apiKey: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
    baseUrl: ["MOONSHOT_BASE_URL", "KIMI_BASE_URL"],
    model: ["MOONSHOT_MODEL", "KIMI_MODEL"],
  },
  zhipu: {
    apiKey: ["ZHIPU_API_KEY", "GLM_API_KEY"],
    baseUrl: ["ZHIPU_BASE_URL"],
    model: ["ZHIPU_MODEL", "GLM_MODEL"],
  },
  volcengine: {
    apiKey: ["ARK_API_KEY", "VOLCENGINE_API_KEY", "DOUBAO_API_KEY"],
    baseUrl: ["ARK_BASE_URL", "VOLCENGINE_BASE_URL"],
    model: ["ARK_MODEL", "DOUBAO_MODEL"],
  },
  qianfan: {
    apiKey: ["QIANFAN_API_KEY", "BAIDU_API_KEY"],
    baseUrl: ["QIANFAN_BASE_URL"],
    model: ["QIANFAN_MODEL"],
  },
  hunyuan: {
    apiKey: ["HUNYUAN_API_KEY", "TENCENT_HUNYUAN_API_KEY"],
    baseUrl: ["HUNYUAN_BASE_URL"],
    model: ["HUNYUAN_MODEL"],
  },
  minimax: {
    apiKey: ["MINIMAX_API_KEY"],
    baseUrl: ["MINIMAX_BASE_URL"],
    model: ["MINIMAX_MODEL"],
  },
  xiaomi: {
    apiKey: ["XIAOMI_API_KEY", "MIMO_API_KEY"],
    baseUrl: ["XIAOMI_BASE_URL", "MIMO_BASE_URL"],
    model: ["XIAOMI_MODEL", "MIMO_MODEL"],
  },
  openrouter: {
    apiKey: ["OPENROUTER_API_KEY"],
    baseUrl: ["OPENROUTER_BASE_URL"],
    model: ["OPENROUTER_MODEL"],
  },
  custom: {
    apiKey: ["CUSTOM_OPENAI_API_KEY", "LOCAL_LLM_API_KEY"],
    baseUrl: ["CUSTOM_OPENAI_BASE_URL", "LOCAL_LLM_BASE_URL", "OLLAMA_BASE_URL"],
    model: ["CUSTOM_OPENAI_MODEL", "LOCAL_LLM_MODEL", "OLLAMA_MODEL"],
  },
  aliyun_bailian: {
    apiKey: ["DASHSCOPE_API_KEY", "DASHSCOPE_APIKEY", "QWEN_API_KEY", "BAILIAN_API_KEY", "ALIYUN_API_KEY", "ALIBABA_CLOUD_API_KEY"],
    workspaceId: ["DASHSCOPE_WORKSPACE_ID", "ALIYUN_BAILIAN_WORKSPACE_ID"],
    model: ["ALIYUN_TTS_MODEL", "DASHSCOPE_TTS_MODEL"],
  },
  fish_audio: {
    apiKey: ["FISH_AUDIO_API_KEY"],
    baseUrl: ["FISH_AUDIO_BASE_URL"],
    model: ["FISH_AUDIO_MODEL"],
  },
  custom_tts: {
    apiKey: ["CUSTOM_TTS_API_KEY"],
    baseUrl: ["CUSTOM_TTS_BASE_URL"],
    model: ["CUSTOM_TTS_MODEL"],
  },
};

function applyLocalProviderConfig(settings, providerId) {
  const id = String(providerId || "").trim();
  const keys = LOCAL_PROVIDER_ENV[id];
  if (!keys) return false;
  const body = {
    id,
    apiKey: localConfigValue(keys.apiKey || []),
    baseUrl: localConfigValue(keys.baseUrl || []),
    workspaceId: localConfigValue(keys.workspaceId || []),
    model: localConfigValue(keys.model || []),
    setDefault: true,
  };
  if (!body.apiKey && !body.baseUrl && !body.workspaceId && !body.model) return false;
  saveUnifiedProvider(settings, body);
  if (id === "dashscope" && body.apiKey) {
    saveUnifiedProvider(settings, { id: "aliyun_bailian", apiKey: body.apiKey, setDefault: false });
  }
  if (id === "aliyun_bailian" && body.apiKey) {
    saveUnifiedProvider(settings, { id: "dashscope", apiKey: body.apiKey, setDefault: false });
  }
  return true;
}

function applyModelMapping(settings, mapping) {
  const normalized = { ...DEFAULT_MODEL_MAPPING, ...(mapping || {}) };
  settings.modelMap = normalized;
  settings.modelMapping = normalized;

  const rewriteProvider = rewriteProviderIdFromMapping(normalized.rewrite?.provider);
  if (settings.rewriteProviders?.[rewriteProvider]) {
    settings.rewrite.defaultProvider = rewriteProvider;
    if (normalized.rewrite?.model) {
      settings.rewriteProviders[rewriteProvider].model = normalized.rewrite.model;
      settings.rewriteProviders[rewriteProvider].autoModel = false;
    }
  }

  for (const task of ["director", "storyboard", "image_prompt"]) {
    const providerId = rewriteProviderIdFromMapping(normalized[task]?.provider);
    if (settings.rewriteProviders?.[providerId] && normalized[task]?.model) {
      settings.rewriteProviders[providerId].model = normalized[task].model;
    }
  }

  const ttsProvider = String(normalized.tts?.provider || "");
  if (TTS_PROVIDER_LABELS[ttsProvider]) {
    settings.tts.default_provider = ttsProvider;
    if (normalized.tts?.model) {
      const target = settings.tts[ttsProvider];
      if (target) {
        if (ttsProvider === "aliyun_bailian") target.default_model = normalized.tts.model;
        else target.model = normalized.tts.model;
      }
    }
  }
}

function reloadModelRuntime(settings) {
  writeSettings(settings);
  const normalized = readSettings();
  modelRouter.init(normalized);
  providerRegistry.initFromModelRouter();
  return normalized;
}

function providerConfigStatus(settings, providerId) {
  const provider = publicUnifiedProviders(settings).find((item) => item.id === providerId);
  if (!provider) return { ok: false, message: "未知 API 服务" };
  if (!provider.configured) {
    return { ok: false, status: "missing", message: `${provider.label} 还没有保存必要配置。` };
  }
  return {
    ok: true,
    status: provider.enabled ? "ready" : "saved",
    message: provider.enabled
      ? `${provider.label} 已保存，可用于：${provider.feature}。`
      : `${provider.label} 配置已保存，但当前功能仍是预留接入。`,
  };
}

async function testUnifiedProvider(settings, providerId) {
  const provider = publicUnifiedProviders(settings).find((item) => item.id === providerId);
  if (!provider) return { ok: false, status: "failed", message: "未知 API 服务" };
  if (provider.group === "图片生成") {
    const result = await imageService.testProviderConnection(providerId);
    return { ok: result.ok, status: result.status, message: result.message };
  }
  if (providerId === "fish_audio") {
    const config = settings.tts?.fish_audio || {};
    const apiKey = String(config.api_key || "").trim();
    const baseUrl = String(config.base_url || "https://api.fish.audio").replace(/\/+$/, "");
    if (!apiKey) return { ok: false, status: "missing", message: "Fish Audio：未配置 API Key。" };
    if (!String(config.model || "").trim()) return { ok: false, status: "missing", message: "Fish Audio：模型为空。" };
    try {
      const response = await fetch(`${baseUrl}/model`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (response.ok) return { ok: true, status: "success", message: "Fish Audio 连接成功。" };
      if (response.status === 401 || response.status === 403) return { ok: false, status: "failed", message: "Fish Audio：API Key 无效或未授权。" };
      if (response.status === 402) return { ok: false, status: "failed", message: "Fish Audio：余额不足或额度不可用。" };
      return { ok: false, status: "failed", message: `Fish Audio 测试失败（${response.status}）。` };
    } catch (error) {
      return { ok: false, status: "failed", message: `Fish Audio：网络错误，${error instanceof Error ? error.message : String(error)}` };
    }
  }
  return providerConfigStatus(settings, providerId);
}

async function validateAndSaveRequiredProvider(body = {}) {
  const id = String(body.id || "").trim();
  if (!id) return { ok: false, status: "missing", message: "缺少 API 服务 ID" };
  const current = readSettings();
  const draft = normalizeSettings(JSON.parse(JSON.stringify(current)));
  saveUnifiedProvider(draft, body);
  applyLocalProviderConfig(draft, id);

  if (draft.rewriteProviders?.[id]) {
    const provider = draft.rewriteProviders[id];
    if (!String(provider.apiKey || "").trim()) {
      return { ok: false, status: "missing", message: `${provider.label || id} API Key 不能为空。` };
    }
    if (!String(provider.baseUrl || "").trim()) {
      return { ok: false, status: "missing", message: `${provider.label || id} Base URL 不能为空。` };
    }
    if (!String(provider.model || "").trim()) {
      await refreshProviderModel(draft, id);
    }
    if (!String(provider.model || "").trim()) {
      return { ok: false, status: "missing", message: `${provider.label || id} 模型不能为空。` };
    }
    try {
      await chatCompletion({ id, ...provider }, [
        { role: "system", content: "你是连接测试助手，只能回复 OK。" },
        { role: "user", content: "回复 OK" },
      ], undefined, {
        temperature: 0,
        requestName: `${provider.label || id} 连接测试`,
        maxTokens: 8,
      });
    } catch (error) {
      return { ok: false, status: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  } else if (TTS_PROVIDER_LABELS[id]) {
    const status = providerConfigStatus(draft, id);
    if (!status.ok) return status;
  } else {
    const status = await testUnifiedProvider(draft, id);
    if (!status.ok) return status;
  }

  const normalized = reloadModelRuntime(draft);
  return {
    ok: true,
    status: "success",
    message: "检测通过，配置已保存。",
    providers: publicUnifiedProviders(normalized),
    settings: {
      rewrite: publicRewriteSettings(normalized),
      tts: publicTtsSettings(normalized),
    },
  };
}

async function testProviderSample(providerId) {
  const provider = publicUnifiedProviders(readSettings()).find((item) => item.id === providerId);
  if (!provider) return { ok: false, message: "未知 API 服务" };
  if (provider.group === "图片生成") {
    const result = await imageService.generateImage({
      provider: providerId,
      prompt: "短视频教育场景测试图：明亮教室里，一位英语老师在黑板前讲解单词，竖版构图，干净真实，适合招生短视频封面。",
      aspectRatio: "9:16",
      count: 1,
      sourceType: "provider-test",
      sourceId: providerId,
    });
    const first = (result.results || []).find((item) => item.success);
    if (!first) {
      const error = (result.results || []).find((item) => !item.success)?.error || "测试生成图片失败。";
      return { ok: false, status: "failed", message: error, result };
    }
    return {
      ok: true,
      status: "success",
      message: `测试生成图片成功，已保存到图片资产库：${first.filename || first.assetId}`,
      result,
    };
  }
  if (providerId === "fish_audio") {
    const settings = readSettings();
    const config = settings.tts?.fish_audio || {};
    const voiceId = String(config.voice || config.reference_id || "").trim();
    const result = ttsService.enqueue({
      provider: "fish_audio",
      text: "你好，这是一段 Fish Audio 测试语音。用于确认 API 连接、模型配置和本地音频保存是否正常。",
      voice_id: voiceId,
      voice_name: voiceId || "Fish Audio",
      model: String(config.model || "s2-pro"),
      format: String(config.default_format || "mp3"),
      speed: 1,
      volume: 50,
      pitch: 1,
      emotion: "自然",
      style_prompt: "",
    });
    if (result.error) return { ok: false, status: "failed", message: result.error };
    return {
      ok: true,
      status: "queued",
      message: `Fish Audio 测试语音任务已提交：#${result.job.id}`,
      job: result.job,
    };
  }
  return { ok: false, message: "该 Provider 暂无测试生成动作。" };
}

function readTextFileSafe(filePath, fallback = "") {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function readSkill(name) {
  return readTextFileSafe(path.join(skillsDir, name, "SKILL.md"));
}

function readPromptTemplate(name) {
  return readTextFileSafe(path.join(promptsDir, name));
}

function renderTemplate(template, variables = {}) {
  return String(template || "").replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    const value = variables[key];
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, 2);
  });
}

function normalizeReferenceExamples(value) {
  const rows = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/\n{2,}|---+/)
      .map((item) => item.trim())
      .filter(Boolean);
  return rows
    .map((item) => {
      if (item && typeof item === "object") {
        return {
          title: String(item.title || "").trim(),
          text: String(item.text || item.content || "").trim(),
        };
      }
      return { title: "", text: String(item || "").trim() };
    })
    .filter((item) => item.text)
    .slice(0, 10);
}

function readReferenceExamples() {
  try {
    if (!fs.existsSync(referenceExamplesPath)) return [];
    return normalizeReferenceExamples(JSON.parse(fs.readFileSync(referenceExamplesPath, "utf8")));
  } catch {
    return [];
  }
}

function writeReferenceExamples(examples) {
  const normalized = normalizeReferenceExamples(examples);
  fs.writeFileSync(referenceExamplesPath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function loadRewriteAssets() {
  return {
    skills: {
      rewriteEducation: readSkill("rewrite-douyin-education"),
      humanizerZh: readSkill("humanizer-zh"),
      bossStyle: readSkill("boss-style"),
    },
    prompts: {
      rewritePipeline: readPromptTemplate("rewrite_pipeline.md"),
      humanizeZh: readPromptTemplate("humanize_zh.md"),
      scoreRewrite: readPromptTemplate("score_rewrite.md"),
    },
    referenceExamples: readReferenceExamples(),
  };
}

function normalizeModelRows(data) {
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return rows
    .map((item, index) => {
      const id = String(item.id || item.name || item.model || "").trim();
      if (!id) return null;
      const createdRaw = item.created || item.created_at || item.update_time || item.updated_at || 0;
      const created = Number(createdRaw) || Date.parse(createdRaw) || 0;
      return { id, created, index };
    })
    .filter(Boolean);
}

const BLOCKED_CHAT_MODEL_PATTERN = /(embedding|embed|rerank|bge|whisper|tts|speech|audio|image|vision|vl|ocr|moderation|dingtalk|qwentype|paraformer|cosyvoice|wanx|wan-|video)/i;

function pickLatestChatModel(models, fallback = "", providerId = "") {
  const preferred = /(chat|instruct|turbo|plus|max|pro|flash|qwen|deepseek|kimi|moonshot|glm|doubao|ernie|hunyuan|gpt)/i;
  const providerPattern = {
    dashscope: /^qwen(?:[-_.0-9]|$)/i,
    deepseek: /^deepseek/i,
    moonshot: /^(moonshot|kimi)/i,
    zhipu: /^glm/i,
    volcengine: /^doubao/i,
    qianfan: /^ernie/i,
    hunyuan: /^hunyuan/i,
    xiaomi: /^mimo/i,
  }[providerId];
  const candidates = models.filter((model) => (
    !BLOCKED_CHAT_MODEL_PATTERN.test(model.id) && (!providerPattern || providerPattern.test(model.id))
  ));
  if (candidates.length === 0) return fallback || models[0]?.id || "";
  candidates.sort((left, right) => {
    const scoreLeft = (preferred.test(left.id) ? 1000 : 0) + (left.created || 0) / 1000000000 - left.index / 1000;
    const scoreRight = (preferred.test(right.id) ? 1000 : 0) + (right.created || 0) / 1000000000 - right.index / 1000;
    return scoreRight - scoreLeft;
  });
  return candidates[0]?.id || fallback || "";
}

async function resolveLatestModel(provider, providerId = "") {
  const baseUrl = String(provider.baseUrl || "").replace(/\/+$/, "");
  const presetFallback = REWRITE_PROVIDER_PRESETS[providerId]?.model || "";
  const safeCurrentModel = BLOCKED_CHAT_MODEL_PATTERN.test(String(provider.model || ""))
    ? presetFallback
    : provider.model || presetFallback;
  if (!baseUrl || !String(provider.apiKey || "").trim()) {
    return safeCurrentModel;
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return safeCurrentModel;
    const fallback = safeCurrentModel;
    return pickLatestChatModel(normalizeModelRows(data), fallback, providerId) || fallback;
  } catch {
    return safeCurrentModel;
  }
}

async function refreshProviderModel(settings, providerId) {
  const provider = settings.rewriteProviders[providerId];
  if (!provider || provider.autoModel === false) return provider;
  const latestModel = await resolveLatestModel(provider, providerId);
  if (latestModel) provider.model = latestModel;
  return provider;
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
}

function downloadDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const downloadTypeFolders = {
  video: "视频",
  audio: "音频",
  subtitle: "字幕",
  transcript: "文案",
  analysis: "AI分析",
  other: "其他",
};

function downloadOutputDir(type = "other", date = new Date()) {
  const folder = downloadTypeFolders[type] || downloadTypeFolders.other;
  const dir = path.join(downloadsDir, downloadDateStamp(date), folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function classifyDownloadType(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (/\.(mp4|mov|mkv|avi|m4v|webm)$/i.test(lower)) return "video";
  if (/\.(mp3|wav|m4a|aac|flac)$/i.test(lower)) return "audio";
  if (/\.(srt|vtt|ass|json3)$/i.test(lower) || lower.includes("字幕")) return "subtitle";
  if (lower.includes("ai分析")) return "analysis";
  if (/\.(txt|md)$/i.test(lower) || lower.includes("文案")) return "transcript";
  return "other";
}

function uniquePathInDir(dir, baseName, extension) {
  const safeBase = (sanitizeFileName(baseName) || `douyin_${Date.now()}`).slice(0, 120);
  let filePath = path.join(dir, `${safeBase}${extension}`);
  let index = 2;
  while (fs.existsSync(filePath)) {
    filePath = path.join(dir, `${safeBase}_${index}${extension}`);
    index += 1;
  }
  return filePath;
}

function makeUniquePath(baseName, extension, type = "other") {
  const dir = downloadOutputDir(type);
  return uniquePathInDir(dir, baseName, extension);
}

function parseVideoInfoFromToolText(text) {
  const title = text.match(/视频标题:\s*(.+)/)?.[1]?.trim() || "";
  const videoId = text.match(/视频ID:\s*(.+)/)?.[1]?.trim() || "";
  const downloadUrl = text.match(/下载链接:\s*(https?:\/\/[^\r\n]+)/)?.[1]?.trim() || "";
  return { title, videoId, downloadUrl };
}

function textFromSubtitleFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  const raw = fs.readFileSync(filePath, "utf8");
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json3") {
    try {
      const data = JSON.parse(raw);
      return (data.events || [])
        .flatMap((event) => event.segs || [])
        .map((seg) => seg.utf8 || "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      return "";
    }
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\d+$/.test(line) && !/-->/u.test(line) && !/^WEBVTT/i.test(line))
    .join("\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createPauseError() {
  const error = new Error("任务已暂停");
  error.name = "AbortError";
  return error;
}

function isPauseError(error) {
  return error?.name === "AbortError" || error?.message === "任务已暂停";
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error?.cause;
  if (cause?.code && !message.includes(cause.code)) {
    return `${message}（${cause.code}）`;
  }
  return message;
}

function isRemoteFileFetchError(error) {
  return /fetch failed|downloadfailed|file_download_failed|cannot be downloaded|audio file cannot be downloaded|invalidfile/i.test(errorMessage(error));
}

function throwIfPaused(signal) {
  if (signal?.aborted) throw createPauseError();
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createPauseError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createPauseError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isInsideDownloads(filePath) {
  const resolved = path.resolve(filePath);
  const root = path.resolve(downloadsDir);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function resolveDownloadFilePath(fileName) {
  const normalized = String(fileName || "").trim().replace(/[\\/]+/g, path.sep);
  if (!normalized || path.isAbsolute(normalized) || normalized.split(path.sep).includes("..")) return "";
  const filePath = path.resolve(downloadsDir, normalized);
  return isInsideDownloads(filePath) ? filePath : "";
}

function organizeLooseDownloadFiles() {
  const moved = [];
  if (!fs.existsSync(downloadsDir)) return moved;
  for (const entry of fs.readdirSync(downloadsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const sourcePath = path.join(downloadsDir, entry.name);
    const stat = fs.statSync(sourcePath);
    const type = classifyDownloadType(entry.name);
    const targetDir = downloadOutputDir(type, stat.mtime);
    const parsed = path.parse(entry.name);
    const targetPath = uniquePathInDir(targetDir, parsed.name, parsed.ext);
    if (path.resolve(sourcePath) === path.resolve(targetPath)) continue;
    fs.renameSync(sourcePath, targetPath);
    moved.push({ from: path.resolve(sourcePath), to: path.resolve(targetPath) });
  }
  return moved;
}

function syncMovedDownloadTaskPaths(moved = []) {
  if (!moved.length) return;
  const map = new Map(moved.map((item) => [path.resolve(item.from).toLowerCase(), item.to]));
  const pathColumns = ["video_path", "audio_path", "subtitle_path", "txt_path", "analysis_path"];
  for (const task of taskStore.allTasks()) {
    const changes = {};
    for (const column of pathColumns) {
      const current = String(task[column] || "");
      const next = current ? map.get(path.resolve(current).toLowerCase()) : "";
      if (next) changes[column] = next;
    }
    if (Object.keys(changes).length) taskStore.updateTask(task.id, changes);
  }
}

function isInsideManagedFilePath(filePath) {
  const resolved = path.resolve(filePath);
  const roots = [
    downloadsDir,
    rewritesDir,
    directorService.outputDirs.storyboardsDir,
    directorService.outputDirs.scenePromptsDir,
    directorService.outputDirs.referenceStylesDir,
    vfoService.outputDirs.assetPlansDir,
    vfoService.outputDirs.assetPackagesDir,
    vfoService.outputDirs.vfoDir,
    videoProductService.outputRoot,
    momentsMaterialsDir,
    path.join(__dirname, "image-assets"),
    path.join(__dirname, "jianying-exports"),
    path.join(__dirname, ".data", "cs1-video-maker"),
  ].map((item) => path.resolve(item));
  return roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
}

function cancelShutdown() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
}

function shutdownNow() {
  for (const child of activeChildProcesses) {
    try {
      child.kill();
    } catch {
      // Best effort only.
    }
  }
  cleanupRuntimeFiles();
  process.exit(0);
}

function scheduleShutdownIfIdle() {
  const hasRunningJobs = [...downloadJobs.values(), ...transcriptJobs.values()].some((job) => job.status === "running");
  if (
    !autoClose
    || pageSessions.size > 0
    || hasRunningJobs
    || runningBatchTasks.size > 0
    || taskStore.hasPendingWork()
    || directorService.isBusy()
    || vfoService.isBusy()
  ) {
    return;
  }
  cancelShutdown();
  shutdownTimer = setTimeout(shutdownNow, 5000);
}

function touchPageSession(id) {
  if (!id) return;
  pageSessions.set(id, Date.now());
  cancelShutdown();
}

function closePageSession(id) {
  if (id) pageSessions.delete(id);
  scheduleShutdownIfIdle();
}

setInterval(() => {
  if (!autoClose) return;
  const now = Date.now();
  for (const [id, lastSeen] of pageSessions) {
    if (now - lastSeen > 12000) pageSessions.delete(id);
  }
  scheduleShutdownIfIdle();
}, 5000).unref();

function runMcpTool(name, shareLink, onProgress = () => {}, options = {}) {
  return new Promise((resolve, reject) => {
    const { signal } = options;
    if (signal?.aborted) {
      reject(createPauseError());
      return;
    }
    const nodePath = process.execPath;
    const child = spawn(nodePath, [mcpEntry], {
      cwd: __dirname,
      env: {
        ...process.env,
        WORK_DIR: downloadsDir,
      },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeChildProcesses.add(child);

    let stdout = "";
    let stderr = "";
    let lastPercent = 0;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      clearTimeout(timer);
      fn(value);
    };
    const onAbort = () => {
      try {
        child.kill();
      } catch {
        // Best effort only.
      }
      finish(reject, createPauseError());
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Best effort only.
      }
      finish(reject, new Error("处理超时，请换个链接再试"));
    }, 5 * 60 * 1000);
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;

      if (text.includes("解析")) {
        onProgress({ percent: Math.max(lastPercent, 5), message: "正在解析视频" });
      }
      if (text.includes("下载")) {
        onProgress({ percent: Math.max(lastPercent, 10), message: "正在下载视频" });
      }

      const matches = [...text.matchAll(/([0-9]+(?:\.[0-9]+)?)%/g)];
      if (matches.length > 0) {
        const percent = Math.max(...matches.map((match) => Number(match[1])).filter(Number.isFinite));
        if (Number.isFinite(percent) && percent >= lastPercent) {
          lastPercent = Math.min(99, percent);
          onProgress({
            percent: lastPercent,
            message: `正在下载 ${lastPercent.toFixed(1)}%`,
          });
        }
      }
    });
    child.on("error", (error) => {
      finish(reject, error);
    });
    child.on("close", () => {
      activeChildProcesses.delete(child);
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const responses = [];
      for (const line of lines) {
        try {
          responses.push(JSON.parse(line));
        } catch {
          // The MCP channel should be JSON lines; ignore anything else.
        }
      }

      const toolResponse = responses.find((item) => item.id === 2);
      if (!toolResponse) {
        finish(reject, new Error(stderr.trim() || "没有收到工具返回结果"));
        return;
      }

      if (toolResponse.error) {
        finish(reject, new Error(toolResponse.error.message || "工具调用失败"));
        return;
      }

      const text = toolResponse.result?.content?.map((item) => item.text).join("\n") || "";
      onProgress({ percent: toolResponse.result?.isError ? lastPercent : 100, message: toolResponse.result?.isError ? "下载失败" : "下载完成" });
      finish(resolve, {
        isError: Boolean(toolResponse.result?.isError),
        text,
        raw: toolResponse.result,
        log: stderr.trim(),
      });
    });

    const input = [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "douyin-local-page", version: "1.0.0" },
        },
      },
      {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name,
          arguments: { share_link: shareLink },
        },
      },
    ]
      .map((item) => JSON.stringify(item))
      .join("\n");

    child.stdin.end(`${input}\n`);
  });
}

function validateShareLink(shareLink) {
  const firstUrl = getFirstUrl(shareLink);
  if (!firstUrl) {
    return "请先粘贴 yt-dlp 可识别的平台视频链接";
  }
  return "";
}

function createDownloadJob(shareLink) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const firstUrl = getFirstUrl(shareLink);
  const job = {
    id,
    status: "running",
    percent: 0,
    message: "准备下载",
    text: "",
    files: listDownloads(),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  downloadJobs.set(id, job);

  const updateJob = (changes) => {
    Object.assign(job, changes, { updatedAt: new Date().toISOString() });
  };

  const runner = isLikelyDouyinUrl(firstUrl)
    ? runMcpTool("download_douyin_video", shareLink, (progress) => {
      updateJob({
        percent: Math.max(job.percent, Math.round(Number(progress.percent || 0))),
        message: progress.message || job.message,
      });
    })
    : ytDlpService.download(firstUrl, {
      onProgress: (progress) => {
        updateJob({
          percent: Math.max(job.percent, Math.round(Number(progress.percent || 0))),
          message: progress.message || job.message,
        });
      },
    }).then((result) => ({
      isError: false,
      text: [
        "yt-dlp 下载完成",
        `标题：${result.videoInfo?.title || ""}`,
        `视频：${result.videoPath || ""}`,
        result.subtitlePath ? `字幕：${result.subtitlePath}` : "",
      ].filter(Boolean).join("\n"),
    }));

  runner.then((result) => {
      updateJob({
        status: result.isError ? "error" : "done",
        percent: result.isError ? job.percent : 100,
        message: result.isError ? "下载失败" : "下载完成",
        text: result.text,
        files: listDownloads(),
      });
    })
    .catch((error) => {
      updateJob({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        text: error instanceof Error ? error.message : String(error),
        files: listDownloads(),
      });
    })
    .finally(() => {
      setTimeout(() => downloadJobs.delete(id), 30 * 60 * 1000);
      scheduleShutdownIfIdle();
    });

  return job;
}

async function submitDashScopeTask(apiKey, fileUrl) {
  const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: "paraformer-v2",
      input: { file_urls: [fileUrl] },
      parameters: {
        channel_id: [0],
        language_hints: ["zh", "en"],
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.code || "语音识别任务提交失败");
  }

  const taskId = data.output?.task_id;
  if (!taskId) {
    throw new Error("没有收到语音识别任务ID");
  }
  return taskId;
}

async function fetchDashScopeTask(apiKey, taskId) {
  const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.code || "查询语音识别任务失败");
  }
  return data;
}

async function fetchTranscriptionJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "读取识别结果失败");
  }
  return data;
}

function extractTranscriptText(resultJson) {
  const transcripts = resultJson.transcripts || resultJson.transcript || [];
  if (Array.isArray(transcripts) && transcripts.length > 0) {
    const text = transcripts.map((item) => item.text || item.transcript || "").filter(Boolean).join("\n");
    if (text.trim()) return text.trim();
  }

  if (typeof resultJson.text === "string" && resultJson.text.trim()) {
    return resultJson.text.trim();
  }

  const sentences = resultJson.sentences || transcripts[0]?.sentences || [];
  if (Array.isArray(sentences) && sentences.length > 0) {
    const text = sentences.map((item) => item.text || "").filter(Boolean).join("");
    if (text.trim()) return text.trim();
  }

  return "";
}

function saveTranscript(videoInfo, transcriptText) {
  const title = videoInfo.title || videoInfo.videoId || `douyin_${Date.now()}`;
  const filePath = makeUniquePath(`${title}_文案`, ".txt", "transcript");
  fs.writeFileSync(filePath, `${transcriptText}\n`, "utf8");
  return filePath;
}

function findExistingFile(videoInfo, extensions, marker = "") {
  const videoId = String(videoInfo.videoId || "").toLowerCase();
  const safeTitle = sanitizeFileName(videoInfo.title || "").slice(0, 120).toLowerCase();
  const candidates = listDownloads().filter((file) => {
    const lower = file.name.toLowerCase();
    return extensions.some((extension) => lower.endsWith(extension)) && (!marker || lower.includes(marker));
  });

  for (const file of candidates) {
    const lower = file.name.toLowerCase();
    if ((videoId && lower.includes(videoId)) || (safeTitle && lower.startsWith(safeTitle))) {
      const filePath = file.path || path.join(downloadsDir, file.name);
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return filePath;
    }
  }
  return "";
}

function findExistingVideo(videoInfo) {
  return findExistingFile(videoInfo, [".mp4", ".mov", ".mkv"]);
}

function findExistingTranscript(videoInfo) {
  return findExistingFile(videoInfo, [".txt"], "文案");
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath);
  stream.on("data", (chunk) => hash.update(chunk));
  await once(stream, "end");
  return hash.digest("hex");
}

async function downloadVideoFile(videoInfo, onProgress = () => {}, signal) {
  throwIfPaused(signal);
  if (!videoInfo.downloadUrl) {
    throw new Error("没有可用的视频下载链接");
  }

  const baseName = `${videoInfo.title || videoInfo.videoId || "douyin"}_${videoInfo.videoId || Date.now()}`;
  const filePath = makeUniquePath(baseName, ".mp4", "video");
  const partialPath = `${filePath}.download`;
  const response = await fetch(videoInfo.downloadUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`视频下载请求失败：HTTP ${response.status}`);
  }

  const total = Number(response.headers.get("content-length") || 0);
  let downloaded = 0;
  const writer = fs.createWriteStream(partialPath);

  try {
    for await (const chunk of response.body) {
      throwIfPaused(signal);
      const buffer = Buffer.from(chunk);
      downloaded += buffer.length;
      if (!writer.write(buffer)) {
        await once(writer, "drain");
      }
      if (total > 0) {
        onProgress({
          percent: Math.min(99, downloaded / total * 100),
          downloaded,
          total,
          message: `正在下载 ${(downloaded / total * 100).toFixed(1)}%`,
        });
      } else {
        onProgress({
          percent: 20,
          downloaded,
          total,
          message: `正在下载 ${(downloaded / 1024 / 1024).toFixed(1)}MB`,
        });
      }
    }
    writer.end();
    await once(writer, "finish");

    const stat = fs.statSync(partialPath);
    if (stat.size <= 1024) {
      throw new Error("下载文件过小，可能不是完整视频");
    }
    if (total > 0 && stat.size !== total) {
      throw new Error(`下载完整性校验失败：${stat.size}/${total} 字节`);
    }

    fs.renameSync(partialPath, filePath);
    return {
      filePath,
      fileSize: stat.size,
      fileHash: await hashFile(filePath),
    };
  } catch (error) {
    writer.destroy();
    try {
      if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath);
    } catch {
      // Ignore cleanup errors for partial downloads.
    }
    throw error;
  }
}

function runFfmpeg(args, signal) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("未找到音频转码组件，请重新运行安装依赖"));
      return;
    }

    const child = spawn(ffmpegPath, args, {
      cwd: __dirname,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    activeChildProcesses.add(child);

    let stderr = "";
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      activeChildProcesses.delete(child);
      fn(value);
    };
    const onAbort = () => {
      try {
        child.kill();
      } catch {
        // Best effort only.
      }
      finish(reject, createPauseError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-6000);
    });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      if (code === 0) {
        finish(resolve);
        return;
      }
      finish(reject, new Error(`音频转码失败：${stderr.trim() || `ffmpeg exited with ${code}`}`));
    });
  });
}

async function convertMediaToAsrWav(mediaPath, signal) {
  const wavPath = makeUniquePath(`${path.basename(mediaPath, path.extname(mediaPath))}_asr`, ".wav", "audio");
  await runFfmpeg([
    "-y",
    "-i",
    mediaPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-acodec",
    "pcm_s16le",
    wavPath,
  ], signal);

  const stat = fs.statSync(wavPath);
  if (stat.size <= 44) {
    throw new Error("音频转码后为空，无法识别文案");
  }
  return wavPath;
}

function sendDashScopeWsJson(ws, value) {
  ws.send(JSON.stringify(value));
}

function transcribeWavWithDashScopeRealtime(apiKey, wavPath, onProgress = () => {}, signal) {
  return new Promise((resolve, reject) => {
    const taskId = randomUUID().replace(/-/g, "").slice(0, 32);
    const ws = new WebSocket("wss://dashscope.aliyuncs.com/api-ws/v1/inference", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const stat = fs.statSync(wavPath);
    const parts = [];
    let latestPartial = "";
    let lastEndedText = "";
    let stream = null;
    let settled = false;
    let sentBytes = 0;

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (stream) stream.destroy();
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      } catch {
        // Best effort only.
      }
      fn(value);
    };
    const onAbort = () => finish(reject, createPauseError());
    const timeout = setTimeout(() => {
      finish(reject, new Error("本地流式识别超时，请稍后重试"));
    }, 30 * 60 * 1000);

    signal?.addEventListener("abort", onAbort, { once: true });

    const sendFinishTask = () => {
      sendDashScopeWsJson(ws, {
        header: {
          action: "finish-task",
          task_id: taskId,
          streaming: "duplex",
        },
        payload: {
          input: {},
        },
      });
    };

    const sendAudioStream = () => {
      stream = fs.createReadStream(wavPath, { highWaterMark: 32 * 1024 });
      stream.on("data", (chunk) => {
        throwIfPaused(signal);
        stream.pause();
        ws.send(chunk, (error) => {
          if (error) {
            finish(reject, error);
            return;
          }
          sentBytes += chunk.length;
          onProgress({
            percent: Math.min(88, 45 + (sentBytes / stat.size) * 35),
            message: "正在本地流式识别",
          });
          setTimeout(() => {
            if (!settled) stream.resume();
          }, 60);
        });
      });
      stream.on("end", () => {
        onProgress({ percent: 90, message: "正在整理识别结果" });
        sendFinishTask();
      });
      stream.on("error", (error) => finish(reject, error));
    };

    ws.on("open", () => {
      onProgress({ percent: 38, message: "正在连接本地流式识别" });
      sendDashScopeWsJson(ws, {
        header: {
          action: "run-task",
          task_id: taskId,
          streaming: "duplex",
        },
        payload: {
          task_group: "audio",
          task: "asr",
          function: "recognition",
          model: "paraformer-realtime-v2",
          parameters: {
            format: "wav",
            sample_rate: 16000,
            language_hints: ["zh", "en"],
            punctuation_prediction_enabled: true,
            semantic_punctuation_enabled: false,
          },
          input: {},
        },
      });
    });

    ws.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString("utf8"));
      } catch {
        return;
      }

      const event = message.header?.event;
      if (event === "task-started") {
        onProgress({ percent: 42, message: "正在发送本地音频" });
        sendAudioStream();
        return;
      }

      if (event === "result-generated") {
        const sentence = message.payload?.output?.sentence || {};
        if (sentence.heartbeat) return;
        const text = String(sentence.text || "").trim();
        if (!text) return;
        if (sentence.sentence_end) {
          if (text !== lastEndedText) {
            parts.push(text);
            lastEndedText = text;
          }
          latestPartial = "";
        } else {
          latestPartial = text;
        }
        return;
      }

      if (event === "task-finished") {
        if (latestPartial && latestPartial !== lastEndedText) parts.push(latestPartial);
        const transcript = parts.join("\n").trim();
        if (!transcript) {
          finish(reject, new Error("没有识别到可用文案"));
          return;
        }
        onProgress({ percent: 95, message: "文案识别完成" });
        finish(resolve, transcript);
        return;
      }

      if (event === "task-failed") {
        finish(reject, new Error(message.header?.error_message || "本地流式识别失败"));
      }
    });

    ws.on("error", (error) => finish(reject, error));
    ws.on("close", () => {
      if (!settled) finish(reject, new Error("本地流式识别连接已关闭"));
    });
  });
}

async function transcribeLocalMediaWithDashScope(apiKey, mediaPath, onProgress = () => {}, signal) {
  let wavPath = "";
  try {
    onProgress({ percent: 28, message: "正在转换本地音频" });
    wavPath = await convertMediaToAsrWav(mediaPath, signal);
    return await transcribeWavWithDashScopeRealtime(apiKey, wavPath, onProgress, signal);
  } finally {
    if (wavPath) {
      try {
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      } catch {
        // Best effort cleanup only.
      }
    }
  }
}

async function extractTranscriptForVideoInfo(videoInfo, apiKey, onProgress = () => {}, signal, options = {}) {
  throwIfPaused(signal);
  if (!videoInfo.downloadUrl) {
    throw new Error("没有解析到可识别的视频地址");
  }

  try {
    onProgress({ percent: 18, message: "正在提交语音识别" });
    const taskId = await submitDashScopeTask(apiKey, videoInfo.downloadUrl);
    let pollCount = 0;

    while (true) {
      throwIfPaused(signal);
      pollCount += 1;
      await delay(3000, signal);
      const task = await fetchDashScopeTask(apiKey, taskId);
      const status = task.output?.task_status || task.task_status || "";
      onProgress({
        percent: Math.min(88, 25 + pollCount * 4),
        message: "语音识别中",
      });

      if (status === "SUCCEEDED") {
        const firstResult = task.output?.results?.find((item) => item.transcription_url) || task.output?.results?.[0];
        if (!firstResult?.transcription_url) {
          throw new Error(firstResult?.message || "识别完成但没有返回文案地址");
        }

        onProgress({ percent: 92, message: "正在读取文案" });
        const resultJson = await fetchTranscriptionJson(firstResult.transcription_url);
        const transcriptText = extractTranscriptText(resultJson);
        if (!transcriptText) {
          throw new Error("没有识别到可用文案");
        }
        return transcriptText;
      }

      if (status === "FAILED" || status === "CANCELED") {
        const failedResult = task.output?.results?.find((item) => item.subtask_status === "FAILED");
        throw new Error(failedResult?.message || task.output?.message || "语音识别失败");
      }
    }
  } catch (error) {
    if (!isRemoteFileFetchError(error)) throw error;

    onProgress({ percent: 20, message: "云端拉取失败，改用本地识别" });
    let localVideoPath = options.localVideoPath && fs.existsSync(options.localVideoPath) ? options.localVideoPath : "";
    let temporaryVideoPath = "";
    try {
      if (!localVideoPath) {
        const sourceUrl = String(options.sourceUrl || videoInfo.webpageUrl || "").trim();
        if (sourceUrl) {
          const downloaded = await ytDlpService.download(sourceUrl, {
            signal,
            onProgress: (progress) => {
              const raw = Number(progress.percent || 0);
              onProgress({
                percent: Math.min(45, 20 + raw * 0.25),
                message: progress.message || "正在通过 yt-dlp 本地下载视频",
              });
            },
          });
          localVideoPath = downloaded.videoPath;
          temporaryVideoPath = localVideoPath;
        } else {
          const downloaded = await downloadVideoFile(videoInfo, (progress) => {
            const raw = Number(progress.percent || 0);
            onProgress({
              percent: Math.min(45, 20 + raw * 0.25),
              message: progress.message || "正在本地下载视频",
            });
          }, signal);
          localVideoPath = downloaded.filePath;
          temporaryVideoPath = localVideoPath;
        }
      }

      return await transcribeLocalMediaWithDashScope(apiKey, localVideoPath, onProgress, signal);
    } finally {
      if (temporaryVideoPath) {
        try {
          if (fs.existsSync(temporaryVideoPath)) fs.unlinkSync(temporaryVideoPath);
        } catch {
          // Best effort cleanup only.
        }
      }
    }
  }
}

function splitChineseSentences(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

function pickSentence(sentences, patterns, fallback = "") {
  return sentences.find((sentence) => patterns.some((pattern) => pattern.test(sentence))) || sentences[0] || fallback;
}

function analyzeTranscriptText(text) {
  const sentences = splitChineseSentences(text);
  const tagRules = [
    ["高考", /高考|志愿|分数线|录取|本科|专科/],
    ["单招", /单招|综评|春考|职教/],
    ["学习方法", /学习方法|背单词|复习|刷题|提分|效率/],
    ["英语", /英语|口语|单词|听力|语法|雅思|托福/],
    ["家长教育", /家长|孩子|父母|家庭教育|陪伴/],
    ["AI", /AI|人工智能|提示词|模型|自动化/],
    ["职业规划", /就业|职业|简历|面试|规划|岗位/],
  ];
  const tags = tagRules.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
  const hook = pickSentence(sentences, [/你知道|很多人|为什么|别再|一定要|普通人|关键是|只要/], "开头需要补充更明确的钩子");
  const painPoint = pickSentence(sentences, [/不会|不知道|困难|焦虑|问题|失败|浪费|瓶颈|卡住|痛点/], "痛点不明显，建议补一句目标人群正在遇到的问题");
  const emotionPoint = pickSentence(sentences, [/焦虑|希望|害怕|惊喜|后悔|轻松|自信|坚持|改变|逆袭/], "情绪点偏弱，可强化焦虑、希望或成就感");
  const callToAction = pickSentence(sentences, [/关注|收藏|评论|私信|点赞|转发|马上|现在|试试|点击/], "行动号召不明显，可补充收藏、评论或私信引导");

  return {
    hook,
    emotionPoints: [emotionPoint],
    painPoints: [painPoint],
    callToAction,
    tags: tags.length > 0 ? tags : ["未分类"],
    summary: sentences.slice(0, 3).join("。").slice(0, 240),
  };
}

function normalizeAnalysis(value, fallbackText = "") {
  const analysis = value && typeof value === "object" ? value : {};
  const arrayValue = (key, fallback = []) => {
    const current = analysis[key];
    if (Array.isArray(current)) return current.map((item) => String(item || "").trim()).filter(Boolean);
    if (typeof current === "string" && current.trim()) return [current.trim()];
    return fallback;
  };

  const fallback = analyzeTranscriptText(fallbackText || [
    analysis.summary,
    analysis.hook,
    ...arrayValue("emotionPoints"),
    ...arrayValue("painPoints"),
    analysis.callToAction,
  ].filter(Boolean).join("。"));

  return {
    hook: String(analysis.hook || fallback.hook || "").trim(),
    emotionPoints: arrayValue("emotionPoints", fallback.emotionPoints),
    painPoints: arrayValue("painPoints", fallback.painPoints),
    callToAction: String(analysis.callToAction || fallback.callToAction || "").trim(),
    tags: arrayValue("tags", fallback.tags),
    category: String(analysis.category || analysis.primaryCategory || (Array.isArray(analysis.tags) ? analysis.tags[0] : "") || fallback.tags?.[0] || "未分类").trim(),
    summary: String(analysis.summary || fallback.summary || "").trim(),
    source: String(analysis.source || "dashscope-qwen").trim(),
  };
}

function parseJsonFromModelText(text) {
  const value = String(text || "").trim();
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(value.slice(start, end + 1));
    }
    throw new Error("AI 分析没有返回 JSON");
  }
}

async function analyzeTranscriptWithDashScope(apiKey, transcriptText, videoInfo, signal) {
  throwIfPaused(signal);
  const model = getBatchSettings().aiModel || "qwen-plus";
  const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "你是短视频内容分析师。请只输出 JSON，不要 Markdown。",
            "字段必须包含：hook, emotionPoints, painPoints, callToAction, tags, category, summary。",
            "tags 必须是中文数组，自动分类要贴合内容，例如：高考、单招、学习方法、英语、家长教育、AI。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `标题：${videoInfo.title || ""}`,
            "文案：",
            String(transcriptText || "").slice(0, 12000),
          ].join("\n"),
        },
      ],
    }),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || data.error?.message || `AI 分析请求失败：HTTP ${response.status}`;
    if (isModelContentInspectionError(message)) {
      return normalizeAnalysis({ ...analyzeTranscriptText(transcriptText), source: "local-rules" }, transcriptText);
    }
    throw new Error(message);
  }

  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseJsonFromModelText(content);
  return normalizeAnalysis({ ...parsed, source: model }, transcriptText);
}

function cleanModelText(value) {
  return String(value || "")
    .replace(/^```(?:text|markdown|md)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function isModelContentInspectionError(error) {
  return /DataInspectionFailed|inappropriate content|content inspection|内容审核|数据检查|输出内容/i.test(errorMessage(error));
}

function locallyCorrectTranscriptText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/[，,]\s*/g, "，")
    .replace(/[。\.]\s*/g, "。")
    .replace(/[！？!?]\s*/g, (match) => match.includes("!") || match.includes("！") ? "！" : "？")
    .replace(/([。！？]){2,}/g, "$1")
    .trim();
}

async function correctTranscriptWithRewriteModel(rawText, videoInfo = {}, signal) {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("没有可校正的文案");
  const provider = await getRewriteProvider("");
  try {
    const content = await chatCompletion(provider, [
      {
        role: "system",
        content: [
          "你是短视频 ASR 文案校正员，使用 copy-editing 高分规则和短视频转写清洗规则。",
          "采用 copy-editing 的核心原则：提升清晰度、修复语句问题、保持语气一致、保留作者原意。",
          "采用短视频转写清洗原则：清理噪声 ASR、同音错词、断句、标点、重复口吃和明显识别错误。",
          "禁止使用营销改写项：不要补利益点、不要添加证明、不要强化情绪、不要改写成新文案。",
          "准确性优先：不确定的词不要编造；能从上下文确定才修正，无法确定时保留原词或标注【听不清】。",
          "内部自检：逐句对照原文，确保核心信息、顺序、数字、人名、地名、品牌名没有被改动。",
          "只输出校正后的最终文案。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `标题：${videoInfo.title || ""}`,
          `平台：${videoInfo.extractor || videoInfo.platform || ""}`,
          "待校正文案：",
          text.slice(0, 20000),
        ].join("\n"),
      },
    ], signal, {
      temperature: 0.1,
      requestName: "文案校正",
      maxTokens: Math.min(12000, Math.max(2000, Math.ceil(text.length * 1.8))),
    });
    const corrected = cleanModelText(content);
    if (!corrected) throw new Error("文案校正没有返回结果");
    return corrected;
  } catch (error) {
    if (!isModelContentInspectionError(error)) throw error;
    return locallyCorrectTranscriptText(text);
  }
}

function normalizeRewriteVersionContent(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${key}：${item}`)
      .join("\n")
      .trim();
  }
  return String(value || "").trim();
}

function normalizeWordCount(input, fallback = "160字左右") {
  const value = String(input || "").trim().replace(/\s+/g, " ");
  return value ? value.slice(0, 32) : fallback;
}

function normalizeVersionSpecs(input = [], fallbackDirection = "保留原意优化") {
  const defs = new Map(REWRITE_VERSION_DEFS.map(([key, name]) => [key, { key, name }]));
  const rows = Array.isArray(input) && input.length > 0
    ? input
    : REWRITE_VERSION_DEFS.map(([key, name]) => ({ key, name }));
  const seen = new Set();
  return rows
    .map((item, index) => {
      const rawKey = String(item?.key || "").trim();
      const known = defs.get(rawKey);
      const key = (known?.key || rawKey || `custom${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || `custom${index + 1}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const defaults = REWRITE_VERSION_DEFAULTS[key] || {};
      const direction = REWRITE_DIRECTIONS.includes(String(item?.direction || "")) ? String(item.direction) : defaults.direction || fallbackDirection;
      const wordCount = normalizeWordCount(item?.wordCount, defaults.wordCount || "160字左右");
      return {
        key,
        name: String(item?.name || known?.name || `版本 ${index + 1}`).trim().slice(0, 40) || `版本 ${index + 1}`,
        direction,
        wordCount,
        provider: String(item?.provider || "").trim(),
        style: REWRITE_STYLES.includes(String(item?.style || "")) ? String(item.style) : "",
        referenceStyle: String(item?.referenceStyle || "").trim(),
        params: item?.params && typeof item.params === "object" ? item.params : {},
        humanizeLevel: String(item?.humanizeLevel || "").trim(),
      };
    })
    .filter(Boolean)
    .slice(0, 50);
}

function readVersionValue(source, spec) {
  if (Array.isArray(source.versions)) {
    const match = source.versions.find((item) => item?.key === spec.key || item?.name === spec.name);
    return match?.content || match?.text || "";
  }
  return source[spec.key] ?? source[spec.name] ?? source.versions?.[spec.key] ?? source.versions?.[spec.name] ?? "";
}

function normalizeRewrite(raw, meta = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const versionSpecs = normalizeVersionSpecs(meta.versionSpecs, meta.direction || "保留原意优化");
  const versions = versionSpecs.map((spec) => {
    const value = readVersionValue(source, spec);
      return {
        ...spec,
        content: normalizeRewriteVersionContent(value),
        provider: spec.provider || source.versions?.find?.((item) => item?.key === spec.key)?.provider || meta.provider || "",
        style: spec.style || source.versions?.find?.((item) => item?.key === spec.key)?.style || meta.style || "",
        referenceStyle: spec.referenceStyle || source.versions?.find?.((item) => item?.key === spec.key)?.referenceStyle || meta.referenceStyle || "",
        params: Object.keys(spec.params || {}).length ? spec.params : source.versions?.find?.((item) => item?.key === spec.key)?.params || meta.params || {},
        humanizeLevel: spec.humanizeLevel || source.versions?.find?.((item) => item?.key === spec.key)?.humanizeLevel || meta.humanizeLevel || "",
      };
    });

  return {
    provider: meta.provider || "",
    model: meta.model || "",
    direction: meta.direction || "保留原意优化",
    style: meta.style || "痞里带刺",
    referenceStyle: meta.referenceStyle || DEFAULT_REWRITE_REFERENCE,
    params: meta.params || {},
    humanizeLevel: meta.humanizeLevel || "普通",
    referenceExamples: normalizeReferenceExamples(meta.referenceExamples || []),
    structure: meta.structure || source.structure || {},
    humanizerNotes: Array.isArray(meta.humanizerNotes) ? meta.humanizerNotes : [],
    generatedAt: meta.generatedAt || new Date().toISOString(),
    versions,
  };
}

function rewriteFromBody(body = {}, task = {}) {
  const versionsInput = Array.isArray(body.versions) ? body.versions : [];
  const params = body.params && typeof body.params === "object" ? body.params : safeJsonParse(task.rewrite_params_json);
  const versionSpecs = normalizeVersionSpecs(versionsInput, body.direction || task.rewrite_direction || "保留原意优化");
  return normalizeRewrite({
    versions: Object.fromEntries(
      versionsInput.map((item) => [
        item.key || item.name,
        item.content,
      ])
    ),
  }, {
    provider: body.provider || task.rewrite_model || "",
    model: body.model || task.rewrite_model || "",
    direction: body.direction || task.rewrite_direction || "保留原意优化",
    style: body.style || task.rewrite_style || "痞里带刺",
    referenceStyle: body.referenceStyle || DEFAULT_REWRITE_REFERENCE,
    params,
    humanizeLevel: body.humanizeLevel || task.humanize_level || params.humanizeLevel || "普通",
    referenceExamples: body.referenceExamples || safeJsonParse(task.reference_examples_json),
    versionSpecs,
    generatedAt: body.generatedAt || new Date().toISOString(),
  });
}

function rewriteToText(task, rewrite, format = "txt") {
  const title = task.title || task.video_id || `任务 ${task.id}`;
  const header = [
    `# ${title} AI改写`,
    "",
    `- 模型：${rewrite.model || rewrite.provider || "-"}`,
    `- 改写方向：${rewrite.direction || "-"}`,
    `- 语气风格：${rewrite.style || "-"}`,
    `- 去AI味强度：${rewrite.humanizeLevel || "-"}`,
    `- 生成时间：${rewrite.generatedAt || ""}`,
    `- 参考案例：${Array.isArray(rewrite.referenceExamples) ? rewrite.referenceExamples.length : 0} 条`,
    "",
    "## 原文结构分析",
    "",
    `- hook：${rewrite.structure?.hook || ""}`,
    `- pain：${rewrite.structure?.pain || ""}`,
    `- emotion：${rewrite.structure?.emotion || ""}`,
    `- reverse：${rewrite.structure?.reverse || ""}`,
    `- solution：${rewrite.structure?.solution || ""}`,
    `- cta：${rewrite.structure?.cta || ""}`,
    "",
    "## 改写参数",
    "",
    `- 口语化：${rewrite.params?.toneLevel || ""}`,
    `- 冲突度：${rewrite.params?.conflictLevel || ""}`,
    `- 情绪强度：${rewrite.params?.emotionLevel || ""}`,
    `- 销售感：${rewrite.params?.salesLevel || ""}`,
    "",
    "## 参考风格",
    "",
    rewrite.referenceStyle || DEFAULT_REWRITE_REFERENCE,
    "",
  ];
  const body = rewrite.versions
    .map((version) => [
      `## ${version.name}`,
      "",
      `- 模型：${version.provider || rewrite.provider || rewrite.model || "-"}`,
      `- 方向：${version.direction || rewrite.direction || "-"}`,
      `- 语气：${version.style || rewrite.style || "-"}`,
      `- 字数：${version.wordCount || "-"}`,
      `- 口语化：${version.params?.toneLevel || rewrite.params?.toneLevel || ""}`,
      `- 冲突度：${version.params?.conflictLevel || rewrite.params?.conflictLevel || ""}`,
      `- 情绪强度：${version.params?.emotionLevel || rewrite.params?.emotionLevel || ""}`,
      `- 销售感：${version.params?.salesLevel || rewrite.params?.salesLevel || ""}`,
      `- 去AI味：${version.humanizeLevel || rewrite.humanizeLevel || "-"}`,
      "",
      version.referenceStyle ? `参考风格：${version.referenceStyle}` : "",
      version.referenceStyle ? "" : "",
      version.content || "",
    ].join("\n"))
    .join("\n\n");

  if (format === "md") return `${header.join("\n")}${body}\n`;
  return `${title} AI改写\n\n${header.slice(2).join("\n")}${body.replace(/^## /gm, "")}\n`;
}

function saveRewriteForTask(task, rewrite, format = "txt") {
  fs.mkdirSync(rewritesDir, { recursive: true });
  const safeFormat = format === "txt" ? "txt" : "md";
  const filePath = path.join(rewritesDir, `${task.id}_rewrite.${safeFormat}`);
  fs.writeFileSync(filePath, rewriteToText(task, rewrite, safeFormat), "utf8");
  return taskStore.updateTask(task.id, {
    rewrite_path: filePath,
    rewrite_json: JSON.stringify(rewrite),
    rewrite_model: rewrite.model || rewrite.provider || "",
    rewrite_style: rewrite.style || "",
    rewrite_direction: rewrite.direction || "",
    rewrite_params_json: JSON.stringify(rewrite.params || {}),
    reference_examples_json: JSON.stringify(rewrite.referenceExamples || []),
    humanize_level: rewrite.humanizeLevel || "",
    message: task.message || "AI 改写已保存",
  });
}

async function getRewriteProvider(providerId) {
  const settings = readSettings();
  const requested = String(providerId || settings.rewrite.defaultProvider || "dashscope");
  const id = settings.rewriteProviders[requested] ? requested : "dashscope";
  const provider = await refreshProviderModel(settings, id);
  if (!provider) throw new Error("未知改写模型");
  if (!String(provider.apiKey || "").trim()) {
    throw new Error(`请先保存 ${provider.label} API Key`);
  }
  if (!String(provider.baseUrl || "").trim()) {
    throw new Error(`请先填写 ${provider.label} base_url`);
  }
  if (!String(provider.model || "").trim()) {
    throw new Error(`请先填写 ${provider.label} model`);
  }
  if (provider.autoModel !== false) writeSettings(settings);
  return { id, ...provider };
}

async function chatCompletion(provider, messages, signal, {
  temperature = 0.78,
  requestName = "AI 改写",
  maxTokens = 0,
  jsonMode = false,
} = {}) {
  const baseUrl = String(provider.baseUrl || "").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature,
      messages,
      ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawMessage = data.message || data.error?.message || data.error || `HTTP ${response.status}`;
    const message = String(rawMessage);
    const balancePattern = /余额|额度|欠费|充值|quota|credit|billing|insufficient|exceeded|payment|balance/i;
    const balanceTip = balancePattern.test(message)
      ? `\n可能是 ${provider.label} 余额/额度不足，请去后台查看：${provider.balanceUrl || provider.applyUrl || "平台控制台"}`
      : "";
    throw new Error(`${requestName}请求失败：${message}${balanceTip}`);
  }
  return data.choices?.[0]?.message?.content || "";
}

async function generateStructuredJson({
  providerId,
  messages,
  temperature,
  requestName = "结构化 AI",
  maxTokens = 12000,
}) {
  const provider = await getRewriteProvider(providerId);
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const retryInstruction = {
      role: "user",
      content: [
        attempt === 1
          ? "请直接返回严格 JSON。不要依赖平台 JSON Mode。"
          : "上一轮返回格式无法解析。请从头重新生成。",
        "只输出一个完整 JSON 对象，不要 Markdown、代码围栏、注释或解释。",
        "保持字段完整，但文字要紧凑，确保 JSON 在一次响应内完整结束。",
      ].join("\n"),
    };
    try {
      const content = await chatCompletion(
        provider,
        attempt === 0 ? messages : [...messages, retryInstruction],
        undefined,
        {
          temperature: attempt === 0 ? temperature : 0.1,
          requestName: `${requestName}（${provider.label} / ${provider.model}）`,
          maxTokens,
          jsonMode: attempt !== 1,
        },
      );
      return {
        data: parseJsonFromModelText(content),
        provider: provider.id,
        model: provider.model,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : `${requestName}（${provider.label} / ${provider.model}）连续三次生成失败。`,
  );
}

async function generateDirectorJson(options) {
  return generateStructuredJson({
    ...options,
    requestName: "AI 导演",
    maxTokens: 12000,
  });
}

function clampMomentsImageCount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.max(1, Math.min(3, Math.round(number)));
}

function normalizeMomentsStyle(value = "") {
  const style = String(value || "auto").trim();
  return ["auto", "xiaohei", "realistic"].includes(style) ? style : "auto";
}

function normalizeMomentsResult(raw = {}, fallback = {}) {
  const imageCount = clampMomentsImageCount(raw.image_count || raw.imageCount)
    || clampMomentsImageCount(fallback.imageCount)
    || 1;
  const post = String(raw.post || raw.copy || raw.text || "").trim();
  if (!post) throw new Error("朋友圈生成结果缺少文案。");
  const images = (Array.isArray(raw.images) ? raw.images : [])
    .slice(0, imageCount)
    .map((item, index) => {
      const prompt = String(item.prompt || "").trim();
      const materialHint = String(item.local_material_hint || item.localMaterialHint || fallback.localMaterials || "").trim();
      const cleanMaterialHint = /无本地素材|暂无本地素材/i.test(materialHint) ? "" : materialHint;
      return {
        index: index + 1,
        title: String(item.title || `配图 ${index + 1}`).trim().slice(0, 80),
        style: normalizeMomentsStyle(item.style || fallback.visualStyle),
        image_role: String(item.image_role || item.imageRole || "").trim().slice(0, 80),
        visual_hook: String(item.visual_hook || item.visualHook || "").trim().slice(0, 180),
        composition_type: String(item.composition_type || item.compositionType || "").trim().slice(0, 80),
        purpose: String(item.purpose || item.source_segment || item.sourceSegment || "").trim().slice(0, 500),
        prompt,
        negative_prompt: String(item.negative_prompt || item.negativePrompt || "").trim(),
        local_material_hint: cleanMaterialHint.slice(0, 800),
      };
    })
    .filter((item) => item.prompt);
  if (!images.length) throw new Error("朋友圈生成结果缺少配图提示词。");
  return {
    post,
    image_count: Math.min(imageCount, images.length),
    theme: String(raw.theme || fallback.theme || "朋友圈图文").trim().slice(0, 120),
    persona_used: String(raw.persona_used || fallback.persona || "").trim().slice(0, 1000),
    notes: Array.isArray(raw.notes) ? raw.notes.map((item) => String(item).trim()).filter(Boolean).slice(0, 6) : [],
    images,
  };
}

async function generateMomentsPostJson(body = {}) {
  const sourceText = String(body.text || "").trim();
  const persona = String(body.persona || "").trim();
  if (!sourceText) throw new Error("请先填写朋友圈文案输入区。");
  if (!persona) throw new Error("请先选择或填写人设。");
  const fixedImageCount = clampMomentsImageCount(body.imageCount);
  const visualStyle = normalizeMomentsStyle(body.visualStyle);
  const localMaterials = String(body.localMaterials || "").trim();
  const tone = String(body.tone || "普通朋友聊天式分享").trim();
  const intent = String(body.intent || "不强销售的自然分享").trim();
  const providerId = String(body.provider || readSettings().rewrite?.defaultProvider || "").trim();
  const imageCountRule = fixedImageCount
    ? `必须生成 ${fixedImageCount} 张配图。`
    : "根据文案内容判断生成 1-3 张配图；短内容 1 张，包含多个转折/案例/方法时 2-3 张。";
  const styleRule = {
    auto: "可以自动选择小黑漫画解释类或真实生活/产品场景类；同一条朋友圈的多张图必须统一主题和视觉方向。",
    xiaohei: "必须使用小黑漫画解释类：纯白背景、黑色手绘线稿、少量红橙蓝中文手写批注、大量留白，小黑作为核心动作主体；必须有视觉锤，不能只是小黑跑步、日历、路线或口号字。",
    realistic: "必须使用真实生活/产品场景类：自然真实、像手机拍到的生活/教学/产品场景，不要广告海报感，不要夸张摆拍；必须有鲜明主物件和情绪现场，不要普通资料摆拍。",
  }[visualStyle];
  const momentsCopySkill = [
    "朋友圈文案专业 Skill：",
    "1. 不是总结原文，而是把原文变成一条有人味、有判断、有余味的朋友圈分享。",
    "2. 默认结构：真实场景/触发点 -> 一句有力度的判断 -> 具体解释/经验 -> 给读者的轻提醒 -> 自然收尾。",
    "3. 开头要像真人刚经历或刚聊完一件事，不要像口号；允许用“刚跟家长聊完”“今天又被问到”“很多人容易忽略”这类生活化入口，但不能编造具体学生成绩或虚假案例。",
    "4. 中间必须有专业判断，不能只有“要坚持、要努力、要进步”这种空话；要指出为什么、怎么做、误区在哪里。",
    "5. 文案要有力度：有观点、有轻微反差、有具体动作建议，但不吓唬、不贩卖焦虑、不硬销售。",
    "6. 语气像普通朋友聊天式分享，可以真诚、克制、有一点温度；不要培训机构广告腔，不要鸡汤标语，不要短视频喊麦。",
    "7. 字数要求：朋友圈正文默认 120-220 个中文字符；原文很短也至少 90 字。用 4-8 个短段落换行输出，方便直接发朋友圈。",
    "8. 禁止干巴输出：不得只输出两句总结；不得只写“报名不是终点/坚持才有效”这类抽象口号；不得脱离原文另写一个无关故事。",
    "9. 示例只学习力度，不复用内容：刚聊完一个家长，我又想提醒一句：报名只是开始，真正拉开差距的，是后面每一周有没有把动作做扎实。孩子的变化不是靠某一次热情，而是靠持续反馈、及时调整和稳定陪伴。学习这件事，怕的不是慢，怕的是一直用错方法还没人帮他看见。",
  ].join("\n");
  const imagePromptSkill = [
    "图片提示词专业 Skill：",
    "1. 每张图必须服务朋友圈正文里的一个认知锚点，不做装饰图；必须和朋友圈正文是同一套主题，而不是孤立插图。",
    "2. 每张图都要有视觉锤：一个读者 1 秒能记住的核心画面。公式：抽象观点 -> 物理问题 -> 低科技怪物件 -> 小黑承担关键动作。",
    "3. 先判断这张图要表达：误区、方法、对比、路径、状态，任选一个，不要一张图塞多个概念。",
    "4. 小黑图要遵守 Ian 小黑正文配图规则：16:9、白底、黑色手绘、小黑承担核心动作、短中文批注、怪诞但清楚、禁止 PPT 和课程课件感。",
    "5. 禁止直译式弱图：不要只画小黑跑步、日历、打卡、普通道路、箭头、清单、奖杯、书本堆、空白大字；不要让中文大字成为画面主体。",
    "6. 小黑图优先从这些结构里选一个：前后对比、角色状态、概念隐喻、方法分层、小漫画分镜。要写清楚小黑在做什么怪动作，例如称重、修补、搬运、塞进漏斗、守门、拆包、扶梯子、拧阀门。",
    "7. 真实图要像生活/工作现场，不像广告海报；必须有明确主物件和关系，例如被圈画的规划表、桌面上两套学习路径、家长沟通记录、课堂反馈便签；不要二维码、Logo、水印和大段文字。",
    "8. 多图必须统一主题但分工不同：1 张时做封面冲击图；2 张时一张讲误区、一张讲正确动作；3 张时依次讲误区、方法、结果状态。",
    "9. 提示词必须包含：画面主题、视觉锤、结构类型、小黑/真实人物正在做什么、主要物件、最多 3-5 个短中文标注、颜色使用；如有真实本地素材，再包含本地素材参考。",
    "10. 只有用户上传或填写了真实本地素材时，才在提示词里写本地素材参考；没有素材时不要写“无本地素材”之类的占位废话。",
  ].join("\n");

  const { data, provider, model } = await generateStructuredJson({
    providerId,
    temperature: 0.76,
    requestName: "朋友圈图文生成",
    maxTokens: 9000,
    messages: [
      {
        role: "system",
        content: [
          "你是专业朋友圈图文内容策划与图片提示词工程师。",
          "你必须忠于用户给的原文主题和事实，不允许凭空编造行业、案例、数据、地点、人物身份或承诺效果。",
          "你的输出要有朋友圈传播力：不干巴、不空泛、不硬广，必须像真人在分享一个专业观察。",
          "输出必须是严格 JSON 对象，不要 Markdown，不要解释。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "任务：把原始文案改造成一条朋友圈图文草稿，并生成 1-3 张配图提示词。",
          "",
          "人设硬约束：",
          persona,
          "",
          momentsCopySkill,
          "",
          imagePromptSkill,
          "",
          "生成原则：",
          `- 语气：${tone}`,
          `- 用途：${intent}`,
          "- 做成不强销售的自然分享，像普通朋友真诚聊天，不要硬广，不要夸张承诺，不要制造焦虑。",
          "- 所有观点、措辞、图片主题都必须围绕人设，不要脱离人设身份。",
          "- 朋友圈文案需要保留原文核心意思，但可以调整结构、断句、表达顺序。",
          "- 可以有轻微生活化表达和真实感，但不能编造不存在的具体成绩、学生案例、金额、机构名。",
          "- 结尾允许自然提问或轻轻提醒，不要强 CTA。",
          "- 生成前自检：如果 post 少于 90 字、只有两句话、像标语、没有具体动作建议，就必须重写后再返回。",
          `- ${imageCountRule}`,
          `- 视觉方向：${styleRule}`,
          "- 多张图必须统一一个主题，每张承担不同角度；不要把多张图拼进一张图。",
          "",
          "小黑漫画解释类提示词要求：",
          "- 16:9 横版中文正文配图，纯白背景，黑色手绘线稿，少量红/橙/蓝中文手写批注，大量留白。",
          "- 小黑是黑色实心、白点眼、细腿、空表情的小怪物，必须承担核心动作，不只是装饰。",
          "- 一张图只讲一个核心结构或隐喻，禁止 PPT、课程课件、商业插画、幼稚可爱、复杂架构、左上角标题。",
          "",
          "真实生活/产品场景类提示词要求：",
          "- 画面真实自然，像手机或轻量商业摄影；可以是教室、书桌、咨询沟通、规划表、学习资料、家长沟通场景。",
          "- 不要夸张营销海报，不要二维码、水印、Logo、过度摆拍、不可读大段文字。",
          "",
          "本地图片素材说明：",
          localMaterials || "用户没有提供本地素材；不要在最终提示词里写“无本地素材”。",
          "",
          "原始文案：",
          sourceText.slice(0, 12000),
          "",
          "只返回 JSON，结构如下：",
          JSON.stringify({
            post: "朋友圈正文，可直接发布，可编辑",
            image_count: fixedImageCount || "1-3",
            theme: "统一图文主题",
            persona_used: "本次使用的人设摘要",
            notes: ["可选注意事项"],
            images: [
              {
                title: "配图标题",
                style: "xiaohei 或 realistic",
                image_role: "封面冲击图 / 误区图 / 方法图 / 结果状态图",
                visual_hook: "这张图的视觉锤，一句话说明",
                composition_type: "前后对比 / 角色状态 / 概念隐喻 / 方法分层 / 小漫画分镜 / 真实现场",
                purpose: "这张图对应原文/成品文案的哪一层意思",
                prompt: "完整可复制的图片生成提示词，必须包含本地素材说明或无素材说明",
                negative_prompt: "负面提示词",
                local_material_hint: "本地图像素材如何使用",
              },
            ],
            quality_gate: {
              post_has_scene: true,
              post_has_professional_judgment: true,
              post_not_dry_summary: true,
              prompts_follow_visual_skill: true,
            },
          }, null, 2),
        ].join("\n"),
      },
    ],
  });

  return {
    ok: true,
    provider,
    model,
    result: normalizeMomentsResult(data, {
      imageCount: fixedImageCount,
      visualStyle,
      localMaterials,
      persona,
      theme: "朋友圈图文",
    }),
  };
}

async function generateMomentsPostJsonV2(body = {}) {
  const sourceText = String(body.text || "").trim();
  const persona = String(body.persona || "").trim();
  if (!sourceText) throw new Error("请先填写朋友圈文案输入区。");
  if (!persona) throw new Error("请先选择或填写人设。");
  const fixedImageCount = clampMomentsImageCount(body.imageCount);
  const visualStyle = normalizeMomentsStyle(body.visualStyle);
  const localMaterials = String(body.localMaterials || "").trim();
  const tone = String(body.tone || "普通朋友聊天式分享").trim();
  const intent = String(body.intent || "不强销售的自然分享").trim();
  const providerId = String(body.provider || readSettings().rewrite?.defaultProvider || "").trim();
  const imageCountRule = fixedImageCount
    ? `必须生成 ${fixedImageCount} 张配图。`
    : "根据成品文案判断生成 1-3 张配图：短内容 1 张；有误区+方法 2 张；有误区+方法+结果状态 3 张。";
  const styleRule = {
    auto: "可以自动选择小黑漫画解释类或真实生活/产品场景类；同一条朋友圈的多张图必须统一主题和视觉方向。",
    xiaohei: "必须使用小黑漫画解释类：白底、黑色手绘线稿、少量红橙蓝短批注、大量留白，小黑承担核心动作；必须有视觉锤，禁止跑步、日历、道路、箭头、书本堆这种直译弱图。",
    realistic: "必须使用真实生活/产品场景类：像工作现场/学习现场/咨询现场的关键瞬间；必须有鲜明主物件和情绪现场，不要广告海报和普通资料摆拍。",
  }[visualStyle];
  const copySkill = [
    "朋友圈文案 Skill v2：私域自然分享，不是短视频口播，不是广告海报文案。",
    "目标：让读者感觉这是一个专业规划老师刚从真实工作里提炼出的观察，有人味、有判断、有具体动作。",
    "固定结构：生活化触发点 -> 专业判断 -> 具体解释 -> 可执行动作 -> 自然收尾。",
    "硬性质量：4-8 个短段落；110-260 个中文字符；必须有一个能记住的观点句、一个纠偏点、一个具体动作建议。",
    "禁止：两句总结、鸡汤口号、硬广 CTA、制造焦虑、凭空编学生案例/成绩/机构名/具体数字。",
    "不合格信号：像标语、像课程广告、只有提醒没有方法、只有观点没有场景、和原文关系弱。",
  ].join("\n");
  const imageSkill = [
    "图片提示词 Skill v2：先做视觉策略，再写生图提示词。",
    "每张图必须来自成品文案的认知锚点，不允许把文案字面翻译成跑步、日历、道路、箭头、书本堆、奖杯、清单。",
    "视觉锤公式：抽象观点 -> 物理冲突 -> 低科技怪物件/真实现场 -> 主体正在解决这个冲突。",
    "小黑图：16:9、白底、黑色手绘线稿、大量留白、少量红橙蓝短批注；小黑必须称重、修补、分拣、守门、拆包、扶梯子、拧阀门等，不是站着或跑着。",
    "真实图：像工作现场/学习现场/咨询现场，有主物件和关系，例如圈画的规划表、两套学习路径、沟通记录、反馈便签；不要广告海报、二维码、Logo、水印、大段文字。",
    "套组分工：1 张是封面冲击图；2 张是误区+方法；3 张是误区+方法+结果状态。多图必须统一视觉母题。",
    "没有真实素材时，不要写本地素材占位；用户上传素材后由系统追加。",
  ].join("\n");

  const copyRun = await generateStructuredJson({
    providerId,
    temperature: 0.82,
    requestName: "朋友圈文案生成",
    maxTokens: 5200,
    messages: [
      {
        role: "system",
        content: [
          "你是专业私域朋友圈文案策划。你只负责生成可发布的朋友圈正文和内容策略。",
          "必须忠于原文事实，不得凭空新增行业、案例、数据、人物身份或承诺效果。",
          "输出要有人味、有力度、有专业判断，不干巴、不空泛、不硬广。",
          "只输出严格 JSON。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          copySkill,
          "",
          "人设：",
          persona,
          "",
          `语气：${tone}`,
          `用途：${intent}`,
          "",
          "原始文案：",
          sourceText.slice(0, 12000),
          "",
          "返回 JSON：",
          JSON.stringify({
            post: "朋友圈正文，可直接发布，可编辑",
            theme: "统一主题",
            angle: "内容切入角度",
            core_judgment: "最有力度的专业判断句",
            visual_anchor: "后续图片应围绕的视觉母题",
            persona_used: "人设摘要",
            quality_gate: {
              post_has_scene: true,
              post_has_professional_judgment: true,
              post_not_dry_summary: true,
              post_has_action_advice: true,
            },
          }, null, 2),
        ].join("\n"),
      },
    ],
  });

  let copyData = copyRun.data && typeof copyRun.data === "object" ? copyRun.data : {};
  let post = String(copyData.post || "").trim();
  if (rewriteCharacterCount(post) < 110 || !String(copyData.core_judgment || "").trim()) {
    const repaired = await generateStructuredJson({
      providerId,
      temperature: 0.55,
      requestName: "朋友圈文案质检修复",
      maxTokens: 5200,
      messages: [
        { role: "system", content: "你是朋友圈文案质检修复器。只输出严格 JSON。" },
        {
          role: "user",
          content: [
            "上一版不合格：太短、太干或缺少专业判断。请重写。",
            "硬性要求：110-260 中文字符，4-8 个短段落；必须有生活化触发点、专业判断、具体动作建议；不得编造事实。",
            "人设：",
            persona,
            "原始文案：",
            sourceText.slice(0, 12000),
            "上一版：",
            JSON.stringify(copyData, null, 2),
            "返回 JSON：",
            JSON.stringify({
              post: "重写后的朋友圈正文",
              theme: "统一主题",
              angle: "内容切入角度",
              core_judgment: "专业判断句",
              visual_anchor: "视觉母题",
              persona_used: "人设摘要",
            }, null, 2),
          ].join("\n\n"),
        },
      ],
    });
    copyData = repaired.data && typeof repaired.data === "object" ? repaired.data : copyData;
    post = String(copyData.post || post).trim();
  }

  const imageRun = await generateStructuredJson({
    providerId,
    temperature: 0.72,
    requestName: "朋友圈图片提示词生成",
    maxTokens: 7200,
    messages: [
      {
        role: "system",
        content: [
          "你是视觉创意总监和图片提示词工程师。",
          "你只负责基于已定稿朋友圈文案生成图片策略和生图提示词，不要改写朋友圈正文。",
          "只输出严格 JSON。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          imageSkill,
          "",
          "视觉方向：",
          styleRule,
          "",
          "配图数量规则：",
          imageCountRule,
          "",
          "人设：",
          persona,
          "",
          "朋友圈正文成品：",
          post,
          "",
          "文案策略：",
          JSON.stringify({
            theme: copyData.theme || "",
            angle: copyData.angle || "",
            core_judgment: copyData.core_judgment || "",
            visual_anchor: copyData.visual_anchor || "",
          }, null, 2),
          "",
          "本地图片素材说明：",
          localMaterials || "用户没有提供本地素材；不要在最终提示词里写“无本地素材”。",
          "",
          "返回 JSON：",
          JSON.stringify({
            image_count: fixedImageCount || "1-3",
            theme: "统一图文主题",
            notes: ["可选注意事项"],
            images: [
              {
                title: "配图标题",
                style: "xiaohei 或 realistic",
                image_role: "封面冲击图 / 误区图 / 方法图 / 结果状态图",
                visual_hook: "这张图的视觉锤，一句话说明",
                composition_type: "前后对比 / 角色状态 / 概念隐喻 / 方法分层 / 小漫画分镜 / 真实现场",
                purpose: "这张图对应成品文案的哪一层意思",
                prompt: "完整可复制的图片生成提示词",
                negative_prompt: "负面提示词",
                local_material_hint: "",
              },
            ],
            quality_gate: {
              prompts_have_visual_hook: true,
              prompts_not_literal_translation: true,
              prompts_share_one_theme: true,
              prompts_follow_visual_skill: true,
            },
          }, null, 2),
        ].join("\n"),
      },
    ],
  });

  const merged = {
    ...imageRun.data,
    post,
    theme: imageRun.data?.theme || copyData.theme || "朋友圈图文",
    persona_used: copyData.persona_used || persona,
    notes: [
      ...(Array.isArray(copyData.notes) ? copyData.notes : []),
      ...(Array.isArray(imageRun.data?.notes) ? imageRun.data.notes : []),
    ].slice(0, 6),
  };

  return {
    ok: true,
    provider: imageRun.provider || copyRun.provider,
    model: imageRun.model || copyRun.model,
    result: normalizeMomentsResult(merged, {
      imageCount: fixedImageCount,
      visualStyle,
      localMaterials,
      persona,
      theme: copyData.theme || "朋友圈图文",
    }),
  };
}

function chunkRowsByWordCount(rows, maxCharacters = 2600) {
  const chunks = [];
  let current = [];
  let currentCharacters = 0;
  for (const row of rows) {
    const range = requestedWordCountRange(row.wordCount);
    const estimatedCharacters = Math.max(120, Math.min(5000, Number.isFinite(range?.max) ? range.max : range?.min || 300));
    if (current.length > 0 && currentCharacters + estimatedCharacters > maxCharacters) {
      chunks.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(row);
    currentCharacters += estimatedCharacters;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function rewriteCharacterCount(value) {
  return Array.from(String(value || "").replace(/\s+/g, "")).length;
}

function requestedWordCountRange(input) {
  const value = String(input || "").trim();
  if (!value || /不限/.test(value)) return null;
  const range = value.match(/(\d+)\s*(?:-|—|~|～|至|到)\s*(\d+)/);
  if (range) {
    const first = Number(range[1]);
    const second = Number(range[2]);
    return { min: Math.min(first, second), max: Math.max(first, second) };
  }
  const number = Number(value.match(/\d+/)?.[0] || 0);
  if (!number) return null;
  if (/以内|以下|最多|不超过/.test(value)) return { min: 0, max: number };
  if (/以上|至少|不少于/.test(value)) return { min: number, max: Number.POSITIVE_INFINITY };
  const tolerance = Math.max(8, Math.round(number * 0.05));
  return { min: Math.max(1, number - tolerance), max: number + tolerance };
}

function wordCountIssues(versions, specs) {
  const byKey = new Map(versions.map((item) => [item.key, item]));
  return specs
    .map((spec) => {
      const range = requestedWordCountRange(spec.wordCount);
      if (!range) return null;
      const version = byKey.get(spec.key) || { ...spec, content: "" };
      const count = rewriteCharacterCount(version.content);
      if (count >= range.min && count <= range.max) return null;
      return { spec, version, count, range };
    })
    .filter(Boolean);
}

function truncateRewriteToLimit(value, maxCharacters) {
  const text = String(value || "").trim();
  if (!Number.isFinite(maxCharacters) || rewriteCharacterCount(text) <= maxCharacters) return text;
  let count = 0;
  let result = "";
  for (const character of Array.from(text)) {
    if (!/\s/.test(character)) {
      if (count >= maxCharacters) break;
      count += 1;
    }
    result += character;
  }
  result = result.trim().replace(/[，、；：,;:]+$/u, "");
  if (result && !/[。！？!?]$/u.test(result) && rewriteCharacterCount(result) < maxCharacters) result += "。";
  return result;
}

function padRewriteToMinimum(value, minCharacters, maxCharacters) {
  let result = String(value || "").trim();
  const supplements = [
    "别急着找捷径，先把每天该做的动作做扎实。",
    "把问题拆开、逐项检查，进步才会真正看得见。",
    "有效的方法不是听懂了，而是能够反复做到。",
    "今天就从最薄弱的一项开始，连续执行再看结果。",
    "方向对了还不够，真正拉开差距的是每天落实。",
    "少一点空想，多一次练习，结果自然会慢慢变化。",
    "先完成，再复盘，再调整，这比盲目努力更重要。",
    "愿意开始行动的人，才有机会把问题真正解决。",
  ];
  let supplementIndex = 0;
  while (rewriteCharacterCount(result) < minCharacters) {
    result = `${result}\n${supplements[supplementIndex % supplements.length]}`.trim();
    supplementIndex += 1;
  }
  return truncateRewriteToLimit(result, maxCharacters);
}

async function repairRewriteWordCounts(provider, versions, specs, signal) {
  let repaired = versions.map((item) => ({ ...item }));
  for (const spec of specs) {
    const range = requestedWordCountRange(spec.wordCount);
    if (!range) continue;
    const versionIndex = repaired.findIndex((item) => item.key === spec.key);
    if (versionIndex < 0) continue;
    let version = repaired[versionIndex];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const count = rewriteCharacterCount(version.content);
      if (count >= range.min && count <= range.max) break;
      const target = Number.isFinite(range.max)
        ? Math.round((range.min + range.max) / 2)
        : Math.max(range.min, count + Math.max(100, range.min - count));
      const correctedContent = await chatCompletion(provider, [
        {
          role: "system",
          content: "你是中文文案字数校准器。只输出 JSON，不要 Markdown，不要解释。",
        },
        {
          role: "user",
          content: [
            `只修正 key 为 ${spec.key} 的这一篇文案。`,
            `改写方向：${spec.direction}`,
            `用户要求：${spec.wordCount}`,
            `硬性合格范围：${range.min}-${Number.isFinite(range.max) ? range.max : "不限"} 字`,
            `本次目标：${target} 字`,
            `当前实际字数：${count} 字`,
            "字数按删除空格和换行后的字符数计算。",
            count < range.min
              ? `当前少 ${range.min - count} 字。必须补充具体细节、场景、痛点、解决办法和行动号召，不能只改几个词。`
              : `当前多 ${count - range.max} 字。必须压缩重复内容，但保留核心观点和行动号召。`,
            "返回前必须自行重新计数，不在合格范围内就继续调整。",
            `原文：\n${version.content}`,
            `输出格式：{"versions":{"${spec.key}":"修正后的完整文案"}}`,
          ].join("\n\n"),
        },
      ], signal, { temperature: 0.25 });
      const corrected = parseJsonFromModelText(correctedContent);
      const replacement = normalizeRewriteVersionContent(
        readVersionValue({ versions: corrected.versions || corrected }, spec)
      );
      if (replacement) version = { ...version, content: replacement };
    }
    if (Number.isFinite(range.max) && rewriteCharacterCount(version.content) > range.max) {
      version = { ...version, content: truncateRewriteToLimit(version.content, range.max) };
    }
    if (rewriteCharacterCount(version.content) < range.min && Number.isFinite(range.max)) {
      version = { ...version, content: padRewriteToMinimum(version.content, range.min, range.max) };
    }
    const finalCount = rewriteCharacterCount(version.content);
    if (finalCount < range.min || finalCount > range.max) {
      throw new Error(`${spec.name || spec.key} 字数校验失败：要求 ${spec.wordCount}，实际 ${finalCount} 字，请重新生成`);
    }
    repaired[versionIndex] = version;
  }
  return repaired;
}

async function rewriteTranscriptWithProvider({ providerId, transcriptText, analysis, direction, style, referenceStyle, params = {}, humanizeLevel: requestedHumanizeLevel = "", referenceExamples: inputReferenceExamples = [], versionSpecs: inputVersionSpecs = [], revisionInstruction = "", task, signal }) {
  const provider = await getRewriteProvider(providerId);
  const safeDirection = REWRITE_DIRECTIONS.includes(direction) ? direction : "短视频口播";
  const safeStyle = REWRITE_STYLES.includes(style) ? style : "小黑漫画解释类";
  const safeReference = String(referenceStyle || DEFAULT_REWRITE_REFERENCE).trim() || DEFAULT_REWRITE_REFERENCE;
  const safeParams = params && typeof params === "object" ? params : {};
  const versionSpecs = normalizeVersionSpecs(inputVersionSpecs, safeDirection);
  const humanizeLevel = String(requestedHumanizeLevel || safeParams.humanizeLevel || "普通");
  const referenceExamples = normalizeReferenceExamples(
    inputReferenceExamples?.length ? inputReferenceExamples : readReferenceExamples()
  );
  const assets = loadRewriteAssets();
  if (!assets.prompts.rewritePipeline) throw new Error("缺少 prompts/rewrite_pipeline.md");
  if (humanizeLevel !== "关闭" && !assets.prompts.humanizeZh) throw new Error("缺少 prompts/humanize_zh.md");
  const analysisText = analysis && Object.keys(analysis).length > 0
    ? JSON.stringify(analysis, null, 2)
    : "暂无 AI 分析结果。";

  const styleProfile = [
    `当前风格：${safeStyle}`,
    `参考风格：${safeReference}`,
  ].join("\n");
  const referenceExamplesText = referenceExamples.length
    ? referenceExamples.map((item, index) => `案例 ${index + 1}：\n${item.text}`).join("\n\n---\n\n")
    : "暂无参考案例。";
  const generatedVersions = [];
  const humanizerNotes = [];
  let structure = {};

  for (const specBatch of chunkRowsByWordCount(versionSpecs)) {
    throwIfPaused(signal);
    const pipelinePrompt = renderTemplate(assets.prompts.rewritePipeline, {
      original_text: String(transcriptText || "").slice(0, 12000),
      analysis_json: analysisText.slice(0, 6000),
      style_profile: styleProfile,
      reference_examples: referenceExamplesText,
      rewrite_direction: safeDirection,
      tone_level: safeParams.toneLevel || 8,
      conflict_level: safeParams.conflictLevel || 7,
      emotion_level: safeParams.emotionLevel || 7,
      sales_level: safeParams.salesLevel || 6,
      humanize_level: humanizeLevel,
      structure_goal: String(safeParams.structureGoal || "保留原文事实，强化表达结构。"),
      visible_difference: String(safeParams.visibleDifference || "结构和口吻要明显不同，但主题和事实不变。"),
      forbidden_inventions: String(safeParams.forbiddenInventions || "不得凭空新增行业、人物、场景、数据或案例。"),
      target_platform: String(safeParams.targetPlatform || ""),
      persona: String(safeParams.persona || ""),
      tone_preset: String(safeParams.tonePreset || ""),
      purpose: String(safeParams.purpose || safeDirection),
      revision_instruction: String(revisionInstruction || "").trim() || "无，按正常改写要求生成。",
      version_specs: JSON.stringify(specBatch, null, 2),
      skill_rewrite_douyin_education: assets.skills.rewriteEducation,
      skill_boss_style: assets.skills.bossStyle,
    });
    const draftContent = await chatCompletion(provider, [
      {
        role: "system",
        content: [
          "你是本地短视频文案定制改写 pipeline 执行器。",
          "你的第一优先级是忠于原文主题和事实，不允许把原文改成无关行业或无关故事。",
          "必须遵守注入的 Skill 和 Prompt 模板。",
          "只输出 JSON，不要 Markdown，不要解释。",
        ].join("\n"),
      },
      {
        role: "user",
        content: pipelinePrompt,
      },
    ], signal);
    const draft = parseJsonFromModelText(draftContent);
    let batchRewrite = normalizeRewrite(draft.versions ? { versions: draft.versions } : draft, {
      provider: provider.id,
      model: provider.model,
      direction: safeDirection,
      style: safeStyle,
      referenceStyle: safeReference,
      params: { ...safeParams, humanizeLevel },
      humanizeLevel,
      referenceExamples,
      versionSpecs: specBatch,
      structure: draft.structure || {},
    });
    if (Object.keys(structure).length === 0) structure = batchRewrite.structure;

    if (humanizeLevel !== "关闭") {
      const humanizePrompt = renderTemplate(assets.prompts.humanizeZh, {
        skill_humanizer_zh: assets.skills.humanizerZh,
        humanize_level: humanizeLevel,
        rewrite_direction: safeDirection,
        style_profile: styleProfile,
        tone_level: safeParams.toneLevel || 8,
        conflict_level: safeParams.conflictLevel || 7,
        emotion_level: safeParams.emotionLevel || 7,
        sales_level: safeParams.salesLevel || 6,
        version_specs: JSON.stringify(specBatch, null, 2),
        draft_json: JSON.stringify({
          versions: Object.fromEntries(batchRewrite.versions.map((item) => [item.key, item.content])),
        }, null, 2),
      });
      const humanizedContent = await chatCompletion(provider, [
        {
          role: "system",
          content: "你是中文去 AI 味二次处理器。只输出 JSON，不要 Markdown，不要解释。",
        },
        {
          role: "user",
          content: humanizePrompt,
        },
      ], signal);
      const humanized = parseJsonFromModelText(humanizedContent);
      batchRewrite = normalizeRewrite(humanized.versions || humanized, {
        provider: provider.id,
        model: provider.model,
        direction: safeDirection,
        style: safeStyle,
        referenceStyle: safeReference,
        params: { ...safeParams, humanizeLevel },
        humanizeLevel,
        referenceExamples,
        versionSpecs: specBatch,
        structure: batchRewrite.structure,
        humanizerNotes: Array.isArray(humanized.humanizerNotes) ? humanized.humanizerNotes : [],
      });
      humanizerNotes.push(...batchRewrite.humanizerNotes);
    }

    const repairedVersions = await repairRewriteWordCounts(provider, batchRewrite.versions, specBatch, signal);
    generatedVersions.push(...repairedVersions);
  }

  const rewrite = normalizeRewrite({ versions: generatedVersions }, {
    provider: provider.id,
    model: provider.model,
    direction: safeDirection,
    style: safeStyle,
    referenceStyle: safeReference,
    params: { ...safeParams, humanizeLevel },
    humanizeLevel,
    referenceExamples,
    versionSpecs,
    structure,
    humanizerNotes,
  });

  const emptyCount = rewrite.versions.filter((version) => !version.content).length;
  if (emptyCount === rewrite.versions.length) {
    throw new Error("AI 改写没有返回可用内容");
  }
  return rewrite;
}

function saveAnalysis(videoInfo, analysis) {
  const title = videoInfo.title || videoInfo.videoId || `douyin_${Date.now()}`;
  const filePath = makeUniquePath(`${title}_AI分析`, ".txt", "analysis");
  const body = [
    `爆款钩子：${analysis.hook}`,
    `情绪点：${analysis.emotionPoints.join("；")}`,
    `痛点：${analysis.painPoints.join("；")}`,
    `行动号召：${analysis.callToAction}`,
    `自动分类：${analysis.category || "未分类"}`,
    `标签：${analysis.tags.join("、")}`,
    `分析模型：${analysis.source || "dashscope-qwen"}`,
    "",
    `摘要：${analysis.summary}`,
  ].join("\n");
  fs.writeFileSync(filePath, `${body}\n`, "utf8");
  return filePath;
}

function createTranscriptJob(shareLink, apiKey) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    status: "running",
    percent: 0,
    message: "准备提取文案",
    text: "",
    transcriptPath: "",
    files: listDownloads(),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  transcriptJobs.set(id, job);

  const updateJob = (changes) => {
    Object.assign(job, changes, { updatedAt: new Date().toISOString() });
  };

  (async () => {
    updateJob({ percent: 5, message: "正在解析视频" });
    const firstUrl = getFirstUrl(shareLink);
    let videoInfo;
    let localVideoPath = "";
    let subtitlePath = "";

    if (isLikelyDouyinUrl(firstUrl)) {
      const linkResult = await runMcpTool("get_douyin_download_link", shareLink);
      if (linkResult.isError) {
        throw new Error(linkResult.text || "解析视频失败");
      }
      videoInfo = parseVideoInfoFromToolText(linkResult.text);
    } else {
      const info = await ytDlpService.info(firstUrl);
      videoInfo = {
        ...info.videoInfo,
        sourceAdapter: "yt-dlp",
      };
      updateJob({ percent: 12, message: "正在下载视频用于文案识别" });
      const downloaded = await ytDlpService.download(firstUrl, {
        onProgress: (progress) => {
          const raw = Number(progress.percent || 0);
          updateJob({
            percent: Math.max(12, Math.min(55, Math.round(12 + raw * 0.43))),
            message: progress.message || "正在通过 yt-dlp 下载视频",
          });
        },
      });
      localVideoPath = downloaded.videoPath || "";
      subtitlePath = downloaded.subtitlePath || "";
      videoInfo = {
        ...videoInfo,
        ...downloaded.videoInfo,
        sourceAdapter: "yt-dlp",
      };
    }

    if (!videoInfo.downloadUrl) {
      throw new Error("没有解析到可识别的视频地址");
    }

    let rawTranscriptText = subtitlePath ? textFromSubtitleFile(subtitlePath) : "";
    if (!rawTranscriptText) {
      rawTranscriptText = await extractTranscriptForVideoInfo(videoInfo, apiKey, updateJob, undefined, {
        localVideoPath,
        sourceUrl: firstUrl,
      });
    }
    updateJob({ percent: 92, message: "正在自动校正文案" });
    const transcriptText = await correctTranscriptWithRewriteModel(rawTranscriptText, videoInfo);
    const transcriptPath = saveTranscript(videoInfo, transcriptText);
    updateJob({
      status: "done",
      percent: 100,
      message: "文案提取和自动校正完成；未点击分析，已跳过 AI 分析",
      text: transcriptText,
      transcriptPath,
      files: listDownloads(),
    });
  })()
    .catch((error) => {
      updateJob({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        text: error instanceof Error ? error.message : String(error),
        files: listDownloads(),
      });
    })
    .finally(() => {
      setTimeout(() => transcriptJobs.delete(id), 30 * 60 * 1000);
      scheduleShutdownIfIdle();
    });

  return job;
}

function isSupportedLocalVideo(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return [".mp4", ".mov", ".mkv", ".avi", ".m4v", ".webm"].includes(extension);
}

function createLocalVideoTranscriptJob(filePath, apiKey) {
  const resolvedPath = path.resolve(String(filePath || "").trim());
  if (!resolvedPath || !fs.existsSync(resolvedPath)) throw new Error("没有找到本地视频文件");
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile() || !isSupportedLocalVideo(resolvedPath)) throw new Error("请选择 mp4、mov、mkv、avi、m4v 或 webm 视频文件");
  const activeApiKey = String(apiKey || getActiveProviderApiKey() || "").trim();
  if (!activeApiKey) throw new Error("请先在系统设置保存 DashScope API Key，用于本地视频语音识别");

  fs.mkdirSync(localMediaDir, { recursive: true });
  const title = path.basename(resolvedPath, path.extname(resolvedPath));
  const videoInfo = {
    title,
    videoId: `local_${createHash("sha1").update(resolvedPath).digest("hex").slice(0, 12)}`,
    downloadUrl: `file://${resolvedPath}`,
  };
  const imported = taskStore.importTasks([{
    kind: "local-video",
    taskAction: "local-transcript",
    url: resolvedPath,
    normalizedUrl: `local:${resolvedPath.toLowerCase()}`,
    sourceText: resolvedPath,
    transcriptEnabled: true,
    analysisEnabled: false,
    onlyTranscript: true,
  }]);
  const task = imported.tasks[0] || imported.duplicates[0];
  if (!task) throw new Error("本地视频任务创建失败");

  const id = `local-${task.id}-${Date.now()}`;
  const job = {
    id,
    taskId: task.id,
    status: "running",
    percent: 0,
    message: "准备提取本地视频文案",
    text: "",
    transcriptPath: "",
    files: listDownloads(),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  transcriptJobs.set(id, job);
  const updateJob = (changes) => {
    Object.assign(job, changes, { updatedAt: new Date().toISOString() });
  };

  taskStore.updateTask(task.id, {
    kind: "local-video",
    task_action: "local-transcript",
    status: TASK_STATUS.TRANSCRIBING,
    progress: 8,
    title,
    video_id: videoInfo.videoId,
    video_path: resolvedPath,
    file_size: stat.size,
    message: "准备提取本地视频文案",
    error: "",
  });

  (async () => {
    const rawTranscriptText = await transcribeLocalMediaWithDashScope(activeApiKey, resolvedPath, (progress) => {
      const percent = Math.max(10, Math.min(92, Math.round(Number(progress.percent || 0))));
      updateJob({ percent, message: progress.message || "正在识别本地视频" });
      taskStore.updateTask(task.id, {
        status: TASK_STATUS.TRANSCRIBING,
        progress: percent,
        message: progress.message || "正在识别本地视频",
      });
    });
    updateJob({ percent: 93, message: "正在自动校正文案" });
    taskStore.updateTask(task.id, {
      status: TASK_STATUS.TRANSCRIBING,
      progress: 93,
      message: "正在自动校正文案",
    });
    const transcriptText = await correctTranscriptWithRewriteModel(rawTranscriptText, videoInfo);
    const transcriptPath = saveTranscript(videoInfo, transcriptText);
    const subtitlePath = await ytDlpService.createApproximateSubtitle(resolvedPath, transcriptText, "", {});
    taskStore.updateTask(task.id, {
      txt_path: transcriptPath,
      subtitle_path: subtitlePath,
      status: TASK_STATUS.DONE,
      progress: 100,
      message: "本地视频文案、字幕和自动校正完成；未点击分析，已跳过 AI 分析",
      completed_at: new Date().toISOString(),
    });
    updateJob({
      status: "done",
      percent: 100,
      message: "本地视频文案、字幕和自动校正完成；未点击分析，已跳过 AI 分析",
      text: transcriptText,
      transcriptPath,
      files: listDownloads(),
    });
  })()
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      taskStore.updateTask(task.id, {
        status: TASK_STATUS.FAILED,
        progress: Math.max(taskStore.getTask(task.id)?.progress || 0, 1),
        message: "本地视频文案提取失败",
        error: message,
        completed_at: new Date().toISOString(),
      });
      updateJob({
        status: "error",
        message,
        text: message,
        files: listDownloads(),
      });
    })
    .finally(() => {
      setTimeout(() => transcriptJobs.delete(id), 30 * 60 * 1000);
      scheduleShutdownIfIdle();
    });

  return job;
}

function createLocalVideoAudioJob(filePath, format = "mp3") {
  const resolvedPath = path.resolve(String(filePath || "").trim());
  if (!resolvedPath || !fs.existsSync(resolvedPath)) throw new Error("没有找到本地视频文件");
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile() || !isSupportedLocalVideo(resolvedPath)) throw new Error("请选择 mp4、mov、mkv、avi、m4v 或 webm 视频文件");
  const title = path.basename(resolvedPath, path.extname(resolvedPath));
  const imported = taskStore.importTasks([{
    kind: "local-video",
    taskAction: "audio",
    url: resolvedPath,
    normalizedUrl: `local-audio:${resolvedPath.toLowerCase()}:${String(format || "mp3").toLowerCase()}`,
    sourceText: resolvedPath,
    transcriptEnabled: false,
    audioEnabled: true,
    audioFormat: format,
    analysisEnabled: false,
    onlyTranscript: false,
  }]);
  const task = imported.tasks[0] || imported.duplicates[0];
  if (!task) throw new Error("本地音频提取任务创建失败");

  const id = `local-audio-${task.id}-${Date.now()}`;
  const job = {
    id,
    taskId: task.id,
    status: "running",
    percent: 0,
    message: "准备提取本地视频音频",
    text: "",
    audioPath: "",
    files: listDownloads(),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  downloadJobs.set(id, job);
  const updateJob = (changes) => {
    Object.assign(job, changes, { updatedAt: new Date().toISOString() });
  };

  taskStore.updateTask(task.id, {
    kind: "local-video",
    task_action: "audio",
    status: TASK_STATUS.TRANSCRIBING,
    progress: 8,
    title,
    video_id: `local_${createHash("sha1").update(resolvedPath).digest("hex").slice(0, 12)}`,
    video_path: resolvedPath,
    file_size: stat.size,
    audio_enabled: 1,
    audio_format: String(format || "mp3").toLowerCase(),
    message: "准备提取本地视频音频",
    error: "",
  });

  (async () => {
    const audioPath = await ytDlpService.extractAudio(resolvedPath, {
      format,
      onProgress: (progress) => {
        const percent = Math.max(10, Math.min(96, Math.round(Number(progress.percent || 0))));
        updateJob({ percent, message: progress.message || "正在提取本地视频音频" });
        taskStore.updateTask(task.id, {
          status: TASK_STATUS.TRANSCRIBING,
          progress: percent,
          message: progress.message || "正在提取本地视频音频",
        });
      },
    });
    taskStore.updateTask(task.id, {
      audio_path: audioPath,
      status: TASK_STATUS.DONE,
      progress: 100,
      message: "本地视频音频提取完成",
      completed_at: new Date().toISOString(),
    });
    updateJob({
      status: "done",
      percent: 100,
      message: "本地视频音频提取完成",
      audioPath,
      text: audioPath,
      files: listDownloads(),
    });
  })()
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      taskStore.updateTask(task.id, {
        status: TASK_STATUS.FAILED,
        progress: Math.max(taskStore.getTask(task.id)?.progress || 0, 1),
        message: "本地视频音频提取失败",
        error: message,
        completed_at: new Date().toISOString(),
      });
      updateJob({
        status: "error",
        message,
        text: message,
        files: listDownloads(),
      });
    })
    .finally(() => {
      setTimeout(() => downloadJobs.delete(id), 30 * 60 * 1000);
      scheduleShutdownIfIdle();
    });

  return job;
}

function getBatchSettings() {
  return readSettings().batch;
}

function saveBatchSettings(changes) {
  const settings = readSettings();
  settings.batch = {
    ...settings.batch,
    ...changes,
  };
  writeSettings(settings);
  return readSettings().batch;
}

function getActiveProviderApiKey() {
  const settings = readSettings();
  const provider = settings.providers[settings.activeProvider] || settings.providers.dashscope;
  return String(
    provider?.apiKey
    || settings.providers?.dashscope?.apiKey
    || settings.rewriteProviders?.dashscope?.apiKey
    || settings.tts?.aliyun_bailian?.api_key
    || ""
  ).trim();
}

function queueState(extra = {}) {
  return {
    ...extra,
    running: runningBatchTasks.size,
    concurrency: getBatchSettings().concurrency,
    dbPath: taskStore.dbPath,
    summary: taskStore.summary(),
  };
}

async function parseVideoInfoForTask(task, signal) {
  if (isLikelyDouyinUrl(task.url)) {
    try {
      const linkResult = await runMcpTool("get_douyin_download_link", task.url, (progress) => {
        taskStore.updateTask(task.id, {
          progress: Math.max(3, Math.min(9, Math.round(Number(progress.percent || 0)))),
          message: progress.message || "正在解析抖音视频",
        });
      }, { signal });

      if (linkResult.isError) {
        throw new Error(linkResult.text || "解析视频失败");
      }

      const videoInfo = parseVideoInfoFromToolText(linkResult.text);
      if (!videoInfo.downloadUrl) {
        throw new Error("没有解析到可下载视频地址");
      }
      return { ...videoInfo, extractor: "douyin-mcp", sourceAdapter: "douyin-mcp" };
    } catch (error) {
      taskStore.updateTask(task.id, {
        progress: 6,
        message: `抖音专用解析失败，改用 yt-dlp：${errorMessage(error)}`,
      });
    }
  }

  const { videoInfo } = await ytDlpService.info(task.url, { signal });
  return { ...videoInfo, sourceAdapter: "yt-dlp" };
}

async function downloadVideoForTask(task, videoInfo, signal) {
  if (videoInfo.sourceAdapter === "yt-dlp") {
    return ytDlpService.download(task.url, {
      signal,
      onProgress: (progress) => {
        const raw = Number(progress.percent || 0);
        taskStore.updateTask(task.id, {
          status: TASK_STATUS.DOWNLOADING,
          progress: Math.max(10, Math.min(70, Math.round(10 + raw * 0.6))),
          message: progress.message || "正在通过 yt-dlp 下载视频",
        });
      },
    });
  }

  try {
    const downloaded = await downloadVideoFile(videoInfo, (progress) => {
      const raw = Number(progress.percent || 0);
      taskStore.updateTask(task.id, {
        status: TASK_STATUS.DOWNLOADING,
        progress: Math.max(10, Math.min(70, Math.round(10 + raw * 0.6))),
        message: progress.message || "正在下载视频",
      });
    }, signal);
    return {
      videoPath: downloaded.filePath,
      subtitlePath: "",
      raw: {},
      videoInfo,
    };
  } catch (error) {
    if (!isLikelyDouyinUrl(task.url)) throw error;
    taskStore.updateTask(task.id, {
      progress: 15,
      message: `抖音专用下载失败，改用 yt-dlp：${errorMessage(error)}`,
    });
    return ytDlpService.download(task.url, {
      signal,
      onProgress: (progress) => {
        const raw = Number(progress.percent || 0);
        taskStore.updateTask(task.id, {
          status: TASK_STATUS.DOWNLOADING,
          progress: Math.max(15, Math.min(70, Math.round(15 + raw * 0.55))),
          message: progress.message || "正在通过 yt-dlp 兜底下载",
        });
      },
    });
  }
}

async function completeTaskWithTranscript(task, videoInfo, messagePrefix = "", signal, options = {}) {
  throwIfPaused(signal);
  const apiKey = getActiveProviderApiKey();
  const updates = {};
  let transcriptText = "";
  let txtPath = findExistingTranscript(videoInfo);
  let subtitlePath = options.subtitlePath && fs.existsSync(options.subtitlePath) ? options.subtitlePath : "";

  if (txtPath) {
    transcriptText = fs.readFileSync(txtPath, "utf8").trim();
    updates.txt_path = txtPath;
  }

  if (task.transcript_enabled && !txtPath) {
    let rawTranscript = subtitlePath ? textFromSubtitleFile(subtitlePath) : "";
    if (!rawTranscript) {
      if (!apiKey) {
        updates.message = `${messagePrefix}视频已完成；没有平台字幕且未配置 DashScope API Key，无法进行 ASR 文案识别`;
        return updates;
      }

      taskStore.updateTask(task.id, {
        status: TASK_STATUS.TRANSCRIBING,
        progress: 72,
        message: "平台字幕不可用，准备 ASR 提取文案",
      });
      const localVideoPath = options.localVideoPath && fs.existsSync(options.localVideoPath)
        ? options.localVideoPath
        : task.video_path && fs.existsSync(task.video_path)
          ? task.video_path
          : findExistingVideo(videoInfo);
      rawTranscript = await extractTranscriptForVideoInfo(videoInfo, apiKey, (progress) => {
        const raw = Number(progress.percent || 0);
        taskStore.updateTask(task.id, {
          status: TASK_STATUS.TRANSCRIBING,
          progress: Math.max(72, Math.min(91, Math.round(72 + raw * 0.19))),
          message: progress.message || "正在提取文案",
        });
      }, signal, { localVideoPath });
    }

    taskStore.updateTask(task.id, {
      status: TASK_STATUS.TRANSCRIBING,
      progress: 92,
      message: "正在自动校正文案",
    });
    transcriptText = await correctTranscriptWithRewriteModel(rawTranscript, videoInfo, signal);
    txtPath = saveTranscript(videoInfo, transcriptText);
    updates.txt_path = txtPath;

    if (!subtitlePath) {
      const mediaPath = options.localVideoPath || task.video_path || findExistingVideo(videoInfo);
      if (mediaPath && fs.existsSync(mediaPath)) {
        subtitlePath = await ytDlpService.createApproximateSubtitle(mediaPath, transcriptText, "", { signal });
      }
    }
    if (subtitlePath) updates.subtitle_path = subtitlePath;
  } else if (subtitlePath) {
    updates.subtitle_path = subtitlePath;
  }

  if (task.analysis_enabled && transcriptText) {
    updates.message = `${messagePrefix}视频和文案已完成；未点击分析，已跳过 AI 分析`;
    return updates;
  }

  updates.message = `${messagePrefix}${txtPath ? "视频和文案已完成" : "视频已完成"}`;
  return updates;
}

async function processBatchTask(task, signal) {
  try {
    throwIfPaused(signal);
    if (task.kind !== "video") {
      throw new Error("当前版本先支持作品链接批量下载；账号、合集、评论和统计采集已预留任务类型，需接入 TikTokDownloader 后启用");
    }

    taskStore.updateTask(task.id, {
      status: TASK_STATUS.DOWNLOADING,
      progress: 3,
      message: "正在解析视频",
      error: "",
    });

    let videoInfo = await parseVideoInfoForTask(task, signal);
    taskStore.updateTask(task.id, {
      title: videoInfo.title,
      video_id: videoInfo.videoId,
      progress: 10,
      message: "解析完成",
    });

    const taskAction = task.task_action || (task.only_transcript ? "transcript" : "download");
    if (taskAction === "parse") {
      taskStore.updateTask(task.id, {
        status: TASK_STATUS.DONE,
        progress: 100,
        message: `解析完成：${videoInfo.title || videoInfo.videoId}`,
        stats_json: JSON.stringify({ downloadUrl: videoInfo.downloadUrl }),
        completed_at: new Date().toISOString(),
      });
      return;
    }

    if (taskAction === "link") {
      taskStore.updateTask(task.id, {
        status: TASK_STATUS.DONE,
        progress: 100,
        message: `下载链接：${videoInfo.downloadUrl}`,
        stats_json: JSON.stringify({ downloadUrl: videoInfo.downloadUrl }),
        completed_at: new Date().toISOString(),
      });
      return;
    }

    if (taskAction === "transcript" || task.only_transcript) {
      let transcriptVideoPath = task.video_path && fs.existsSync(task.video_path) ? task.video_path : "";
      let subtitlePath = "";
      if (videoInfo.sourceAdapter === "yt-dlp" && !transcriptVideoPath) {
        const downloaded = await downloadVideoForTask(task, videoInfo, signal);
        transcriptVideoPath = downloaded.videoPath;
        subtitlePath = downloaded.subtitlePath || "";
        videoInfo = { ...videoInfo, ...downloaded.videoInfo };
      }
      const transcriptUpdates = await completeTaskWithTranscript(
        { ...taskStore.getTask(task.id), transcript_enabled: true, analysis_enabled: false },
        videoInfo,
        "仅提取文案：",
        signal,
        { localVideoPath: transcriptVideoPath, subtitlePath }
      );
      taskStore.updateTask(task.id, {
        ...transcriptUpdates,
        video_path: transcriptVideoPath,
        file_size: 0,
        file_hash: "",
        status: TASK_STATUS.DONE,
        progress: 100,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    if (taskAction === "subtitle") {
      const downloaded = await downloadVideoForTask(task, videoInfo, signal);
      const videoPath = downloaded.videoPath;
      const stat = fs.statSync(videoPath);
      videoInfo = { ...videoInfo, ...downloaded.videoInfo };
      taskStore.updateTask(task.id, {
        title: videoInfo.title,
        video_id: videoInfo.videoId,
        video_path: videoPath,
        subtitle_path: downloaded.subtitlePath || "",
        file_size: stat.size,
        file_hash: await hashFile(videoPath),
        progress: 70,
        message: downloaded.subtitlePath ? "已获取平台字幕，准备校正文案" : "未获取到平台字幕，准备 ASR 生成字幕",
      });
      const transcriptUpdates = await completeTaskWithTranscript(
        { ...taskStore.getTask(task.id), transcript_enabled: true, analysis_enabled: false },
        videoInfo,
        "字幕文件：",
        signal,
        { localVideoPath: videoPath, subtitlePath: downloaded.subtitlePath || "" }
      );
      taskStore.updateTask(task.id, {
        ...transcriptUpdates,
        status: TASK_STATUS.DONE,
        progress: 100,
        message: `字幕文件已完成：${transcriptUpdates.subtitle_path || "已生成"}`,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    if (taskAction === "audio") {
      const downloaded = await downloadVideoForTask(task, videoInfo, signal);
      const videoPath = downloaded.videoPath;
      const stat = fs.statSync(videoPath);
      const audioPath = await ytDlpService.extractAudio(videoPath, {
        format: task.audio_format || "mp3",
        signal,
        onProgress: (progress) => {
          taskStore.updateTask(task.id, {
            status: TASK_STATUS.TRANSCRIBING,
            progress: Math.max(72, Math.min(96, Math.round(72 + Number(progress.percent || 0) * 0.24))),
            message: progress.message || "正在提取音频",
          });
        },
      });
      taskStore.updateTask(task.id, {
        title: downloaded.videoInfo.title || videoInfo.title,
        video_id: downloaded.videoInfo.videoId || videoInfo.videoId,
        video_path: videoPath,
        audio_path: audioPath,
        subtitle_path: downloaded.subtitlePath || "",
        file_size: stat.size,
        file_hash: await hashFile(videoPath),
        stats_json: JSON.stringify({ source: downloaded.videoInfo.extractor || "yt-dlp", audioPath }),
        status: TASK_STATUS.DONE,
        progress: 100,
        message: "音频提取完成",
        completed_at: new Date().toISOString(),
      });
      return;
    }

    taskStore.updateTask(task.id, {
      progress: 10,
      message: "检查是否已下载",
    });

    const completedTask = taskStore.findCompletedByVideoId(videoInfo.videoId);
    const completedPath = completedTask?.video_path && fs.existsSync(completedTask.video_path)
      ? completedTask.video_path
      : "";
    const existingVideoPath = completedPath || findExistingVideo(videoInfo);

    let videoPath = existingVideoPath;
    let fileSize = 0;
    let fileHash = "";
    let messagePrefix = "";

    if (videoPath && getBatchSettings().skipDownloaded) {
      const stat = fs.statSync(videoPath);
      fileSize = stat.size;
      fileHash = await hashFile(videoPath);
      messagePrefix = "已跳过下载：";
      taskStore.updateTask(task.id, {
        video_path: videoPath,
        file_size: fileSize,
        file_hash: fileHash,
        progress: 70,
        message: "检测到已下载视频，跳过下载",
      });
    } else {
      const downloaded = await downloadVideoForTask(task, videoInfo, signal);
      videoPath = downloaded.videoPath;
      const stat = fs.statSync(videoPath);
      fileSize = stat.size;
      fileHash = await hashFile(videoPath);
      videoInfo = { ...videoInfo, ...downloaded.videoInfo };
      taskStore.updateTask(task.id, {
        title: videoInfo.title,
        video_id: videoInfo.videoId,
        video_path: videoPath,
        subtitle_path: downloaded.subtitlePath || "",
        file_size: fileSize,
        file_hash: fileHash,
        progress: 70,
        message: "下载完成，准备文案",
      });
    }

    let audioPath = "";
    if (taskStore.getTask(task.id)?.audio_enabled) {
      audioPath = await ytDlpService.extractAudio(videoPath, {
        format: taskStore.getTask(task.id)?.audio_format || "mp3",
        signal,
        onProgress: (progress) => {
          taskStore.updateTask(task.id, {
            status: TASK_STATUS.TRANSCRIBING,
            progress: Math.max(70, Math.min(82, Math.round(70 + Number(progress.percent || 0) * 0.12))),
            message: progress.message || "正在提取音频",
          });
        },
      });
      taskStore.updateTask(task.id, {
        audio_path: audioPath,
        message: "音频提取完成，准备文案",
      });
    }

    const currentTask = taskStore.getTask(task.id);
    const transcriptUpdates = await completeTaskWithTranscript(
      currentTask,
      videoInfo,
      messagePrefix,
      signal,
      { localVideoPath: videoPath, subtitlePath: currentTask?.subtitle_path || "" }
    );
    taskStore.updateTask(task.id, {
      ...transcriptUpdates,
      ...(audioPath ? { audio_path: audioPath } : {}),
      status: TASK_STATUS.DONE,
      progress: 100,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    if (isPauseError(error)) {
      taskStore.updateTask(task.id, {
        status: TASK_STATUS.PAUSED,
        progress: Math.max(taskStore.getTask(task.id)?.progress || task.progress || 0, 1),
        message: "已暂停，可删除或稍后重新导入",
        error: "",
      });
      return;
    }
    const currentTask = taskStore.getTask(task.id);
    taskStore.updateTask(task.id, {
      status: TASK_STATUS.FAILED,
      progress: Math.max(currentTask?.progress || task.progress || 0, 1),
      message: "任务失败",
      error: errorMessage(error),
      completed_at: new Date().toISOString(),
    });
  }
}

function startTaskQueue() {
  cancelShutdown();
  const concurrency = getBatchSettings().concurrency;
  while (runningBatchTasks.size < concurrency) {
    const task = taskStore.claimNextTask();
    if (!task) break;

    const controller = new AbortController();
    activeBatchControllers.set(task.id, controller);
    const promise = processBatchTask(task, controller.signal);
    runningBatchTasks.add(promise);
    promise.finally(() => {
      runningBatchTasks.delete(promise);
      activeBatchControllers.delete(task.id);
      startTaskQueue();
      scheduleShutdownIfIdle();
    });
  }
}

function listDownloads() {
  const rows = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(filePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = fs.statSync(filePath);
      const relativePath = path.relative(downloadsDir, filePath);
      rows.push({
        name: relativePath,
        fileName: entry.name,
        path: filePath,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  };
  walk(downloadsDir);
  return rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function taskExportRows() {
  return taskStore.allTasks().map((task) => {
    const ai = safeJsonParse(task.ai_json);
    const rewrite = safeJsonParse(task.rewrite_json);
    const stats = safeJsonParse(task.stats_json);
    const rewriteVersions = Array.isArray(rewrite.versions) ? rewrite.versions : [];
    return {
      id: task.id,
      type: task.kind,
      action: task.task_action,
      url: task.url,
      status: task.status,
      progress: task.progress,
      title: task.title,
      video_id: task.video_id,
      video_path: task.video_path,
      audio_path: task.audio_path,
      subtitle_path: task.subtitle_path,
      txt_path: task.txt_path,
      analysis_path: task.analysis_path,
      rewrite_path: task.rewrite_path,
      comment_path: task.comment_path,
      like_count: stats.like_count || stats.digg_count || "",
      favorite_count: stats.favorite_count || stats.collect_count || "",
      comment_count: stats.comment_count || "",
      ai_hook: ai.hook || "",
      ai_emotion_points: Array.isArray(ai.emotionPoints) ? ai.emotionPoints.join("；") : "",
      ai_pain_points: Array.isArray(ai.painPoints) ? ai.painPoints.join("；") : "",
      ai_call_to_action: ai.callToAction || "",
      ai_tags: Array.isArray(ai.tags) ? ai.tags.join("、") : "",
      rewrite_model: task.rewrite_model || rewrite.model || "",
      rewrite_direction: task.rewrite_direction || rewrite.direction || "",
      rewrite_style: task.rewrite_style || rewrite.style || "",
      humanize_level: task.humanize_level || rewrite.humanizeLevel || "",
      rewrite_params_json: task.rewrite_params_json,
      reference_examples_json: task.reference_examples_json,
      rewrite_versions: rewriteVersions.map((item) => `${item.name || item.key}：${item.content || ""}`).join("\n\n"),
      message: task.message,
      error: task.error,
      file_hash: task.file_hash,
      file_size: task.file_size,
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_at: task.completed_at,
    };
  });
}

function transcriptRows() {
  return taskStore
    .allTasks()
    .filter((task) => task.txt_path && fs.existsSync(task.txt_path))
    .map((task) => ({
      id: task.id,
      title: task.title || task.video_id || `任务 ${task.id}`,
      url: task.url,
      txtPath: task.txt_path,
      analysisPath: task.analysis_path,
      rewritePath: task.rewrite_path,
      text: fs.readFileSync(task.txt_path, "utf8"),
      ai: safeJsonParse(task.ai_json),
      rewrite: safeJsonParse(task.rewrite_json),
      rewriteModel: task.rewrite_model,
      rewriteStyle: task.rewrite_style,
      rewriteDirection: task.rewrite_direction,
      rewriteParams: safeJsonParse(task.rewrite_params_json),
      referenceExamples: safeJsonParse(task.reference_examples_json),
      humanizeLevel: task.humanize_level,
      updatedAt: task.updated_at,
    }));
}

function ensureWorkflowTranscriptTask({ taskId = 0, transcriptText = "", title = "", sourceUrl = "" } = {}) {
  const existing = taskId ? taskStore.getTask(Number(taskId || 0)) : null;
  if (existing?.txt_path && fs.existsSync(existing.txt_path)) return existing;

  const text = String(transcriptText || "").trim();
  if (!text) throw new Error("文案为空，无法创建工作流任务。");
  const workflowTranscriptDir = path.join(__dirname, ".data", "workflow-transcripts");
  fs.mkdirSync(workflowTranscriptDir, { recursive: true });
  const hash = createHash("sha1").update(`${sourceUrl}\n${text}`).digest("hex").slice(0, 16);
  const transcriptPath = path.join(workflowTranscriptDir, `transcript-${hash}.txt`);
  fs.writeFileSync(transcriptPath, `${text}\n`, "utf8");

  const imported = taskStore.importTasks([{
    kind: "workflow-transcript",
    taskAction: "transcript",
    url: sourceUrl || `workflow:${hash}`,
    normalizedUrl: `workflow:${hash}`,
    sourceText: text.slice(0, 500),
    transcriptEnabled: true,
    analysisEnabled: false,
    onlyTranscript: true,
  }]);
  const task = imported.tasks[0] || imported.duplicates[0];
  if (!task) throw new Error("工作流文案任务创建失败。");
  return taskStore.updateTask(task.id, {
    status: TASK_STATUS.DONE,
    progress: 100,
    title: title || "自动文案",
    txt_path: transcriptPath,
    source_text: text,
    message: "工作流文案已就绪",
    completed_at: new Date().toISOString(),
  });
}

function updateProjectFromTranscript({ projectId = "", taskId = 0, transcriptText = "", title = "", videoType = "", sourceUrl = "" } = {}) {
  const task = ensureWorkflowTranscriptTask({ taskId, transcriptText, title, sourceUrl });
  const text = String(transcriptText || (task.txt_path && fs.existsSync(task.txt_path) ? fs.readFileSync(task.txt_path, "utf8") : "")).trim();
  if (!text) throw new Error("文案为空，无法推进工作流。");
  const generated = generatePlatformTitles({
    transcriptText: text,
    videoType,
    fallbackTitle: title || task.title || "",
  });
  const existingProject = projectId ? projectCenter.getById(projectId) : null;
  const project = existingProject || projectCenter.create({
    title: generated.projectTitle,
    videoType: videoType || "douyin-knowledge",
  });
  const updated = projectCenter.setWorkflowState(project.id, "titles_ready", {
    title: generated.projectTitle,
    videoType: videoType || project.videoType || "douyin-knowledge",
    transcriptText: text,
    platformTitles: {
      douyinTitle: generated.douyinTitle,
      xiaohongshuTitle: generated.xiaohongshuTitle,
      shipinhaoTitle: generated.shipinhaoTitle,
      projectTitle: generated.projectTitle,
      riskNotes: generated.riskNotes,
    },
    seoKeywords: generated.seoKeywords,
    hashtags: generated.hashtags,
    lastTaskId: task.id,
    workflowError: {},
  });
  projectCenter.linkAsset(updated.id, "transcript", task.id, title || task.title || generated.projectTitle, {
    text,
    taskId: task.id,
    txtPath: task.txt_path,
    source: sourceUrl ? "downloaded" : "workflow",
  });
  return {
    project: projectCenter.setWorkflowState(updated.id, "titles_ready"),
    task,
    titles: generated,
  };
}

function probeAudioDuration(mediaPath = "") {
  const target = path.resolve(String(mediaPath || ""));
  if (!ffmpegPath || !target || !fs.existsSync(target)) return Promise.resolve(0);
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath, ["-hide_banner", "-i", target], { windowsHide: true });
    let text = "";
    child.stdout.on("data", (chunk) => { text += chunk.toString(); });
    child.stderr.on("data", (chunk) => { text += chunk.toString(); });
    child.on("error", () => resolve(0));
    child.on("close", () => {
      const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      resolve(match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0);
    });
  });
}

async function handleTtsJobCompleted(job) {
  if (!job || job.status !== "completed") return;
  const metadata = safeJsonParse(job.metadata_json);
  const projectId = String(metadata.project_id || metadata.projectId || "").trim();
  if (!projectId || metadata.workflow_auto_director === false) return;
  const project = projectCenter.getById(projectId);
  if (!project) return;

  try {
    const audioDuration = await probeAudioDuration(job.audio_path);
    const linked = projectCenter.linkAsset(project.id, "tts", job.id, job.voice_name || `配音 #${job.id}`, {
      ...job,
      text: job.text || project.selectedRewriteText || project.transcriptText || "",
      audioDuration,
      source: "ai_generated",
      status: "ready",
    }).project;
    projectCenter.setWorkflowState(project.id, "tts_ready", {
      lastTtsJobId: job.id,
      selectedTtsAudio: {
        ...(linked.selectedTtsAudio || {}),
        audioDuration,
      },
    });

    const latest = projectCenter.getById(project.id);
    if (latest?.directorScript?.id || latest?.lastDirectorProjectId) return;
    const sourceText = String(latest?.selectedRewriteText || job.text || latest?.transcriptText || "").trim();
    if (!sourceText || !directorService) return;
    const result = directorService.enqueue({
      project_id: latest.id,
      video_project_id: latest.id,
      task_id: Number(job.task_id || latest.lastTaskId || 0),
      rewrite_id: Number(job.rewrite_id || 0),
      tts_job_id: Number(job.id || 0),
      source_key: `project-${latest.id}-tts-${job.id}`,
      source_type: "tts",
      title: latest.platformTitles?.douyinTitle || latest.title,
      source_text: sourceText,
      tts_duration: audioDuration,
      estimated_duration: audioDuration || 30,
      video_type: latest.videoType || "douyin-knowledge",
      platform: "douyin",
      shot_count: "auto",
    });
    if (result.error) throw new Error(result.error);
    projectCenter.setWorkflowState(latest.id, "tts_ready", {
      lastDirectorProjectId: result.project?.id || 0,
    });
  } catch (error) {
    projectCenter.setWorkflowState(project.id, "tts_ready", {
      workflowError: {
        ...(project.workflowError || {}),
        tts_to_director: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function handleDirectorProjectCompleted(project) {
  if (!project || project.status !== "completed") return;
  const metadata = project.metadata || {};
  const projectId = String(metadata.video_project_id || metadata.project_id || "").trim();
  if (!projectId) return;
  const videoProject = projectCenter.getById(projectId);
  if (!videoProject) return;
  projectCenter.linkAsset(projectId, "director", project.id, project.title || `导演稿 #${project.id}`, {
    ...project,
    sceneCount: project.result?.storyboard?.length || metadata.scene_count || 0,
    subtitleTimeline: project.result?.subtitle_timeline || [],
    source: "ai_generated",
    status: "ready",
  });
  projectCenter.setWorkflowState(projectId, "director_ready", {
    lastDirectorProjectId: project.id,
  });
}

function directorSourceRows() {
  const sources = [];
  for (const item of transcriptRows()) {
    sources.push({
      kind: "transcript",
      task_id: item.id,
      rewrite_id: 0,
      source_key: `task-${item.id}-transcript`,
      title: `${item.title} · 任务文案`,
      text: item.text,
    });
    const versions = Array.isArray(item.rewrite?.versions) ? item.rewrite.versions : [];
    versions.forEach((version, index) => {
      const text = String(version.content || "").trim();
      if (!text) return;
      sources.push({
        kind: "rewrite",
        task_id: item.id,
        rewrite_id: 0,
        source_key: `task-${item.id}-rewrite-${version.key || index + 1}`,
        title: `${item.title} · ${version.name || version.key || `改写 ${index + 1}`}`,
        text,
      });
    });
  }
  return sources;
}

function saveAnalysisForTask(task, transcriptText, analysis) {
  const videoInfo = {
    title: task.title,
    videoId: task.video_id || `task_${task.id}`,
  };
  const analysisPath = saveAnalysis(videoInfo, analysis);
  return taskStore.updateTask(task.id, {
    analysis_path: analysisPath,
    ai_json: JSON.stringify(analysis),
    message: task.video_path ? "视频、文案和 AI 分析已完成" : "文案和 AI 分析已完成",
  });
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function tasksToCsv(rows) {
  const headers = Object.keys(rows[0] || {
    id: "",
    type: "",
    url: "",
    status: "",
    progress: "",
  });
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

function tasksToXlsx(rows) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "tasks");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const requested = path.normalize(path.join(uiDir, pathname));

  if (!requested.startsWith(uiDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(requested, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const type = mimeTypes.get(path.extname(requested)) || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

// ===== WebSocket 进度推送 =====
const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set();

// 广播进度（赋值到前面声明的变量）
broadcastProgress = (data) => {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    try { ws.send(msg); } catch { wsClients.delete(ws); }
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");

  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, { ok: true, downloadsDir, tasks: queueState() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/downloads-dir") {
      const body = await readJsonBody(req);
      const selected = String(body.path || "").trim();
      if (!selected) {
        sendJson(res, 400, { ok: false, message: "请先输入下载位置" });
        return;
      }
      const nextDir = saveDownloadsDir(selected);
      sendJson(res, 200, { ok: true, downloadsDir: nextDir, files: listDownloads() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/downloads-dir/choose") {
      const selected = await chooseDownloadDir();
      if (!selected) {
        sendJson(res, 200, { ok: false, message: "已取消选择" });
        return;
      }
      const nextDir = saveDownloadsDir(selected);
      sendJson(res, 200, { ok: true, downloadsDir: nextDir, files: listDownloads() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/files") {
      sendJson(res, 200, { files: listDownloads() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tasks") {
      const limit = clampNumber(url.searchParams.get("limit"), 1, 1000, 200);
      const status = url.searchParams.get("status") || "";
      sendJson(res, 200, {
        ok: true,
        tasks: taskStore.listTasks({ limit, status }),
        ...queueState(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/transcripts") {
      sendJson(res, 200, {
        ok: true,
        transcripts: transcriptRows(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/reference-examples") {
      sendJson(res, 200, {
        ok: true,
        examples: readReferenceExamples(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/reference-examples") {
      const body = await readJsonBody(req);
      const examples = writeReferenceExamples(body.examples || []);
      sendJson(res, 200, {
        ok: true,
        examples,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/analyze") {
      const body = await readJsonBody(req);
      const id = Number(body.id || 0);
      const task = taskStore.getTask(id);
      if (!task || !task.txt_path || !fs.existsSync(task.txt_path)) {
        sendJson(res, 404, { ok: false, message: "没有找到可分析的文案" });
        return;
      }
      const apiKey = getActiveProviderApiKey();
      if (!apiKey) {
        sendJson(res, 400, { ok: false, message: "请先保存 DashScope API Key" });
        return;
      }
      const transcriptText = String(body.text || fs.readFileSync(task.txt_path, "utf8")).trim();
      if (!transcriptText) {
        sendJson(res, 400, { ok: false, message: "文案为空，无法分析" });
        return;
      }
      fs.writeFileSync(task.txt_path, `${transcriptText}\n`, "utf8");
      const analysis = await analyzeTranscriptWithDashScope(apiKey, transcriptText, {
        title: task.title,
        videoId: task.video_id,
      });
      const updatedTask = saveAnalysisForTask(task, transcriptText, analysis);
      sendJson(res, 200, {
        ok: true,
        analysis,
        task: updatedTask,
        transcripts: transcriptRows(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/analysis") {
      const body = await readJsonBody(req);
      const id = Number(body.id || 0);
      const task = taskStore.getTask(id);
      if (!task) {
        sendJson(res, 404, { ok: false, message: "任务不存在" });
        return;
      }
      const analysis = normalizeAnalysis({
        hook: body.hook,
        emotionPoints: Array.isArray(body.emotionPoints) ? body.emotionPoints : String(body.emotionPoints || "").split(/[；;\n]/),
        painPoints: Array.isArray(body.painPoints) ? body.painPoints : String(body.painPoints || "").split(/[；;\n]/),
        callToAction: body.callToAction,
        tags: Array.isArray(body.tags) ? body.tags : String(body.tags || "").split(/[、,，\n]/),
        category: body.category,
        summary: body.summary,
        source: "edited",
      }, body.summary || "");
      const updatedTask = saveAnalysisForTask(task, "", analysis);
      sendJson(res, 200, {
        ok: true,
        analysis,
        task: updatedTask,
        transcripts: transcriptRows(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/moments/personas") {
      sendJson(res, 200, {
        ok: true,
        personas: readMomentsPersonas(),
        syncPath: momentsPersonasPath,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/moments/personas") {
      try {
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        const persona = normalizeMomentsPersona({
          id: body.id,
          name: body.name,
          description: body.description,
          updatedAt: new Date().toISOString(),
        });
        const current = readMomentsPersonas();
        const next = [persona, ...current.filter((item) => item.id !== persona.id)];
        const personas = writeMomentsPersonas(next);
        sendJson(res, 200, {
          ok: true,
          persona,
          personas,
          syncPath: momentsPersonasPath,
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/moments/personas/delete") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const id = safePersonaId(body.id || "");
        if (!id) throw new Error("缺少人设 ID。");
        if (id === DEFAULT_MOMENTS_PERSONA.id) throw new Error("默认人设不能删除，可以修改后另存为新的人设。");
        const personas = writeMomentsPersonas(readMomentsPersonas().filter((item) => item.id !== id));
        sendJson(res, 200, {
          ok: true,
          personas,
          syncPath: momentsPersonasPath,
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/moments/generate") {
      try {
        const body = await readJsonBody(req, { maxBytes: 512 * 1024 });
        const result = await generateMomentsPostJson(body);
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/moments/materials/upload") {
      try {
        const body = await readJsonBody(req, { maxBytes: 16 * 1024 * 1024 });
        const material = saveMomentsMaterialUpload(body);
        sendJson(res, 200, { ok: true, material });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/rewrite") {
      const body = await readJsonBody(req);
      const id = Number(body.id || 0);
      const task = taskStore.getTask(id);
      if (!task || !task.txt_path || !fs.existsSync(task.txt_path)) {
        sendJson(res, 404, { ok: false, message: "没有找到可改写的文案" });
        return;
      }
      const transcriptText = String(body.text || fs.readFileSync(task.txt_path, "utf8")).trim();
      if (!transcriptText) {
        sendJson(res, 400, { ok: false, message: "文案为空，无法改写" });
        return;
      }
      const rewrite = await rewriteTranscriptWithProvider({
        providerId: body.provider,
        transcriptText,
        analysis: safeJsonParse(task.ai_json),
        direction: String(body.direction || ""),
        style: String(body.style || ""),
        referenceStyle: String(body.referenceStyle || ""),
        params: body.params && typeof body.params === "object" ? body.params : {},
        humanizeLevel: String(body.humanizeLevel || ""),
        referenceExamples: body.referenceExamples || [],
        versionSpecs: body.versionSpecs || body.versions || [],
        revisionInstruction: String(body.revisionInstruction || ""),
        task,
      });
      const updatedTask = body.previewOnly ? task : saveRewriteForTask(task, rewrite, "md");
      sendJson(res, 200, {
        ok: true,
        rewrite,
        task: updatedTask,
        transcripts: transcriptRows(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/rewrite/save") {
      const body = await readJsonBody(req);
      const id = Number(body.id || 0);
      const task = taskStore.getTask(id);
      if (!task) {
        sendJson(res, 404, { ok: false, message: "任务不存在" });
        return;
      }
      let rewrite = rewriteFromBody(body, task);
      if (body.mergeExisting) {
        const existingRewrite = safeJsonParse(task.rewrite_json);
        const existingVersions = Array.isArray(existingRewrite.versions) ? existingRewrite.versions : [];
        const incomingByKey = new Map(rewrite.versions.map((version) => [version.key, version]));
        const mergedVersions = existingVersions.map((version) => incomingByKey.get(version.key) || version);
        for (const version of rewrite.versions) {
          if (!existingVersions.some((existing) => existing.key === version.key)) mergedVersions.push(version);
        }
        rewrite = normalizeRewrite({ versions: mergedVersions }, {
          ...existingRewrite,
          ...rewrite,
          versionSpecs: mergedVersions,
          structure: rewrite.structure || existingRewrite.structure || {},
        });
      }
      const updatedTask = saveRewriteForTask(task, rewrite, body.format === "md" ? "md" : "txt");
      sendJson(res, 200, {
        ok: true,
        rewrite,
        task: updatedTask,
        filePath: updatedTask.rewrite_path,
        transcripts: transcriptRows(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/director/config") {
      const settings = readSettings();
      const rewrite = publicRewriteSettings(settings);
      const mapping = publicModelMapping(settings);
      sendJson(res, 200, {
        ok: true,
        config: directorService.config,
        providers: rewrite.providers,
        default_provider: rewriteProviderIdFromMapping(mapping.director?.provider) || rewrite.defaults.defaultProvider,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/director/sources") {
      sendJson(res, 200, {
        ok: true,
        sources: directorSourceRows(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/director/projects") {
      const limit = clampNumber(url.searchParams.get("limit"), 1, 500, 50);
      sendJson(res, 200, {
        ok: true,
        projects: directorService.listProjects(limit),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/director/project") {
      const project = directorService.getProject(Number(url.searchParams.get("id") || 0));
      if (!project) {
        sendJson(res, 404, { ok: false, message: "没有找到导演项目。" });
        return;
      }
      sendJson(res, 200, { ok: true, project });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/director/delete") {
      try {
        const body = await readJsonBody(req);
        const result = directorService.removeProject(body.id, { deleteFiles: body.deleteFiles !== false });
        for (const project of projectCenter.list({ limit: 500 })) {
          if (String(project.directorScript?.id || "") === String(body.id || "")) projectCenter.removeAssetsByType(project.id, ["director"]);
        }
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/director/clear") {
      try {
        const body = await readJsonBody(req);
        const result = directorService.clearProjects({ scope: body.scope || "all", deleteFiles: body.deleteFiles !== false });
        for (const project of projectCenter.list({ limit: 500 })) projectCenter.removeAssetsByType(project.id, ["director"]);
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/director/generate") {
      const body = await readJsonBody(req);
      const result = directorService.enqueue(body);
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }
      sendJson(res, 202, { ok: true, project: result.project });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/director/export") {
      const format = String(url.searchParams.get("format") || "json").toLowerCase();
      const filePath = directorService.resolveExportPath(Number(url.searchParams.get("id") || 0), format);
      if (!filePath) {
        sendJson(res, 404, { ok: false, message: "导演稿文件不存在或尚未生成。" });
        return;
      }
      const buffer = fs.readFileSync(filePath);
      const contentType = format === "json" ? "application/json" : "text/markdown";
      sendBuffer(res, 200, buffer, contentType, path.basename(filePath));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/vfo/config") {
      const settings = readSettings();
      const rewrite = publicRewriteSettings(settings);
      const mapping = publicModelMapping(settings);
      sendJson(res, 200, {
        ok: true,
        config: vfoService.config,
        providers: rewrite.providers,
        default_provider: rewriteProviderIdFromMapping(mapping.storyboard?.provider || mapping.director?.provider) || rewrite.defaults.defaultProvider,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/vfo/sources") {
      sendJson(res, 200, {
        ok: true,
        sources: vfoService.listDirectorSources(100),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/vfo/projects") {
      const limit = clampNumber(url.searchParams.get("limit"), 1, 500, 50);
      sendJson(res, 200, {
        ok: true,
        projects: vfoService.listProjects(limit),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/vfo/project") {
      const project = vfoService.getProject(Number(url.searchParams.get("id") || 0));
      if (!project) {
        sendJson(res, 404, { ok: false, message: "没有找到 VFO 项目。" });
        return;
      }
      sendJson(res, 200, { ok: true, project });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/vfo/generate") {
      const body = await readJsonBody(req);
      const result = vfoService.enqueue(body);
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }
      sendJson(res, 202, { ok: true, project: result.project });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/vfo/export") {
      const type = String(url.searchParams.get("type") || "render-plan").toLowerCase();
      const filePath = vfoService.resolveExportPath(Number(url.searchParams.get("id") || 0), type);
      if (!filePath) {
        sendJson(res, 404, { ok: false, message: "VFO 文件不存在或尚未生成。" });
        return;
      }
      const buffer = fs.readFileSync(filePath);
      sendBuffer(res, 200, buffer, "application/json", path.basename(filePath));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tasks/export") {
      const format = (url.searchParams.get("format") || "csv").toLowerCase();
      const rows = taskExportRows();
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "xlsx") {
        const buffer = tasksToXlsx(rows);
        sendBuffer(
          res,
          200,
          buffer,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          `douyin-tasks-${stamp}.xlsx`
        );
        return;
      }
      sendText(res, 200, tasksToCsv(rows), "text/csv", `douyin-tasks-${stamp}.csv`);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/import") {
      const body = await readJsonBody(req);
      const limit = clampNumber(body.limit, 1, 1000, getBatchSettings().limit || 10);
      const concurrency = clampNumber(body.concurrency, 1, 5, getBatchSettings().concurrency);
      const taskAction = ["parse", "link", "download", "transcript", "subtitle", "audio"].includes(String(body.action || "download"))
        ? String(body.action || "download")
        : "download";
      const batchSettings = saveBatchSettings({
        concurrency,
        limit,
        skipDownloaded: body.skipDownloaded !== false,
      });
      const extracted = extractAnyUrls(String(body.text || ""), {
        limit,
        kind: String(body.kind || "video"),
        taskAction,
        transcriptEnabled: taskAction === "transcript" || taskAction === "subtitle" || (taskAction === "download" && (body.extractTranscript === true || body.extractSubtitle === true)),
        audioEnabled: taskAction === "audio" || (taskAction === "download" && body.extractAudio === true),
        audioFormat: body.audioFormat || "mp3",
        analysisEnabled: false,
        onlyTranscript: taskAction === "transcript",
      });

      if (extracted.items.length === 0) {
        sendJson(res, 400, { ok: false, message: "没有识别到 yt-dlp 可尝试处理的链接" });
        return;
      }

      const imported = taskStore.importTasks(extracted.items);
      startTaskQueue();
      sendJson(res, 200, {
        ok: true,
        imported,
        overflow: extracted.overflow,
        tasks: taskStore.listTasks({ limit: 200 }),
        ...queueState(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/pause") {
      const body = await readJsonBody(req);
      const id = Number(body.id || 0);
      const controller = activeBatchControllers.get(id);
      const task = taskStore.getTask(id);
      if (!task) {
        sendJson(res, 404, { ok: false, message: "任务不存在" });
        return;
      }
      if (!controller) {
        const paused = taskStore.updateTask(id, {
          status: TASK_STATUS.PAUSED,
          message: "已暂停，可删除或稍后重新导入",
          error: "",
        });
        sendJson(res, 200, { ok: true, task: paused, tasks: taskStore.listTasks({ limit: 200 }), ...queueState() });
        return;
      }
      controller.abort();
      taskStore.updateTask(id, {
        status: TASK_STATUS.PAUSED,
        message: "已暂停，可删除或稍后重新导入",
        error: "",
      });
      sendJson(res, 200, { ok: true, message: "已暂停任务", tasks: taskStore.listTasks({ limit: 200 }), ...queueState() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/delete") {
      const body = await readJsonBody(req);
      const ids = Array.isArray(body.ids) ? body.ids : [body.id];
      const deleted = taskStore.deleteTasks(ids);
      sendJson(res, 200, {
        ok: true,
        deleted,
        tasks: taskStore.listTasks({ limit: 200 }),
        ...queueState(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/start") {
      const body = await readJsonBody(req);
      if (body.concurrency) {
        saveBatchSettings({ concurrency: clampNumber(body.concurrency, 1, 5, getBatchSettings().concurrency) });
      }
      startTaskQueue();
      sendJson(res, 200, {
        ok: true,
        tasks: taskStore.listTasks({ limit: 200 }),
        ...queueState(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/clear-finished") {
      const deleted = taskStore.clearDoneAndFailed();
      sendJson(res, 200, {
        ok: true,
        deleted,
        tasks: taskStore.listTasks({ limit: 200 }),
        ...queueState(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/clear-all") {
      const deleted = taskStore.clearTaskList();
      sendJson(res, 200, {
        ok: true,
        deleted,
        tasks: taskStore.listTasks({ limit: 200 }),
        ...queueState(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/settings") {
      const settings = readSettings();
      const provider = settings.providers[settings.activeProvider] || settings.providers.dashscope;
      sendJson(res, 200, {
        ok: true,
        activeProvider: settings.activeProvider,
        providers: Object.fromEntries(
          Object.entries(settings.providers).map(([id, item]) => [
            id,
            {
              label: item.label,
              apiKeyConfigured: Boolean(item.apiKey),
              apiKeyMask: maskApiKey(item.apiKey || ""),
              applyUrl: item.applyUrl,
              docsUrl: item.docsUrl,
            },
          ])
        ),
        apiKeyConfigured: Boolean(provider.apiKey),
        apiKeyMask: maskApiKey(provider.apiKey || ""),
        rewrite: publicRewriteSettings(settings),
        tts: publicTtsSettings(settings),
        batch: settings.batch,
        jianying: settings.jianying,
        jianyingAppPath: settings.jianyingAppPath,
        jianyingDraftDir: settings.jianyingDraftDir,
        downloadsDir,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/settings") {
      const body = await readJsonBody(req);
      const providerId = String(body.provider || "aliyun_bailian");
      const settings = readSettings();
      const target = settings.tts[providerId];
      if (!target || !TTS_PROVIDER_LABELS[providerId]) {
        sendJson(res, 400, { ok: false, message: "未知 TTS Provider。" });
        return;
      }
      const allowedFields = {
        aliyun_bailian: ["api_key", "workspace_id", "default_model", "default_voice"],
        volcengine_doubao: ["api_key", "app_id", "access_key_id", "secret_access_key", "default_model", "default_voice"],
        tencent_tts: ["secret_id", "secret_key", "region", "default_voice"],
        custom_tts: ["base_url", "api_key", "model", "voice"],
        fish_audio: ["base_url", "api_key", "model", "voice", "reference_id", "default_format"],
      }[providerId] || [];
      const secretFields = new Set(["api_key", "secret_id", "secret_key", "access_key_id", "secret_access_key"]);
      for (const field of allowedFields) {
        if (body[field] === undefined) continue;
        const value = String(body[field] || "").trim();
        if (secretFields.has(field) && !value) continue;
        target[field] = value;
      }
      settings.tts.default_provider = providerId;
      if (body.default_speed !== undefined) {
        settings.tts.default_speed = clampDecimal(body.default_speed, 0.5, 2, settings.tts.default_speed);
      }
      if (body.default_format !== undefined) {
        settings.tts.default_format = body.default_format === "wav" ? "wav" : "mp3";
      }
      writeSettings(settings);
      sendJson(res, 200, { ok: true, tts: publicTtsSettings(readSettings()) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tts/voices") {
      const settings = readSettings();
      const provider = String(url.searchParams.get("provider") || settings.tts.default_provider);
      sendJson(res, 200, {
        ok: true,
        provider,
        voices: ttsService.listVoices(provider),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tts/jobs") {
      const limit = clampNumber(url.searchParams.get("limit"), 1, 500, 50);
      sendJson(res, 200, { ok: true, jobs: ttsService.listJobs(limit) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tts/voice-preview") {
      const voiceId = String(url.searchParams.get("voice_id") || "");
      const audio = ttsService.voicePreview(voiceId);
      res.writeHead(200, {
        "content-type": "audio/wav",
        "content-length": audio.length,
        "cache-control": "public, max-age=86400",
      });
      res.end(audio);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tts/job") {
      const job = ttsService.getJob(Number(url.searchParams.get("id") || 0));
      if (!job) {
        sendJson(res, 404, { ok: false, message: "没有找到这条语音任务。" });
        return;
      }
      sendJson(res, 200, { ok: true, job });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/delete") {
      try {
        const body = await readJsonBody(req);
        const result = ttsService.removeJob(body.id, { deleteFile: body.deleteFile !== false });
        for (const project of projectCenter.list({ limit: 500 })) {
          if (String(project.selectedTtsAudio?.id || "") === String(body.id || "")) projectCenter.removeAssetsByType(project.id, ["tts"]);
        }
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/clear") {
      try {
        const body = await readJsonBody(req);
        const result = ttsService.clearJobs({ scope: body.scope || "all", deleteFiles: body.deleteFiles !== false });
        if ((body.scope || "all") === "all") {
          for (const project of projectCenter.list({ limit: 500 })) projectCenter.removeAssetsByType(project.id, ["tts"]);
        }
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/generate") {
      const body = await readJsonBody(req);
      const result = ttsService.enqueue(body);
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }
      sendJson(res, 202, { ok: true, job: result.job });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/retry") {
      const body = await readJsonBody(req);
      const result = ttsService.retryJob(body.id || body.jobId || 0);
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }
      sendJson(res, 202, { ok: true, job: result.job });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tts/audio") {
      const job = taskStore.getTtsJob(Number(url.searchParams.get("id") || 0));
      const audioPath = job?.audio_path ? path.resolve(job.audio_path) : "";
      const allowedRoot = path.resolve(ttsService.outputDir);
      if (!job || job.status !== "completed" || !audioPath.startsWith(`${allowedRoot}${path.sep}`) || !fs.existsSync(audioPath)) {
        sendJson(res, 404, { ok: false, message: "音频文件不存在或尚未生成。" });
        return;
      }
      const type = job.format === "wav" ? "audio/wav" : "audio/mpeg";
      const stat = fs.statSync(audioPath);
      res.writeHead(200, {
        "content-type": type,
        "content-length": stat.size,
        "cache-control": "no-store",
      });
      fs.createReadStream(audioPath).pipe(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/voice-assets") {
      sendJson(res, 200, {
        ok: true,
        assets: voiceAssetService.listAssets(),
        default_voice: voiceAssetService.getDefault(),
        test_scripts: voiceAssetService.testScripts.map(({ type, name, emotion }) => ({ type, name, emotion })),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/voice-assets/tests") {
      const voiceAssetId = Number(url.searchParams.get("voiceAssetId") || 0);
      sendJson(res, 200, {
        ok: true,
        tests: voiceAssetService.listTests(voiceAssetId),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/voice-assets/audio") {
      const filePath = voiceAssetService.resolveSamplePath(Number(url.searchParams.get("id") || 0));
      if (!filePath) {
        sendJson(res, 404, { ok: false, message: "参考音频不存在。" });
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      const contentType = extension === ".wav" ? "audio/wav" : extension === ".m4a" ? "audio/mp4" : "audio/mpeg";
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        "content-type": contentType,
        "content-length": stat.size,
        "cache-control": "no-store",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice-assets/create") {
      const body = await readJsonBody(req, { maxBytes: 15 * 1024 * 1024 });
      const result = await voiceAssetService.createAsset(body);
      if (result.error && !result.asset) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }
      sendJson(res, result.clone_error ? 202 : 201, {
        ok: true,
        asset: result.asset,
        message: result.clone_error ? `声音资产已保存，但平台复刻失败：${result.clone_error}` : "声音资产已创建。",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice-assets/update") {
      const body = await readJsonBody(req);
      const result = voiceAssetService.updateAsset(Number(body.id || 0), body);
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }
      sendJson(res, 200, { ok: true, asset: result.asset });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice-assets/retry-clone") {
      const body = await readJsonBody(req);
      const result = await voiceAssetService.retryClone(Number(body.id || 0), body);
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error, asset: result.asset || null });
        return;
      }
      sendJson(res, 200, { ok: true, asset: result.asset });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice-assets/version") {
      const body = await readJsonBody(req);
      const result = voiceAssetService.createVersion(Number(body.id || 0));
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }
      sendJson(res, 201, { ok: true, asset: result.asset });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice-assets/default") {
      const body = await readJsonBody(req);
      const result = voiceAssetService.setDefault(Number(body.id || 0));
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }
      sendJson(res, 200, { ok: true, asset: result.asset });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice-assets/archive") {
      const body = await readJsonBody(req);
      const result = voiceAssetService.archive(Number(body.id || 0));
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }
      sendJson(res, 200, { ok: true, asset: result.asset });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice-assets/tests") {
      const body = await readJsonBody(req);
      const result = voiceAssetService.createTests(Number(body.id || 0));
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error, tests: result.tests || [] });
        return;
      }
      sendJson(res, 202, { ok: true, tests: result.tests });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice-assets/rating") {
      const body = await readJsonBody(req);
      const result = voiceAssetService.saveRating(body);
      if (result.error) {
        sendJson(res, 400, { ok: false, message: result.error });
        return;
      }
      sendJson(res, 200, { ok: true, rating: result.rating, asset: result.asset });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings") {
      const body = await readJsonBody(req);
      const providerId = String(body.provider || "dashscope").trim();
      const apiKey = String(body.apiKey || "").trim();
      if (!apiKey) {
        sendJson(res, 400, { ok: false, message: "请先输入 API Key" });
        return;
      }
      const settings = readSettings();
      if (!settings.providers[providerId]) {
        sendJson(res, 400, { ok: false, message: "未知 API 平台" });
        return;
      }
      settings.activeProvider = providerId;
      settings.providers[providerId].apiKey = apiKey;
      writeSettings(settings);
      sendJson(res, 200, { ok: true, apiKeyMask: maskApiKey(apiKey) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rewrite-settings") {
      const body = await readJsonBody(req);
      const settings = readSettings();
      const rewriteProviders = settings.rewriteProviders;
      const selectedProvider = rewriteProviders[String(body.provider || "")]
        ? String(body.provider)
        : "";

      if (selectedProvider) {
        const provider = rewriteProviders[selectedProvider];
        const apiKey = String(body.apiKey || "").trim();
        if (apiKey) provider.apiKey = apiKey;
        provider.autoModel = body.autoModel !== false && !provider.custom;
        if (body.model !== undefined && provider.autoModel === false) {
          provider.model = String(body.model || provider.model || "").trim();
        }
        if (body.baseUrl !== undefined && provider.custom) {
          provider.baseUrl = String(body.baseUrl || "").trim();
        }
        settings.rewrite.defaultProvider = selectedProvider;
        if (selectedProvider === "dashscope" && apiKey) {
          settings.providers.dashscope.apiKey = apiKey;
        }
      }

      const dashscopeApiKey = String(body.dashscopeApiKey || "").trim();
      if (dashscopeApiKey) {
        settings.providers.dashscope.apiKey = dashscopeApiKey;
        rewriteProviders.dashscope.apiKey = dashscopeApiKey;
      }

      const deepseekApiKey = String(body.deepseekApiKey || "").trim();
      if (deepseekApiKey) rewriteProviders.deepseek.apiKey = deepseekApiKey;
      if (body.deepseekModel !== undefined) {
        rewriteProviders.deepseek.model = String(body.deepseekModel || "deepseek-chat").trim() || "deepseek-chat";
      }

      if (body.customBaseUrl !== undefined) {
        rewriteProviders.custom.baseUrl = String(body.customBaseUrl || "").trim();
      }
      if (body.customModel !== undefined) {
        rewriteProviders.custom.model = String(body.customModel || "").trim();
      }
      const customApiKey = String(body.customApiKey || "").trim();
      if (customApiKey) rewriteProviders.custom.apiKey = customApiKey;

      const defaultProvider = String(body.defaultProvider || settings.rewrite.defaultProvider || "dashscope");
      if (rewriteProviders[defaultProvider]) {
        settings.rewrite.defaultProvider = defaultProvider;
      }
      settings.rewrite.referenceStyle = String(body.referenceStyle || settings.rewrite.referenceStyle || DEFAULT_REWRITE_REFERENCE).trim() || DEFAULT_REWRITE_REFERENCE;

      if (selectedProvider) {
        await refreshProviderModel(settings, selectedProvider);
      }

      writeSettings(settings);
      sendJson(res, 200, {
        ok: true,
        rewrite: publicRewriteSettings(readSettings()),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/open-folder") {
      await openExplorerPath(downloadsDir);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/open-transcript") {
      const body = await readJsonBody(req);
      const filePath = String(body.filePath || "").trim();
      if (!filePath || !isInsideDownloads(filePath) || !fs.existsSync(filePath)) {
        sendJson(res, 400, { ok: false, message: "没有找到可打开的文案文件" });
        return;
      }
      spawn("notepad.exe", [filePath], { detached: true, stdio: "ignore" }).unref();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/open-file") {
      const body = await readJsonBody(req);
      const fileName = String(body.fileName || "").trim();
      const filePath = resolveDownloadFilePath(fileName);
      if (!fileName || !isInsideDownloads(filePath) || !fs.existsSync(filePath)) {
        sendJson(res, 400, { ok: false, message: "没有找到可打开的文件" });
        return;
      }
      await openExplorerPath(filePath, { select: true });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/open-path") {
      const body = await readJsonBody(req);
      const filePath = String(body.filePath || "").trim();
      if (!filePath || !isInsideManagedFilePath(filePath) || !fs.existsSync(filePath)) {
        sendJson(res, 400, { ok: false, message: "没有找到可打开的文件位置" });
        return;
      }
      await openExplorerPath(filePath, { select: true });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/delete-files") {
      const body = await readJsonBody(req);
      const fileNames = Array.isArray(body.fileNames) ? body.fileNames : [body.fileName];
      const deleted = [];

      for (const name of fileNames) {
        const fileName = String(name || "").trim();
        if (!fileName) continue;
        const filePath = resolveDownloadFilePath(fileName);
        if (!isInsideDownloads(filePath) || !fs.existsSync(filePath)) continue;
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        fs.unlinkSync(filePath);
        deleted.push(fileName);
      }

      sendJson(res, 200, { ok: true, deleted, files: listDownloads() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/page-open") {
      const body = await readJsonBody(req);
      touchPageSession(String(body.sessionId || ""));
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/heartbeat") {
      const body = await readJsonBody(req);
      touchPageSession(String(body.sessionId || ""));
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/page-close") {
      const body = await readJsonBody(req);
      closePageSession(String(body.sessionId || ""));
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/download/start") {
      const body = await readJsonBody(req);
      const shareLink = String(body.shareLink || "").trim();
      if (!getFirstUrl(shareLink)) {
        sendJson(res, 400, { ok: false, message: "请先粘贴 yt-dlp 可识别的平台视频链接" });
        return;
      }

      const job = createDownloadJob(shareLink);
      sendJson(res, 200, { ok: true, job });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/transcript/start") {
      const body = await readJsonBody(req);
      const shareLink = String(body.shareLink || "").trim();
      const settings = readSettings();
      const providerId = String(body.provider || settings.activeProvider || "dashscope").trim();
      const provider = settings.providers[providerId];
      if (!provider) {
        sendJson(res, 400, { ok: false, message: "未知 API 平台" });
        return;
      }
      const apiKey = String(body.apiKey || provider.apiKey || "").trim();
      const validationMessage = validateShareLink(shareLink);
      if (validationMessage) {
        sendJson(res, 400, { ok: false, message: validationMessage });
        return;
      }
      if (!apiKey) {
        sendJson(res, 400, { ok: false, message: "请先填写阿里云百炼 DashScope API Key" });
        return;
      }

      if (String(body.apiKey || "").trim()) {
        const newSettings = readSettings();
        newSettings.activeProvider = providerId;
        newSettings.providers[providerId].apiKey = apiKey;
        writeSettings(newSettings);
      }

      const job = createTranscriptJob(shareLink, apiKey);
      sendJson(res, 200, { ok: true, job });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/local-video/choose") {
      const selected = await chooseLocalVideoFile();
      sendJson(res, 200, { ok: true, filePath: selected || "" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/local-media/choose-image") {
      const selected = await chooseLocalImageFile();
      sendJson(res, 200, { ok: true, filePath: selected || "" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/local-media/choose-audio") {
      const selected = await chooseLocalAudioFile();
      sendJson(res, 200, { ok: true, filePath: selected || "" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/local-video/transcript") {
      const body = await readJsonBody(req);
      const filePath = String(body.filePath || "").trim();
      if (!filePath) {
        sendJson(res, 400, { ok: false, message: "请先选择本地视频文件" });
        return;
      }
      const job = createLocalVideoTranscriptJob(filePath, String(body.apiKey || "").trim());
      sendJson(res, 200, { ok: true, job });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/local-video/audio") {
      const body = await readJsonBody(req);
      const filePath = String(body.filePath || "").trim();
      if (!filePath) {
        sendJson(res, 400, { ok: false, message: "请先选择本地视频文件" });
        return;
      }
      const job = createLocalVideoAudioJob(filePath, body.audioFormat || "mp3");
      sendJson(res, 200, { ok: true, job });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/transcript/status") {
      const id = url.searchParams.get("id") || "";
      const job = transcriptJobs.get(id);
      if (!job) {
        sendJson(res, 404, { ok: false, message: "没有找到文案任务，请重新点击提取" });
        return;
      }
      sendJson(res, 200, { ok: true, job });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/download/status") {
      const id = url.searchParams.get("id") || "";
      const job = downloadJobs.get(id);
      if (!job) {
        sendJson(res, 404, { ok: false, message: "没有找到下载任务，请重新点击下载" });
        return;
      }
      sendJson(res, 200, { ok: true, job });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tool") {
      const body = await readJsonBody(req);
      const shareLink = String(body.shareLink || "").trim();
      const action = String(body.action || "").trim();

      const firstUrl = getFirstUrl(shareLink);
      if (!firstUrl) {
        sendJson(res, 400, { ok: false, message: "请先粘贴 yt-dlp 可识别的平台视频链接" });
        return;
      }

      if (!isLikelyDouyinUrl(firstUrl)) {
        if (action === "parse" || action === "link") {
          const info = await ytDlpService.info(firstUrl);
          const videoInfo = info.videoInfo || {};
          sendJson(res, 200, {
            ok: true,
            text: [
              `视频标题: ${videoInfo.title || ""}`,
              `视频ID: ${videoInfo.videoId || ""}`,
              `平台: ${videoInfo.extractor || "yt-dlp"}`,
              `下载链接: ${videoInfo.downloadUrl || videoInfo.webpageUrl || firstUrl}`,
            ].join("\n"),
            files: listDownloads(),
          });
          return;
        }
        if (action === "download") {
          const result = await ytDlpService.download(firstUrl);
          sendJson(res, 200, {
            ok: true,
            text: [
              "yt-dlp 下载完成",
              `标题：${result.videoInfo?.title || ""}`,
              `视频：${result.videoPath || ""}`,
              result.subtitlePath ? `字幕：${result.subtitlePath}` : "",
            ].filter(Boolean).join("\n"),
            files: listDownloads(),
          });
          return;
        }
      }

      const tools = {
        parse: "parse_douyin_video_info",
        link: "get_douyin_download_link",
        download: "download_douyin_video",
      };
      const toolName = tools[action];
      if (!toolName) {
        sendJson(res, 400, { ok: false, message: "未知操作" });
        return;
      }

      const result = await runMcpTool(toolName, shareLink);
      sendJson(res, result.isError ? 400 : 200, {
        ok: !result.isError,
        text: result.text,
        files: listDownloads(),
      });
      return;
    }

    // ===== ModelRouter API =====
    if (url.pathname.startsWith("/api/router/")) {
      const route = url.pathname.replace("/api/router/", "");

      // 统一生成（带自动降级）
      if (req.method === "POST" && route === "generate") {
        const body = await readJsonBody(req);
        try {
          const result = await providerRegistry.generate(
            body.taskType || "rewrite",
            body.messages || [],
            body.options || {},
          );
          sendJson(res, 200, { ok: true, ...result });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
      }

      // 流式生成 (SSE)
      if (req.method === "POST" && route === "generate-stream") {
        const body = await readJsonBody(req);
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        try {
          await modelRouter.generateStream(
            body.taskType || "rewrite",
            body.messages || [],
            body.options || {},
            (chunk) => {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              if (chunk.done) res.end();
            }
          );
        } catch (e) {
          res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
          res.end();
        }
        return;
      }

      // 模型映射
      if (req.method === "GET" && route === "map") {
        sendJson(res, 200, { ok: true, map: publicModelMapping(readSettings()) });
        return;
      }

      // Provider 列表
      if (req.method === "GET" && route === "providers") {
        sendJson(res, 200, { ok: true, providers: modelRouter.getProviders() });
        return;
      }

      // 用量统计
      if (req.method === "GET" && route === "stats") {
        sendJson(res, 200, { ok: true, stats: modelRouter.getUsageStats() });
        return;
      }

      sendJson(res, 404, { ok: false, message: "未知路由" });
      return;
    }

    // ===== ProjectCenter API =====
    if (url.pathname === "/api/workflow/from-transcript" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = updateProjectFromTranscript({
          projectId: body.projectId || "",
          taskId: Number(body.taskId || 0),
          transcriptText: body.transcriptText || body.text || "",
          title: body.title || "",
          videoType: body.videoType || "",
          sourceUrl: body.sourceUrl || body.url || "",
        });
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (url.pathname === "/api/workflow/status" && req.method === "GET") {
      const project = projectCenter.getById(url.searchParams.get("id") || "");
      sendJson(res, project ? 200 : 404, project ? { ok: true, project, workflowState: project.workflowState } : { ok: false, message: "短视频项目不存在。" });
      return;
    }

    if (url.pathname === "/api/projects" && req.method === "GET") {
      sendJson(res, 200, { ok: true, projects: projectCenter.list({ limit: url.searchParams.get("limit") || 100 }) });
      return;
    }
    if (url.pathname === "/api/projects" && req.method === "POST") {
      const body = await readJsonBody(req);
      sendJson(res, 201, { ok: true, project: projectCenter.create(body) });
      return;
    }
    if (url.pathname === "/api/project" && req.method === "GET") {
      const project = projectCenter.getById(url.searchParams.get("id") || "");
      sendJson(res, project ? 200 : 404, project ? { ok: true, project } : { ok: false, message: "短视频项目不存在。" });
      return;
    }
    if (url.pathname === "/api/project/update" && req.method === "POST") {
      const body = await readJsonBody(req);
      const project = projectCenter.update(body.id, body.changes || body);
      sendJson(res, project ? 200 : 404, project ? { ok: true, project } : { ok: false, message: "短视频项目不存在。" });
      return;
    }
    const projectRestMatch = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(update))?$/);
    const projectRestReserved = new Set(["create", "list", "get", "update", "stats", "link-asset", "assets", "readiness", "quality", "delete", "clear", "clear-assets"]);
    const isProjectRestResource = projectRestMatch && !projectRestReserved.has(projectRestMatch[1]);
    if (isProjectRestResource && req.method === "GET" && !projectRestMatch[2]) {
      const project = projectCenter.getById(decodeURIComponent(projectRestMatch[1]));
      sendJson(res, project ? 200 : 404, project ? { ok: true, project } : { ok: false, message: "短视频项目不存在。" });
      return;
    }
    if (isProjectRestResource && req.method === "POST" && projectRestMatch[2] === "update") {
      const body = await readJsonBody(req);
      const project = projectCenter.update(decodeURIComponent(projectRestMatch[1]), body.changes || body);
      sendJson(res, project ? 200 : 404, project ? { ok: true, project } : { ok: false, message: "短视频项目不存在。" });
      return;
    }
    if (url.pathname.startsWith("/api/projects/")) {
      const route = url.pathname.replace("/api/projects/", "");
      if (req.method === "POST" && route === "create") {
        const body = await readJsonBody(req);
        sendJson(res, 200, { ok: true, project: projectCenter.create(body) });
        return;
      }
      if (req.method === "GET" && route === "list") {
        sendJson(res, 200, { ok: true, projects: projectCenter.list({ limit: url.searchParams.get("limit") || 100 }) });
        return;
      }
      if (req.method === "GET" && route === "get") {
        const project = projectCenter.getById(url.searchParams.get("id") || "");
        sendJson(res, project ? 200 : 404, project ? { ok: true, project } : { ok: false, message: "短视频项目不存在。" });
        return;
      }
      if (req.method === "POST" && route === "update") {
        const body = await readJsonBody(req);
        const project = projectCenter.update(body.id, body.changes || body);
        sendJson(res, project ? 200 : 404, project ? { ok: true, project } : { ok: false, message: "短视频项目不存在。" });
        return;
      }
      if (req.method === "GET" && route === "stats") { sendJson(res, 200, { ok: true, ...projectCenter.getStats() }); return; }
      if (req.method === "POST" && route === "link-asset") {
        const body = await readJsonBody(req);
        try {
          const linked = projectCenter.linkAsset(body.projectId, body.assetType, body.assetId, body.name, body.metadata || {});
          sendJson(res, 200, { ok: true, ...linked });
        } catch (error) {
          sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      if (req.method === "POST" && route === "clear-assets") {
        try {
          const body = await readJsonBody(req);
          sendJson(res, 200, { ok: true, ...projectCenter.removeAssetsByType(body.projectId, body.assetTypes || []) });
        } catch (error) {
          sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      if (req.method === "GET" && route === "assets") {
        sendJson(res, 200, {
          ok: true,
          assets: projectCenter.listAssets({
            projectId: url.searchParams.get("projectId") || "",
            assetType: url.searchParams.get("assetType") || "",
            useCase: url.searchParams.get("useCase") || "",
            style: url.searchParams.get("style") || "",
            ratio: url.searchParams.get("ratio") || "",
            source: url.searchParams.get("source") || "",
            status: url.searchParams.get("status") || "",
          }),
        });
        return;
      }
      if (req.method === "GET" && route === "readiness") {
        const readiness = projectCenter.getReadiness(url.searchParams.get("id") || "");
        sendJson(res, readiness ? 200 : 404, readiness ? { ok: true, readiness } : { ok: false, message: "短视频项目不存在。" });
        return;
      }
      if (req.method === "GET" && route === "quality") {
        const qualityCheck = projectCenter.getQualityCheck(url.searchParams.get("id") || "");
        sendJson(res, qualityCheck ? 200 : 404, qualityCheck ? { ok: true, qualityCheck } : { ok: false, message: "短视频项目不存在。" });
        return;
      }
      if (req.method === "POST" && route === "delete") {
        const body = await readJsonBody(req);
        projectCenter.remove(body.id);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && route === "clear") {
        sendJson(res, 200, { ok: true, deleted: projectCenter.clear() });
        return;
      }
      sendJson(res, 404, { ok: false });
      return;
    }

    // ===== Pipeline API =====
    if (url.pathname.startsWith("/api/pipeline/")) {
      const route = url.pathname.replace("/api/pipeline/", "");

      if (req.method === "GET" && route === "progress") {
        const jobId = url.searchParams.get("jobId") || "";
        sendJson(res, 200, { ok: true, ...pipelineState.getJobProgress(jobId) });
        return;
      }

      if (req.method === "GET" && route === "stages") {
        const { PIPELINE_STAGES } = await import("./server/core/pipeline-bus/PipelineEvents.js");
        sendJson(res, 200, { ok: true, stages: PIPELINE_STAGES });
        return;
      }

      if (req.method === "POST" && route === "run") {
        const body = await readJsonBody(req);
        try {
          const result = await pipelineRunner.start({
            sourceId: body.sourceId || "",
            inputData: body.inputData || {},
            startFrom: body.startFrom || "collect",
          });
          sendJson(res, 200, { ok: result.status !== "failed", ...result });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
      }

      if (req.method === "POST" && route === "register-handler") {
        const body = await readJsonBody(req);
        if (!body.stageId) { sendJson(res, 400, { ok: false, error: "missing stageId" }); return; }
        // 注册内置 handler（各模块接入）
        const builtin = {
          rewrite: async (data, ctx) => {
            ctx.onProgress(30, "AI改写中");
            const result = await providerRegistry.generate("rewrite", [{ role: "user", content: data.text || JSON.stringify(data) }]);
            ctx.onProgress(90, "改写完成");
            return { ...data, rewrite: result.content };
          },
          director: async (data, ctx) => {
            ctx.onProgress(50, "导演规划中");
            const result = await providerRegistry.generate("director", [{ role: "user", content: data.rewrite || data.text || JSON.stringify(data) }]);
            return { ...data, director: result.content };
          },
        };
        if (builtin[body.stageId]) {
          pipelineRunner.registerHandler(body.stageId, builtin[body.stageId]);
          sendJson(res, 200, { ok: true, stageId: body.stageId });
        } else {
          sendJson(res, 400, { ok: false, error: `未内置handler: ${body.stageId}` });
        }
        return;
      }

      sendJson(res, 404, { ok: false });
      return;
    }

    // ===== 剪映导出 API =====
    if (url.pathname.startsWith("/api/jianying")) {
      const route = url.pathname.replace("/api/jianying", "").replace(/^\//, "");

      if (req.method === "GET" && route === "local-config") {
        const settings = readSettings();
        sendJson(res, 200, {
          ok: true,
          appPath: settings.jianyingAppPath || "",
          draftDir: settings.jianyingDraftDir || "",
        });
        return;
      }

      if (req.method === "POST" && route === "local-config") {
        const body = await readJsonBody(req);
        try {
          const appPath = String(body.appPath || body.jianyingAppPath || "").trim();
          const draftDir = String(body.draftDir || body.jianyingDraftDir || "").trim();
          if (appPath && (!fs.existsSync(appPath) || !fs.statSync(appPath).isFile())) {
            throw new Error("剪映程序路径不存在，请填写 JianyingPro.exe 的完整路径。");
          }
          if (draftDir) fs.mkdirSync(path.resolve(draftDir), { recursive: true });
          const settings = readSettings();
          settings.jianyingAppPath = appPath;
          settings.jianyingDraftDir = draftDir ? path.resolve(draftDir) : "";
          settings.jianying = {
            appPath: settings.jianyingAppPath,
            draftDir: settings.jianyingDraftDir,
          };
          writeSettings(settings);
          sendJson(res, 200, {
            ok: true,
            appPath: settings.jianyingAppPath,
            draftDir: settings.jianyingDraftDir,
          });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message, message: e.message });
        }
        return;
      }

      if (req.method === "POST" && route === "export") {
        const body = await readJsonBody(req);
        try {
          const result = jianyingExporter.exportDraft(body);
          sendJson(res, 200, { ok: true, ...result });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
      }

      if (req.method === "GET" && route === "list") {
        sendJson(res, 200, { ok: true, drafts: jianyingExporter.listDrafts() });
        return;
      }

      if (req.method === "POST" && route === "delete") {
        const body = await readJsonBody(req);
        sendJson(res, 200, jianyingExporter.deleteDraft(body.id || ""));
        return;
      }

      sendJson(res, 404, { ok: false });
      return;
    }

    // ===== 统一分析引擎 API =====
    if (url.pathname === "/api/analyze") {
      if (req.method !== "POST") { sendJson(res, 405, { ok: false }); return; }
      const body = await readJsonBody(req);
      try {
        const result = await analysisEngine.analyzeUrl(body.url || body.value || "");
        sendJson(res, 200, { ok: true, ...result });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
      return;
    }

    // ===== ProviderRegistry API =====
    if (url.pathname.startsWith("/api/providers/")) {
      const route = url.pathname.replace("/api/providers/", "");

      if (req.method === "GET" && route === "list") {
        sendJson(res, 200, { ok: true, providers: providerRegistry.getAll() });
        return;
      }

      if (req.method === "POST" && route === "health") {
        const body = await readJsonBody(req);
        const result = await providerRegistry.healthCheck(body.id || "");
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "POST" && route === "health-all") {
        const providers = providerRegistry.getAll();
        const results = {};
        for (const p of providers) {
          results[p.id] = await providerRegistry.healthCheck(p.id);
        }
        sendJson(res, 200, { ok: true, results });
        return;
      }

      sendJson(res, 404, { ok: false });
      return;
    }

    // ===== 任务中心 API =====
    if (url.pathname === "/api/task-center/stats") {
      sendJson(res, 200, { ok: true, ...taskCenter.getStats() });
      return;
    }
    if (url.pathname === "/api/task-center/list") {
      sendJson(res, 200, { ok: true, tasks: taskCenter.getAllTasks() });
      return;
    }

    // ===== 统一设置中心 API =====
    if (url.pathname.startsWith("/api/settings/")) {
      const route = url.pathname.replace("/api/settings/", "");

      if (req.method === "GET" && route === "all") {
        sendJson(res, 200, { ok: true, settings: readSettings() });
        return;
      }

      if (req.method === "GET" && route === "model-mapping") {
        sendJson(res, 200, { ok: true, mapping: publicModelMapping(readSettings()), tasks: SETTINGS_TASKS });
        return;
      }

      if (req.method === "POST" && route === "model-mapping") {
        const body = await readJsonBody(req);
        const settings = readSettings();
        applyModelMapping(settings, body.mapping || {});
        const normalized = reloadModelRuntime(settings);
        sendJson(res, 200, {
          ok: true,
          mapping: publicModelMapping(normalized),
          providers: publicUnifiedProviders(normalized),
        });
        return;
      }

      if (req.method === "GET" && route === "providers") {
        const settings = readSettings();
        sendJson(res, 200, {
          ok: true,
          providers: publicUnifiedProviders(settings),
          tasks: SETTINGS_TASKS,
          mapping: publicModelMapping(settings),
        });
        return;
      }

      if (req.method === "POST" && route === "provider") {
        const body = await readJsonBody(req);
        if (!body.id) { sendJson(res, 400, { ok: false, message: "缺少 API 服务 ID" }); return; }
        try {
          const settings = readSettings();
          saveUnifiedProvider(settings, body);
          const normalized = reloadModelRuntime(settings);
          sendJson(res, 200, {
            ok: true,
            providers: publicUnifiedProviders(normalized),
            mapping: publicModelMapping(normalized),
            status: providerConfigStatus(normalized, String(body.id)),
          });
        } catch (error) {
          sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === "POST" && route === "require-provider") {
        const body = await readJsonBody(req);
        const result = await validateAndSaveRequiredProvider(body);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (req.method === "POST" && route === "test-provider") {
        const body = await readJsonBody(req);
        sendJson(res, 200, await testUnifiedProvider(readSettings(), String(body.id || "")));
        return;
      }

      if (req.method === "POST" && route === "test-provider-sample") {
        const body = await readJsonBody(req);
        try {
          sendJson(res, 200, await testProviderSample(String(body.id || "")));
        } catch (error) {
          sendJson(res, 400, { ok: false, status: "failed", message: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      sendJson(res, 404, { ok: false, message: "未知设置 API" });
      return;
    }

    if (await handleVideoOutputRoutes(req, res, url)) return;
    if (await handleCs1VideoRoutes(req, res, url)) return;
    if (await handleMoneyPrinterRoutes(req, res, url)) return;
    if (await handleIanXiaoheiRoutes(req, res, url)) return;

    // ===== Image Studio API =====
    if (url.pathname.startsWith("/api/image/")) {
      const route = url.pathname.replace("/api/image/", "");

      if (req.method === "POST" && route === "generate") {
        const body = await readJsonBody(req);
        try {
          const input = {
            provider: body.provider || "",
            prompt: body.prompt || "",
            aspectRatio: body.aspectRatio || "1:1",
            count: Math.min(Math.max(Number(body.count) || 1, 1), 9),
            sourceType: body.sourceType || "manual",
            sourceId: body.sourceId || "",
          };
          const result = body.async === true ? imageService.generateImageAsync(input) : await imageService.generateImage(input);
          sendJson(res, body.async === true ? 202 : 200, { ok: true, ...result });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
      }

      if (req.method === "POST" && route === "generate-storyboard") {
        const body = await readJsonBody(req);
        try {
          const input = {
            provider: body.provider || "",
            projectId: Number(body.projectId || body.directorProjectId || 0),
            aspectRatio: body.aspectRatio || "9:16",
            countPerScene: Math.min(Math.max(Number(body.countPerScene) || 1, 1), 4),
          };
          const result = body.async === true ? imageService.generateStoryboardImagesAsync(input) : await imageService.generateStoryboardImages(input);
          sendJson(res, body.async === true ? 202 : 200, { ok: true, ...result });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
      }

      if (req.method === "POST" && route === "add-local") {
        const body = await readJsonBody(req);
        try {
          const asset = await imageService.addLocalImageAsset({
            filePath: body.filePath || "",
            prompt: body.prompt || "",
            aspectRatio: body.aspectRatio || "9:16",
            sourceId: body.sourceId || "",
            sourceType: body.sourceType || "local",
            directorProjectId: Number(body.directorProjectId || body.director_project_id || 0),
            sceneIndex: Number(body.sceneIndex || body.scene_index || 0),
            assetOrder: Number(body.assetOrder || body.asset_order || 0),
          });
          sendJson(res, 200, { ok: true, asset });
        } catch (e) {
          sendJson(res, 400, { ok: false, message: e.message, error: e.message });
        }
        return;
      }

      if (req.method === "GET" && route === "jobs") {
        sendJson(res, 200, { jobs: imageService.getJobs({ limit: Number(url.searchParams.get("limit")) || 50 }) });
        return;
      }

      if (req.method === "GET" && route === "job") {
        const job = imageService.getJob(url.searchParams.get("id") || "");
        sendJson(res, job ? 200 : 404, job ? { ok: true, job } : { ok: false, message: "图片任务不存在。" });
        return;
      }

      if (req.method === "GET" && route === "stats") {
        sendJson(res, 200, { ok: true, ...imageService.getStats() });
        return;
      }

      if (req.method === "GET" && route === "assets") {
        sendJson(res, 200, { assets: imageService.getAssets({ limit: Number(url.searchParams.get("limit")) || 50 }) });
        return;
      }

      if (req.method === "POST" && route.endsWith("/delete")) {
        const assetId = route.replace("/delete", "");
        sendJson(res, 200, imageService.deleteAsset(assetId));
        return;
      }

      if (req.method === "GET" && route === "file") {
        const filePath = url.searchParams.get("path") || "";
        if (!filePath || !fs.existsSync(filePath)) {
          sendJson(res, 404, { ok: false, message: "文件不存在" });
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
        const data = fs.readFileSync(filePath);
        sendBuffer(res, 200, data, mime[ext] || "application/octet-stream");
        return;
      }

      if (req.method === "GET" && route === "thumbnail") {
        const filePath = url.searchParams.get("path") || "";
        try {
          const thumbPath = await imageService.thumbnailForImage(filePath, { width: Number(url.searchParams.get("width")) || 360 });
          const ext = path.extname(thumbPath).toLowerCase();
          const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
          sendBuffer(res, 200, fs.readFileSync(thumbPath), mime[ext] || "image/jpeg");
        } catch (error) {
          sendJson(res, 404, { ok: false, message: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      sendJson(res, 404, { ok: false, message: "未知路由" });
      return;
    }

    if (req.method === "GET") {
      serveStatic(req, res);
      return;
    }

    res.writeHead(405);
    res.end("Method not allowed");
  } catch (error) {
    sendJson(res, error instanceof HttpBodyError ? error.statusCode : 500, {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws/progress") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wsClients.add(ws);
      ws.on("close", () => wsClients.delete(ws));
      ws.send(JSON.stringify({ type: "connected", message: "已连接进度推送" }));
    });
  } else {
    socket.destroy();
  }
});

function listen(port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

async function start() {
  const movedDownloads = organizeLooseDownloadFiles();
  syncMovedDownloadTaskPaths(movedDownloads);
  if (movedDownloads.length) {
    console.log(`Organized downloads: ${movedDownloads.length} file(s)`);
  }

  let port = 8787;
  while (port < 8800) {
    try {
      await listen(port);
      break;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
      port += 1;
    }
  }

  const url = `http://127.0.0.1:${port}`;
  fs.writeFileSync(pidPath, String(process.pid), "utf8");
  fs.writeFileSync(urlPath, url, "utf8");
  console.log(`Douyin page: ${url}`);
  console.log(`Download folder: ${downloadsDir}`);
  console.log("Keep this window open while using the page.");
  startTaskQueue();

  if (process.argv.includes("--open")) {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  }
}

function cleanupRuntimeFiles() {
  for (const filePath of [pidPath, urlPath]) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // Best effort cleanup only.
    }
  }
}

process.on("exit", cleanupRuntimeFiles);
process.on("SIGINT", () => {
  cleanupRuntimeFiles();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupRuntimeFiles();
  process.exit(0);
});

start().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
