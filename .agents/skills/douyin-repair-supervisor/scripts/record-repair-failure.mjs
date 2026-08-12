import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const filename = "01-短视频软件彻底修复执行总表.md";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(scriptDir, "check-repair-plan.mjs");
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

function stop(message) {
  console.error(`[repair-attempt] FAIL: ${message}`);
  process.exit(1);
}

const planPath = path.resolve(option("--plan") || path.join(os.homedir(), "Desktop", filename));
const itemId = option("--item");
const evidencePath = option("--evidence");
const summary = option("--summary").trim();

if (!/^\d{2}\.\d{2}$/.test(itemId)) stop("--item must be a repair id such as 02.03");
if (!evidencePath) stop("--evidence is required");
if (!summary) stop("--summary is required");
if (!fs.existsSync(planPath)) stop(`missing plan: ${planPath}`);

const resolvedEvidence = path.resolve(evidencePath);
if (!fs.existsSync(resolvedEvidence)) stop(`missing evidence path: ${resolvedEvidence}`);

const original = fs.readFileSync(planPath, "utf8");
const rowPattern = /^\|\s*`(?<id>\d{2}\.\d{2})`\s*\|\s*(?<state>[^|]+?)\s*\|\s*(?<depends>[^|]+?)\s*\|/gm;
const rows = [...original.matchAll(rowPattern)].map((match) => ({
  id: match.groups.id,
  state: match.groups.state.trim(),
  depends: match.groups.depends.trim(),
}));
const rowIndex = rows.findIndex((row) => row.id === itemId);
if (rowIndex < 0) stop(`unknown repair item: ${itemId}`);

const currentMatch = original.match(/^\|\s*当前唯一允许开始的项目\s*\|\s*`(?<id>\d{2}\.\d{2})`\s*\|/m);
if (!currentMatch || currentMatch.groups.id !== itemId) {
  stop(`item ${itemId} is not the current allowed item`);
}
if (!["进行中", "阻塞", "待复验", "待 Codex 收尾"].includes(rows[rowIndex].state)) {
  stop(`item ${itemId} must be active before recording a failed repair attempt; current state=${rows[rowIndex].state}`);
}

const escapedId = itemId.replace(".", "\\.");
const attemptNumbers = [...original.matchAll(new RegExp(
  `^####\\s+ATTEMPT-(?<number>\\d+)-${escapedId}｜失败\\s*$`,
  "gm",
))].map((match) => Number(match.groups.number));
if (attemptNumbers.length >= 2 || attemptNumbers.some((number) => number >= 2)) {
  stop(`item ${itemId} already reached the two-attempt limit; third repair attempt is forbidden`);
}

const attempt = attemptNumbers.length + 1;
const now = new Date();
const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const evidenceStats = fs.statSync(resolvedEvidence);
const evidenceType = evidenceStats.isDirectory() ? "目录" : "文件";
let updated = original.trimEnd();
updated += `\n\n### LOG-ATTEMPT-${stamp}｜项目 ${itemId}\n`;
updated += `- 记录时间：${now.toISOString()}\n`;
updated += `- 本次结果：第 ${attempt} 次完整复验仍失败\n`;
updated += `- 失败结论：${summary.replace(/\r?\n/g, " ")}\n`;
updated += `- 证据类型：${evidenceType}\n\n`;
updated += `#### ATTEMPT-${attempt}-${itemId}｜失败\n`;
updated += `- 真实证据路径：${resolvedEvidence}\n`;
updated += `- 失败摘要：${summary.replace(/\r?\n/g, " ")}\n`;

let nextId = itemId;
if (attempt === 2) {
  const terminal = new Set(["完成", "不适用", "二次失败待最终收尾"]);
  const next = rows.slice(rowIndex + 1).find((row) => !terminal.has(row.state));
  nextId = next?.id || "无";
  const rowStatePattern = new RegExp("^(\\|\\s*`" + escapedId + "`\\s*\\|\\s*)[^|]+?(\\s*\\|)", "m");
  updated = updated.replace(rowStatePattern, `$1二次失败待最终收尾$2`);
  updated = updated.replace(
    /^(\|\s*当前唯一允许开始的项目\s*\|\s*)(?:`\d{2}\.\d{2}`|无)(\s*\|)/m,
    `$1${nextId === "无" ? "无" : `\`${nextId}\``}$2`,
  );
  updated = updated.replace(
    /^当前唯一允许开始的项目是 `\d{2}\.\d{2}`。.*$/m,
    nextId === "无"
      ? "当前没有普通维修项可开始；所有二次失败项保留到最终收尾清单，原编号禁止第三次普通维修。"
      : `当前唯一允许开始的项目是 \`${nextId}\`。编号 ${itemId} 已因两次失败自动转入最终收尾清单，原编号禁止第三次普通维修。`,
  );
  const skippedCount = rows.filter((row) => row.state === "二次失败待最终收尾").length + 1;
  if (/^\|\s*当前二次失败待最终收尾数\s*\|/m.test(updated)) {
    updated = updated.replace(/^(\|\s*当前二次失败待最终收尾数\s*\|\s*)\d+(\s*\|)/m, `$1${skippedCount}$2`);
  }
  updated += `\n#### AUTO-SKIP-${itemId}｜二次失败待最终收尾\n`;
  updated += "- 自动状态：二次失败待最终收尾\n";
  updated += "- 禁止第三次维修：是\n";
  updated += `- 第二次失败证据：${resolvedEvidence}\n`;
  updated += `- 下一唯一允许项：${nextId}\n`;
  updated += "- 完成计数：不增加；本项仍未解决\n";
  updated += "- 最终收尾要求：另建最终收尾任务并由主 Codex 单独接管，不得在原维修编号继续第三轮。\n";
}

updated += "\n";
fs.writeFileSync(planPath, updated, "utf8");
const checked = spawnSync(process.execPath, [checker, "--plan", planPath], { encoding: "utf8" });
if (checked.status !== 0) {
  fs.writeFileSync(planPath, original, "utf8");
  stop(`plan validation failed; original restored\n${checked.stdout}${checked.stderr}`);
}

console.log(`[repair-attempt] OK: item=${itemId} attempt=${attempt}`);
console.log(`[repair-attempt] evidence=${resolvedEvidence}`);
if (attempt === 2) {
  console.log(`[repair-attempt] state=二次失败待最终收尾 next=${nextId}`);
  console.log("[repair-attempt] third repair attempt is now forbidden");
} else {
  console.log("[repair-attempt] remaining-attempts=1");
}
