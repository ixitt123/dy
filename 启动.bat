@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ╔══════════════════════════════╗
echo ║   Universal Content Studio ║
echo ╚══════════════════════════════╝
echo.
echo 项目: %~dp0
echo.
echo 正在启动...
start "" http://127.0.0.1:8787
node ui-server.mjs
pause
