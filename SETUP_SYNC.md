# 抖音视频工具：两台电脑同步说明

## 保留的唯一项目

本机保留项目：

`C:\Users\Admin\Desktop\短视频\douyin-video-tool-source-code\douyin-mcp-local`

GitHub 保留仓库：

`https://github.com/ixitt123/dy`

API Key、下载文件、数据库、运行缓存不会上传到 GitHub。

## 这台电脑怎么用

1. 双击桌面快捷方式“抖音视频工具”。
2. 程序会先检查 GitHub 是否有最新版。
3. 如果 GitHub 有更新，会先拉取最新版，再打开页面。
4. 如果你修改了项目文件，需要上传时，双击项目里的 `同步项目.bat`。

## 家里电脑第一次安装

1. 安装 Git。
2. 安装 Node.js 22 或更新版本。
3. 打开 PowerShell，运行：

```powershell
git clone https://github.com/ixitt123/dy.git
cd dy
corepack enable
corepack pnpm install --frozen-lockfile
```

4. 双击 `start-ui-hidden.vbs` 或 `启动.vbs` 打开工具。
5. 需要上传改动时，双击 `同步项目.bat`。

## 日常同步规则

- 打开工具：自动拉取 GitHub 最新版。
- 上传项目改动：运行 `同步项目.bat`。
- 如果两台电脑同时改了同一个文件，脚本会停下来，不会强行覆盖，需要先处理冲突。
- 私人数据和 API Key 留在各自电脑，不会同步到 GitHub。
