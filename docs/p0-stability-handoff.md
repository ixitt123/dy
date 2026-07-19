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
