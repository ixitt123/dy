import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(rootDir, ".data");
const logPath = path.join(dataDir, "sync.log");
const watchPidPath = path.join(dataDir, "sync-watch.pid");
const isWindows = process.platform === "win32";
const supportsRecursiveWatch = isWindows || process.platform === "darwin";

const DEFAULT_WATCH_DEBOUNCE_MS = 30_000;
const DEFAULT_PULL_INTERVAL_MS = 60_000;

function timestamp() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function writeLog(line) {
  try {
    ensureDataDir();
    fs.appendFileSync(logPath, `[${timestamp()}] ${line}\n`, "utf8");
  } catch {
    // Sync must never block the app from opening just because logging failed.
  }
}

function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        ok: false,
        code: 124,
        stdout,
        stderr: `Command timed out: ${command} ${args.join(" ")}`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, code: 127, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

async function git(args, options = {}) {
  return runCommand("git", args, options);
}

async function gitText(args, options = {}) {
  const result = await git(args, options);
  if (!result.ok && !options.allowFailure) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function pushMessage(result, message, quiet) {
  result.messages.push(message);
  writeLog(message);
  if (!quiet) console.log(message);
}

function isProcessRunning(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function readWatchPid() {
  try {
    const pid = Number(fs.readFileSync(watchPidPath, "utf8").trim());
    return Number.isFinite(pid) ? pid : 0;
  } catch {
    return 0;
  }
}

function writeWatchPid() {
  ensureDataDir();
  fs.writeFileSync(watchPidPath, String(process.pid), "utf8");
}

function clearWatchPid() {
  try {
    if (readWatchPid() === process.pid) fs.unlinkSync(watchPidPath);
  } catch {
    // Best effort cleanup only.
  }
}

function rebaseInProgress() {
  return (
    fs.existsSync(path.join(rootDir, ".git", "rebase-merge")) ||
    fs.existsSync(path.join(rootDir, ".git", "rebase-apply"))
  );
}

async function isGitRepo() {
  const result = await git(["rev-parse", "--is-inside-work-tree"], { timeoutMs: 20_000 });
  return result.ok && result.stdout.trim() === "true";
}

async function currentBranch() {
  const branch = await gitText(["branch", "--show-current"], { allowFailure: true, timeoutMs: 20_000 });
  return branch || "main";
}

async function upstreamRef(branch) {
  const upstream = await gitText(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
    allowFailure: true,
    timeoutMs: 20_000,
  });
  return upstream || `origin/${branch}`;
}

async function workingTreeStatus() {
  return gitText(["status", "--porcelain"], { allowFailure: true, timeoutMs: 20_000 });
}

async function hasDependencyInstall() {
  return fs.existsSync(path.join(rootDir, "node_modules", "@yc-w-cn", "douyin-mcp-server", "package.json"));
}

async function resolvePnpm() {
  const candidates = isWindows
    ? [
        { command: "pnpm.cmd", args: [] },
        { command: "pnpm", args: [] },
        { command: "corepack.cmd", args: ["pnpm"] },
        { command: "corepack", args: ["pnpm"] },
      ]
    : [
        { command: "pnpm", args: [] },
        { command: "corepack", args: ["pnpm"] },
      ];

  for (const candidate of candidates) {
    const result = await runCommand(candidate.command, [...candidate.args, "--version"], { timeoutMs: 20_000 });
    if (result.ok) return candidate;
  }
  return null;
}

async function ensureDependencies(result, quiet) {
  if (await hasDependencyInstall()) return;

  pushMessage(result, "首次启动需要安装项目依赖，正在准备...", quiet);
  const pnpm = await resolvePnpm();
  if (!pnpm) {
    result.ok = false;
    pushMessage(result, "没有找到 pnpm。请先安装 Node.js 22 或更新版本，并启用 pnpm 后再启动。", quiet);
    return;
  }

  const install = await runCommand(pnpm.command, [...pnpm.args, "install", "--frozen-lockfile"], {
    timeoutMs: 10 * 60_000,
  });
  if (!install.ok) {
    result.ok = false;
    pushMessage(result, "依赖安装失败，请打开同步日志 .data/sync.log 查看详情。", quiet);
    writeLog(install.stderr || install.stdout);
    return;
  }

  pushMessage(result, "依赖安装完成。", quiet);
}

async function pullLatest(result, quiet) {
  if (rebaseInProgress()) {
    result.skipped = true;
    pushMessage(result, "检测到上一次同步还在处理冲突，请先解决冲突后再同步。", quiet);
    return;
  }

  const clean = !(await workingTreeStatus());
  if (!clean) {
    result.skipped = true;
    pushMessage(result, "检测到本地有未提交改动，已跳过自动拉取，避免覆盖你的内容。", quiet);
    await ensureDependencies(result, quiet);
    return;
  }

  const branch = await currentBranch();
  const before = await gitText(["rev-parse", "HEAD"], { allowFailure: true, timeoutMs: 20_000 });
  const fetch = await git(["fetch", "origin"], { timeoutMs: 120_000 });
  if (!fetch.ok) {
    result.skipped = true;
    pushMessage(result, "暂时无法连接 GitHub，先使用本机版本打开。", quiet);
    writeLog(fetch.stderr || fetch.stdout);
    await ensureDependencies(result, quiet);
    return;
  }

  const upstream = await upstreamRef(branch);
  const countsText = await gitText(["rev-list", "--left-right", "--count", `HEAD...${upstream}`], {
    allowFailure: true,
    timeoutMs: 20_000,
  });
  const [ahead = 0, behind = 0] = countsText.split(/\s+/).map((value) => Number(value || 0));

  if (behind > 0 && ahead > 0) {
    result.skipped = true;
    pushMessage(result, "GitHub 和本机都有新提交，请先运行“同步项目.bat”处理。", quiet);
    await ensureDependencies(result, quiet);
    return;
  }

  if (behind > 0) {
    const pull = await git(["pull", "--ff-only", "origin", branch], { timeoutMs: 120_000 });
    if (!pull.ok) {
      result.skipped = true;
      pushMessage(result, "拉取 GitHub 最新版本失败，先使用本机版本打开。", quiet);
      writeLog(pull.stderr || pull.stdout);
      await ensureDependencies(result, quiet);
      return;
    }
  } else if (ahead > 0) {
    pushMessage(result, "本机有已提交但未上传的内容，可运行“同步项目.bat”上传到 GitHub。", quiet);
  }

  const after = await gitText(["rev-parse", "HEAD"], { allowFailure: true, timeoutMs: 20_000 });
  result.changed = Boolean(before && after && before !== after);
  if (result.changed) pushMessage(result, "已更新到 GitHub 最新版本。", quiet);

  await ensureDependencies(result, quiet);
}

async function hasStagedChanges() {
  const diff = await git(["diff", "--cached", "--quiet"], { timeoutMs: 20_000 });
  return diff.code === 1;
}

async function uploadChanges(result, quiet, commitMessage) {
  if (!(await isGitRepo())) {
    result.ok = false;
    pushMessage(result, "当前文件夹不是 GitHub 项目，无法同步。", quiet);
    return;
  }

  if (rebaseInProgress()) {
    result.ok = false;
    pushMessage(result, "检测到同步冲突尚未解决。请先处理冲突，再重新运行同步。", quiet);
    return;
  }

  const branch = await currentBranch();
  const status = await workingTreeStatus();
  if (status) {
    const add = await git(["add", "-A"], { timeoutMs: 120_000 });
    if (!add.ok) {
      result.ok = false;
      pushMessage(result, "整理待上传文件失败。", quiet);
      writeLog(add.stderr || add.stdout);
      return;
    }

    if (await hasStagedChanges()) {
      const message = commitMessage || `自动同步 ${timestamp()}`;
      const commit = await git(["commit", "-m", message], {
        timeoutMs: 120_000,
      });
      if (!commit.ok) {
        result.ok = false;
        pushMessage(result, "创建同步记录失败，请检查 Git 用户信息是否已配置。", quiet);
        writeLog(commit.stderr || commit.stdout);
        return;
      }
      pushMessage(result, `本机改动已提交：${message}`, quiet);
    }
  } else {
    pushMessage(result, "本机没有需要提交的新改动。", quiet);
  }

  const pull = await git(["pull", "--rebase", "origin", branch], { timeoutMs: 120_000 });
  if (!pull.ok) {
    result.ok = false;
    pushMessage(result, "同步 GitHub 最新内容时遇到冲突，已停止，避免覆盖另一台电脑的改动。", quiet);
    writeLog(pull.stderr || pull.stdout);
    return;
  }

  const push = await git(["push", "origin", branch], { timeoutMs: 120_000 });
  if (!push.ok) {
    result.ok = false;
    pushMessage(result, "上传到 GitHub 失败，请检查 GitHub 登录状态或网络连接。", quiet);
    writeLog(push.stderr || push.stdout);
    return;
  }

  pushMessage(result, "已同步并上传到 GitHub。", quiet);
}

function shouldIgnoreWatchEvent(fileName) {
  if (!fileName) return false;
  const normalized = String(fileName).replace(/\\/g, "/");
  const firstPart = normalized.split("/")[0];
  if ([".git", "node_modules", ".data"].includes(firstPart)) return true;
  if (normalized === "ui-server.pid" || normalized === "ui-server.url") return true;
  return /\.(log|tmp|sqlite|sqlite-shm|sqlite-wal)$/i.test(normalized);
}

async function watchProject(result, options = {}) {
  const quiet = Boolean(options.quiet);
  const existingPid = readWatchPid();
  if (isProcessRunning(existingPid)) {
    result.skipped = true;
    pushMessage(result, `自动同步监控已在运行，PID：${existingPid}`, quiet);
    return;
  }

  writeWatchPid();
  pushMessage(result, `自动同步监控已启动，PID：${process.pid}`, quiet);

  let busy = false;
  let pending = false;
  let debounceTimer = null;

  const debounceMs = Number(options.debounceMs || DEFAULT_WATCH_DEBOUNCE_MS);
  const pullIntervalMs = Number(options.pullIntervalMs || DEFAULT_PULL_INTERVAL_MS);

  const runCycle = async (reason) => {
    if (busy) {
      pending = true;
      return;
    }

    busy = true;
    try {
      const status = await workingTreeStatus();
      if (status) {
        const message = reason === "watch" ? `自动同步 ${timestamp()}` : "";
        await uploadChanges(result, quiet, message);
      } else if (reason === "interval") {
        await pullLatest(result, quiet);
      }
    } catch (error) {
      result.ok = false;
      const message = error instanceof Error ? error.message : String(error);
      pushMessage(result, `自动同步发生错误：${message}`, quiet);
      writeLog(error instanceof Error && error.stack ? error.stack : message);
    } finally {
      busy = false;
      if (pending) {
        pending = false;
        scheduleUpload();
      }
    }
  };

  const scheduleUpload = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void runCycle("watch");
    }, debounceMs);
  };

  try {
    await pullLatest(result, quiet);
    fs.watch(rootDir, { recursive: supportsRecursiveWatch }, (_eventType, fileName) => {
      if (shouldIgnoreWatchEvent(fileName)) return;
      scheduleUpload();
    });
  } catch (error) {
    result.ok = false;
    const message = error instanceof Error ? error.message : String(error);
    pushMessage(result, `启动自动同步监控失败：${message}`, quiet);
    clearWatchPid();
    return;
  }

  const interval = setInterval(() => {
    void runCycle("interval");
  }, pullIntervalMs);

  const stop = () => {
    clearInterval(interval);
    clearTimeout(debounceTimer);
    clearWatchPid();
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("exit", clearWatchPid);

  await new Promise(() => {});
}

async function stopWatch(result, quiet) {
  const pid = readWatchPid();
  if (!isProcessRunning(pid)) {
    result.skipped = true;
    pushMessage(result, "没有发现正在运行的自动同步监控。", quiet);
    return;
  }

  try {
    process.kill(pid);
    pushMessage(result, `已停止自动同步监控，PID：${pid}`, quiet);
  } catch (error) {
    result.ok = false;
    const message = error instanceof Error ? error.message : String(error);
    pushMessage(result, `停止自动同步监控失败：${message}`, quiet);
  }
}

export async function runSync(options = {}) {
  const quiet = Boolean(options.quiet);
  const mode = options.mode || "startup";
  const result = { ok: true, changed: false, skipped: false, messages: [] };

  if (!(await isGitRepo())) {
    result.skipped = true;
    pushMessage(result, "当前文件夹不是 GitHub 项目，已跳过同步。", quiet);
    return result;
  }

  if (mode === "upload") {
    await uploadChanges(result, quiet, options.commitMessage);
  } else if (mode === "watch") {
    await watchProject(result, options);
  } else if (mode === "stop-watch") {
    await stopWatch(result, quiet);
  } else {
    await pullLatest(result, quiet);
  }

  return result;
}

function readNumberOption(args, name, fallback) {
  const index = args.findIndex((arg) => arg === name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function cliOptions() {
  const args = process.argv.slice(2);
  const messageIndex = args.findIndex((arg) => arg === "--message" || arg === "-m");
  const commitMessage = messageIndex >= 0 ? args[messageIndex + 1] : "";
  let mode = "startup";
  if (args.includes("upload") || args.includes("--upload")) mode = "upload";
  if (args.includes("watch") || args.includes("--watch")) mode = "watch";
  if (args.includes("stop-watch") || args.includes("--stop-watch")) mode = "stop-watch";

  return {
    mode,
    quiet: args.includes("--quiet"),
    commitMessage,
    debounceMs: readNumberOption(args, "--debounce-ms", DEFAULT_WATCH_DEBOUNCE_MS),
    pullIntervalMs: readNumberOption(args, "--pull-interval-ms", DEFAULT_PULL_INTERVAL_MS),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSync(cliOptions())
    .then((result) => {
      if (!result.ok) process.exitCode = 1;
    })
    .catch((error) => {
      writeLog(error instanceof Error ? error.stack || error.message : String(error));
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
