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
