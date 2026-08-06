import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const testFile = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(testFile);
const pnpmStore = path.join(projectRoot, "node_modules", ".pnpm");

function resolveActiveBraceExpansion() {
  const minimatchEntry = fs.readdirSync(pnpmStore)
    .filter((name) => /^minimatch@(?:5\.1\.9|9\.0\.9)(?:_|$)/u.test(name))
    .sort()
    .at(-1);
  assert.ok(minimatchEntry, "an active minimatch dependency must be installed");
  return fs.realpathSync(path.join(pnpmStore, minimatchEntry, "node_modules", "brace-expansion"));
}

const braceRoot = resolveActiveBraceExpansion();
const bracePackagePath = path.join(braceRoot, "package.json");
const bracePackage = JSON.parse(fs.readFileSync(bracePackagePath, "utf8"));
const requireFromBrace = createRequire(bracePackagePath);
const expand = requireFromBrace(braceRoot);

function totalLength(values) {
  return values.reduce((sum, value) => sum + value.length, 0);
}

if (process.argv[2] === "--worker") {
  const workerCase = process.argv[3];
  let input;
  let options;
  if (workerCase === "padded-sequence") {
    input = `{${"0".repeat(20_000)}1..100000}`;
  } else if (workerCase === "comma-alternatives") {
    const part = `{${"0".repeat(50)}1..100000}`;
    input = `{${Array(160).fill(part).join(",")}}`;
  } else if (workerCase === "chained") {
    input = "{a,b}".repeat(100);
    options = { max: 1_000, maxLength: 20_000 };
  } else {
    throw new Error(`unknown worker case: ${workerCase}`);
  }
  const startedAt = Date.now();
  const output = expand(input, options);
  process.stdout.write(`${JSON.stringify({
    workerCase,
    outputCount: output.length,
    totalLength: totalLength(output),
    durationMs: Date.now() - startedAt,
  })}\n`);
  process.exit(0);
}

assert.equal(bracePackage.version, "2.1.4", "installed brace-expansion must be the patched 2.x release");
const lockfile = fs.readFileSync(path.join(projectRoot, "pnpm-lock.yaml"), "utf8");
const lockVersions = [...lockfile.matchAll(/^\s{2}brace-expansion@([^:]+):$/gmu)].map((match) => match[1]);
assert.deepEqual([...new Set(lockVersions)], ["2.1.4"], "lockfile must contain only brace-expansion 2.1.4");

const workers = {};
for (const workerCase of ["padded-sequence", "comma-alternatives", "chained"]) {
  const result = spawnSync(
    process.execPath,
    ["--max-old-space-size=96", testFile, "--worker", workerCase],
    { cwd: projectRoot, encoding: "utf8", timeout: 6_000, windowsHide: true },
  );
  assert.equal(result.error, undefined, `${workerCase} must finish before the timeout: ${result.error?.message ?? ""}`);
  assert.equal(result.status, 0, `${workerCase} worker failed: ${result.stderr}`);
  workers[workerCase] = JSON.parse(result.stdout.trim());
  assert.ok(workers[workerCase].totalLength <= 4_000_000, `${workerCase} output must remain length-bounded`);
}

const zeroStepStartedAt = Date.now();
const zeroStep = expand("{1..20..0}");
const zeroStepDurationMs = Date.now() - zeroStepStartedAt;
assert.ok(zeroStepDurationMs < 1_000, "zero-step input must terminate promptly");
assert.deepEqual(zeroStep, Array.from({ length: 20 }, (_, index) => String(index + 1)), "zero-step input must use a safe finite step");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "r2-brace-expansion-"));
const sourceDir = path.join(tempRoot, "source");
const zipPath = path.join(tempRoot, "literal-names.zip");
const literalNames = ["literal-{a,b}.txt", "literal-[abc].txt", "literal-+([abc]).txt"];
let archiveBytes;
try {
  fs.mkdirSync(sourceDir);
  for (const name of literalNames) {
    fs.writeFileSync(path.join(sourceDir, name), `literal filename: ${name}\n`, "utf8");
  }
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 1 } });
    output.once("close", resolve);
    output.once("error", reject);
    archive.once("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
  archiveBytes = fs.readFileSync(zipPath);
  const zipText = archiveBytes.toString("latin1");
  for (const name of literalNames) {
    assert.ok(zipText.includes(name), `archive must retain literal filename ${name}`);
  }
  assert.ok(!zipText.includes("literal-a.txt"), "archive must not brace-expand literal filenames");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
assert.equal(fs.existsSync(tempRoot), false, "temporary archive evidence must be cleaned up");

const report = {
  node: process.version,
  braceExpansionVersion: bracePackage.version,
  lockVersions,
  workers,
  zeroStep: { output: zeroStep, durationMs: zeroStepDurationMs },
  archiver: { literalNames, zipBytes: archiveBytes.length, tempCleaned: true },
};
if (process.env.R2_EVIDENCE_DIR) {
  fs.mkdirSync(process.env.R2_EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.R2_EVIDENCE_DIR, "brace-expansion-dos-result.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}
console.log(JSON.stringify({ ok: true, ...report }));
