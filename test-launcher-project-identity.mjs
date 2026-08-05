import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-launcher-identity-r2-01-14-"));
const evidenceIndex = process.argv.indexOf("--evidence-dir");
const evidenceDir = evidenceIndex >= 0 ? path.resolve(process.argv[evidenceIndex + 1] || "") : "";
const results = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20_000,
    ...options,
  });
  assert.equal(result.error, undefined, `${command} failed to start: ${result.error?.message || "unknown error"}`);
  return result;
}

function writeFixtureServer(filePath) {
  fs.writeFileSync(filePath, `
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const entryPath = fs.realpathSync.native(fileURLToPath(import.meta.url));
const projectRoot = fs.realpathSync.native(path.dirname(entryPath));
const sourceMtimeMs = fs.statSync(entryPath).mtimeMs;
const commit = String(spawnSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8", windowsHide: true }).stdout || "").trim();
const instanceId = randomUUID();
const pidPath = path.join(projectRoot, "ui-server.pid");
const urlPath = path.join(projectRoot, "ui-server.url");
let runtimeUrl = "";
const server = http.createServer((request, response) => {
  if (request.url === "/api/runtime/identity") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "douyin-local-workbench", protocolVersion: 1, projectRoot, entryPath, instanceId, pid: process.pid, commit, sourceMtimeMs, startedAt: new Date().toISOString(), ready: server.listening, url: runtimeUrl }));
    return;
  }
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("fixture");
});
function cleanup() {
  try { if (Number(fs.readFileSync(pidPath, "utf8")) === process.pid) fs.rmSync(pidPath, { force: true }); } catch {}
  try { if (fs.readFileSync(urlPath, "utf8").trim() === runtimeUrl) fs.rmSync(urlPath, { force: true }); } catch {}
}
process.on("SIGTERM", () => { cleanup(); server.close(() => process.exit(0)); });
process.on("SIGINT", () => { cleanup(); server.close(() => process.exit(0)); });
server.listen(0, "127.0.0.1", () => {
  runtimeUrl = \`http://127.0.0.1:\${server.address().port}\`;
  fs.writeFileSync(pidPath, String(process.pid), "utf8");
  fs.writeFileSync(urlPath, runtimeUrl, "utf8");
});
`, "utf8");
}

function makeFixture(name) {
  const fixtureDir = path.join(fixtureRoot, name);
  fs.mkdirSync(path.join(fixtureDir, "node_modules", "@yc-w-cn", "douyin-mcp-server"), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, "node_modules", "@yc-w-cn", "douyin-mcp-server", "package.json"), "{}\n", "utf8");
  fs.copyFileSync(path.join(sourceDir, "launch-ui.mjs"), path.join(fixtureDir, "launch-ui.mjs"));
  writeFixtureServer(path.join(fixtureDir, "ui-server.mjs"));
  assert.equal(run("git", ["init", "--quiet"], { cwd: fixtureDir }).status, 0);
  assert.equal(run("git", ["config", "user.email", "launcher-test@example.invalid"], { cwd: fixtureDir }).status, 0);
  assert.equal(run("git", ["config", "user.name", "Launcher Test"], { cwd: fixtureDir }).status, 0);
  assert.equal(run("git", ["add", "launch-ui.mjs", "ui-server.mjs"], { cwd: fixtureDir }).status, 0);
  assert.equal(run("git", ["commit", "--quiet", "-m", "fixture"], { cwd: fixtureDir }).status, 0);
  const commit = String(run("git", ["rev-parse", "HEAD"], { cwd: fixtureDir }).stdout || "").trim();
  return {
    fixtureDir,
    commit,
    projectRoot: fs.realpathSync.native(fixtureDir),
    entryPath: fs.realpathSync.native(path.join(fixtureDir, "ui-server.mjs")),
    sourceMtimeMs: fs.statSync(path.join(fixtureDir, "ui-server.mjs")).mtimeMs,
  };
}

function launcherRecords(fixtureDir, runId) {
  const logPath = path.join(fixtureDir, ".data", "launcher.log");
  assert.equal(fs.existsSync(logPath), true, `Missing launcher log for ${runId}`);
  return fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean)
    .map((line) => JSON.parse(line)).filter((record) => record.runId === runId);
}

function runLauncher(fixtureDir, runId) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(fixtureDir, "launch-ui.mjs")], {
      cwd: fixtureDir,
      env: { ...process.env, DOUYIN_LAUNCHER_NO_OPEN: "1", DOUYIN_LAUNCHER_RUN_ID: runId },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), 20_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr: `${stderr}${error.message}`, error });
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ status: Number.isInteger(code) ? code : 1, signal, stdout, stderr });
    });
  });
}

async function startIdentityServer(fixture, overrides = {}) {
  let runtimeUrl = "";
  const instanceId = `fixture-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const server = http.createServer((request, response) => {
    if (request.url === "/api/runtime/identity") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        service: "douyin-local-workbench",
        protocolVersion: 1,
        projectRoot: fixture.projectRoot,
        entryPath: fixture.entryPath,
        instanceId,
        pid: process.pid,
        commit: fixture.commit,
        sourceMtimeMs: fixture.sourceMtimeMs,
        startedAt: new Date().toISOString(),
        ready: true,
        url: runtimeUrl,
        ...overrides,
      }));
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("responsive but identity-sensitive");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  runtimeUrl = `http://127.0.0.1:${server.address().port}`;
  return { runtimeUrl, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function waitForIdentity(url, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/api/runtime/identity", url));
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

function stopSpawned(records) {
  const spawned = records.find((record) => record.event === "spawn-server");
  if (!spawned?.pid) return;
  try { process.kill(spawned.pid, "SIGTERM"); } catch {}
}

async function verifyRejectedCase(name, overrides, { unavailable = false } = {}) {
  const fixture = makeFixture(name);
  let wrongServer = null;
  let wrongUrl;
  if (unavailable) {
    const reservation = http.createServer();
    await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
    wrongUrl = `http://127.0.0.1:${reservation.address().port}`;
    await new Promise((resolve) => reservation.close(resolve));
  } else {
    wrongServer = await startIdentityServer(fixture, overrides);
    wrongUrl = wrongServer.runtimeUrl;
  }
  fs.writeFileSync(path.join(fixture.fixtureDir, "ui-server.pid"), String(process.pid), "utf8");
  fs.writeFileSync(path.join(fixture.fixtureDir, "ui-server.url"), wrongUrl, "utf8");
  const runId = `${name}-run`;
  const launched = await runLauncher(fixture.fixtureDir, runId);
  assert.equal(launched.status, 0, `${name} launcher failed: ${launched.stderr}`);
  const records = launcherRecords(fixture.fixtureDir, runId);
  assert.ok(records.some((record) => record.event === "reject-existing"), `${name} must reject the old URL.`);
  const spawned = records.find((record) => record.event === "spawn-server");
  assert.ok(spawned?.pid > 0, `${name} must start the current project instance.`);
  const currentUrl = fs.readFileSync(path.join(fixture.fixtureDir, "ui-server.url"), "utf8").trim();
  assert.notEqual(currentUrl, wrongUrl, `${name} must replace the rejected URL.`);
  const identity = await waitForIdentity(currentUrl);
  assert.ok(identity, `${name} replacement did not expose a healthy identity.`);
  assert.equal(path.resolve(identity.projectRoot), path.resolve(fixture.projectRoot));
  assert.equal(path.resolve(identity.entryPath), path.resolve(fixture.entryPath));
  assert.equal(identity.commit, fixture.commit);
  assert.equal(identity.pid, spawned.pid);
  assert.equal(identity.ready, true);
  results.push({ name, rejectedUrl: wrongUrl, replacementUrl: currentUrl, replacementPid: identity.pid, instanceId: identity.instanceId, commit: identity.commit });
  stopSpawned(records);
  if (wrongServer) await wrongServer.close();
}

try {
  const valid = makeFixture("valid-identity");
  const validServer = await startIdentityServer(valid);
  fs.writeFileSync(path.join(valid.fixtureDir, "ui-server.pid"), String(process.pid), "utf8");
  fs.writeFileSync(path.join(valid.fixtureDir, "ui-server.url"), validServer.runtimeUrl, "utf8");
  const validRun = await runLauncher(valid.fixtureDir, "valid-identity-run");
  assert.equal(validRun.status, 0, validRun.stderr);
  const validRecords = launcherRecords(valid.fixtureDir, "valid-identity-run");
  const reused = validRecords.find((record) => record.event === "reuse-existing");
  assert.ok(reused, `A matching healthy identity must be reused. Records: ${JSON.stringify(validRecords)}`);
  assert.equal(reused.pid, process.pid);
  assert.equal(reused.url, validServer.runtimeUrl);
  assert.equal(validRecords.some((record) => record.event === "spawn-server"), false);
  results.push({ name: "valid-identity", reusedUrl: reused.url, pid: reused.pid, commit: valid.commit });
  await validServer.close();

  await verifyRejectedCase("wrong-project", { projectRoot: path.join(fixtureRoot, "foreign-project") });
  await verifyRejectedCase("wrong-commit", { commit: "0".repeat(40) });
  await verifyRejectedCase("wrong-pid", { pid: 2_000_000_000 });
  await verifyRejectedCase("stale-unreachable-url", {}, { unavailable: true });

  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "launcher-project-identity.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, "utf8");
  }
  console.log("Launcher project identity and stale URL rejection: OK");
} finally {
  try { fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
}
