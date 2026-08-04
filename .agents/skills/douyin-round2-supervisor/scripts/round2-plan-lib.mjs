import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export const PLAN_FILENAME = "02-短视频软件第二轮彻底修复执行总表.md";
export const DEFAULT_PLAN_PATH = path.join(os.homedir(), "Desktop", PLAN_FILENAME);
export const ALLOWED_STATES = new Set([
  "未开始",
  "进行中",
  "待人工/外部",
  "待复验",
  "完成",
  "四次失败待最终收尾",
]);
export const ACTIVE_STATES = new Set(["进行中", "待复验"]);
export const WAITING_STATES = new Set(["待人工/外部"]);
export const TERMINAL_STATES = new Set(["完成", "四次失败待最终收尾"]);
export const HARD_GATE_LANES = new Set([
  "本地发布",
  "PR/CI",
  "正式合并",
  "CS1",
  "小黑",
  "MoneyPrinter 集成",
  "动态大字",
  "发布",
  "清理隔离",
  "结构基线",
  "结构外部",
  "结构本地",
  "结构成片",
  "结构发布",
  "关闭",
]);
export const PRIORITY_ORDER = new Map([["P0", 0], ["P1", 1], ["P2", 2]]);

export function resolvePlanPath(args = process.argv.slice(2)) {
  const index = args.indexOf("--plan");
  return path.resolve(index >= 0 && args[index + 1] ? args[index + 1] : DEFAULT_PLAN_PATH);
}

export function readPlan(planPath) {
  if (!fs.existsSync(planPath)) throw new Error(`missing round-two plan: ${planPath}`);
  return fs.readFileSync(planPath, "utf8");
}

export function parseRows(text) {
  const rowPattern = /^\|\s*`(?<id>R2-\d{2}\.\d{2})`\s*\|\s*(?<lane>[^|]+?)\s*\|\s*(?<state>[^|]+?)\s*\|\s*(?<attempts>\d+)\/4\s*\|\s*(?<priority>P[0-2])\s*\|\s*(?<manual>是|否)\s*\|\s*(?<depends>[^|]+?)\s*\|\s*(?<title>[^|]+?)\s*\|\s*(?<accept>[^|]+?)\s*\|$/gm;
  return [...text.matchAll(rowPattern)].map((match, index) => ({
    index,
    id: match.groups.id,
    lane: match.groups.lane.trim(),
    state: match.groups.state.trim(),
    attempts: Number(match.groups.attempts),
    priority: match.groups.priority,
    manual: match.groups.manual === "是",
    dependencies: match.groups.depends.trim() === "无"
      ? []
      : match.groups.depends.split(",").map((value) => value.trim()).filter(Boolean),
    title: match.groups.title.trim(),
    acceptance: match.groups.accept.trim(),
    raw: match[0],
  }));
}

export function dependencyProblems(rows) {
  const problems = [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    for (const dependency of row.dependencies) {
      if (!byId.has(dependency)) problems.push(`${row.id} has missing dependency ${dependency}`);
      if (dependency === row.id) problems.push(`${row.id} depends on itself`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id, trail) {
    if (visiting.has(id)) {
      const start = trail.indexOf(id);
      problems.push(`dependency cycle: ${[...trail.slice(start), id].join(" -> ")}`);
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    const nextTrail = [...trail, id];
    for (const dependency of byId.get(id).dependencies) visit(dependency, nextTrail);
    visiting.delete(id);
    visited.add(id);
  }
  for (const row of rows) visit(row.id, []);
  return [...new Set(problems)];
}

export function getReadyQueue(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows
    .filter((row) => row.state === "未开始")
    .filter((row) => row.dependencies.every((id) => TERMINAL_STATES.has(byId.get(id)?.state)))
    .sort((left, right) => (
      PRIORITY_ORDER.get(left.priority) - PRIORITY_ORDER.get(right.priority)
      || left.index - right.index
    ));
}

export function dependenciesAreTerminal(row, rows) {
  const byId = new Map(rows.map((candidate) => [candidate.id, candidate]));
  return row.dependencies.every((id) => TERMINAL_STATES.has(byId.get(id)?.state));
}

export function getCurrentItem(rows) {
  const active = rows.filter((row) => ACTIVE_STATES.has(row.state));
  if (active.length > 0) return active[0];
  return getReadyQueue(rows)[0] || null;
}

export function replaceRow(text, row, changes) {
  const state = changes.state ?? row.state;
  const attempts = changes.attempts ?? row.attempts;
  const replacement = `| \`${row.id}\` | ${row.lane} | ${state} | ${attempts}/4 | ${row.priority} | ${row.manual ? "是" : "否"} | ${row.dependencies.length ? row.dependencies.join(",") : "无"} | ${row.title} | ${row.acceptance} |`;
  if (!text.includes(row.raw)) throw new Error(`cannot locate row ${row.id} for update`);
  return text.replace(row.raw, replacement);
}

export function validateHardGateCompletion(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const problems = [];
  function ancestors(row, found = new Set()) {
    for (const id of row.dependencies) {
      if (found.has(id)) continue;
      found.add(id);
      const dependency = byId.get(id);
      if (dependency) ancestors(dependency, found);
    }
    return found;
  }
  for (const row of rows) {
    if (row.state !== "完成" || !HARD_GATE_LANES.has(row.lane)) continue;
    const failedDependencies = [...ancestors(row)].filter((id) => byId.get(id)?.state !== "完成");
    if (failedDependencies.length) {
      problems.push(`${row.id} is a hard gate and cannot be completed while direct or transitive dependencies are not completed: ${failedDependencies.join(", ")}`);
    }
  }
  return problems;
}

export function sanitizeSummary(value) {
  return String(value || "").trim().replace(/\r?\n/g, " ");
}

export function validateEvidencePath(itemId, value) {
  if (!value) throw new Error("evidence path is required");
  const resolved = path.resolve(value);
  const marker = `${path.sep}.data${path.sep}repair-evidence${path.sep}${itemId}${path.sep}`.toLowerCase();
  if (!`${resolved}${path.sep}`.toLowerCase().includes(marker)) throw new Error(`evidence path must be inside .data/repair-evidence/${itemId}/`);
  if (!fs.existsSync(resolved)) throw new Error(`missing evidence path: ${resolved}`);
  if (fs.lstatSync(resolved).isSymbolicLink()) throw new Error("evidence path cannot be a symbolic link");
  const files = [];
  const pending = [resolved];
  while (pending.length) {
    const candidate = pending.pop();
    const stats = fs.lstatSync(candidate);
    if (stats.isSymbolicLink()) throw new Error(`evidence cannot contain a symbolic link: ${candidate}`);
    if (stats.isFile()) {
      files.push(candidate);
      continue;
    }
    if (stats.isDirectory()) for (const name of fs.readdirSync(candidate)) pending.push(path.join(candidate, name));
  }
  if (!files.some((file) => fs.statSync(file).size >= 32)) throw new Error("evidence must contain at least one non-trivial file (32 bytes or more)");
  return resolved;
}

export function validateFailureEvidencePath(itemId, value) {
  const resolved = validateEvidencePath(itemId, value);
  const manifestPath = fs.statSync(resolved).isDirectory()
    ? path.join(resolved, "verification-result.json")
    : path.basename(resolved).toLowerCase() === "verification-result.json" ? resolved : "";
  if (!manifestPath || !fs.existsSync(manifestPath)) throw new Error("failed verification evidence requires verification-result.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`invalid verification-result.json: ${error.message}`);
  }
  if (typeof manifest.command !== "string" || !manifest.command.trim()) throw new Error("verification-result.json requires command");
  if (!Number.isInteger(manifest.exitCode) || manifest.exitCode === 0) throw new Error("verification-result.json requires a non-zero integer exitCode");
  if (manifest.completedVerification !== true) throw new Error("verification-result.json must set completedVerification=true");
  if (typeof manifest.summary !== "string" || manifest.summary.trim().length < 8) throw new Error("verification-result.json requires a meaningful summary");
  return {
    resolved,
    manifestPath,
    manifestSha256: crypto.createHash("sha256").update(fs.readFileSync(manifestPath)).digest("hex"),
  };
}

export function validateCompletionEvidencePath(itemId, value, mode, requiredGates = [], expectedCommands = []) {
  const resolved = validateEvidencePath(itemId, value);
  const manifestPath = path.join(resolved, "completion-result.json");
  if (!fs.existsSync(manifestPath)) throw new Error("completion evidence requires completion-result.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`invalid completion-result.json: ${error.message}`);
  }
  if (manifest.itemId !== itemId) throw new Error(`completion-result.json itemId must be ${itemId}`);
  if (manifest.verificationMode !== mode) throw new Error(`completion-result.json verificationMode must be ${mode}`);
  if (manifest.completedVerification !== true) throw new Error("completion-result.json must set completedVerification=true");
  if (!Number.isFinite(Date.parse(manifest.completedAt))) throw new Error("completion-result.json requires a valid completedAt timestamp");
  if (!Array.isArray(manifest.commands) || !manifest.commands.length) throw new Error("completion-result.json requires commands");
  const commandMatchesExpected = (expected, actual) => {
    const normalizedExpected = String(expected).trim().replace(/\s+/g, " ");
    const normalizedActual = String(actual).trim().replace(/\s+/g, " ");
    const pattern = normalizedExpected
      .split(/(<[^>]+>)/g)
      .map((part) => /^<[^>]+>$/.test(part) ? "[^;|&><`\\r\\n]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("");
    return new RegExp(`^${pattern}$`).test(normalizedActual);
  };
  for (const command of manifest.commands) {
    if (typeof command?.expectedCommand !== "string" || typeof command?.command !== "string" || !command.command.trim() || command.exitCode !== 0 || !/^[a-f0-9]{64}$/i.test(command.outputSha256 || "")) {
      throw new Error("each completion command requires expectedCommand, actual command, exitCode=0 and outputSha256");
    }
    if (!commandMatchesExpected(command.expectedCommand, command.command)) throw new Error(`actual completion command does not match expected command: ${command.expectedCommand}`);
    const outputPath = path.resolve(resolved, String(command.outputPath || ""));
    if (!`${outputPath}${path.sep}`.toLowerCase().startsWith(`${resolved}${path.sep}`.toLowerCase()) || !fs.existsSync(outputPath)) throw new Error(`completion command output is missing or outside the item directory: ${outputPath}`);
    const outputHash = crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex");
    if (outputHash.toLowerCase() !== command.outputSha256.toLowerCase()) throw new Error(`completion command output hash mismatch: ${outputPath}`);
  }
  for (const expected of expectedCommands) if (!manifest.commands.some((command) => command.expectedCommand === expected)) throw new Error(`completion-result.json is missing expected command: ${expected}`);
  if (!Array.isArray(manifest.evidenceFiles) || !manifest.evidenceFiles.length) throw new Error("completion-result.json requires evidenceFiles");
  const verifiedEvidence = new Set();
  for (const evidence of manifest.evidenceFiles) {
    const evidencePath = path.resolve(resolved, String(evidence?.path || ""));
    if (!`${evidencePath}${path.sep}`.toLowerCase().startsWith(`${resolved}${path.sep}`.toLowerCase()) || !fs.existsSync(evidencePath)) {
      throw new Error(`completion evidence file is missing or outside the item directory: ${evidencePath}`);
    }
    const actualHash = crypto.createHash("sha256").update(fs.readFileSync(evidencePath)).digest("hex");
    if (actualHash.toLowerCase() !== String(evidence.sha256 || "").toLowerCase()) throw new Error(`completion evidence hash mismatch: ${evidencePath}`);
    verifiedEvidence.add(path.relative(resolved, evidencePath).replaceAll("\\", "/"));
  }
  const requireEvidenceList = (field) => {
    if (!Array.isArray(manifest[field]) || !manifest[field].length) throw new Error(`this verification mode requires ${field}`);
    for (const value of manifest[field]) if (!verifiedEvidence.has(String(value).replaceAll("\\", "/"))) throw new Error(`${field} must reference a verified evidenceFiles path: ${value}`);
  };
  if (requiredGates.includes("D 真实使用")) requireEvidenceList("actualEvidence");
  if (requiredGates.includes("E 安全")) requireEvidenceList("securityEvidence");
  if (requiredGates.includes("F 数据与回滚")) requireEvidenceList("rollbackEvidence");
  if (requiredGates.includes("G 发布")) requireEvidenceList("releaseEvidence");
  return { resolved, manifest, manifestPath };
}

export function validateHumanConfirmationPath(itemId, value) {
  const resolved = validateEvidencePath(itemId, value);
  const confirmationPath = fs.statSync(resolved).isDirectory() ? path.join(resolved, "human-confirmation.json") : resolved;
  if (path.basename(confirmationPath).toLowerCase() !== "human-confirmation.json" || !fs.existsSync(confirmationPath)) throw new Error("manual completion requires human-confirmation.json");
  const confirmation = JSON.parse(fs.readFileSync(confirmationPath, "utf8"));
  if (confirmation.itemId !== itemId || confirmation.confirmed !== true || confirmation.source !== "user"
    || !Number.isFinite(Date.parse(confirmation.confirmedAt)) || String(confirmation.summary || "").trim().length < 8
    || String(confirmation.verbatimConfirmation || "").trim().length < 2 || String(confirmation.conversationReference || "").trim().length < 4) {
    throw new Error("human-confirmation.json requires matching itemId, source=user, confirmed=true, timestamp, verbatim confirmation, conversation reference and summary");
  }
  return { resolved, confirmationPath, confirmation };
}

export function acquirePlanLock(planPath) {
  const lockPath = `${planPath}.round2.lock`;
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, "wx");
    fs.writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, "utf8");
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`round-two plan is locked by another writer: ${lockPath}`);
    throw error;
  }
  return () => {
    try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  };
}

export function atomicReplacePlan(planPath, expectedText, nextText) {
  const current = fs.readFileSync(planPath, "utf8");
  const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
  if (digest(current) !== digest(expectedText)) throw new Error("round-two plan changed concurrently; refusing to overwrite it");
  const tempPath = `${planPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, nextText, "utf8");
  try {
    fs.renameSync(tempPath, planPath);
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
}
