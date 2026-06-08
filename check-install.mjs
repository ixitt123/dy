import fs from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const baseDir = process.cwd();
const packagePath = path.join(baseDir, "node_modules", "@yc-w-cn", "douyin-mcp-server", "package.json");
const downloadsDir = path.join(baseDir, "downloads");

console.log("Douyin MCP local check");
console.log(`Folder: ${baseDir}`);

if (!fs.existsSync(packagePath)) {
  console.error("Not installed yet. Please run install again.");
  process.exit(1);
}

const packageInfo = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
  console.error("FFmpeg component is missing. Please run the dependency installer again.");
  process.exit(1);
}

fs.mkdirSync(downloadsDir, { recursive: true });

const writeTestPath = path.join(downloadsDir, ".write-test");
fs.writeFileSync(writeTestPath, "ok", "utf8");
fs.unlinkSync(writeTestPath);

console.log(`Package: ${packageInfo.name}@${packageInfo.version}`);
console.log(`FFmpeg: ${ffmpegPath}`);
console.log(`Download folder: ${downloadsDir}`);
console.log("Status: OK");
