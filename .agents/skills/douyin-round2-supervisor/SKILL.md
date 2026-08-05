---
name: douyin-round2-supervisor
description: Supervise the 73-item second repair round for douyin-mcp-local with a B-primary two-machine workflow, A-two-attempt and four-total-attempt limits, dependency-aware assignments, execution cards, evidence packets, and failure recording. Use when checking, scheduling, starting, handing off, failing, resuming, or closing an R2-* item in docs/repair/round2/master-register.md; never use the first-round two-attempt supervisor for R2 items.
---

# Douyin Round Two Supervisor

Use `docs/repair/round2/master-register.md` as the only round-two state authority. The desktop `02-短视频软件第二轮彻底修复执行总表.md` is a B-exported mirror. Keep the first-round register and its evidence unchanged.

## Start or resume an item

1. Run `pnpm.cmd run repair:r2:check`.
2. For a business item, run `pnpm.cmd run repair:r2:packet -- --machine <A|B> --item <R2-id>`; the assignment must exist in `docs/repair/round2/assignments.json`.
3. Follow the selected item's execution card and `RUN-R2-*` specification in `references/round2-execution-specs.json`.
4. Freeze reproduction evidence before changing business source.
5. Before changing business source, search the web for the same failure. Prefer official documentation, upstream repositories, advisories, and primary sources. Record the query time, links, applicability, chosen approach, and rejected approaches in the assigned `docs/repair/round2/research/R2-*.md`. Without that record, diagnose only.
6. Keep one source writer per isolated repair branch. Two computers may write different dependency-ready items in parallel only after B records non-overlapping file ownership, separate evidence directories, and separate branches. Let read-only experts audit in parallel without Git or file writes.
7. Treat B as the permanent primary machine, only master-register writer, only assignment writer, and only baseline reviewer/merger. A uses only assigned `repair/a-*` branches and must not edit governance, shared dependency/release files, the master register, assignments, or the MoneyPrinterTurbo submodule pointer.
8. If planned or actual paths overlap, stop the later writer before editing and return the item to B for reassignment. Never resolve this by automatic pull, rebase, merge, force push, or `git add -A`.
9. After both computers synchronize the approved baseline, B activates the first non-overlapping pair with `pnpm.cmd run repair:r2:activate -- --machine B --items R2-01.12,R2-02.02`; A must wait for this command to pass before changing business source.

## Enforce the attempt budget

- Count only a complete repair followed by complete item verification.
- A may use attempts 1–2 on a simple item. After success it hands the candidate to B for audit; after the second failure it submits both evidence sets and a detailed cause analysis, then moves immediately to its next assigned item.
- When B receives an A failure handoff, the next attempt is 3 and only attempts 3–4 remain. A B-direct complex item may use attempts 1–4.
- Only B updates the authoritative attempt count and state after validating A's handoff.
- After a failed complete verification, run:

  `pnpm.cmd run repair:r2:failure -- --machine B --item <R2-id> --evidence .data/repair-evidence/<R2-id>/<timestamp>/ --summary <failure>`

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
6. B completes a business item through `pnpm.cmd run repair:r2:completion -- --machine B --item <R2-id> --evidence <item-evidence-dir> --gates <seven-gate-json> --summary <result>`. Control items may omit `--machine`.
7. For a manual item, add `--human-evidence <path>` pointing to `human-confirmation.json`. Create it only after the user actually confirms in this task; include `source: "user"`, matching item ID, exact confirmation text, task reference, time, and summary. Never self-author or infer user confirmation.
8. B exports the desktop mirror only after the authoritative register passes: `pnpm.cmd run repair:r2:mirror -- --machine B`.
9. Do not stage, commit, push, merge, delete, or change the MoneyPrinterTurbo submodule without separate authorization.

## Preserve completed evidence across machines

1. Never ask the other machine to create, copy, or fake an origin machine's local `.data` evidence directory.
2. For every completed business item whose evidence remains local, B commits a JSON receipt under `docs/repair/round2/evidence-receipts/`. The receipt preserves the original absolute path, source repair commit, complete verification manifest, manifest SHA-256, command output hashes, and evidence file hashes; it must not contain secrets or the local evidence files themselves.
3. After the receipt and its matching master-register evidence path are committed, B adds an `evidence-provenance.json` record whose `recordedAtCommit` points to that immutable commit and whose `receiptSha256` is the exact Git blob content hash calculated with SHA-256.
4. A missing local directory is accepted only when the immutable commit contains both the exact master-register path and the receipt, both SHA-256 values match, and the receipt satisfies the current item's verification mode and expected commands. Local evidence, when present, always receives the full file-by-file validation first.
5. Manual items cannot use portable receipts for user confirmation; their original human evidence must remain locally verifiable by B.

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

Keep the generated JSON explicit: every one of the 73 items must have its own scope, ordered actions, pre-fix regression, checks, real evidence, prohibited shortcuts, rollback, escalation, source anchors, commands, test name, and evidence directory.
