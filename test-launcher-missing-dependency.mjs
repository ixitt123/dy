import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("Launcher missing-dependency test: skipped (Windows only)");
  process.exit(0);
}

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-launcher-r2-01-12-"));
const cscript = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cscript.exe");
const evidenceOption = process.argv.indexOf("--evidence-dir");
const evidenceDir = evidenceOption >= 0 ? path.resolve(process.argv[evidenceOption + 1] || "") : "";
const fixtureEvidence = [];

function writePackage(fixtureDir) {
  const packageDir = path.join(fixtureDir, "node_modules", "@yc-w-cn", "douyin-mcp-server");
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), "{}\n", "utf8");
}

function makeFixture(name, { packagePresent = false, launcherPresent = true } = {}) {
  const fixtureDir = path.join(fixtureRoot, name);
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.copyFileSync(path.join(sourceDir, "start-ui-hidden.vbs"), path.join(fixtureDir, "start-ui-hidden.vbs"));
  if (packagePresent) writePackage(fixtureDir);
  if (launcherPresent) {
    fs.writeFileSync(
      path.join(fixtureDir, "launch-ui.mjs"),
      'import fs from "node:fs"; fs.writeFileSync(new URL("./started.marker", import.meta.url), "started");\n',
      "utf8",
    );
  }
  return fixtureDir;
}

function runVbs(fixtureDir, env = {}) {
  const result = spawnSync(cscript, ["//nologo", path.join(fixtureDir, "start-ui-hidden.vbs")], {
    cwd: fixtureDir,
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, ...env },
    windowsHide: true,
  });
  const logPath = path.join(fixtureDir, ".data", "launcher.log");
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  return {
    ...result,
    evidence: `${result.stdout || ""}\n${result.stderr || ""}\n${log}`,
    started: fs.existsSync(path.join(fixtureDir, "started.marker")),
  };
}

function expectStopped(result, expectedMessage) {
  assert.notEqual(result.status, 0, "The launcher must return a non-zero status.");
  assert.match(result.evidence, expectedMessage, "The launcher must provide an actionable error.");
  assert.equal(result.started, false, "A failed preflight must not start a partial service.");
}

function recordEvidence(name, result) {
  fixtureEvidence.push({
    name,
    status: result.status,
    signal: result.signal || null,
    timedOut: result.error?.code === "ETIMEDOUT",
    started: result.started ?? null,
    outputAndLog: result.evidence ?? `${result.stdout || ""}\n${result.stderr || ""}`,
  });
}

try {
  const missingDependency = makeFixture("missing-dependency");
  const missingDependencyResult = runVbs(missingDependency);
  recordEvidence("missing-dependency", missingDependencyResult);
  expectStopped(missingDependencyResult, /Dependencies are missing.*pnpm install/is);

  const missingEntry = makeFixture("missing-entry", { packagePresent: true, launcherPresent: false });
  const missingEntryResult = runVbs(missingEntry);
  recordEvidence("missing-launch-entry", missingEntryResult);
  expectStopped(missingEntryResult, /launch-ui\.mjs.*missing|missing.*launch-ui\.mjs/is);

  const missingNode = makeFixture("missing-node", { packagePresent: true });
  const missingNodeResult = runVbs(missingNode, {
    DOUYIN_LAUNCHER_NODE: path.join(missingNode, "missing-node.exe"),
  });
  recordEvidence("missing-node", missingNodeResult);
  expectStopped(missingNodeResult, /Node\.js.*not found|Node.*path.*does not exist/is);

  const missingUiServer = path.join(fixtureRoot, "missing-ui-server");
  fs.mkdirSync(missingUiServer, { recursive: true });
  writePackage(missingUiServer);
  fs.copyFileSync(path.join(sourceDir, "launch-ui.mjs"), path.join(missingUiServer, "launch-ui.mjs"));
  const nodeResult = spawnSync(process.execPath, [path.join(missingUiServer, "launch-ui.mjs")], {
    cwd: missingUiServer,
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  recordEvidence("missing-ui-server-entry", nodeResult);
  assert.notEqual(nodeResult.status, 0, "The Node launcher must fail when ui-server.mjs is missing.");
  assert.match(
    `${nodeResult.stdout || ""}\n${nodeResult.stderr || ""}`,
    /ui-server\.mjs.*missing|missing.*ui-server\.mjs/is,
    "The Node launcher must identify the missing server entry.",
  );

  const success = makeFixture("success", { packagePresent: true });
  const successResult = runVbs(success);
  recordEvidence("valid-hidden-launch", successResult);
  assert.equal(successResult.status, 0, `Valid launcher fixture failed:\n${successResult.evidence}`);
  assert.equal(successResult.started, true, "A valid launcher must still start successfully.");

  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(
      path.join(evidenceDir, "launcher-fixtures.json"),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), cases: fixtureEvidence }, null, 2)}\n`,
      "utf8",
    );
  }

  console.log("Launcher missing-dependency test: OK");
} finally {
  try {
    fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // A pre-fix fire-and-forget child may briefly retain the fixture on Windows.
    // The operating-system temp directory remains the only affected location.
  }
}
