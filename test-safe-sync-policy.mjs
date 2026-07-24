import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gitTreesMatch, isProtectedPublishBranch } from "./sync-project.mjs";

assert.equal(isProtectedPublishBranch("main"), true);
assert.equal(isProtectedPublishBranch("MASTER"), true);
assert.equal(isProtectedPublishBranch("fix/p0-stability"), false);
assert.equal(gitTreesMatch("tree-a", "tree-a"), true);
assert.equal(gitTreesMatch("tree-a", "tree-b"), false);
assert.equal(gitTreesMatch("", ""), false);

const [launcher, syncSource, stopHook, startBat, uploadBat, updateBat] = await Promise.all([
  readFile(new URL("./launch-ui.mjs", import.meta.url), "utf8"),
  readFile(new URL("./sync-project.mjs", import.meta.url), "utf8"),
  readFile(new URL("./.codex/hooks/stop-sync.mjs", import.meta.url), "utf8"),
  readFile(new URL("./启动.bat", import.meta.url), "utf8"),
  readFile(new URL("./同步项目.bat", import.meta.url), "utf8"),
  readFile(new URL("./安全更新.bat", import.meta.url), "utf8"),
]);

assert.doesNotMatch(launcher, /sync-project\.mjs|runSync|startSyncWatcher/u);
assert.match(syncSource, /后台自动提交和上传已停用/u);
assert.doesNotMatch(stopHook, /git\s+(?:add|commit|push)/u);
assert.match(stopHook, /不会自动提交或上传/u);
assert.doesNotMatch(startBat, /sync-project\.mjs|自动拉取|自动上传/u);
assert.match(uploadBat, /sync-project\.mjs upload/u);
assert.match(updateBat, /sync-project\.mjs pull/u);

console.log("Safe sync policy: OK");
