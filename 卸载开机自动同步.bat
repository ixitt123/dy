@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 正在停止并卸载 Codex 项目开机自动同步...
node sync-project.mjs stop-watch
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-auto-sync.ps1"

echo.
echo 已卸载。需要恢复时，再双击“安装开机自动同步.bat”。
echo.
pause
