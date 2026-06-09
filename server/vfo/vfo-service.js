import fs from "node:fs";
import path from "node:path";

const REQUIRED_SKILLS = [
  "asset-planning",
  "material-classifier",
  "platform-strategy",
  "aesthetic-review",
  "render-readiness",
  "vfo",
  "workflow-router",
  "asset-selector",
  "render-strategy",
  "qa-review",
];

const REQUIRED_PROMPTS = [
  "asset_planning.md",
  "material_strategy.md",
  "platform_strategy.md",
  "workflow_router.md",
  "render_strategy.md",
  "qa_review.md",
];

function safeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`缺少 VFO 文件：${path.basename(filePath)}`);
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
  return String(value || "vfo")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "vfo";
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

function findPlatform(config, id) {
  const normalized = config.director_platform_aliases?.[id] || id || config.defaults.platform;
  return config.platforms.find((item) => item.id === normalized)
    || config.platforms.find((item) => item.id === config.defaults.platform)
    || config.platforms[0];
}

function storyboardScenes(storyboard) {
  if (Array.isArray(storyboard?.storyboard)) return storyboard.storyboard;
  if (Array.isArray(storyboard?.scenes)) return storyboard.scenes;
  return [];
}

function sceneByIndex(rows, sceneIndex) {
  return rows.find((item, index) => Number(item?.scene || item?.scene_index || index + 1) === sceneIndex) || {};
}

function normalizePlatformFit(value, selectedPlatform) {
  const source = value && typeof value === "object" ? value : {};
  const score = (key, fallback) => Math.round(clampNumber(
    source[key] ?? source[key.replace("-", "_")],
    0,
    100,
    fallback,
  ));
  return {
    douyin: score("douyin", selectedPlatform === "douyin" ? 90 : 75),
    video_account: score("video_account", selectedPlatform === "video-account" ? 90 : 75),
    xiaohongshu: score("xiaohongshu", selectedPlatform === "xiaohongshu" ? 90 : 72),
    bilibili: score("bilibili", selectedPlatform === "bilibili" ? 90 : 70),
  };
}

function normalizeAssetResult(raw, storyboard, platform, config) {
  const sourceRows = Array.isArray(raw?.asset_package)
    ? raw.asset_package
    : Array.isArray(raw?.assets)
      ? raw.assets
      : [];
  const allowedTypes = new Set(config.asset_types);
  const scenes = storyboardScenes(storyboard).map((scene, index) => {
    const sceneIndex = index + 1;
    const planned = sceneByIndex(sourceRows, sceneIndex);
    const requestedType = String(planned.asset_type || scene.asset_type || "").trim();
    const assetType = allowedTypes.has(requestedType) ? requestedType : "mixed";
    const reason = String(planned.reason || "").trim()
      || `该素材用于直接承接镜头目的“${String(scene.purpose || "传达当前信息").trim()}”。`;
    const generationMethod = String(
      planned.generation_method
      || planned.acquisition_method
      || planned.prepare_method
      || "",
    ).trim() || "先准备素材规格与来源要求，暂不调用任何 Provider。";
    const readinessScore = Math.round(clampNumber(planned.readiness_score, 0, 100, 80));
    return {
      scene: sceneIndex,
      purpose: String(planned.purpose || scene.purpose || "").trim(),
      asset_type: assetType,
      asset_subtype: String(planned.asset_subtype || "").trim(),
      reason,
      generation_method: generationMethod,
      image_prompt: String(planned.image_prompt || scene.image_prompt || "").trim(),
      negative_prompt: String(planned.negative_prompt || "").trim(),
      motion_prompt: String(planned.motion_prompt || scene.motion_prompt || "").trim(),
      platform_fit: normalizePlatformFit(planned.platform_fit, platform.id),
      aesthetic_score: Math.round(clampNumber(planned.aesthetic_score, 0, 100, 85)),
      readiness_score: readinessScore,
      render_ready: planned.render_ready === undefined ? readinessScore >= 80 : Boolean(planned.render_ready),
      risks: stringArray(planned.risks),
      source_scene: {
        duration: Number(scene.duration || 0),
        voice_text: String(scene.voice_text || "").trim(),
        subtitle: String(scene.subtitle || "").trim(),
        camera: String(scene.camera || "").trim(),
        composition: String(scene.composition || "").trim(),
        transition: String(scene.transition || "").trim(),
      },
    };
  });
  const review = raw?.asset_review && typeof raw.asset_review === "object" ? raw.asset_review : {};
  const readiness = raw?.render_readiness && typeof raw.render_readiness === "object"
    ? raw.render_readiness
    : {};
  const averageReadiness = scenes.length
    ? scenes.reduce((sum, scene) => sum + scene.readiness_score, 0) / scenes.length
    : 0;
  const blockers = stringArray(readiness.blockers);
  return {
    project_meta: {
      title: String(storyboard?.video_meta?.title || "未命名素材规划").trim(),
      platform: platform.id,
      platform_label: platform.label,
      ratio: platform.ratio,
      scene_count: scenes.length,
      generated_at: new Date().toISOString(),
      media_generated: false,
    },
    asset_package: scenes,
    asset_review: {
      score: Math.round(clampNumber(review.score, 0, 100, averageReadiness || 0)),
      material_suitability: Math.round(clampNumber(review.material_suitability, 0, 100, averageReadiness || 0)),
      shot_suitability: Math.round(clampNumber(review.shot_suitability, 0, 100, averageReadiness || 0)),
      communication_efficiency: Math.round(clampNumber(review.communication_efficiency, 0, 100, averageReadiness || 0)),
      aesthetic_risk: Math.round(clampNumber(review.aesthetic_risk, 0, 100, 20)),
      ai_flavor_risk: Math.round(clampNumber(review.ai_flavor_risk, 0, 100, 20)),
      problems: stringArray(review.problems),
      fixes: stringArray(review.fixes),
    },
    render_readiness: {
      score: Math.round(clampNumber(readiness.score, 0, 100, averageReadiness || 0)),
      ready: readiness.ready === undefined
        ? blockers.length === 0 && averageReadiness >= config.defaults.quality_threshold
        : Boolean(readiness.ready),
      blockers,
      warnings: stringArray(readiness.warnings),
      checks: stringArray(readiness.checks),
    },
  };
}

function normalizeGenerationStrategy(value, asset) {
  const source = value && typeof value === "object" ? value : {};
  return {
    method: String(source.method || asset.generation_method || "").trim(),
    prerequisites: stringArray(source.prerequisites),
    steps: stringArray(source.steps),
    fallback: String(source.fallback || "素材不可用时回到同类证据素材，不直接替换成无关 AI 图片。").trim(),
    blockers: stringArray(source.blockers),
    provider: "",
  };
}

function normalizeSceneRenderStrategy(value, scene, platform) {
  const source = value && typeof value === "object" ? value : {};
  const subtitle = source.subtitle && typeof source.subtitle === "object" ? source.subtitle : {};
  return {
    ratio: platform.ratio,
    resolution: platform.resolution,
    fps: platform.fps,
    duration: Number(clampNumber(source.duration, 0.8, 60, Number(scene.duration || 3)).toFixed(2)),
    composition: String(source.composition || scene.composition || "").trim(),
    crop: String(source.crop || `按 ${platform.ratio} 保留主体和字幕安全区`).trim(),
    motion: String(source.motion || scene.motion_prompt || "保持克制运动，服务信息表达").trim(),
    subtitle: {
      position: String(subtitle.position || "bottom").trim(),
      size: String(subtitle.size || platform.subtitle_size).trim(),
      density: String(subtitle.density || platform.information_density).trim(),
      highlight_words: stringArray(subtitle.highlight_words),
    },
    transition: String(source.transition || scene.transition || "straight_cut").trim(),
    transition_duration: Number(clampNumber(source.transition_duration, 0, 2, 0.15).toFixed(2)),
    audio: String(source.audio || "人声优先，BGM 不遮挡口播").trim(),
    fallback: String(source.fallback || "素材不足时缩短镜头并使用信息型替代方案").trim(),
  };
}

function normalizeVfoResult(raw, storyboard, assetResult, platform, config) {
  const sourceRows = Array.isArray(raw?.scenes)
    ? raw.scenes
    : Array.isArray(raw?.render_plan?.scenes)
      ? raw.render_plan.scenes
      : [];
  const sourceStoryboard = storyboardScenes(storyboard);
  const scenes = assetResult.asset_package.map((asset, index) => {
    const sceneIndex = index + 1;
    const planned = sceneByIndex(sourceRows, sceneIndex);
    const sourceScene = sourceStoryboard[index] || {};
    const qaSource = planned.qa && typeof planned.qa === "object" ? planned.qa : {};
    const generationStrategy = normalizeGenerationStrategy(
      planned.generation_strategy || planned.workflow,
      asset,
    );
    const renderStrategy = normalizeSceneRenderStrategy(
      planned.render_strategy,
      sourceScene,
      platform,
    );
    const qaChecks = stringArray(planned.qa_checks || qaSource.checks);
    if (!qaChecks.length) {
      qaChecks.push(
        "素材必须直接服务当前镜头目的",
        "字幕在目标平台安全区内清晰可读",
        "不得出现无关 AI 图库感素材",
      );
    }
    const blockers = stringArray(qaSource.blockers || planned.blockers);
    const score = Math.round(clampNumber(
      planned.readiness_score ?? qaSource.score,
      0,
      100,
      asset.readiness_score,
    ));
    return {
      scene: sceneIndex,
      purpose: asset.purpose,
      asset_type: asset.asset_type,
      asset_subtype: asset.asset_subtype,
      reason: asset.reason,
      generation_strategy: generationStrategy,
      render_strategy: renderStrategy,
      qa: {
        score,
        ready: qaSource.ready === undefined
          ? blockers.length === 0 && score >= config.defaults.quality_threshold
          : Boolean(qaSource.ready),
        checks: qaChecks,
        blockers,
        warnings: stringArray(qaSource.warnings),
      },
      platform_fit: asset.platform_fit,
    };
  });
  const review = raw?.qa_review && typeof raw.qa_review === "object"
    ? raw.qa_review
    : raw?.render_plan?.qa_review && typeof raw.render_plan.qa_review === "object"
      ? raw.render_plan.qa_review
      : {};
  const average = scenes.length
    ? scenes.reduce((sum, scene) => sum + scene.qa.score, 0) / scenes.length
    : 0;
  const blockers = [
    ...stringArray(review.blockers),
    ...scenes.flatMap((scene) => scene.qa.blockers.map((item) => `Scene ${scene.scene}: ${item}`)),
  ];
  const overallScore = Math.round(clampNumber(review.score, 0, 100, average));
  return {
    render_plan: {
      project: {
        title: assetResult.project_meta.title,
        platform: platform.id,
        platform_label: platform.label,
        ratio: platform.ratio,
        resolution: platform.resolution,
        fps: platform.fps,
        scene_count: scenes.length,
        status: "ready_for_provider",
        media_generated: false,
        generated_at: new Date().toISOString(),
      },
      workflow: [
        "storyboard_validated",
        "asset_planning_completed",
        "workflow_routed",
        "render_strategy_ready",
        "qa_review_completed",
        "ready_for_provider",
      ],
      platform_strategy: {
        information_density: platform.information_density,
        subtitle_size: platform.subtitle_size,
        shot_duration: platform.shot_duration,
        hook_window: platform.hook_window,
      },
      scenes,
      asset_review: assetResult.asset_review,
      render_readiness: assetResult.render_readiness,
      qa_review: {
        score: overallScore,
        communication_efficiency: Math.round(clampNumber(review.communication_efficiency, 0, 100, overallScore)),
        aesthetics: Math.round(clampNumber(review.aesthetics, 0, 100, overallScore)),
        information_density: Math.round(clampNumber(review.information_density, 0, 100, overallScore)),
        platform_fit: Math.round(clampNumber(review.platform_fit, 0, 100, overallScore)),
        ai_flavor_risk: Math.round(clampNumber(review.ai_flavor_risk, 0, 100, assetResult.asset_review.ai_flavor_risk)),
        blockers,
        problems: stringArray(review.problems),
        fixes: stringArray(review.fixes),
        ready: blockers.length === 0 && overallScore >= config.defaults.quality_threshold,
      },
    },
  };
}

function assetIssues(result, sceneCount, config) {
  const issues = [];
  if (result.asset_package.length !== sceneCount) {
    issues.push(`素材镜头数量 ${result.asset_package.length} 与 Storyboard ${sceneCount} 不一致。`);
  }
  for (const scene of result.asset_package) {
    if (!config.asset_types.includes(scene.asset_type)) issues.push(`Scene ${scene.scene} 素材类型无效。`);
    if (!scene.reason) issues.push(`Scene ${scene.scene} 缺少素材选择原因。`);
    if (!scene.generation_method) issues.push(`Scene ${scene.scene} 缺少准备方式。`);
  }
  return issues;
}

function vfoIssues(result, sceneCount) {
  const issues = [];
  const scenes = result.render_plan.scenes;
  if (scenes.length !== sceneCount) issues.push(`渲染镜头数量 ${scenes.length} 与 Storyboard ${sceneCount} 不一致。`);
  for (const scene of scenes) {
    if (!scene.asset_type) issues.push(`Scene ${scene.scene} 缺少素材类型。`);
    if (!scene.generation_strategy.method) issues.push(`Scene ${scene.scene} 缺少生成策略。`);
    if (!scene.render_strategy.ratio) issues.push(`Scene ${scene.scene} 缺少渲染比例。`);
    if (!scene.qa.checks.length) issues.push(`Scene ${scene.scene} 缺少 QA 检查项。`);
  }
  return issues;
}

export function createVfoService({
  baseDir,
  taskStore,
  directorService,
  generateJson,
  onIdle = () => {},
}) {
  const config = JSON.parse(readText(path.join(baseDir, "config", "vfo.json")));
  const skillsDir = path.join(baseDir, "skills");
  const promptsDir = path.join(baseDir, "prompts");
  const assetPlansDir = path.join(baseDir, "asset-plans");
  const assetPackagesDir = path.join(baseDir, "asset-packages");
  const vfoDir = path.join(baseDir, "vfo");
  const pending = [];
  let working = false;

  for (const directory of [assetPlansDir, assetPackagesDir, vfoDir]) {
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

  function publicAssetProject(row, { includeResult = true } = {}) {
    if (!row) return null;
    const metadata = safeJson(row.metadata_json, {});
    return {
      ...row,
      metadata: {
        provider: metadata.provider || "",
        model: metadata.model || "",
        error: metadata.error || "",
        scene_count: Number(metadata.scene_count || 0),
        readiness_score: Number(metadata.readiness_score || 0),
        render_ready: Boolean(metadata.render_ready),
      },
      scenes: taskStore.listAssetScenes(row.id).map((scene) => ({
        ...scene,
        platform_fit: safeJson(scene.platform_fit_json, {}),
        metadata: safeJson(scene.metadata_json, {}),
      })),
      reviews: taskStore.listAssetReviews(row.id).map((review) => ({
        ...review,
        problems: safeJson(review.problems_json, []),
        fixes: safeJson(review.fixes_json, []),
        metadata: safeJson(review.metadata_json, {}),
      })),
      result: includeResult ? metadata.result || null : undefined,
    };
  }

  function publicVfoProject(row, { includeResult = true } = {}) {
    if (!row) return null;
    const metadata = safeJson(row.metadata_json, {});
    const review = taskStore.getVfoReview(row.id);
    return {
      ...row,
      metadata: {
        provider: metadata.provider || "",
        model: metadata.model || "",
        error: metadata.error || "",
        scene_count: Number(metadata.scene_count || 0),
        ratio: metadata.ratio || "",
        ready: Boolean(metadata.ready),
      },
      scenes: taskStore.listVfoScenes(row.id).map((scene) => ({
        ...scene,
        qa_checks: safeJson(scene.qa_checks_json, []),
        platform_fit: safeJson(scene.platform_fit_json, {}),
        metadata: safeJson(scene.metadata_json, {}),
      })),
      review: review ? {
        ...review,
        problems: safeJson(review.problems_json, []),
        fixes: safeJson(review.fixes_json, []),
        metadata: safeJson(review.metadata_json, {}),
      } : null,
      asset_project: publicAssetProject(taskStore.getAssetProject(row.asset_project_id), { includeResult }),
      result: includeResult ? metadata.result || null : undefined,
    };
  }

  function sourceFromInput(input) {
    const directorProjectId = Number(input.director_project_id || 0);
    if (directorProjectId) {
      const directorProject = directorService.getProject(directorProjectId);
      if (!directorProject || directorProject.status !== "completed" || !directorProject.result) {
        throw new Error("请选择一份已完成的 Director Storyboard。");
      }
      return {
        directorProjectId,
        title: directorProject.title,
        platform: input.platform || directorProject.result.video_meta?.platform || directorProject.platform,
        storyboardPath: directorProject.storyboard_path || "",
        storyboard: directorProject.result,
      };
    }
    const storyboard = safeJson(input.storyboard_json, null);
    if (!storyboard || !storyboardScenes(storyboard).length) {
      throw new Error("请粘贴有效的 Storyboard JSON，或选择已完成的 Director 项目。");
    }
    return {
      directorProjectId: 0,
      title: String(input.title || storyboard.video_meta?.title || "手动 Storyboard").trim(),
      platform: input.platform || storyboard.video_meta?.platform || config.defaults.platform,
      storyboardPath: "",
      storyboard,
    };
  }

  async function processProject(vfoProjectId) {
    let vfoProject = taskStore.getVfoProject(vfoProjectId);
    if (!vfoProject) return;
    let assetProject = taskStore.getAssetProject(vfoProject.asset_project_id);
    const vfoMetadata = safeJson(vfoProject.metadata_json, {});
    const assetMetadata = safeJson(assetProject?.metadata_json, {});
    const storyboard = vfoMetadata.storyboard || assetMetadata.storyboard;
    const platform = findPlatform(config, vfoProject.platform);
    const assets = loadAssets();

    vfoProject = taskStore.updateVfoProject(vfoProject.id, {
      status: "processing",
      metadata_json: JSON.stringify({ ...vfoMetadata, error: "" }),
    });
    assetProject = taskStore.updateAssetProject(assetProject.id, {
      status: "processing",
      metadata_json: JSON.stringify({ ...assetMetadata, error: "" }),
    });

    try {
      const assetPrompt = renderTemplate(assets.prompts["asset_planning.md"], {
        skill_asset_planning: assets.skills["asset-planning"],
        skill_material_classifier: assets.skills["material-classifier"],
        skill_platform_strategy: assets.skills["platform-strategy"],
        skill_aesthetic_review: assets.skills["aesthetic-review"],
        skill_render_readiness: assets.skills["render-readiness"],
        material_strategy_prompt: assets.prompts["material_strategy.md"],
        platform_strategy_prompt: assets.prompts["platform_strategy.md"],
        title: vfoProject.title,
        platform: platform.id,
        platform_spec: platform,
        storyboard_json: JSON.stringify(storyboard, null, 2),
      });
      const generatedAsset = await generateJson({
        providerId: vfoMetadata.provider || "",
        temperature: 0.25,
        requestName: "APS 素材规划",
        messages: [
          {
            role: "system",
            content: "你是 Asset Planning System。只规划素材，不生成图片或视频，只返回完整 JSON。",
          },
          { role: "user", content: assetPrompt },
        ],
      });
      const assetResult = normalizeAssetResult(generatedAsset.data, storyboard, platform, config);
      const assetValidation = assetIssues(assetResult, storyboardScenes(storyboard).length, config);
      if (assetValidation.length) throw new Error(`APS 检查未通过：${assetValidation.slice(0, 5).join(" ")}`);

      const assetBaseName = `${assetProject.id}_${safeFileName(vfoProject.title)}`;
      const assetPlanPath = path.join(assetPlansDir, `${assetBaseName}_asset_plan.json`);
      const packagePath = path.join(assetPackagesDir, `${assetBaseName}_asset_package.json`);
      fs.writeFileSync(assetPlanPath, JSON.stringify(assetResult, null, 2), "utf8");
      fs.writeFileSync(packagePath, JSON.stringify(assetResult.asset_package, null, 2), "utf8");

      taskStore.replaceAssetScenes(assetProject.id, assetResult.asset_package.map((scene) => ({
        scene_index: scene.scene,
        purpose: scene.purpose,
        asset_type: scene.asset_type,
        asset_subtype: scene.asset_subtype,
        reason: scene.reason,
        generation_method: scene.generation_method,
        image_prompt: scene.image_prompt,
        negative_prompt: scene.negative_prompt,
        motion_prompt: scene.motion_prompt,
        platform_fit_json: JSON.stringify(scene.platform_fit),
        aesthetic_score: scene.aesthetic_score,
        readiness_score: scene.readiness_score,
        render_ready: scene.render_ready,
        metadata_json: JSON.stringify({
          risks: scene.risks,
          source_scene: scene.source_scene,
        }),
      })));
      taskStore.saveAssetReview({
        project_id: assetProject.id,
        review_type: "asset_review",
        score: assetResult.asset_review.score,
        material_score: assetResult.asset_review.material_suitability,
        shot_score: assetResult.asset_review.shot_suitability,
        communication_score: assetResult.asset_review.communication_efficiency,
        aesthetic_risk_score: assetResult.asset_review.aesthetic_risk,
        ai_risk_score: assetResult.asset_review.ai_flavor_risk,
        problems_json: JSON.stringify(assetResult.asset_review.problems),
        fixes_json: JSON.stringify(assetResult.asset_review.fixes),
      });
      taskStore.saveAssetReview({
        project_id: assetProject.id,
        review_type: "render_readiness",
        score: assetResult.render_readiness.score,
        material_score: assetResult.asset_review.material_suitability,
        shot_score: assetResult.asset_review.shot_suitability,
        communication_score: assetResult.asset_review.communication_efficiency,
        aesthetic_risk_score: assetResult.asset_review.aesthetic_risk,
        ai_risk_score: assetResult.asset_review.ai_flavor_risk,
        problems_json: JSON.stringify(assetResult.render_readiness.blockers),
        fixes_json: JSON.stringify(assetResult.render_readiness.warnings),
        metadata_json: JSON.stringify({
          ready: assetResult.render_readiness.ready,
          checks: assetResult.render_readiness.checks,
        }),
      });
      taskStore.updateAssetProject(assetProject.id, {
        asset_plan_path: assetPlanPath,
        package_path: packagePath,
        status: "completed",
        score: assetResult.asset_review.score,
        metadata_json: JSON.stringify({
          ...assetMetadata,
          provider: generatedAsset.provider || vfoMetadata.provider || "",
          model: generatedAsset.model || "",
          scene_count: assetResult.asset_package.length,
          readiness_score: assetResult.render_readiness.score,
          render_ready: assetResult.render_readiness.ready,
          result: assetResult,
          error: "",
        }),
      });

      const vfoPrompt = [
        assets.skills.vfo,
        renderTemplate(assets.prompts["workflow_router.md"], {
          skill_workflow_router: assets.skills["workflow-router"],
          skill_asset_selector: assets.skills["asset-selector"],
        }),
        renderTemplate(assets.prompts["render_strategy.md"], {
          skill_render_strategy: assets.skills["render-strategy"],
          platform_spec: platform,
        }),
        renderTemplate(assets.prompts["qa_review.md"], {
          skill_qa_review: assets.skills["qa-review"],
          quality_threshold: config.defaults.quality_threshold,
          ai_flavor_limit: config.defaults.ai_flavor_limit,
        }),
        "## Storyboard",
        JSON.stringify(storyboard, null, 2),
        "## Asset Package",
        JSON.stringify(assetResult, null, 2),
        "只返回 JSON。第一阶段不得生成图片、视频或 Provider 调用。",
      ].join("\n\n");
      const generatedVfo = await generateJson({
        providerId: vfoMetadata.provider || generatedAsset.provider || "",
        temperature: 0.2,
        requestName: "VFO 调度规划",
        messages: [
          {
            role: "system",
            content: "你是 Video Factory Orchestrator。只做决策、调度、渲染规划和 QA，只返回完整 JSON。",
          },
          { role: "user", content: vfoPrompt },
        ],
      });
      const vfoResult = normalizeVfoResult(generatedVfo.data, storyboard, assetResult, platform, config);
      const vfoValidation = vfoIssues(vfoResult, storyboardScenes(storyboard).length);
      if (vfoValidation.length) throw new Error(`VFO 检查未通过：${vfoValidation.slice(0, 5).join(" ")}`);

      const renderPlanPath = path.join(vfoDir, `${vfoProject.id}_${safeFileName(vfoProject.title)}_render_plan.json`);
      fs.writeFileSync(renderPlanPath, JSON.stringify(vfoResult, null, 2), "utf8");
      taskStore.replaceVfoScenes(vfoProject.id, vfoResult.render_plan.scenes.map((scene) => ({
        scene_index: scene.scene,
        asset_type: scene.asset_type,
        generation_strategy: JSON.stringify(scene.generation_strategy),
        render_strategy: JSON.stringify(scene.render_strategy),
        qa_checks_json: JSON.stringify(scene.qa.checks),
        platform_fit_json: JSON.stringify(scene.platform_fit),
        readiness_score: scene.qa.score,
        metadata_json: JSON.stringify({
          purpose: scene.purpose,
          asset_subtype: scene.asset_subtype,
          reason: scene.reason,
          qa: scene.qa,
        }),
      })));
      taskStore.saveVfoReview({
        project_id: vfoProject.id,
        score: vfoResult.render_plan.qa_review.score,
        communication_score: vfoResult.render_plan.qa_review.communication_efficiency,
        aesthetic_score: vfoResult.render_plan.qa_review.aesthetics,
        information_density_score: vfoResult.render_plan.qa_review.information_density,
        platform_fit_score: vfoResult.render_plan.qa_review.platform_fit,
        ai_flavor_score: vfoResult.render_plan.qa_review.ai_flavor_risk,
        problems_json: JSON.stringify(vfoResult.render_plan.qa_review.problems),
        fixes_json: JSON.stringify(vfoResult.render_plan.qa_review.fixes),
        metadata_json: JSON.stringify({
          blockers: vfoResult.render_plan.qa_review.blockers,
          ready: vfoResult.render_plan.qa_review.ready,
        }),
      });
      taskStore.updateVfoProject(vfoProject.id, {
        render_plan_path: renderPlanPath,
        status: "completed",
        score: vfoResult.render_plan.qa_review.score,
        metadata_json: JSON.stringify({
          ...vfoMetadata,
          provider: generatedVfo.provider || generatedAsset.provider || vfoMetadata.provider || "",
          model: generatedVfo.model || generatedAsset.model || "",
          scene_count: vfoResult.render_plan.scenes.length,
          ratio: platform.ratio,
          ready: vfoResult.render_plan.qa_review.ready,
          result: vfoResult,
          error: "",
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latestAsset = taskStore.getAssetProject(assetProject.id);
      const latestAssetMetadata = safeJson(latestAsset?.metadata_json, assetMetadata);
      if (latestAsset?.status !== "completed") {
        taskStore.updateAssetProject(assetProject.id, {
          status: "failed",
          metadata_json: JSON.stringify({ ...latestAssetMetadata, error: message }),
        });
      }
      const latestVfo = taskStore.getVfoProject(vfoProject.id);
      const latestVfoMetadata = safeJson(latestVfo?.metadata_json, vfoMetadata);
      taskStore.updateVfoProject(vfoProject.id, {
        status: "failed",
        metadata_json: JSON.stringify({ ...latestVfoMetadata, error: message }),
      });
    }
  }

  async function drain() {
    if (working) return;
    working = true;
    try {
      while (pending.length) await processProject(pending.shift());
    } finally {
      working = false;
      onIdle();
    }
  }

  function enqueue(input = {}) {
    let source;
    try {
      source = sourceFromInput(input);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    const platform = findPlatform(config, input.platform || source.platform);
    const provider = String(input.provider || "");
    const sharedMetadata = {
      provider,
      storyboard: source.storyboard,
      source_type: source.directorProjectId ? "director" : "manual",
      error: "",
    };
    const assetProject = taskStore.createAssetProject({
      director_project_id: source.directorProjectId,
      title: source.title,
      platform: platform.id,
      storyboard_path: source.storyboardPath,
      status: "waiting",
      metadata_json: JSON.stringify(sharedMetadata),
    });
    const vfoProject = taskStore.createVfoProject({
      director_project_id: source.directorProjectId,
      asset_project_id: assetProject.id,
      title: source.title,
      platform: platform.id,
      storyboard_path: source.storyboardPath,
      status: "waiting",
      metadata_json: JSON.stringify(sharedMetadata),
    });
    taskStore.updateAssetProject(assetProject.id, { vfo_project_id: vfoProject.id });
    pending.push(vfoProject.id);
    drain().catch(() => {});
    return { project: publicVfoProject(vfoProject) };
  }

  function getProject(id) {
    return publicVfoProject(taskStore.getVfoProject(id));
  }

  function listProjects(limit = 50) {
    return taskStore.listVfoProjects({ limit }).map((project) => publicVfoProject(project, { includeResult: false }));
  }

  function listDirectorSources(limit = 100) {
    return directorService.listProjects(limit)
      .filter((project) => project.status === "completed")
      .map((project) => ({
        id: project.id,
        title: project.title,
        platform: project.platform,
        scene_count: Number(project.metadata?.scene_count || 0),
        score: Number(project.score || 0),
        updated_at: project.updated_at,
      }));
  }

  function resolveExportPath(id, type) {
    const project = taskStore.getVfoProject(id);
    if (!project) return "";
    const assetProject = taskStore.getAssetProject(project.asset_project_id);
    const requested = {
      "render-plan": project.render_plan_path,
      "asset-plan": assetProject?.asset_plan_path,
      "asset-package": assetProject?.package_path,
    }[type];
    if (!requested || !fs.existsSync(requested)) return "";
    const resolved = path.resolve(requested);
    const roots = [assetPlansDir, assetPackagesDir, vfoDir].map((directory) => path.resolve(directory));
    return roots.some((root) => resolved.startsWith(`${root}${path.sep}`)) ? resolved : "";
  }

  for (const project of taskStore.listVfoProjects({ limit: 500 }).reverse()) {
    if (!["waiting", "processing"].includes(project.status)) continue;
    taskStore.updateVfoProject(project.id, { status: "waiting" });
    const assetProject = taskStore.getAssetProject(project.asset_project_id);
    if (assetProject && assetProject.status !== "completed") {
      taskStore.updateAssetProject(assetProject.id, { status: "waiting" });
    }
    pending.push(project.id);
  }
  if (pending.length) setTimeout(() => drain().catch(() => {}), 0);

  return {
    config,
    enqueue,
    getProject,
    listProjects,
    listDirectorSources,
    resolveExportPath,
    isBusy: () => working || pending.length > 0,
    outputDirs: {
      assetPlansDir,
      assetPackagesDir,
      vfoDir,
    },
  };
}
