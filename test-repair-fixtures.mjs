// test-repair-fixtures.mjs
// 00.04：校验 fixtures/ 存在、可读、哈希固定且不含密钥/用户资产
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = "fixtures";
const EXPECTED_SCENARIOS = [
  "rewrite-crossover",
  "tts",
  "bgm",
  "cs1",
  "kinetic-text",
  "moneyprinter",
  "xiaohei",
];
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /access[_-]?key/i,
  /secret[_-]?id/i,
  /secret[_-]?key/i,
];

let passed = 0;
let failed = 0;
const hashManifest = [];
const fixtureHashes = {};

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`✅ ${name}${detail ? ": " + detail : ""}`);
    passed++;
  } else {
    console.log(`❌ ${name}${detail ? ": " + detail : ""}`);
    failed++;
  }
}

// 1. fixtures/ 目录存在
check("fixtures/ 目录存在", existsSync(FIXTURES_DIR));

// 2. 7 个场景 fixture 存在
for (const scenario of EXPECTED_SCENARIOS) {
  const inputPath = join(FIXTURES_DIR, scenario, "input.json");
  check(`fixture ${scenario}/input.json 存在`, existsSync(inputPath));
  if (existsSync(inputPath)) {
    // 3. 可读（JSON 解析）
    try {
      const content = readFileSync(inputPath, "utf8");
      const data = JSON.parse(content);
      check(`fixture ${scenario} 可读`, true);

      // 4. 哈希固定
      const hash = createHash("sha256").update(content).digest("hex");
      hashManifest.push(`${hash}  ${inputPath}`);
      fixtureHashes[`${scenario}/input.json`] = hash;
      check(`fixture ${scenario} 哈希固定`, true, hash.substring(0, 12));

      // 5. 不含密钥
      const contentStr = JSON.stringify(data);
      const hasSensitive = SENSITIVE_PATTERNS.some((p) => p.test(contentStr));
      check(`fixture ${scenario} 不含密钥`, !hasSensitive);
    } catch (e) {
      check(`fixture ${scenario} 可读`, false, e.message);
    }
  }
}

// 6. expected/manifest.json 存在且可读
const manifestPath = join(FIXTURES_DIR, "expected", "manifest.json");
check("expected/manifest.json 存在", existsSync(manifestPath));
if (existsSync(manifestPath)) {
  try {
    const content = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(content);
    check("expected/manifest.json 可读", true);
    const hash = createHash("sha256").update(content).digest("hex");
    hashManifest.push(`${hash}  ${manifestPath}`);
    check("expected/manifest.json 包含 fixtureHashes", Boolean(manifest.fixtureHashes && typeof manifest.fixtureHashes === "object"));
    for (const [relativePath, expectedHash] of Object.entries(fixtureHashes)) {
      check(`fixture ${relativePath} 与清单哈希一致`, manifest.fixtureHashes?.[relativePath] === expectedHash);
    }
  } catch (e) {
    check("expected/manifest.json 可读", false, e.message);
  }
}

// 7. README.md 存在
check("fixtures/README.md 存在", existsSync(join(FIXTURES_DIR, "README.md")));

// 输出哈希清单
console.log("\n=== Fixture 哈希清单 ===");
hashManifest.forEach((h) => console.log(h));

console.log(`\n📊 fixture 校验: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
