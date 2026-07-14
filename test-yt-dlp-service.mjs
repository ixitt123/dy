import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureYtDlpBinary } from "./server/core/yt-dlp-service.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dy-yt-dlp-test-"));
const explicitBinary = path.join(tempDir, process.platform === "win32" ? "custom-yt-dlp.exe" : "custom-yt-dlp");
const originalExplicitPath = process.env.YT_DLP_PATH;
const originalPath = process.env.PATH;
const originalFetch = globalThis.fetch;

try {
  fs.writeFileSync(explicitBinary, "local test binary", "utf8");
  process.env.YT_DLP_PATH = explicitBinary;
  const resolved = await ensureYtDlpBinary(path.join(tempDir, "project"));
  assert.equal(resolved, explicitBinary, "应优先使用 YT_DLP_PATH 指向的本地程序");
  assert.equal(fs.existsSync(path.join(tempDir, "project", ".data", "bin")), false, "找到本地程序后不应访问网络或创建下载目录");

  delete process.env.YT_DLP_PATH;
  process.env.PATH = "";
  const fetchUrls = [];
  globalThis.fetch = async (url) => {
    fetchUrls.push(String(url));
    return new Response("downloaded test binary", { status: 200 });
  };
  const downloadProject = path.join(tempDir, "download-project");
  const downloaded = await ensureYtDlpBinary(downloadProject);
  assert.equal(fetchUrls.length, 1, "直链下载成功时不应再请求 GitHub API");
  assert.match(fetchUrls[0], /github\.com\/yt-dlp\/yt-dlp\/releases\/latest\/download\/yt-dlp(?:\.exe)?$/);
  assert.equal(fs.readFileSync(downloaded, "utf8"), "downloaded test binary");
  console.log("yt-dlp 本地优先与免 API 直链测试通过");
} finally {
  if (originalExplicitPath === undefined) delete process.env.YT_DLP_PATH;
  else process.env.YT_DLP_PATH = originalExplicitPath;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  globalThis.fetch = originalFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
