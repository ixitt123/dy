import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createImageProvider } from "./providers/index.js";
import { callProviderGenerate } from "./provider-adapter.js";

const DEFAULT_IMAGE_PROVIDER = "volcengine_ark";
const DEFAULT_IMAGE_MODEL = "doubao-seedream-5-0-lite-260128";
const FALLBACK_STORYBOARD_STYLE_TEMPLATE = `统一项目：{{title}}
统一风格：{{visual_style}}，商业短视频质感，真实摄影感，电影级布光，干净高级，不廉价，不像PPT。
统一画幅：{{aspectRatio}}，平台：{{platform}}，所有分镜保持同一色调、同一镜头语言、同一人物/场景风格。
统一色彩：深色高级背景，克制的金色或电光蓝点缀，高对比但不过曝，画面有层次和空间感。
统一构图：主体明确，前景/中景/背景有纵深，保留字幕安全区，适合竖屏短视频发布。
统一质感：高端商业广告、知识口播视觉包装、高清、锐利、无廉价海报感、无普通插画感。
禁止：乱码文字、水印、奇怪logo、低清、脏乱背景、随机人物变脸、颜色漂移、过度卡通、塑料感。`;

function renderStyleTemplate(template, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value ?? "")),
    template,
  );
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

export function createImageService({ baseDir, getSettings, taskStore = null }) {
  const outputDir = path.join(baseDir, "image-assets", "generated");
  const dbPath = path.join(baseDir, ".data", "image-studio.sqlite");
  const styleTemplatePath = path.join(baseDir, "prompts", "storyboard-image", "default-commercial.md");
  let storyboardStyleTemplate = FALLBACK_STORYBOARD_STYLE_TEMPLATE;
  try {
    storyboardStyleTemplate = fs.readFileSync(styleTemplatePath, "utf8").trim() || FALLBACK_STORYBOARD_STYLE_TEMPLATE;
  } catch {
    storyboardStyleTemplate = FALLBACK_STORYBOARD_STYLE_TEMPLATE;
  }
  fs.mkdirSync(outputDir, { recursive: true });

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
  const jobColumns = new Set(db.prepare("PRAGMA table_info(image_jobs)").all().map((column) => column.name));
  if (!jobColumns.has("model")) db.exec("ALTER TABLE image_jobs ADD COLUMN model TEXT DEFAULT ''");

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

  function publicAsset(row) {
    if (!row) return row;
    return {
      ...row,
      file_path: row.file_path || row.original_path || "",
      ratio: row.aspect_ratio || "",
    };
  }

  function addLocalImageAsset({ filePath, prompt = "", aspectRatio = "9:16", sourceId = "" } = {}) {
    const resolved = path.resolve(String(filePath || "").trim());
    if (!resolved || !fs.existsSync(resolved)) throw new Error("请选择存在的本地图片文件。");
    const ext = path.extname(resolved).toLowerCase();
    const supported = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
    if (!supported.has(ext)) throw new Error("暂只支持 PNG、JPG、WEBP、GIF 图片素材。");

    const assetId = randomUUID();
    const filename = `local_${Date.now()}_${assetId.slice(0, 8)}${ext}`;
    const outputPath = path.join(outputDir, filename);
    fs.copyFileSync(resolved, outputPath);
    const stats = fs.statSync(outputPath);
    const assetPrompt = String(prompt || "").trim() || `本地图片素材：${path.basename(resolved)}`;

    db.prepare(`
      INSERT INTO image_assets (
        id, job_id, filename, original_path, file_path, file_size, provider, model,
        prompt, revised_prompt, aspect_ratio, source_url, source_type, source_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      "",
      filename,
      outputPath,
      outputPath,
      stats.size,
      "local",
      "local-file",
      assetPrompt,
      assetPrompt,
      aspectRatio,
      resolved,
      "local",
      sourceId,
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
      `分镜编号：${sceneIndex}/${total}`,
      `本镜头任务：${purpose || "承接上一镜头，推动叙事"}`,
      `情绪：${emotion || "专业、有冲击力"}`,
      `镜头语言：${camera || "中近景，轻微推近"}；构图：${composition || "主体居中偏上，底部留字幕区"}`,
      `画面主体：${basePrompt}`,
      `字幕关键词参考：${subtitle.slice(0, 60)}`,
      "生成要求：像一套完整商业短视频分镜里的同一支片子，不要像不同软件随机生成；画面高级、清晰、统一、能直接用于视频成片。",
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

  async function generateImage({ prompt, aspectRatio = "1:1", count = 1, sourceType = "manual", sourceId = "", provider = "" } = {}) {
    const cleanPrompt = String(prompt || "").trim();
    if (!cleanPrompt) throw new Error("请先输入图片描述。");
    const settings = getSettings();
    const providers = settings.imageProviders || {};
    const selected = imageProviderFromSettings(settings, provider);

    const jobId = randomUUID();
    const results = [];

    const providerInstance = createImageProvider(selected.provider, { config: providers });
    if (!providerInstance) throw new Error("未知图片 Provider。");
    const validation = await providerInstance.validateConfig();
    if (!validation.valid) {
      throw new Error(`${validation.error || "图片生成 API 未配置"} 请到系统设置 > API 服务中心 > 图片生成保存 API Key。`);
    }

    db.prepare(`
      INSERT INTO image_jobs (id, source_type, source_id, provider, model, prompt, aspect_ratio, count_requested, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(jobId, sourceType, sourceId, selected.provider, selected.model, cleanPrompt, aspectRatio, count, "生成中");

    for (let i = 0; i < count; i++) {
      const filename = `img_${jobId.slice(0, 6)}_${i}_${Date.now()}.png`;
      const outputPath = path.join(outputDir, filename);

      try {
        const result = await callProviderGenerate(providerInstance, { prompt: cleanPrompt, aspectRatio, outputPath });

        if (!result.success) {
          results.push({ index: i, success: false, error: result.error });
          continue;
        }

        const localPath = await downloadImage(result, outputPath);

        const stats = fs.statSync(localPath);
        const assetId = randomUUID();

        db.prepare(`
          INSERT INTO image_assets (
            id, job_id, filename, original_path, file_path, file_size, provider, model,
            prompt, revised_prompt, aspect_ratio, source_url, source_type, source_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          assetId,
          jobId,
          filename,
          localPath,
          localPath,
          stats.size,
          selected.provider,
          result.model || selected.model,
          cleanPrompt,
          result.revisedPrompt || cleanPrompt,
          aspectRatio,
          result.sourceUrl || result.imageUrl || "",
          sourceType,
          sourceId,
        );

        results.push({
          index: i,
          success: true,
          assetId,
          filename,
          imagePath: localPath,
          file_path: localPath,
          provider: selected.provider,
          model: result.model || selected.model,
          source_url: result.sourceUrl || result.imageUrl || "",
        });
      } catch (err) {
        results.push({ index: i, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const imagePaths = results.filter(r => r.success).map(r => r.imagePath);

    db.prepare(`
      UPDATE image_jobs SET status=?, progress=100, image_paths_json=?, duration_ms=?,
      updated_at=datetime('now','localtime'), completed_at=datetime('now','localtime') WHERE id=?
    `).run(successCount === count ? "完成" : successCount > 0 ? "部分完成" : "失败",
      JSON.stringify(imagePaths), results.reduce((s, r) => s + (r.duration || 0), 0), jobId);

    return { jobId, results, total: count, success: successCount, failed: count - successCount };
  }

  async function generateStoryboardImages({ projectId, aspectRatio = "9:16", provider = "", countPerScene = 1 } = {}) {
    const prompts = storyboardImagePrompts({ projectId, aspectRatio });
    const perScene = Math.max(1, Math.min(4, Number(countPerScene) || 1));
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
    };
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
    return db.prepare("SELECT * FROM image_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
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

  return {
    generateImage,
    generateStoryboardImages,
    storyboardImagePrompts,
    addLocalImageAsset,
    testProviderConnection,
    getJobs,
    getAssets,
    deleteAsset,
    getStats,
  };
}
