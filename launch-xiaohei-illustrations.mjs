import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const urlFile = path.join(baseDir, "ui-server.url");
const pagePath = "/xiaohei-illustrations.html";

function openUrl(url) {
  spawn("cmd.exe", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

async function probe(url) {
  try {
    const response = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function currentServerUrl() {
  try {
    const saved = fs.readFileSync(urlFile, "utf8").trim();
    if (saved && await probe(saved)) return saved;
  } catch {
    // ignore stale url file
  }
  for (let port = 8787; port < 8800; port += 1) {
    const url = `http://127.0.0.1:${port}`;
    if (await probe(url)) return url;
  }
  return "";
}

function startServerHidden() {
  spawn(process.execPath, ["ui-server.mjs"], {
    cwd: baseDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    const url = await currentServerUrl();
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return "";
}

let url = await currentServerUrl();
if (!url) {
  startServerHidden();
  url = await waitForServer();
}

if (url) {
  openUrl(`${url}${pagePath}`);
}
