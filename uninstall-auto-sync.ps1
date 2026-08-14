$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSCommandPath
$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPaths = @(
  (Join-Path $Startup "dy-codex-change-reminder.lnk"),
  (Join-Path $Startup "dy-codex-auto-sync.lnk")
)

if (Get-Command node -ErrorAction SilentlyContinue) {
  & node (Join-Path $Root "sync-project.mjs") stop-watch
}

$Removed = $false
foreach ($ShortcutPath in $ShortcutPaths) {
  if (Test-Path -LiteralPath $ShortcutPath) {
    Remove-Item -LiteralPath $ShortcutPath -Force
    Write-Host "Startup shortcut removed: $ShortcutPath"
    $Removed = $true
  }
}
if (-not $Removed) {
  Write-Host "Change reminder startup shortcut was not found."
}
