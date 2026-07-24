---
name: douyin-safe-change
description: Safely implement, fix, refactor, or review code in the douyin-mcp-local repository with dirty-worktree protection, impact analysis, regression-first tests, minimal patches, production-contract preservation, and repository test gates. Use for any backend, frontend, API, SQLite, TTS, subtitle, Xiaohei, CS1, MoneyPrinterTurbo, dependency, security, or production-flow code change in this repository.
---

# Douyin Safe Change

Treat every change as a small, independently verifiable slice. Protect existing work and production-line contracts before optimizing implementation speed.

## 1. Establish a safe baseline

1. Confirm that the working directory is the repository containing `.git`, `AGENTS.md`, and the root `package.json`.
2. Read every applicable `AGENTS.md` before touching files.
3. Run:

   ```powershell
   git remote -v
   git branch -vv
   git status --short --branch
   git diff --stat
   ```

4. Record pre-existing modified, untracked, and submodule files. Treat them as user-owned.
5. Do not overwrite, delete, stage, stash, restore, or reformat pre-existing work.
6. If the requested change overlaps existing uncommitted work and safe isolation is unclear, stop and ask for direction.
7. Do not pull, commit, push, merge, or switch branches unless the user explicitly authorizes that action.

## 2. Define the change before editing

State these items briefly:

- Current failure or requested behavior.
- Reproduction path and observable evidence.
- Expected result and completion criteria.
- Files, callers, routes, persistence, exports, and UI paths likely affected.
- Compatibility contracts that must remain unchanged.

Use `rg` to trace definitions, callers, event names, API routes, database fields, settings keys, and user-facing copies. Inspect the real source rather than inferring behavior from filenames or old reports.

Preserve the established production contracts, including downloads, copy extraction and rewriting, task queues, SQLite data, TTS, subtitles, Xiaohei, CS1, and MoneyPrinterTurbo. Keep confirmed TTS audio as the canonical downstream payload for CS1 and MoneyPrinterTurbo unless the user changes that contract. Do not delete legacy paths or data before end-to-end verification.

## 3. Add regression evidence first

For a bug fix:

1. Add or strengthen the narrowest automated regression test that reproduces the failure when feasible.
2. Run it before the fix and confirm that it fails for the intended reason.
3. Implement the smallest complete fix.
4. Run the same test again and confirm that it passes.

For a feature:

1. Add tests for the new success path.
2. Add compatibility coverage for affected existing behavior.
3. Cover invalid input, missing state, or failure policy when those paths are meaningful.

Do not weaken assertions, skip tests, or rewrite expected output merely to make a failure disappear.

## 4. Make a minimal complete patch

- Change only files required by the defined slice.
- Avoid broad rewrites, unrelated formatting, speculative abstractions, and dependency additions.
- Prefer narrow shared helpers only when multiple verified call sites need the same invariant.
- Keep API validation and security boundaries on the server; do not rely on UI-only checks.
- Keep UI copy, server behavior, stored data, exports, and tests synchronized when one rule affects all of them.
- Preserve backward compatibility unless the user explicitly approves a breaking change and its migration.

## 5. Validate in layers

Run validation from narrowest to broadest:

1. Run the changed feature's targeted test files.
2. Run syntax checks for changed JavaScript where appropriate.
3. Run the repository gate:

   ```powershell
   npm.cmd run check:gate
   ```

4. Also run the full end-to-end suite when changing UI/API wiring, production flows, state transitions, persistence, exports, TTS handoff, subtitles, Xiaohei, CS1, or MoneyPrinterTurbo:

   ```powershell
   npm.cmd run test:e2e
   ```

5. Perform a focused manual smoke test when automated tests cannot verify visual or media behavior.
6. Run `git diff --check` and compare `git status --short` with the baseline. Investigate any unexpected file mutation caused by tests or generators.

Never report a gate as passed unless it was executed successfully in the current task. Report skipped or blocked checks explicitly.

## 6. Review before handoff

Review the final diff for:

- Unrelated or duplicated changes.
- Broken callers, routes, event names, state transitions, and database compatibility.
- Path traversal, command execution, XSS, SSRF, arbitrary file reads, and oversized request bodies.
- API keys, tokens, cookies, local settings, databases, downloads, generated media, and other forbidden uploads.
- Tests that assert implementation details while missing the user-visible contract.

Finish with:

- Outcome and behavior changed.
- Modified files.
- Regression test added or strengthened.
- Commands run and exact results.
- Remaining risks or unverified paths.
- Current branch plus commit, push, PR, and CI status, using `not performed` when the user did not authorize them.

