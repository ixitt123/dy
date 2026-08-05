import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("Launcher log rotation: skipped (Windows only)");
  process.exit(0);
}

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-launcher-log-r2-01-13-"));
const cscript = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cscript.exe");
const evidenceIndex = process.argv.indexOf("--evidence-dir");
const evidenceDir = evidenceIndex >= 0 ? path.resolve(process.argv[evidenceIndex + 1] || "") : "";
const results = [];

function writePackage(fixtureDir) {
  const packageDir = path.join(fixtureDir, "node_modules", "@yc-w-cn", "douyin-mcp-server");
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), "{}\n", "utf8");
}

function makeFixture(name, { packagePresent = true, vbs = true, launcher = true, server = false } = {}) {
  const fixtureDir = path.join(fixtureRoot, name);
  fs.mkdirSync(fixtureDir, { recursive: true });
  if (vbs) fs.copyFileSync(path.join(sourceDir, "start-ui-hidden.vbs"), path.join(fixtureDir, "start-ui-hidden.vbs"));
  if (launcher) fs.copyFileSync(path.join(sourceDir, "launch-ui.mjs"), path.join(fixtureDir, "launch-ui.mjs"));
  if (packagePresent) writePackage(fixtureDir);
  if (server) {
    fs.writeFileSync(
      path.join(fixtureDir, "ui-server.mjs"),
      [
        'import fs from "node:fs";',
        'fs.writeFileSync(new URL("./ui-server.url", import.meta.url), "http://127.0.0.1:48787", "utf8");',
      ].join("\n"),
      "utf8",
    );
  }
  return fixtureDir;
}

function launcherEnv(runId, overrides = {}) {
  return {
    ...process.env,
    DOUYIN_LAUNCHER_RUN_ID: runId,
    DOUYIN_LAUNCHER_LOG_MAX_BYTES: "1048576",
    DOUYIN_LAUNCHER_LOG_BACKUPS: "3",
    DOUYIN_LAUNCHER_LOG_LOCK_STALE_MS: "30000",
    DOUYIN_LAUNCHER_NO_OPEN: "1",
    ...overrides,
  };
}

function runSync(command, args, fixtureDir, env) {
  return spawnSync(command, args, {
    cwd: fixtureDir,
    env,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
}

function runAsync(command, args, fixtureDir, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: fixtureDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), 15_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ status: Number.isInteger(code) ? code : 1, signal, stdout, stderr });
    });
  });
}

function logFiles(fixtureDir) {
  return fs.readdirSync(path.join(fixtureDir, ".data"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^launcher\.log(?:\.\d+)?$/u.test(entry.name))
    .map((entry) => path.join(fixtureDir, ".data", entry.name));
}

function readRecords(fixtureDir) {
  const records = [];
  for (const file of logFiles(fixtureDir)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/u).filter(Boolean);
    for (const line of lines) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        assert.fail(`Launcher log line must be JSON: ${line}`);
      }
      for (const field of ["timestamp", "event", "project", "pid", "url", "runId", "message"]) {
        assert.ok(Object.hasOwn(record, field), `Launcher log record is missing ${field}: ${line}`);
      }
      assert.equal(Number.isNaN(Date.parse(record.timestamp)), false, `Invalid timestamp: ${record.timestamp}`);
      assert.equal(typeof record.event, "string");
      assert.equal(typeof record.project, "string");
      assert.equal(Number.isInteger(record.pid), true);
      assert.ok(record.url === null || typeof record.url === "string");
      assert.equal(typeof record.runId, "string");
      assert.equal(typeof record.message, "string");
      records.push(record);
    }
  }
  return records;
}

function saveEvidence(name, fixtureDir, summary) {
  results.push({ name, ...summary });
  if (!evidenceDir) return;
  const target = path.join(evidenceDir, name);
  fs.mkdirSync(target, { recursive: true });
  for (const file of logFiles(fixtureDir)) fs.copyFileSync(file, path.join(target, path.basename(file)));
}

try {
  const vbsError = makeFixture("vbs-error", { packagePresent: false });
  const vbsErrorResult = runSync(
    cscript,
    ["//nologo", path.join(vbsError, "start-ui-hidden.vbs")],
    vbsError,
    launcherEnv("vbs-error-run"),
  );
  assert.equal(vbsErrorResult.status, 2, `VBS error fixture returned ${vbsErrorResult.status}: ${vbsErrorResult.stderr}`);
  const vbsErrorRecords = readRecords(vbsError);
  assert.ok(vbsErrorRecords.length > 0, "VBS failures must leave a structured launcher log record.");
  assert.ok(vbsErrorRecords.some((entry) => entry.runId === "vbs-error-run" && entry.event.includes("error")));
  saveEvidence("vbs-error", vbsError, { exitCode: vbsErrorResult.status, records: vbsErrorRecords.length });

  const nodeError = makeFixture("node-error", { vbs: false, server: false });
  const nodeErrorResult = runSync(
    process.execPath,
    [path.join(nodeError, "launch-ui.mjs")],
    nodeError,
    launcherEnv("node-error-run"),
  );
  assert.equal(nodeErrorResult.status, 3, `Node error fixture returned ${nodeErrorResult.status}: ${nodeErrorResult.stderr}`);
  const nodeErrorRecords = readRecords(nodeError);
  assert.ok(nodeErrorRecords.some((entry) => entry.runId === "node-error-run" && entry.event.includes("error")));
  saveEvidence("node-error", nodeError, { exitCode: nodeErrorResult.status, records: nodeErrorRecords.length });

  const newServer = makeFixture("new-server", { vbs: false, server: true });
  const newServerResult = runSync(
    process.execPath,
    [path.join(newServer, "launch-ui.mjs")],
    newServer,
    launcherEnv("new-server-run"),
  );
  assert.equal(newServerResult.status, 0, `New-server fixture failed: ${newServerResult.stderr}`);
  const newServerRecords = readRecords(newServer);
  const spawned = newServerRecords.find((entry) => entry.runId === "new-server-run" && entry.event === "spawn-server");
  assert.ok(spawned, "New service launch must be logged.");
  assert.ok(spawned.pid > 0, "New service log must contain the child PID.");
  assert.equal(spawned.url, "http://127.0.0.1:48787");
  saveEvidence("new-server", newServer, { exitCode: newServerResult.status, records: newServerRecords.length });

  const reuse = makeFixture("reuse", { vbs: false, server: true });
  let reuseUrl = "";
  const reuseServer = http.createServer((request, response) => {
    if (request.url === "/api/runtime/identity") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        service: "douyin-local-workbench",
        protocolVersion: 1,
        projectRoot: fs.realpathSync.native(reuse),
        entryPath: fs.realpathSync.native(path.join(reuse, "ui-server.mjs")),
        instanceId: "r2-01-13-compatible-identity",
        pid: process.pid,
        commit: "unknown",
        sourceMtimeMs: fs.statSync(path.join(reuse, "ui-server.mjs")).mtimeMs,
        startedAt: new Date().toISOString(),
        ready: true,
        url: reuseUrl,
      }));
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  });
  await new Promise((resolve, reject) => {
    reuseServer.once("error", reject);
    reuseServer.listen(0, "127.0.0.1", resolve);
  });
  const reuseAddress = reuseServer.address();
  reuseUrl = `http://127.0.0.1:${reuseAddress.port}`;
  fs.writeFileSync(path.join(reuse, "ui-server.pid"), String(process.pid), "utf8");
  fs.writeFileSync(path.join(reuse, "ui-server.url"), reuseUrl, "utf8");
  const reuseResult = await runAsync(
    process.execPath,
    [path.join(reuse, "launch-ui.mjs")],
    reuse,
    launcherEnv("reuse-run"),
  );
  await new Promise((resolve) => reuseServer.close(resolve));
  assert.equal(reuseResult.status, 0, `Reuse fixture failed: ${reuseResult.stderr}`);
  const reuseRecords = readRecords(reuse);
  const reused = reuseRecords.find((entry) => entry.runId === "reuse-run" && entry.event === "reuse-existing");
  assert.ok(reused, "Existing service reuse must be logged.");
  assert.equal(reused.url, reuseUrl);
  assert.ok(reused.pid > 0);
  saveEvidence("reuse", reuse, { exitCode: reuseResult.status, records: reuseRecords.length, url: reuseUrl });

  const concurrentNode = makeFixture("concurrent-node", { vbs: false, server: false });
  const nodeRunIds = Array.from({ length: 24 }, (_value, index) => `node-concurrent-${index + 1}`);
  const nodeResults = await Promise.all(nodeRunIds.map((runId) => runAsync(
    process.execPath,
    [path.join(concurrentNode, "launch-ui.mjs")],
    concurrentNode,
    launcherEnv(runId),
  )));
  assert.ok(nodeResults.every((entry) => entry.status === 3), "Every concurrent Node preflight must fail predictably.");
  const concurrentNodeRecords = readRecords(concurrentNode);
  const nodeLoggedIds = new Set(concurrentNodeRecords.filter((entry) => entry.event.includes("error")).map((entry) => entry.runId));
  assert.deepEqual([...nodeLoggedIds].sort(), [...nodeRunIds].sort(), "Concurrent Node log events must not be lost.");
  saveEvidence("concurrent-node", concurrentNode, { processes: nodeRunIds.length, loggedRunIds: nodeLoggedIds.size });

  const concurrentVbs = makeFixture("concurrent-vbs", { launcher: false });
  fs.writeFileSync(path.join(concurrentVbs, "launch-ui.mjs"), "process.exitCode = 0;\n", "utf8");
  const vbsRunIds = Array.from({ length: 16 }, (_value, index) => `vbs-concurrent-${index + 1}`);
  const vbsResults = await Promise.all(vbsRunIds.map((runId) => runAsync(
    cscript,
    ["//nologo", path.join(concurrentVbs, "start-ui-hidden.vbs")],
    concurrentVbs,
    launcherEnv(runId),
  )));
  assert.ok(vbsResults.every((entry) => entry.status === 0), "Every concurrent VBS launcher must finish successfully.");
  const concurrentVbsRecords = readRecords(concurrentVbs);
  const vbsLoggedIds = new Set(concurrentVbsRecords.map((entry) => entry.runId));
  assert.deepEqual([...vbsLoggedIds].sort(), [...vbsRunIds].sort(), "Concurrent VBS log events must not be lost.");
  saveEvidence("concurrent-vbs", concurrentVbs, { processes: vbsRunIds.length, loggedRunIds: vbsLoggedIds.size });

  const rotation = makeFixture("rotation", { vbs: false, server: false });
  const rotationEnv = (runId) => launcherEnv(runId, {
    DOUYIN_LAUNCHER_LOG_MAX_BYTES: "1200",
    DOUYIN_LAUNCHER_LOG_BACKUPS: "2",
    DOUYIN_LAUNCHER_LOG_LOCK_STALE_MS: "100",
  });
  for (let index = 0; index < 40; index += 1) {
    const result = runSync(process.execPath, [path.join(rotation, "launch-ui.mjs")], rotation, rotationEnv(`rotate-${index + 1}`));
    assert.equal(result.status, 3);
  }
  const activeLog = path.join(rotation, ".data", "launcher.log");
  assert.ok(fs.statSync(activeLog).size <= 1800, "Active launcher log must remain close to the configured limit.");
  assert.equal(fs.existsSync(`${activeLog}.1`), true, "First rotated backup must exist.");
  assert.equal(fs.existsSync(`${activeLog}.2`), true, "Second rotated backup must exist.");
  assert.equal(fs.existsSync(`${activeLog}.3`), false, "Backups must not exceed the configured count.");
  readRecords(rotation);

  const staleLock = path.join(rotation, ".data", "launcher-log.lock");
  fs.mkdirSync(staleLock, { recursive: true });
  const staleTime = new Date(Date.now() - 60_000);
  fs.utimesSync(staleLock, staleTime, staleTime);
  const recoveryResult = runSync(
    process.execPath,
    [path.join(rotation, "launch-ui.mjs")],
    rotation,
    rotationEnv("stale-lock-recovery"),
  );
  assert.equal(recoveryResult.status, 3, `Stale-lock recovery failed: ${recoveryResult.stderr}`);
  assert.equal(fs.existsSync(staleLock), false, "Recovered logger must release the lock directory.");
  assert.ok(readRecords(rotation).some((entry) => entry.runId === "stale-lock-recovery"));
  saveEvidence("rotation", rotation, {
    activeBytes: fs.statSync(activeLog).size,
    backups: logFiles(rotation).length - 1,
    staleLockRecovered: true,
  });

  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(
      path.join(evidenceDir, "launcher-log-verification.json"),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
      "utf8",
    );
  }

  console.log("Launcher log rotation: OK");
} finally {
  try {
    fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Detached fixture children may briefly retain a Windows temp handle.
  }
}
