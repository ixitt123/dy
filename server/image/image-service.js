import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createImageProvider } from "./providers/index.js";
import { callProviderGenerate } from "./provider-adapter.js";

const DEFAULT_IMAGE_PROVIDER = "volcengine_ark";
const DEFAULT_IMAGE_MODEL = "doubao-seedream-5-0-lite-260128";
const FALLBACK_IMAGE_QUALITY_RULES = `One vertical 9:16 cinematic frame for a short-video storyboard.
Default visual direction: warm 3D animated film, original Chinese characters, expressive natural faces, soft cinematic lighting, coherent set design.
Keep the same character design, age, outfit family, color palette, lens language and lighting across every scene in the same project.
Use clear foreground, midground and background depth. The main subject must be readable on a phone screen.
Keep faces, hands, products and important objects fully visible with normal edge-safe margins.
Do not reserve a blank subtitle band; the image should remain visually complete and balanced.
The image should look like a real frame from one commercial short film, not a poster, PPT slide, collage, random stock image or app screenshot.
Negative lock: no readable text, no Chinese characters in the picture, no QR code, no logo, no watermark, no subtitles baked into the image, no UI screenshot, no poster layout, no messy background, no distorted face, no extra fingers, no broken hands, no duplicated people, no style drift, no low-resolution artifacts, no overexposed plastic look.`;
const FALLBACK_STORYBOARD_STYLE_TEMPLATE = `统一项目：{{title}}
统一风格：{{visual_style}}，商业短视频质感，真实摄影感，电影级布光，干净高级，不廉价，不像PPT。
统一画幅：{{aspectRatio}}，平台：{{platform}}，所有分镜保持同一色调、同一镜头语言、同一人物/场景风格。
统一色彩：深色高级背景，克制的金色或电光蓝点缀，高对比但不过曝，画面有层次和空间感。
统一构图：主体明确，前景/中景/背景有纵深，主体和关键信息完整可见；画面保持饱满和平衡，只保留正常安全边距。
统一质感：高端商业广告、知识口播视觉包装、高清、锐利、无廉价海报感、无普通插画感。
禁止：可读文字、乱码文字、水印、奇怪logo、低清、脏乱背景、随机人物变脸、颜色漂移、过度卡通、塑料感。`;

function renderStyleTemplate(template, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value ?? "")),
    template,
  );
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeFolderName(value, fallback = "image-job") {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  return cleaned || fallback;
}

function imageJobFolderName({ jobId = "", prompt = "", sourceType = "", sourceId = "", folderName = "" } = {}) {
  if (folderName) return safeFolderName(folderName, `image-${String(jobId).slice(0, 8)}`);
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const sourceLabel = String(sourceType || "") === "director" && String(sourceId || "").includes(":")
    ? `导演项目-${String(sourceId).split(":")[0]}-镜头-${String(sourceId).split(":")[1]}`
    : String(sourceType || "") === "storyboard" && sourceId
      ? `导演项目-${sourceId}-整套分镜图`
      : "图片生成";
  const promptLabel = safeFolderName(String(prompt || "").replace(/\n+/g, " ").slice(0, 18), "未命名");
  return safeFolderName(`${date}-${sourceLabel}-${promptLabel}-${String(jobId).slice(0, 6)}`);
}

export function targetImageSize(aspectRatio = "1:1") {
  return {
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
    "1:1": { width: 1080, height: 1080 },
    "3:4": { width: 1080, height: 1440 },
    "4:3": { width: 1440, height: 1080 },
  }[String(aspectRatio || "1:1")] || { width: 1080, height: 1080 };
}

export function coverScaleCropFilter(aspectRatio = "1:1") {
  const target = targetImageSize(aspectRatio);
  return `scale=${target.width}:${target.height}:force_original_aspect_ratio=increase,crop=${target.width}:${target.height},setsar=1`;
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(command)} exited with ${code}`));
    });
  });
}

function normalizeVolcengineArkModel(model) {
  const value = String(model || "").trim();
  const lower = value.toLowerCase().replace(/_/g, "-");
  if (!lower || ["doubao-seedream-5.0-lite", "doubao-seedream-5-0-lite", "doubao-seedream-5.0-lite-260128", DEFAULT_IMAGE_MODEL].includes(lower)) {
    return DEFAULT_IMAGE_MODEL;
  }
  if (["doubao-seedream-5.0", "doubao-seedream-5-0", "doubao-seedream-5.0-260128", "doubao-seedream-5-0-260128"].includes(lower)) {
    return "doubao-seedream-5-0-260128";
  }
  return value;
}

export function parseSceneIndexFromFilename(value = "") {
  const name = path.basename(String(value || ""), path.extname(String(value || ""))).trim();
  const patterns = [
    /^0*(\d{1,3})(?:[._\-\s]|$)/,
    /(?:^|[._\-\s#])0*(\d{1,3})(?:[._\-\s]|$)/,
    /(?:scene|shot|jing|fenjing|s|img|image)[._\-\s#]*0*(\d{1,3})(?:[._\-\s]|$)/i,
    /(?:场景|镜头|分镜|第)[._\-\s#]*0*(\d{1,3})(?:[._\-\s号张]|$)/,
    /^(?:scene|shot|镜头|分镜|第)?[_\-\s]*(\d{1,3})(?:[_\-\s]|$)/i,
    /(?:scene|shot|镜头|分镜|第)[_\-\s]*(\d{1,3})/i,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    const number = Number(match?.[1] || 0);
    if (number > 0) return number;
  }
  return 0;
}

function sceneIndexFromSourceId(value = "") {
  const match = String(value || "").match(/:(\d{1,3})$/);
  return match ? Number(match[1] || 0) : 0;
}

export function createImageService({ baseDir, getSettings, taskStore = null, ffmpegPath = "" }) {
  const outputDir = path.join(baseDir, "image-assets", "generated");
  const thumbnailDir = path.join(baseDir, "image-assets", "thumbnails");
  const dbPath = path.join(baseDir, ".data", "image-studio.sqlite");
  const styleTemplatePath = path.join(baseDir, "prompts", "storyboard-image", "default-commercial.md");
  const qualityRulesPath = path.join(baseDir, "prompts", "storyboard-image", "quality-rules.md");
  let storyboardStyleTemplate = FALLBACK_STORYBOARD_STYLE_TEMPLATE;
  let storyboardQualityRules = FALLBACK_IMAGE_QUALITY_RULES;
  try {
    storyboardStyleTemplate = fs.readFileSync(styleTemplatePath, "utf8").trim() || FALLBACK_STORYBOARD_STYLE_TEMPLATE;
  } catch {
    storyboardStyleTemplate = FALLBACK_STORYBOARD_STYLE_TEMPLATE;
  }
  try {
    storyboardQualityRules = fs.readFileSync(qualityRulesPath, "utf8").trim() || FALLBACK_IMAGE_QUALITY_RULES;
  } catch {
    storyboardQualityRules = FALLBACK_IMAGE_QUALITY_RULES;
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(thumbnailDir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS image_jobs (
      id TEXT PRIMARY KEY,
      source_type TEXT DEFAULT 'manual',
      source_id TEXT DEFAULT '',
      provider TEXT DEFAULT 'jimeng',
      prompt TEXT,
      aspect_ratio TEXT DEFAULT '1:1',
      count_requested INTEGER DEFAULT 1,
      status TEXT DEFAULT '等待',
      progress INTEGER DEFAULT 0,
      image_paths_json TEXT DEFAULT '[]',
      folder_name TEXT DEFAULT '',
      folder_path TEXT DEFAULT '',
      error TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS image_assets (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      filename TEXT,
      original_path TEXT,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      file_size INTEGER DEFAULT 0,
      provider TEXT,
      model TEXT DEFAULT '',
      prompt TEXT,
      revised_prompt TEXT,
      aspect_ratio TEXT,
      file_path TEXT DEFAULT '',
      folder_name TEXT DEFAULT '',
      folder_path TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      source_type TEXT DEFAULT 'manual',
      source_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  const assetColumns = new Set(db.prepare("PRAGMA table_info(image_assets)").all().map((column) => column.name));
  if (!assetColumns.has("model")) db.exec("ALTER TABLE image_assets ADD COLUMN model TEXT DEFAULT ''");
  if (!assetColumns.has("file_path")) db.exec("ALTER TABLE image_assets ADD COLUMN file_path TEXT DEFAULT ''");
  if (!assetColumns.has("source_url")) db.exec("ALTER TABLE image_assets ADD COLUMN source_url TEXT DEFAULT ''");
  if (!assetColumns.has("folder_name")) db.exec("ALTER TABLE image_assets ADD COLUMN folder_name TEXT DEFAULT ''");
  if (!assetColumns.has("folder_path")) db.exec("ALTER TABLE image_assets ADD COLUMN folder_path TEXT DEFAULT ''");
  if (!assetColumns.has("scene_index")) db.exec("ALTER TABLE image_assets ADD COLUMN scene_index INTEGER DEFAULT 0");
  if (!assetColumns.has("asset_order")) db.exec("ALTER TABLE image_assets ADD COLUMN asset_order INTEGER DEFAULT 0");
  const jobColumns = new Set(db.prepare("PRAGMA table_info(image_jobs)").all().map((column) => column.name));
  if (!jobColumns.has("model")) db.exec("ALTER TABLE image_jobs ADD COLUMN model TEXT DEFAULT ''");
  if (!jobColumns.has("folder_name")) db.exec("ALTER TABLE image_jobs ADD COLUMN folder_name TEXT DEFAULT ''");
  if (!jobColumns.has("folder_path")) db.exec("ALTER TABLE image_jobs ADD COLUMN folder_path TEXT DEFAULT ''");

  function imageProviderFromSettings(settings, explicitProvider = "") {
    const mapped = settings.modelMap?.image || settings.modelMapping?.image || {};
    const provider = String(explicitProvider || mapped.provider || DEFAULT_IMAGE_PROVIDER).trim() || DEFAULT_IMAGE_PROVIDER;
    const rawModel = mapped.model || settings.imageProviders?.[provider]?.model || DEFAULT_IMAGE_MODEL;
    const model = provider === "volcengine_ark" ? normalizeVolcengineArkModel(rawModel) : String(rawModel || "").trim();
    return { provider, model };
  }

  async function downloadImage(result, outputPath) {
    if (result.imageUrl) {
      let response;
      try {
        response = await fetch(result.imageUrl);
      } catch (error) {
        throw new Error(`图片下载失败：${error instanceof Error ? error.message : String(error)}`);
      }
      if (!response.ok) throw new Error(`图片下载失败（${response.status}）`);
      const buf = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(outputPath, buf);
      return outputPath;
    }
    if (result.imageBase64) {
      fs.writeFileSync(outputPath, Buffer.from(result.imageBase64, "base64"));
      return outputPath;
    }
    throw new Error("图片下载失败：Provider 未返回图片 URL 或 Base64。");
  }

  async function normalizeImageTo1080(filePath, aspectRatio = "1:1") {
    const target = targetImageSize(aspectRatio);
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      throw new Error("本地 FFmpeg 不可用，无法把图片压到 1080 规格。");
    }
    const tempPath = filePath.replace(/(\.[^.]+)?$/, `_1080_tmp.png`);
    await runProcess(ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-vf",
      coverScaleCropFilter(aspectRatio),
      "-frames:v",
      "1",
      tempPath,
    ]);
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tempPath, filePath);
    return target;
  }

  async function thumbnailForImage(filePath, { width = 360 } = {}) {
    const resolved = path.resolve(String(filePath || "").trim());
    if (!resolved || !fs.existsSync(resolved)) throw new Error("图片文件不存在。");
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) return resolved;
    const ext = path.extname(resolved).toLowerCase() || ".png";
    const safeName = Buffer.from(resolved).toString("hex").slice(0, 48);
    const thumbPath = path.join(thumbnailDir, `${safeName}_${width}.jpg`);
    if (fs.existsSync(thumbPath)) return thumbPath;
    await runProcess(ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      resolved,
      "-vf",
      `scale=${Math.max(120, Math.min(720, Number(width) || 360))}:-2`,
      "-frames:v",
      "1",
      "-q:v",
      "4",
      thumbPath,
    ]).catch(() => {
      if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp") return resolved;
      throw new Error("缩略图生成失败。");
    });
    return fs.existsSync(thumbPath) ? thumbPath : resolved;
  }

  function publicAsset(row) {
    if (!row) return row;
    return {
      ...row,
      file_path: row.file_path || row.original_path || "",
      folder_name: row.folder_name || path.basename(path.dirname(row.file_path || row.original_path || "")) || "",
      folder_path: row.folder_path || path.dirname(row.file_path || row.original_path || ""),
      ratio: row.aspect_ratio || "",
      scene_index: Number(row.scene_index || 0),
      asset_order: Number(row.asset_order || 0),
      thumbnail_url: `/api/image/thumbnail?path=${encodeURIComponent(row.file_path || row.original_path || "")}`,
    };
  }

  async function addLocalImageAsset({ filePath, prompt = "", aspectRatio = "9:16", sourceId = "", sourceType = "local", directorProjectId = 0, sceneIndex = 0, assetOrder = 0 } = {}) {
    const resolved = path.resolve(String(filePath || "").trim());
    if (!resolved || !fs.existsSync(resolved)) throw new Error("请选择存在的本地图片文件。");
    const ext = path.extname(resolved).toLowerCase();
    const supported = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
    if (!supported.has(ext)) throw new Error("暂只支持 PNG、JPG、WEBP、GIF 图片素材。");

    const assetId = randomUUID();
    const cleanSourceType = String(sourceType || "local").trim() || "local";
    const assetPrompt = String(prompt || "").trim() || `本地图片素材：${path.basename(resolved)}`;
    const parsedSceneIndex = Number(sceneIndex || parseSceneIndexFromFilename(resolved) || sceneIndexFromSourceId(sourceId) || 0);
    const cleanSourceId = String(sourceId || (directorProjectId && parsedSceneIndex ? `${directorProjectId}:${parsedSceneIndex}` : "")).trim();
    const cleanAssetOrder = Number(assetOrder || parsedSceneIndex || 0);
    const folderName = imageJobFolderName({
      jobId: assetId,
      prompt: assetPrompt,
      sourceType: cleanSourceType,
      sourceId: cleanSourceId,
      folderName: "",
    });
    const folderPath = path.join(outputDir, folderName);
    fs.mkdirSync(folderPath, { recursive: true });
    const filename = `local_${Date.now()}_${assetId.slice(0, 8)}${ext}`;
    const outputPath = path.join(folderPath, filename);
    fs.copyFileSync(resolved, outputPath);
    const size = await normalizeImageTo1080(outputPath, aspectRatio);
    const stats = fs.statSync(outputPath);

    db.prepare(`
      INSERT INTO image_assets (
        id, job_id, filename, original_path, file_path, width, height, file_size, provider, model,
        prompt, revised_prompt, aspect_ratio, source_url, source_type, source_id, folder_name, folder_path, scene_index, asset_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      "",
      filename,
      outputPath,
      outputPath,
      size.width,
      size.height,
      stats.size,
      "local",
      "local-file",
      assetPrompt,
      assetPrompt,
      aspectRatio,
      resolved,
      cleanSourceType,
      cleanSourceId,
      folderName,
      folderPath,
      parsedSceneIndex,
      cleanAssetOrder,
    );

    return publicAsset(db.prepare("SELECT * FROM image_assets WHERE id=?").get(assetId));
  }

  function directorProjectForImages(projectId) {
    if (!taskStore) throw new Error("图片中心尚未接入导演项目库。");
    const project = taskStore.getDirectorProject(Number(projectId || 0));
    if (!project || project.status !== "completed") throw new Error("请先选择已完成的 AI 导演项目。");
    const scenes = taskStore.listDirectorScenes(project.id);
    if (!scenes.length) throw new Error("导演项目没有可用分镜。");
    return { project, scenes };
  }

  function styleLockForProject(project, aspectRatio = "9:16") {
    const title = String(project?.title || "短视频分镜").trim();
    const style = String(project?.visual_style || "高级商业短视频").trim();
    const platform = String(project?.platform || "douyin").trim();
    return renderStyleTemplate(storyboardStyleTemplate, {
      title,
      visual_style: style,
      platform,
      aspectRatio,
    });
  }

  function projectContinuityLock(project = {}) {
    const title = String(project?.title || "").trim();
    const style = String(project?.visual_style || "").trim();
    return [
      "连续性锁定：同一项目所有图片必须像同一部短片的连续镜头。",
      "角色锁定：人物年龄、脸型、发型、服装风格、比例和表情语言保持一致，不要每张图换一批人。",
      "空间锁定：场景道具、光线方向、色调和镜头焦段保持一致，只按本镜头任务改变动作和构图。",
      "短视频可用性：主体必须大、清楚、手机小屏可读，画面不要做成海报、PPT、截图或拼贴。",
      title ? `项目主题：${title}` : "",
      style ? `项目视觉风格：${style}` : "",
    ].filter(Boolean).join("\n");
  }

  function negativePromptLock() {
    return [
      "负面约束：不要生成任何可读文字、汉字、英文单词、字幕、二维码、logo、水印、海报标题、UI界面。",
      "不要畸形脸、歪眼、坏手、多手指、多余人物、重复人物、塑料皮肤、低清噪点、过曝、脏乱背景。",
      "不要为了字幕预留大面积空白；保持画面完整、主体清晰和正常安全边距。",
    ].join("\n");
  }

  function buildStoryboardImagePrompt({ project, scene, index = 0, total = 1, aspectRatio = "9:16" }) {
    const title = String(project?.title || "短视频分镜").trim();
    const sceneIndex = Number(scene?.scene_index || scene?.scene || index + 1);
    const basePrompt = String(scene?.image_prompt || scene?.purpose || scene?.subtitle || scene?.voice_text || "").trim();
    const subtitle = String(scene?.subtitle || scene?.voice_text || "").trim();
    const purpose = String(scene?.purpose || "").trim();
    const emotion = String(scene?.emotion || "").trim();
    const camera = String(scene?.camera || "").trim();
    const composition = String(scene?.composition || "").trim();
    return [
      styleLockForProject(project, aspectRatio),
      projectContinuityLock(project),
      storyboardQualityRules,
      `分镜编号：${sceneIndex}/${total}`,
      `本镜头任务：${purpose || "承接上一镜头，推动叙事和情绪"}`,
      `情绪：${emotion || "专业、有冲击力、可信"}`,
      `镜头语言：${camera || "中近景，轻微推进，电影感纵深"}；构图：${composition || "主体完整可见，画面饱满，保留正常安全边距"}`,
      `画面主体：${basePrompt}`,
      `口播语义参考：${subtitle.slice(0, 80)}`,
      "生成要求：一张可直接用于竖屏短视频成片的电影分镜图，画面真实可用、风格统一、没有文字、没有二维码、没有水印。",
      negativePromptLock(),
    ].filter(Boolean).join("\n");
  }

  function storyboardImagePrompts({ projectId, aspectRatio = "9:16" } = {}) {
    const { project, scenes } = directorProjectForImages(projectId);
    return scenes.map((scene, index) => ({
      projectId: project.id,
      scene: scene.scene_index || index + 1,
      title: `Scene ${scene.scene_index || index + 1}`,
      prompt: buildStoryboardImagePrompt({
        project,
        scene,
        index,
        total: scenes.length,
        aspectRatio,
      }),
      subtitle: scene.subtitle || scene.voice_text || "",
      aspectRatio,
    }));
  }

  function publicJob(row) {
    if (!row) return null;
    return {
      ...row,
      image_paths: safeJsonArray(row.image_paths_json),
    };
  }

  function updateImageJobProgress(jobId, { progress = 0, paths = [], error = "" } = {}) {
    db.prepare(`
      UPDATE image_jobs SET progress=?, image_paths_json=?, error=?, updated_at=datetime('now','localtime') WHERE id=?
    `).run(Math.max(0, Math.min(100, Math.round(Number(progress || 0)))), JSON.stringify(paths), String(error || "").slice(0, 4000), jobId);
  }

  async function generateImage({
    prompt,
    aspectRatio = "1:1",
    count = 1,
    sourceType = "manual",
    sourceId = "",
    provider = "",
    jobId: requestedJobId = "",
    folderName: requestedFolderName = "",
    folderPath: requestedFolderPath = "",
  } = {}) {
    const cleanPrompt = String(prompt || "").trim();
    if (!cleanPrompt) throw new Error("请先输入图片描述。");
    const settings = getSettings();
    const providers = settings.imageProviders || {};
    const selected = imageProviderFromSettings(settings, provider);

    const jobId = requestedJobId || randomUUID();
    const results = [];
    const sceneIndex = sceneIndexFromSourceId(sourceId);
    const folderName = imageJobFolderName({ jobId, prompt: cleanPrompt, sourceType, sourceId, folderName: requestedFolderName });
    const folderPath = String(requestedFolderPath || "").trim() || path.join(outputDir, folderName);
    fs.mkdirSync(folderPath, { recursive: true });

    const providerInstance = createImageProvider(selected.provider, { config: providers });
    if (!providerInstance) throw new Error("未知图片 Provider。");
    db.prepare(`
      INSERT INTO image_jobs (id, source_type, source_id, provider, model, prompt, aspect_ratio, count_requested, status, folder_name, folder_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(jobId, sourceType, sourceId, selected.provider, selected.model, cleanPrompt, aspectRatio, count, "生成中", folderName, folderPath);

    const validation = await providerInstance.validateConfig();
    if (!validation.valid) {
      const message = `${validation.error || "图片生成 API 未配置"} 请到系统设置 > API 服务中心 > 图片生成保存 API Key。`;
      db.prepare(`
        UPDATE image_jobs SET status='失败', progress=100, error=?, updated_at=datetime('now','localtime'), completed_at=datetime('now','localtime') WHERE id=?
      `).run(message, jobId);
      throw new Error(message);
    }

    for (let i = 0; i < count; i++) {
      const filename = `img_${jobId.slice(0, 6)}_${i}_${Date.now()}.png`;
      const outputPath = path.join(folderPath, filename);

      try {
        const result = await callProviderGenerate(providerInstance, { prompt: cleanPrompt, aspectRatio, outputPath });

        if (!result.success) {
          results.push({ index: i, success: false, error: result.error, duration: result.duration || 0 });
          continue;
        }

        const localPath = await downloadImage(result, outputPath);

        const size = await normalizeImageTo1080(localPath, aspectRatio);
        const stats = fs.statSync(localPath);
        const assetId = randomUUID();

        db.prepare(`
          INSERT INTO image_assets (
            id, job_id, filename, original_path, file_path, width, height, file_size, provider, model,
            prompt, revised_prompt, aspect_ratio, source_url, source_type, source_id, folder_name, folder_path, scene_index, asset_order
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          assetId,
          jobId,
          filename,
          localPath,
          localPath,
          size.width,
          size.height,
          stats.size,
          selected.provider,
          result.model || selected.model,
          cleanPrompt,
          result.revisedPrompt || cleanPrompt,
          aspectRatio,
          result.sourceUrl || result.imageUrl || "",
          sourceType,
          sourceId,
          folderName,
          folderPath,
          sceneIndex,
          sceneIndex || i + 1,
        );

        results.push({
          index: i,
          success: true,
          assetId,
          filename,
          imagePath: localPath,
          file_path: localPath,
          thumbnailUrl: `/api/image/thumbnail?path=${encodeURIComponent(localPath)}`,
          provider: selected.provider,
          model: result.model || selected.model,
          source_url: result.sourceUrl || result.imageUrl || "",
          folderName,
          folderPath,
          folder_name: folderName,
          folder_path: folderPath,
          sceneIndex,
          assetOrder: sceneIndex || i + 1,
        });
      } catch (err) {
        results.push({ index: i, success: false, error: err.message });
      }
      updateImageJobProgress(jobId, {
        progress: Math.round(((i + 1) / count) * 95),
        paths: results.filter(r => r.success).map(r => r.imagePath),
        error: results.filter((item) => !item.success && item.error).map((item) => item.error).join("\n"),
      });
    }

    const successCount = results.filter(r => r.success).length;
    const imagePaths = results.filter(r => r.success).map(r => r.imagePath);
    const failureMessage = results
      .filter((item) => !item.success && item.error)
      .map((item) => item.error)
      .join("\n")
      .slice(0, 4000);

    db.prepare(`
      UPDATE image_jobs SET status=?, progress=100, image_paths_json=?, error=?, duration_ms=?,
      updated_at=datetime('now','localtime'), completed_at=datetime('now','localtime') WHERE id=?
    `).run(successCount === count ? "完成" : successCount > 0 ? "部分完成" : "失败",
      JSON.stringify(imagePaths), failureMessage, results.reduce((s, r) => s + (r.duration || 0), 0), jobId);

    return { jobId, results, total: count, success: successCount, failed: count - successCount };
  }

  function generateImageAsync(input = {}) {
    const jobId = randomUUID();
    generateImage({ ...input, jobId }).catch(() => {});
    return { jobId };
  }

  async function generateStoryboardImages({ projectId, aspectRatio = "9:16", provider = "", countPerScene = 1 } = {}) {
    const prompts = storyboardImagePrompts({ projectId, aspectRatio });
    const perScene = Math.max(1, Math.min(4, Number(countPerScene) || 1));
    const folderName = imageJobFolderName({
      jobId: `storyboard-${projectId}-${Date.now()}`,
      prompt: `Director #${Number(projectId || 0)} 整套分镜图`,
      sourceType: "storyboard",
      sourceId: String(projectId || ""),
    });
    const folderPath = path.join(outputDir, folderName);
    fs.mkdirSync(folderPath, { recursive: true });
    const results = [];
    for (const item of prompts) {
      try {
        const generated = await generateImage({
          provider,
          prompt: item.prompt,
          aspectRatio: item.aspectRatio,
          count: perScene,
          sourceType: "director",
          sourceId: `${item.projectId}:${item.scene}`,
          folderName,
          folderPath,
        });
        for (const result of generated.results || []) {
          results.push({
            ...result,
            scene: item.scene,
            prompt: item.prompt,
            subtitle: item.subtitle,
            jobId: generated.jobId,
          });
        }
      } catch (error) {
        results.push({
          success: false,
          scene: item.scene,
          prompt: item.prompt,
          subtitle: item.subtitle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const success = results.filter((item) => item.success).length;
    return {
      projectId: Number(projectId || 0),
      totalScenes: prompts.length,
      total: prompts.length * perScene,
      success,
      failed: results.length - success,
      results,
      prompts,
      folderName,
      folderPath,
    };
  }

  function generateStoryboardImagesAsync({ projectId, aspectRatio = "9:16", provider = "", countPerScene = 1 } = {}) {
    const prompts = storyboardImagePrompts({ projectId, aspectRatio });
    const perScene = Math.max(1, Math.min(4, Number(countPerScene) || 1));
    const jobId = randomUUID();
    const total = prompts.length * perScene;
    const selected = imageProviderFromSettings(getSettings(), provider);
    const folderName = imageJobFolderName({
      jobId,
      prompt: `Director #${Number(projectId || 0)} 整套分镜图`,
      sourceType: "storyboard",
      sourceId: String(projectId || ""),
    });
    const folderPath = path.join(outputDir, folderName);
    fs.mkdirSync(folderPath, { recursive: true });
    db.prepare(`
      INSERT INTO image_jobs (id, source_type, source_id, provider, model, prompt, aspect_ratio, count_requested, status, progress, folder_name, folder_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(jobId, "storyboard", String(projectId || ""), selected.provider, selected.model, `Director #${Number(projectId || 0)} 整套分镜图`, aspectRatio, total, "生成中", 3, folderName, folderPath);
    (async () => {
      const results = [];
      try {
        for (const [index, item] of prompts.entries()) {
          try {
            const generated = await generateImage({
              provider,
              prompt: item.prompt,
              aspectRatio: item.aspectRatio,
              count: perScene,
              sourceType: "director",
              sourceId: `${item.projectId}:${item.scene}`,
              folderName,
              folderPath,
            });
            for (const result of generated.results || []) {
              results.push({ ...result, scene: item.scene, prompt: item.prompt, subtitle: item.subtitle, jobId: generated.jobId });
            }
          } catch (error) {
            results.push({ success: false, scene: item.scene, prompt: item.prompt, subtitle: item.subtitle, error: error instanceof Error ? error.message : String(error) });
          }
          updateImageJobProgress(jobId, {
            progress: Math.round(((index + 1) / Math.max(1, prompts.length)) * 95),
            paths: results.filter((row) => row.success).map((row) => row.imagePath),
            error: results.filter((row) => !row.success && row.error).map((row) => row.error).join("\n"),
          });
        }
        const success = results.filter((item) => item.success).length;
        const imagePaths = results.filter((item) => item.success).map((item) => item.imagePath);
        const failureMessage = results.filter((item) => !item.success && item.error).map((item) => item.error).join("\n").slice(0, 4000);
        db.prepare(`
          UPDATE image_jobs SET status=?, progress=100, image_paths_json=?, error=?, updated_at=datetime('now','localtime'), completed_at=datetime('now','localtime') WHERE id=?
        `).run(success === total ? "完成" : success > 0 ? "部分完成" : "失败", JSON.stringify(imagePaths), failureMessage, jobId);
      } catch (error) {
        db.prepare(`
          UPDATE image_jobs SET status='失败', progress=100, error=?, updated_at=datetime('now','localtime'), completed_at=datetime('now','localtime') WHERE id=?
        `).run(error instanceof Error ? error.message : String(error), jobId);
      }
    })();
    return { jobId, total, totalScenes: prompts.length, folderName, folderPath };
  }

  async function testProviderConnection(provider = "") {
    const settings = getSettings();
    const selected = imageProviderFromSettings(settings, provider);
    const instance = createImageProvider(selected.provider, { config: settings.imageProviders || {} });
    if (!instance) return { ok: false, status: "failed", message: "未知图片 Provider。" };
    if (typeof instance.testConnection === "function") {
      const result = await instance.testConnection();
      return {
        ok: Boolean(result.valid),
        status: result.valid ? "success" : "failed",
        message: result.message || result.error || (result.valid ? "测试成功。" : "测试失败。"),
      };
    }
    const validation = await instance.validateConfig();
    return {
      ok: Boolean(validation.valid),
      status: validation.valid ? "success" : "failed",
      message: validation.valid ? "配置已保存。" : validation.error || "配置不可用。",
    };
  }

  function getJobs({ limit = 50, offset = 0 } = {}) {
    return db.prepare("SELECT * FROM image_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset).map(publicJob);
  }

  function getJob(id) {
    return publicJob(db.prepare("SELECT * FROM image_jobs WHERE id=?").get(String(id || "")));
  }

  function getAssets({ limit = 50, offset = 0 } = {}) {
    return db.prepare("SELECT * FROM image_assets ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset).map(publicAsset);
  }

  function deleteAsset(assetId) {
    const asset = db.prepare("SELECT original_path FROM image_assets WHERE id=?").get(assetId);
    if (asset?.original_path && fs.existsSync(asset.original_path)) fs.unlinkSync(asset.original_path);
    db.prepare("DELETE FROM image_assets WHERE id=?").run(assetId);
    return { success: true };
  }

  function getStats() {
    return {
      jobs: db.prepare("SELECT COUNT(*) as c FROM image_jobs").get().c,
      assets: db.prepare("SELECT COUNT(*) as c FROM image_assets").get().c,
    };
  }

  function isBusy() {
    const row = db.prepare("SELECT COUNT(*) AS count FROM image_jobs WHERE completed_at IS NULL AND progress < 100").get();
    return Number(row?.count || 0) > 0;
  }

  return {
    generateImage,
    generateImageAsync,
    generateStoryboardImages,
    generateStoryboardImagesAsync,
    storyboardImagePrompts,
    addLocalImageAsset,
    thumbnailForImage,
    testProviderConnection,
    getJobs,
    getJob,
    getAssets,
    deleteAsset,
    getStats,
    isBusy,
  };
}
