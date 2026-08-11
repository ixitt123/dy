import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-launcher-single-instance-"));
const fixtureDir = path.join(fixtureRoot, "短视频-并发启动");
const evidenceIndex = process.argv.indexOf("--evidence-dir");
const evidenceDir = evidenceIndex >= 0 ? path.resolve(process.argv[evidenceIndex + 1] || "") : "";
const runIds = Array.from({ length: 10 }, (_, index) => `concurrent-${index + 1}`);
const results = { generatedAt: "", fixtureDir, launchers: [], winners: [], launcherRecords: [], final: null };

function writeFixtureServer() {
  fs.writeFileSync(path.join(fixtureDir, "ui-server.mjs"), String.raw`
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(import.meta.url);
const root = path.dirname(sourcePath);
const dataDir = path.join(root, ".data");
const pidPath = path.join(root, "ui-server.pid");
const urlPath = path.join(root, "ui-server.url");
const identityPath = path.join(dataDir, "ui-server.identity.json");
const winnerPath = path.join(dataDir, "server-winners.log");
const canonicalRoot = fs.realpathSync.native(root);
const normalizedRoot = process.platform === "win32" ? canonicalRoot.toLowerCase() : canonicalRoot;
const projectRootSha256 = createHash("sha256").update(normalizedRoot).digest("hex");
const sourceSha256 = createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
const commit = String(spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout || "").trim() || "unknown";
const instanceId = randomUUID();
const startedAt = new Date().toISOString();
fs.mkdirSync(dataDir, { recursive: true });

let handle;
try {
  handle = fs.openSync(pidPath, "wx");
  fs.writeFileSync(handle, String(process.pid), "utf8");
  fs.closeSync(handle);
} catch (error) {
  if (handle) try { fs.closeSync(handle); } catch {}
  if (error?.code === "EEXIST") process.exit(0);
  throw error;
}
fs.appendFileSync(winnerPath, JSON.stringify({ pid: process.pid, instanceId, startedAt }) + "\n", "utf8");

const delayMs = Number(process.env.FIXTURE_START_DELAY_MS || 1500);
await new Promise((resolve) => setTimeout(resolve, delayMs));

const server = http.createServer((request, response) => {
  if (request.url === "/.well-known/douyin-runtime") {
    const body = JSON.stringify({ ok: true, protocolVersion: 1, projectRootSha256, sourceSha256, commit, instanceId, pid: process.pid, startedAt, health: "ready" });
    response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    response.end(body);
    return;
  }
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("fixture");
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const url = "http://127.0.0.1:" + server.address().port;
const identity = { ok: true, protocolVersion: 1, projectRootSha256, sourceSha256, commit, instanceId, pid: process.pid, startedAt, health: "ready", url };
fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2) + "\n", "utf8");
fs.writeFileSync(urlPath, url, "utf8");

function cleanup() {
  let ownsPid = false;
  try { ownsPid = Number(fs.readFileSync(pidPath, "utf8")) === process.pid; } catch {}
  if (!ownsPid) return;
  for (const filePath of [urlPath, identityPath, pidPath]) {
    try { fs.rmSync(filePath, { force: true }); } catch {}
  }
}
process.on("exit", cleanup);
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
`, "utf8");
}

function initializeFixture() {
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.copyFileSync(path.join(sourceDir, "launch-ui.mjs"), path.join(fixtureDir, "launch-ui.mjs"));
  const packageDir = path.join(fixtureDir, "node_modules", "@yc-w-cn", "douyin-mcp-server");
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), "{}\n", "utf8");
  writeFixtureServer();
  for (const args of [
    ["init", "--quiet"],
    ["config", "user.email", "launcher-fixture@example.invalid"],
    ["config", "user.name", "Launcher Fixture"],
    ["add", "launch-ui.mjs", "ui-server.mjs"],
    ["commit", "--quiet", "-m", "fixture"],
  ]) {
    const result = spawnSync("git", args, { cwd: fixtureDir, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, `Fixture git command failed: git ${args.join(" ")}\n${result.stderr}`);
  }
  const staleLockDir = path.join(fixtureDir, ".data", "launcher-start.lock");
  fs.mkdirSync(staleLockDir, { recursive: true });
  fs.writeFileSync(path.join(staleLockDir, "owner.json"), `${JSON.stringify({ pid: 999999, runId: "dead-owner", createdAt: Date.now() - 60000 })}\n`, "utf8");
}

function runLauncher(runId) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(fixtureDir, "launch-ui.mjs")], {
      cwd: fixtureDir,
      env: {
        ...process.env,
        DOUYIN_LAUNCHER_RUN_ID: runId,
        DOUYIN_LAUNCHER_NO_OPEN: "1",
        DOUYIN_LAUNCHER_LOG_MAX_BYTES: "1048576",
        DOUYIN_LAUNCHER_START_LOCK_TIMEOUT_MS: "30000",
        FIXTURE_START_DELAY_MS: "1500",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), 35000);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ runId, status: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ runId, status: Number.isInteger(code) ? code : 1, stdout, stderr });
    });
  });
}

async function waitForWinner(timeoutMs = 6000) {
  const winnerPath = path.join(fixtureDir, ".data", "server-winners.log");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (fs.readFileSync(winnerPath, "utf8").trim()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The first fixture server never acquired the PID lock.");
}

function readJsonLines(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function stopFixtureServer() {
  let pid = 0;
  try { pid = Number(fs.readFileSync(path.join(fixtureDir, "ui-server.pid"), "utf8")); } catch {}
  if (pid > 0 && processIsAlive(pid)) {
    try { process.kill(pid, "SIGTERM"); } catch {}
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && processIsAlive(pid)) await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function saveEvidence() {
  if (!evidenceDir) return;
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "launcher-single-instance-verification.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
}

try {
  initializeFixture();
  const first = runLauncher(runIds[0]);
  await waitForWinner();
  const remaining = runIds.slice(1).map((runId) => runLauncher(runId));
  results.launchers = await Promise.all([first, ...remaining]);
  results.winners = readJsonLines(path.join(fixtureDir, ".data", "server-winners.log"));
  const pid = Number(fs.readFileSync(path.join(fixtureDir, "ui-server.pid"), "utf8"));
  const url = fs.readFileSync(path.join(fixtureDir, "ui-server.url"), "utf8").trim();
  const identity = JSON.parse(fs.readFileSync(path.join(fixtureDir, ".data", "ui-server.identity.json"), "utf8"));
  const launcherRecords = readJsonLines(path.join(fixtureDir, ".data", "launcher.log"));
  results.launcherRecords = launcherRecords;
  results.final = { pid, url, identity, launcherRecordCount: launcherRecords.length, alive: processIsAlive(pid) };
  results.generatedAt = new Date().toISOString();
  saveEvidence();

  assert.ok(results.launchers.every((entry) => entry.status === 0), JSON.stringify(results.launchers, null, 2));
  assert.equal(results.winners.length, 1, `Expected one PID-lock winner, observed ${results.winners.length}.`);
  assert.ok(results.final.alive, "The final server process must remain alive.");
  assert.equal(identity.pid, pid, "PID and identity state must name the same server.");
  assert.equal(identity.url, url, "URL and identity state must name the same server.");
  for (const runId of runIds) {
    assert.ok(launcherRecords.some((entry) => entry.runId === runId && ["spawn-server", "reuse-existing"].includes(entry.event)), `Missing successful launcher event for ${runId}.`);
  }
  assert.equal(fs.existsSync(path.join(fixtureDir, ".data", "launcher-start.lock")), false, "The launcher transaction lock must be released.");
  console.log("Launcher single instance concurrency: OK");
} finally {
  results.generatedAt ||= new Date().toISOString();
  saveEvidence();
  await stopFixtureServer();
  if (process.env.KEEP_LAUNCHER_FIXTURE !== "1") {
    try { fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
  }
}
