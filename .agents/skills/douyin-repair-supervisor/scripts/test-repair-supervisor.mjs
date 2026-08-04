import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(scriptDir, "check-repair-plan.mjs");
const packetBuilder = path.join(scriptDir, "build-current-work-packet.mjs");
const failureRecorder = path.join(scriptDir, "record-repair-failure.mjs");
const planPath = path.join(os.homedir(), "Desktop", "01-短视频软件彻底修复执行总表.md");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repair-supervisor-test-"));

function run(script, parameters) {
  return spawnSync(process.execPath, [script, ...parameters], { cwd: process.cwd(), encoding: "utf8" });
}

function assert(condition, message, output = "") {
  if (condition) return console.log(`PASS ${message}`);
  console.error(`FAIL ${message}`);
  if (output) console.error(output.trim());
  process.exitCode = 1;
}

function replaceRow(source, id, state, dependency) {
  const escaped = id.replace(".", "\\.");
  const pattern = new RegExp(`^(\\|\\s*\\\`${escaped}\\\`\\s*\\|\\s*)[^|]+(\\|\\s*)[^|]+(\\|)`, "m");
  return source.replace(pattern, `$1${state} $2${dependency} $3`);
}

function setCurrent(source, id) {
  return source.replace(/(\|\s*当前唯一允许开始的项目\s*\|\s*)`\d{2}\.\d{2}`(\s*\|)/m, `$1\`${id}\`$2`);
}

try {
  if (!fs.existsSync(planPath)) throw new Error(`missing plan: ${planPath}`);
  const text = fs.readFileSync(planPath, "utf8");
  const rows = [...text.matchAll(/^\|\s*`(?<id>\d{2}\.\d{2})`\s*\|\s*(?<state>[^|]+?)\s*\|/gm)];
  const completedCount = rows.filter((row) => row.groups.state.trim() === "完成").length;
  const skippedCount = rows.filter((row) => row.groups.state.trim() === "二次失败待最终收尾").length;
  const current = rows.find((match) => !["完成", "不适用", "二次失败待最终收尾"].includes(match.groups.state.trim()));
  if (!current) {
    const normal = run(checker, ["--plan", planPath]);
    assert(normal.status === 0 && normal.stdout.includes("next=none"), "fully closed ordinary pass is accepted", `${normal.stdout}${normal.stderr}`);
  } else {
  const currentId = current.groups.id;
  const nextId = rows[rows.findIndex((row) => row.groups.id === currentId) + 1]?.groups.id || currentId;
  const dependencyPath = path.join(tempRoot, "bad-dependency.md");
  const completionPath = path.join(tempRoot, "bad-completion.md");
  const validCompletionPath = path.join(tempRoot, "valid-completion.md");
  const packetPath = path.join(tempRoot, "packet", "current-work-packet.md");
  const attemptPlanPath = path.join(tempRoot, "attempt-plan.md");
  const evidenceOne = path.join(tempRoot, "attempt-1.txt");
  const evidenceTwo = path.join(tempRoot, "attempt-2.txt");

  fs.writeFileSync(dependencyPath, replaceRow(text, currentId, current.groups.state.trim(), "无"), "utf8");
  const completionWithoutEvidence = setCurrent(
    replaceRow(text, currentId, "完成", currentId === "00.01" ? "无" : rows[rows.findIndex((row) => row.groups.id === currentId) - 1].groups.id)
      .replace(`| 当前完成数 | ${completedCount} |`, `| 当前完成数 | ${completedCount + 1} |`)
      .replaceAll(`EVIDENCE-${currentId}`, `EVIDENCE-hidden-${currentId}`)
      .replaceAll(`项目 ${currentId}`, `项目-hidden-${currentId}`),
    nextId,
  );
  fs.writeFileSync(completionPath, completionWithoutEvidence, "utf8");
  const validCompletion = `${completionWithoutEvidence.trimEnd()}\n\n### LOG-TEST｜项目 ${currentId}\n- 最终状态：完成\n\n#### EVIDENCE-${currentId}｜五道门\n- Gate A 代码：通过\n- Gate B 逻辑：通过\n- Gate C 功能：通过\n- Gate D 真实使用：通过\n- Gate E 发布：不适用：本项仅验证监管规则\n- 真实证据路径：C:\\repair-evidence\\${currentId}\n`;
  fs.writeFileSync(validCompletionPath, validCompletion, "utf8");

  const normal = run(checker, ["--plan", planPath]);
  assert(normal.status === 0, "current plan is accepted", `${normal.stdout}${normal.stderr}`);

  const dependency = run(checker, ["--plan", dependencyPath]);
  const dependencyOutput = `${dependency.stdout}${dependency.stderr}`;
  assert(dependency.status !== 0 && dependencyOutput.includes(`invalid dependency for ${currentId}`), "wrong dependency is rejected", dependencyOutput);

  const completion = run(checker, ["--plan", completionPath]);
  const completionOutput = `${completion.stdout}${completion.stderr}`;
  assert(completion.status !== 0 && completionOutput.includes("no update-log entry") && completionOutput.includes("no EVIDENCE block"), "completion without log and evidence is rejected", completionOutput);

  const validCompletionResult = run(checker, ["--plan", validCompletionPath]);
  assert(validCompletionResult.status === 0, "completion with a valid five-gate block is accepted", `${validCompletionResult.stdout}${validCompletionResult.stderr}`);

  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  const packet = run(packetBuilder, ["--plan", planPath, "--output", packetPath]);
  const packetText = fs.existsSync(packetPath) ? fs.readFileSync(packetPath, "utf8") : "";
  assert(packet.status === 0 && packetText.includes(`# 当前维修任务包｜${currentId}`) && fs.existsSync(path.join(path.dirname(packetPath), "baseline.json")), "current work packet and baseline are generated", `${packet.stdout}${packet.stderr}`);

  const activeAttemptPlan = replaceRow(text, currentId, "进行中", currentId === "00.01" ? "无" : rows[rows.findIndex((row) => row.groups.id === currentId) - 1].groups.id);
  fs.writeFileSync(attemptPlanPath, activeAttemptPlan, "utf8");
  fs.writeFileSync(evidenceOne, "first failed repair evidence\n", "utf8");
  fs.writeFileSync(evidenceTwo, "second failed repair evidence\n", "utf8");

  const firstAttempt = run(failureRecorder, ["--plan", attemptPlanPath, "--item", currentId, "--evidence", evidenceOne, "--summary", "第一次真实复验仍失败"]);
  const afterFirst = fs.readFileSync(attemptPlanPath, "utf8");
  assert(firstAttempt.status === 0 && afterFirst.includes(`ATTEMPT-1-${currentId}｜失败`) && afterFirst.includes(`| \`${currentId}\` | 进行中`), "first failed repair is recorded without advancing", `${firstAttempt.stdout}${firstAttempt.stderr}`);

  const secondAttempt = run(failureRecorder, ["--plan", attemptPlanPath, "--item", currentId, "--evidence", evidenceTwo, "--summary", "第二次真实复验仍失败"]);
  const afterSecond = fs.readFileSync(attemptPlanPath, "utf8");
  assert(secondAttempt.status === 0 && afterSecond.includes(`ATTEMPT-2-${currentId}｜失败`) && afterSecond.includes(`AUTO-SKIP-${currentId}｜二次失败待最终收尾`) && afterSecond.includes(`| \`${currentId}\` | 二次失败待最终收尾`) && afterSecond.includes(`| 当前唯一允许开始的项目 | \`${nextId}\``) && afterSecond.includes(`| 当前完成数 | ${completedCount} |`) && afterSecond.includes(`| 当前二次失败待最终收尾数 | ${skippedCount + 1} |`), "second failed repair is annotated, excluded from completion, and advances automatically", `${secondAttempt.stdout}${secondAttempt.stderr}`);

  const skippedCheck = run(checker, ["--plan", attemptPlanPath]);
  assert(skippedCheck.status === 0 && skippedCheck.stdout.includes(`next=${nextId}`), "skipped item remains unresolved but no longer blocks the next item", `${skippedCheck.stdout}${skippedCheck.stderr}`);

  const thirdAttempt = run(failureRecorder, ["--plan", attemptPlanPath, "--item", currentId, "--evidence", evidenceTwo, "--summary", "禁止发生的第三次尝试"]);
  assert(thirdAttempt.status !== 0 && `${thirdAttempt.stdout}${thirdAttempt.stderr}`.includes("not the current allowed item"), "third repair attempt is rejected without changing the plan", `${thirdAttempt.stdout}${thirdAttempt.stderr}`);

  const malformedSkipPath = path.join(tempRoot, "malformed-skip.md");
  fs.writeFileSync(malformedSkipPath, afterSecond.replace(`#### AUTO-SKIP-${currentId}｜二次失败待最终收尾`, `#### AUTO-SKIP-HIDDEN-${currentId}｜二次失败待最终收尾`), "utf8");
  const malformedSkip = run(checker, ["--plan", malformedSkipPath]);
  assert(malformedSkip.status !== 0 && `${malformedSkip.stdout}${malformedSkip.stderr}`.includes("has no AUTO-SKIP block"), "skip without automatic annotation is rejected", `${malformedSkip.stdout}${malformedSkip.stderr}`);

  const falseCompletionCountPath = path.join(tempRoot, "false-completion-count.md");
  fs.writeFileSync(falseCompletionCountPath, afterSecond.replace(`| 当前完成数 | ${completedCount} |`, `| 当前完成数 | ${completedCount + 1} |`), "utf8");
  const falseCompletionCount = run(checker, ["--plan", falseCompletionCountPath]);
  assert(falseCompletionCount.status !== 0 && `${falseCompletionCount.stdout}${falseCompletionCount.stderr}`.includes(`completed dashboard count must be ${completedCount}`), "skipped item cannot be counted as completed", `${falseCompletionCount.stdout}${falseCompletionCount.stderr}`);

  const thirdMarkerPath = path.join(tempRoot, "third-marker.md");
  fs.writeFileSync(thirdMarkerPath, afterSecond.replace(`#### AUTO-SKIP-${currentId}`, `#### ATTEMPT-3-${currentId}｜失败\n- 真实证据路径：${evidenceTwo}\n\n#### AUTO-SKIP-${currentId}`), "utf8");
  const thirdMarker = run(checker, ["--plan", thirdMarkerPath]);
  assert(thirdMarker.status !== 0 && `${thirdMarker.stdout}${thirdMarker.stderr}`.includes("exceeds the two-attempt repair limit"), "plan checker rejects a third repair attempt marker", `${thirdMarker.stdout}${thirdMarker.stderr}`);
  }
} finally {
  const resolved = path.resolve(tempRoot);
  const tempBase = path.resolve(os.tmpdir());
  if (!resolved.startsWith(`${tempBase}${path.sep}`)) throw new Error(`unsafe cleanup target: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

if (process.exitCode) process.exit(process.exitCode);
