@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ===== 安全更新正式版本 =====
echo 这个操作只在你主动双击时运行，不会后台更新。
echo.

git config core.hooksPath githooks >nul 2>nul

for /f "delims=" %%b in ('git branch --show-current') do set CURRENT_BRANCH=%%b
if /i not "%CURRENT_BRANCH%"=="main" (
  echo 当前分支是 %CURRENT_BRANCH%，不是正式 main。
  echo 为避免覆盖正在开发的内容，本次没有更新。
  echo 请把这个窗口截图发给 Codex。
  echo.
  pause
  exit /b 1
)

for /f %%i in ('git status --porcelain') do (
  echo 检测到本地还有未提交改动，本次已自动停止，任何文件都没有被覆盖。
  echo 请先联系 Codex 处理这些改动。
  echo.
  git status --short
  pause
  exit /b 1
)

echo 正在获取 GitHub 上经过审核的正式版本...
node sync-project.mjs pull
if errorlevel 1 (
  echo.
  echo 更新失败，旧版本仍保留。请把本窗口截图发给 Codex。
  pause
  exit /b 1
)

echo.
echo 更新完成。下次启动软件时会使用新的正式版本。
echo.
pause
