import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_STATES,
  acquirePlanLock,
  atomicReplacePlan,
  dependenciesAreTerminal,
  parseRows,
  readPlan,
  replaceRow,
  resolvePlanPath,
  sanitizeSummary,
  validateCompletionEvidencePath,
  validateHumanConfirmationPath,
} from "./round2-plan-lib.mjs";
import { requiredGatesForMode } from "./round2-spec-lib.mjs";
import { assertMasterWriter, readCoordination } from "./round2-coordination-lib.mjs";

const args = process.argv.slice(2);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(scriptDir, "check-round2-plan.mjs");
const planPath = resolvePlanPath(args);
const gateNames = ["A 代码", "B 逻辑", "C 功能", "D 真实使用", "E 安全", "F 数据与回滚", "G 发布"];

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

function stop(message) {
  console.error(`[round2-completion] FAIL: ${message}`);
  process.exit(1);
}

try {
  const itemId = option("--item");
  const machine = option("--machine").toUpperCase();
  const coordination = readCoordination(args);
  assertMasterWriter(coordination.policy, machine, itemId);
  if (!/^R2-\d{2}\.\d{2}$/.test(itemId)) stop("--item must be a second-round id such as R2-00.03");
  const specsPath = path.resolve(option("--specs") || path.join(scriptDir, "..", "references", "round2-execution-specs.json"));
  if (!fs.existsSync(specsPath)) stop(`missing execution specs: ${specsPath}`);
  const spec = JSON.parse(fs.readFileSync(specsPath, "utf8")).items?.find((item) => item.id === itemId);
  if (!spec) stop(`missing execution spec for ${itemId}`);
  const requiredGates = requiredGatesForMode(spec.card.verificationMode);
  const evidenceRecord = validateCompletionEvidencePath(itemId, option("--evidence"), spec.card.verificationMode, requiredGates, spec.run.commands);
  const evidencePath = evidenceRecord.resolved;
  const gatesPath = path.resolve(option("--gates"));
  const summary = sanitizeSummary(option("--summary"));
  const humanEvidence = option("--human-evidence");
  if (!summary) stop("--summary is required");
  if (!fs.existsSync(gatesPath)) stop(`missing --gates JSON: ${gatesPath}`);
  const gates = JSON.parse(fs.readFileSync(gatesPath, "utf8"));
  for (const name of gateNames) {
    const value = String(gates[name] || "").trim();
    if (!(value === "通过" || /^不适用：\S.+/.test(value))) stop(`invalid gate ${name}: ${value || "missing"}`);
    if (requiredGates.includes(name) && value !== "通过") stop(`verification mode ${spec.card.verificationMode} requires Gate ${name}=通过`);
  }

  const testCandidate = String(spec.run.testToAdd || "").match(/^(?<file>(?:\.agents\/|test-)[^（\s]+\.mjs)/)?.groups?.file;
  if (testCandidate && !fs.existsSync(path.resolve(testCandidate))) stop(`required regression does not exist: ${testCandidate}`);

  const original = readPlan(planPath);
  const rows = parseRows(original);
  const row = rows.find((candidate) => candidate.id === itemId);
  if (!row) stop(`unknown round-two item: ${itemId}`);
  if (!ACTIVE_STATES.has(row.state)) stop(`item ${itemId} must be active before completion`);
  if (!dependenciesAreTerminal(row, rows)) stop(`item ${itemId} does not have terminal dependencies`);
  if (row.attempts >= 4) stop(`item ${itemId} has no remaining completion attempt`);
  let resolvedHumanEvidence = "";
  if (row.manual) {
    if (!humanEvidence) stop(`manual item ${itemId} requires --human-evidence`);
    resolvedHumanEvidence = validateHumanConfirmationPath(itemId, humanEvidence).resolved;
  }

  const attempt = row.attempts + 1;
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  let updated = replaceRow(original, row, { state: "完成", attempts: attempt }).trimEnd();
  updated += `\n\n### LOG-COMPLETE-${stamp}｜项目 ${itemId}\n`;
  updated += `- 完成时间：${now.toISOString()}\n`;
  updated += `- 完整维修复验次数：${attempt}/4\n`;
  updated += `- 结论：${summary}\n\n`;
  updated += `#### EVIDENCE-${itemId}｜七道门\n`;
  for (const name of gateNames) updated += `- Gate ${name}：${String(gates[name]).trim()}\n`;
  updated += `- 真实证据路径：${evidencePath}\n`;
  if (resolvedHumanEvidence) updated += `- 人工确认路径：${resolvedHumanEvidence}\n`;
  updated += "\n";

  const releaseLock = acquirePlanLock(planPath);
  try {
    atomicReplacePlan(planPath, original, updated);
    const checkArgs = [
      checker,
      "--plan", planPath,
      "--specs", specsPath,
      "--assignments", coordination.assignmentsPath,
      "--policy", coordination.policyPath,
    ];
    const checked = spawnSync(process.execPath, checkArgs, { cwd: process.cwd(), encoding: "utf8" });
    if (checked.status !== 0) {
      atomicReplacePlan(planPath, updated, original);
      stop(`plan validation failed; original restored\n${checked.stdout}${checked.stderr}`);
    }
  } finally {
    releaseLock();
  }
  console.log(`[round2-completion] OK: item=${itemId} attempts=${attempt}/4`);
  console.log(`[round2-completion] evidence=${evidencePath}`);
} catch (error) {
  stop(error.message);
}
