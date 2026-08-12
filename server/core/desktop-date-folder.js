import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DESKTOP_DATE_SUBFOLDERS = Object.freeze(["语文", "数学", "英语", "政策"]);

export function normalizeDesktopFolderName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name) throw new TypeError("文件夹名称不能为空");
  if (name.length > 48) throw new TypeError("文件夹名称不能超过 48 个字符");
  if (/[<>:"/\\|?*\u0000-\u001f]/u.test(name)) {
    throw new TypeError('文件夹名称不能包含 < > : " / \\ | ? *');
  }
  if (name === "." || name === ".." || /[. ]$/u.test(name)) {
    throw new TypeError("文件夹名称不能以点或空格结尾");
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name)) {
    throw new TypeError("不能使用系统保留名称");
  }
  return name;
}

function resolveValidatedDesktopNamedFolder({
  desktopDir = path.join(os.homedir(), "Desktop"),
  folderPath,
  suffix,
} = {}) {
  const resolvedDesktop = path.resolve(desktopDir);
  const resolvedFolder = path.resolve(String(folderPath || ""));
  const normalizedSuffix = normalizeDesktopFolderName(suffix);
  const relative = path.relative(resolvedDesktop, resolvedFolder);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("只能操作桌面上的指定文件夹");
  }
  const match = new RegExp(
    `^(\\d{4}-\\d{2}-\\d{2})-${escapeRegExp(normalizedSuffix)}(-\\d+)?$`,
    "u",
  ).exec(path.basename(resolvedFolder));
  if (!match) throw new Error("文件夹名称与当前选择不一致");
  return {
    resolvedDesktop,
    resolvedFolder,
    datePrefix: match[1],
    sequenceSuffix: match[2] || "",
    suffix: normalizedSuffix,
  };
}

function directoryTreeContainsFiles(folderPath) {
  return fs.readdirSync(folderPath, { withFileTypes: true }).some((entry) => {
    if (!entry.isDirectory()) return true;
    return directoryTreeContainsFiles(path.join(folderPath, entry.name));
  });
}

export function renameDesktopNamedFolder({
  desktopDir = path.join(os.homedir(), "Desktop"),
  folderPath,
  fromSuffix,
  toSuffix,
} = {}) {
  const current = resolveValidatedDesktopNamedFolder({
    desktopDir,
    folderPath,
    suffix: fromSuffix,
  });
  if (!fs.existsSync(current.resolvedFolder) || !fs.statSync(current.resolvedFolder).isDirectory()) {
    throw new Error("需要改名的桌面文件夹不存在");
  }
  const normalizedNextSuffix = normalizeDesktopFolderName(toSuffix);
  const nextFolderPath = path.join(
    current.resolvedDesktop,
    `${current.datePrefix}-${normalizedNextSuffix}${current.sequenceSuffix}`,
  );
  if (nextFolderPath !== current.resolvedFolder && fs.existsSync(nextFolderPath)) {
    throw new Error("同名桌面文件夹已经存在");
  }
  if (nextFolderPath !== current.resolvedFolder) fs.renameSync(current.resolvedFolder, nextFolderPath);
  return {
    folderName: path.basename(nextFolderPath),
    folderPath: nextFolderPath,
    suffix: normalizedNextSuffix,
  };
}

export function deleteEmptyDesktopNamedFolder({
  desktopDir = path.join(os.homedir(), "Desktop"),
  folderPath,
  suffix,
} = {}) {
  const current = resolveValidatedDesktopNamedFolder({ desktopDir, folderPath, suffix });
  if (!fs.existsSync(current.resolvedFolder)) {
    return { deleted: false, folderPath: current.resolvedFolder };
  }
  if (!fs.statSync(current.resolvedFolder).isDirectory()) {
    throw new Error("需要删除的路径不是文件夹");
  }
  if (directoryTreeContainsFiles(current.resolvedFolder)) {
    throw new Error("文件夹中已有素材，请先清空文件夹后再删除");
  }
  fs.rmSync(current.resolvedFolder, { recursive: true });
  return { deleted: true, folderPath: current.resolvedFolder };
}

export function formatLocalDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("系统日期无效");
  }
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nextDesktopDateFolderPath(desktopDir, dateName, exists = fs.existsSync) {
  const basePath = path.join(desktopDir, dateName);
  if (!exists(basePath)) return basePath;

  let sequence = 2;
  while (exists(`${basePath}-${sequence}`)) {
    sequence += 1;
  }
  return `${basePath}-${sequence}`;
}

function chatGptImageFileMeta(fileName) {
  const match = String(fileName || "").match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2})_(\d{2})_(\d{2})\s*\(([1-3])\)\.(png|jpe?g|webp)$/iu,
  );
  if (!match) return null;
  const capturedAt = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ).getTime();
  if (!Number.isFinite(capturedAt)) return null;
  return {
    sequence: Number(match[7]),
    capturedAt,
  };
}

function numberedImageFileMeta(fileName, fallbackTime = 0) {
  const name = String(fileName || "");
  const numbered = /\((\d+)\)\.(png|jpe?g|webp)$/iu.exec(name);
  if (!numbered) return null;
  const timestamp = /(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2})_(\d{2})_(\d{2})/u.exec(name);
  const capturedAt = timestamp
    ? new Date(
      Number(timestamp[1]),
      Number(timestamp[2]) - 1,
      Number(timestamp[3]),
      Number(timestamp[4]),
      Number(timestamp[5]),
      Number(timestamp[6]),
    ).getTime()
    : Number(fallbackTime || 0);
  return {
    sequence: Number(numbered[1]),
    extension: `.${numbered[2].toLowerCase()}`,
    capturedAt: Number.isFinite(capturedAt) ? capturedAt : Number(fallbackTime || 0),
  };
}

export function listDesktopImageSequenceFromReference(
  folderPath,
  referenceFileName,
  { maxGapMs = 10_000, maxSequence = 100 } = {},
) {
  const resolvedFolder = path.resolve(String(folderPath || ""));
  if (!resolvedFolder || !fs.existsSync(resolvedFolder) || !fs.statSync(resolvedFolder).isDirectory()) {
    throw new Error("第一张图片所在文件夹不存在");
  }
  const safeReferenceName = path.basename(String(referenceFileName || ""));
  if (!safeReferenceName || safeReferenceName !== String(referenceFileName || "")) {
    throw new Error("第一张图片文件名无效");
  }
  const candidates = fs.readdirSync(resolvedFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(resolvedFolder, entry.name);
      const stats = fs.statSync(filePath);
      const meta = numberedImageFileMeta(entry.name, stats.mtimeMs);
      return meta ? {
        name: entry.name,
        path: filePath,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
        ...meta,
      } : null;
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.capturedAt - right.capturedAt
      || left.sequence - right.sequence
      || left.name.localeCompare(right.name, "zh-CN")
    ));
  const referenceIndex = candidates.findIndex(
    (item) => item.name.toLocaleLowerCase("zh-CN") === safeReferenceName.toLocaleLowerCase("zh-CN"),
  );
  if (referenceIndex < 0) throw new Error("当前桌面文件夹中找不到手动添加的第一张图片");
  const reference = candidates[referenceIndex];
  if (reference.sequence !== 1) throw new Error("第一张图片文件名必须是编号 (1)");
  const sameRound = [reference];
  let previous = reference;
  for (const candidate of candidates.slice(referenceIndex + 1)) {
    if (candidate.extension !== reference.extension) continue;
    if (candidate.sequence === 1) break;
    if (candidate.capturedAt - previous.capturedAt > maxGapMs) break;
    sameRound.push(candidate);
    previous = candidate;
  }
  const upperSequence = Math.min(Math.max(Number(maxSequence || 1), 1), 100);
  const selected = new Map();
  for (const candidate of sameRound) {
    if (candidate.sequence <= 1 || candidate.sequence > upperSequence) continue;
    const existing = selected.get(candidate.sequence);
    if (
      !existing
      || Math.abs(candidate.capturedAt - reference.capturedAt)
        < Math.abs(existing.capturedAt - reference.capturedAt)
    ) {
      selected.set(candidate.sequence, candidate);
    }
  }
  return [...selected.values()].sort((left, right) => left.sequence - right.sequence);
}

export function listLatestDesktopImageBatch(folderPath, { maxGapMs = 10_000 } = {}) {
  const resolvedFolder = path.resolve(String(folderPath || ""));
  if (!resolvedFolder || !fs.existsSync(resolvedFolder) || !fs.statSync(resolvedFolder).isDirectory()) {
    return [];
  }
  const candidates = fs.readdirSync(resolvedFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const meta = chatGptImageFileMeta(entry.name);
      if (!meta) return null;
      const filePath = path.join(resolvedFolder, entry.name);
      const stats = fs.statSync(filePath);
      return {
        name: entry.name,
        path: filePath,
        sequence: meta.sequence,
        capturedAt: meta.capturedAt,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.capturedAt - right.capturedAt || left.sequence - right.sequence);
  if (!candidates.length) return [];

  const groups = [];
  for (const candidate of candidates) {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    if (!previous || candidate.capturedAt - previous.capturedAt > maxGapMs) {
      groups.push([candidate]);
    } else {
      current.push(candidate);
    }
  }
  const latest = groups.at(-1) || [];
  const ordered = [];
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    const item = latest.find((candidate) => candidate.sequence === sequence);
    if (!item) break;
    ordered.push(item);
  }
  return ordered;
}

export function findLatestDesktopNamedFolder({
  desktopDir = path.join(os.homedir(), "Desktop"),
  suffix,
  now = new Date(),
} = {}) {
  const resolvedDesktop = path.resolve(desktopDir);
  const normalizedSuffix = normalizeDesktopFolderName(suffix);
  const baseName = `${formatLocalDate(now)}-${normalizedSuffix}`;
  if (!fs.existsSync(resolvedDesktop)) return "";
  const matches = fs.readdirSync(resolvedDesktop, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = new RegExp(`^${escapeRegExp(baseName)}(?:-(\\d+))?$`, "u").exec(entry.name);
      if (!match) return null;
      const folderPath = path.join(resolvedDesktop, entry.name);
      return {
        folderPath,
        sequence: Number(match[1] || 1),
        updatedAt: fs.statSync(folderPath).mtimeMs,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.sequence - left.sequence || right.updatedAt - left.updatedAt);
  return matches[0]?.folderPath || "";
}

export function findDesktopNamedFolderContainingFile({
  desktopDir = path.join(os.homedir(), "Desktop"),
  suffix,
  fileName,
  now = new Date(),
} = {}) {
  const resolvedDesktop = path.resolve(desktopDir);
  const normalizedSuffix = normalizeDesktopFolderName(suffix);
  const safeFileName = path.basename(String(fileName || ""));
  if (!safeFileName || safeFileName !== String(fileName || "")) return "";
  const baseName = `${formatLocalDate(now)}-${normalizedSuffix}`;
  if (!fs.existsSync(resolvedDesktop)) return "";
  const matches = fs.readdirSync(resolvedDesktop, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = new RegExp(`^${escapeRegExp(baseName)}(?:-(\\d+))?$`, "u").exec(entry.name);
      if (!match) return null;
      const folderPath = path.join(resolvedDesktop, entry.name);
      const referencePath = path.join(folderPath, safeFileName);
      if (!fs.existsSync(referencePath) || !fs.statSync(referencePath).isFile()) return null;
      return {
        folderPath,
        sequence: Number(match[1] || 1),
        updatedAt: fs.statSync(referencePath).mtimeMs,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.updatedAt - left.updatedAt || right.sequence - left.sequence);
  return matches[0]?.folderPath || "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createDesktopDateFolder({
  desktopDir = path.join(os.homedir(), "Desktop"),
  now = new Date(),
  suffix = "",
} = {}) {
  const resolvedDesktop = path.resolve(desktopDir);
  fs.mkdirSync(resolvedDesktop, { recursive: true });
  const normalizedSuffix = String(suffix || "").trim()
    ? normalizeDesktopFolderName(suffix)
    : "";
  const dateName = normalizedSuffix
    ? `${formatLocalDate(now)}-${normalizedSuffix}`
    : formatLocalDate(now);
  const folderPath = nextDesktopDateFolderPath(resolvedDesktop, dateName);

  fs.mkdirSync(folderPath);
  for (const name of DESKTOP_DATE_SUBFOLDERS) {
    fs.mkdirSync(path.join(folderPath, name));
  }

  return {
    folderName: path.basename(folderPath),
    folderPath,
    subfolders: [...DESKTOP_DATE_SUBFOLDERS],
  };
}
