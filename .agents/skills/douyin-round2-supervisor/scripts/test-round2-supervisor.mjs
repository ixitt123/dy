import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  getCurrentItem,
  getReadyQueue,
  parseRows,
  readPlan,
  replaceRow,
  resolvePlanPath,
  validateCompletionEvidencePath,
  validateHardGateCompletion,
} from "./round2-plan-lib.mjs";
import {
  assertMasterWriter,
  closeAssignment,
  pathsOverlap,
  readCoordination,
  validateCoordination,
} from "./round2-coordination-lib.mjs";
import { validateImportedEvidence } from "./round2-evidence-provenance-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(scriptDir, "check-round2-plan.mjs");
const packetBuilder = path.join(scriptDir, "build-round2-work-packet.mjs");
const failureRecorder = path.join(scriptDir, "record-round2-failure.mjs");
const completionRecorder = path.join(scriptDir, "record-round2-completion.mjs");
const assignmentActivator = path.join(scriptDir, "activate-round2-assignments.mjs");
const planLibrary = path.join(scriptDir, "round2-plan-lib.mjs");
const coordinationLibrary = path.join(scriptDir, "round2-coordination-lib.mjs");
const evidenceProvenanceLibrary = path.join(scriptDir, "round2-evidence-provenance-lib.mjs");
const planPath = resolvePlanPath(process.argv.slice(2));
const specsPath = path.join(scriptDir, "..", "references", "round2-execution-specs.json");
const provenancePath = path.join(scriptDir, "..", "..", "..", "..", "docs", "repair", "round2", "evidence-provenance.json");
const firstRoundPath = path.join(os.homedir(), "Desktop", "01-短视频软件彻底修复执行总表.md");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-round2-supervisor-"));

function sha256(file) {
  return fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : "missing";
}

function run(script, parameters) {
  return spawnSync(process.execPath, [script, ...parameters], { cwd: process.cwd(), encoding: "utf8" });
}

function check(condition, message, output = "") {
  if (condition) return console.log(`PASS ${message}`);
  console.error(`FAIL ${message}`);
  if (output) console.error(output.trim());
  process.exitCode = 1;
}

function withoutItemLogs(text, id) {
  const escaped = id.replaceAll(".", "\\.");
  return text.replace(new RegExp(`^### LOG-[^\\n]*｜项目 ${escaped}\\s*\\n[\\s\\S]*?(?=^### LOG-|(?![\\s\\S]))`, "gm"), "").trimEnd() + "\n";
}

function forceRow(text, id, changes) {
  const row = parseRows(text).find((candidate) => candidate.id === id);
  return replaceRow(text, row, changes);
}

function resetActiveBusinessRows(text) {
  let reset = text;
  const activeRows = parseRows(reset).filter((candidate) => !candidate.id.startsWith("R2-00.") && ["进行中", "待复验"].includes(candidate.state));
  for (const row of activeRows) {
    reset = withoutItemLogs(reset, row.id);
    reset = forceRow(reset, row.id, { state: "未开始", attempts: 0 });
  }
  return reset;
}

function writeFailureEvidence(attempt, valid = true) {
  const directory = path.join(tempRoot, ".data", "repair-evidence", "R2-00.03", `attempt-${attempt}`);
  fs.mkdirSync(directory, { recursive: true });
  if (valid) {
    fs.writeFileSync(path.join(directory, "verification-result.json"), `${JSON.stringify({
      command: `node failing-check-${attempt}.mjs`,
      exitCode: 1,
      completedVerification: true,
      summary: `第 ${attempt} 次完整复验仍未达到全部验收条件`,
    }, null, 2)}\n`, "utf8");
  } else {
    fs.writeFileSync(path.join(directory, "dummy.txt"), "This file is long enough but has no structured verification manifest.\n", "utf8");
  }
  return directory;
}

try {
  const firstHash = sha256(firstRoundPath);
  const planText = readPlan(planPath);
  const specs = JSON.parse(fs.readFileSync(specsPath, "utf8"));
  const rows = parseRows(planText);
  const coordination = readCoordination([]);
  check(rows.length === 73 && specs.items.length === 73, "73 repair rows and 73 execution specifications exist");
  check(new Set(rows.map((row) => row.id)).size === 73 && new Set(specs.items.map((item) => item.id)).size === 73, "all row and specification ids are unique");

  const normal = run(checker, ["--plan", planPath, "--specs", specsPath]);
  check(normal.status === 0 && normal.stdout.includes("items=73"), "current second-round plan passes independently of which item is current", `${normal.stdout}${normal.stderr}`);

  const evidenceProvenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
  const portableBusinessRecord = evidenceProvenance.records.find((entry) => entry.itemId === "R2-01.12");
  const portableBusinessSpec = specs.items.find((entry) => entry.id === "R2-01.12");
  let portableBusinessValidated = false;
  try {
    const imported = validateImportedEvidence({
      itemId: "R2-01.12",
      evidencePath: portableBusinessRecord.evidencePath,
      originalError: new Error(`missing evidence path: ${portableBusinessRecord.evidencePath}`),
      evidenceProvenance,
      provenancePath,
      repoRoot: process.cwd(),
      spec: { ...portableBusinessSpec, requiredGates: ["F 数据与回滚"], manual: false },
    });
    portableBusinessValidated = imported.receipt?.completionManifestSha256 === portableBusinessRecord.manifestSha256;
  } catch {}
  check(portableBusinessValidated, "portable business evidence verifies the immutable path, receipt and manifest SHA-256 without copying local evidence");

  const tamperedBusinessProvenance = structuredClone(evidenceProvenance);
  tamperedBusinessProvenance.records.find((entry) => entry.itemId === "R2-01.12").receiptSha256 = "0".repeat(64);
  let tamperedBusinessRejected = false;
  try {
    validateImportedEvidence({
      itemId: "R2-01.12",
      evidencePath: portableBusinessRecord.evidencePath,
      originalError: new Error(`missing evidence path: ${portableBusinessRecord.evidencePath}`),
      evidenceProvenance: tamperedBusinessProvenance,
      provenancePath,
      repoRoot: process.cwd(),
      spec: { ...portableBusinessSpec, requiredGates: ["F 数据与回滚"], manual: false },
    });
  } catch (error) {
    tamperedBusinessRejected = error.message.includes("receipt SHA-256 mismatch");
  }
  check(tamperedBusinessRejected, "portable business evidence rejects a tampered receipt SHA-256");

  const tamperedProvenancePath = path.join(tempRoot, "tampered-evidence-provenance.json");
  const tamperedProvenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
  tamperedProvenance.records[0].recordedAtCommit = "0000000000000000000000000000000000000000";
  fs.writeFileSync(tamperedProvenancePath, `${JSON.stringify(tamperedProvenance, null, 2)}\n`, "utf8");
  const tamperedProvenanceResult = run(checker, ["--plan", planPath, "--specs", specsPath, "--evidence-provenance", tamperedProvenancePath]);
  check(tamperedProvenanceResult.status !== 0 && `${tamperedProvenanceResult.stdout}${tamperedProvenanceResult.stderr}`.includes("not present in recorded commit"), "portable control evidence rejects a provenance pointer that is not anchored in its recorded commit");

  const loggedBusinessPlan = `${forceRow(planText, "R2-02.02", { state: "待复验", attempts: 1 }).trimEnd()}\n\n### LOG-ATTEMPT-TEST｜项目 R2-02.02\n\n#### ATTEMPT-1-R2-02.02｜失败\n\n- 失败证据路径：.data/repair-evidence/R2-02.02/test-fixture\n`;
  const resetBusinessPlan = resetActiveBusinessRows(loggedBusinessPlan);
  const resetBusinessRow = parseRows(resetBusinessPlan).find((row) => row.id === "R2-02.02");
  check(resetBusinessRow?.state === "未开始" && resetBusinessRow.attempts === 0
    && !resetBusinessPlan.includes("LOG-ATTEMPT-TEST") && !resetBusinessPlan.includes("ATTEMPT-1-R2-02.02"),
  "self-test isolation removes existing business attempt logs before resetting the row");

  let synthetic = resetActiveBusinessRows(withoutItemLogs(planText, "R2-00.03"));
  synthetic = forceRow(synthetic, "R2-00.03", { state: "进行中", attempts: 0 });
  synthetic = forceRow(synthetic, "R2-00.04", { state: "未开始", attempts: 0 });
  synthetic = forceRow(synthetic, "R2-00.06", { state: "未开始", attempts: 0 });
  const syntheticPlan = path.join(tempRoot, "synthetic-plan.md");
  const isolatedAssignmentsPath = path.join(tempRoot, "isolated-assignments.json");
  const isolatedAssignments = structuredClone(coordination.assignmentDocument);
  for (const entry of isolatedAssignments.assignments) entry.status = "planned";
  fs.writeFileSync(isolatedAssignmentsPath, `${JSON.stringify(isolatedAssignments, null, 2)}\n`, "utf8");
  const isolatedCoordinationArgs = ["--assignments", isolatedAssignmentsPath, "--policy", coordination.policyPath];
  fs.writeFileSync(syntheticPlan, synthetic, "utf8");
  const packetPath = path.join(tempRoot, "packet", "current-work-packet.md");
  const packet = run(packetBuilder, ["--plan", syntheticPlan, "--specs", specsPath, "--output", packetPath, ...isolatedCoordinationArgs]);
  const packetText = fs.existsSync(packetPath) ? fs.readFileSync(packetPath, "utf8") : "";
  check(packet.status === 0 && packetText.includes("# 第二轮当前维修任务包｜R2-00.03") && packetText.includes("## RUN-R2-00.03"), "packet builder selects an active synthetic item and writes an isolated baseline", `${packet.stdout}${packet.stderr}`);

  const dummyPlan = path.join(tempRoot, "dummy-plan.md");
  fs.writeFileSync(dummyPlan, synthetic, "utf8");
  const dummy = run(failureRecorder, ["--plan", dummyPlan, "--specs", specsPath, "--item", "R2-00.03", "--evidence", writeFailureEvidence("dummy", false), "--summary", "伪造的一字节证据", ...isolatedCoordinationArgs]);
  check(dummy.status !== 0 && `${dummy.stdout}${dummy.stderr}`.includes("verification-result.json") && fs.readFileSync(dummyPlan, "utf8") === synthetic, "dummy failure evidence is rejected without changing the plan", `${dummy.stdout}${dummy.stderr}`);

  const attemptPlan = path.join(tempRoot, "attempt-plan.md");
  fs.writeFileSync(attemptPlan, synthetic, "utf8");
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = run(failureRecorder, ["--plan", attemptPlan, "--specs", specsPath, "--item", "R2-00.03", "--evidence", writeFailureEvidence(attempt), "--summary", `第 ${attempt} 次完整复验未达到全部验收条件`, ...isolatedCoordinationArgs]);
    const after = fs.readFileSync(attemptPlan, "utf8");
    const expectedState = attempt < 4 ? "待复验" : "四次失败待最终收尾";
    check(result.status === 0 && after.includes(`| \`R2-00.03\` | 控制 | ${expectedState} | ${attempt}/4 |`) && after.includes(`#### ATTEMPT-${attempt}-R2-00.03｜失败`), `attempt ${attempt} is recorded with state ${expectedState}`, `${result.stdout}${result.stderr}`);
  }
  const afterFourth = fs.readFileSync(attemptPlan, "utf8");
  check(afterFourth.includes("- 下一就绪项：R2-00.04") && afterFourth.includes("- 硬门禁资格：无；该状态只解锁排程"), "fourth failure advances scheduling without claiming completion");
  const fifth = run(failureRecorder, ["--plan", attemptPlan, "--specs", specsPath, "--item", "R2-00.03", "--evidence", writeFailureEvidence(5), "--summary", "禁止的第五次普通维修", ...isolatedCoordinationArgs]);
  check(fifth.status !== 0 && `${fifth.stdout}${fifth.stderr}`.includes("fifth ordinary repair is forbidden") && fs.readFileSync(attemptPlan, "utf8") === afterFourth, "fifth repair is rejected without changing the plan", `${fifth.stdout}${fifth.stderr}`);

  const completionPlan = path.join(tempRoot, "completion-plan.md");
  fs.writeFileSync(completionPlan, synthetic, "utf8");
  const completionDir = path.join(tempRoot, ".data", "repair-evidence", "R2-00.03", "completion");
  fs.mkdirSync(completionDir, { recursive: true });
  fs.writeFileSync(path.join(completionDir, "evidence.md"), "R2-00.03 supervisor checks, state-machine tests, hashes and complete gate results.\n", "utf8");
  const gatesPath = path.join(completionDir, "completion-gates.json");
  fs.writeFileSync(gatesPath, `${JSON.stringify({
    "A 代码": "通过", "B 逻辑": "通过", "C 功能": "通过",
    "D 真实使用": "不适用：本项仅建设控制工具", "E 安全": "不适用：本项未改变信任边界",
    "F 数据与回滚": "通过", "G 发布": "不适用：本项不是发布项",
  }, null, 2)}\n`, "utf8");
  const completionSpec = specs.items.find((item) => item.id === "R2-00.03");
  const commandRecords = completionSpec.run.commands.map((expectedCommand, index) => {
    const outputPath = `command-${index + 1}.log`;
    const fullPath = path.join(completionDir, outputPath);
    fs.writeFileSync(fullPath, `PASS ${expectedCommand}\nexitCode=0\n`, "utf8");
    return { expectedCommand, command: expectedCommand, exitCode: 0, outputPath, outputSha256: sha256(fullPath) };
  });
  fs.writeFileSync(path.join(completionDir, "completion-result.json"), `${JSON.stringify({
    itemId: "R2-00.03",
    verificationMode: "control",
    completedVerification: true,
    completedAt: new Date().toISOString(),
    commands: commandRecords,
    evidenceFiles: ["evidence.md", "completion-gates.json"].map((file) => ({ path: file, sha256: sha256(path.join(completionDir, file)) })),
    rollbackEvidence: ["evidence.md"],
  }, null, 2)}\n`, "utf8");
  const completed = run(completionRecorder, ["--plan", completionPlan, "--specs", specsPath, "--item", "R2-00.03", "--evidence", completionDir, "--gates", gatesPath, "--summary", "独立四次状态机与73项规格全部复验通过", ...isolatedCoordinationArgs]);
  const completionText = fs.readFileSync(completionPlan, "utf8");
  check(completed.status === 0 && completionText.includes("| `R2-00.03` | 控制 | 完成 | 1/4 |") && completionText.includes("#### EVIDENCE-R2-00.03｜七道门"), "completion recorder requires gates and writes a validated completion record", `${completed.stdout}${completed.stderr}`);

  const missingSpecPath = path.join(tempRoot, "missing-spec.json");
  fs.writeFileSync(missingSpecPath, `${JSON.stringify({ ...specs, itemCount: 72, items: specs.items.slice(1) }, null, 2)}\n`, "utf8");
  const missing = run(checker, ["--plan", planPath, "--specs", missingSpecPath]);
  check(missing.status !== 0 && `${missing.stdout}${missing.stderr}`.includes("missing execution spec"), "checker rejects a missing execution card and RUN specification");
  const stalePath = path.join(tempRoot, "stale-spec.json");
  const stale = structuredClone(specs);
  stale.items[0].run.commands[0] = "node stale-command.mjs";
  fs.writeFileSync(stalePath, `${JSON.stringify(stale, null, 2)}\n`, "utf8");
  const staleResult = run(checker, ["--plan", planPath, "--specs", stalePath]);
  check(staleResult.status !== 0 && `${staleResult.stdout}${staleResult.stderr}`.includes("stale relative to the current specification templates"), "checker rejects specifications generated from stale templates");

  const waitingRows = parseRows(synthetic).map((row) => ({ ...row }));
  waitingRows.find((row) => row.id === "R2-00.03").state = "完成";
  waitingRows.find((row) => row.id === "R2-00.04").state = "完成";
  waitingRows.find((row) => row.id === "R2-01.09").state = "待人工/外部";
  check(!getReadyQueue(waitingRows).some((row) => row.id === "R2-01.09") && getCurrentItem(waitingRows)?.id !== "R2-01.09", "manual/external waiting does not occupy the writer or block other ready lanes");

  const hardRows = parseRows(planText).map((row) => ({ ...row }));
  hardRows.find((row) => row.id === "R2-03.05").state = "四次失败待最终收尾";
  for (const id of ["R2-04.01", "R2-04.02", "R2-04.03", "R2-04.04", "R2-04.05", "R2-04.06", "R2-04.07", "R2-04.08", "R2-04.09"]) hardRows.find((row) => row.id === id).state = "完成";
  const hardProblems = validateHardGateCompletion(hardRows);
  check(hardProblems.some((problem) => problem.includes("R2-04.09") && problem.includes("R2-03.05")), "a transitive failed ancestor cannot be washed clean by completed intermediate items");

  const byId = new Map(specs.items.map((item) => [item.id, item]));
  check(byId.get("R2-00.03").run.testToAdd.includes("test-round2-supervisor.mjs")
    && byId.get("R2-00.06").run.testToAdd.includes("test-round2-supervisor.mjs")
    && byId.get("R2-01.01").run.testToAdd === "test-tts-auto-preview.mjs"
    && byId.get("R2-02.05").run.testToAdd === "test-hono-cors-redos.mjs"
    && byId.get("R2-02.06").run.testToAdd === "test-brace-expansion-dos.mjs"
    && ["R2-02.01", "R2-02.02", "R2-02.05", "R2-02.06"].every((id) => !byId.get(id).run.commands.includes("pnpm.cmd audit --prod"))
    && byId.get("R2-02.07").run.commands.includes("pnpm.cmd audit --prod")
    && byId.get("R2-04.01").run.commands.some((command) => command.includes("--line cs1") && !command.includes("--bgm"))
    && byId.get("R2-04.02").run.commands.some((command) => command.includes("--line cs1") && command.includes("--bgm"))
    && byId.get("R2-03.04").run.commands.some((command) => command.startsWith("gh pr checks")), "browser, item-scoped security, global dependency audit, production-media and remote-gate items use specific evidence commands");

  const mediaSpec = byId.get("R2-04.01");
  const injectionDir = path.join(tempRoot, ".data", "repair-evidence", "R2-04.01", "injection");
  fs.mkdirSync(injectionDir, { recursive: true });
  fs.writeFileSync(path.join(injectionDir, "media-report.json"), "{\"ok\":true,\"note\":\"synthetic validator attack fixture only\"}\n", "utf8");
  const injectionCommands = mediaSpec.run.commands.map((expectedCommand, index) => {
    const outputPath = `command-${index}.log`;
    const fullPath = path.join(injectionDir, outputPath);
    fs.writeFileSync(fullPath, "fabricated output used only to prove command injection is rejected\n", "utf8");
    return {
      expectedCommand,
      command: index === 0 ? expectedCommand.replace("<本轮最终文件>", "x; exit 0; #") : expectedCommand,
      exitCode: 0,
      outputPath,
      outputSha256: sha256(fullPath),
    };
  });
  fs.writeFileSync(path.join(injectionDir, "completion-result.json"), `${JSON.stringify({
    itemId: "R2-04.01", verificationMode: "production-media", completedVerification: true, completedAt: new Date().toISOString(),
    commands: injectionCommands,
    evidenceFiles: [{ path: "media-report.json", sha256: sha256(path.join(injectionDir, "media-report.json")) }],
    actualEvidence: ["media-report.json"], rollbackEvidence: ["media-report.json"],
  }, null, 2)}\n`, "utf8");
  let injectionRejected = false;
  try {
    validateCompletionEvidencePath("R2-04.01", injectionDir, "production-media", ["D 真实使用", "F 数据与回滚"], mediaSpec.run.commands);
  } catch (error) {
    injectionRejected = error.message.includes("does not match expected command");
  }
  check(injectionRejected, "placeholder values cannot inject shell control operators into completion commands");

  check(validateCoordination(coordination.policy, coordination.assignmentDocument, rows).length === 0, "B-primary dual-machine policy and planned assignments are valid");
  const closeableAssignmentDocument = structuredClone(coordination.assignmentDocument);
  closeableAssignmentDocument.assignments.find((entry) => entry.itemId === "R2-02.02").status = "active";
  const closedAssignmentDocument = closeAssignment(closeableAssignmentDocument, "R2-02.02", "B", "2026-08-05T00:00:00.000Z");
  check(closedAssignmentDocument.assignments.find((entry) => entry.itemId === "R2-02.02")?.status === "closed"
    && closeableAssignmentDocument.assignments.find((entry) => entry.itemId === "R2-02.02")?.status === "active"
    && closedAssignmentDocument.updatedBy === "B", "business completion closes an assignment without mutating the source document");
  check(pathsOverlap("ui/modules", "ui/modules/tts.js") && !pathsOverlap("launch-ui.mjs", "server/core/ssrf-guard.mjs"), "path ownership detects directory overlap without false overlap across separate files");
  let aWriterRejected = false;
  try { assertMasterWriter(coordination.policy, "A", "R2-01.12"); } catch (error) { aWriterRejected = error.message.includes("cannot write the master register"); }
  check(aWriterRejected, "A cannot write the authoritative business register");
  const overlappingAssignments = structuredClone(coordination.assignmentDocument);
  for (const entry of overlappingAssignments.assignments) entry.status = "active";
  overlappingAssignments.assignments[1].allowedPaths.push("launch-ui.mjs");
  check(validateCoordination(coordination.policy, overlappingAssignments, rows).some((problem) => problem.includes("overlap")), "two active machines cannot own overlapping paths");

  const activationPlan = path.join(tempRoot, "activation-plan.md");
  const activationAssignments = path.join(tempRoot, "assignments.json");
  let activationReadyPlan = resetActiveBusinessRows(loggedBusinessPlan);
  for (const id of ["R2-01.12", "R2-02.02"]) activationReadyPlan = forceRow(activationReadyPlan, id, { state: "未开始", attempts: 0 });
  fs.writeFileSync(activationPlan, activationReadyPlan, "utf8");
  const activationReadyAssignments = structuredClone(coordination.assignmentDocument);
  for (const entry of activationReadyAssignments.assignments) entry.status = "planned";
  fs.writeFileSync(activationAssignments, `${JSON.stringify(activationReadyAssignments, null, 2)}\n`, "utf8");
  const aActivation = run(assignmentActivator, ["--machine", "A", "--items", "R2-01.12,R2-02.02", "--plan", activationPlan, "--assignments", activationAssignments, "--policy", coordination.policyPath]);
  check(aActivation.status !== 0 && `${aActivation.stdout}${aActivation.stderr}`.includes("only B may activate assignments"), "A cannot activate source assignments");
  const bActivation = run(assignmentActivator, ["--machine", "B", "--items", "R2-01.12,R2-02.02", "--plan", activationPlan, "--assignments", activationAssignments, "--policy", coordination.policyPath]);
  const activatedRows = parseRows(fs.readFileSync(activationPlan, "utf8"));
  const activatedDocument = JSON.parse(fs.readFileSync(activationAssignments, "utf8"));
  const activatedItemIds = activatedDocument.assignments.filter((entry) => entry.status === "active").map((entry) => entry.itemId).sort();
  check(bActivation.status === 0
    && ["R2-01.12", "R2-02.02"].every((id) => activatedRows.find((row) => row.id === id)?.state === "进行中")
    && JSON.stringify(activatedItemIds) === JSON.stringify(["R2-01.12", "R2-02.02"]), "B atomically activates only the selected non-overlapping A/B pair", `${bActivation.stdout}${bActivation.stderr}`);

  const coreScripts = [checker, packetBuilder, failureRecorder, completionRecorder, assignmentActivator, planLibrary, coordinationLibrary, evidenceProvenanceLibrary].map((file) => fs.readFileSync(file, "utf8")).join("\n");
  check(!coreScripts.includes("01-短视频软件彻底修复执行总表") && coreScripts.includes("master-register.md"), "round-two tools default to the repository master register and never mutate the first-round register");
  check(sha256(firstRoundPath) === firstHash, "first-round register hash remains unchanged by every round-two test");
} finally {
  const resolved = path.resolve(tempRoot);
  const tempBase = path.resolve(os.tmpdir());
  if (!resolved.startsWith(`${tempBase}${path.sep}`)) throw new Error(`unsafe test cleanup target: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

if (process.exitCode) process.exit(process.exitCode);
