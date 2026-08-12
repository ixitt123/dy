import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getCurrentItem, getReadyQueue, parseRows, readPlan, resolvePlanPath } from "./round2-plan-lib.mjs";
import { assignmentFor, option, readCoordination } from "./round2-coordination-lib.mjs";

const args = process.argv.slice(2);
const planPath = resolvePlanPath(args);
const outputIndex = args.indexOf("--output");
const specsIndex = args.indexOf("--specs");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(scriptDir, "check-round2-plan.mjs");
const specsPath = path.resolve(specsIndex >= 0 && args[specsIndex + 1]
  ? args[specsIndex + 1]
  : path.join(scriptDir, "..", "references", "round2-execution-specs.json"));

function stop(message) {
  console.error(`[round2-packet] FAIL: ${message}`);
  process.exit(1);
}

function git(parameters) {
  return execFileSync("git", parameters, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function optionalUpstream(parameters) {
  const result = spawnSync("git", parameters, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

try {
  const coordination = readCoordination(args);
  const checked = spawnSync(process.execPath, [
    checker,
    "--plan", planPath,
    "--specs", specsPath,
    "--assignments", coordination.assignmentsPath,
    "--policy", coordination.policyPath,
  ], { cwd: process.cwd(), encoding: "utf8" });
  if (checked.status !== 0) stop(`plan validation failed\n${checked.stdout}${checked.stderr}`);

  const planText = readPlan(planPath);
  const rows = parseRows(planText);
  const requestedItem = option(args, "--item");
  const machine = option(args, "--machine").toUpperCase();
  const current = requestedItem ? rows.find((row) => row.id === requestedItem) : getCurrentItem(rows);
  if (!current) stop("all round-two items are terminal; no work packet can be built");
  let assignment = null;
  if (!current.id.startsWith("R2-00.")) {
    if (!new Set(["A", "B"]).has(machine)) stop("business work packets require --machine A or --machine B");
    assignment = assignmentFor(coordination.assignmentDocument, current.id, machine);
    if (!assignment) stop(`item ${current.id} is not assigned to machine ${machine}`);
    const ready = getReadyQueue(rows).some((row) => row.id === current.id);
    if (!ready && !new Set(["进行中", "待复验"]).has(current.state)) stop(`item ${current.id} is not dependency-ready or active`);
  }
  const specDocument = JSON.parse(fs.readFileSync(specsPath, "utf8"));
  const spec = specDocument.items.find((item) => item.id === current.id);
  if (!spec) stop(`missing execution spec for ${current.id}`);

  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const defaultDir = path.join(process.cwd(), ".data", "repair-evidence", current.id, stamp);
  const explicitOutput = outputIndex >= 0 && args[outputIndex + 1] ? path.resolve(args[outputIndex + 1]) : "";
  const outputPath = explicitOutput || path.join(defaultDir, "current-work-packet.md");
  const evidenceDir = explicitOutput ? path.dirname(outputPath) : defaultDir;
  fs.mkdirSync(evidenceDir, { recursive: true });

  const baseline = {
    itemId: current.id,
    machine: machine || "control",
    assignment,
    generatedAt: now.toISOString(),
    planPath,
    planSha256: crypto.createHash("sha256").update(planText).digest("hex"),
    specsPath,
    specsSha256: crypto.createHash("sha256").update(fs.readFileSync(specsPath)).digest("hex"),
    branch: git(["branch", "--show-current"]),
    head: git(["rev-parse", "HEAD"]),
    upstream: optionalUpstream(["rev-parse", "--abbrev-ref", "@{u}"]),
    upstreamHead: optionalUpstream(["rev-parse", "@{u}"]),
    gitStatus: git(["status", "--short"]).split(/\r?\n/).filter(Boolean),
    readyQueue: getReadyQueue(rows).map((row) => row.id),
  };
  fs.writeFileSync(path.join(evidenceDir, "baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");

  const packet = `# 第二轮当前维修任务包｜${current.id} ${current.title}

> 生成时间：${baseline.generatedAt}
> 第二轮总表：${planPath}
> 状态与次数：${current.state}｜${current.attempts}/4
> 车道与优先级：${current.lane}｜${current.priority}
> 人工：${current.manual ? "是" : "否"}
> 依赖：${current.dependencies.join(",") || "无"}
> 就绪队列：${baseline.readyQueue.join(",") || "无"}
> 证据目录：${evidenceDir}
> 执行电脑：${baseline.machine}
> 分支与允许路径：${assignment ? `${assignment.branch}｜${assignment.allowedPaths.join("、")}` : "控制项按当前控制分支"}

## 修改前强制研究

- 业务源码修改前必须完成全网检索，优先官方文档、上游仓库和一手资料。
- 研究记录必须写入：${assignment?.researchRecord || `docs/repair/round2/research/${current.id}.md`}
- 未完成研究记录时，只能诊断和取证，不得修改业务源码。

## 完成判定

${current.acceptance}

## 执行卡

- 范围：${spec.card.scope}
- 修复前失败回归：${spec.card.failingRegression}
- 真实证据：${spec.card.realEvidence}
- 回滚：${spec.card.rollback}
- 升级条件：${spec.card.escalation}

### 有序动作

${spec.card.orderedActions.map((value, index) => `${index + 1}. ${value}`).join("\n")}

### 禁止捷径

${spec.card.prohibitedShortcuts.map((value) => `- ${value}`).join("\n")}

## RUN-${current.id}

### 源码锚点

${spec.run.sourceAnchors.map((value) => `- \`${value}\``).join("\n")}

### 命令

${spec.run.commands.map((value) => `- \`${value}\``).join("\n")}

### 必须新增或更新的回归

- \`${spec.run.testToAdd}\`

### 证据要求

- ${spec.run.requiredEvidence}
- ${spec.run.evidenceDir}

## 四次状态机

- 第 1–3 次完整复验失败：次数递增、状态转为“待复验”，本项保留。
- 第 4 次完整复验失败：次数变为 4/4、状态转为“四次失败待最终收尾”，排程推进。
- 第 5 次普通维修或失败登记：拒绝。
- “四次失败待最终收尾”只解锁排程，不算完成，不能满足硬门禁。

## 本次基线

\`\`\`json
${JSON.stringify(baseline, null, 2)}
\`\`\`
`;
  fs.writeFileSync(outputPath, packet, "utf8");
  console.log(`[round2-packet] OK: ${outputPath}`);
  console.log(`[round2-packet] item=${current.id} state=${current.state} attempts=${current.attempts}/4`);
  console.log(`[round2-packet] baseline=${path.join(evidenceDir, "baseline.json")}`);
} catch (error) {
  stop(error.stderr?.trim() || error.message);
}
