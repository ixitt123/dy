import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_STATES,
  acquirePlanLock,
  atomicReplacePlan,
  dependenciesAreTerminal,
  getReadyQueue,
  parseRows,
  readPlan,
  replaceRow,
  resolvePlanPath,
  sanitizeSummary,
  validateFailureEvidencePath,
} from "./round2-plan-lib.mjs";
import { assertMasterWriter, readCoordination } from "./round2-coordination-lib.mjs";

const args = process.argv.slice(2);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(scriptDir, "check-round2-plan.mjs");
const planPath = resolvePlanPath(args);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

function stop(message) {
  console.error(`[round2-attempt] FAIL: ${message}`);
  process.exit(1);
}

const itemId = option("--item");
const machine = option("--machine").toUpperCase();
const evidence = option("--evidence");
const summary = sanitizeSummary(option("--summary"));
const specs = option("--specs");
if (!/^R2-\d{2}\.\d{2}$/.test(itemId)) stop("--item must be a second-round id such as R2-00.03");
if (!evidence) stop("--evidence is required");
if (!summary) stop("--summary is required");

try {
  const coordination = readCoordination(args);
  assertMasterWriter(coordination.policy, machine, itemId);
  const evidenceRecord = validateFailureEvidencePath(itemId, evidence);
  const evidencePath = evidenceRecord.resolved;
  const original = readPlan(planPath);
  const rows = parseRows(original);
  const row = rows.find((candidate) => candidate.id === itemId);
  if (!row) stop(`unknown round-two item: ${itemId}`);
  if (row.attempts >= 4 || row.state === "四次失败待最终收尾") {
    stop(`item ${itemId} already reached 4/4; a fifth ordinary repair is forbidden`);
  }
  if (!ACTIVE_STATES.has(row.state)) stop(`item ${itemId} must be active before recording failure; current state=${row.state}`);
  if (!dependenciesAreTerminal(row, rows)) stop(`item ${itemId} does not have terminal dependencies`);

  const attempt = row.attempts + 1;
  const terminal = attempt === 4;
  let updated = replaceRow(original, row, {
    state: terminal ? "四次失败待最终收尾" : "待复验",
    attempts: attempt,
  }).trimEnd();
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  updated += `\n\n### LOG-ATTEMPT-${stamp}｜项目 ${itemId}\n`;
  updated += `- 记录时间：${now.toISOString()}\n`;
  updated += `- 本次结果：第 ${attempt} 次完整维修并完整复验仍失败\n`;
  updated += `- 失败结论：${summary}\n\n`;
  updated += `#### ATTEMPT-${attempt}-${itemId}｜失败\n`;
  updated += `- 真实证据路径：${evidencePath}\n`;
  updated += `- 复验结果清单：${evidenceRecord.manifestPath}\n`;
  updated += `- 清单 SHA-256：${evidenceRecord.manifestSha256}\n`;
  updated += `- 失败摘要：${summary}\n`;
  updated += `- 状态：${terminal ? "四次失败待最终收尾" : "待复验"}\n`;

  if (terminal) {
    const updatedRows = parseRows(updated);
    const next = getReadyQueue(updatedRows)[0];
    updated += `\n#### AUTO-ADVANCE-${itemId}｜四次失败待最终收尾\n`;
    updated += "- 自动状态：四次失败待最终收尾\n";
    updated += "- 禁止第 5 次普通维修：是\n";
    updated += "- 验收计数：不增加；本项仍未解决\n";
    updated += "- 硬门禁资格：无；该状态只解锁排程\n";
    updated += `- 下一就绪项：${next?.id || "无"}\n`;
  }
  updated += "\n";

  const releaseLock = acquirePlanLock(planPath);
  try {
    atomicReplacePlan(planPath, original, updated);
    const checkArgs = [checker, "--plan", planPath];
    if (specs) checkArgs.push("--specs", path.resolve(specs));
    checkArgs.push("--assignments", coordination.assignmentsPath, "--policy", coordination.policyPath);
    const checked = spawnSync(process.execPath, checkArgs, { cwd: process.cwd(), encoding: "utf8" });
    if (checked.status !== 0) {
      atomicReplacePlan(planPath, updated, original);
      stop(`plan validation failed; original restored\n${checked.stdout}${checked.stderr}`);
    }
  } finally {
    releaseLock();
  }

  console.log(`[round2-attempt] OK: item=${itemId} attempt=${attempt}/4`);
  console.log(`[round2-attempt] evidence=${evidencePath}`);
  console.log(`[round2-attempt] state=${terminal ? "四次失败待最终收尾" : "待复验"}`);
  if (terminal) console.log("[round2-attempt] fifth ordinary repair is now forbidden; scheduling may advance");
} catch (error) {
  stop(error.message);
}
