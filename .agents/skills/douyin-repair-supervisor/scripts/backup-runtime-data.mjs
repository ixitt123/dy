import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const destinationIndex = args.indexOf("--destination");
const destinationArg = destinationIndex >= 0 ? args[destinationIndex + 1] : "";
const pad = (value) => String(value).padStart(2, "0");
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const repositoryRoot = process.cwd();
const defaultRoot = path.join(os.homedir(), "Documents", "短视频备份", "douyin-mcp-local");
const destination = path.resolve(destinationArg || path.join(defaultRoot, `baseline-00.02-${stamp}`));

function stop(message) {
  console.error(`[runtime-backup] FAIL: ${message}`);
  process.exit(1);
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function ensureInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    stop(`unsafe target outside ${resolvedRoot}: ${resolvedTarget}`);
  }
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function listFiles(root, predicate, output = []) {
  if (!fs.existsSync(root)) return output;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries) {
    if ([".browser-profile", "node_modules", ".git", "repair-evidence"].includes(entry.name)) continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) listFiles(absolute, predicate, output);
    else if (entry.isFile() && predicate(absolute)) output.push(absolute);
  }
  return output;
}

function tableSummary(databasePath) {
  const db = new DatabaseSync(databasePath);
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => Object.values(row)[0]);
    const quickCheck = db.prepare("PRAGMA quick_check").all().map((row) => Object.values(row)[0]);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map((row) => row.name)
      .map((name) => ({ name, rows: Number(db.prepare(`SELECT COUNT(*) AS count FROM ${sqlIdentifier(name)}`).get().count) }));
    return { integrity, quickCheck, tables };
  } finally {
    db.close();
  }
}

function sqliteSnapshot(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) stop(`destination already exists: ${target}`);
  const db = new DatabaseSync(source);
  try {
    db.exec(`VACUUM INTO ${sqlLiteral(target)}`);
  } finally {
    db.close();
  }
  const summary = tableSummary(target);
  if (!summary.integrity.every((value) => String(value).toLowerCase() === "ok")) stop(`integrity check failed for ${source}`);
  if (!summary.quickCheck.every((value) => String(value).toLowerCase() === "ok")) stop(`quick check failed for ${source}`);
  return summary;
}

function copyChecked(source, target, parseJson = false) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  if (parseJson) JSON.parse(fs.readFileSync(target, "utf8"));
  const sourceHash = sha256(source);
  const targetHash = sha256(target);
  if (sourceHash !== targetHash) stop(`hash mismatch after copy: ${source}`);
  return { sha256: targetHash, bytes: fs.statSync(target).size };
}

function relative(file) {
  return path.relative(repositoryRoot, file).replaceAll("\\", "/");
}

if (!fs.existsSync(path.join(repositoryRoot, ".git"))) stop("run from the repository root");
ensureInside(defaultRoot, destination);
if (fs.existsSync(destination)) stop(`destination already exists: ${destination}`);
fs.mkdirSync(destination, { recursive: true });

const report = {
  itemId: "00.02",
  createdAt: new Date().toISOString(),
  repositoryRoot,
  destination,
  backupKind: "SQLite VACUUM INTO snapshots; settings and JSON checked copies; assets inventory only",
  databases: [],
  files: [],
  assets: [],
};

try {
  const sqliteFiles = listFiles(path.join(repositoryRoot, ".data"), (file) => file.endsWith(".sqlite"));
  for (const source of sqliteFiles.sort()) {
    const relativePath = relative(source);
    const target = path.join(destination, "sqlite", relativePath.replace(/^\.data\//, ""));
    const sidecars = ["-wal", "-shm"].filter((suffix) => fs.existsSync(`${source}${suffix}`));
    const summary = sqliteSnapshot(source, target);
    report.databases.push({ source: relativePath, backup: path.relative(destination, target).replaceAll("\\", "/"), sourceSidecars: sidecars, bytes: fs.statSync(target).size, sha256: sha256(target), ...summary });
  }

  const requiredFiles = [path.join(repositoryRoot, "settings.json")];
  const optionalJson = [
    path.join(repositoryRoot, ".data", "folder-names.json"),
    path.join(repositoryRoot, ".data", "cs1-video-maker", "hidden-styles.json"),
  ];
  for (const source of [...requiredFiles, ...optionalJson.filter(fs.existsSync)]) {
    if (!fs.existsSync(source)) stop(`required runtime file missing: ${source}`);
    const relativePath = relative(source);
    const target = path.join(destination, "files", relativePath.replace(/^\.data\//, "data/"));
    const isJson = source.endsWith(".json");
    report.files.push({ source: relativePath, backup: path.relative(destination, target).replaceAll("\\", "/"), ...copyChecked(source, target, isJson) });
  }

  const assetRoots = [path.join(repositoryRoot, "assets"), path.join(repositoryRoot, ".data", "audio-reference"), path.join(repositoryRoot, "voices")];
  for (const root of assetRoots) {
    for (const file of listFiles(root, () => true)) {
      const stat = fs.statSync(file);
      report.assets.push({ path: relative(file), bytes: stat.size, modifiedAt: stat.mtime.toISOString() });
    }
  }
  report.assets.sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(path.join(destination, "asset-inventory.json"), `${JSON.stringify(report.assets, null, 2)}\n`, "utf8");

  const restoreCheck = path.join(destination, "restore-check");
  fs.mkdirSync(restoreCheck, { recursive: true });
  for (const entry of report.databases) {
    const source = path.join(destination, entry.backup);
    const target = path.join(restoreCheck, entry.backup);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    const summary = tableSummary(target);
    if (JSON.stringify(summary) !== JSON.stringify({ integrity: entry.integrity, quickCheck: entry.quickCheck, tables: entry.tables })) {
      stop(`restore verification differs for ${entry.source}`);
    }
  }
  for (const entry of report.files) {
    const source = path.join(destination, entry.backup);
    const target = path.join(restoreCheck, entry.backup);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    if (sha256(source) !== sha256(target)) stop(`restore verification hash differs for ${entry.source}`);
    if (target.endsWith(".json")) JSON.parse(fs.readFileSync(target, "utf8"));
  }
  report.restoreCheck = { isolatedDirectory: "restore-check", verified: true };
  fs.writeFileSync(path.join(destination, "backup-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const manifestFiles = listFiles(destination, (file) => !file.endsWith("manifest.sha256") && !file.includes(`${path.sep}restore-check${path.sep}`));
  const manifest = manifestFiles.sort().map((file) => `${sha256(file)}  ${path.relative(destination, file).replaceAll("\\", "/")}`);
  fs.writeFileSync(path.join(destination, "manifest.sha256"), `${manifest.join("\n")}\n`, "utf8");
  fs.writeFileSync(path.join(destination, "README.md"), `# 00.02 运行数据备份\n\n- 本备份位于仓库外：${destination}\n- SQLite 使用 VACUUM INTO 生成一致性快照，已在 restore-check 隔离目录中读取验证。\n- 资产仅生成清单，不复制媒体。\n- 恢复前必须停止相关服务、先为当前状态创建新备份、校验 manifest.sha256，再由获得明确授权的人按最小范围恢复。\n- 禁止把本目录加入 Git。\n`, "utf8");
  console.log(`[runtime-backup] OK: ${destination}`);
  console.log(`[runtime-backup] sqlite=${report.databases.length} files=${report.files.length} assets=${report.assets.length}`);
} catch (error) {
  fs.writeFileSync(path.join(destination, "FAILED.txt"), `${error.stack || error.message}\n`, "utf8");
  throw error;
}
