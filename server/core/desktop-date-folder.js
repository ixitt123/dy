import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DESKTOP_DATE_SUBFOLDERS = Object.freeze(["语文", "数学", "英语", "政策"]);

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

export function createDesktopDateFolder({
  desktopDir = path.join(os.homedir(), "Desktop"),
  now = new Date(),
} = {}) {
  const resolvedDesktop = path.resolve(desktopDir);
  fs.mkdirSync(resolvedDesktop, { recursive: true });
  const dateName = formatLocalDate(now);
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
