@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 安全上传已改为“明确文件清单”模式。
echo 本窗口不会自动暂存、提交、拉取、变基或上传任何文件。
echo.
echo 1. 由维修任务创建仅包含本次源文件的 JSON 清单，例如：
echo    {"files":["sync-project.mjs","test-safe-sync-policy.mjs"],"message":"fix: safe explicit staging"}
echo 2. 检查清单后，在 PowerShell 中明确执行：
echo    node sync-project.mjs upload --files-file "相对清单路径"
echo 3. 若远程有新提交或暂存区包含清单外文件，工具会停止，不会自动 pull、rebase 或混入提交。
echo.
echo 当前分支：
git branch --show-current
echo.
pause
