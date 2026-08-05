import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, ".data");
const logPath = path.join(dataDir, "launcher.log");
const logLockPath = path.join(dataDir, "launcher-log.lock");
const urlPath = path.join(__dirname, "ui-server.url");
const packagePath = path.join(__dirname, "node_modules", "@yc-w-cn", "douyin-mcp-server", "package.json");
const serverEntryPath = path.join(__dirname, "ui-server.mjs");
const runId = String(process.env.DOUYIN_LAUNCHER_RUN_ID || `node-${process.pid}-${Date.now()}`);

function environmentInteger(name, fallback, minimum, maximum) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

const logMaxBytes = environmentInteger("DOUYIN_LAUNCHER_LOG_MAX_BYTES", 262_144, 512, 10_485_760);
const logBackups = environmentInteger("DOUYIN_LAUNCHER_LOG_BACKUPS", 3, 0, 20);
const logLockStaleMs = environmentInteger("DOUYIN_LAUNCHER_LOG_LOCK_STALE_MS", 30_000, 100, 300_000);
const lockWaitArray = new Int32Array(new SharedArrayBuffer(4));

function acquireLogLock() {
  fs.mkdirSync(dataDir, { recursive: true });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      fs.mkdirSync(logLockPath);
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const lock = fs.statSync(logLockPath);
        if (Date.now() - lock.mtimeMs > logLockStaleMs) {
          fs.rmdirSync(logLockPath);
          continue;
        }
      } catch (lockError) {
        if (lockError?.code !== "ENOENT" && lockError?.code !== "ENOTEMPTY") throw lockError;
      }
      Atomics.wait(lockWaitArray, 0, 0, 15);
    }
  }
  return false;
}

function rotateLogsIfNeeded(nextBytes) {
  const currentBytes = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  if (!currentBytes || currentBytes + nextBytes <= logMaxBytes) return;
  if (logBackups === 0) {
    fs.rmSync(logPath, { force: true });
    return;
  }
  for (let index = logBackups; index >= 1; index -= 1) {
    const source = index === 1 ? logPath : `${logPath}.${index - 1}`;
    const target = `${logPath}.${index}`;
    if (!fs.existsSync(source)) continue;
    fs.rmSync(target, { force: true });
    fs.renameSync(source, target);
  }
}

function readCurrentUrl() {
  try {
    return fs.readFileSync(urlPath, "utf8").trim();
  } catch {
    return "";
  }
}

function logEvent(event, { pid = process.pid, url = readCurrentUrl() || null, message = "" } = {}) {
  let locked = false;
  try {
    locked = acquireLogLock();
    if (!locked) {
      console.warn("Launcher log lock was not acquired; the event could not be recorded.");
      return false;
    }
    const line = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      project: __dirname,
      pid,
      url,
      runId,
      message,
    })}\n`;
    rotateLogsIfNeeded(Buffer.byteLength(line));
    fs.appendFileSync(logPath, line, "utf8");
    return true;
  } catch (error) {
    console.warn(`Launcher log write failed: ${error?.message || error}`);
    return false;
  } finally {
    if (locked) {
      try {
        fs.rmdirSync(logLockPath);
      } catch (error) {
        console.warn(`Launcher log lock release failed: ${error?.message || error}`);
      }
    }
  }
}

function urlState() {
  try {
    const stat = fs.statSync(urlPath);
    return { url: readCurrentUrl(), mtimeMs: stat.mtimeMs };
  } catch {
    return { url: "", mtimeMs: 0 };
  }
}

async function waitForUpdatedUrl(previous, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = urlState();
    if (current.url && (current.url !== previous.url || current.mtimeMs > previous.mtimeMs)) return current.url;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return "";
}

function spawnDetached(command, args, options) {
  const child = spawn(command, args, options);
  return new Promise((resolve, reject) => {
    child.once("spawn", () => {
      child.unref();
      resolve(child);
    });
    child.once("error", reject);
  });
}

async function openUrl(url) {
  if (process.env.DOUYIN_LAUNCHER_NO_OPEN === "1") return;
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
  logEvent("launcher-start", { message: "The Node UI launcher started." });
  if (!fs.existsSync(packagePath)) {
    const message = "Dependencies are missing. Run pnpm install before launching the workbench.";
    logEvent("preflight-error", { url: null, message });
    console.error(message);
    process.exitCode = 2;
    return;
  }

  if (!fs.existsSync(serverEntryPath)) {
    const message = "The ui-server.mjs startup entry is missing. Restore the application files before launching.";
    logEvent("preflight-error", { url: null, message });
    console.error(message);
    process.exitCode = 3;
    return;
  }

  const url = await existingServerUrl();
  if (url) {
    logEvent("reuse-existing", { url, message: "Reusing the responsive local UI service." });
    await openUrl(url);
    return;
  }

  const previousUrl = urlState();
  const child = await spawnDetached(process.execPath, [serverEntryPath, "--open", "--no-auto-close"], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  const startedUrl = await waitForUpdatedUrl(previousUrl);
  logEvent("spawn-server", {
    pid: child.pid,
    url: startedUrl || null,
    message: startedUrl ? "Started a new local UI service." : "Started a new local UI service; URL is pending.",
  });
}

try {
  await main();
} catch (error) {
  const message = `The UI launcher could not start: ${error?.message || error}`;
  logEvent("launcher-error", { message });
  console.error(message);
  process.exitCode = 1;
}
