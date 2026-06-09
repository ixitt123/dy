import fs from "node:fs";
import path from "node:path";

const REQUIRED_SKILLS = [
  "director-system",
  "storyboard-generator",
  "visual-style-library",
  "scene-composer",
  "camera-language",
  "aesthetic-rules",
  "subtitle-timeline",
  "bgm-plan",
];

const REQUIRED_PROMPTS = [
  "storyboard.md",
  "scene_prompt.md",
  "video_style.md",
  "aesthetic_review.md",
  "subtitle_timeline.md",
  "bgm_plan.md",
];

const REQUIRED_SCENE_FIELDS = [
  "duration",
  "purpose",
  "emotion",
  "voice_text",
  "subtitle",
  "visual_style",
  "camera",
  "composition",
  "image_prompt",
  "motion_prompt",
  "bgm",
  "transition",
];

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`缺少 Director 文件：${path.basename(filePath)}`);
  return fs.readFileSync(filePath, "utf8");
}

function renderTemplate(template, variables = {}) {
  return String(template || "").replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    const value = variables[key];
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  });
}

function safeFileName(value) {
  return String(value || "director")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "director";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function stringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function findOption(rows, id, fallbackId) {
  const selected = rows.find((row) => row.id === id) || rows.find((row) => row.id === fallbackId) || rows[0];
  if (!selected) throw new Error("Director 配置缺少可用选项。");
  return selected;
}

function shotRange(config, shotCount) {
  return findOption(config.shot_counts, shotCount, config.defaults.shot_count);
}

function timelineFromScenes(scenes) {
  let cursor = 0;
  return scenes.map((scene) => {
    const start = Number(cursor.toFixed(2));
    cursor += scene.duration;
    return {
      start,
      end: Number(cursor.toFixed(2)),
      text: scene.subtitle,
      highlight: scene.subtitle_style.highlight_words,
    };
  });
}

function normalizeStoryboard(raw, project, config) {
  const metadata = safeJson(project.metadata_json, {});
  const platform = findOption(config.platforms, project.platform, config.defaults.platform);
  const videoType = findOption(config.video_types, project.video_type, config.defaults.video_type);
  const style = findOption(config.visual_styles, project.visual_style, config.defaults.visual_style);
  const allowedCameras = new Set(config.camera_types);
  const allowedTransitions = new Set(config.transitions);
  const allowedAssetTypes = new Set(config.asset_types);
  const sourceScenes = Array.isArray(raw?.storyboard)
    ? raw.storyboard
    : Array.isArray(raw?.scenes)
      ? raw.scenes
      : [];
  const scenes = sourceScenes.map((scene, index) => {
    const voiceText = String(scene?.voice_text || scene?.subtitle || "").trim();
    const subtitleStyle = scene?.subtitle_style && typeof scene.subtitle_style === "object"
      ? scene.subtitle_style
      : {};
    return {
      scene: index + 1,
      duration: clampNumber(scene?.duration, 0.8, 30, 3),
      purpose: String(scene?.purpose || "").trim(),
      emotion: String(scene?.emotion || "").trim(),
      voice_text: voiceText,
      subtitle: String(scene?.subtitle || voiceText).trim(),
      visual_style: style.id,
      camera: allowedCameras.has(scene?.camera) ? scene.camera : "static",
      composition: String(scene?.composition || "").trim(),
      image_prompt: String(scene?.image_prompt || "").trim(),
      motion_prompt: String(scene?.motion_prompt || "").trim(),
      subtitle_style: {
        position: String(subtitleStyle.position || "bottom"),
        font_style: String(subtitleStyle.font_style || "bold clean Chinese sans-serif"),
        highlight_words: stringArray(subtitleStyle.highlight_words),
      },
      bgm: String(scene?.bgm || "").trim(),
      sfx: String(scene?.sfx || "").trim(),
      transition: allowedTransitions.has(scene?.transition) ? scene.transition : "straight_cut",
      asset_type: allowedAssetTypes.has(scene?.asset_type) ? scene.asset_type : "ai_image",
      notes: String(scene?.notes || "").trim(),
    };
  });
  const requestedDuration = Math.max(
    scenes.length * 0.8,
    Number(metadata.tts_duration || project.estimated_duration || 60),
  );
  let totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  if (scenes.length && totalDuration > 0 && Math.abs(totalDuration - requestedDuration) / requestedDuration > 0.1) {
    const scale = requestedDuration / totalDuration;
    let assignedDuration = 0;
    scenes.forEach((scene, index) => {
      if (index === scenes.length - 1) {
        scene.duration = Number(Math.max(0.8, requestedDuration - assignedDuration).toFixed(2));
      } else {
        scene.duration = Number(Math.max(0.8, scene.duration * scale).toFixed(2));
        assignedDuration += scene.duration;
      }
    });
    totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  }
  const review = raw?.aesthetic_review && typeof raw.aesthetic_review === "object"
    ? raw.aesthetic_review
    : {};
  const storyArc = raw?.story_arc && typeof raw.story_arc === "object" ? raw.story_arc : {};
  const bgmPlan = raw?.bgm_plan && typeof raw.bgm_plan === "object" ? raw.bgm_plan : {};
  const timeline = timelineFromScenes(scenes);

  return {
    video_meta: {
      title: String(raw?.video_meta?.title || project.title || "未命名导演稿").trim(),
      platform: platform.id,
      ratio: platform.ratio,
      estimated_duration: Number((totalDuration || project.estimated_duration || 60).toFixed(2)),
      style: style.id,
      pace: project.pace,
      target_audience: String(raw?.video_meta?.target_audience || videoType.audience || "").trim(),
    },
    story_arc: {
      hook: String(storyArc.hook || "").trim(),
      conflict: String(storyArc.conflict || "").trim(),
      turning_point: String(storyArc.turning_point || "").trim(),
      solution: String(storyArc.solution || "").trim(),
      cta: String(storyArc.cta || "").trim(),
    },
    storyboard: scenes,
    subtitle_timeline: timeline,
    visual_prompts: scenes.map((scene) => ({
      scene: scene.scene,
      prompt: scene.image_prompt,
    })),
    motion_prompts: scenes.map((scene) => ({
      scene: scene.scene,
      prompt: scene.motion_prompt,
    })),
    bgm_plan: {
      mood: String(bgmPlan.mood || "").trim(),
      tempo: String(bgmPlan.tempo || "").trim(),
      volume: String(bgmPlan.volume || "").trim(),
      entry: String(bgmPlan.entry || "").trim(),
      exit: String(bgmPlan.exit || "").trim(),
    },
    aesthetic_review: {
      score: Math.round(clampNumber(review.score, 0, 100, 0)),
      problems: stringArray(review.problems),
      fixes: stringArray(review.fixes),
    },
    metadata: {
      source_type: metadata.source_type || "manual",
      source_key: metadata.source_key || "",
      tts_duration: Number(metadata.tts_duration || 0),
      reference_style: metadata.reference_style || "",
      generated_at: new Date().toISOString(),
    },
  };
}

function storyboardIssues(result, range) {
  const issues = [];
  const scenes = result.storyboard;
  if (scenes.length < range.min || scenes.length > range.max) {
    issues.push(`镜头数量为 ${scenes.length}，要求 ${range.min}-${range.max}。`);
  }
  scenes.forEach((scene) => {
    const missing = REQUIRED_SCENE_FIELDS.filter((field) => {
      if (field === "duration") return !(Number(scene.duration) > 0);
      return !String(scene[field] || "").trim();
    });
    if (missing.length) issues.push(`镜头 ${scene.scene} 缺少：${missing.join("、")}。`);
  });
  if (!result.story_arc.hook) issues.push("缺少 story_arc.hook。");
  if (!result.story_arc.cta) issues.push("缺少 story_arc.cta。");
  if (result.aesthetic_review.score < 80) issues.push(`审美评分 ${result.aesthetic_review.score}，低于 80。`);
  return issues;
}

function markdownForProject(project, result) {
  const lines = [
    `# ${result.video_meta.title}`,
    "",
    "## Video Meta",
    "",
    `- 平台：${result.video_meta.platform} ${result.video_meta.ratio}`,
    `- 视频类型：${project.video_type}`,
    `- 视觉风格：${result.video_meta.style}`,
    `- 节奏：${result.video_meta.pace}`,
    `- 预计时长：${result.video_meta.estimated_duration} 秒`,
    `- 目标受众：${result.video_meta.target_audience}`,
    "",
    "## Story Arc",
    "",
    `- Hook：${result.story_arc.hook}`,
    `- Conflict：${result.story_arc.conflict}`,
    `- Turning Point：${result.story_arc.turning_point}`,
    `- Solution：${result.story_arc.solution}`,
    `- CTA：${result.story_arc.cta}`,
    "",
    "## Shot List",
    "",
    "| 镜头 | 时长 | 目的 | 情绪 | 镜头语言 | 字幕 | 转场 |",
    "| --- | ---: | --- | --- | --- | --- | --- |",
  ];
  for (const scene of result.storyboard) {
    lines.push(`| ${scene.scene} | ${scene.duration}s | ${scene.purpose} | ${scene.emotion} | ${scene.camera} | ${scene.subtitle.replace(/\|/g, "｜")} | ${scene.transition} |`);
  }
  for (const scene of result.storyboard) {
    lines.push(
      "",
      `## Scene ${scene.scene}`,
      "",
      `- Purpose：${scene.purpose}`,
      `- Emotion：${scene.emotion}`,
      `- Voice：${scene.voice_text}`,
      `- Subtitle：${scene.subtitle}`,
      `- Camera：${scene.camera}`,
      `- Composition：${scene.composition}`,
      `- Image Prompt：${scene.image_prompt}`,
      `- Motion Prompt：${scene.motion_prompt}`,
      `- BGM：${scene.bgm}`,
      `- SFX：${scene.sfx}`,
      `- Transition：${scene.transition}`,
      `- Asset Type：${scene.asset_type}`,
      `- Notes：${scene.notes}`,
    );
  }
  lines.push(
    "",
    "## BGM Plan",
    "",
    `- Mood：${result.bgm_plan.mood}`,
    `- Tempo：${result.bgm_plan.tempo}`,
    `- Volume：${result.bgm_plan.volume}`,
    `- Entry：${result.bgm_plan.entry}`,
    `- Exit：${result.bgm_plan.exit}`,
    "",
    "## Aesthetic Review",
    "",
    `- Score：${result.aesthetic_review.score}`,
    `- Problems：${result.aesthetic_review.problems.join("；") || "无"}`,
    `- Fixes：${result.aesthetic_review.fixes.join("；") || "无"}`,
    "",
  );
  return lines.join("\n");
}

function scenePromptsMarkdown(result) {
  const lines = [`# ${result.video_meta.title} Scene Prompts`, ""];
  for (const scene of result.storyboard) {
    lines.push(
      `## Scene ${scene.scene}`,
      "",
      `- Purpose：${scene.purpose}`,
      `- Composition：${scene.composition}`,
      `- Visual Prompt：${scene.image_prompt}`,
      `- Motion Prompt：${scene.motion_prompt}`,
      `- Camera：${scene.camera}`,
      `- Duration：${scene.duration}s`,
      "",
    );
  }
  return lines.join("\n");
}

export function createDirectorService({ baseDir, taskStore, generateJson, onIdle = () => {} }) {
  const configPath = path.join(baseDir, "config", "director-system.json");
  const config = JSON.parse(readText(configPath));
  const storyboardsDir = path.join(baseDir, "storyboards");
  const scenePromptsDir = path.join(baseDir, "scene_prompts");
  const referenceStylesDir = path.join(baseDir, "reference-styles");
  const skillsDir = path.join(baseDir, "skills");
  const promptsDir = path.join(baseDir, "prompts");
  const pending = [];
  let working = false;

  for (const directory of [storyboardsDir, scenePromptsDir, referenceStylesDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  function loadAssets() {
    return {
      skills: Object.fromEntries(REQUIRED_SKILLS.map((name) => [
        name,
        readText(path.join(skillsDir, name, "SKILL.md")),
      ])),
      prompts: Object.fromEntries(REQUIRED_PROMPTS.map((name) => [
        name,
        readText(path.join(promptsDir, name)),
      ])),
    };
  }

  function publicProject(row, { includeResult = true } = {}) {
    if (!row) return null;
    const metadata = safeJson(row.metadata_json, {});
    return {
      ...row,
      metadata: {
        source_type: metadata.source_type || "",
        source_key: metadata.source_key || "",
        ratio: metadata.ratio || "",
        shot_count: metadata.shot_count || "",
        tts_duration: Number(metadata.tts_duration || 0),
        provider: metadata.provider || "",
        model: metadata.model || "",
        error: metadata.error || "",
        markdown_path: metadata.markdown_path || "",
        scene_prompts_path: metadata.scene_prompts_path || "",
        reference_style_path: metadata.reference_style_path || "",
        scene_count: Number(metadata.scene_count || 0),
      },
      scenes: taskStore.listDirectorScenes(row.id).map((scene) => ({
        ...scene,
        metadata: safeJson(scene.metadata_json, {}),
      })),
      result: includeResult ? metadata.result || null : undefined,
    };
  }

  async function processProject(projectId) {
    let project = taskStore.getDirectorProject(projectId);
    if (!project) return;
    const metadata = safeJson(project.metadata_json, {});
    const assets = loadAssets();
    const platform = findOption(config.platforms, project.platform, config.defaults.platform);
    const videoType = findOption(config.video_types, project.video_type, config.defaults.video_type);
    const range = shotRange(config, metadata.shot_count);
    project = taskStore.updateDirectorProject(project.id, {
      status: "processing",
      metadata_json: JSON.stringify({ ...metadata, error: "" }),
    });

    try {
      const prompt = renderTemplate(assets.prompts["storyboard.md"], {
        skill_director_system: assets.skills["director-system"],
        skill_storyboard_generator: assets.skills["storyboard-generator"],
        skill_visual_style_library: assets.skills["visual-style-library"],
        skill_scene_composer: assets.skills["scene-composer"],
        skill_camera_language: assets.skills["camera-language"],
        skill_aesthetic_rules: assets.skills["aesthetic-rules"],
        skill_subtitle_timeline: assets.skills["subtitle-timeline"],
        skill_bgm_plan: assets.skills["bgm-plan"],
        scene_prompt: assets.prompts["scene_prompt.md"],
        video_style_prompt: assets.prompts["video_style.md"],
        subtitle_timeline_prompt: assets.prompts["subtitle_timeline.md"],
        bgm_plan_prompt: assets.prompts["bgm_plan.md"],
        source_text: project.source_text.slice(0, 16000),
        title: project.title,
        video_type: project.video_type,
        visual_style: project.visual_style,
        platform: platform.id,
        ratio: platform.ratio,
        pace: project.pace,
        estimated_duration: project.estimated_duration,
        tts_duration: metadata.tts_duration || "未提供",
        shot_count_min: range.min,
        shot_count_max: range.max,
        target_audience: videoType.audience,
        reference_style: metadata.reference_style || "未提供",
      });
      let generated = await generateJson({
        providerId: metadata.provider || "",
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content: "你是专业短视频导演系统。严格执行注入的 Skill 与 Prompt，只返回完整 JSON，不生成图片或视频。",
          },
          { role: "user", content: prompt },
        ],
      });
      let result = normalizeStoryboard(generated.data, project, config);
      let issues = storyboardIssues(result, range);

      if (issues.length) {
        const repairPrompt = renderTemplate(assets.prompts["aesthetic_review.md"], {
          director_json: JSON.stringify(result, null, 2),
          shot_count_min: range.min,
          shot_count_max: range.max,
          visual_style: project.visual_style,
          ratio: platform.ratio,
        });
        generated = await generateJson({
          providerId: metadata.provider || generated.provider || "",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: "你是导演稿质量审查与修复器。修复所有结构和审美问题，只返回完整 JSON。",
            },
            {
              role: "user",
              content: `${repairPrompt}\n\n当前验证问题：\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
            },
          ],
        });
        result = normalizeStoryboard(generated.data, project, config);
        issues = storyboardIssues(result, range);
      }
      if (issues.length) throw new Error(`导演稿质量检查未通过：${issues.slice(0, 5).join(" ")}`);

      const baseName = `${project.id}_${safeFileName(project.title)}`;
      const jsonPath = path.join(storyboardsDir, `${baseName}_storyboard.json`);
      const markdownPath = path.join(storyboardsDir, `${baseName}_storyboard.md`);
      const scenePromptsPath = path.join(scenePromptsDir, `${baseName}_scene_prompts.md`);
      fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");
      fs.writeFileSync(markdownPath, markdownForProject(project, result), "utf8");
      fs.writeFileSync(scenePromptsPath, scenePromptsMarkdown(result), "utf8");

      let referenceStylePath = "";
      if (metadata.save_reference_style && metadata.reference_style) {
        referenceStylePath = path.join(referenceStylesDir, `${baseName}_reference.md`);
        fs.writeFileSync(referenceStylePath, [
          `# ${project.title} 参考风格`,
          "",
          metadata.reference_style,
          "",
        ].join("\n"), "utf8");
      }

      taskStore.replaceDirectorScenes(project.id, result.storyboard.map((scene) => ({
        scene_index: scene.scene,
        duration: scene.duration,
        purpose: scene.purpose,
        emotion: scene.emotion,
        voice_text: scene.voice_text,
        subtitle: scene.subtitle,
        visual_style: scene.visual_style,
        camera: scene.camera,
        composition: scene.composition,
        image_prompt: scene.image_prompt,
        motion_prompt: scene.motion_prompt,
        bgm: scene.bgm,
        sfx: scene.sfx,
        transition: scene.transition,
        asset_type: scene.asset_type,
        metadata_json: JSON.stringify({
          subtitle_style: scene.subtitle_style,
          notes: scene.notes,
        }),
      })));
      taskStore.updateDirectorProject(project.id, {
        storyboard_path: jsonPath,
        status: "completed",
        score: result.aesthetic_review.score,
        estimated_duration: result.video_meta.estimated_duration,
        metadata_json: JSON.stringify({
          ...metadata,
          provider: generated.provider || metadata.provider || "",
          model: generated.model || "",
          ratio: platform.ratio,
          markdown_path: markdownPath,
          scene_prompts_path: scenePromptsPath,
          reference_style_path: referenceStylePath,
          scene_count: result.storyboard.length,
          total_duration: result.video_meta.estimated_duration,
          result,
          error: "",
        }),
      });
    } catch (error) {
      const latest = taskStore.getDirectorProject(project.id);
      const latestMetadata = safeJson(latest?.metadata_json, metadata);
      taskStore.updateDirectorProject(project.id, {
        status: "failed",
        metadata_json: JSON.stringify({
          ...latestMetadata,
          error: error instanceof Error ? error.message : String(error),
        }),
      });
    }
  }

  async function drain() {
    if (working) return;
    working = true;
    try {
      while (pending.length) {
        await processProject(pending.shift());
      }
    } finally {
      working = false;
      onIdle();
    }
  }

  function enqueue(input = {}) {
    const sourceText = String(input.source_text || "").trim();
    if (!sourceText) return { error: "请先选择或输入导演文案。" };
    const videoType = findOption(config.video_types, input.video_type, config.defaults.video_type);
    const style = findOption(config.visual_styles, input.visual_style, config.defaults.visual_style);
    const platform = findOption(config.platforms, input.platform, config.defaults.platform);
    const pace = findOption(config.paces, input.pace, config.defaults.pace);
    const range = shotRange(config, input.shot_count);
    const ttsDuration = clampNumber(input.tts_duration, 0, 7200, 0);
    const estimatedDuration = ttsDuration || clampNumber(
      input.estimated_duration,
      10,
      7200,
      config.defaults.estimated_duration,
    );
    const title = String(input.title || sourceText.slice(0, 24) || "未命名导演稿").trim().slice(0, 100);
    const project = taskStore.createDirectorProject({
      task_id: Number(input.task_id || 0),
      rewrite_id: Number(input.rewrite_id || 0),
      title,
      source_text: sourceText,
      video_type: videoType.id,
      visual_style: style.id,
      platform: platform.id,
      pace: pace.id,
      estimated_duration: estimatedDuration,
      status: "waiting",
      metadata_json: JSON.stringify({
        provider: String(input.provider || ""),
        source_type: String(input.source_type || "manual"),
        source_key: String(input.source_key || ""),
        reference_style: String(input.reference_style || "").trim(),
        save_reference_style: input.save_reference_style !== false,
        shot_count: range.id,
        shot_count_min: range.min,
        shot_count_max: range.max,
        ratio: platform.ratio,
        target_audience: videoType.audience,
        tts_duration: ttsDuration,
        error: "",
      }),
    });
    pending.push(project.id);
    drain().catch(() => {});
    return { project: publicProject(project) };
  }

  function getProject(id) {
    return publicProject(taskStore.getDirectorProject(id));
  }

  function listProjects(limit = 50) {
    return taskStore.listDirectorProjects({ limit }).map((project) => publicProject(project, { includeResult: false }));
  }

  function resolveExportPath(id, format) {
    const project = taskStore.getDirectorProject(id);
    if (!project || project.status !== "completed") return "";
    const metadata = safeJson(project.metadata_json, {});
    const requested = {
      json: project.storyboard_path,
      md: metadata.markdown_path,
      prompts: metadata.scene_prompts_path,
    }[format];
    if (!requested || !fs.existsSync(requested)) return "";
    const resolved = path.resolve(requested);
    const roots = [storyboardsDir, scenePromptsDir].map((directory) => path.resolve(directory));
    return roots.some((root) => resolved.startsWith(`${root}${path.sep}`)) ? resolved : "";
  }

  for (const project of taskStore.listDirectorProjects({ limit: 500 }).reverse()) {
    if (!["waiting", "processing"].includes(project.status)) continue;
    taskStore.updateDirectorProject(project.id, { status: "waiting" });
    pending.push(project.id);
  }
  if (pending.length) setTimeout(() => drain().catch(() => {}), 0);

  return {
    config,
    enqueue,
    getProject,
    listProjects,
    resolveExportPath,
    isBusy: () => working || pending.length > 0,
    outputDirs: {
      storyboardsDir,
      scenePromptsDir,
      referenceStylesDir,
    },
  };
}
