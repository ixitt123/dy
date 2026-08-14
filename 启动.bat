@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 正在启动 Universal Content Studio...
echo 项目位置：%cd%
echo.

git config core.hooksPath githooks >nul 2>nul

node launch-ui.mjs

echo 已发送启动命令。启动软件不会自动更新、提交或上传代码。
echo 如果浏览器没有自动打开，请访问 http://127.0.0.1:8787
echo.
pause
