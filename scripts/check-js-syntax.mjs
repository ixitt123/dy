import { execFileSync, spawnSync } from "node:child_process";

const output = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.js", "*.mjs"],
  { encoding: "utf8" },
);
const files = [...new Set(output.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];

for (const file of files) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) {
    process.stderr.write(check.stdout || "");
    process.stderr.write(check.stderr || "");
    throw new Error(`JavaScript 语法检查失败：${file}`);
  }
}

console.log(`JavaScript syntax: OK (${files.length} files)`);
