import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(scriptDir, "..", "..", "..", "..");
export const DEFAULT_POLICY_PATH = path.join(REPO_ROOT, "docs", "repair", "round2", "dual-machine-policy.json");
export const DEFAULT_ASSIGNMENTS_PATH = path.join(REPO_ROOT, "docs", "repair", "round2", "assignments.json");
export const ACTIVE_ASSIGNMENT_STATES = new Set(["active", "review"]);

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`missing ${label}: ${filePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`invalid ${label}: ${error.message}`);
  }
}

export function option(args, name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

export function resolveCoordinationPaths(args = process.argv.slice(2)) {
  return {
    policyPath: path.resolve(option(args, "--policy", DEFAULT_POLICY_PATH)),
    assignmentsPath: path.resolve(option(args, "--assignments", DEFAULT_ASSIGNMENTS_PATH)),
  };
}

export function readCoordination(args = process.argv.slice(2)) {
  const paths = resolveCoordinationPaths(args);
  return {
    ...paths,
    policy: readJson(paths.policyPath, "dual-machine policy"),
    assignmentDocument: readJson(paths.assignmentsPath, "round-two assignments"),
  };
}

function normalized(candidate) {
  return String(candidate || "").trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/\*\*$/, "").replace(/\/$/, "").toLowerCase();
}

export function pathsOverlap(left, right) {
  const a = normalized(left);
  const b = normalized(right);
  return Boolean(a && b && (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

export function validateCoordination(policy, assignmentDocument, rows = []) {
  const problems = [];
  if (policy?.schemaVersion !== 1) problems.push("dual-machine policy schemaVersion must be 1");
  if (policy?.primaryMachine !== "B") problems.push("B must be the primary machine");
  for (const [field, label] of [["masterRegisterWriters", "master register"], ["baselineMergeAuthorities", "baseline merge"], ["assignmentWriters", "assignment"]]) {
    if (JSON.stringify(policy?.[field]) !== JSON.stringify(["B"])) problems.push(`${label} authority must be B only`);
  }
  if (policy?.maxParallelSourceItems !== 2) problems.push("maxParallelSourceItems must be exactly 2");
  if (policy?.attemptLimits?.A !== 2 || policy?.attemptLimits?.BDirect !== 4 || policy?.attemptLimits?.totalPerItem !== 4) {
    problems.push("attempt limits must be A=2, BDirect=4 and totalPerItem=4");
  }
  if (policy?.researchBeforeSourceChange !== true) problems.push("web research must be required before source changes");
  if (policy?.manualInterventionDeferMinutes !== 5) problems.push("manual intervention defer window must be 5 minutes");
  if (assignmentDocument?.schemaVersion !== 1 || assignmentDocument?.primaryMachine !== "B" || !Array.isArray(assignmentDocument?.assignments)) {
    problems.push("invalid assignments document header");
    return problems;
  }

  const byRow = new Map(rows.map((row) => [row.id, row]));
  const active = assignmentDocument.assignments.filter((entry) => ACTIVE_ASSIGNMENT_STATES.has(entry.status));
  if (active.length > policy.maxParallelSourceItems) problems.push(`more than ${policy.maxParallelSourceItems} active source assignments`);
  if (new Set(active.map((entry) => entry.machine)).size !== active.length) problems.push("one machine cannot own two active source assignments");
  if (new Set(active.map((entry) => entry.itemId)).size !== active.length) problems.push("one item cannot have two active source assignments");

  for (const entry of assignmentDocument.assignments) {
    if (!/^R2-\d{2}\.\d{2}$/.test(entry.itemId || "")) problems.push(`invalid assignment item id: ${entry.itemId || "missing"}`);
    if (!new Set(["A", "B"]).has(entry.machine)) problems.push(`${entry.itemId} machine must be A or B`);
    if (!new Set(["planned", "active", "review", "closed"]).has(entry.status)) problems.push(`${entry.itemId} has invalid assignment status ${entry.status}`);
    const expectedPrefix = entry.machine === "A" ? "repair/a-" : "repair/b-";
    if (!String(entry.branch || "").startsWith(expectedPrefix)) problems.push(`${entry.itemId} branch must start with ${expectedPrefix}`);
    if (!Array.isArray(entry.allowedPaths) || !entry.allowedPaths.length || entry.allowedPaths.some((value) => !normalized(value))) problems.push(`${entry.itemId} requires non-empty allowedPaths`);
    if (!String(entry.evidenceDir || "").replaceAll("\\", "/").includes(`.data/repair-evidence/${entry.itemId}/`)) problems.push(`${entry.itemId} evidenceDir must be item-specific`);
    if (!String(entry.researchRecord || "").replaceAll("\\", "/").endsWith(`/research/${entry.itemId}.md`)) problems.push(`${entry.itemId} requires its own research record`);
    if (!entry.allowedPaths?.some((candidate) => normalized(candidate) === normalized(entry.researchRecord))) problems.push(`${entry.itemId} researchRecord must be included in allowedPaths`);
    if (rows.length && !byRow.has(entry.itemId)) problems.push(`assignment references unknown item ${entry.itemId}`);
  }

  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      for (const a of active[left].allowedPaths) for (const b of active[right].allowedPaths) {
        if (pathsOverlap(a, b)) problems.push(`active assignments overlap at ${a} and ${b}`);
      }
    }
  }
  return [...new Set(problems)];
}

export function assignmentFor(document, itemId, machine) {
  return document.assignments.find((entry) => entry.itemId === itemId && entry.machine === machine) || null;
}

export function assertMasterWriter(policy, machine, itemId) {
  if (itemId.startsWith("R2-00.")) return;
  if (!machine) throw new Error("business register writes require --machine B");
  if (!policy.masterRegisterWriters.includes(machine)) throw new Error(`machine ${machine} cannot write the master register; B must review and record the result`);
}
