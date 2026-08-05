import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-single-instance-r2-01-15-"));
const fixtureDir = path.join(fixtureRoot, "project");
const evidenceIndex = process.argv.indexOf("--evidence-dir");
const evidenceDir = evidenceIndex >= 0 ? path.resolve(process.argv[evidenceIndex + 1] || "") : "";
const results = { generatedAt: new Date().toISOString(), concurrent: {}, reuse: {}, staleRecovery: {}, refresh: {} };
const ownedPids = new Set();
let testCompleted = false;

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function windowsProcessCommandLine(pid) {
  if (process.platform !== "win32") return "";
  const script = [
    `$fixtureProcess = Get-CimInstance Win32_Process -Filter 'ProcessId = ${Number(pid)}' -ErrorAction SilentlyContinue`,
    "if ($null -ne $fixtureProcess) { [Console]::Out.Write($fixtureProcess.CommandLine) }",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5_000,
  });
  return result.status === 0 ? String(result.stdout || "").trim() : "";
}

function fixtureProcessPids() {
  if (process.platform !== "win32") return [...ownedPids].filter(processExists);
  const escapedFixturePath = fixtureDir.replaceAll("'", "''");
  const script = [
    "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue",
    `Where-Object { $_.CommandLine -like '*${escapedFixturePath}*' }`,
    "ForEach-Object { [Console]::Out.WriteLine($_.ProcessId) }",
  ].join(" | ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });
  if (result.status !== 0) return [...ownedPids].filter(processExists);
  return String(result.stdout || "").split(/\r?\n/u).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function waitFor(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

async function stopOwnedProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || !ownedPids.has(pid) || !processExists(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
  await waitFor(() => !processExists(pid), 5_000, `Fixture process ${pid} did not stop.`).catch(() => {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/F"], { encoding: "utf8", windowsHide: true });
    } else {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  });
  await waitFor(() => !processExists(pid), 5_000, `Fixture process ${pid} survived forced cleanup.`);
}

function copyTrackedFixture() {
  fs.mkdirSync(fixtureDir, { recursive: true });
  const listed = spawnSync("git", ["ls-files", "-z"], {
    cwd: sourceDir,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(listed.status, 0, listed.stderr || "Could not list tracked fixture files.");
  for (const relativePath of String(listed.stdout || "").split("\0").filter(Boolean)) {
    if (relativePath === "integrations/moneyprinterturbo" || relativePath.startsWith("integrations/moneyprinterturbo/")) continue;
    const sourcePath = path.join(sourceDir, relativePath);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) continue;
    const targetPath = path.join(fixtureDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
  const fixtureNodeModules = path.join(fixtureDir, "node_modules");
  fs.symlinkSync(path.join(sourceDir, "node_modules"), fixtureNodeModules, process.platform === "win32" ? "junction" : "dir");
}

function launcherEnvironment(runId, port, startupDelayMs = 0) {
  return {
    ...process.env,
    DOUYIN_LAUNCHER_NO_OPEN: "1",
    DOUYIN_LAUNCHER_RUN_ID: runId,
    DOUYIN_LAUNCHER_LOG_MAX_BYTES: "1048576",
    DOUYIN_LAUNCHER_LOG_BACKUPS: "2",
    DOUYIN_UI_PORT_START: String(port),
    DOUYIN_UI_PORT_END: String(port),
    DOUYIN_TEST_UI_STARTUP_DELAY_MS: String(startupDelayMs),
  };
}

function runLauncher(runId, port, startupDelayMs = 0) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(fixtureDir, "launch-ui.mjs")], {
      cwd: fixtureDir,
      env: launcherEnvironment(runId, port, startupDelayMs),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), 30_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ runId, status: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ runId, status: Number.isInteger(code) ? code : 1, signal, stdout, stderr });
    });
  });
}

function launcherRecords() {
  const dataDir = path.join(fixtureDir, ".data");
  if (!fs.existsSync(dataDir)) return [];
  const files = fs.readdirSync(dataDir)
    .filter((name) => /^launcher\.log(?:\.\d+)?$/u.test(name))
    .map((name) => path.join(dataDir, name));
  const records = [];
  for (const filePath of files) {
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter(Boolean)) {
      records.push(JSON.parse(line));
    }
  }
  return records;
}

async function reserveFreePort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => reservation.close(resolve));
  assert.ok(port > 0, "Could not reserve a fixture port.");
  return port;
}

async function readIdentity(url) {
  try {
    const response = await fetch(new URL("/api/runtime/identity", url), { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return null;
    const identity = await response.json();
    return identity?.ready === true ? identity : null;
  } catch {
    return null;
  }
}

async function currentIdentity(timeoutMs = 15_000) {
  return waitFor(async () => {
    try {
      const url = fs.readFileSync(path.join(fixtureDir, "ui-server.url"), "utf8").trim();
      const identity = await readIdentity(url);
      return identity ? { url, identity } : null;
    } catch {
      return null;
    }
  }, timeoutMs, "The fixture runtime did not publish a verified identity.");
}

function registerSpawnedPids(records) {
  for (const record of records) {
    if (record.event === "spawn-server" && Number.isInteger(record.pid) && record.pid > 0) ownedPids.add(record.pid);
  }
}

try {
  copyTrackedFixture();
  const port = await reserveFreePort();
  const concurrentRunIds = Array.from({ length: 20 }, (_value, index) => `single-instance-${index + 1}`);
  const concurrentLaunches = await Promise.all(concurrentRunIds.map((runId) => runLauncher(runId, port, 1_500)));
  assert.ok(concurrentLaunches.every((launch) => launch.status === 0), `Concurrent launch failed: ${JSON.stringify(concurrentLaunches.filter((entry) => entry.status !== 0))}`);

  let records = launcherRecords();
  registerSpawnedPids(records);
  const recordedRunIds = new Set(records.map((record) => record.runId));
  assert.deepEqual([...recordedRunIds].sort(), [...concurrentRunIds].sort(), "Concurrent launcher runIds must not be lost or overwritten.");
  const concurrentSpawns = records.filter((record) => concurrentRunIds.includes(record.runId) && record.event === "spawn-server");
  assert.equal(concurrentSpawns.length, 1, `Concurrent launchers must spawn exactly one backend candidate: ${JSON.stringify(concurrentSpawns)}`);
  const firstRuntime = await currentIdentity();
  ownedPids.add(firstRuntime.identity.pid);
  assert.equal(firstRuntime.identity.pid, Number(fs.readFileSync(path.join(fixtureDir, "ui-server.pid"), "utf8")));
  assert.equal(firstRuntime.url, `http://127.0.0.1:${port}`);
  if (process.platform === "win32") {
    assert.doesNotMatch(windowsProcessCommandLine(firstRuntime.identity.pid), /(?:^|\s)--open(?:\s|$)/u, "NO_OPEN verification must not pass --open to the backend.");
  }

  const oneLiveCandidate = await waitFor(() => {
    const live = [...ownedPids].filter(processExists);
    return live.length === 1 ? live : null;
  }, 10_000, "Concurrent launchers did not converge to one live backend.");
  assert.deepEqual(oneLiveCandidate, [firstRuntime.identity.pid]);
  const stableUrlStat = fs.statSync(path.join(fixtureDir, "ui-server.url"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(fs.readFileSync(path.join(fixtureDir, "ui-server.url"), "utf8").trim(), firstRuntime.url, "A losing instance overwrote the runtime URL.");
  assert.equal(fs.statSync(path.join(fixtureDir, "ui-server.url")).mtimeMs, stableUrlStat.mtimeMs, "The published runtime URL changed after convergence.");
  results.concurrent = {
    launchers: concurrentRunIds.length,
    loggedRunIds: recordedRunIds.size,
    candidatePids: concurrentSpawns.map((record) => record.pid),
    livePids: oneLiveCandidate,
    ownerPid: firstRuntime.identity.pid,
    url: firstRuntime.url,
    instanceId: firstRuntime.identity.instanceId,
  };

  const reuseRunIds = Array.from({ length: 6 }, (_value, index) => `reuse-ready-${index + 1}`);
  const reuseLaunches = await Promise.all(reuseRunIds.map((runId) => runLauncher(runId, port)));
  assert.ok(reuseLaunches.every((launch) => launch.status === 0), "Verified instance reuse must succeed.");
  records = launcherRecords();
  const reuseRecords = records.filter((record) => reuseRunIds.includes(record.runId));
  assert.deepEqual([...new Set(reuseRecords.map((record) => record.runId))].sort(), [...reuseRunIds].sort());
  assert.ok(
    reuseRunIds.every((runId) => reuseRecords.some((record) => record.runId === runId && record.event === "reuse-existing")),
    `Every ready-instance launcher must record reuse-existing: ${JSON.stringify(reuseRecords)}`,
  );
  assert.equal(reuseRecords.some((record) => record.event === "spawn-server"), false, "Ready-instance reuse must not spawn another backend.");
  results.reuse = { launchers: reuseRunIds.length, ownerPid: firstRuntime.identity.pid, spawned: 0 };

  await stopOwnedProcess(firstRuntime.identity.pid);
  fs.writeFileSync(path.join(fixtureDir, "ui-server.pid"), String(firstRuntime.identity.pid), "utf8");
  fs.writeFileSync(path.join(fixtureDir, "ui-server.url"), firstRuntime.url, "utf8");
  const recoveryRunId = "stale-owner-recovery";
  const recoveredLaunch = await runLauncher(recoveryRunId, port);
  assert.equal(recoveredLaunch.status, 0, recoveredLaunch.stderr);
  records = launcherRecords();
  registerSpawnedPids(records);
  const recoveredRuntime = await currentIdentity();
  ownedPids.add(recoveredRuntime.identity.pid);
  assert.notEqual(recoveredRuntime.identity.pid, firstRuntime.identity.pid, "A dead owner PID must be replaced.");
  assert.equal(Number(fs.readFileSync(path.join(fixtureDir, "ui-server.pid"), "utf8")), recoveredRuntime.identity.pid);
  assert.ok(records.some((record) => record.runId === recoveryRunId && record.event === "spawn-server"));
  results.staleRecovery = {
    stalePid: firstRuntime.identity.pid,
    recoveredPid: recoveredRuntime.identity.pid,
    url: recoveredRuntime.url,
    instanceId: recoveredRuntime.identity.instanceId,
  };

  const firstPage = await fetch(recoveredRuntime.url, { headers: { "cache-control": "no-cache" } });
  const secondPage = await fetch(recoveredRuntime.url, { headers: { "cache-control": "no-cache" } });
  assert.equal(firstPage.ok, true, "The recovered root page must load.");
  assert.equal(secondPage.ok, true, "A root-page refresh must keep the recovered runtime available.");
  assert.equal((await readIdentity(recoveredRuntime.url))?.pid, recoveredRuntime.identity.pid);
  results.refresh = { firstStatus: firstPage.status, secondStatus: secondPage.status, ownerPid: recoveredRuntime.identity.pid };

  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "launcher-single-instance.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
    const logDir = path.join(evidenceDir, "launcher-logs");
    fs.mkdirSync(logDir, { recursive: true });
    for (const name of fs.readdirSync(path.join(fixtureDir, ".data")).filter((entry) => /^launcher\.log(?:\.\d+)?$/u.test(entry))) {
      fs.copyFileSync(path.join(fixtureDir, ".data", name), path.join(logDir, name));
    }
  }

  testCompleted = true;
  console.log(`Launcher single-instance concurrency: OK (${concurrentRunIds.length} concurrent, PID ${firstRuntime.identity.pid} -> ${recoveredRuntime.identity.pid})`);
} finally {
  for (const pid of fixtureProcessPids()) ownedPids.add(pid);
  for (const pid of [...ownedPids]) {
    await stopOwnedProcess(pid).catch(() => {});
  }
  try { fs.rmSync(path.join(fixtureDir, "node_modules"), { force: true }); } catch {}
  for (let attempt = 0; attempt < 50 && fs.existsSync(fixtureRoot); attempt += 1) {
    try { fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
    if (fs.existsSync(fixtureRoot)) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (testCompleted) assert.equal(fs.existsSync(fixtureRoot), false, `Fixture cleanup failed: ${fixtureRoot}`);
}
