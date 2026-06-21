import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { coverScaleCropFilter, targetImageSize } from "./server/image/image-service.js";

function run(command, args) {
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

const target = targetImageSize("9:16");
assert.deepEqual(target, { width: 1080, height: 1920 });

const filter = coverScaleCropFilter("9:16");
assert.equal(filter, "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1");
assert.equal(filter.includes("force_original_aspect_ratio=cover"), false);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dy-image-normalize-"));
const sourcePath = path.join(tempDir, "source.png");
const outputPath = path.join(tempDir, "output.png");

await run(ffmpegPath, [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=blue:s=1440x2560:d=0.1",
  "-frames:v",
  "1",
  sourcePath,
]);

await run(ffmpegPath, [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-i",
  sourcePath,
  "-vf",
  filter,
  "-frames:v",
  "1",
  outputPath,
]);

assert.equal(fs.existsSync(outputPath), true);
assert.ok(fs.statSync(outputPath).size > 0);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log("Image normalize filter test passed.");
