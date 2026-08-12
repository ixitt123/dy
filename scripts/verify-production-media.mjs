import fs from "node:fs";
import path from "node:path";
import { verifyProductionMedia } from "./media-verifier.mjs";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help") return { help: true };
    if (!key.startsWith("--")) throw new Error(`不支持的位置参数：${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`参数 ${key} 缺少值`);
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

function usage() {
  return [
    "用法：node scripts/verify-production-media.mjs --line <cs1|xiaohei|money-printer|kinetic-text> --artifact <本轮最终文件> [--narration <本轮旁白>] [--bgm <本轮独立BGM>] [--kind video|audio] [--report <报告JSON>]",
    "说明：不会寻找或替代历史样例；必须由生产线测试显式传入本轮实际输出路径。",
  ].join("\n");
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const report = verifyProductionMedia({
    line: args.line,
    artifactPath: args.artifact,
    narrationPath: args.narration || "",
    bgmPath: args.bgm || "",
    expectVideo: (args.kind || "video") !== "audio",
  });
  if (args.report) {
    const reportPath = path.resolve(args.report);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
} catch (error) {
  console.error(`生产线媒体验证失败：${error.message}\n${usage()}`);
  process.exitCode = 1;
}
