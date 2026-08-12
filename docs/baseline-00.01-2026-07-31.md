# 不可变基线记录 ｜ 00.01

> 本文件是维修编号 `00.01` 的交付物。它记录 2026-07-31 10:31（GMT+8）时刻 douyin-mcp-local 仓库的根仓库、分支、上游、提交、工作树和 MoneyPrinterTurbo 子模块状态，并明确当时所有未提交文件的归属。
>
> 本文件一经建立即为不可变基线。后续如需更正，必须以追加方式补充更正说明，不得覆盖原文。任何后续维修编号在引用本基线时，应以本文件记录的状态作为"维修前起点"。

## 1 ｜ 基本信息

| 项 | 值 |
|---|---|
| 维修编号 | `00.01` |
| 建立时间 | 2026-07-31 10:31:08 GMT+8 |
| 维修者 | 小白（WorkBuddy） |
| 执行总表 | `C:\Users\Admin\Desktop\01-短视频软件彻底修复执行总表.md` |
| 仓库根 | `C:\Users\Admin\Desktop\短视频\douyin-video-tool-source-code\douyin-mcp-local` |
| 监管 Skill | `$douyin-safe-change` + `$douyin-repair-supervisor` |
| 计划检查器 | `check-repair-plan.mjs` 通过：items=83, next=00.01，全 83 项未开始 |
| functional-baseline | `.agents/skills/douyin-repair-supervisor/references/functional-baseline.md` 已读取，F01–F24 与执行总表第 25 节一致 |

## 2 ｜ 根仓库状态

| 项 | 值 |
|---|---|
| 远程 origin（fetch/push） | `git@github.com:ixitt123/dy.git` |
| 当前分支 | `fix/p0-stability` |
| 上游 | `origin/fix/p0-stability` |
| 与上游同步状态 | up-to-date（已同步，无 ahead/behind） |
| HEAD 完整哈希 | `c61dfbe35e13a85bad866313851e8bee07dc4cda` |
| HEAD 缩写 | `c61dfbe` |
| HEAD 提交主题 | `fix: prevent rewrite results from crossing tasks` |
| HEAD 作者 | Codex `<codex@local>` |
| HEAD 提交时间 | 2026-07-31T09:09:14+08:00 |

> 与执行总表第 1 节记录的"当前审计分支 `fix/p0-stability`、当前审计提交 `c61dfbe`"一致。

## 3 ｜ 工作树未提交文件

`git status --short --branch` 输出：

```
## fix/p0-stability...origin/fix/p0-stability
 M .gitignore
 M AGENTS.md
?? .agents/skills/douyin-repair-supervisor/
?? docs/full-system-remediation-handoff-2026-07-31.md
```

`git diff --stat` 输出：

```
 .gitignore |  2 ++
 AGENTS.md  | 10 +++++++++-
 2 files changed, 11 insertions(+), 1 deletion(-)
```

### 3.1 未提交文件逐项归属

| 文件 | 状态 | 改动概要 | 归属判定 | 性质 | 是否业务源码 |
|---|---|---|---|---|---|
| `.gitignore` | 已跟踪·已修改 | 新增 2 行：`!.agents/skills/douyin-repair-supervisor/` 和 `!.agents/skills/douyin-repair-supervisor/**`，解除监管 Skill 的 Git 忽略 | LOG-0002 监管 Skill 接入产物 | 工具链配置 | 否 |
| `AGENTS.md` | 已跟踪·已修改 | 修改 10 行：安全改动协议由"默认使用 `$douyin-safe-change`"改为"默认同时使用 `$douyin-safe-change` 和 `$douyin-repair-supervisor`"，并追加监管 Skill 的 5 条强制要求 | LOG-0002 监管 Skill 接入产物 | 项目规则文档 | 否 |
| `.agents/skills/douyin-repair-supervisor/` | 未跟踪 | 监管 Skill 实体目录，含 `SKILL.md`、`references/`（含 `functional-baseline.md`）、`scripts/`（含 `check-repair-plan.mjs`）、`agents/` | LOG-0002 监管 Skill 接入产物 | 监管工具 | 否 |
| `docs/full-system-remediation-handoff-2026-07-31.md` | 未跟踪 | 详细技术交接文档，解释"为什么要修"和"根因在哪里"；被执行总表第 1 节列为详细技术依据 | LOG-0001/0003 阶段的技术交接产物 | 技术文档 | 否 |

### 3.2 归属总判定

1. 上述 4 项未提交改动**全部**属于 LOG-0001/0002/0003 阶段（执行总表建立、监管 Skill 接入、复盘）的工作产物。
2. 它们属于"维修保护/工具链/文档"工作，**不是业务源码修改**。与执行总表第 2 节"业务源码是否已因本表修改：否"一致。
3. 它们是 `00.01` 之前的工作产物，在 `00.01` 中明确登记为**基线起点**，不归入任何业务修复编号。
4. 提交策略将在 `00.03`（审计自动同步、自动提交和暂存范围）中确定。在 `00.03` 完成前，不得使用 `git add -A` 或自动提交将它们混入其他改动（执行总表第 4.2 节第 3 条）。
5. 本次 `00.01` 新增的本基线记录文件 `docs/baseline-00.01-2026-07-31.md` 同样为未跟踪文件，归属 `00.01` 交付物，提交策略同上。

## 4 ｜ MoneyPrinterTurbo 子模块状态

| 项 | 值 |
|---|---|
| 子模块路径 | `integrations/moneyprinterturbo` |
| 根仓库记录指针 | `d994b15fc8f4b8a9eeb7d43cc8aed4a2a0e2c3f2` |
| 子模块实际 HEAD | `d994b15fc8f4b8a9eeb7d43cc8aed4a2a0e2c3f2` |
| 指针一致性 | 一致（根仓库记录指针 = 子模块实际 HEAD） |
| 子模块描述版本 | `v1.3.1-29-gd994b15` |
| 子模块内部分支 | `codex/mpt-fast-progress-20260725` |
| 子模块跟踪上游 | `origin/vendor/moneyprinterturbo` |
| 子模块工作树 | 干净（`git -C integrations/moneyprinterturbo status --short` 无输出） |
| 子模块 diff | 空（`git -C integrations/moneyprinterturbo diff --stat` 无输出） |

> 注意：子模块当前处于内部分支 `codex/mpt-fast-progress-20260725`（非 detached HEAD），跟踪 `origin/vendor/moneyprinterturbo`。这一状态需在后续涉及子模块的维修编号（如 `05.x` MoneyPrinter 生产线）中再次核对，确认是否需要切换到 detached 或固定到正式 vendor 指针。

## 5 ｜ stash 状态

`git stash list` 输出为空。无暂存改动。

## 6 ｜ 本地其他分支

`git branch -vv` 输出：

| 分支 | 缩写 | 上游 | 备注 |
|---|---|---|---|
| `backup/local-before-online-sync-20260614-104222` | `bb72094` | 无 | 自动同步备份 |
| `backup/pre-p0-20260719` | `a7f6b2f` | `origin/backup/pre-p0-20260719` | p0 前备份 |
| `feature/ian-xiaohei-illustration-app` | `c180a7d` | `origin/feature/ian-xiaohei-illustration-app` | 小黑插画功能分支 |
| `fix/p0-stability` | `c61dfbe` | `origin/fix/p0-stability` | **当前分支** |
| `main` | `a7f6b2f` | `origin/main` | 正式分支，与 `backup/pre-p0-20260719` 同提交 |

> `main` 当前停在 `a7f6b2f`（2026-07-19 自动同步），落后于 `fix/p0-stability`（`c61dfbe`，2026-07-31）。正式合并到 `main` 将在阶段 11（`11.03` PR 合并）处理。

## 7 ｜ 敏感文件跟踪检查

`git ls-files` 过滤 `.data / settings.json / downloads / .env / secret / token / cookie / .sqlite / .db`：**无匹配**。

根仓库未跟踪任何敏感文件（数据库、设置、密钥、下载产物、日志）。基线记录不包含敏感数据。

## 8 ｜ 阶段 00 放行条件对照

执行总表第 6 节末尾"阶段 00 放行条件"共 4 条。本基线记录仅服务于其中第 1 条，其余由 `00.02`–`00.05` 分别完成：

| 放行条件 | 负责编号 | 本基线是否覆盖 |
|---|---|---|
| 可以恢复到维修前基线 | `00.01` | 部分：已记录 HEAD=`c61dfbe`、子模块=`d994b15`、4 项未提交改动归属。恢复方法见第 9 节。完整备份在 `00.02` |
| 所有历史媒体仍保留 | `00.02` | 否（待 `00.02` 备份验证） |
| 每个后续问题都有固定输入 | `00.04` | 否（待 `00.04` 建立 fixture） |
| 用户运行的版本能够在页面上直接确认 | `00.05` | 否（待 `00.05` 页面版本显示） |

## 9 ｜ 恢复方法

若后续维修导致状态损坏，可按以下步骤恢复到本基线记录的 `00.01` 起点：

1. 确认仓库根：`C:\Users\Admin\Desktop\短视频\douyin-video-tool-source-code\douyin-mcp-local`
2. 切换到基线分支：`git checkout fix/p0-stability`
3. 重置到基线提交：`git reset --hard c61dfbe35e13a85bad866313851e8bee07dc4cda`
   - 注意：此操作会丢弃工作树中 `00.01` 之后产生的未提交改动。执行前应先确认是否需要保留它们，或参考 `00.02` 的备份。
4. 同步子模块指针：`git submodule update --init --recursive`
   - 此操作将子模块检出到根仓库记录的 `d994b15`。若需恢复子模块内部分支 `codex/mpt-fast-progress-20260725`，需额外执行 `git -C integrations/moneyprinterturbo checkout codex/mpt-fast-progress-20260725`。
5. 4 项未提交改动（`.gitignore`、`AGENTS.md`、`.agents/skills/douyin-repair-supervisor/`、`docs/full-system-remediation-handoff-2026-07-31.md`）属于监管接入产物，恢复后应重新确认它们的存在。若 `git reset --hard` 丢失了它们，需从 `00.02` 备份或重新接入监管 Skill 恢复。

> 严格警告：`git reset --hard` 是破坏性操作。执行前必须确认 `00.02` 备份已完成，或已明确批准丢弃未提交改动。

## 10 ｜ 五道门禁对照（监管 Skill 第 4 节）

| 门禁 | 是否适用 | 证明 |
|---|---|---|
| A 代码完整 | 部分适用 | `00.01` 不修改业务代码，仅创建文档。无语法/导入/类型 diff。文档结构完整、可读。`git diff --check` 不适用（无代码 diff） |
| B 逻辑正确 | 适用 | 基线信息采集自实际 `git` 命令输出，与执行总表第 1 节记录一致（分支 `fix/p0-stability`、提交 `c61dfbe`）。`check-repair-plan.mjs` 通过 |
| C 功能完整 | 适用 | `00.01` 不涉及功能修改，F01–F24 不受影响。无功能缺失风险 |
| D 真实可用 | 适用 | 基线记录的信息真实反映当前仓库状态，已通过实际 `git` 命令采集并交叉验证（根仓库指针 vs 子模块实际 HEAD） |
| E 正式发布一致 | 不适用 | `00.01` 是基线记录任务，不涉及发布。文档作为后续阶段的参考基线，提交策略在 `00.03` 确定 |

## 11 ｜ 未完成限制

1. 本基线记录文件 `docs/baseline-00.01-2026-07-31.md` 已创建但未提交。提交策略在 `00.03` 审计后确定。
2. 4 项 `00.01` 之前的未提交改动（监管接入产物）尚未提交，归属已登记，提交策略在 `00.03` 确定。
3. 子模块内部分支 `codex/mpt-fast-progress-20260725` 是否需要切换到正式 vendor 指针，留待 `05.x` MoneyPrinter 生产线阶段核对。
4. `main` 分支落后于 `fix/p0-stability`，正式合并在 `11.03` 处理。

## 12 ｜ 下一允许编号

`00.02`（备份设置、SQLite、JSON 项目元数据和资产清单）。

---

本基线记录由 `00.01` 生成，作为维修前不可变起点。后续任何编号在引用"维修前状态"时，应以本文件为准。
