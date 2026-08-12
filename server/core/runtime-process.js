import { spawnSync } from "node:child_process";

export function runtimeCommandMatches(commandLine, expectedEntryPath) {
  const command = String(commandLine || "").trim().toLowerCase().replaceAll("\\", "/");
  const entryPath = String(expectedEntryPath || "").trim().toLowerCase().replaceAll("\\", "/");
  return Boolean(command && entryPath && command.includes(entryPath));
}

export function windowsProcessCommandLine(pid) {
  const normalizedPid = Number(pid);
  if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) return "";
  const script = [
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    `$runtimeProcess = Get-CimInstance Win32_Process -Filter 'ProcessId = ${normalizedPid}' -ErrorAction SilentlyContinue`,
    "if ($null -ne $runtimeProcess) { [Console]::Out.Write($runtimeProcess.CommandLine) }",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5_000,
  });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout || "").trim();
}

export function runtimeProcessIsRunning(pid, {
  expectedEntryPath,
  platform = process.platform,
  signalProcess = process.kill.bind(process),
  commandLineLookup = windowsProcessCommandLine,
} = {}) {
  const normalizedPid = Number(pid);
  if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) return false;
  try {
    signalProcess(normalizedPid, 0);
  } catch {
    return false;
  }
  if (platform !== "win32") return true;
  const commandLine = commandLineLookup(normalizedPid);
  if (commandLine === null) return true;
  return runtimeCommandMatches(commandLine, expectedEntryPath);
}
