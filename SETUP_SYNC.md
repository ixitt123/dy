# 两台电脑 + Codex 自动同步说明

## 目标

GitHub 仓库 `https://github.com/ixitt123/dy` 是唯一项目源。

两台电脑都用 Codex 编辑这个本地项目时：

- 开机登录 Windows 后，后台自动拉取 GitHub 最新版本。
- 本地文件有改动后，等待约 30 秒稳定，再自动提交并推送到 GitHub。
- 后台每 1 分钟检查一次 GitHub 是否有新版本。
- 如果两台电脑同时改了同一个文件，脚本会停止并提示冲突，不会强行覆盖。
- `settings.json`、`.data/`、`downloads/`、`node_modules/`、SQLite 数据库、日志和本地素材不会上传。

## 这台电脑怎么安装

在项目目录里双击：

```text
安装开机自动同步.bat
```

安装完成后，会创建一个 Windows 登录任务：

```text
启动项 dy-codex-auto-sync.lnk
```

以后登录 Windows 后，后台会自动运行：

```text
node sync-project.mjs watch --quiet
```

这样你再打开 Codex 编辑 `D:\工厂\dy` 时，本地项目会尽量保持 GitHub 最新版本。

## 第二台电脑第一次安装

1. 安装 Git for Windows。
2. 安装 Node.js 22 或更新版本。
3. 打开 PowerShell，进入你想放项目的位置。
4. 运行：

```powershell
git clone https://github.com/ixitt123/dy.git
cd dy
pnpm install --frozen-lockfile
```

5. 双击：

```text
安装开机自动同步.bat
```

6. 确认这台电脑的 GitHub 登录状态可以 push。首次 push 可能会弹出 GitHub 登录窗口。

## 日常使用

- 用 Codex 打开这个项目目录时，项目级 `SessionStart` hook 会先同步 GitHub 最新版。
- Codex 一轮编辑停止时，项目级 `Stop` hook 会自动提交并推送。
- 后台同步任务也会持续兜底：本地文件变化后自动上传，远端有新版本时自动拉取。
- 另一台电脑在线且没有本地冲突时，最多约 1 分钟会拉到新版本。
- 如果想手动立即同步，双击：

```text
同步项目.bat
```

- 如果想看当前状态，双击：

```text
查看同步状态.bat
```

- 如果想关闭开机自动同步，双击：

```text
卸载开机自动同步.bat
```

## 重要规则

不要让两台电脑长时间同时改同一个文件。Git 能保护不被覆盖，但冲突需要人工处理。

每台电脑都应该使用同一个 GitHub 仓库，并保持 `main` 分支作为主分支。

## Codex 第一次打开项目时

本项目包含 `.codex/config.toml` 和 `.codex/hooks/`。Codex 第一次加载项目级 hooks 时，可能会提示你审查/信任 hooks。

应信任这些 hook 文件：

```text
.codex/hooks/session-start-sync.mjs
.codex/hooks/stop-sync.mjs
```

信任后，每台电脑用 Codex 连接这个项目都会执行：

- `SessionStart`：先同步 GitHub 最新版本。
- `Stop`：本轮编辑结束后自动上传。
