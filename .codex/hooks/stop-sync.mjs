#!/usr/bin/env node
// Codex 项目级 Stop hook
// 职责:一轮编辑停止时,先跑离线测试闸门(npm run check:gate),通过才自动提交并推送。
// 约定见 AGENTS.md (L14-18) 与 SETUP_SYNC.md;P0-4 由 GStack 复核报告(reassess-suggestions-2026-07-18.md)提出。
import { execSync } from "node:child_process";

const BRANCH = "main";
const REMOTE = "origin";

function run(cmd) {
  try {
    execSync(cmd, { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

console.log("[stop-sync] 步骤1/3 运行离线测试闸门: npm run check:gate");
if (!run("npm run check:gate")) {
  console.error("[stop-sync] ❌ 测试闸门未通过 —— 已阻止本次自动提交/推送。请先修复失败用例后再继续编辑。");
  process.exit(1);
}
console.log("[stop-sync] ✅ 测试闸门通过");

console.log("[stop-sync] 步骤2/3 检查本地改动");
const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
if (!status) {
  console.log("[stop-sync] 无本地改动,跳过提交。");
  process.exit(0);
}

console.log("[stop-sync] 步骤3/3 提交并推送");
const when = new Date().toISOString().replace(/[:.]/g, "-");
if (!run("git add -A")) {
  console.error("[stop-sync] ❌ git add 失败");
  process.exit(1);
}
if (!run(`git commit -m "自动备份 ${when}"`)) {
  console.error("[stop-sync] ❌ git commit 失败");
  process.exit(1);
}
// 改动已本地提交;push 失败多为本机 GitHub 443 阻断,不阻止 Stop,提醒手动同步
if (!run(`git push ${REMOTE} ${BRANCH}`)) {
  console.error("[stop-sync] ⚠️ git push 失败(多为网络阻断)。改动已本地提交,请稍后手动同步(可用可用 IP 直连)。");
  process.exit(0);
}
console.log("[stop-sync] ✅ 已提交并推送到 GitHub。");
