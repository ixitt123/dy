import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

const url = await existingServerUrl();
if (url) {
  openUrl(url);
  process.exit(0);
}

spawn(process.execPath, ["ui-server.mjs", "--open"], {
  cwd: __dirname,
  detached: true,
  stdio: "ignore",
  windowsHide: true,
}).unref();
