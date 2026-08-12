import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gitTreesMatch, isProtectedPublishBranch, normalizeExplicitStageFiles } from "./sync-project.mjs";

assert.equal(isProtectedPublishBranch("main"), true);
assert.equal(isProtectedPublishBranch("MASTER"), true);
assert.equal(isProtectedPublishBranch("fix/p0-stability"), false);
assert.equal(gitTreesMatch("tree-a", "tree-a"), true);
assert.equal(gitTreesMatch("tree-a", "tree-b"), false);
assert.equal(gitTreesMatch("", ""), false);
assert.deepEqual(normalizeExplicitStageFiles(["ui-server.mjs", "docs/readme.md"]), ["docs/readme.md", "ui-server.mjs"]);
assert.throws(() => normalizeExplicitStageFiles([]), /至少一个源代码文件/u);
assert.throws(() => normalizeExplicitStageFiles([".data/tasks.sqlite"]), /本地数据或素材/u);
assert.throws(() => normalizeExplicitStageFiles(["assets/demo.mp3"]), /本地数据或素材/u);
assert.throws(() => normalizeExplicitStageFiles(["settings.json"]), /本地数据或素材/u);
assert.throws(() => normalizeExplicitStageFiles(["../outside.mjs"]), /路径越界/u);
assert.throws(() => normalizeExplicitStageFiles(["ui-server.mjs", "ui-server.mjs"]), /重复文件/u);

const [launcher, syncSource, stopHook, startBat, uploadBat, updateBat, cs1Skill] = await Promise.all([
  readFile(new URL("./launch-ui.mjs", import.meta.url), "utf8"),
  readFile(new URL("./sync-project.mjs", import.meta.url), "utf8"),
  readFile(new URL("./.codex/hooks/stop-sync.mjs", import.meta.url), "utf8"),
  readFile(new URL("./启动.bat", import.meta.url), "utf8"),
  readFile(new URL("./同步项目.bat", import.meta.url), "utf8"),
  readFile(new URL("./安全更新.bat", import.meta.url), "utf8"),
  readFile(new URL("./skills/cs1/SKILL.md", import.meta.url), "utf8"),
]);

assert.doesNotMatch(launcher, /sync-project\.mjs|runSync|startSyncWatcher/u);
assert.match(syncSource, /后台自动提交和上传已停用/u);
assert.match(syncSource, /--files-file/u);
assert.doesNotMatch(syncSource, /\[\s*"add"\s*,\s*"-A"\s*\]/u);
assert.doesNotMatch(syncSource, /\[\s*"pull"\s*,\s*"--rebase"/u);
assert.doesNotMatch(stopHook, /git\s+(?:add|commit|push)/u);
assert.match(stopHook, /不会自动提交或上传/u);
assert.doesNotMatch(startBat, /sync-project\.mjs|自动拉取|自动上传/u);
assert.doesNotMatch(uploadBat, /^\s*node\s+sync-project\.mjs\s+upload/u);
assert.match(uploadBat, /--files-file/u);
assert.match(updateBat, /sync-project\.mjs pull/u);
assert.doesNotMatch(cs1Skill, /^\s*git add -A\s*$/mu);
assert.doesNotMatch(cs1Skill, /^\s*git push origin main\s*$/mu);

console.log("Safe sync policy: OK");
