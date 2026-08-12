import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { createFinalAssetRegistry } from "./server/core/final-asset-registry.js";

const fixturePath = path.resolve("fixtures/restart/final-asset-fixture.bin");

function hashFile(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("preview, download and history resolve one durable final asset", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-final-asset-"));
  const mediaPath = path.join(tempRoot, "completed.mp4");
  fs.copyFileSync(fixturePath, mediaPath);
  const dbPath = path.join(tempRoot, "tasks.sqlite");
  let registry = createFinalAssetRegistry(tempRoot, { dbPath });
  const created = registry.register({ filePath: mediaPath, kind: "video", source: "fixture-line", sourceRef: "completed-job-1", metadata: { title: "固定最终资产" } });
  assert.match(created.assetId, /^asset_[a-f0-9]{24}_[a-f0-9]{8}$/);
  assert.equal(new URL(created.videoUrl, "http://localhost").searchParams.get("id"), created.assetId);
  assert.equal(new URL(created.downloadUrl, "http://localhost").searchParams.get("id"), created.assetId);
  assert.equal(hashFile(created.filePath), hashFile(fixturePath));
  assert.equal(registry.list({ source: "fixture-line" })[0].assetId, created.assetId);
  registry.close();
  registry = createFinalAssetRegistry(tempRoot, { dbPath });
  const restored = registry.get(created.assetId);
  assert.equal(restored.assetId, created.assetId);
  assert.equal(restored.filePath, mediaPath);
  assert.equal(restored.sha256, created.sha256);
  const noOp = registry.register({ filePath: mediaPath, kind: "video", source: "fixture-line", sourceRef: "completed-job-1" });
  assert.equal(noOp.assetId, created.assetId);
  assert.equal(noOp.updatedAt, restored.updatedAt);
  assert.deepEqual(noOp.metadata, restored.metadata);
  registry.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("same bytes from different production lines keep independent history links", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-final-links-"));
  const mediaPath = path.join(tempRoot, "completed.mp4");
  fs.copyFileSync(fixturePath, mediaPath);
  const registry = createFinalAssetRegistry(tempRoot, { dbPath: path.join(tempRoot, "tasks.sqlite") });
  const cs1 = registry.register({ filePath: mediaPath, source: "cs1-video", sourceRef: "job-a" });
  const xiaohei = registry.register({ filePath: mediaPath, source: "xiaohei-video", sourceRef: "job-b" });
  assert.notEqual(cs1.assetId, xiaohei.assetId);
  assert.equal(cs1.sha256, xiaohei.sha256);
  assert.equal(registry.list({ source: "cs1-video" })[0].assetId, cs1.assetId);
  assert.equal(registry.list({ source: "xiaohei-video" })[0].assetId, xiaohei.assetId);
  registry.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("missing and empty files cannot become successful assets", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-final-invalid-"));
  const registry = createFinalAssetRegistry(tempRoot, { dbPath: path.join(tempRoot, "tasks.sqlite") });
  assert.throws(() => registry.register({ filePath: path.join(tempRoot, "missing.mp4"), source: "test" }), /不存在/);
  const emptyPath = path.join(tempRoot, "empty.mp4");
  fs.writeFileSync(emptyPath, "");
  assert.throws(() => registry.register({ filePath: emptyPath, source: "test" }), /空文件/);
  registry.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
