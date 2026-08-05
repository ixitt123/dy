import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const urlPath = path.join(__dirname, "ui-server.url");
const packagePath = path.join(__dirname, "node_modules", "@yc-w-cn", "douyin-mcp-server", "package.json");
const serverEntryPath = path.join(__dirname, "ui-server.mjs");

function spawnDetached(command, args, options) {
  const child = spawn(command, args, options);
  return new Promise((resolve, reject) => {
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
    child.once("error", reject);
  });
}

async function openUrl(url) {
  await spawnDetached("cmd.exe", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
}

async function existingServerUrl() {
  try {
    const url = fs.readFileSync(urlPath, "utf8").trim();
    if (!url) return "";
    // The API requires the browser-only local session cookie. The launcher's
    // liveness probe must use the public HTML entry instead, or every launch
    // falsely looks offline and starts another server on the next port.
    const response = await fetch(url);
    if (response.ok) return url;
  } catch {
    return "";
  }
  return "";
}

async function main() {
  if (!fs.existsSync(packagePath)) {
    console.error("Dependencies are missing. Run pnpm install before launching the workbench.");
    process.exitCode = 2;
    return;
  }

  if (!fs.existsSync(serverEntryPath)) {
    console.error("The ui-server.mjs startup entry is missing. Restore the application files before launching.");
    process.exitCode = 3;
    return;
  }

  const url = await existingServerUrl();
  if (url) {
    await openUrl(url);
    return;
  }

  await spawnDetached(process.execPath, [serverEntryPath, "--open", "--no-auto-close"], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
}

try {
  await main();
} catch (error) {
  console.error(`The UI launcher could not start: ${error?.message || error}`);
  process.exitCode = 1;
}
