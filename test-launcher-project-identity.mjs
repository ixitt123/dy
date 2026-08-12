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

function writePackage(fixtureDir) {
  const packageDir = path.join(fixtureDir, "node_modules", "@yc-w-cn", "douyin-mcp-server");
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), "{}\n", "utf8");
}

function writeFixtureServer(fixtureDir) {
  fs.writeFileSync(path.join(fixtureDir, "ui-server.mjs"), `
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(import.meta.url);
const root = path.dirname(sourcePath);
const canonicalRoot = fs.realpathSync.native(root);
const normalizedRoot = process.platform === "win32" ? canonicalRoot.toLowerCase() : canonicalRoot;
const projectRootSha256 = createHash("sha256").update(normalizedRoot).digest("hex");
const sourceSha256 = createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
const commit = String(spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout || "").trim() || "unknown";
const instanceId = randomUUID();
const startedAt = new Date().toISOString();
const pidPath = path.join(root, "ui-server.pid");
const urlPath = path.join(root, "ui-server.url");

const server = http.createServer((request, response) => {
  if (request.url === "/.well-known/douyin-runtime") {
    const identity = {
      ok: true,
      protocolVersion: 1,
      projectRootSha256: process.env.FIXTURE_PROJECT_ROOT_SHA256 || projectRootSha256,
      sourceSha256: process.env.FIXTURE_SOURCE_SHA256 || sourceSha256,
      commit: process.env.FIXTURE_COMMIT || commit,
      instanceId: process.env.FIXTURE_INSTANCE_ID === "empty" ? "" : instanceId,
      pid: Number(process.env.FIXTURE_PID || process.pid),
      startedAt,
      health: process.env.FIXTURE_HEALTH || "ready",
    };
    const body = JSON.stringify(identity);
    response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    response.end(body);
    if (process.env.FIXTURE_EXIT_AFTER_IDENTITY === "1") setTimeout(() => process.exit(0), 25);
    return;
  }
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("fixture");
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const url = \`http://127.0.0.1:\${address.port}\`;
  fs.writeFileSync(pidPath, String(process.pid), "utf8");
  fs.writeFileSync(urlPath, url, "utf8");
});

function cleanup() {
  for (const file of [pidPath, urlPath]) {
    try {
      if (fs.existsSync(file) && String(fs.readFileSync(file, "utf8")).includes(String(process.pid))) fs.rmSync(file, { force: true });
    } catch {}
  }
}
process.on("exit", cleanup);
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
`, "utf8");
}

function initializeFixture(name) {
  const fixtureDir = path.join(fixtureRoot, name);
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.copyFileSync(path.join(sourceDir, "launch-ui.mjs"), path.join(fixtureDir, "launch-ui.mjs"));
  writePackage(fixtureDir);
  writeFixtureServer(fixtureDir);
  const commands = [
    ["init", "--quiet"],
    ["config", "user.email", "launcher-fixture@example.invalid"],
    ["config", "user.name", "Launcher Fixture"],
    ["add", "launch-ui.mjs", "ui-server.mjs"],
    ["commit", "--quiet", "-m", "fixture"],
  ];
  for (const args of commands) {
    const result = spawnSync("git", args, { cwd: fixtureDir, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, `Fixture git command failed: git ${args.join(" ")}\n${result.stderr}`);
  }
  return fixtureDir;
}

function launcherEnv(runId, overrides = {}) {
  return {
    ...process.env,
    DOUYIN_LAUNCHER_RUN_ID: runId,
    DOUYIN_LAUNCHER_LOG_MAX_BYTES: "1048576",
    DOUYIN_LAUNCHER_LOG_BACKUPS: "2",
    DOUYIN_LAUNCHER_NO_OPEN: "1",
    ...overrides,
  };
}

function runLauncher(fixtureDir, runId) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(fixtureDir, "launch-ui.mjs")], {
      cwd: fixtureDir,
      env: launcherEnv(runId),
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
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ status: Number.isInteger(code) ? code : 1, stdout, stderr });
    });
  });
}

async function waitForFile(filePath, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = fs.readFileSync(filePath, "utf8").trim();
      if (value) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return "";
}

function readLogRecords(fixtureDir) {
  const logPath = path.join(fixtureDir, ".data", "launcher.log");
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

async function stopFixtureServer(fixtureDir) {
  let pid = 0;
  try { pid = Number(fs.readFileSync(path.join(fixtureDir, "ui-server.pid"), "utf8")); } catch {}
  if (pid > 0) {
    try { process.kill(pid, "SIGTERM"); } catch {}
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try { process.kill(pid, 0); } catch { return; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function stopAllFixtureServers() {
  if (!fs.existsSync(fixtureRoot)) return;
  for (const entry of fs.readdirSync(fixtureRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) await stopFixtureServer(path.join(fixtureRoot, entry.name));
  }
}

function saveEvidence() {
  if (!evidenceDir) return;
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, "launcher-project-identity-verification.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
    "utf8",
  );
}

try {
  const fixtureDir = initializeFixture("短视频-identity");
  const wrongServer = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("not this project");
  });
  await new Promise((resolve, reject) => {
    wrongServer.once("error", reject);
    wrongServer.listen(0, "127.0.0.1", resolve);
  });
  const wrongAddress = wrongServer.address();
  const wrongUrl = `http://127.0.0.1:${wrongAddress.port}`;
  fs.writeFileSync(path.join(fixtureDir, "ui-server.url"), wrongUrl, "utf8");

  const wrongResult = await runLauncher(fixtureDir, "wrong-http-200");
  await new Promise((resolve) => wrongServer.close(resolve));
  const correctedUrl = await waitForFile(path.join(fixtureDir, "ui-server.url"));
  const wrongRecords = readLogRecords(fixtureDir);
  results.push({
    case: "wrong-http-200",
    exitCode: wrongResult.status,
    wrongUrl,
    correctedUrl,
    events: wrongRecords.map((entry) => ({ event: entry.event, url: entry.url, pid: entry.pid })),
  });
  saveEvidence();

  assert.equal(wrongResult.status, 0, `Launcher failed: ${wrongResult.stderr}`);
  assert.notEqual(correctedUrl, wrongUrl, "An unrelated HTTP 200 service must not be reused.");
  assert.equal(wrongRecords.some((entry) => entry.event === "reuse-existing" && entry.url === wrongUrl), false,
    "The launcher incorrectly recorded an unrelated HTTP 200 service as reusable.");
  assert.ok(wrongRecords.some((entry) => entry.event === "spawn-server" && entry.url === correctedUrl),
    "Rejecting a wrong URL must start and record the correct project service.");

  const firstPid = Number(await waitForFile(path.join(fixtureDir, "ui-server.pid")));
  assert.ok(firstPid > 0, "The corrected service must publish its PID.");
  const reuseResult = await runLauncher(fixtureDir, "correct-identity-reuse");
  const secondPid = Number(await waitForFile(path.join(fixtureDir, "ui-server.pid")));
  const reuseRecords = readLogRecords(fixtureDir);
  results.push({
    case: "correct-identity-reuse",
    exitCode: reuseResult.status,
    url: correctedUrl,
    firstPid,
    secondPid,
    events: reuseRecords.filter((entry) => entry.runId === "correct-identity-reuse")
      .map((entry) => ({ event: entry.event, url: entry.url, pid: entry.pid })),
  });
  saveEvidence();

  assert.equal(reuseResult.status, 0, `Correct identity reuse failed: ${reuseResult.stderr}`);
  assert.equal(secondPid, firstPid, "A verified service must be reused without starting a second PID.");
  assert.ok(reuseRecords.some((entry) => entry.runId === "correct-identity-reuse" && entry.event === "reuse-existing" && entry.url === correctedUrl));
  await stopFixtureServer(fixtureDir);

  console.log("Launcher project identity: OK");
} finally {
  saveEvidence();
  await stopAllFixtureServers();
  try { fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
}
