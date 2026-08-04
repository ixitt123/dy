---
name: douyin-release-auditor
description: Audit repair and release readiness for douyin-mcp-local across code, logic, complete user journeys, real browser or media use, restart recovery, security, and formal release state. Use before marking a second-round item complete, closing a phase, or claiming the software is ready.
---

# Douyin Release Auditor

Audit evidence independently from implementation. Never convert a local test pass into a product-release claim.

## Load authority and scope

1. Read `AGENTS.md`, `.agents/skills/douyin-safe-change/SKILL.md`, the functional baseline, and the active row in `C:\Users\Admin\Desktop\02-短视频软件第二轮彻底修复执行总表.md`.
2. Record branch, HEAD, upstream, submodule pointer, staged/unstaged/untracked baseline, running service identity, and the active repair attempt.
3. Apply the second-round limit: at most four complete repair-plus-full-revalidation attempts per item. A fourth unsuccessful complete verification closes that item as failed for the round and advances to the next independent item; never create an ordinary fifth attempt.
4. Keep MoneyPrinterTurbo internals excluded; audit only the main program's integration contract.

## Audit seven independent gates

1. **Code:** syntax/import checks, targeted regression, full gate, and `git diff --check` pass without unrelated mutation.
2. **Logic:** reproduce the original defect, trace the real state owner and caller chain, and cover invalid, stale, retry, and restart paths where applicable.
3. **Functional:** verify the complete changed journey plus producers, consumers, shared state, and core F01/F17/F22/F24 smoke checks. At every phase boundary and release decision, run the complete F01-F24 runner, not only `check:gate` or the 9-check browser smoke.
4. **Browser:** operate the real page and retain evidence for selectors, visible state, interaction, refresh, and error feedback.
5. **Media:** when applicable, inspect the real final artifact and prove preview/download/handoff identity.
6. **Security/recovery:** run applicable path, XSS, SSRF, secret, concurrency, migration, and restart checks.
7. **Release:** record local branch/commit, push/PR/CI/main/clean-install status, rollback, and historical-data impact separately.

## Handle blockers without stopping unrelated work

- Record paid service, login, human acceptance, PR, CI, or `main` evidence as blocked with an exact reason and evidence path.
- Do not fabricate a pass and do not allow an external blocker to serialize unrelated local, security, or startup lanes.
- Count an attempt only when the item's complete acceptance verification is actually run and fails; exploratory read-only diagnosis does not consume an attempt.

## Enforce single-writer review

Only the designated repair agent for an isolated branch may edit its registered source paths. Only the A-machine coordinator may edit the register, `.codex/**`, or shared governance files. Specialist agents remain read-only and return file paths, commands, findings, and acceptance recommendations. They may not stage, commit, delete, move, quarantine, or repair files.

## Report

Return a gate-by-gate matrix with exact results and evidence paths. Distinguish `通过`, `失败`, `阻塞`, and `未运行`. State the next dependency-unblocked item and never describe a blocked or locally-only result as released.
