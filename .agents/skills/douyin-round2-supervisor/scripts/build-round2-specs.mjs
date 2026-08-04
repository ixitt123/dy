import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRows, readPlan, resolvePlanPath } from "./round2-plan-lib.mjs";
import { buildExecutionSpecs, planDefinitionFingerprint } from "./round2-spec-lib.mjs";

const args = process.argv.slice(2);
const planPath = resolvePlanPath(args);
const outputIndex = args.indexOf("--output");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(outputIndex >= 0 && args[outputIndex + 1]
  ? args[outputIndex + 1]
  : path.join(scriptDir, "..", "references", "round2-execution-specs.json"));

try {
  const rows = parseRows(readPlan(planPath));
  if (rows.length !== 72) throw new Error(`expected 72 rows, found ${rows.length}`);
  const document = {
    schemaVersion: 1,
    plan: "02-短视频软件第二轮彻底修复执行总表.md",
    definitionSha256: planDefinitionFingerprint(rows),
    generatedBy: ".agents/skills/douyin-round2-supervisor/scripts/build-round2-specs.mjs",
    itemCount: rows.length,
    items: buildExecutionSpecs(rows),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(`[round2-specs] OK: ${outputPath}`);
  console.log(`[round2-specs] items=${rows.length} definition=${document.definitionSha256}`);
} catch (error) {
  console.error(`[round2-specs] FAIL: ${error.message}`);
  process.exit(1);
}
