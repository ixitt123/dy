---
name: douyin-round2-supervisor
description: Supervise the 72-item second repair round for douyin-mcp-local with an independent four-attempt state machine, dependency-aware ready queue, execution cards, RUN-R2 specifications, evidence packets, and failure recording. Use when checking, scheduling, starting, failing, resuming, or closing an R2-* item in 02-短视频软件第二轮彻底修复执行总表.md; never use the first-round two-attempt supervisor for R2 items.
---

# Douyin Round Two Supervisor

Use `02-短视频软件第二轮彻底修复执行总表.md` as the only round-two state authority. Keep the first-round register and its evidence unchanged.

## Start or resume an item

1. Run `pnpm.cmd run repair:r2:check`.
2. Run `pnpm.cmd run repair:r2:packet`.
3. Follow the selected item's execution card and `RUN-R2-*` specification in `references/round2-execution-specs.json`.
4. Freeze reproduction evidence before changing business source.
5. Keep one source writer per isolated repair branch. Two computers may write different dependency-ready items in parallel only after the A-machine coordinator records non-overlapping file ownership, separate evidence directories, and separate branches. Let read-only experts audit in parallel without Git or file writes.
6. Treat the A machine as the only baseline integrator and register writer. The B machine may commit and push only its assigned `repair/b-*` branch; it must not edit the register, shared governance files, `.codex/**`, release configuration, or the MoneyPrinterTurbo submodule pointer.
7. If planned or actual paths overlap, stop the later writer before editing and return the item to the A machine for reassignment. Never resolve this by automatic pull, rebase, merge, force push, or `git add -A`.

## Enforce the attempt budget

- Count only a complete repair followed by complete item verification.
- Keep attempts 1–3 on the same item with state `待复验`.
- After a failed complete verification, run:

  `pnpm.cmd run repair:r2:failure -- --item <R2-id> --evidence .data/repair-evidence/<R2-id>/<timestamp>/ --summary <failure>`

- Put `verification-result.json` in that directory. Record the actual command, non-zero `exitCode`, `completedVerification: true`, and a meaningful summary. The recorder rejects dummy files, paths outside the item, symlinks, missing manifests, and concurrent table writes.

- On attempt 4, let the recorder set `四次失败待最终收尾` and advance the dependency-aware queue.
- Reject attempt 5. Never rename or reopen the same defect to evade the limit.
- Treat `四次失败待最终收尾` as unresolved. It may unlock scheduling but never satisfies release, merge, structural baseline, structural release, or closure gates.

## Complete an item

1. Verify the item-specific regression and every acceptance clause.
2. Run applicable browser, media, restart, security, and external checks; do not replace real-use evidence with source inspection or mocks.
3. Run `pnpm.cmd run check:gate` and `pnpm.cmd run repair:r2:check`.
4. Create `completion-result.json` in the item evidence directory. Record every expected command and actual command, `exitCode: 0`, output path/hash, verification mode, completion time, verified evidence files, and the mode-required actual/security/rollback/release evidence lists.
5. Create a seven-gate JSON with keys `A 代码`, `B 逻辑`, `C 功能`, `D 真实使用`, `E 安全`, `F 数据与回滚`, and `G 发布`. A gate required by the item's `verificationMode` must be `通过`; only non-required gates may use `不适用：具体原因`.
6. Complete through `pnpm.cmd run repair:r2:completion -- --item <R2-id> --evidence <item-evidence-dir> --gates <seven-gate-json> --summary <result>`.
7. For a manual item, add `--human-evidence <path>` pointing to `human-confirmation.json`. Create it only after the user actually confirms in this task; include `source: "user"`, matching item ID, exact confirmation text, task reference, time, and summary. Never self-author or infer user confirmation.
8. Do not stage, commit, push, merge, delete, or change the MoneyPrinterTurbo submodule without separate authorization.

## Handle manual or external waiting

1. Set the item to `待人工/外部` with its real blocker and evidence.
2. Wait up to five minutes when the user is expected to intervene.
3. If no intervention arrives, leave the item waiting and select another dependency-ready item. Waiting items do not occupy the sole source writer.
4. Resume only by explicitly changing the waiting item back to `进行中`; do not auto-complete it from a local JSON or synthetic test.

## Maintain specifications

When a row's scope, dependency, title, or acceptance changes, regenerate and validate:

1. `pnpm.cmd run repair:r2:specs`
2. `pnpm.cmd run repair:r2:test-supervisor`
3. `pnpm.cmd run repair:r2:check`

Keep the generated JSON explicit: every one of the 72 items must have its own scope, ordered actions, pre-fix regression, checks, real evidence, prohibited shortcuts, rollback, escalation, source anchors, commands, test name, and evidence directory.
