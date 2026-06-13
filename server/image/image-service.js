import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createImageProvider } from "./providers/index.js";
import { callProviderGenerate } from "./provider-adapter.js";

const DEFAULT_IMAGE_PROVIDER = "volcengine_ark";
const DEFAULT_IMAGE_MODEL = "doubao-seedream-5-0-lite-260128";

function normalizeVolcengineArkModel(model) {
  const value = String(model || "").trim();
  if (!value || value === "doubao-seedream-5.0-lite" || value === "doubao-seedream-5-0-lite") {
    return DEFAULT_IMAGE_MODEL;
  }
  if (value === "doubao-seedream-5.0" || value === "doubao-seedream-5-0") {
    return "doubao-seedream-5-0-260128";
  }
  return value;
}

export function createImageService({ baseDir, getSettings }) {
  const outputDir = path.join(baseDir, "image-assets", "generated");
  const dbPath = path.join(baseDir, ".data", "image-studio.sqlite");
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

  return { generateImage, testProviderConnection, getJobs, getAssets, deleteAsset, getStats };
}
