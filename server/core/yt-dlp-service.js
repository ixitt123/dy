import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

const YT_DLP_RELEASE_API = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v"]);
const SUBTITLE_EXTENSIONS = [".srt", ".vtt", ".ass", ".json3"];
const AUDIO_FORMATS = new Set(["mp3", "wav", "m4a"]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeBaseName(value, fallback = "media") {
  return String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || fallback;
}

function fileExists(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile());
  } catch {
    return false;
  }
}

function executableName() {
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

async function downloadFile(url, filePath) {
  const response = await fetch(url, {
    headers: { "User-Agent": "dy-local-workbench" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`yt-dlp 下载失败：HTTP ${response.status}`);
  }
  const tmpPath = `${filePath}.download`;
  const writer = fs.createWriteStream(tmpPath);
  try {
    for await (const chunk of response.body) {
      if (!writer.write(Buffer.from(chunk))) await once(writer, "drain");
    }
    writer.end();
    await once(writer, "finish");
    fs.renameSync(tmpPath, filePath);
    if (process.platform !== "win32") fs.chmodSync(filePath, 0o755);
  } catch (error) {
    writer.destroy();
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw error;
  }
}

async function ensureYtDlpBinary(baseDir) {
  const binDir = ensureDir(path.join(baseDir, ".data", "bin"));
  const binPath = path.join(binDir, executableName());
  if (fileExists(binPath)) return binPath;

  const response = await fetch(YT_DLP_RELEASE_API, {
    headers: { "User-Agent": "dy-local-workbench" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `读取 yt-dlp 最新版本失败：HTTP ${response.status}`);
  }
  const assetName = executableName();
  const asset = Array.isArray(data.assets)
    ? data.assets.find((item) => item.name === assetName)
    : null;
  if (!asset?.browser_download_url) {
    throw new Error(`yt-dlp 最新版本没有找到 ${assetName} 下载资源`);
  }
  await downloadFile(asset.browser_download_url, binPath);
  return binPath;
}

function runProcess(command, args, {
  cwd,
  signal,
  onStdout = () => {},
  onStderr = () => {},
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      fn(value);
    };
    const onAbort = () => {
      try { child.kill("SIGTERM"); } catch {}
      finish(reject, new Error("任务已暂停"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      onStdout(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      onStderr(text);
    });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      if (code === 0) finish(resolve, { stdout, stderr });
      else finish(reject, new Error((stderr || stdout || `${command} exited ${code}`).trim()));
    });
  });
}

function parseProgress(text) {
  const match = String(text).match(/\[download\]\s+([0-9.]+)%/);
  if (!match) return null;
  return Math.max(0, Math.min(100, Number(match[1] || 0)));
}

function parseInfoJson(stdout) {
  const text = String(stdout || "").trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const jsonLine = lines.reverse().find((line) => line.startsWith("{"));
  if (!jsonLine) throw new Error("yt-dlp 没有返回可解析的视频信息");
  return JSON.parse(jsonLine);
}

function findSubtitleForVideo(videoPath) {
  if (!videoPath) return "";
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const candidates = files
    .filter((name) => name.startsWith(base) && SUBTITLE_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .sort((a, b) => {
      const score = (name) => name.endsWith(".srt") ? 0 : name.endsWith(".vtt") ? 1 : 2;
      return score(a) - score(b);
    });
  return candidates.length ? path.join(dir, candidates[0]) : "";
}

function findInfoJsonForVideo(videoPath) {
  if (!videoPath) return "";
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  const candidate = path.join(dir, `${base}.info.json`);
  return fileExists(candidate) ? candidate : "";
}

async function ffprobeDuration(ffprobePath, mediaPath, signal) {
  if (!ffprobePath || !fileExists(mediaPath)) return 0;
  try {
    const { stdout } = await runProcess(ffprobePath, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      mediaPath,
    ], { signal });
    return Math.max(0, Number(String(stdout || "").trim() || 0));
  } catch {
    return 0;
  }
}

function srtTime(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.floor(value % 60);
  const ms = Math.floor((value - Math.floor(value)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function textToApproximateSrt(text, duration = 0) {
  const sentences = String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？!?；;])\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  const rows = sentences.length ? sentences : String(text || "").match(/.{1,32}/g) || [];
  if (!rows.length) return "";
  const total = duration > 0 ? duration : Math.max(6, rows.length * 3);
  const slice = total / rows.length;
  return rows.map((row, index) => {
    const start = index * slice;
    const end = index === rows.length - 1 ? total : (index + 1) * slice;
    return `${index + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${row}\n`;
  }).join("\n");
}

function createYtDlpService({
  baseDir,
  downloadsDir,
  getDownloadsDir,
  ffmpegPath,
  ffprobePath,
}) {
  const outputDir = () => String(typeof getDownloadsDir === "function" ? getDownloadsDir() : downloadsDir);

  async function binary() {
    return ensureYtDlpBinary(baseDir);
  }

  async function info(url, { signal } = {}) {
    const bin = await binary();
    const result = await runProcess(bin, [
      "--dump-json",
      "--skip-download",
      "--no-playlist",
      "--no-warnings",
      url,
    ], { cwd: baseDir, signal });
    const raw = parseInfoJson(result.stdout);
    return {
      raw,
      videoInfo: {
        title: raw.title || raw.fulltitle || raw.id || "video",
        videoId: raw.id || "",
        downloadUrl: raw.url || raw.webpage_url || url,
        webpageUrl: raw.webpage_url || url,
        extractor: raw.extractor || raw.extractor_key || "yt-dlp",
        duration: Number(raw.duration || 0),
      },
    };
  }

  async function download(url, { signal, onProgress = () => {} } = {}) {
    const bin = await binary();
    const targetDir = ensureDir(outputDir());
    const printed = [];
    const args = [
      "--no-playlist",
      "--newline",
      "--windows-filenames",
      "--merge-output-format", "mp4",
      "--paths", targetDir,
      "-o", "%(title).120B_%(id)s.%(ext)s",
      "--write-info-json",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs", "zh-Hans,zh-CN,zh,en",
      "--sub-format", "srt/best",
      "--convert-subs", "srt",
      "--print", "after_move:filepath",
      ...(ffmpegPath ? ["--ffmpeg-location", path.dirname(ffmpegPath)] : []),
      url,
    ];
    await runProcess(bin, args, {
      cwd: baseDir,
      signal,
      onStdout: (text) => {
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          printed.push(trimmed);
          const percent = parseProgress(trimmed);
          if (percent !== null) onProgress({ percent, message: `yt-dlp 下载 ${percent.toFixed(1)}%` });
        }
      },
      onStderr: (text) => {
        const percent = parseProgress(text);
        if (percent !== null) onProgress({ percent, message: `yt-dlp 下载 ${percent.toFixed(1)}%` });
      },
    });
    const videoPath = printed
      .map((line) => line.replace(/^file:/, ""))
      .find((line) => fileExists(line) && VIDEO_EXTENSIONS.has(path.extname(line).toLowerCase()))
      || "";
    if (!videoPath) {
      throw new Error("yt-dlp 下载完成，但没有找到本地视频文件");
    }
    const infoPath = findInfoJsonForVideo(videoPath);
    let raw = {};
    if (infoPath) {
      try { raw = JSON.parse(fs.readFileSync(infoPath, "utf8")); } catch {}
    }
    return {
      videoPath,
      subtitlePath: findSubtitleForVideo(videoPath),
      infoPath,
      raw,
      videoInfo: {
        title: raw.title || path.basename(videoPath, path.extname(videoPath)),
        videoId: raw.id || "",
        downloadUrl: raw.webpage_url || url,
        webpageUrl: raw.webpage_url || url,
        extractor: raw.extractor || raw.extractor_key || "yt-dlp",
        duration: Number(raw.duration || 0),
      },
    };
  }

  async function extractAudio(mediaPath, { format = "mp3", signal, onProgress = () => {} } = {}) {
    const safeFormat = AUDIO_FORMATS.has(String(format || "").toLowerCase()) ? String(format).toLowerCase() : "mp3";
    if (!ffmpegPath) throw new Error("未找到 ffmpeg，无法提取音频");
    if (!fileExists(mediaPath)) throw new Error("没有找到可提取音频的视频文件");
    const targetDir = ensureDir(outputDir());
    const base = safeBaseName(path.basename(mediaPath, path.extname(mediaPath)));
    const outputPath = path.join(targetDir, `${base}_audio.${safeFormat}`);
    const argsByFormat = {
      mp3: ["-y", "-i", mediaPath, "-vn", "-codec:a", "libmp3lame", "-q:a", "2", outputPath],
      wav: ["-y", "-i", mediaPath, "-vn", "-acodec", "pcm_s16le", "-ar", "44100", outputPath],
      m4a: ["-y", "-i", mediaPath, "-vn", "-c:a", "aac", "-b:a", "192k", outputPath],
    };
    onProgress({ percent: 5, message: "正在提取音频" });
    await runProcess(ffmpegPath, argsByFormat[safeFormat], { cwd: baseDir, signal });
    onProgress({ percent: 100, message: "音频提取完成" });
    return outputPath;
  }

  async function createApproximateSubtitle(mediaPath, text, outputPath, { signal } = {}) {
    const duration = await ffprobeDuration(ffprobePath, mediaPath, signal);
    const srt = textToApproximateSrt(text, duration);
    if (!srt) return "";
    const target = outputPath || path.join(
      ensureDir(outputDir()),
      `${safeBaseName(path.basename(mediaPath || "transcript", path.extname(mediaPath || "")))}_校正文案.srt`,
    );
    fs.writeFileSync(target, srt, "utf8");
    return target;
  }

  return {
    binary,
    info,
    download,
    extractAudio,
    createApproximateSubtitle,
  };
}

export { createYtDlpService, ensureYtDlpBinary };
