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
import { TTS_PROVIDER_LABELS } from "./server/tts/providers/index.js";
import { createVoiceAssetService } from "./server/voices/voice-asset-service.js";
import { createDirectorService } from "./server/director/director-service.js";
import { createVfoService } from "./server/vfo/vfo-service.js";
import { createVideoProductService } from "./server/video-product/video-product-service.js";
import { createVideoOutputRoutes } from "./server/routes/video-output-routes.js";
import { HttpBodyError, readBody, readJsonBody } from "./server/utils/http-body.js";
import { DEFAULT_REWRITE_REFERENCE, REWRITE_DIRECTIONS, REWRITE_STYLES, REWRITE_VERSION_DEFS, REWRITE_VERSION_DEFAULTS } from "./server/config/rewrite-presets.js";
import { DEFAULT_MODEL_MAPPING, DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL, SETTINGS_TASKS } from "./server/config/model-defaults.js";
import { AUTO_MODEL_VALUE, REWRITE_PROVIDER_ORDER, REWRITE_PROVIDER_PRESETS } from "./server/config/provider-presets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.join(__dirname, "ui");
const skillsDir = path.join(__dirname, "skills");
const promptsDir = path.join(__dirname, "prompts");
const rewritesDir = path.join(__dirname, "rewrites");
const referenceExamplesPath = path.join(__dirname, "reference_examples.json");
const defaultDownloadsDir = path.join(__dirname, "downloads");
const localMediaDir = path.join(__dirname, "local-media");
const pidPath = path.join(__dirname, "ui-server.pid");
const urlPath = path.join(__dirname, "ui-server.url");
const settingsPath = path.join(__dirname, "settings.json");
const mcpEntry = path.join(
  __dirname,
  "node_modules",
  "@yc-w-cn",
  "douyin-mcp-server",
  "dist",
  "index.js"
);
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
const taskStore = openTaskStore(__dirname);
taskStore.resetActiveTasks();
const ttsService = createTtsService({
  baseDir: __dirname,
  taskStore,
  getSettings: readSettings,
  ffmpegPath,
});
const voiceAssetService = createVoiceAssetService({
  baseDir: __dirname,
  taskStore,
  ttsService,
  getSettings: readSettings,
  ffmpegPath,
});
const directorService = createDirectorService({
  baseDir: __dirname,
  taskStore,
  generateJson: generateDirectorJson,
  onIdle: scheduleShutdownIfIdle,
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
const projectCenter = createProjectCenter(__dirname);

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
  onProgress: (data) => broadcastProgress({ type: "video-product", ...data }),
  onIdle: scheduleShutdownIfIdle,
});

const handleVideoOutputRoutes = createVideoOutputRoutes({
  videoProductService,
  sendJson,
  sendBuffer,
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
  next.activeProvider = next.activeProvider || "dashscope";
  next.providers = providers;
  next.rewriteProviders = rewriteProviders;
  next.rewrite = {
    defaultProvider: rewriteProviders[String(rewrite.defaultProvider || "dashscope")]
      ? String(rewrite.defaultProvider || "dashscope")
      : "dashscope",
    defaultDirection: REWRITE_DIRECTIONS.includes(String(rewrite.defaultDirection || "招生引流"))
      ? String(rewrite.defaultDirection || "招生引流")
      : "招生引流",
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

  throw new Error("未知 API 服务");
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

function makeUniquePath(baseName, extension) {
  const safeBase = (sanitizeFileName(baseName) || `douyin_${Date.now()}`).slice(0, 120);
  let filePath = path.join(downloadsDir, `${safeBase}${extension}`);
  let index = 2;
  while (fs.existsSync(filePath)) {
    filePath = path.join(downloadsDir, `${safeBase}_${index}${extension}`);
    index += 1;
  }
  return filePath;
}

function parseVideoInfoFromToolText(text) {
  const title = text.match(/视频标题:\s*(.+)/)?.[1]?.trim() || "";
  const videoId = text.match(/视频ID:\s*(.+)/)?.[1]?.trim() || "";
  const downloadUrl = text.match(/下载链接:\s*(https?:\/\/[^\r\n]+)/)?.[1]?.trim() || "";
  return { title, videoId, downloadUrl };
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
  return /fetch failed|downloadfailed|cannot be downloaded|audio file cannot be downloaded|invalidfile/i.test(errorMessage(error));
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
    return "请先粘贴抖音分享链接";
  }
  if (!isLikelyDouyinUrl(firstUrl)) {
    return "这个不像抖音分享链接，请重新复制抖音里的分享内容";
  }
  return "";
}

function createDownloadJob(shareLink) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  runMcpTool("download_douyin_video", shareLink, (progress) => {
    updateJob({
      percent: Math.max(job.percent, Math.round(Number(progress.percent || 0))),
      message: progress.message || job.message,
    });
  })
    .then((result) => {
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
  const filePath = makeUniquePath(`${title}_文案`, ".txt");
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
      const filePath = path.join(downloadsDir, file.name);
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
  const filePath = makeUniquePath(baseName, ".mp4");
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
  const wavPath = makeUniquePath(`${path.basename(mediaPath, path.extname(mediaPath))}_asr`, ".wav");
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
    throw new Error(data.message || data.error?.message || `AI 分析请求失败：HTTP ${response.status}`);
  }

  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseJsonFromModelText(content);
  return normalizeAnalysis({ ...parsed, source: model }, transcriptText);
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

function normalizeVersionSpecs(input = [], fallbackDirection = "招生引流") {
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
  const versionSpecs = normalizeVersionSpecs(meta.versionSpecs, meta.direction || "招生引流");
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
    direction: meta.direction || "招生引流",
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
  const versionSpecs = normalizeVersionSpecs(versionsInput, body.direction || task.rewrite_direction || "招生引流");
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
    direction: body.direction || task.rewrite_direction || "招生引流",
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
  const safeDirection = REWRITE_DIRECTIONS.includes(direction) ? direction : "招生引流";
  const safeStyle = REWRITE_STYLES.includes(style) ? style : "老板风格";
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
      revision_instruction: String(revisionInstruction || "").trim() || "无，按正常改写要求生成。",
      version_specs: JSON.stringify(specBatch, null, 2),
      skill_rewrite_douyin_education: assets.skills.rewriteEducation,
      skill_boss_style: assets.skills.bossStyle,
    });
    const draftContent = await chatCompletion(provider, [
      {
        role: "system",
        content: [
          "你是本地招生文案改写实验室的 rewrite pipeline 执行器。",
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
  const filePath = makeUniquePath(`${title}_AI分析`, ".txt");
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
    const linkResult = await runMcpTool("get_douyin_download_link", shareLink);
    if (linkResult.isError) {
      throw new Error(linkResult.text || "解析视频失败");
    }

    const videoInfo = parseVideoInfoFromToolText(linkResult.text);
    if (!videoInfo.downloadUrl) {
      throw new Error("没有解析到可识别的视频地址");
    }

    const transcriptText = await extractTranscriptForVideoInfo(videoInfo, apiKey, updateJob);
    const transcriptPath = saveTranscript(videoInfo, transcriptText);
    updateJob({ percent: 96, message: "正在进行 AI 分析" });
    const analysis = await analyzeTranscriptWithDashScope(apiKey, transcriptText, videoInfo);
    const analysisPath = saveAnalysis(videoInfo, analysis);
    updateJob({
      status: "done",
      percent: 100,
      message: "文案和 AI 分析完成",
      text: transcriptText,
      transcriptPath,
      analysisPath,
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
    analysisEnabled: true,
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
    const transcriptText = await transcribeLocalMediaWithDashScope(activeApiKey, resolvedPath, (progress) => {
      const percent = Math.max(10, Math.min(92, Math.round(Number(progress.percent || 0))));
      updateJob({ percent, message: progress.message || "正在识别本地视频" });
      taskStore.updateTask(task.id, {
        status: TASK_STATUS.TRANSCRIBING,
        progress: percent,
        message: progress.message || "正在识别本地视频",
      });
    });
    const transcriptPath = saveTranscript(videoInfo, transcriptText);
    updateJob({ percent: 94, message: "正在进行 AI 分析" });
    taskStore.updateTask(task.id, {
      txt_path: transcriptPath,
      progress: 94,
      message: "正在进行 AI 分析",
    });
    const analysis = await analyzeTranscriptWithDashScope(activeApiKey, transcriptText, videoInfo);
    const analysisPath = saveAnalysis(videoInfo, analysis);
    taskStore.updateTask(task.id, {
      txt_path: transcriptPath,
      analysis_path: analysisPath,
      ai_json: JSON.stringify(analysis),
      status: TASK_STATUS.DONE,
      progress: 100,
      message: "本地视频文案和 AI 分析完成",
      completed_at: new Date().toISOString(),
    });
    updateJob({
      status: "done",
      percent: 100,
      message: "本地视频文案和 AI 分析完成",
      text: transcriptText,
      transcriptPath,
      analysisPath,
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
  return String(provider?.apiKey || "").trim();
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
  const linkResult = await runMcpTool("get_douyin_download_link", task.url, (progress) => {
    taskStore.updateTask(task.id, {
      progress: Math.max(3, Math.min(9, Math.round(Number(progress.percent || 0)))),
      message: progress.message || "正在解析视频",
    });
  }, { signal });

  if (linkResult.isError) {
    throw new Error(linkResult.text || "解析视频失败");
  }

  const videoInfo = parseVideoInfoFromToolText(linkResult.text);
  if (!videoInfo.downloadUrl) {
    throw new Error("没有解析到可下载视频地址");
  }
  return videoInfo;
}

async function completeTaskWithTranscript(task, videoInfo, messagePrefix = "", signal) {
  throwIfPaused(signal);
  const apiKey = getActiveProviderApiKey();
  const updates = {};
  let transcriptText = "";
  let txtPath = findExistingTranscript(videoInfo);

  if (txtPath) {
    transcriptText = fs.readFileSync(txtPath, "utf8").trim();
    updates.txt_path = txtPath;
  }

  if (task.transcript_enabled && !txtPath) {
    if (!apiKey) {
      updates.message = `${messagePrefix}视频已完成；未配置 DashScope API Key，已跳过文案和 AI 分析`;
      return updates;
    }

    taskStore.updateTask(task.id, {
      status: TASK_STATUS.TRANSCRIBING,
      progress: 72,
      message: "准备提取文案",
    });
    const localVideoPath = task.video_path && fs.existsSync(task.video_path)
      ? task.video_path
      : findExistingVideo(videoInfo);
    transcriptText = await extractTranscriptForVideoInfo(videoInfo, apiKey, (progress) => {
      const raw = Number(progress.percent || 0);
      taskStore.updateTask(task.id, {
        status: TASK_STATUS.TRANSCRIBING,
        progress: Math.max(72, Math.min(96, Math.round(72 + raw * 0.24))),
        message: progress.message || "正在提取文案",
      });
    }, signal, { localVideoPath });
    txtPath = saveTranscript(videoInfo, transcriptText);
    updates.txt_path = txtPath;
  }

  if (task.analysis_enabled && transcriptText) {
    if (!apiKey) {
      updates.message = `${messagePrefix}视频和文案已完成；未配置 DashScope API Key，已跳过 AI 分析`;
      return updates;
    }
    taskStore.updateTask(task.id, {
      status: TASK_STATUS.TRANSCRIBING,
      progress: 97,
      message: "正在进行 AI 分析",
    });
    const analysis = await analyzeTranscriptWithDashScope(apiKey, transcriptText, videoInfo, signal);
    const analysisPath = saveAnalysis(videoInfo, analysis);
    updates.analysis_path = analysisPath;
    updates.ai_json = JSON.stringify(analysis);
  }

  updates.message = `${messagePrefix}${txtPath ? (updates.analysis_path ? "视频、文案和 AI 分析已完成" : "视频和文案已完成") : "视频已完成"}`;
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

    const videoInfo = await parseVideoInfoForTask(task, signal);
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
      const transcriptUpdates = await completeTaskWithTranscript(
        { ...taskStore.getTask(task.id), transcript_enabled: true, analysis_enabled: false },
        videoInfo,
        "仅提取文案：",
        signal
      );
      taskStore.updateTask(task.id, {
        ...transcriptUpdates,
        video_path: "",
        file_size: 0,
        file_hash: "",
        status: TASK_STATUS.DONE,
        progress: 100,
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
      const downloaded = await downloadVideoFile(videoInfo, (progress) => {
        const raw = Number(progress.percent || 0);
        taskStore.updateTask(task.id, {
          status: TASK_STATUS.DOWNLOADING,
          progress: Math.max(10, Math.min(70, Math.round(10 + raw * 0.6))),
          message: progress.message || "正在下载视频",
        });
      }, signal);
      videoPath = downloaded.filePath;
      fileSize = downloaded.fileSize;
      fileHash = downloaded.fileHash;
      taskStore.updateTask(task.id, {
        video_path: videoPath,
        file_size: fileSize,
        file_hash: fileHash,
        progress: 70,
        message: "下载完成，准备文案",
      });
    }

    const transcriptUpdates = await completeTaskWithTranscript(taskStore.getTask(task.id), videoInfo, messagePrefix, signal);
    taskStore.updateTask(task.id, {
      ...transcriptUpdates,
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
  return fs
    .readdirSync(downloadsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(downloadsDir, entry.name);
      const stat = fs.statSync(filePath);
      return {
        name: entry.name,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
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
      const taskAction = ["parse", "link", "download", "transcript"].includes(String(body.action || "download"))
        ? String(body.action || "download")
        : "download";
      const batchSettings = saveBatchSettings({
        concurrency,
        limit,
        skipDownloaded: body.skipDownloaded !== false,
      });
      const extracted = extractDouyinUrls(String(body.text || ""), {
        limit,
        kind: String(body.kind || "video"),
        taskAction,
        transcriptEnabled: taskAction === "transcript",
        analysisEnabled: false,
        onlyTranscript: taskAction === "transcript",
      });

      if (extracted.items.length === 0) {
        sendJson(res, 400, { ok: false, message: "没有识别到抖音链接" });
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
      const filePath = path.join(downloadsDir, fileName);
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
        const filePath = path.join(downloadsDir, fileName);
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
      const validationMessage = validateShareLink(shareLink);
      if (validationMessage) {
        sendJson(res, 400, { ok: false, message: validationMessage });
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
        sendJson(res, 400, { ok: false, message: "请先粘贴抖音分享链接" });
        return;
      }
      if (!isLikelyDouyinUrl(firstUrl)) {
        sendJson(res, 400, { ok: false, message: "这个不像抖音分享链接，请重新复制抖音里的分享内容" });
        return;
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

    // ===== Image Studio API =====
    if (url.pathname.startsWith("/api/image/")) {
      const route = url.pathname.replace("/api/image/", "");

      if (req.method === "POST" && route === "generate") {
        const body = await readJsonBody(req);
        try {
          const result = await imageService.generateImage({
            provider: body.provider || "",
            prompt: body.prompt || "",
            aspectRatio: body.aspectRatio || "1:1",
            count: Math.min(Math.max(Number(body.count) || 1, 1), 9),
            sourceType: body.sourceType || "manual",
            sourceId: body.sourceId || "",
          });
          sendJson(res, 200, result);
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
      }

      if (req.method === "POST" && route === "generate-storyboard") {
        const body = await readJsonBody(req);
        try {
          const result = await imageService.generateStoryboardImages({
            provider: body.provider || "",
            projectId: Number(body.projectId || body.directorProjectId || 0),
            aspectRatio: body.aspectRatio || "9:16",
            countPerScene: Math.min(Math.max(Number(body.countPerScene) || 1, 1), 4),
          });
          sendJson(res, 200, { ok: true, ...result });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
      }

      if (req.method === "POST" && route === "add-local") {
        const body = await readJsonBody(req);
        try {
          const asset = imageService.addLocalImageAsset({
            filePath: body.filePath || "",
            prompt: body.prompt || "",
            aspectRatio: body.aspectRatio || "9:16",
            sourceId: body.sourceId || "",
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
