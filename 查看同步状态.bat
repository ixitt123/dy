@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 项目位置：%cd%
echo.
git status --short --branch
echo.
echo 最近同步日志：
if exist ".data\sync.log" (
  powershell -NoProfile -Command "Get-Content -Path '.data\sync.log' -Tail 20"
) else (
  echo 暂无同步日志。
)
echo.
pause
