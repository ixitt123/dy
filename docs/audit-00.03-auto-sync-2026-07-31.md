# 00.03 自动同步、提交与暂存范围审计

## 结论

此前的手动上传入口会执行 `git add -A`，会把工作树中全部改动混入同一次提交；这个结论已经用真实源码复核确认。现在已改为明确文件清单模式：没有 `--files-file` 时，只要存在未提交改动就直接停止；即使提供了清单，暂存区中出现任一清单外文件也会停止。

## 修复后的规则

1. `sync-project.mjs upload` 不再执行 `git add -A`，只执行 `git add -- <清单文件>`。
2. 清单必须是项目目录内的 JSON，包含 `files` 数组；拒绝绝对路径、越界路径、重复文件、`.data`、数据库、设置、媒体/下载目录和 Git 忽略文件。
3. 上传前后检查暂存区与清单完全一致；测试期间清单源文件发生变化时恢复原暂存区并停止。
4. 上传流程不再自动 `pull --rebase`。远程领先时只提示人工处理，绝不自动拉取、变基或合并。
5. `同步项目.bat` 只显示安全说明，不会自动运行上传命令。
6. `skills/cs1/SKILL.md` 不再引导 `git add -A`、直推 main 或自动拉取。

## 实际验证

- `node test-safe-sync-policy.mjs`：通过。
- 未传清单实际运行 `node sync-project.mjs upload`：以“没有明确文件清单”停止，退出码 1；未执行提交或上传。
- 传入仅含 `sync-project.mjs` 的临时清单实际运行：因暂存区已有 15 个清单外文件而停止，退出码 1；暂存区列表保持原样。
- 静态复核：`sync-project.mjs` 不含 `git add -A` 或 `pull --rebase` 调用；CS1 操作步骤不含可执行的 `git add -A` 或 `git push origin main` 行。

## 未执行的动作

本项未执行真实 commit、push、pull、rebase、merge 或切换分支；这些动作需要单独的明确用户授权。当前结论仅证明防混入保护在本地真实运行中已生效，不代表任何修复已发布到 GitHub 或 main。
