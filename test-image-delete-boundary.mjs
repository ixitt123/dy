import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createImageService } from "./server/image/image-service.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "image-delete-boundary-"));
const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-delete-outside-"));
fs.mkdirSync(path.join(root, ".data"), { recursive: true });
const service = createImageService({ baseDir: root, getSettings: () => ({ imageProviders: {} }) });
const dbPath = path.join(root, ".data", "image-studio.sqlite");
const db = new DatabaseSync(dbPath);

function insertAsset(id, originalPath, sourceType = "manual") {
  db.prepare(`
    INSERT INTO image_assets (id, filename, original_path, file_path, source_type, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
  `).run(id, path.basename(originalPath), originalPath, originalPath, sourceType);
}

try {
  const outsideFile = path.join(outsideRoot, "must-survive.png");
  fs.writeFileSync(outsideFile, "outside", "utf8");
  insertAsset("outside-asset", outsideFile, "ian-xiaohei-local-linked");
  const outsideResult = service.deleteAsset("outside-asset");
  assert.equal(fs.existsSync(outsideFile), true, "删除链接资产时绝不能删除允许根目录外的原文件");
  assert.equal(outsideResult.originalRetained, true);

  const managedFile = path.join(root, "image-assets", "generated", "managed.png");
  fs.writeFileSync(managedFile, "managed", "utf8");
  insertAsset("managed-asset", managedFile, "generated");
  const managedResult = service.deleteAsset("managed-asset");
  assert.equal(fs.existsSync(managedFile), false, "受管文件删除后不应继续留在原位置");
  assert.equal(managedResult.recoverable, true, "受管文件必须进入可恢复隔离区");
  assert.ok(managedResult.recoveryToken, "删除结果必须返回非路径型恢复令牌");
  const recoveryRecord = path.join(root, ".data", "trash", "image-assets", `${managedResult.recoveryToken}.json`);
  assert.equal(fs.existsSync(recoveryRecord), true, "可恢复删除缺少元数据记录");
  const metadata = JSON.parse(fs.readFileSync(recoveryRecord, "utf8"));
  assert.equal(fs.existsSync(metadata.trashedPath), true, "受管原文件没有实际移动到隔离区");
  assert.equal(metadata.originalPath, managedFile);

  assert.equal(service.deleteAsset("missing-asset").success, false, "不存在资产不能伪报删除成功");
  console.log("Image delete path boundary and recovery: OK");
} finally {
  db.close();
  service.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outsideRoot, { recursive: true, force: true });
}
