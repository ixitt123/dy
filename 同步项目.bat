@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 正在同步当前项目...
echo 项目位置：%cd%
echo.

node sync-project.mjs upload

echo.
if errorlevel 1 (
  echo 同步没有完成。请把上面的提示或 .data\sync.log 发给我，我会继续处理。
) else (
  echo 同步完成。另一台电脑拉取后就是同一份最新版本。
)
echo.
pause
