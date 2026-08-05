import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROUND2_SUPPLEMENTAL_TESTS } from "./scripts/round2-complete-runner.mjs";

const REQUIRED_FORMAL_TESTS = [
  "test-error-code-http.mjs",
  "test-error-code-integration.mjs",
  "test-image-delete-boundary.mjs",
  "test-settings-concurrency.mjs",
  "test-task-export-xlsx-browser.mjs",
  "test-ui-server-read-observability.mjs",
  "test-ui-server-streamed-file-response.mjs",
  "test-xlsx-export-compatibility.mjs",
];

assert.equal(ROUND2_SUPPLEMENTAL_TESTS.length, 41, "round-two supplemental matrix must contain exactly 41 tests");
assert.equal(new Set(ROUND2_SUPPLEMENTAL_TESTS.map((entry) => entry.file)).size, 41, "round-two matrix contains duplicate tests");
for (const file of REQUIRED_FORMAL_TESTS) {
  assert.ok(ROUND2_SUPPLEMENTAL_TESTS.some((entry) => entry.file === file), `round-two matrix is missing ${file}`);
}
assert.equal(
  ROUND2_SUPPLEMENTAL_TESTS.find((entry) => entry.file === "test-xiaohei-one-click-images-browser.mjs")?.env?.XIAOHEI_SPEED_MATRIX,
  "1",
  "Xiaohei browser coverage must execute the 1.0/1.1/1.2/1.3 speed matrix",
);
assert.ok(
  ROUND2_SUPPLEMENTAL_TESTS.some((entry) => entry.file === "test-cs1-complete-acceptance.mjs" && /备份排除/u.test(entry.note)),
  "CS1 recent-output backup exclusion must stay in the complete matrix",
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "round2-complete-runner-test-"));
const fixtureDir = path.join(tempRoot, "fixtures");
const evidenceDir = path.join(tempRoot, "evidence");
fs.mkdirSync(fixtureDir, { recursive: true });

const fixtures = [
  ["01-pass.mjs", "console.log('fixture pass', process.env.ROUND2_TEST_TEMP_DIR);"],
  ["02-fail.mjs", "console.error('intentional fixture failure'); process.exitCode = 7;"],
  ["03-timeout.mjs", "setTimeout(() => console.log('must time out'), 5000);"],
  ["04-after-failure.mjs", "console.log('continued after failure', process.env.ROUND2_TEST_TEMP_DIR);"],
];

try {
  for (const [name, source] of fixtures) fs.writeFileSync(path.join(fixtureDir, name), `${source}\n`, "utf8");
  const manifestPath = path.join(tempRoot, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    tests: fixtures.map(([name], index) => ({
      file: path.join(fixtureDir, name),
      note: name,
      timeoutMs: index === 2 ? 150 : 5000,
    })),
  }, null, 2)}\n`, "utf8");

  const result = spawnSync(process.execPath, [
    "scripts/round2-complete-runner.mjs",
    "--manifest", manifestPath,
    "--evidence-dir", evidenceDir,
    "--skip-service",
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 30000, windowsHide: true });
  assert.equal(result.status, 1, "aggregate runner must fail when any isolated test fails or times out");
  const reportPath = path.join(evidenceDir, "round2-complete-runner-result.json");
  assert.ok(fs.existsSync(reportPath), "aggregate JSON report was not written");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.matrixCount, 4);
  assert.deepEqual(report.tests.map((entry) => entry.status), ["passed", "failed", "timed-out", "passed"]);
  assert.equal(report.tests[1].exitCode, 7);
  assert.equal(report.tests[2].timedOut, true);
  assert.equal(report.tests[3].exitCode, 0, "runner stopped instead of continuing after failures");
  assert.equal(new Set(report.tests.map((entry) => entry.tempDir)).size, 4, "every test needs a unique temporary directory");
  assert.ok(report.tests.every((entry) => entry.tempRemoved && fs.existsSync(entry.logPath)), "temporary directories or independent logs are incorrect");
  assert.equal(report.service.finalRestored, true);
  assert.match(`${result.stdout}${result.stderr}`, /4\/4 .*04-after-failure\.mjs/u);
} finally {
  const resolved = path.resolve(tempRoot);
  const tempBase = path.resolve(os.tmpdir());
  if (!resolved.startsWith(`${tempBase}${path.sep}`)) throw new Error(`unsafe cleanup target: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

console.log("Round-two complete runner isolation, timeout, continuation and JSON reporting: OK");
