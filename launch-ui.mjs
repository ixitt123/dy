import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, ".data");
const logPath = path.join(dataDir, "launcher.log");
const logLockPath = path.join(dataDir, "launcher-log.lock");
const startLockPath = path.join(dataDir, "launcher-start.lock");
const startLockOwnerPath = path.join(startLockPath, "owner.json");
const urlPath = path.join(__dirname, "ui-server.url");
const pidPath = path.join(__dirname, "ui-server.pid");
const identityStatePath = path.join(dataDir, "ui-server.identity.json");
const verifiedRuntimePath = path.join(dataDir, "launcher-verified-runtime.json");
const legacyIdentityStatePath = path.join(__dirname, "ui-server.identity.json");
const packagePath = path.join(__dirname, "node_modules", "@yc-w-cn", "douyin-mcp-server", "package.json");
const serverEntryPath = path.join(__dirname, "ui-server.mjs");
const runtimeIdentityRoute = "/.well-known/douyin-runtime";
const runId = String(process.env.DOUYIN_LAUNCHER_RUN_ID || `node-${process.pid}-${Date.now()}`);

function environmentInteger(name, fallback, minimum, maximum) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

const logMaxBytes = environmentInteger("DOUYIN_LAUNCHER_LOG_MAX_BYTES", 262_144, 512, 10_485_760);
const logBackups = environmentInteger("DOUYIN_LAUNCHER_LOG_BACKUPS", 3, 0, 20);
const logLockStaleMs = environmentInteger("DOUYIN_LAUNCHER_LOG_LOCK_STALE_MS", 30_000, 100, 300_000);
const startLockTimeoutMs = environmentInteger("DOUYIN_LAUNCHER_START_LOCK_TIMEOUT_MS", 30_000, 1_000, 120_000);
const startLockMissingOwnerStaleMs = environmentInteger("DOUYIN_LAUNCHER_START_LOCK_MISSING_OWNER_STALE_MS", 30_000, 1_000, 300_000);
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedProjectRoot(projectRoot) {
  const canonical = fs.realpathSync.native(projectRoot);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

let expectedIdentityCache;
function expectedRuntimeIdentity() {
  if (expectedIdentityCache) return expectedIdentityCache;
  const commit = String(spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: __dirname,
    encoding: "utf8",
    windowsHide: true,
  }).stdout || "").trim() || "unknown";
  expectedIdentityCache = {
    protocolVersion: 1,
    projectRootSha256: sha256(normalizedProjectRoot(__dirname)),
    sourceSha256: sha256(fs.readFileSync(serverEntryPath)),
    commit,
  };
  return expectedIdentityCache;
}

function normalizeRuntimeUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(hostname)) return "";
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return "";
    if (parsed.pathname !== "/" && parsed.pathname !== "") return "";
    const port = Number(parsed.port || 80);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function readRuntimePid() {
  try {
    const pid = Number(fs.readFileSync(pidPath, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : 0;
  } catch {
    return 0;
  }
}

function readIdentityState() {
  try {
    const state = JSON.parse(fs.readFileSync(identityStatePath, "utf8"));
    return state && typeof state === "object" ? state : null;
  } catch {
    return null;
  }
}

function readVerifiedRuntime() {
  try {
    const state = JSON.parse(fs.readFileSync(verifiedRuntimePath, "utf8"));
    return state && typeof state === "object" ? state : null;
  } catch {
    return null;
  }
}

function writeVerifiedRuntime(probe) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(verifiedRuntimePath, `${JSON.stringify({
    ...expectedRuntimeIdentity(),
    instanceId: probe.identity.instanceId,
    pid: probe.identity.pid,
    url: probe.url,
    verifiedAt: new Date().toISOString(),
    verifiedByRunId: runId,
  })}\n`, "utf8");
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLauncherStartLock() {
  try {
    const stat = fs.statSync(startLockPath);
    let owner = null;
    try {
      owner = JSON.parse(fs.readFileSync(startLockOwnerPath, "utf8"));
    } catch {}
    return { owner: owner && typeof owner === "object" ? owner : null, mtimeMs: stat.mtimeMs };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function recoverLauncherStartLock(observed) {
  if (!observed) return false;
  const ownerPid = Number(observed.owner?.pid || 0);
  if (ownerPid > 0 && processIsAlive(ownerPid)) return false;
  if (!ownerPid && Date.now() - observed.mtimeMs <= startLockMissingOwnerStaleMs) return false;

  const latest = readLauncherStartLock();
  if (!latest) return true;
  if (observed.owner) {
    if (String(latest.owner?.runId || "") !== String(observed.owner.runId || "")
      || Number(latest.owner?.pid || 0) !== ownerPid
      || Number(latest.owner?.createdAt || 0) !== Number(observed.owner.createdAt || 0)) return false;
    if (ownerPid > 0 && processIsAlive(ownerPid)) return false;
  } else if (latest.owner || latest.mtimeMs !== observed.mtimeMs
    || Date.now() - latest.mtimeMs <= startLockMissingOwnerStaleMs) return false;

  const recoveryPath = `${startLockPath}.recover-${process.pid}-${sha256(`${runId}-${Date.now()}`).slice(0, 12)}`;
  try {
    fs.renameSync(startLockPath, recoveryPath);
  } catch (error) {
    if (["ENOENT", "EEXIST", "EPERM"].includes(error?.code)) return false;
    throw error;
  }
  try {
    fs.rmSync(recoveryPath, { recursive: true, force: true });
  } catch {}
  logEvent("recover-start-lock", {
    pid: ownerPid || 0,
    url: null,
    message: ownerPid ? `Recovered launcher lock from dead PID ${ownerPid}.` : "Recovered stale launcher lock with no owner record.",
  });
  return true;
}

async function acquireLauncherStartLock() {
  fs.mkdirSync(dataDir, { recursive: true });
  const deadline = Date.now() + startLockTimeoutMs;
  let observed = null;
  let nextRuntimeProbeAt = 0;
  while (Date.now() < deadline) {
    try {
      fs.mkdirSync(startLockPath);
      const owner = { pid: process.pid, runId, createdAt: Date.now(), createdAtIso: new Date().toISOString() };
      try {
        fs.writeFileSync(startLockOwnerPath, `${JSON.stringify(owner)}\n`, { encoding: "utf8", flag: "wx" });
      } catch (error) {
        try { fs.rmSync(startLockPath, { recursive: true, force: true }); } catch {}
        throw error;
      }
      logEvent("acquire-start-lock", { message: "Acquired the launcher startup transaction lock." });
      return { owner, existing: null };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      observed = readLauncherStartLock();
      if (recoverLauncherStartLock(observed)) continue;
      if (Date.now() >= nextRuntimeProbeAt) {
        const verified = readVerifiedRuntime();
        const candidateUrl = readCurrentUrl();
        if (verified && candidateUrl
          && normalizeRuntimeUrl(verified.url) === normalizeRuntimeUrl(candidateUrl)
          && processIsAlive(Number(verified.pid || 0))) {
          const existing = await probeRuntimeUrl(candidateUrl);
          if (existing.ok) return { owner: null, existing };
        }
        nextRuntimeProbeAt = Date.now() + 500;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  const owner = observed?.owner;
  throw new Error(`Timed out waiting for the launcher startup transaction lock${owner?.pid ? ` held by PID ${owner.pid}` : ""}.`);
}

function releaseLauncherStartLock(owner) {
  const current = readLauncherStartLock();
  if (!current) return;
  if (String(current.owner?.runId || "") !== String(owner?.runId || "")) {
    logEvent("reject-start-lock-release", { url: null, message: "The launcher lock owner changed before release." });
    return;
  }
  const releasePath = `${startLockPath}.release-${process.pid}-${sha256(`${runId}-${Date.now()}`).slice(0, 12)}`;
  try {
    fs.renameSync(startLockPath, releasePath);
    fs.rmSync(releasePath, { recursive: true, force: true });
    logEvent("release-start-lock", { message: "Released the launcher startup transaction lock." });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function processMatchesExpectedServer(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || !processIsAlive(pid)) return false;
  if (process.platform !== "win32") return true;
  const script = [
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    `$runtimeProcess = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' -ErrorAction SilentlyContinue`,
    "if ($null -ne $runtimeProcess) { [Console]::Out.Write($runtimeProcess.CommandLine) }",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5_000,
  });
  if (result.error || result.status !== 0) return false;
  const command = String(result.stdout || "").trim().toLowerCase().replaceAll("\\", "/");
  const expected = serverEntryPath.toLowerCase().replaceAll("\\", "/");
  return Boolean(command && command.includes(expected));
}

async function probeRuntimeUrl(candidateUrl) {
  const url = normalizeRuntimeUrl(candidateUrl);
  if (!url) return { ok: false, url: "", reason: "invalid-loopback-url", identity: null };
  try {
    const response = await fetch(new URL(runtimeIdentityRoute, `${url}/`), {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return { ok: false, url, reason: `identity-http-${response.status}`, identity: null };
    if (!String(response.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      return { ok: false, url, reason: "identity-content-type", identity: null };
    }
    const identity = await response.json();
    const expected = expectedRuntimeIdentity();
    if (!identity || identity.ok !== true || identity.protocolVersion !== expected.protocolVersion) {
      return { ok: false, url, reason: "identity-protocol", identity };
    }
    for (const field of ["projectRootSha256", "sourceSha256", "commit"]) {
      if (String(identity[field] || "") !== expected[field]) return { ok: false, url, reason: `identity-${field}`, identity };
    }
    if (!String(identity.instanceId || "").trim()) return { ok: false, url, reason: "identity-instance", identity };
    if (identity.health !== "ready") return { ok: false, url, reason: `identity-health-${identity.health || "missing"}`, identity };
    const pid = Number(identity.pid);
    if (!Number.isInteger(pid) || pid <= 0 || !processIsAlive(pid)) {
      return { ok: false, url, reason: "identity-pid", identity };
    }
    const verified = readVerifiedRuntime();
    const verifiedMatches = verified
      && verified.protocolVersion === expected.protocolVersion
      && verified.projectRootSha256 === expected.projectRootSha256
      && verified.sourceSha256 === expected.sourceSha256
      && verified.commit === expected.commit
      && verified.instanceId === identity.instanceId
      && Number(verified.pid) === pid
      && normalizeRuntimeUrl(verified.url) === url;
    const probe = { ok: true, url, reason: "", identity: { ...identity, pid } };
    if (!verifiedMatches) writeVerifiedRuntime(probe);
    return probe;
  } catch (error) {
    return { ok: false, url, reason: `identity-unreachable-${error?.name || "error"}`, identity: null };
  }
}

function removeRuntimeFile(filePath) {
  try { fs.rmSync(filePath, { force: true }); } catch {}
}

async function stopExpectedRuntime(pid) {
  if (!processMatchesExpectedServer(pid)) return false;
  try { process.kill(pid, "SIGTERM"); } catch { return !processIsAlive(pid); }
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !processIsAlive(pid);
}

async function clearInvalidRuntimeState() {
  const state = readIdentityState();
  const pids = [...new Set([Number(state?.pid || 0), readRuntimePid()].filter((pid) => Number.isInteger(pid) && pid > 0))];
  for (const pid of pids) {
    if (processMatchesExpectedServer(pid)) await stopExpectedRuntime(pid);
  }
  removeRuntimeFile(urlPath);
  removeRuntimeFile(identityStatePath);
  removeRuntimeFile(verifiedRuntimePath);
  removeRuntimeFile(legacyIdentityStatePath);
  const ownerPid = readRuntimePid();
  if (!ownerPid || !processMatchesExpectedServer(ownerPid)) removeRuntimeFile(pidPath);
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

async function waitForUpdatedUrl(previous, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = null;
  while (Date.now() < deadline) {
    const current = urlState();
    if (current.url && (current.url !== previous.url || current.mtimeMs > previous.mtimeMs)) {
      const probe = await probeRuntimeUrl(current.url);
      if (probe.ok) return probe;
      lastProbe = probe;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (lastProbe) {
    logEvent("reject-started", {
      pid: Number(lastProbe.identity?.pid || 0),
      url: lastProbe.url || null,
      message: `The started UI service was not verified: ${lastProbe.reason}.`,
    });
  }
  return null;
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
  const state = readIdentityState();
  const candidates = [...new Set([readCurrentUrl(), String(state?.url || "").trim()].filter(Boolean))];
  for (const candidate of candidates) {
    const probe = await probeRuntimeUrl(candidate);
    if (probe.ok) {
      fs.writeFileSync(urlPath, probe.url, "utf8");
      fs.writeFileSync(pidPath, String(probe.identity.pid), "utf8");
      return probe;
    }
    logEvent("reject-existing", {
      pid: Number(probe.identity?.pid || 0),
      url: normalizeRuntimeUrl(candidate) || null,
      message: `Rejected saved UI service: ${probe.reason}.`,
    });
  }
  await clearInvalidRuntimeState();
  return null;
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

  const startLock = await acquireLauncherStartLock();
  if (startLock.existing) {
    logEvent("reuse-existing", {
      pid: startLock.existing.identity.pid,
      url: startLock.existing.url,
      message: `Reusing verified UI instance ${startLock.existing.identity.instanceId} while another launcher owns the startup transaction.`,
    });
    await openUrl(startLock.existing.url);
    return;
  }
  try {
    const existing = await existingServerUrl();
    if (existing) {
      logEvent("reuse-existing", {
        pid: existing.identity.pid,
        url: existing.url,
        message: `Reusing verified UI instance ${existing.identity.instanceId}.`,
      });
      await openUrl(existing.url);
      return;
    }

    const previousUrl = urlState();
    const child = await spawnDetached(process.execPath, [serverEntryPath, "--no-auto-close"], {
      cwd: __dirname,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    const started = await waitForUpdatedUrl(previousUrl);
    logEvent("spawn-server", {
      pid: started?.identity.pid || child.pid,
      url: started?.url || null,
      message: started
        ? `Started verified UI instance ${started.identity.instanceId}.`
        : "The new local UI service did not publish a verified identity in time.",
    });
    if (!started) throw new Error("The new UI service failed project identity and health verification.");
    await openUrl(started.url);
  } finally {
    releaseLauncherStartLock(startLock.owner);
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
