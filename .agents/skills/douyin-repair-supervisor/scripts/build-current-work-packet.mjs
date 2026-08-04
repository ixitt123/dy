import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const filename = "01-短视频软件彻底修复执行总表.md";
const args = process.argv.slice(2);
const planIndex = args.indexOf("--plan");
const outputIndex = args.indexOf("--output");
const planPath = planIndex >= 0 && args[planIndex + 1]
  ? path.resolve(args[planIndex + 1])
  : path.join(os.homedir(), "Desktop", filename);
const explicitOutput = outputIndex >= 0 && args[outputIndex + 1]
  ? path.resolve(args[outputIndex + 1])
  : "";

function stop(message) {
  console.error(`[repair-packet] FAIL: ${message}`);
  process.exit(1);
}

function runGit(parameters) {
  try {
    return execFileSync("git", parameters, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    stop(`git ${parameters.join(" ")} failed: ${error.stderr?.trim() || error.message}`);
  }
}

function section(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  if (start < 0) return "";
  const rest = source.slice(start);
  const startHeadingEnd = rest.indexOf("\n") + 1;
  const endRelative = rest.slice(startHeadingEnd).search(endPattern);
  return endRelative < 0
    ? rest.trim()
    : rest.slice(0, startHeadingEnd + endRelative).trim();
}

if (!fs.existsSync(planPath)) stop(`missing plan: ${planPath}`);
if (!fs.existsSync(path.join(process.cwd(), ".git"))) {
  stop("run from the repository root containing .git");
}

const text = fs.readFileSync(planPath, "utf8");
const rowPattern = /^\|\s*`(?<id>\d{2}\.\d{2})`\s*\|\s*(?<state>[^|]+?)\s*\|\s*(?<depends>[^|]+?)\s*\|\s*(?<title>[^|]+?)\s*\|\s*(?<accept>[^|]+?)\s*\|$/gm;
const rows = [...text.matchAll(rowPattern)].map((match) => ({
  id: match.groups.id,
  state: match.groups.state.trim(),
  depends: match.groups.depends.trim(),
  title: match.groups.title.trim(),
  accept: match.groups.accept.trim(),
}));
const current = rows.find((row) => !["完成", "不适用", "二次失败待最终收尾"].includes(row.state));
if (!current) stop("all repair items are terminal; no current work packet to build");

const escapedId = current.id.replace(".", "\\.");
const card = section(
  text,
  new RegExp(`^###\\s+${escapedId}｜`, "m"),
  /^###\s+\d{2}\.\d{2}｜|^##\s+/m,
);
const runSpec = section(
  text,
  new RegExp(`^####\\s+RUN-${escapedId}｜`, "m"),
  /^####\s+RUN-\d{2}\.\d{2}｜|^##\s+/m,
);
if (!card) stop(`missing execution card for ${current.id}`);
if (!runSpec) stop(`missing RUN specification for ${current.id}`);

const escapedAttemptId = current.id.replace(".", "\\.");
const failedAttempts = [...text.matchAll(new RegExp(
  `^####\\s+ATTEMPT-(?<number>\\d+)-${escapedAttemptId}｜失败\\s*$`,
  "gm",
))].map((match) => Number(match.groups.number));
if (failedAttempts.length > 1 || failedAttempts.some((number) => number > 1)) {
  stop(`item ${current.id} has exhausted its ordinary repair budget and must not receive another work packet`);
}
const remainingAttempts = 2 - failedAttempts.length;

const overview = section(text, /^## 2｜当前源码快照/m, /^## 3｜/m);
const stateRules = section(text, /^## 4｜状态、顺序和完成规则/m, /^## 5｜/m);
const prompt = section(text, /^## 5｜统一维修智能体提示词/m, /^## 6｜/m);
const baseline = section(text, /^## 7｜全功能保全基线 F01–F24/m, /^## 8｜/m);
const closure = section(text, /^## 12｜Codex 收尾协议/m, /^## 13｜/m);

const now = new Date();
const pad = (value) => String(value).padStart(2, "0");
const safeTimestamp = [
  now.getFullYear(),
  pad(now.getMonth() + 1),
  pad(now.getDate()),
  "-",
  pad(now.getHours()),
  pad(now.getMinutes()),
  pad(now.getSeconds()),
].join("");
const evidenceDir = explicitOutput
  ? path.dirname(explicitOutput)
  : path.join(process.cwd(), ".data", "repair-evidence", current.id, safeTimestamp);
const outputPath = explicitOutput || path.join(evidenceDir, "current-work-packet.md");
fs.mkdirSync(evidenceDir, { recursive: true });

const baselineRecord = {
  itemId: current.id,
  generatedAt: now.toISOString(),
  planPath,
  planSha256: crypto.createHash("sha256").update(text).digest("hex"),
  branch: runGit(["branch", "--show-current"]),
  head: runGit(["rev-parse", "HEAD"]),
  upstream: runGit(["rev-parse", "--abbrev-ref", "@{u}"]),
  upstreamHead: runGit(["rev-parse", "@{u}"]),
  submoduleHead: runGit(["-C", "integrations/moneyprinterturbo", "rev-parse", "HEAD"]),
  status: runGit(["status", "--short"]).split(/\r?\n/).filter(Boolean),
};
fs.writeFileSync(
  path.join(evidenceDir, "baseline.json"),
  `${JSON.stringify(baselineRecord, null, 2)}\n`,
  "utf8",
);

const packet = `# 当前维修任务包｜${current.id} ${current.title}

> 生成时间：${baselineRecord.generatedAt}
> 总表：${planPath}
> 总表 SHA-256：${baselineRecord.planSha256}
> 当前状态：${current.state}
> 已失败维修轮数：${failedAttempts.length}
> 剩余普通维修轮数：${remainingAttempts}
> 依赖：${current.depends}
> 完成判定：${current.accept}
> 证据目录：${evidenceDir}

## 开工顺序

1. 先运行计划检查器，确认当前项目仍为 \`${current.id}\`。
2. 阅读本包中的状态规则、执行卡和 RUN-SPEC。
3. 把总表状态改为“进行中”并新增开始日志，再修改源码。
4. 先取得失败证据，再做本轮能安全完成的最小根因修复并执行完整复验。纯定位不计次；一次完整复验未达到验收目标就计一次，不区分源码问题、人工授权、付费外部服务、PR/CI/main 或用户验收阻塞。
5. 每次失败必须运行 \`record-repair-failure.mjs\` 登记真实证据；第二次失败由脚本自动转“二次失败待最终收尾”并解锁下一项，禁止第三次。后续回归发现旧编号问题只登记，不重开、不插队。

${overview}

${stateRules}

${prompt}

## 当前项目执行卡

${card}

## 当前项目直接执行规范

${runSpec}

${baseline}

${closure}

## 本次基线

\`\`\`json
${JSON.stringify(baselineRecord, null, 2)}
\`\`\`

## 完成前必须回填

- [ ] 修复前复现证据和失败原因
- [ ] 真实调用链和唯一状态所有者
- [ ] 修改文件与差异范围
- [ ] 修复前失败、修复后通过的回归结果
- [ ] 浏览器/媒体/重启/安全证据（按适用）
- [ ] F01–F24 影响与回归
- [ ] 历史数据影响、原件、回填和回滚
- [ ] 五道门 EVIDENCE-${current.id} 证据块
- [ ] 总表状态、日志和下一唯一项目
`;

fs.writeFileSync(outputPath, `${packet.trimEnd()}\n`, "utf8");
console.log(`[repair-packet] OK: ${outputPath}`);
console.log(`[repair-packet] item=${current.id} state=${current.state}`);
console.log(`[repair-packet] baseline=${path.join(evidenceDir, "baseline.json")}`);
