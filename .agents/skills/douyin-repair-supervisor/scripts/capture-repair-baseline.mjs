import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const itemId = process.argv[2] || "00.01";
const defaultPlan = path.join(os.homedir(), "Desktop", "01-短视频软件彻底修复执行总表.md");
const planIndex = process.argv.indexOf("--plan");
const planPath = planIndex >= 0 && process.argv[planIndex + 1]
  ? path.resolve(process.argv[planIndex + 1])
  : defaultPlan;

function stop(message) {
  console.error(`[repair-baseline] FAIL: ${message}`);
  process.exit(1);
}

function git(args, allowFailure = false) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (allowFailure) return "";
    stop(`git ${args.join(" ")} failed: ${error.stderr?.trim() || error.message}`);
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function nulList(args) {
  return git(args).split("\0").filter(Boolean);
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function fileDigest(relativePath) {
  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) return { path: relativePath, state: "missing" };
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile()) return { path: relativePath, state: stat.isDirectory() ? "directory" : "non-file" };
  return {
    path: relativePath,
    state: "file",
    bytes: stat.size,
    sha256: sha256(fs.readFileSync(absolutePath)),
  };
}

if (!fs.existsSync(path.join(process.cwd(), ".git"))) stop("run from the repository root containing .git");
if (!fs.existsSync(planPath)) stop(`missing plan: ${planPath}`);

const outputDir = path.join(process.cwd(), ".data", "repair-evidence", itemId, timestamp());
fs.mkdirSync(outputDir, { recursive: true });

const stagedPaths = nulList(["diff", "--cached", "--name-only", "-z", "--no-renames"]);
const unstagedPaths = nulList(["diff", "--name-only", "-z", "--no-renames"]);
const untrackedPaths = nulList(["ls-files", "--others", "--exclude-standard", "-z"]);
const changedPaths = unique([...stagedPaths, ...unstagedPaths, ...untrackedPaths]);
const planBytes = fs.readFileSync(planPath);

const gitState = {
  capturedAt: new Date().toISOString(),
  repository: process.cwd(),
  branch: git(["branch", "--show-current"]).trim(),
  head: git(["rev-parse", "HEAD"]).trim(),
  upstream: git(["rev-parse", "--abbrev-ref", "@{u}"], true).trim() || null,
  upstreamHead: git(["rev-parse", "@{u}"], true).trim() || null,
  remotes: git(["remote", "-v"]).trim().split(/\r?\n/).filter(Boolean),
  submodules: git(["submodule", "status"], true).trim().split(/\r?\n/).filter(Boolean),
  status: git(["status", "--short", "--branch"]).trim().split(/\r?\n/).filter(Boolean),
  stagedNameStatus: git(["diff", "--cached", "--name-status", "--no-renames"]).trim().split(/\r?\n/).filter(Boolean),
  unstagedNameStatus: git(["diff", "--name-status", "--no-renames"]).trim().split(/\r?\n/).filter(Boolean),
};

const inventory = {
  staged: stagedPaths.map(fileDigest),
  unstaged: unstagedPaths.map(fileDigest),
  untracked: untrackedPaths.map(fileDigest),
  uniqueChangedPaths: changedPaths.map(fileDigest),
};

const baseline = {
  itemId,
  capturedAt: gitState.capturedAt,
  planPath,
  planSha256: sha256(planBytes),
  gitStateSha256: sha256(Buffer.from(JSON.stringify(gitState))),
  inventorySha256: sha256(Buffer.from(JSON.stringify(inventory))),
  changedFileCount: changedPaths.length,
  note: "此基线只记录元数据、路径、大小和哈希；不复制差异内容，不包含 settings、数据库、媒体或密钥。",
};

for (const [name, value] of Object.entries({
  "baseline.json": `${JSON.stringify(baseline, null, 2)}\n`,
  "git-state.json": `${JSON.stringify(gitState, null, 2)}\n`,
  "file-inventory.json": `${JSON.stringify(inventory, null, 2)}\n`,
})) {
  fs.writeFileSync(path.join(outputDir, name), value, "utf8");
}

const manifestEntries = ["baseline.json", "git-state.json", "file-inventory.json"].map((name) => {
  const content = fs.readFileSync(path.join(outputDir, name));
  return `${sha256(content)}  ${name}`;
});
fs.writeFileSync(path.join(outputDir, "manifest.sha256"), `${manifestEntries.join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "handoff.md"), `# ${itemId} 可验证修复基线\n\n- 证据目录：${outputDir}\n- 基线并非物理 WORM 存储；它通过 manifest.sha256 和桌面执行表中的路径实现内容可核验。\n- 已记录：分支、提交、上游、子模块、工作树状态、暂存/未暂存/未跟踪文件的路径、大小和 SHA-256。\n- 未复制任何差异正文、设置、数据库、媒体或密钥。\n- 安全恢复原则：不得用 git reset --hard、git checkout --、stash 或覆盖原件来“回滚”。如需回退，先对照本目录哈希定位目标，再由获得明确授权的人执行最小、可逆的恢复操作。\n`, "utf8");

console.log(`[repair-baseline] OK: ${outputDir}`);
console.log(`[repair-baseline] changed-files=${changedPaths.length}`);
console.log(`[repair-baseline] plan-sha256=${baseline.planSha256}`);
