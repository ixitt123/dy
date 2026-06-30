import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createCapcutCliDetector } from "./capcut-cli-detector.js";
import { buildCapcutCliPlan, buildCapcutCompileSpec, writeCapcutCliPlan } from "./capcut-cli-plan-builder.js";
import { parseCapcutCliResult } from "./capcut-cli-result-parser.js";

function safeDraftName(value) {
  const cleaned = String(value || "codex_video")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return cleaned || "codex_video";
}

function hardenDraftTextLayout(draftDirectory) {
  const contentPath = path.join(draftDirectory || "", "draft_content.json");
  if (!contentPath || !fs.existsSync(contentPath)) return { ok: false, warnings: [] };
  try {
    const draft = JSON.parse(fs.readFileSync(contentPath, "utf8"));
    const texts = Array.isArray(draft.materials?.texts) ? draft.materials.texts : [];
    let changed = 0;
    for (const text of texts) {
      const currentSize = Number(text.font_size || text.text_size || 0);
      if (currentSize > 0) {
        const maxSize = currentSize > 15 ? 18 : 15;
        text.font_size = Math.min(currentSize, maxSize);
        text.text_size = Math.min(Number(text.text_size || currentSize), maxSize);
      }
      text.line_max_width = Math.min(Number(text.line_max_width || 0.82), 0.70);
      text.force_apply_line_max_width = true;
      text.fixed_width = Number(text.fixed_width || 0) > 0
        ? Math.min(Number(text.fixed_width), 0.70)
        : 0.70;
      if (typeof text.content === "string") {
        try {
          const content = JSON.parse(text.content);
          if (Array.isArray(content.styles)) {
            for (const style of content.styles) {
              if (style?.size) style.size = Math.min(Number(style.size), currentSize > 15 ? 18 : 15);
            }
            text.content = JSON.stringify(content);
          }
        } catch {
          // Keep CapCut's original text payload if it cannot be parsed.
        }
      }
      changed += 1;
    }
    fs.writeFileSync(contentPath, JSON.stringify(draft, null, 2), "utf8");
    return { ok: true, changed, warnings: changed ? [`已强制收紧 ${changed} 条剪映字幕宽度和字号。`] : [] };
  } catch (error) {
    return { ok: false, warnings: [`剪映字幕布局后处理失败：${error.message}`] };
  }
}

export function createCapcutCliAdapter(options = {}) {
  const detector = options.detector || createCapcutCliDetector(options);

  function detectCapabilities() {
    const status = detector.detect();
    const probes = {
      doctor: ["doctor"],
      version: ["--version"],
      help: ["--help"],
      describe: ["describe"],
    };
    const commands = {};
    const warnings = [];
    if (!status.invocation) {
      Object.keys(probes).forEach((name) => {
        commands[name] = { ok: false, command: probes[name].join(" "), stdout: "", stderr: "capcut-cli 未安装" };
      });
      return { ...status, mode: "compatibility_package", capabilities: { ready: false, commands }, warnings: ["capcut-cli 不可用，进入素材包兼容模式。"] };
    }
    Object.entries(probes).forEach(([name, args]) => {
      const result = detector.run(status.invocation.command, [...status.invocation.prefixArgs, ...args], 15000);
      commands[name] = {
        ok: result.ok,
        command: args.join(" "),
        stdout: result.stdout,
        stderr: result.stderr || result.error,
      };
      if (!result.ok) warnings.push(`capcut-cli 命令不可用：${args.join(" ")}`);
    });
    const ready = Object.values(commands).every((command) => command.ok);
    return {
      ...status,
      mode: status.mode === "capcut_cli" && ready ? "capcut_cli" : "compatibility_package",
      capabilities: { ready, commands },
      warnings,
    };
  }

  function execute(args, defaults = {}) {
    const status = detector.detect();
    if (!status.invocation) {
      return {
        ok: false,
        draftPath: defaults.draftPath || "",
        previewPath: defaults.previewPath || "",
        warnings: ["capcut-cli 不可用，已切换为素材包兼容模式。"],
        errors: [],
        files: defaults.files || [],
        fallback: true,
      };
    }
    const result = detector.run(status.invocation.command, [...status.invocation.prefixArgs, ...args], 120000);
    return { ...parseCapcutCliResult(result, defaults), fallback: false };
  }

  function buildTemplateDraft({ project, timeline, timelineFiles, templateName }) {
    const plan = buildCapcutCliPlan({ project, timeline, timelineFiles, templateName });
    const planPath = writeCapcutCliPlan(path.join(timelineFiles.projectDir, "capcut-plan.json"), plan);
    const spec = buildCapcutCompileSpec({ project, timeline, timelineFiles, templateName });
    const specPath = writeCapcutCliPlan(path.join(timelineFiles.projectDir, "capcut-compile-spec.json"), spec);
    const status = detectCapabilities();
    if (status.mode !== "capcut_cli") {
      return {
        ok: true,
        draftPath: "",
        previewPath: "",
        warnings: ["capcut-cli、命令能力或剪映母版未就绪，已输出兼容素材包和执行计划。", ...(status.warnings || [])],
        errors: [],
        files: [planPath, specPath, timelineFiles.timelinePath, timelineFiles.srtPath].filter(Boolean),
        fallback: true,
        planPath,
        specPath,
      };
    }

    const draftRoot = status.paths?.draftDirectory && fs.existsSync(status.paths.draftDirectory)
      ? status.paths.draftDirectory
      : timelineFiles.projectDir;
    const draftDirectory = path.join(draftRoot, safeDraftName(`codex_${project.id}_${templateName || "template"}_${Date.now()}`));
    const commonFiles = [planPath, specPath, timelineFiles.timelinePath, timelineFiles.srtPath].filter(Boolean);
    const checkResult = execute(["compile", specPath, "--check", "--drafts", draftRoot], {
      files: commonFiles,
    });
    if (!checkResult.ok) {
      return {
        ...checkResult,
        draftPath: "",
        fallback: true,
        planPath,
        specPath,
        files: commonFiles,
      };
    }
    const compileResult = execute(["compile", specPath, "--out", draftDirectory, "--drafts", draftRoot, "--force-write"], {
      draftPath: draftDirectory,
      files: [...commonFiles, draftDirectory],
    });
    const textLayoutResult = compileResult.ok ? hardenDraftTextLayout(draftDirectory) : { ok: false, warnings: [] };
    const infoResult = compileResult.ok
      ? execute(["info", draftDirectory], { draftPath: draftDirectory, files: [...commonFiles, draftDirectory] })
      : { ok: false, warnings: [], errors: [] };
    return {
      ...compileResult,
      draftPath: compileResult.ok ? compileResult.draftPath : "",
      attemptedDraftPath: draftDirectory,
      warnings: [
        ...(compileResult.warnings || []),
        ...(textLayoutResult.warnings || []),
        "已使用 --force-write 写入新剪映草稿，避免剪映专业版前台运行时阻塞自动生成。",
        ...(infoResult.ok ? ["已生成可在剪映专业版项目列表中打开的本地草稿。"] : []),
      ],
      errors: [
        ...(compileResult.errors || []),
        ...(compileResult.ok && !infoResult.ok ? (infoResult.errors || []) : []),
      ],
      files: [...new Set([
        ...(compileResult.files || []),
        ...commonFiles,
        ...(compileResult.ok ? [draftDirectory] : []),
      ].filter(Boolean))],
      fallback: !compileResult.ok,
      planPath,
      specPath,
    };
  }

  async function openJianying() {
    const status = detector.detect();
    const appPath = String(status.jianying?.appPath || "").trim();
    if (!appPath) return { ok: false, message: "未检测到剪映专业版，请先安装或在系统设置中配置程序路径。" };
    try {
      const args = String(status.jianying?.arguments || "").match(/(?:[^\s"]+|"[^"]*")+/g)?.map((value) => value.replace(/^"|"$/g, "")) || [];
      const child = spawn(appPath, args, { detached: true, stdio: "ignore", windowsHide: false });
      return await new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        child.once("error", (error) => finish({ ok: false, message: `剪映专业版启动失败：${error.message}`, appPath }));
        child.once("spawn", () => {
          child.unref();
          finish({ ok: true, launched: true, pid: child.pid || 0, message: "剪映启动请求已发送，请等待客户端窗口出现。", appPath });
        });
        setTimeout(() => finish({ ok: false, message: "剪映启动超时，请检查程序路径或在桌面手动打开。", appPath }), 5000);
      });
    } catch (error) {
      return { ok: false, message: `剪映专业版启动失败：${error instanceof Error ? error.message : String(error)}`, appPath };
    }
  }

  return {
    detect: detectCapabilities,
    detectCapabilities,
    doctor: () => execute(["doctor"]),
    version: () => execute(["--version"]),
    help: () => execute(["--help"]),
    applyTemplateHelp: () => execute(["apply-template", "--help"]),
    importSrtHelp: () => execute(["import-srt", "--help"]),
    addAudioHelp: () => execute(["add-audio", "--help"]),
    addImageHelp: () => execute(["add-image", "--help"]),
    info: (planPath) => execute(["info", "--plan", planPath]),
    lint: (planPath) => execute(["lint", "--plan", planPath]),
    importSrt: (draftPath, srtPath) => execute(["import-srt", "--draft", draftPath, "--input", srtPath]),
    addAudio: (draftPath, audioPath, placeholder = "voiceover_placeholder") => execute(["add-audio", "--draft", draftPath, "--input", audioPath, "--placeholder", placeholder]),
    addImage: (draftPath, imagePath, placeholder) => execute(["add-image", "--draft", draftPath, "--input", imagePath, "--placeholder", placeholder]),
    applyTemplate: (planPath, outputPath) => execute(["apply-template", "--plan", planPath, "--output", outputPath]),
    renderPreview: (draftPath, outputPath) => execute(["render", "preview", "--draft", draftPath, "--output", outputPath], { previewPath: outputPath }),
    buildTemplateDraft,
    openJianying,
  };
}
