import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const backupRoot = path.resolve(process.argv[2] || "");

function stop(message) {
  console.error(`[runtime-backup-verify] FAIL: ${message}`);
  process.exit(1);
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function summary(databasePath) {
  const db = new DatabaseSync(databasePath);
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => Object.values(row)[0]);
    const quickCheck = db.prepare("PRAGMA quick_check").all().map((row) => Object.values(row)[0]);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map((row) => ({ name: row.name, rows: Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(row.name)}`).get().count) }));
    return { integrity, quickCheck, tables };
  } finally {
    db.close();
  }
}

if (!backupRoot || !fs.existsSync(backupRoot)) stop(`missing backup directory: ${backupRoot}`);
const reportPath = path.join(backupRoot, "backup-report.json");
const manifestPath = path.join(backupRoot, "manifest.sha256");
if (!fs.existsSync(reportPath) || !fs.existsSync(manifestPath)) stop("backup report or manifest is missing");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
for (const line of fs.readFileSync(manifestPath, "utf8").trim().split(/\r?\n/).filter(Boolean)) {
  const [expected, relative] = line.split(/\s{2,}/, 2);
  const target = path.resolve(backupRoot, relative);
  if (!target.startsWith(`${backupRoot}${path.sep}`) || !fs.existsSync(target)) stop(`invalid manifest entry: ${relative}`);
  if (sha256(target) !== expected) stop(`manifest mismatch: ${relative}`);
}
for (const database of report.databases || []) {
  const file = path.join(backupRoot, database.backup);
  const restored = path.join(backupRoot, "restore-check", database.backup);
  if (!fs.existsSync(file) || !fs.existsSync(restored)) stop(`missing database snapshot: ${database.backup}`);
  const expected = { integrity: database.integrity, quickCheck: database.quickCheck, tables: database.tables };
  if (JSON.stringify(summary(file)) !== JSON.stringify(expected)) stop(`database summary differs: ${database.backup}`);
  if (JSON.stringify(summary(restored)) !== JSON.stringify(expected)) stop(`restore summary differs: ${database.backup}`);
}
for (const file of report.files || []) {
  const backup = path.join(backupRoot, file.backup);
  const restored = path.join(backupRoot, "restore-check", file.backup);
  if (!fs.existsSync(backup) || !fs.existsSync(restored)) stop(`missing checked copy: ${file.backup}`);
  if (sha256(backup) !== file.sha256 || sha256(restored) !== file.sha256) stop(`checked copy hash differs: ${file.backup}`);
  if (backup.endsWith(".json")) JSON.parse(fs.readFileSync(backup, "utf8"));
}
const assets = JSON.parse(fs.readFileSync(path.join(backupRoot, "asset-inventory.json"), "utf8"));
if (!Array.isArray(assets) || assets.length !== (report.assets || []).length) stop("asset inventory count differs");
console.log(`[runtime-backup-verify] OK: ${backupRoot}`);
console.log(`[runtime-backup-verify] sqlite=${report.databases.length} files=${report.files.length} assets=${assets.length}`);
