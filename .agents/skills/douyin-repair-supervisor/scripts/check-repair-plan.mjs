import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const filename = "01-短视频软件彻底修复执行总表.md";
const args = process.argv.slice(2);
const planIndex = args.indexOf("--plan");
const planPath = planIndex >= 0 && args[planIndex + 1]
  ? path.resolve(args[planIndex + 1])
  : path.join(os.homedir(), "Desktop", filename);

function fail(message) {
  console.error(`[repair-plan] FAIL: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(planPath)) {
  fail(`missing plan: ${planPath}`);
  process.exit();
}

const text = fs.readFileSync(planPath, "utf8");
const expectedCounts = [5, 5, 6, 6, 12, 7, 6, 7, 4, 6, 7, 5, 7];
const expectedIds = expectedCounts.flatMap((count, phase) =>
  Array.from({ length: count }, (_, index) =>
    `${String(phase).padStart(2, "0")}.${String(index + 1).padStart(2, "0")}`));
const skippedState = "二次失败待最终收尾";
const sequenceTerminalStates = new Set(["完成", "不适用", skippedState]);
const allowedStates = new Set(["未开始", "进行中", "阻塞", "待复验", "待 Codex 收尾", skippedState, "完成", "不适用"]);
const rowPattern = /^\|\s*`(?<id>\d{2}\.\d{2})`\s*\|\s*(?<state>[^|]+?)\s*\|\s*(?<depends>[^|]+?)\s*\|/gm;
const rows = [...text.matchAll(rowPattern)].map((match) => ({
  id: match.groups.id,
  state: match.groups.state.trim(),
  depends: match.groups.depends.trim(),
}));
const problems = [];

if (rows.length !== expectedIds.length) {
  problems.push(`expected ${expectedIds.length} repair rows, found ${rows.length}`);
}

const seen = new Set();
for (const row of rows) {
  if (seen.has(row.id)) problems.push(`duplicate repair row ${row.id}`);
  seen.add(row.id);
  if (!allowedStates.has(row.state)) problems.push(`invalid state for ${row.id}: ${row.state}`);
}

for (const id of expectedIds) {
  if (!seen.has(id)) problems.push(`missing repair row ${id}`);
}

for (let index = 0; index < Math.min(rows.length, expectedIds.length); index += 1) {
  if (rows[index].id !== expectedIds[index]) {
    problems.push(`out of order at row ${index + 1}: expected ${expectedIds[index]}, found ${rows[index].id}`);
    break;
  }
  const expectedDependency = index === 0 ? "无" : expectedIds[index - 1];
  if (rows[index].depends !== expectedDependency) {
    problems.push(`invalid dependency for ${rows[index].id}: expected ${expectedDependency}, found ${rows[index].depends}`);
  }
}

const activeRows = rows.filter((row) => ["进行中", "阻塞", "待复验", "待 Codex 收尾"].includes(row.state));
if (activeRows.length > 1) {
  problems.push(`more than one active item: ${activeRows.map((row) => row.id).join(", ")}`);
}

let unfinishedSeen = false;
for (const row of rows) {
  const terminal = sequenceTerminalStates.has(row.state);
  if (!terminal) unfinishedSeen = true;
  if (terminal && unfinishedSeen) {
    problems.push(`completed item ${row.id} appears after an unfinished item`);
  }
}

const firstUnfinished = rows.find((row) => !sequenceTerminalStates.has(row.state));
const currentMatch = text.match(/^\|\s*当前唯一允许开始的项目\s*\|\s*(?:`(?<id>\d{2}\.\d{2})`|(?<none>无))\s*\|/m);
if (firstUnfinished && !currentMatch) {
  problems.push("missing current allowed item in status table");
} else if (firstUnfinished && currentMatch.groups.id !== firstUnfinished.id) {
  problems.push(`current allowed item is ${currentMatch.groups.id}, expected ${firstUnfinished.id}`);
} else if (!firstUnfinished && currentMatch && !currentMatch.groups.none) {
  problems.push(`current allowed item is ${currentMatch.groups.id}, expected none`);
}

const completedCountMatch = text.match(/^\|\s*当前完成数\s*\|\s*(?<count>\d+)\s*\|/m);
const skippedCountMatch = text.match(/^\|\s*当前二次失败待最终收尾数\s*\|\s*(?<count>\d+)\s*\|/m);
const actualCompletedCount = rows.filter((row) => row.state === "完成").length;
const actualSkippedCount = rows.filter((row) => row.state === skippedState).length;
if (!completedCountMatch || Number(completedCountMatch.groups.count) !== actualCompletedCount) {
  problems.push(`completed dashboard count must be ${actualCompletedCount}`);
}
if (!skippedCountMatch || Number(skippedCountMatch.groups.count) !== actualSkippedCount) {
  problems.push(`two-failure dashboard count must be ${actualSkippedCount}`);
}

for (const id of expectedIds) {
  const escapedId = id.replace(".", "\\.");
  if (!new RegExp(`^###\\s+${escapedId}｜`, "m").test(text)) {
    problems.push(`missing detailed execution card for ${id}`);
  }
  if (!new RegExp(`^####\\s+RUN-${escapedId}｜`, "m").test(text)) {
    problems.push(`missing direct run specification for ${id}`);
  }
}

const logHeading = text.match(/^##\s+\d+｜维修更新日志\s*$/m);
const logSection = logHeading ? text.slice(logHeading.index + logHeading[0].length) : "";
if (!logHeading) problems.push("missing repair update log section");
for (const row of rows) {
  const escapedId = row.id.replace(".", "\\.");
  const attemptNumbers = [...logSection.matchAll(new RegExp(
    `^####\\s+ATTEMPT-(?<number>\\d+)-${escapedId}｜失败\\s*$`,
    "gm",
  ))].map((match) => Number(match.groups.number));
  const uniqueAttempts = new Set(attemptNumbers);
  if (attemptNumbers.length > 2 || uniqueAttempts.size !== attemptNumbers.length || attemptNumbers.some((number) => number > 2)) {
    problems.push(`item ${row.id} exceeds the two-attempt repair limit`);
  }
  if (attemptNumbers.includes(2) && row.state !== skippedState) {
    problems.push(`item ${row.id} has two failed attempts but is not ${skippedState}`);
  }
  if (row.state === skippedState) {
    if (attemptNumbers.length !== 2 || !attemptNumbers.includes(1) || !attemptNumbers.includes(2)) {
      problems.push(`skipped item ${row.id} must have exactly ATTEMPT-1 and ATTEMPT-2 failure records`);
    }
    const autoSkipMatch = logSection.match(new RegExp(
      `^####\\s+AUTO-SKIP-${escapedId}｜二次失败待最终收尾\\s*$\\n(?<body>[\\s\\S]*?)(?=^####\\s+|^###\\s+LOG-|(?![\\s\\S]))`,
      "m",
    ));
    if (!autoSkipMatch) {
      problems.push(`skipped item ${row.id} has no AUTO-SKIP block`);
    } else {
      for (const field of ["自动状态：二次失败待最终收尾", "禁止第三次维修：是", "下一唯一允许项："]) {
        if (!autoSkipMatch.groups.body.includes(field)) {
          problems.push(`skipped item ${row.id} AUTO-SKIP block missing ${field}`);
        }
      }
    }
  }
  if (row.state === "未开始") continue;
  if (!new RegExp(`^###\\s+LOG-[^\\n]*｜项目\\s+${escapedId}\\s*$`, "m").test(logSection)) {
    problems.push(`item ${row.id} has state ${row.state} but no update-log entry`);
  }
  const evidenceMatch = logSection.match(new RegExp(
    `^####\\s+EVIDENCE-${escapedId}｜[^\\n]*\\n(?<body>[\\s\\S]*?)(?=^####\\s+EVIDENCE-|^###\\s+LOG-|(?![\\s\\S]))`,
    "m",
  ));
  if (row.state === "完成") {
    if (!evidenceMatch) {
      problems.push(`completed item ${row.id} has no EVIDENCE block`);
      continue;
    }
    for (const gate of ["A 代码", "B 逻辑", "C 功能", "D 真实使用", "E 发布"]) {
      const escapedGate = gate.replace(" ", "\\s+");
      const gatePattern = new RegExp(`^-\\s*Gate\\s+${escapedGate}：\\s*(通过|不适用：\\S.+)$`, "m");
      if (!gatePattern.test(evidenceMatch.groups.body)) {
        problems.push(`completed item ${row.id} missing acceptable Gate ${gate} result`);
      }
    }
    const evidencePath = evidenceMatch.groups.body.match(/^- 真实证据路径：\s*(?<value>.+)$/m)?.groups.value.trim();
    if (!evidencePath || /^(无|未验证|未运行|N\/A)$/i.test(evidencePath)) {
      problems.push(`completed item ${row.id} has no real evidence path`);
    }
  }
  if (row.state === "不适用") {
    if (!evidenceMatch || !/^- 不适用原因：\s*\S.+$/m.test(evidenceMatch.groups.body)) {
      problems.push(`not-applicable item ${row.id} has no documented reason`);
    }
  }
}

if (problems.length > 0) {
  problems.forEach(fail);
} else {
  const counts = Object.fromEntries([...allowedStates].map((state) => [
    state,
    rows.filter((row) => row.state === state).length,
  ]));
  console.log(`[repair-plan] OK: ${planPath}`);
  console.log(`[repair-plan] items=${rows.length} next=${firstUnfinished?.id || "none"}`);
  console.log(`[repair-plan] states=${JSON.stringify(counts)}`);
}
