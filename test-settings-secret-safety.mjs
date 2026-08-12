import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const ignored = spawnSync("git", ["check-ignore", "-q", "settings.json"]);
assert.equal(ignored.status, 0, "settings.json must remain ignored");

const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "settings.json"], { encoding: "utf8" });
assert.notEqual(tracked.status, 0, "settings.json must never be tracked by Git");

console.log("Settings secret safety: OK");
