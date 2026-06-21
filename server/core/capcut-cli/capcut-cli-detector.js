import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const WINDOWS = process.platform === "win32";

function run(command, args, timeout = 8000) {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      windowsHide: true,
      timeout,
      shell: false,
    });
    return {
      ok: result.status === 0 && !result.error,
      status: result.status,
      stdout: String(result.stdout || "").trim(),
      stderr: String(result.stderr || "").trim(),
      error: result.error ? result.error.message : "",
    };
  } catch (error) {
    return { ok: false, status: null, stdout: "", stderr: "", error: error.message };
  }
}

function firstLine(result) {
  return String(result.stdout || result.stderr || result.error || "").split(/\r?\n/).find(Boolean) || "";
}

function probeExecutable(command, args = ["-version"]) {
  const result = run(command, args);
  return { ok: result.ok, detail: firstLine(result), command, args };
}

function directoryHasTemplate(directory) {
  if (!directory || !fs.existsSync(directory)) return false;
  return fs.readdirSync(directory, { withFileTypes: true }).some((entry) => entry.name !== ".gitkeep");
}

export function createCapcutCliDetector({ baseDir, ffmpegPath = "", getSettings = () => ({}) } = {}) {
  const templatesRoot = path.join(baseDir, "templates", "jianying");
  const outputRoot = path.join(baseDir, "video-products");

  function detect(overrides = {}) {
    const settings = { ...getSettings(), ...overrides };
    const npxCommand = WINDOWS ? "npx.cmd" : "npx";
    const capcutCommand = WINDOWS ? "capcut.cmd" : "capcut";
    const npxResult = run(npxCommand, ["--no-install", "capcut-cli", "--version"]);
    const directResult = npxResult.ok ? null : run(capcutCommand, ["--version"]);
    const capcutResult = npxResult.ok ? npxResult : directResult;
    const capcutInvocation = npxResult.ok
      ? { command: npxCommand, prefixArgs: ["--no-install", "capcut-cli"] }
      : directResult?.ok
        ? { command: capcutCommand, prefixArgs: [] }
        : null;

    const nodeMajor = Number(process.versions.node.split(".")[0] || 0);
    const ffmpeg = ffmpegPath && fs.existsSync(ffmpegPath)
      ? probeExecutable(ffmpegPath)
      : probeExecutable(WINDOWS ? "ffmpeg.exe" : "ffmpeg");
    const bundledFfprobe = ffmpegPath ? path.join(path.dirname(ffmpegPath), WINDOWS ? "ffprobe.exe" : "ffprobe") : "";
    const ffprobe = bundledFfprobe && fs.existsSync(bundledFfprobe)
      ? probeExecutable(bundledFfprobe)
      : probeExecutable(WINDOWS ? "ffprobe.exe" : "ffprobe");

    const configuredDraftDirectory = String(
      settings.jianyingDraftDir || settings.jianying_draft_dir || settings.jianying?.draftDir || "",
    ).trim();
    const draftDirectory = configuredDraftDirectory ? path.resolve(configuredDraftDirectory) : "";
    const templateDirectories = fs.existsSync(templatesRoot)
      ? fs.readdirSync(templatesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      : [];
    const detectedTemplates = templateDirectories.filter((entry) => directoryHasTemplate(path.join(templatesRoot, entry.name, "draft_template")));

    let outputReady = false;
    try {
      fs.mkdirSync(outputRoot, { recursive: true });
      fs.accessSync(outputRoot, fs.constants.W_OK);
      outputReady = true;
    } catch {
      outputReady = false;
    }

    const checks = {
      capcutCli: {
        ok: Boolean(capcutResult?.ok),
        label: capcutResult?.ok ? "已安装" : "未安装",
        detail: capcutResult?.ok ? firstLine(capcutResult) : "将自动使用素材包兼容模式",
      },
      node: {
        ok: nodeMajor >= 18,
        label: `Node ${process.versions.node}`,
        detail: nodeMajor >= 18 ? "运行环境正常" : "建议升级到 Node 18 或更高版本",
      },
      ffmpeg: {
        ok: ffmpeg.ok,
        label: ffmpeg.ok ? "可用" : "不可用",
        detail: `FFmpeg ${ffmpeg.ok ? "正常" : "缺失"}；ffprobe ${ffprobe.ok ? "正常" : "缺失"}`,
      },
      ffprobe: {
        ok: ffprobe.ok,
        label: ffprobe.ok ? "可用" : "不可用",
        detail: ffprobe.detail || "未找到 ffprobe",
      },
      draftDirectory: {
        ok: Boolean(draftDirectory && fs.existsSync(draftDirectory)),
        label: draftDirectory && fs.existsSync(draftDirectory) ? "已配置" : "未配置",
        detail: draftDirectory || "请在系统设置中选择剪映草稿目录",
      },
      templateMaster: {
        ok: detectedTemplates.length > 0,
        label: detectedTemplates.length > 0 ? `已检测 ${detectedTemplates.length} 个` : "未检测",
        detail: detectedTemplates.length > 0 ? detectedTemplates.map((entry) => entry.name).join("、") : "请把剪映母版复制到模板目录",
      },
      outputDirectory: {
        ok: outputReady,
        label: outputReady ? "正常" : "异常",
        detail: outputRoot,
      },
    };

    return {
      ok: true,
      mode: checks.capcutCli.ok && checks.templateMaster.ok ? "capcut_cli" : "compatibility_package",
      checks,
      invocation: capcutInvocation,
      paths: { templatesRoot, draftDirectory, outputRoot },
      detectedTemplates: detectedTemplates.map((entry) => entry.name),
    };
  }

  return { detect, run };
}
