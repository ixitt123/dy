$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSCommandPath
$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "dy-codex-auto-sync.lnk"
$Launcher = Join-Path $Root "自动同步.vbs"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "没有找到 Node.js。请先安装 Node.js 22 或更新版本。"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "没有找到 Git。请先安装 Git for Windows。"
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

Write-Host "已创建当前用户启动项：$ShortcutPath"
Write-Host "后台自动同步已启动。"
