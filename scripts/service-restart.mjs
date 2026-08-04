// scripts/service-restart.mjs
//
// 服务重启测试工具（01.04）。
// 提供 8787 / 8080 服务的停止、启动、健康检查、任务恢复验证能力。
// 配合 browser-cdp.mjs 可验证"服务重启 + 浏览器刷新后任务恢复"。
//
// 用途（05.05 / 09.06 重启恢复验收）：
//   - 测试 8787（ui-server）重启后任务从 SQLite 恢复；
//   - 测试 8080（MoneyPrinter）重启后官方任务映射恢复；
//   - 测试浏览器刷新后页面状态恢复。

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// 通过 netstat -ano 查找占用端口的 pid
export function findPidByPort(port) {
  const res = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
  const lines = (res.stdout || "").split(/\r?\n/);
  for (const line of lines) {
    if (line.includes(`:${port}`) && line.includes("LISTENING")) {
      const parts = line.trim().split(/\s+/);
      return Number(parts[parts.length - 1]);
    }
  }
  return null;
}

// 只终止占用端口的服务进程。不能使用 /T，否则当服务由桌面启动器拉起时，
// Windows 可能把测试控制进程也判为同一进程树成员并一并终止。
export function killPid(pid) {
  if (!pid) return false;
  try {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/F"], { encoding: "utf8" });
    if (result.status === 0) return true;
  } catch {
    // Fall through to Node's process termination below.
  }
  try { process.kill(pid); return true; } catch { return false; }
}

export function pidIsRunning(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function waitForPidExit(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pidIsRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !pidIsRunning(pid);
}

// 等待 URL 可访问（健康检查）
export async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 401) return true; // 401 也算服务在跑（只是没 cookie）
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// 确认服务已停止（URL 不可访问）
export async function confirmStopped(baseUrl, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      return true; // 连接失败说明已停止
    }
  }
  return false;
}

// 获取访问 baseUrl 的本地 cookie
export async function getCookie(baseUrl) {
  const res = await fetch(baseUrl);
  const sc = res.headers.get("set-cookie") || "";
  return sc.split(";")[0];
}

// 获取 /api/status
export async function getStatus(baseUrl) {
  const cookie = await getCookie(baseUrl);
  const res = await fetch(`${baseUrl}/api/status`, { headers: { cookie } });
  if (!res.ok) throw new Error(`/api/status 状态 ${res.status}`);
  return res.json();
}

// 启动 ui-server（detached，测试退出后继续运行）
export function startUiServer(cwd) {
  const child = spawn(process.execPath, ["ui-server.mjs", "--no-auto-close"], {
    cwd,
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  });
  child.unref();
  return child;
}

export function resolveMoneyPrinterRuntime(cwd, rootDir = "") {
  const root = path.resolve(rootDir || process.env.MONEY_PRINTER_TURBO_ROOT || path.join(cwd, "integrations", "moneyprinterturbo"));
  const pythonPath = path.join(root, ".venv", "Scripts", "python.exe");
  const entryPath = path.join(root, "main.py");
  if (!fs.existsSync(entryPath)) throw new Error(`MoneyPrinter 入口不存在：${entryPath}`);
  if (fs.existsSync(pythonPath)) {
    return { root, pythonPath, entryPath, command: pythonPath, args: [entryPath], mode: "venv" };
  }
  const uvCheck = spawnSync("uv", ["--version"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (uvCheck.status === 0) {
    return {
      root,
      pythonPath: "",
      entryPath,
      command: "uv",
      args: ["run", "--frozen", "python", entryPath],
      mode: "uv",
    };
  }
  throw new Error(`MoneyPrinter 无可用 Python 运行时：既无 ${pythonPath}，PATH 中也无 uv`);
}

// 使用项目已安装的虚拟环境启动真实 8080 API；已有实例时只复用，不重复启动。
export function startMoneyPrinter(cwd, options = {}) {
  const existingPid = findPidByPort(8080);
  if (existingPid) return { child: null, pid: existingPid, existing: true };
  const runtime = resolveMoneyPrinterRuntime(cwd, options.rootDir || "");
  const child = spawn(runtime.command, runtime.args, {
    cwd: runtime.root,
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  });
  child.unref();
  return { child, pid: child.pid, existing: false, runtime };
}

export async function getMoneyPrinterTasks(baseUrl = "http://127.0.0.1:8080") {
  const res = await fetch(`${baseUrl}/api/v1/tasks?page=1&page_size=100`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`MoneyPrinter tasks 状态 ${res.status}`);
  const payload = await res.json();
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

// 停止指定端口的服务
export async function stopService(port, baseUrl) {
  const pid = findPidByPort(port);
  if (!pid) return { stopped: true, pid: null, reason: "端口无服务" };
  killPid(pid);
  const [endpointStopped, processStopped] = await Promise.all([
    confirmStopped(baseUrl, 5000),
    waitForPidExit(pid, 5000),
  ]);
  const stopped = endpointStopped && processStopped;
  return { stopped, pid, reason: stopped ? "已停止" : `停止失败(endpoint=${endpointStopped}, process=${processStopped})` };
}
