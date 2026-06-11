import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runSync } from "./sync-project.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const urlPath = path.join(__dirname, "ui-server.url");

function openUrl(url) {
  spawn("cmd.exe", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

async function existingServerUrl() {
  try {
    const url = fs.readFileSync(urlPath, "utf8").trim();
    if (!url) return "";
    const response = await fetch(`${url}/api/status`);
    if (response.ok) return url;
  } catch {
    return "";
  }
  return "";
}

let syncChanged = false;
try {
  const syncResult = await runSync({ mode: "startup", quiet: true });
  syncChanged = Boolean(syncResult.changed);
} catch {
  syncChanged = false;
}

const url = syncChanged ? "" : await existingServerUrl();
if (url) {
  openUrl(url);
  process.exit(0);
}

spawn(process.execPath, ["ui-server.mjs", "--open", "--auto-close"], {
  cwd: __dirname,
  detached: true,
  stdio: "ignore",
  windowsHide: true,
}).unref();
