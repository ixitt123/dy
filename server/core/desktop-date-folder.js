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
