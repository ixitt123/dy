$ErrorActionPreference = "Stop"

$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "dy-codex-auto-sync.lnk"

if (Test-Path -LiteralPath $ShortcutPath) {
  Remove-Item -LiteralPath $ShortcutPath -Force
  Write-Host "已删除当前用户启动项：$ShortcutPath"
} else {
  Write-Host "没有找到启动项，无需删除。"
}
