import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function backupPathFor(filePath) {
  return `${filePath}.bak`;
}

function uniqueSidecar(filePath, suffix) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  return path.join(dir, `.${base}.${process.pid}.${randomUUID()}.${suffix}`);
}

function fsyncFile(filePath) {
  // Windows rejects fsync on a read-only handle with EPERM. Open the copied
  // sidecar read/write so durability is enforced before the atomic rename.
  const fd = fs.openSync(filePath, "r+");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function replaceBackupAtomic(filePath) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = backupPathFor(filePath);
  const backupTemp = uniqueSidecar(backupPath, "tmp");
  try {
    fs.copyFileSync(filePath, backupTemp);
    fsyncFile(backupTemp);
    fs.renameSync(backupTemp, backupPath);
  } finally {
    try { if (fs.existsSync(backupTemp)) fs.unlinkSync(backupTemp); } catch {}
  }
}

function writeAtomic(filePath, value, encoding, { backup = true } = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = uniqueSidecar(filePath, "tmp");
  let fd = null;
  try {
    fd = fs.openSync(tempPath, "wx");
    fs.writeFileSync(fd, value, encoding);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    if (backup) replaceBackupAtomic(filePath);
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
  }
}

export function writeJsonAtomic(filePath, data, options = {}) {
  const replacer = options.replacer;
  const space = options.space ?? 2;
  const json = JSON.stringify(data, replacer, space);
  return writeTextAtomic(filePath, json, options);
}

export function writeTextAtomic(filePath, text, options = {}) {
  return writeAtomic(filePath, text, "utf8", options);
}

export function writeBufferAtomic(filePath, buffer, options = {}) {
  return writeAtomic(filePath, buffer, undefined, { backup: false, ...options });
}

export function readJsonWithRecovery(filePath, options = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (primaryError) {
    const backupPath = backupPathFor(filePath);
    try {
      const raw = fs.readFileSync(backupPath, "utf8");
      const recovered = JSON.parse(raw);
      if (options.restore !== false) writeTextAtomic(filePath, raw, { backup: false });
      return recovered;
    } catch (backupError) {
      if (Object.prototype.hasOwnProperty.call(options, "fallback")) return options.fallback;
      throw new AggregateError([primaryError, backupError], `JSON 主文件和备份均不可读取：${filePath}`);
    }
  }
}
