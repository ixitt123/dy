---
name: douyin-repair-supervisor
description: Supervise ordered repairs, regression protection, completion claims, and handoffs for the douyin-mcp-local repository. Use together with douyin-safe-change whenever repairing, refactoring, reviewing, testing, releasing, or declaring completion for any UI, API, state, SQLite, TTS, BGM, subtitle, voice, image, CS1, Xiaohei, MoneyPrinterTurbo, kinetic-text, asset, workflow, or settings feature in this project.
---

# Douyin Repair Supervisor

Keep the existing product complete while repairing it. Treat the desktop execution register as the order authority and the repository as the implementation authority.

## 1. Load the authorities

1. Work from the repository root containing `.git`, `AGENTS.md`, and `package.json`.
2. Read `AGENTS.md` and `.agents/skills/douyin-safe-change/SKILL.md`.
3. Read `C:\Users\Admin\Desktop\01-短视频软件彻底修复执行总表.md`.
4. Read [functional-baseline.md](references/functional-baseline.md).
5. Run:

   ```powershell
   node .agents/skills/douyin-repair-supervisor/scripts/test-repair-supervisor.mjs
   node .agents/skills/douyin-repair-supervisor/scripts/check-repair-plan.mjs
   node .agents/skills/douyin-repair-supervisor/scripts/build-current-work-packet.mjs
   ```

6. Work from the generated `current-work-packet.md`; return to the master register only to update state and evidence logs.
7. Stop if the register is missing, malformed, out of sequence, or has more than one active item.

## 2. Enforce the repair order

1. Identify the first item not marked `完成`, `不适用`, or `二次失败待最终收尾`.
2. Work only on that item unless the register contains an approved emergency item.
3. Before editing, change the item to `进行中` and append a start log.
4. Do not combine another defect, refactor, dependency upgrade, or formatting cleanup.
5. When a new independent defect appears, add it to the register's issue area and continue the current item only if safe.
6. Never skip a blocked, `待复验`, or `待 Codex 收尾` item by silently starting the next number. Count each unsuccessful complete verification and use the failure recorder; only its second-failure transition may advance past `二次失败待最终收尾`.
7. Every repair row must have its own execution card in the register. The card must name the code scope, ordered actions, failing regression, targeted checks, real-use evidence, prohibited shortcuts, rollback, and escalation condition.
8. Every repair row must also have a matching `RUN-<item id>` specification containing concrete source anchors, exact runnable commands or an explicitly named test that must be added, the required real evidence, and the evidence output directory.
9. Store non-source repair evidence under `.data/repair-evidence/<item id>/<timestamp>/`; never commit media, screenshots, local databases, secrets, or user assets.
10. The first-pass objective is to finish the ordinary sequence quickly. An attempt is one complete verification against the item's acceptance target. Any unmet target consumes an attempt, whether caused by source behavior, missing human authorization, paid external services, PR/CI/main state, or missing user acceptance. Read-only exploration before the verification does not consume an attempt.
11. After every unsuccessful complete verification, run `node .agents/skills/douyin-repair-supervisor/scripts/record-repair-failure.mjs --item <id> --evidence <existing-path> --summary <failure-summary>`. The first failure is logged and leaves one attempt. The second failure is automatically logged, changes the item to `二次失败待最终收尾`, and advances the current item.
12. Never perform a third ordinary verification or repair attempt under the same item ID. The recorder and plan checker reject it. Do not evade the limit with delays, fallbacks, prompts, renamed logs, or unrelated edits.
13. `二次失败待最终收尾` is unresolved and never counts as `完成`. It is terminal only for the ordinary sequence. Final closure must create a separately authorized closure task; the original item ID is never reopened for a third ordinary attempt. Later regressions against an old `完成` or `二次失败待最终收尾` item are recorded under the current audit but do not reopen or reorder that old item.

## 3. Protect all existing functions

Before editing, map the proposed change against every feature in [functional-baseline.md](references/functional-baseline.md).

Classify the affected surfaces:

- code structure and imports;
- business rules and state transitions;
- UI entry, controls, labels, and visible feedback;
- API payloads and server validation;
- SQLite, JSON, files, localStorage, and migrations;
- background jobs, retries, refresh, and restart recovery;
- audio, video, subtitle, preview, download, and export;
- security and privacy boundaries;
- backward compatibility and historical assets.

Create an impact list containing:

- directly changed features;
- upstream producers;
- downstream consumers;
- adjacent features sharing state, selectors, routes, storage, or media helpers;
- untouched baseline features that still require a smoke check.

Do not remove or rename a working entry, route, field, button, export, stored value, or compatibility path without an approved migration and a real end-to-end replacement.

## 4. Prove five independent gates

An item can be `完成` only after all applicable gates pass.

### Gate A: Code integrity

- Syntax, imports, type/static checks, targeted tests, and `git diff --check` pass.
- No unrelated or generated files entered the slice.
- No secret, database, local media, or user asset entered the diff.

### Gate B: Logic integrity

- Reproduce the original failure before the fix.
- Add a regression that fails for the intended reason.
- Trace the real caller, route, state owner, storage write, and output consumer.
- Exercise success, invalid input, missing state, retry, stale response, and restart paths where applicable.

### Gate C: Functional completeness

- Verify the changed feature's full user journey, not only the edited control.
- Run regression checks for upstream, downstream, and shared-state features.
- Confirm every relevant entry, action, preview, save, reload, export, and handoff still exists.
- At each phase boundary, run the complete functional baseline rather than only impacted tests.

### Gate D: Real usability

- Operate UI changes in a real browser.
- Produce and inspect real files for audio, video, subtitle, image, download, and export changes.
- Use FFprobe and media checks for final videos and mixed audio.
- Confirm preview and download reference the same final asset.
- State `未真实验证` whenever a required service or paid external call did not run.

### Gate E: Release integrity

- Record branch, commit, submodule commit, tests, artifact paths, migration scope, and rollback.
- Keep historical originals unless a separately approved migration says otherwise.
- Verify the merged `main` state from a clean environment before product-level completion.
- Never equate a local fix branch with the released product.

## 5. Use layered regression

For every item, run:

1. the new failing regression before the fix;
2. the same regression after the fix;
3. targeted tests for the changed module;
4. contract tests for upstream and downstream paths;
5. `npm.cmd run check:gate`;
6. the current HTTP/source contract suite;
7. real browser E2E when UI or state is involved;
8. real media E2E when assets or production lines are involved;
9. restart recovery when persistence or jobs are involved;
10. security checks when input, paths, HTML, settings, or network access is involved.

Do not weaken assertions or accept string-presence tests as proof of usable behavior.
Do not run placeholder text such as `<changed files>` as a command. Resolve the real changed file list from the current item diff and record the expanded command and output.

## 6. Update the register before completion

After work:

1. Fill every applicable evidence field in the desktop register.
2. Append a log containing item ID, root cause, changed files, commit, exact test results, browser evidence, artifact paths, media results, history impact, and rollback.
3. Use `待复验` after the first unsuccessful verification if any real browser, media, restart, external-service, clean-install, PR, or `main` verification is missing. After the second unsuccessful verification, record it and advance as `二次失败待最终收尾`.
4. Change to `完成` only when all five gates pass.
   The update log must contain a matching `EVIDENCE-<item id>` block with an explicit result for Gates A-E and an actual evidence path.
5. Record actual engineering time, blocked waiting time, and the reason for any estimate variance.
6. Reforecast remaining work at each phase boundary without weakening completion gates.
7. Set the next allowed item.
8. Run the plan checker again.

If code changed but the register was not updated, report the item as incomplete.
Treat schedule estimates as planning data, never as permission to skip browser, media, recovery, security, or release verification.
Do not commit, push, pull, merge, change a submodule pointer, or rewrite history without explicit user authorization. A clean candidate slice may be prepared and reported without publishing it.

## 7. Report without overstating

Finish every repair with:

- current item and final status;
- user-visible outcome;
- functions rechecked and functions not rechecked;
- changed files;
- tests actually run with exact results;
- real browser and artifact evidence;
- branch, commit, push, PR, CI, and `main` state;
- historical-data impact;
- remaining limitations and next allowed item.

Never call the software a qualified stable release until register items `00.01` through `11.05`, F01-F24, clean installation, four production lines, security, recovery, `main`, and user acceptance all pass. Call structural modernization complete only after `12.01` through `12.07` also pass.

## 8. Codex final closure

When an item is `待 Codex 收尾` or `二次失败待最终收尾`, the primary Codex agent must:

1. Re-read the item's execution card, start log, reproduction evidence, attempted patch, and exact failing output.
2. For `二次失败待最终收尾`, do not reopen the original repair item. Create a separately authorized closure task that references both attempt records, then reproduce the same failure from the frozen fixture before changing code.
3. Decide whether to keep, revise, or discard only the current item's candidate edits; never reset unrelated work.
4. Finish the smallest root-cause repair and add a behavior-level regression that fails on the pre-fix code.
5. Run all five gates, including real browser/media/restart/external evidence when applicable.
6. Update the register with exact commands, counts, artifact paths, media measurements, commit state, history impact, rollback, and the next allowed item.
7. If required real evidence is unavailable, the first unsuccessful verification leaves the item `待复验`; the second must use the failure recorder and advance it as `二次失败待最终收尾` rather than leaving the sequence stopped.
