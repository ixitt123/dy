@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 正在启动 Universal Content Studio...
echo 项目位置：%cd%
echo.

node launch-ui.mjs

echo 已发送启动命令。如果浏览器没有自动打开，请访问 http://127.0.0.1:8787
echo.
pause
