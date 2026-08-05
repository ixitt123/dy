import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_STATES,
  ALLOWED_STATES,
  dependenciesAreTerminal,
  dependencyProblems,
  getReadyQueue,
  parseRows,
  readPlan,
  resolvePlanPath,
  validateHardGateCompletion,
  validateCompletionEvidencePath,
  validateEvidencePath,
  validateHumanConfirmationPath,
} from "./round2-plan-lib.mjs";
import { buildExecutionSpecs, planDefinitionFingerprint, requiredGatesForMode } from "./round2-spec-lib.mjs";
import { ACTIVE_ASSIGNMENT_STATES, readCoordination, validateCoordination } from "./round2-coordination-lib.mjs";

const args = process.argv.slice(2);
const planPath = resolvePlanPath(args);
const specsIndex = args.indexOf("--specs");
const provenanceIndex = args.indexOf("--evidence-provenance");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..", "..");
const specsPath = path.resolve(specsIndex >= 0 && args[specsIndex + 1]
  ? args[specsIndex + 1]
  : path.join(scriptDir, "..", "references", "round2-execution-specs.json"));
const provenancePath = path.resolve(provenanceIndex >= 0 && args[provenanceIndex + 1]
  ? args[provenanceIndex + 1]
  : path.join(repoRoot, "docs", "repair", "round2", "evidence-provenance.json"));
const problems = [];
const legacyCompletedIds = new Set(["R2-00.01", "R2-00.02", "R2-00.05"]);
let evidenceProvenance = null;
try {
  evidenceProvenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
} catch {}
let previewSpecs = null;
if (fs.existsSync(specsPath)) {
  try { previewSpecs = JSON.parse(fs.readFileSync(specsPath, "utf8")); } catch {}
}
const previewSpecById = new Map((previewSpecs?.items || []).map((item) => [item.id, item]));

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) problems.push(`missing ${label}`);
}

function validateImportedControlEvidence(itemId, evidencePath, originalError) {
  if (!String(originalError?.message || "").startsWith("missing evidence path:")) throw originalError;
  if (!itemId.startsWith("R2-00.")) throw originalError;
  if (evidenceProvenance?.schemaVersion !== 1 || !Array.isArray(evidenceProvenance?.records)) {
    throw new Error(`missing or invalid evidence provenance: ${provenancePath}`);
  }
  const record = evidenceProvenance.records.find((entry) => entry.itemId === itemId);
  if (!record || record.originMachine !== "A" || record.availability !== "origin-machine-local-not-synchronized"
    || record.evidencePath !== evidencePath || !/^[a-f0-9]{40}$/i.test(record.recordedAtCommit || "")) {
    throw originalError;
  }
  const normalized = path.win32.resolve(record.evidencePath).toLowerCase();
  const marker = `\\.data\\repair-evidence\\${itemId.toLowerCase()}\\`;
  if (!normalized.includes(marker)) throw new Error(`${itemId} imported evidence pointer is outside its item directory`);
  const source = spawnSync("git", ["show", `${record.recordedAtCommit}:docs/repair/round2/master-register.md`], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (source.status !== 0 || !source.stdout.includes(`- 真实证据路径：${record.evidencePath}`)) {
    throw new Error(`${itemId} imported evidence pointer is not present in recorded commit ${record.recordedAtCommit}`);
  }
  console.warn(`[round2-plan] NOTE: ${itemId} evidence remains local to A; immutable pointer verified at ${record.recordedAtCommit}`);
}

try {
  const text = readPlan(planPath);
  const rows = parseRows(text);
  if (rows.length !== 73) problems.push(`expected 73 repair rows, found ${rows.length}`);

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) problems.push(`duplicate repair row ${row.id}`);
    seen.add(row.id);
    if (!ALLOWED_STATES.has(row.state)) problems.push(`invalid state for ${row.id}: ${row.state}`);
    if (row.attempts < 0 || row.attempts > 4) problems.push(`${row.id} has invalid attempts ${row.attempts}/4`);
    if (!row.title || !row.acceptance) problems.push(`${row.id} is missing title or acceptance`);
    if (row.state === "四次失败待最终收尾" && row.attempts !== 4) problems.push(`${row.id} failed-terminal state requires 4/4`);
    if (!new Set(["完成", "四次失败待最终收尾"]).has(row.state) && row.attempts >= 4) {
      problems.push(`${row.id} reached 4/4 but is not terminal`);
    }

    const escapedId = row.id.replaceAll(".", "\\.");
    const attempts = [...text.matchAll(new RegExp(`^####\\s+ATTEMPT-(?<number>\\d+)-${escapedId}｜失败\\s*$`, "gm"))]
      .map((match) => Number(match.groups.number));
    if (new Set(attempts).size !== attempts.length) problems.push(`${row.id} has duplicate failure attempt markers`);
    if (attempts.some((number, index) => number !== index + 1 || number > 4)) problems.push(`${row.id} failure attempts are not sequential 1-4`);
    if (attempts.length > row.attempts) problems.push(`${row.id} has more failure records than its attempts column`);
    const expectedFailures = row.state === "完成" ? row.attempts - 1 : row.attempts;
    if (attempts.length !== expectedFailures) problems.push(`${row.id} attempts column requires ${expectedFailures} failure records, found ${attempts.length}`);
    if (row.state === "未开始" && row.attempts !== 0) problems.push(`${row.id} cannot be unstarted with ${row.attempts}/4`);
    if (row.state === "待复验" && (row.attempts < 1 || row.attempts > 3)) problems.push(`${row.id} waiting for verification requires 1/4 through 3/4`);
    if (row.state === "四次失败待最终收尾" && attempts.join(",") !== "1,2,3,4") {
      problems.push(`${row.id} failed-terminal state requires ATTEMPT-1 through ATTEMPT-4 records`);
    }
    if (attempts.includes(4) && row.state !== "四次失败待最终收尾") {
      problems.push(`${row.id} has a fourth failure but is not failed-terminal`);
    }
    if (attempts.some((number) => number >= 5)) problems.push(`${row.id} exceeds the four-attempt limit`);

    if (row.state === "完成") {
      if (row.attempts < 1) problems.push(`${row.id} is completed but has no completed verification attempt`);
      const completionLogPattern = legacyCompletedIds.has(row.id)
        ? `^###\\s+LOG-CONTROL-[^\\n]*｜项目\\s+${escapedId}\\s*$`
        : `^###\\s+LOG-COMPLETE-[^\\n]*｜项目\\s+${escapedId}\\s*$`;
      if (!new RegExp(completionLogPattern, "m").test(text)) {
        problems.push(`${row.id} is completed but has no completion log`);
      }
      const evidenceMatch = text.match(new RegExp(
        `^####\\s+EVIDENCE-${escapedId}｜[^\\n]*\\n(?<body>[\\s\\S]*?)(?=^####\\s+|^###\\s+|(?![\\s\\S]))`,
        "m",
      ));
      if (!evidenceMatch) {
        problems.push(`${row.id} is completed but has no EVIDENCE block`);
      } else {
        const spec = previewSpecById.get(row.id);
        const mode = spec?.card?.verificationMode || "automated";
        const requiredGates = requiredGatesForMode(mode);
        const testCandidate = String(spec?.run?.testToAdd || "").match(/^(?<file>(?:\.agents\/|test-)[^（\s]+\.mjs)/)?.groups?.file;
        if (!legacyCompletedIds.has(row.id) && testCandidate && !fs.existsSync(path.resolve(testCandidate))) problems.push(`${row.id} required regression does not exist: ${testCandidate}`);
        const gates = ["A 代码", "B 逻辑", "C 功能", "D 真实使用", "E 安全", "F 数据与回滚", "G 发布"];
        for (const gate of gates) {
          const value = evidenceMatch.groups.body.match(new RegExp(`^- Gate ${gate}：\\s*(?<value>.+)$`, "m"))?.groups.value.trim();
          if (!value || !(value === "通过" || /^不适用：\S.+/.test(value))) problems.push(`${row.id} has invalid or missing Gate ${gate}`);
          if (!legacyCompletedIds.has(row.id) && requiredGates.includes(gate) && value !== "通过") problems.push(`${row.id} verification mode ${mode} requires Gate ${gate}=通过`);
        }
        const rawEvidencePath = evidenceMatch.groups.body.match(/^- 真实证据路径：\s*(?<value>.+)$/m)?.groups.value.trim().replace(/^`|`$/g, "");
        if (!rawEvidencePath) {
          problems.push(`${row.id} has no real evidence path`);
        } else {
          try {
            if (legacyCompletedIds.has(row.id)) validateEvidencePath(row.id, rawEvidencePath);
            else validateCompletionEvidencePath(row.id, rawEvidencePath, mode, requiredGates, spec?.run?.commands || []);
          } catch (error) {
            try {
              validateImportedControlEvidence(row.id, rawEvidencePath, error);
            } catch (finalError) {
              problems.push(`${row.id} invalid evidence: ${finalError.message}`);
            }
          }
        }
        if (row.manual) {
          const confirmation = evidenceMatch.groups.body.match(/^- 人工确认路径：\s*(?<value>.+)$/m)?.groups.value.trim().replace(/^`|`$/g, "");
          if (!confirmation) {
            problems.push(`${row.id} manual completion requires an existing human confirmation path`);
          } else {
            try {
              validateHumanConfirmationPath(row.id, confirmation);
            } catch (error) {
              problems.push(`${row.id} invalid human confirmation evidence: ${error.message}`);
            }
          }
        }
      }
    }
  }

  problems.push(...dependencyProblems(rows));
  problems.push(...validateHardGateCompletion(rows));

  const active = rows.filter((row) => ACTIVE_STATES.has(row.state));
  if (active.length > 2) problems.push(`more than two active items: ${active.map((row) => row.id).join(", ")}`);
  for (const row of active) {
    if (!dependenciesAreTerminal(row, rows)) problems.push(`active item ${row.id} does not have terminal dependencies`);
  }

  const coordination = readCoordination(args);
  problems.push(...validateCoordination(coordination.policy, coordination.assignmentDocument, rows));
  const activeBusinessRows = active.filter((row) => !row.id.startsWith("R2-00."));
  const activeAssignments = coordination.assignmentDocument.assignments.filter((entry) => ACTIVE_ASSIGNMENT_STATES.has(entry.status));
  for (const row of activeBusinessRows) {
    if (!activeAssignments.some((entry) => entry.itemId === row.id)) problems.push(`active business item ${row.id} requires an active machine assignment`);
  }
  for (const assignment of activeAssignments) {
    if (!activeBusinessRows.some((row) => row.id === assignment.itemId)) problems.push(`active assignment ${assignment.itemId}/${assignment.machine} requires an active plan row`);
  }

  if (!fs.existsSync(specsPath)) {
    problems.push(`missing execution specs: ${specsPath}`);
  } else {
    let specs;
    try {
      specs = JSON.parse(fs.readFileSync(specsPath, "utf8"));
    } catch (error) {
      problems.push(`invalid execution specs JSON: ${error.message}`);
    }
    if (specs) {
      if (specs.itemCount !== 73 || specs.items?.length !== 73) problems.push("execution specs must contain exactly 73 items");
      if (specs.definitionSha256 !== planDefinitionFingerprint(rows)) problems.push("execution specs do not match the current plan definition");
      if (JSON.stringify(specs.items) !== JSON.stringify(buildExecutionSpecs(rows))) problems.push("execution specs are stale relative to the current specification templates; regenerate them");
      const specIds = new Set();
      for (const spec of specs.items || []) {
        if (specIds.has(spec.id)) problems.push(`duplicate execution spec ${spec.id}`);
        specIds.add(spec.id);
        if (!seen.has(spec.id)) problems.push(`unknown execution spec ${spec.id}`);
        requireText(spec.card?.scope, `${spec.id} card.scope`);
        requireText(spec.card?.verificationMode, `${spec.id} card.verificationMode`);
        requireText(spec.card?.failingRegression, `${spec.id} card.failingRegression`);
        requireText(spec.card?.realEvidence, `${spec.id} card.realEvidence`);
        requireText(spec.card?.rollback, `${spec.id} card.rollback`);
        requireText(spec.card?.escalation, `${spec.id} card.escalation`);
        if (!Array.isArray(spec.card?.orderedActions) || spec.card.orderedActions.length < 5) problems.push(`${spec.id} card requires at least five ordered actions`);
        if (!Array.isArray(spec.card?.targetedChecks) || spec.card.targetedChecks.length < 2) problems.push(`${spec.id} card requires targeted checks`);
        if (!Array.isArray(spec.card?.prohibitedShortcuts) || spec.card.prohibitedShortcuts.length < 4) problems.push(`${spec.id} card requires prohibited shortcuts`);
        if (!Array.isArray(spec.run?.sourceAnchors) || !spec.run.sourceAnchors.length) problems.push(`${spec.id} RUN requires source anchors`);
        if (!Array.isArray(spec.run?.commands) || spec.run.commands.length < 2) problems.push(`${spec.id} RUN requires runnable commands`);
        requireText(spec.run?.testToAdd, `${spec.id} RUN testToAdd`);
        requireText(spec.run?.requiredEvidence, `${spec.id} RUN requiredEvidence`);
        requireText(spec.run?.evidenceDir, `${spec.id} RUN evidenceDir`);
        if (!spec.run?.evidenceDir?.includes(spec.id)) problems.push(`${spec.id} RUN evidence directory must contain its item id`);
      }
      for (const row of rows) if (!specIds.has(row.id)) problems.push(`missing execution spec ${row.id}`);
    }
  }

  if (problems.length) {
    for (const problem of problems) console.error(`[round2-plan] FAIL: ${problem}`);
    process.exit(1);
  }

  const ready = getReadyQueue(rows);
  const stateCounts = Object.fromEntries([...ALLOWED_STATES].map((state) => [state, rows.filter((row) => row.state === state).length]));
  console.log(`[round2-plan] OK: ${planPath}`);
  console.log(`[round2-plan] items=${rows.length} active=${active.map((row) => row.id).join(",") || "none"} ready=${ready.map((row) => row.id).join(",") || "none"}`);
  console.log(`[round2-plan] states=${JSON.stringify(stateCounts)}`);
  console.log(`[round2-plan] specs=${specsPath}`);
} catch (error) {
  console.error(`[round2-plan] FAIL: ${error.message}`);
  process.exit(1);
}
