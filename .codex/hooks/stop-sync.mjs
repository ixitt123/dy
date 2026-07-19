#!/usr/bin/env node
// Codex 项目级 Stop hook：只验证，不再自动提交或推送。
import { execFileSync, execSync } from "node:child_process";

const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (!status) {
  console.log("[stop-check] 无本地改动，跳过测试。");
  process.exit(0);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
console.log("[stop-check] 检测到本地改动，正在运行 check:gate；不会自动提交或上传。");
try {
  execFileSync(npmCommand, ["run", "check:gate"], { stdio: "inherit" });
  console.log("[stop-check] ✅ 测试通过。需要发布时，请人工运行“同步项目.bat”。");
} catch {
  console.error("[stop-check] ❌ 测试失败。改动仍只保存在本机，未提交、未上传。");
  process.exit(1);
}
