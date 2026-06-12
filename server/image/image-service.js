import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createImageProvider } from "./providers/index.js";
import { callProviderGenerate } from "./provider-adapter.js";

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
      prompt TEXT,
      revised_prompt TEXT,
      aspect_ratio TEXT,
      source_type TEXT DEFAULT 'manual',
      source_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  async function generateImage({ prompt, aspectRatio = "1:1", count = 1, sourceType = "manual", sourceId = "" } = {}) {
    const cleanPrompt = String(prompt || "").trim();
    if (!cleanPrompt) throw new Error("请先输入图片描述。");
    const settings = getSettings();
    const providers = settings.imageProviders || {};

    const jobId = randomUUID();
    const results = [];

    const providerInstance = createImageProvider("jimeng", { config: providers });
    if (!providerInstance) throw new Error("即梦 Provider 初始化失败");
    const validation = await providerInstance.validateConfig();
    if (!validation.valid) {
      throw new Error(`${validation.error || "图片生成 API 未配置"}。请到系统设置 > API 服务中心 > 图片生成 > 即梦 AI 保存 API Key。`);
    }

    db.prepare(`
      INSERT INTO image_jobs (id, source_type, source_id, provider, prompt, aspect_ratio, count_requested, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(jobId, sourceType, sourceId, "jimeng", cleanPrompt, aspectRatio, count, "生成中");

    for (let i = 0; i < count; i++) {
      const filename = `img_${jobId.slice(0, 6)}_${i}_${Date.now()}.png`;
      const outputPath = path.join(outputDir, filename);

      try {
        const result = await callProviderGenerate(providerInstance, { prompt: cleanPrompt, aspectRatio, outputPath });

        if (!result.success) {
          results.push({ index: i, success: false, error: result.error });
          continue;
        }

        let localPath = "";
        if (result.imageUrl) {
          const resp = await fetch(result.imageUrl);
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            fs.writeFileSync(outputPath, buf);
            localPath = outputPath;
          }
        } else if (result.imageBase64) {
          fs.writeFileSync(outputPath, Buffer.from(result.imageBase64, "base64"));
          localPath = outputPath;
        }

        if (!localPath) {
          results.push({ index: i, success: false, error: "图片保存失败" });
          continue;
        }

        const stats = fs.statSync(localPath);
        const assetId = randomUUID();

        db.prepare(`
          INSERT INTO image_assets (id, job_id, filename, original_path, file_size, provider, prompt, revised_prompt, aspect_ratio, source_type, source_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(assetId, jobId, filename, localPath, stats.size, "jimeng", cleanPrompt, result.revisedPrompt || cleanPrompt, aspectRatio, sourceType, sourceId);

        results.push({ index: i, success: true, assetId, filename, imagePath: localPath });
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

  function getJobs({ limit = 50, offset = 0 } = {}) {
    return db.prepare("SELECT * FROM image_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
  }

  function getAssets({ limit = 50, offset = 0 } = {}) {
    return db.prepare("SELECT * FROM image_assets ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
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

  return { generateImage, getJobs, getAssets, deleteAsset, getStats };
}
