import path from "node:path";
import { createCapcutCliDetector } from "./capcut-cli-detector.js";
import { buildCapcutCliPlan, writeCapcutCliPlan } from "./capcut-cli-plan-builder.js";
import { parseCapcutCliResult } from "./capcut-cli-result-parser.js";

export function createCapcutCliAdapter(options = {}) {
  const detector = options.detector || createCapcutCliDetector(options);

  function detectCapabilities() {
    const status = detector.detect();
    const probes = {
      doctor: ["doctor"],
      version: ["--version"],
      help: ["--help"],
      applyTemplate: ["apply-template", "--help"],
      importSrt: ["import-srt", "--help"],
      addAudio: ["add-audio", "--help"],
      addImage: ["add-image", "--help"],
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
    const status = detectCapabilities();
    if (status.mode !== "capcut_cli") {
      return {
        ok: true,
        draftPath: "",
        previewPath: "",
        warnings: ["capcut-cli、命令能力或剪映母版未就绪，已输出兼容素材包和执行计划。", ...(status.warnings || [])],
        errors: [],
        files: [planPath, timelineFiles.timelinePath, timelineFiles.srtPath].filter(Boolean),
        fallback: true,
        planPath,
      };
    }

    const draftDirectory = path.join(timelineFiles.projectDir, "jianying-template-draft");
    const steps = [
      ["info", "--plan", planPath],
      ["lint", "--plan", planPath],
      ["apply-template", "--plan", planPath, "--output", draftDirectory],
    ];
    let lastResult = { ok: true, warnings: [], errors: [], files: [planPath] };
    for (const args of steps) {
      lastResult = execute(args, { draftPath: draftDirectory, files: [planPath, draftDirectory] });
      if (!lastResult.ok) break;
    }
    return { ...lastResult, planPath };
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
  };
}
