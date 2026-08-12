import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createKineticTextService } from "./server/kinetic-text/kinetic-text-service.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "kinetic-project-list-"));

try {
  const projectId = "kinetic-existing-final-asset";
  const projectDir = path.join(root, ".data", "kinetic-text", "projects", projectId);
  const videoPath = path.join(root, "downloads", "existing-final.mp4");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.dirname(videoPath), { recursive: true });
  fs.writeFileSync(videoPath, Buffer.alloc(4096, 7));

  const existingAsset = {
    assetId: "asset_existing",
    filePath: videoPath,
    size: fs.statSync(videoPath).size,
    videoUrl: "/api/final-assets/file?id=asset_existing",
    downloadUrl: "/api/final-assets/file?id=asset_existing&download=1",
  };
  let registerCalls = 0;
  const finalAssetRegistry = {
    get(assetId) {
      assert.equal(assetId, existingAsset.assetId);
      return existingAsset;
    },
    register() {
      registerCalls += 1;
      return existingAsset;
    },
  };

  fs.writeFileSync(path.join(projectDir, "project.json"), JSON.stringify({
    id: projectId,
    title: "已有最终成片的项目",
    updatedAt: new Date().toISOString(),
    outputs: {
      finalVideo: videoPath,
      finalAssetId: existingAsset.assetId,
      finalVideoUrl: existingAsset.videoUrl,
      finalDownloadUrl: existingAsset.downloadUrl,
    },
  }, null, 2));

  const service = createKineticTextService({
    baseDir: root,
    downloadsDir: path.join(root, "downloads"),
    getDownloadsDir: () => path.join(root, "downloads"),
    ffmpegPath: "",
    ffprobePath: "",
    finalAssetRegistry,
  });

  const projects = service.list();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, projectId);
  assert.equal(registerCalls, 0, "listing an unchanged final asset must not hash and register it again");
  const project = service.get(projectId);
  assert.equal(project.outputs.finalAssetId, existingAsset.assetId);
  assert.equal(registerCalls, 0, "opening an unchanged registered final asset must reuse it without hashing again");
  console.log("Kinetic project list reuses unchanged final asset registration: OK");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
