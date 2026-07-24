$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSCommandPath
$Startup = [Environment]::GetFolderPath("Startup")
$LegacyShortcutPath = Join-Path $Startup "dy-codex-auto-sync.lnk"
$ShortcutPath = Join-Path $Startup "dy-codex-change-reminder.lnk"
$Launcher = Join-Path $Root "auto-sync.vbs"
$ChineseLauncher = Join-Path $Root "自动同步.vbs"

if (-not (Test-Path -LiteralPath $Launcher) -and (Test-Path -LiteralPath $ChineseLauncher)) {
  $Launcher = $ChineseLauncher
}

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
  throw "Node.js was not found. Install Node.js 24 first."
}

$NodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($NodeMajor -ne 24) {
  throw "Node.js 24 is required. Current major version: $NodeMajor"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git was not found. Install Git for Windows first."
}

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "Auto sync launcher was not found: $Launcher"
}

$Shell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $LegacyShortcutPath) {
  Remove-Item -LiteralPath $LegacyShortcutPath -Force
}
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$Launcher`""
$Shortcut.WorkingDirectory = $Root
$Shortcut.Description = "dy Codex local change reminder (no Git writes)"
$Shortcut.WindowStyle = 7
$Shortcut.Save()

Start-Process -FilePath "wscript.exe" -ArgumentList "`"$Launcher`"" -WorkingDirectory $Root -WindowStyle Hidden

Write-Host "Startup shortcut created: $ShortcutPath"
Write-Host "Local change reminder started. It will not pull, commit, or push code."
