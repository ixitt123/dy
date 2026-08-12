import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  acquirePlanLock,
  atomicReplacePlan,
  dependenciesAreTerminal,
  parseRows,
  readPlan,
  replaceRow,
  resolvePlanPath,
} from "./round2-plan-lib.mjs";
import { option, readCoordination, validateCoordination } from "./round2-coordination-lib.mjs";

const args = process.argv.slice(2);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(scriptDir, "check-round2-plan.mjs");

function stop(message) {
  console.error(`[round2-activate] FAIL: ${message}`);
  process.exit(1);
}

function replaceJsonAtomically(filePath, document) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

try {
  const machine = option(args, "--machine").toUpperCase();
  const items = option(args, "--items").split(",").map((value) => value.trim()).filter(Boolean);
  if (machine !== "B") stop("only B may activate assignments");
  if (!items.length || items.length > 2 || new Set(items).size !== items.length) stop("--items requires one or two unique R2 ids");
  const planPath = resolvePlanPath(args);
  const coordination = readCoordination(args);
  if (JSON.stringify(coordination.policy.assignmentWriters) !== JSON.stringify(["B"])) stop("assignment policy does not grant B-only authority");
  const originalPlan = readPlan(planPath);
  const rows = parseRows(originalPlan);
  const selected = items.map((itemId) => {
    const row = rows.find((candidate) => candidate.id === itemId);
    const assignment = coordination.assignmentDocument.assignments.find((candidate) => candidate.itemId === itemId);
    if (!row || !assignment) stop(`missing row or assignment for ${itemId}`);
    if (row.state !== "未开始" || row.attempts !== 0) stop(`${itemId} must be unstarted at 0/4`);
    if (assignment.status !== "planned") stop(`${itemId} assignment must be planned`);
    if (!dependenciesAreTerminal(row, rows)) stop(`${itemId} dependencies are not terminal`);
    return { row, assignment };
  });

  let updatedPlan = originalPlan;
  for (const { row } of selected) updatedPlan = replaceRow(updatedPlan, row, { state: "进行中", attempts: 0 });
  const updatedAssignments = structuredClone(coordination.assignmentDocument);
  updatedAssignments.updatedBy = "B";
  updatedAssignments.updatedAt = new Date().toISOString();
  for (const itemId of items) updatedAssignments.assignments.find((entry) => entry.itemId === itemId).status = "active";
  const updatedRows = parseRows(updatedPlan);
  const problems = validateCoordination(coordination.policy, updatedAssignments, updatedRows);
  if (problems.length) stop(problems.join("; "));

  const originalAssignments = fs.readFileSync(coordination.assignmentsPath, "utf8");
  const releaseLock = acquirePlanLock(planPath);
  try {
    replaceJsonAtomically(coordination.assignmentsPath, updatedAssignments);
    atomicReplacePlan(planPath, originalPlan, updatedPlan);
    const checked = spawnSync(process.execPath, [checker, "--plan", planPath, "--assignments", coordination.assignmentsPath, "--policy", coordination.policyPath], { cwd: process.cwd(), encoding: "utf8" });
    if (checked.status !== 0) {
      atomicReplacePlan(planPath, updatedPlan, originalPlan);
      fs.writeFileSync(coordination.assignmentsPath, originalAssignments, "utf8");
      stop(`activation failed validation; original files restored\n${checked.stdout}${checked.stderr}`);
    }
  } finally {
    releaseLock();
  }
  console.log(`[round2-activate] OK: ${items.join(",")}`);
  for (const { assignment } of selected) console.log(`[round2-activate] ${assignment.machine} ${assignment.itemId} ${assignment.branch}`);
} catch (error) {
  stop(error.message);
}
