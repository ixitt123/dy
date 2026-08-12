@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "MPT_DIR=integrations\moneyprinterturbo"
set "PATCH_FILE=..\..\patches\mpt-speed-download-preset.patch"

echo.
echo 正在为 MoneyPrinterTurbo 应用提速补丁（并行下载 + 编码加速）...
echo.

if not exist "%MPT_DIR%\.git" (
  echo [错误] 没有找到 %MPT_DIR%，请先完成安全更新。
  goto end
)

cd /d "%MPT_DIR%"

git apply -R --check "%PATCH_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo 提速补丁已经应用过了，无需重复操作。
  goto end
)

git apply --check "%PATCH_FILE%" >nul 2>&1
if errorlevel 1 (
  echo [错误] 补丁与当前 MPT 代码版本不匹配，没有做任何修改。
  echo 请把本窗口截图发给小白处理。
  goto end
)

git apply "%PATCH_FILE%"
if errorlevel 1 (
  echo [错误] 补丁应用失败，没有做任何修改。
) else (
  echo 完成：MPT 提速补丁已应用（素材 4 路并行下载 + ffmpeg veryfast 编码）。
  echo 下次生成视频自动生效，无需其他设置。
)

:end
cd /d "%~dp0"
echo.
pause
