# P0 stability handoff

## 2026-07-19 16:48 +08:00

Branch: `fix/p0-stability`

Base state:

- PR: https://github.com/ixitt123/dy/pull/1
- Synced with `origin/fix/p0-stability` using `git fetch --prune origin`, `git switch --track origin/fix/p0-stability`, and `git pull --ff-only`.
- Remote HEAD before this fix was `fb39aff` (`docs: refine audit into implementation plan`). The earlier report commit `17ac22e` is present directly below it.
- Working tree was clean before changes.

Completed item:

- Recommended order item 1: H2 static path validation and `%5c` / `%2f` regression tests.

Changes:

- Added `server/core/static-path-safety.js`.
- Updated `serveStatic()` in `ui-server.mjs` to resolve static paths through `resolveStaticRequestPath()` instead of using string-prefix checks.
- Added `test-static-path-safety.mjs`.
- Added the new test to `npm.cmd run check:gate`.

Security behavior now covered:

- Normal static files under `ui/` still resolve.
- Same-prefix sibling paths such as `ui-server.mjs` are rejected.
- Encoded backslash traversal like `/..%5cui-server.mjs` is rejected.
- Encoded slash traversal like `/..%2fui-server.mjs` is rejected.
- Mixed separators, double-encoded traversal, NUL bytes, malformed percent encoding, and raw backslashes are rejected.

Verification:

- `node test-static-path-safety.mjs`: passed.
- `node --check server/core/static-path-safety.js; node --check ui-server.mjs`: passed.
- `npm.cmd run check:gate`: passed.

Next item:

- Recommended order item 2: H3 MoneyPrinter open target hardening. Remove `cmd /c`, strictly validate URLs, and add shell metacharacter negative tests.

## 2026-07-19 18:05 +08:00

Branch: `fix/p0-stability`

Base state:

- Started from `e41915a` (`fix(security): harden static path resolution`).
- Synced with `origin/fix/p0-stability` using `git fetch --prune origin` and `git pull --ff-only`.
- Working tree was clean before changes.

Completed item:

- Recommended order item 2: H3 MoneyPrinter open target hardening.

Changes:

- Added `sanitizeMoneyPrinterTaskVideoUrl()` in `server/routes/money-printer-routes.js`.
- Changed `task-video` open target resolution to accept only sanitized `http:` / `https:` URLs.
- Rejected usernames/passwords, control characters, whitespace, backslashes, quotes, pipes, semicolons, angle brackets, and URLs longer than 2048 characters.
- Removed Windows `cmd /c start` from `openExternal()`.
- Added `openExternalCommand()` so Windows opens external targets through `explorer.exe` with direct args and `shell: false`.
- Extended `test-money-printer-production.mjs` with H3 regressions.

Security behavior now covered:

- `file:` and `javascript:` URLs are rejected.
- URLs with userinfo are rejected.
- Shell metacharacter cases such as `& calc`, pipe, quote, newline, and backslash are rejected.
- Windows opener command is `explorer.exe`, not `cmd.exe`.
- Fixed directory targets remain server-enumerated (`root`, `tasks`) instead of accepting arbitrary client paths.

Verification:

- `node test-money-printer-production.mjs`: passed.
- `node --check server/routes/money-printer-routes.js; node --check test-money-printer-production.mjs`: passed.
- `npm.cmd run check:gate`: passed.

Next item:

- Recommended order item 3: H1 local API trust boundary. Delete or desensitize `/api/settings/all`, restrict image asset paths, and add Host/Origin/session token checks.

## 2026-07-19 18:28 +08:00

Branch: `fix/p0-stability`

Base state:

- Started from `35f67a0` (`fix(security): harden moneyprinter open targets`).
- Synced with `origin/fix/p0-stability` using `git fetch --prune origin` and `git pull --ff-only`.
- Working tree was clean before H1 work.

Completed item:

- Recommended order item 3: H1 local API trust boundary.

Changes:

- Added a per-start random local API session token in `ui-server.mjs`.
- Static HTML responses now set a strict HttpOnly local session cookie.
- All HTTP requests validate local Host before routing.
- All `/api/*` requests require allowed Host, allowed Origin for unsafe methods, a valid local session token, and JSON content type for write bodies with payloads.
- WebSocket `/ws/progress` upgrades now validate path, Host, Origin, and local session token.
- `/api/settings/all` is disabled and no longer returns `readSettings()`.
- Image file and thumbnail routes now resolve paths through a managed image resolver.
- Image routes prefer asset `id` / `assetId`; legacy `path` fallback is constrained to managed directories and image extensions.
- Image assets now expose id-based thumbnail URLs.
- Workbench image previews now prefer id-based file/thumbnail URLs.
- E2E test setup now establishes a local session cookie and expects the settings dump endpoint to remain disabled.
- Added `test-local-api-trust-boundary.mjs` and wired it into `npm.cmd run check:gate`.

Security behavior now covered:

- Bad Host is rejected before routing.
- Bad Origin is rejected for protected API writes and WebSocket upgrades.
- Missing local session token is rejected.
- Non-JSON write bodies with payloads are rejected.
- `/api/settings/all` cannot expose API keys through the old settings dump.
- `/api/image/file` and `/api/image/thumbnail` cannot read arbitrary local files outside managed image roots.
- WebSocket progress clients must come from the local page session.

Verification:

- `node test-local-api-trust-boundary.mjs`: passed.
- `node --check ui-server.mjs; node --check server/image/image-service.js; node --check ui/workbench.js; node --check test-e2e.mjs; node --check test-local-api-trust-boundary.mjs`: passed.
- `npm.cmd run check:gate`: passed.

Next item:

- Recommended order item 4: H5 image asset DOM XSS. Remove data-driven inline handlers and make image asset rendering use DOM/textContent instead of unsafe HTML string injection.

## 2026-07-19 19:16 +08:00

Branch: `fix/p0-stability`

Mode change:

- User changed the immediate repair strategy from audit-order P0 work to production-line repair.
- New line-by-line workflow: inspect first, analyze second, repair last.
- First production line selected: dynamic big text video (`kinetic-text`).

Completed item:

- Dynamic big text video minimal runability guard.

Findings:

- Existing kinetic focused tests passed:
  - `node test-kinetic-preview-seek.mjs`
  - `node test-kinetic-overlay-position.mjs`
  - `node test-kinetic-illustration-toggle.mjs`
- A direct service-level smoke run successfully created a kinetic text project and rendered a short MP4 through ffmpeg/libass.
- The main gap was that `check:gate` did not include a real MP4 render smoke test, so a future break in ffmpeg path wiring, subtitle generation, or render completion could slip through until manual use.

Changes:

- Added `test-kinetic-text-render-smoke.mjs`.
- Added `test:kinetic-render-smoke` script.
- Wired `test-kinetic-text-render-smoke.mjs` into `npm.cmd run check:gate`.

Behavior now covered:

- Kinetic text service can create a project from text without external model calls.
- Sentence segments are created for the dynamic text project.
- Render job completes.
- ASS and SRT subtitle files are generated.
- Final MP4 exists, is non-empty, and has an MP4 `ftyp` header.

Next recommended production-line step:

- If the user reports a specific dynamic big text UI failure, inspect that screen flow next. Otherwise continue production-line smoke coverage for the next line the user chooses.

## 2026-07-19 19:38 +08:00

Branch: `fix/p0-stability`

Completed item:

- Dynamic big text video stable subtitle handoff rules for `voice audio + timestamped subtitles + voice script`.

Rules now enforced:

- TTS/shared production-line subtitle rows keep the original row count.
- Each subtitle row keeps its original `start` and `end` time exactly.
- Only subtitle text is replaced, using the closest matching text from the voice script.
- Low-confidence or imperfect matches do not block dynamic big text video generation.
- Stale ASR word rows are cleared after sentence-level correction so they cannot override corrected sentence text in rolling focus rendering.
- Manual edits made directly in the dynamic big text subtitle timeline remain editable and are not forcibly rewritten by the server.

Changes:

- Reused the existing source-constrained subtitle repair engine in `server/kinetic-text/kinetic-text-service.js`.
- Added `constrainKineticTimelineToVoiceScript()` for the dynamic big text production line.
- Applied the rule during TTS project creation and shared production timeline updates.
- Added `test-kinetic-timeline-stability.mjs`.
- Wired `test:kinetic-timeline-stability` into `npm.cmd run check:gate`.

Behavior now covered:

- Homophones, wrong characters, and badly matched ASR rows are corrected against the voice script.
- The dynamic big text video line continues even when a row is not a clean match.
- The user can still manually fix subtitle text in the timeline after preview.

## 2026-07-19 19:50 +08:00

Branch: `fix/p0-stability`

Completed item:

- Dynamic big text video local contaminated project repair for `kinetic-1784432037932-32ff99`.

User-visible failure:

- The project used `tts-2.mp3` / `tts-2-timestamped.txt`, but the subtitle timeline UI showed stale text from an older topic in `segments`.
- `sentenceTimeline` still pointed at the current TTS timing, while `segments` had been polluted, so the frontend displayed old text even though the current audio/source belonged to `你学习慢，是不是从头翻到尾`.

Rules reinforced:

- `originalText` is the only authoritative correction source for this line.
- Keep subtitle row count and each row's `start` / `end` unchanged.
- Replace only row text.
- Preserve punctuation from the voice script when proportional fallback is needed.
- Clear stale word-level ASR timing for repaired rows so old highlights cannot override corrected sentence text.
- Legacy shared-timeline projects self-heal on read/save when `segments` no longer match `originalText`, unless the timeline has been manually edited.
- Manual subtitle timeline edits are marked with `timelineManualEditedAt` so the self-heal rule will not overwrite the user's hand correction.
- Shared updates that only echo current subtitle rows cannot downgrade an existing authoritative `originalText`.

Local data repair:

- Backed up the polluted project to `.data/kinetic-text/projects/kinetic-1784432037932-32ff99/project.before-fix-20260719-194319.json`.
- Rebuilt `segments`, `sentenceTimeline`, and `subtitleTimeline` from the project's existing timing rows plus `originalText`.
- Set project `text` back to `originalText`.
- Cleared `wordTimeline`.

Code changes:

- `proportionalVoiceScriptRows()` now slices compact voice script text while preserving punctuation instead of stripping punctuation.
- New dynamic big text projects persist `final_text` as `originalText` when no explicit `original_text` is supplied.
- Shared production-line updates refresh `text` and `originalText` together before saving.
- `ui/modules/kinetic-text.js` keeps `project.originalText` when the shared TTS payload lacks `original_text`, instead of writing an empty source.
- `test-kinetic-timeline-stability.mjs` now asserts punctuation-preserving reconstruction, persisted correction source, legacy pollution self-heal, and manual edit preservation.

Verification:

- `npm.cmd run test:kinetic-timeline-stability` passed.
- `npm.cmd run check:gate` passed.

## 2026-07-19 20:25 +08:00

Branch: `fix/p0-stability`

Completed item:

- Dynamic big text subtitle timeline edits now require explicit confirmation.

User-visible behavior:

- Editing rows in `字幕时间轴` no longer writes to disk immediately.
- The UI shows `有未确定修改` after a timeline edit.
- The new `确定修改` button is enabled only while timeline edits are pending.
- Only clicking `确定修改` saves timeline `segments` / `duration`.
- Focus-out no longer syncs or saves kinetic subtitle text automatically.

Stability note:

- Non-timeline saves, uploads, and local keyword analysis preserve the unsaved timeline draft in the page without writing it to the project file.

Verification:

- `npm.cmd run test:tts-handoff-subtitle-correction` passed.
- `npm.cmd run check:syntax` passed.

## 2026-07-19 20:45 +08:00

Branch: `fix/p0-stability`

Completed item:

- Removed the right status rail from the main workbench layout.

User-visible behavior:

- The right-side blocks `任务线程`, `最近生成`, `错误提示`, and `快捷操作` are no longer rendered.
- The main workspace now uses the former right rail width.
- Queue controls that were previously moved into the rail are retained in the settings/batch area when the rail is absent.

Verification:

- `npm.cmd run test:page-lifecycle` passed.
- `npm.cmd run check:syntax` passed.

## 2026-07-19 21:15 +08:00

Branch: `fix/p0-stability`

Completed item:

- Added a central TTS subtitle timeline editor inside `语音生成与发送`.

User-visible behavior:

- A new `字幕时间轴` module now appears to the right of `项目文案`.
- After audio generation, the selected/latest TTS job's sentence timeline is shown there.
- Start/end times are read-only; only subtitle text is editable.
- Edits remain local until `确定修改` is clicked.
- `确定修改` writes the edited text back into the TTS job's script, SRT/VTT, timestamped text, sentence timeline, and word timeline.
- `发送所选` still uses the same send flow and target checkboxes as before.
- If a TTS job was confirmed from the new TTS timeline editor, send uses that confirmed TTS triplet directly instead of running another send-time correction over the user's manual edit.
- CS1, Xiaohei, MoneyPrinter, and kinetic text pages keep their own editable subtitle timelines; those edits remain page-local and do not become the shared TTS source.

Verification:

- `npm.cmd run test:tts-alignment-service` passed.
- `npm.cmd run test:tts-handoff-subtitle-correction` passed.
- `npm.cmd run check:syntax` passed.

## 2026-07-19 21:35 +08:00

Branch: `fix/p0-stability`

Completed item:

- Fixed the missing TTS `字幕时间轴` module in the actual rendered 2026 workbench.

Root cause:

- `ui/index.html` already contained `#ttsTimelineColumn`, but `ui/workbench.js` rebuilds the TTS page from the legacy `.tts-workbench` into `.tts-studio-grid`.
- That rebuild moved only the script, voice settings, preview/alignment, handoff, and history areas, then removed the old workbench. Because `#ttsTimelineColumn` was not moved first, the browser deleted it during startup.

User-visible behavior:

- The TTS workbench now renders four lanes in order: `项目文案 | 字幕时间轴 | 选择声音 | 试听与发送`.
- The `字幕时间轴` lane is immediately to the right of `项目文案`.
- The generated-record send flow is unchanged.

Regression coverage:

- `test-tts-handoff-subtitle-correction.mjs` now asserts that `workbench.js` moves `#ttsTimelineColumn` into a `tts-timeline-lane` and appends it between `inputLane` and `settingsLane`.

Verification:

- `npm.cmd run test:tts-handoff-subtitle-correction` passed.
- `npm.cmd run check:syntax` passed.
- `npm.cmd run check:gate` passed.

## 2026-07-19 21:50 +08:00

Branch: `fix/p0-stability`

Completed item:

- Ensured newly generated TTS audio immediately syncs its timestamped subtitle timeline into the central TTS `字幕时间轴` module.

Root cause:

- The central timeline could render from the latest selected job, but the generation completion flow still relied on the just-returned object in some paths.
- MiniMax Music generation first creates audio through `/api/voice-assets/preview`, then registers it through `/api/tts/import-generated`; the UI now forces a fresh `/api/tts/job?id=...` read after registration so the page uses the fully persisted subtitle timeline.

User-visible behavior:

- After clicking `根据文案生成音频`, when the job reaches completed state, the TTS page automatically loads that job into the central `字幕时间轴`.
- This applies to both normal TTS generation and MiniMax Music preset generation.
- Users no longer need to click the history row's `校对字幕` button just to populate the central timeline.

Regression coverage:

- `test-tts-handoff-subtitle-correction.mjs` now asserts the shared `syncGeneratedTtsJobToCentralTimeline()` function exists, fetches `/api/tts/job`, renders `renderTtsCentralTimeline(...)`, and is called from both normal and music generation completion paths.

Verification:

- `npm.cmd run test:tts-handoff-subtitle-correction` passed.
- `npm.cmd run check:syntax` passed.
- `npm.cmd run check:gate` passed.

## 2026-07-19 22:10 +08:00

Branch: `fix/p0-stability`

Completed item:

- Moved the TTS production-line selection and send action into the central `字幕时间轴` workflow.

User-visible behavior:

- The central timeline button is now labeled `确定修改并发送到：`.
- The production-line checkboxes now live inside the TTS `字幕时间轴` card, directly under the confirm/send action area.
- The button is enabled whenever the current TTS job has a subtitle timeline, even if the user has not edited text.
- Clicking it saves the current timeline text into the TTS triplet, then sends `文案 + 音频 + 带时间戳字幕` to the checked production lines.
- The TTS workbench layout is now top-row `项目文案 | 字幕时间轴 | 选择声音`; the generated-record lane spans the full row underneath those three modules instead of occupying the right side.
- Generated records no longer show their own production-line checkbox/send entry; sending is centralized through the timeline confirm flow.

Regression coverage:

- `test-tts-handoff-subtitle-correction.mjs` asserts the new button label, central production-line checkboxes, `confirmAndSendTtsCentralTimeline()`, save-before-send order, and central handoff target lookup.

Verification:

- `npm.cmd run test:tts-handoff-subtitle-correction` passed.
- `npm.cmd run check:syntax` passed.
- `npm.cmd run check:gate` passed.

## 2026-07-19 22:30 +08:00

Branch: `fix/p0-stability`

Completed item:

- Removed the generated-record `校对字幕` / `查看字幕详情` entry points and restored per-record production-line checkbox sending.

User-visible behavior:

- TTS generated records no longer show `校对字幕` or `查看字幕详情` buttons.
- Completed confirmed generated records again show production-line checkboxes plus `发送所选`.
- Sending from a generated record still sends the TTS triplet: `文案 + 音频 + 带时间戳字幕`.
- The TTS page remembers the last selected production-line targets in localStorage key `dy:tts:handoff-targets`.
- Central timeline checkboxes and generated-record checkboxes both default to the last-used selection; first use defaults to all four production lines.

Regression coverage:

- `test-tts-handoff-subtitle-correction.mjs` asserts no `tts-job-calibrate` / `校对字幕` / `查看字幕详情` remains in the runtime, verifies generated records render handoff checkboxes and `发送所选`, and verifies last-used target persistence helpers exist.

Verification:

- `npm.cmd run test:tts-handoff-subtitle-correction` passed.
- `npm.cmd run check:syntax` passed.
- `npm.cmd run check:gate` passed.
