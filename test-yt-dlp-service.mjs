import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureYtDlpBinary } from "./server/core/yt-dlp-service.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dy-yt-dlp-test-"));
const explicitBinary = path.join(tempDir, process.platform === "win32" ? "custom-yt-dlp.exe" : "custom-yt-dlp");
const originalExplicitPath = process.env.YT_DLP_PATH;

try {
  fs.writeFileSync(explicitBinary, "local test binary", "utf8");
  process.env.YT_DLP_PATH = explicitBinary;
  const resolved = await ensureYtDlpBinary(path.join(tempDir, "project"));
  assert.equal(resolved, explicitBinary, "应优先使用 YT_DLP_PATH 指向的本地程序");
  assert.equal(fs.existsSync(path.join(tempDir, "project", ".data", "bin")), false, "找到本地程序后不应访问网络或创建下载目录");
  console.log("yt-dlp 本地程序优先级测试通过");
} finally {
  if (originalExplicitPath === undefined) delete process.env.YT_DLP_PATH;
  else process.env.YT_DLP_PATH = originalExplicitPath;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
