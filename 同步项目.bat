@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 正在安全同步当前修复分支...
echo 项目位置：%cd%
echo.

git config core.hooksPath githooks
echo 当前分支：
git branch --show-current
echo.
echo 接下来会自动运行测试、核对文件快照、提交并上传修复分支。
echo 正式 main 分支禁止直接上传，必须通过 GitHub PR 合并。
echo.

node sync-project.mjs upload

echo.
if errorlevel 1 (
  echo 同步没有完成。请把上面的提示或 .data\sync.log 发给我，我会继续处理。
) else (
  echo 安全同步完成。修复分支已上传；正式版本仍需等待 GitHub 检查和 PR 合并。
)
echo.
pause
