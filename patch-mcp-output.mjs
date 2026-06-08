import fs from "node:fs";
import path from "node:path";

const target = path.join(
  process.cwd(),
  "node_modules",
  "@yc-w-cn",
  "douyin-mcp-server",
  "dist",
  "index.js"
);

if (!fs.existsSync(target)) {
  console.error(`Cannot find installed server file: ${target}`);
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8");
const before = source;

source = source.replace(
  'console.log(formatLogMessage("info", message, context));',
  'console.error(formatLogMessage("info", message, context));'
);
source = source.replaceAll("process.stdout.write(`\\r\\u4E0B\\u8F7D\\u8FDB\\u5EA6:", "process.stderr.write(`\\r\\u4E0B\\u8F7D\\u8FDB\\u5EA6:");
source = source.replaceAll("process.stdout.write(`\\r下载进度:", "process.stderr.write(`\\r下载进度:");

source = source.replace(
  '      const cleanUrl = videoUrlMatch[1].replace("playwm", "play");',
  `      const decodedUrl = (() => {
        const value = videoUrlMatch[1];
        try {
          return JSON.parse(\`"\${value.replace(/"/g, '\\"')}"\`);
        } catch {
          return value.replace(/\\u002[fF]/g, "/").replace(/\\u0026/g, "&");
        }
      })();
      const cleanUrl = decodedUrl.replace("playwm", "play");`
);
source = source.replace(
  '      const title = titleMatch ? titleMatch[1].replace(/[\\\\/:*?"<>|]/g, "_").trim() : `douyin_${videoId}`;',
  '      const rawTitle = titleMatch ? this.decodeJsonString(titleMatch[1]) : "";\n      const title = rawTitle ? this.sanitizeFileName(rawTitle).trim() : `douyin_${videoId}`;'
);
source = source.replace(
  '      const filename = `${videoInfo.videoId}.mp4`;\n      const filepath = path.join(this.tempDir, filename);',
  '      const filepath = this.makeVideoFilePath(videoInfo);'
);

if (!source.includes("  makeVideoFilePath(videoInfo) {")) {
  source = source.replace(
    "  formatBytes(bytes) {",
    `  decodeJsonString(value) {
    try {
      return JSON.parse(\`"\${String(value).replace(/"/g, '\\\\"')}"\`);
    } catch {
      return String(value);
    }
  }
  sanitizeFileName(value) {
    return String(value || "")
      .replace(/[\\\\/:*?"<>|]/g, "_")
      .replace(/[\\r\\n\\t]+/g, " ")
      .replace(/\\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();
  }
  makeVideoFilePath(videoInfo) {
    const fallback = this.sanitizeFileName(videoInfo.videoId || \`douyin_\${Date.now()}\`) || \`douyin_\${Date.now()}\`;
    const base = (this.sanitizeFileName(videoInfo.title) || fallback).slice(0, 120);
    const id = fallback.slice(0, 48);
    const candidates = [
      \`\${base}.mp4\`,
      \`\${base}_\${id}.mp4\`
    ];
    for (const filename of candidates) {
      const filepath = path.join(this.tempDir, filename);
      if (!fs2.existsSync(filepath)) return filepath;
    }
    let index = 2;
    while (true) {
      const filepath = path.join(this.tempDir, \`\${base}_\${id}_\${index}.mp4\`);
      if (!fs2.existsSync(filepath)) return filepath;
      index += 1;
    }
  }
  formatBytes(bytes) {`
  );
}

if (source !== before) {
  fs.writeFileSync(target, source, "utf8");
  console.log("Patched MCP server output for stdio clients.");
} else {
  console.log("MCP server output patch already applied.");
}
