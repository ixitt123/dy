import crypto from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const AVAILABILITY = "origin-machine-local-not-synchronized";
const RECEIPT_ROOT = "docs/repair/round2/evidence-receipts/";

function gitShow(repoRoot, revision, filePath, label) {
  const source = spawnSync("git", ["show", `${revision}:${filePath}`], {
    cwd: repoRoot,
    encoding: null,
    windowsHide: true,
  });
  if (source.status !== 0) throw new Error(`${label} is not present in recorded commit ${revision}`);
  return source.stdout;
}

function validRelativeEvidenceName(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  return normalized && !path.posix.isAbsolute(normalized) && !normalized.split("/").includes("..");
}

function commandMatchesExpected(expected, actual) {
  const normalizedExpected = String(expected).trim().replace(/\s+/g, " ");
  const normalizedActual = String(actual).trim().replace(/\s+/g, " ");
  const pattern = normalizedExpected
    .split(/(<[^>]+>)/g)
    .map((part) => /^<[^>]+>$/.test(part) ? "[^;|&><`\\r\\n]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("");
  return new RegExp(`^${pattern}$`).test(normalizedActual);
}

function validateReceiptManifest(itemId, receipt, spec) {
  const manifest = receipt.completionManifest;
  const expectedMode = spec?.card?.verificationMode;
  if (!manifest || manifest.itemId !== itemId || manifest.completedVerification !== true
    || manifest.verificationMode !== expectedMode || !Number.isFinite(Date.parse(manifest.completedAt))) {
    throw new Error(`${itemId} imported evidence receipt has an invalid completion manifest`);
  }
  if (!Array.isArray(manifest.commands) || !manifest.commands.length) {
    throw new Error(`${itemId} imported evidence receipt has no completion commands`);
  }
  for (const command of manifest.commands) {
    if (typeof command?.expectedCommand !== "string" || typeof command?.command !== "string"
      || !commandMatchesExpected(command.expectedCommand, command.command) || command.exitCode !== 0
      || !validRelativeEvidenceName(command.outputPath) || !SHA256_PATTERN.test(command.outputSha256 || "")) {
      throw new Error(`${itemId} imported evidence receipt has an invalid completion command`);
    }
  }
  for (const expected of spec?.run?.commands || []) {
    if (!manifest.commands.some((command) => command.expectedCommand === expected)) {
      throw new Error(`${itemId} imported evidence receipt is missing expected command: ${expected}`);
    }
  }
  if (!Array.isArray(manifest.evidenceFiles) || !manifest.evidenceFiles.length) {
    throw new Error(`${itemId} imported evidence receipt has no evidence file hashes`);
  }
  const evidencePaths = new Set();
  for (const evidence of manifest.evidenceFiles) {
    const evidencePath = String(evidence?.path || "").replaceAll("\\", "/");
    if (!validRelativeEvidenceName(evidencePath) || !SHA256_PATTERN.test(evidence?.sha256 || "")) {
      throw new Error(`${itemId} imported evidence receipt has an invalid evidence file hash`);
    }
    evidencePaths.add(evidencePath);
  }
  const modeEvidence = {
    "D 真实使用": "actualEvidence",
    "E 安全": "securityEvidence",
    "F 数据与回滚": "rollbackEvidence",
    "G 发布": "releaseEvidence",
  };
  for (const gate of spec?.requiredGates || []) {
    const field = modeEvidence[gate];
    if (!field) continue;
    if (!Array.isArray(manifest[field]) || !manifest[field].length
      || manifest[field].some((entry) => !evidencePaths.has(String(entry).replaceAll("\\", "/")))) {
      throw new Error(`${itemId} imported evidence receipt has invalid ${field}`);
    }
  }
}

export function validateImportedEvidence({
  itemId,
  evidencePath,
  originalError,
  evidenceProvenance,
  provenancePath,
  repoRoot,
  spec,
}) {
  if (!String(originalError?.message || "").startsWith("missing evidence path:")) throw originalError;
  if (evidenceProvenance?.schemaVersion !== 1 || !Array.isArray(evidenceProvenance?.records)) {
    throw new Error(`missing or invalid evidence provenance: ${provenancePath}`);
  }
  const record = evidenceProvenance.records.find((entry) => entry.itemId === itemId);
  if (!record || !["A", "B"].includes(record.originMachine) || record.availability !== AVAILABILITY
    || record.evidencePath !== evidencePath || !COMMIT_PATTERN.test(record.recordedAtCommit || "")) {
    throw originalError;
  }
  const normalized = path.win32.resolve(record.evidencePath).toLowerCase();
  const marker = `\\.data\\repair-evidence\\${itemId.toLowerCase()}\\`;
  if (!normalized.includes(marker)) throw new Error(`${itemId} imported evidence pointer is outside its item directory`);

  const masterSource = gitShow(repoRoot, record.recordedAtCommit, "docs/repair/round2/master-register.md", `${itemId} imported evidence pointer`).toString("utf8");
  if (!masterSource.includes(`- 真实证据路径：${record.evidencePath}`)) {
    throw new Error(`${itemId} imported evidence pointer is not present in recorded commit ${record.recordedAtCommit}`);
  }

  if (!record.receiptPath) {
    if (!itemId.startsWith("R2-00.") || record.originMachine !== "A") throw originalError;
    console.warn(`[round2-plan] NOTE: ${itemId} legacy control evidence remains local to A; immutable pointer verified at ${record.recordedAtCommit}`);
    return { record, legacyControl: true };
  }

  if (spec?.manual) throw new Error(`${itemId} manual evidence cannot use a portable receipt`);
  const receiptPath = String(record.receiptPath).replaceAll("\\", "/");
  if (!receiptPath.startsWith(RECEIPT_ROOT) || !validRelativeEvidenceName(receiptPath)
    || !SHA256_PATTERN.test(record.receiptSha256 || "") || !SHA256_PATTERN.test(record.manifestSha256 || "")) {
    throw new Error(`${itemId} imported evidence provenance has an invalid receipt pointer`);
  }
  const receiptSource = gitShow(repoRoot, record.recordedAtCommit, receiptPath, `${itemId} imported evidence receipt`);
  const receiptSha256 = crypto.createHash("sha256").update(receiptSource).digest("hex");
  if (receiptSha256.toLowerCase() !== record.receiptSha256.toLowerCase()) {
    throw new Error(`${itemId} imported evidence receipt SHA-256 mismatch`);
  }
  let receipt;
  try {
    receipt = JSON.parse(receiptSource.toString("utf8"));
  } catch (error) {
    throw new Error(`${itemId} imported evidence receipt is invalid JSON: ${error.message}`);
  }
  if (receipt.schemaVersion !== 1 || receipt.itemId !== itemId || receipt.originMachine !== record.originMachine
    || receipt.availability !== AVAILABILITY || receipt.originalEvidencePath !== record.evidencePath
    || !COMMIT_PATTERN.test(receipt.sourceRepairCommit || "")
    || !SHA256_PATTERN.test(receipt.completionManifestSha256 || "")
    || receipt.completionManifestSha256.toLowerCase() !== record.manifestSha256.toLowerCase()) {
    throw new Error(`${itemId} imported evidence receipt does not match its provenance record`);
  }
  validateReceiptManifest(itemId, receipt, spec);
  console.warn(`[round2-plan] NOTE: ${itemId} evidence remains local to ${record.originMachine}; receipt and SHA-256 verified at ${record.recordedAtCommit}`);
  return { record, receipt, legacyControl: false };
}
