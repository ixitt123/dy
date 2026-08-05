import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, ".data");
const logPath = path.join(dataDir, "launcher.log");
const logLockPath = path.join(dataDir, "launcher-log.lock");
const serverLaunchLockPath = path.join(dataDir, "launcher-server.lock");
const serverLaunchOwnerPath = path.join(serverLaunchLockPath, "owner.json");
const urlPath = path.join(__dirname, "ui-server.url");
const pidPath = path.join(__dirname, "ui-server.pid");
const packagePath = path.join(__dirname, "node_modules", "@yc-w-cn", "douyin-mcp-server", "package.json");
const serverEntryPath = path.join(__dirname, "ui-server.mjs");
const runId = String(process.env.DOUYIN_LAUNCHER_RUN_ID || `node-${process.pid}-${Date.now()}`);
const runtimeServiceId = "douyin-local-workbench";

function canonicalPath(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function comparablePath(filePath) {
  const value = canonicalPath(filePath).replaceAll("\\", "/").replace(/\/+$/u, "");
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function currentCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: __dirname,
    encoding: "utf8",
    windowsHide: true,
    timeout: 5_000,
  });
  return result.status === 0 ? String(result.stdout || "").trim() : "unknown";
}

const expectedRuntime = Object.freeze({
  projectRoot: comparablePath(__dirname),
  entryPath: comparablePath(serverEntryPath),
  commit: currentCommit(),
  sourceMtimeMs: fs.existsSync(serverEntryPath) ? fs.statSync(serverEntryPath).mtimeMs : 0,
});

function environmentInteger(name, fallback, minimum, maximum) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

const logMaxBytes = environmentInteger("DOUYIN_LAUNCHER_LOG_MAX_BYTES", 262_144, 512, 10_485_760);
const logBackups = environmentInteger("DOUYIN_LAUNCHER_LOG_BACKUPS", 3, 0, 20);
const logLockStaleMs = environmentInteger("DOUYIN_LAUNCHER_LOG_LOCK_STALE_MS", 30_000, 100, 300_000);
const serverLaunchLockStaleMs = environmentInteger("DOUYIN_LAUNCHER_SERVER_LOCK_STALE_MS", 30_000, 5_000, 300_000);
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

function runtimeOwnerPid() {
  try {
    const pid = Number(fs.readFileSync(pidPath, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : 0;
  } catch {
    return 0;
  }
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function runtimeCommandMatches(commandLine, expectedEntryPath) {
  const command = String(commandLine || "").trim().toLowerCase().replaceAll("\\", "/");
  const entryPath = String(expectedEntryPath || "").trim().toLowerCase().replaceAll("\\", "/");
  return Boolean(command && entryPath && command.includes(entryPath));
}

function windowsProcessCommandLine(pid) {
  const normalizedPid = Number(pid);
  if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) return "";
  const script = [
    `$runtimeProcess = Get-CimInstance Win32_Process -Filter 'ProcessId = ${normalizedPid}' -ErrorAction SilentlyContinue`,
    "if ($null -ne $runtimeProcess) { [Console]::Out.Write($runtimeProcess.CommandLine) }",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5_000,
  });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout || "").trim();
}

function runtimeOwnerMatchesProject(pid) {
  if (!processExists(pid)) return false;
  if (process.platform !== "win32") return true;
  const commandLine = windowsProcessCommandLine(pid);
  return commandLine === null || runtimeCommandMatches(commandLine, serverEntryPath);
}

function parseLocalRuntimeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "http:") return null;
    if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostname)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (!Number.isInteger(Number(url.port)) || Number(url.port) <= 0 || Number(url.port) > 65_535) return null;
    url.pathname = "/";
    return url;
  } catch {
    return null;
  }
}

function runtimeIdentityMatches(identity, baseUrl) {
  const ownerPid = runtimeOwnerPid();
  const pid = Number(identity?.pid);
  const sourceMtimeMs = Number(identity?.sourceMtimeMs);
  if (!identity || identity.ok !== true || identity.service !== runtimeServiceId || identity.protocolVersion !== 1) return false;
  if (identity.ready !== true || typeof identity.instanceId !== "string" || identity.instanceId.length < 16) return false;
  if (!Number.isInteger(pid) || pid <= 0 || !ownerPid || pid !== ownerPid || !processExists(pid)) return false;
  if (comparablePath(identity.projectRoot) !== expectedRuntime.projectRoot) return false;
  if (comparablePath(identity.entryPath) !== expectedRuntime.entryPath) return false;
  if (!identity.commit || identity.commit !== expectedRuntime.commit) return false;
  if (!Number.isFinite(sourceMtimeMs) || Math.abs(sourceMtimeMs - expectedRuntime.sourceMtimeMs) > 1) return false;
  const reportedUrl = parseLocalRuntimeUrl(identity.url);
  return Boolean(reportedUrl && reportedUrl.origin === baseUrl.origin);
}

async function probeRuntimeIdentity(value) {
  const baseUrl = parseLocalRuntimeUrl(value);
  if (!baseUrl) return { status: "pending" };
  try {
    const identityUrl = new URL("/api/runtime/identity", baseUrl);
    const response = await fetch(identityUrl, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return { status: "mismatch" };
    const identity = await response.json();
    return runtimeIdentityMatches(identity, baseUrl)
      ? { status: "verified", url: baseUrl.origin, identity }
      : { status: "mismatch", identity };
  } catch {
    return { status: "pending" };
  }
}

function clearStaleUrl() {
  try {
    fs.rmSync(urlPath, { force: true });
  } catch {
    // Spawning the current project remains the safe fallback if cleanup races.
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

async function existingServerRuntime() {
  const initialOwnerPid = runtimeOwnerPid();
  const ownerMatchesProject = initialOwnerPid > 0 && runtimeOwnerMatchesProject(initialOwnerPid);
  const deadline = Date.now() + (ownerMatchesProject ? 5_000 : 0);
  let lastUrl = readCurrentUrl();

  do {
    const ownerPid = runtimeOwnerPid();
    if (ownerPid !== initialOwnerPid || (ownerMatchesProject && !processExists(ownerPid))) break;
    lastUrl = readCurrentUrl() || lastUrl;
    if (lastUrl) {
      const runtime = await probeRuntimeIdentity(lastUrl);
      if (runtime.status === "verified") return runtime;
      if (runtime.status === "mismatch") {
        if (ownerMatchesProject) {
          logEvent("runtime-conflict", {
            pid: ownerPid,
            url: lastUrl,
            message: "A live backend from this project owns the lock but its runtime identity does not match; refusing to spawn a duplicate.",
          });
          return { status: "conflict", pid: ownerPid, url: lastUrl };
        }
        clearStaleUrl();
        logEvent("reject-existing", {
          pid: ownerPid || process.pid,
          url: lastUrl,
          message: "Rejected a stale or foreign UI URL because its project identity, commit, PID, or health did not match.",
        });
        return null;
      }
    }
    if (!ownerMatchesProject || Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (true);

  if (initialOwnerPid > 0 && runtimeOwnerPid() === initialOwnerPid && runtimeOwnerMatchesProject(initialOwnerPid)) {
    logEvent("reuse-starting", {
      pid: initialOwnerPid,
      url: lastUrl || null,
      message: "A verified project backend owns the runtime lock and is still starting; no duplicate server was spawned.",
    });
    return { status: "pending", pid: initialOwnerPid, url: lastUrl || null };
  }

  if (lastUrl) {
    clearStaleUrl();
    logEvent("reject-existing", {
      pid: initialOwnerPid || process.pid,
      url: lastUrl,
      message: "Rejected a stale UI URL because no live matching project backend owned it.",
    });
  }
  return null;
}

function readServerLaunchOwner() {
  try {
    const stat = fs.statSync(serverLaunchLockPath);
    try {
      const owner = JSON.parse(fs.readFileSync(serverLaunchOwnerPath, "utf8"));
      return {
        exists: true,
        ownerReadable: true,
        pid: Number(owner?.pid) || 0,
        runId: String(owner?.runId || ""),
        createdAt: String(owner?.createdAt || ""),
        mtimeMs: stat.mtimeMs,
      };
    } catch {
      return { exists: true, ownerReadable: false, pid: 0, runId: "", createdAt: "", mtimeMs: stat.mtimeMs };
    }
  } catch {
    return null;
  }
}

function sameServerLaunchOwner(left, right) {
  if (!left || !right || left.exists !== true || right.exists !== true) return false;
  if (left.ownerReadable !== right.ownerReadable) return false;
  if (!left.ownerReadable) return left.mtimeMs === right.mtimeMs;
  return left.pid === right.pid && left.runId === right.runId;
}

function reclaimStaleServerLaunchLock() {
  const owner = readServerLaunchOwner();
  if (!owner) return false;
  const ageMs = Date.now() - owner.mtimeMs;
  if (!owner.ownerReadable && ageMs <= serverLaunchLockStaleMs) return false;
  if (owner?.pid > 0 && processExists(owner.pid) && ageMs <= serverLaunchLockStaleMs) return false;
  const confirmation = readServerLaunchOwner();
  if (!sameServerLaunchOwner(owner, confirmation)) return false;
  const quarantinePath = `${serverLaunchLockPath}.stale-${process.pid}-${Date.now()}`;
  try {
    fs.renameSync(serverLaunchLockPath, quarantinePath);
    fs.rmSync(quarantinePath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function tryAcquireServerLaunchLock() {
  fs.mkdirSync(dataDir, { recursive: true });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      fs.mkdirSync(serverLaunchLockPath);
      try {
        fs.writeFileSync(serverLaunchOwnerPath, `${JSON.stringify({ pid: process.pid, runId, createdAt: new Date().toISOString() })}\n`, "utf8");
        return true;
      } catch (error) {
        fs.rmSync(serverLaunchLockPath, { recursive: true, force: true });
        throw error;
      }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (!reclaimStaleServerLaunchLock()) return false;
    }
  }
  return false;
}

function releaseServerLaunchLock() {
  const owner = readServerLaunchOwner();
  if (!owner || owner.pid !== process.pid || owner.runId !== runId) return false;
  try {
    fs.rmSync(serverLaunchLockPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function waitForServerLaunchTurn(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = readCurrentUrl();
    if (url) {
      const runtime = await probeRuntimeIdentity(url);
      if (runtime.status === "verified") return { acquired: false, runtime };
    }
    if (tryAcquireServerLaunchLock()) {
      const existingRuntime = await existingServerRuntime();
      if (existingRuntime) {
        releaseServerLaunchLock();
        return { acquired: false, runtime: existingRuntime };
      }
      return { acquired: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const owner = readServerLaunchOwner();
  return { acquired: false, pendingPid: runtimeOwnerPid() || owner?.pid || 0 };
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

  const existingRuntime = await existingServerRuntime();
  if (existingRuntime?.status === "pending") return;
  if (existingRuntime?.status === "conflict") {
    const message = `A different live build of this project already owns the UI runtime (PID ${existingRuntime.pid}). Stop it before starting this build.`;
    console.error(message);
    process.exitCode = 4;
    return;
  }
  if (existingRuntime) {
    logEvent("reuse-existing", {
      pid: existingRuntime.identity.pid,
      url: existingRuntime.url,
      message: `Reusing verified instance ${existingRuntime.identity.instanceId} at commit ${existingRuntime.identity.commit}.`,
    });
    await openUrl(existingRuntime.url);
    return;
  }

  const launchTurn = await waitForServerLaunchTurn();
  if (launchTurn.runtime?.status === "pending") return;
  if (launchTurn.runtime?.status === "conflict") {
    const message = `A different live build of this project already owns the UI runtime (PID ${launchTurn.runtime.pid}). Stop it before starting this build.`;
    console.error(message);
    process.exitCode = 4;
    return;
  }
  if (launchTurn.runtime) {
    logEvent("reuse-existing", {
      pid: launchTurn.runtime.identity.pid,
      url: launchTurn.runtime.url,
      message: `Reused the instance started by a concurrent launcher (${launchTurn.runtime.identity.instanceId}).`,
    });
    await openUrl(launchTurn.runtime.url);
    return;
  }
  if (!launchTurn.acquired) {
    logEvent("reuse-starting", {
      pid: launchTurn.pendingPid || process.pid,
      url: readCurrentUrl() || null,
      message: "Another launcher still owns the bounded server-start turn; no duplicate server was spawned.",
    });
    return;
  }

  try {
    const previousUrl = urlState();
    const serverArgs = [serverEntryPath, "--no-auto-close"];
    if (process.env.DOUYIN_LAUNCHER_NO_OPEN !== "1") serverArgs.push("--open");
    const child = await spawnDetached(process.execPath, serverArgs, {
      cwd: __dirname,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    const startedUrl = await waitForUpdatedUrl(previousUrl, 15_000);
    logEvent("spawn-server", {
      pid: child.pid,
      url: startedUrl || null,
      message: startedUrl ? "Started a new local UI service." : "Started a new local UI service; URL is pending.",
    });
  } finally {
    releaseServerLaunchLock();
  }
}

try {
  await main();
} catch (error) {
  const message = `The UI launcher could not start: ${error?.message || error}`;
  logEvent("launcher-error", { message });
  console.error(message);
  process.exitCode = 1;
}
