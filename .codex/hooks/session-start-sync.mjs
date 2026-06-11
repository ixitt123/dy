import { runSync } from "../../sync-project.mjs";

function output(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

try {
  const result = await runSync({ mode: "startup", quiet: true });
  const message = result.messages.at(-1) || "项目已检查同步状态。";
  const ready = result.ok && !result.skipped;

  output({
    continue: ready,
    stopReason: ready ? undefined : `项目没有确认到 GitHub 最新版本：${message}`,
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `本仓库以 GitHub main 分支为唯一最新版本源。SessionStart 同步结果：${message}`,
    },
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  output({
    continue: false,
    stopReason: `项目启动同步失败：${message}`,
    systemMessage: `项目启动同步失败：${message}`,
  });
}
