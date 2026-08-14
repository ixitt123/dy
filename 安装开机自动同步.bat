@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 正在安装“本地改动提醒”...
echo 项目位置：%cd%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js。请先安装 Node.js 24。
  echo.
  pause
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Git。请先安装 Git for Windows。
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-auto-sync.ps1"
if errorlevel 1 (
  echo.
  echo 开机提醒安装失败。可以把上面的提示发给 Codex。
  pause
  exit /b 1
)

echo.
echo 已安装完成。
echo 它只提醒本地有改动，不会自动拉取、提交或上传代码。
echo 需要发布时请双击“同步项目.bat”；需要更新正式版时请双击“安全更新.bat”。
echo 如需停止提醒，请双击“卸载开机自动同步.bat”。
echo.
pause
