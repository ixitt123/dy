import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");

const forbidden = [
  "organizeLooseDownloadFiles",
  "syncMovedDownloadTaskPaths",
  "downloadDateStamp",
  "downloadTypeFolders",
  "classifyDownloadType",
  "fs.readdirSync(downloadsDir",
  "fs.renameSync(sourcePath, targetPath)",
];

for (const token of forbidden) {
  assert.equal(source.includes(token), false, `危险的下载目录整理逻辑重新出现：${token}`);
}

assert.match(
  source,
  /function downloadOutputDir\(\)\s*\{\s*assertDownloadRuntimeCurrent\(\);[\s\S]*?return downloadsDir;\s*\}/,
  "下载输出必须直接使用用户选择的目录",
);

assert.match(
  source,
  /function assertDownloadRuntimeCurrent\(\)[\s\S]*?currentMtimeMs !== runtimeSourceMtimeMs[\s\S]*?请重启软件后再下载/,
  "下载代码更新后，旧后台必须拒绝继续写入下载目录",
);

assert.match(
  source,
  /const autoClose = !process\.argv\.includes\("--no-auto-close"\);/,
  "UI server must auto-close by default when the last browser page closes.",
);

assert.match(
  source,
  /activeChildProcesses\.size > 0/,
  "UI server must not auto-close while child processes are still running.",
);

assert.match(
  source,
  /serviceIsBusy\(ttsService\)[\s\S]*serviceIsBusy\(imageService\)[\s\S]*serviceIsBusy\(handleKineticTextRoutes\)/,
  "UI server must not auto-close while production services still have background work.",
);

console.log("Download directory safety: OK");
