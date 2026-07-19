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
