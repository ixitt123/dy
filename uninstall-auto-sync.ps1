$ErrorActionPreference = "Stop"

$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "dy-codex-auto-sync.lnk"

if (Test-Path -LiteralPath $ShortcutPath) {
  Remove-Item -LiteralPath $ShortcutPath -Force
  Write-Host "Startup shortcut removed: $ShortcutPath"
} else {
  Write-Host "Startup shortcut was not found."
}
