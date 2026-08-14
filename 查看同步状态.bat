@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 项目位置：%cd%
echo.
echo ===== 当前分支和文件状态 =====
git status --short --branch
echo.
echo ===== 最近 5 次提交 =====
git log -5 --oneline
echo.
echo ===== 安全策略 =====
echo 软件启动：不会自动拉取代码
echo 后台监控：不会自动提交或上传
echo 正式 main：禁止直接推送，只能通过 PR 合并
if exist ".data\sync-watch.pid" (
  echo 改动提醒进程：PID 文件存在（仅提醒，不同步）
) else (
  echo 改动提醒进程：未运行
)
echo.
echo 最近同步日志：
if exist ".data\sync.log" (
  powershell -NoProfile -Command "Get-Content -Path '.data\sync.log' -Tail 20"
) else (
  echo 暂无同步日志。
)
echo.
pause
