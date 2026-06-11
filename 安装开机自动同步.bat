@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 正在安装 Codex 项目开机自动同步...
echo 项目位置：%cd%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js。请先安装 Node.js 22 或更新版本。
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

node sync-project.mjs startup
if errorlevel 1 (
  echo.
  echo 首次同步未完成，请先处理上面的提示。
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-auto-sync.ps1"
if errorlevel 1 (
  echo.
  echo 开机自动同步安装失败。可以手动双击“自动同步.vbs”启动后台同步。
  pause
  exit /b 1
)

echo.
echo 已安装完成。
echo 以后登录 Windows 后会自动同步这个项目；你再打开 Codex 时，本地目录会尽量保持最新。
echo 如需停止开机自动同步，请双击“卸载开机自动同步.bat”。
echo.
pause
