import path from "node:path";
import { createCapcutCliDetector } from "./capcut-cli-detector.js";
import { buildCapcutCliPlan, writeCapcutCliPlan } from "./capcut-cli-plan-builder.js";
import { parseCapcutCliResult } from "./capcut-cli-result-parser.js";

export function createCapcutCliAdapter(options = {}) {
  const detector = options.detector || createCapcutCliDetector(options);

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
    const status = detector.detect();
    if (status.mode !== "capcut_cli") {
      return {
        ok: true,
        draftPath: "",
        previewPath: "",
        warnings: ["未检测到可执行的 capcut-cli 与剪映母版，已输出兼容素材包和执行计划。"],
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
    detect: detector.detect,
    doctor: () => execute(["doctor"]),
    version: () => execute(["--version"]),
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
