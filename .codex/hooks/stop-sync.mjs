import { runSync } from "../../sync-project.mjs";

function output(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

try {
  const result = await runSync({ mode: "upload", quiet: true });
  const message = result.messages.at(-1) || "本轮结束时已检查同步状态。";

  output({
    continue: true,
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: `本轮 Codex 结束同步结果：${message}`,
    },
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  output({
    continue: true,
    systemMessage: `本轮结束自动上传失败：${message}`,
  });
}
