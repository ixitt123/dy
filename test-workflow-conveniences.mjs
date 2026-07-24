import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDesktopDateFolder,
  formatLocalDate,
} from "./server/core/desktop-date-folder.js";
await import("./ui/modules/moments-image-instruction.js");
const { buildMomentsImageInstruction } = globalThis;

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const tempDesktop = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-date-folder-"));

try {
  const date = new Date(2026, 6, 23, 14, 33, 0);
  assert.equal(formatLocalDate(date), "2026-07-23");

  const first = createDesktopDateFolder({ desktopDir: tempDesktop, now: date });
  assert.equal(path.basename(first.folderPath), "2026-07-23");
  for (const name of ["语文", "数学", "英语", "政策"]) {
    assert.equal(fs.statSync(path.join(first.folderPath, name)).isDirectory(), true);
  }

  const second = createDesktopDateFolder({ desktopDir: tempDesktop, now: date });
  assert.equal(path.basename(second.folderPath), "2026-07-23-2");

  for (const count of [1, 2, 3]) {
    assert.equal(
      buildMomentsImageInstruction(count),
      `请按提示词生成分镜图片素材，合计 ${count} 张，逐步一张一张地给我，一张都不要少，不要组图或者一张图。`,
    );
  }

  const html = fs.readFileSync(path.join(baseDir, "ui", "index.html"), "utf8");
  assert.match(
    html,
    /data-collector-tab="batch"[\s\S]*id="createDesktopDateFolder"/,
    "新建文件夹按钮应紧跟批量任务按钮",
  );
  assert.match(
    html,
    /id="copyMomentsPrompts"[\s\S]*id="copyMomentsImageInstruction"/,
    "图片提示词按钮应紧跟复制提示词按钮",
  );

  const runtime = fs.readFileSync(path.join(baseDir, "ui", "modules", "legacy-runtime.js"), "utf8");
  assert.match(runtime, /buildMomentsImageInstruction\(prompts\.length\)/);
  assert.match(runtime, /\/api\/desktop-date-folder/);

  const server = fs.readFileSync(path.join(baseDir, "ui-server.mjs"), "utf8");
  assert.match(server, /let selectedDownloadsDir = "";/);
  assert.match(server, /downloadsDir:\s*selectedDownloadsDir/);
  assert.match(server, /url\.pathname === "\/api\/files\/download"/);
  assert.doesNotMatch(
    server,
    /settings\.downloadsDir\s*=/,
    "临时下载地址不能写入 settings.json",
  );
} finally {
  fs.rmSync(tempDesktop, { recursive: true, force: true });
}

console.log("workflow conveniences regression test passed");
