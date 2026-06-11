$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSCommandPath
$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "dy-codex-auto-sync.lnk"
$Launcher = Join-Path $Root "auto-sync.vbs"
$ChineseLauncher = Join-Path $Root "自动同步.vbs"

if (-not (Test-Path -LiteralPath $Launcher) -and (Test-Path -LiteralPath $ChineseLauncher)) {
  $Launcher = $ChineseLauncher
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install Node.js 22 or newer first."
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git was not found. Install Git for Windows first."
}

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "Auto sync launcher was not found: $Launcher"
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$Launcher`""
$Shortcut.WorkingDirectory = $Root
$Shortcut.Description = "dy Codex project auto sync"
$Shortcut.WindowStyle = 7
$Shortcut.Save()

Start-Process -FilePath "wscript.exe" -ArgumentList "`"$Launcher`"" -WorkingDirectory $Root -WindowStyle Hidden

Write-Host "Startup shortcut created: $ShortcutPath"
Write-Host "Background auto sync started."
