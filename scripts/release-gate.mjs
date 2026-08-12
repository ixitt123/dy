// scripts/release-gate.mjs
//
// 统一发布门禁（01.05）：每个类别独立执行、独立退出码、独立日志。
// 完整门禁包含 unit/http/browser/media/restart/security/external；任何失败或
// 必需类别未接入都会阻止发布。退出码：0=通过，1=失败，2=阻塞。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  findPidByPort,
  startUiServer,
  stopService,
  waitForHealth,
} from "./service-restart.mjs";

const NODE = process.execPath;
const EXIT = Object.freeze({ passed: 0, failed: 1, blocked: 2 });
const test = (file, note, options = {}) => ({ cmd: NODE, args: [file], note, ...options });

const CATEGORIES = [
  {
    name: "unit",
    label: "单元/静态测试",
    tests: [
      test("scripts/check-js-syntax.mjs", "全部 JavaScript 语法"),
      test("check-install.mjs", "本机安装与依赖"),
      test("test-xiaohei-prompt-copy.mjs", "小黑提示词复制安全"),
      test("test-xiaohei-one-click-images.mjs", "小黑一键图片"),
      test("test-money-printer-production.mjs", "MoneyPrinter 生产接线"),
      test("test-moments-original-mode.mjs", "朋友圈原文模式"),
      test("test-workflow-conveniences.mjs", "工作流便利功能"),
      test("test-structured-json-parser.mjs", "结构化 JSON"),
      test("test-source-constrained-repair.mjs", "字幕来源约束"),
      test("test-rewrite-completeness.mjs", "改写完整性"),
      test("test-rewrite-conversion-quality.mjs", "改写转化质量"),
      test("test-source-constrained-music-repair.mjs", "音乐 ASR 来源约束"),
      test("test-tts-handoff-subtitle-correction.mjs", "TTS 交接字幕修正"),
      test("test-tts-handoff-isolation.mjs", "TTS 交接隔离"),
      test("test-production-tts-integrity.mjs", "生产 TTS 内容完整性"),
      test("test-kinetic-download-flow.mjs", "动态大字下载流"),
      test("test-page-lifecycle.mjs", "页面生命周期"),
      test("test-kinetic-timeline-stability.mjs", "动态大字时间轴"),
      test("test-kinetic-project-list-performance.mjs", "动态大字项目列表复用最终资产"),
      test("test-provider-registry.mjs", "Provider 注册表"),
      test("test-pipeline-runner-fail-policy.mjs", "生产线失败策略"),
      test("test-tts-alignment.mjs", "TTS 对齐"),
      test("test-tts-alignment-service.mjs", "TTS 对齐服务"),
      test("test-subtitle-render.mjs", "字幕正式渲染"),
      test("test-model-mapping-normalization.mjs", "模型映射归一化"),
      test("test-proof-scope.mjs", "测试证明范围"),
      test("test-browser-behavior-scope.mjs", "浏览器行为证明范围"),
      test("test-production-media-proof-scope.mjs", "生产媒体证明范围"),
      test("test-production-media-line-binding-scope.mjs", "生产线媒体绑定范围"),
      test("test-service-restart-scope.mjs", "重启证明范围"),
      test("test-release-gate-scope.mjs", "发布门禁防回退"),
      test("test-error-code-integration.mjs", "错误码生产集成"),
      test("test-image-delete-boundary.mjs", "图片删除边界"),
      test("test-settings-concurrency.mjs", "设置并发与单写入者"),
      test("test-ui-server-read-observability.mjs", "UI 服务读取可观测性"),
      test("test-ui-server-streamed-file-response.mjs", "UI 服务流式文件响应"),
      test("test-xlsx-export-compatibility.mjs", "XLSX 导出兼容"),
    ],
  },
  {
    name: "http",
    label: "HTTP/源码契约测试",
    requiresUi: true,
    tests: [
      test("test-http-contract.mjs", "HTTP/源码契约"),
      test("test-error-code-http.mjs", "错误码 HTTP 契约"),
    ],
  },
  {
    name: "browser",
    label: "真实浏览器测试",
    requiresUi: true,
    tests: [
      test("test-browser-smoke.mjs", "Chrome CDP 真实控件与刷新"),
      test("test-task-export-xlsx-browser.mjs", "浏览器 XLSX 任务导出"),
    ],
  },
  {
    name: "media",
    label: "真实媒体测试",
    tests: [
      test("test-media-verifier.mjs", "ffprobe/ffmpeg 媒体验证器"),
      test("test-production-media-verification.mjs", "本轮媒体路径绑定"),
      test("test-cs1-bgm-mix.mjs", "CS1 最终 BGM 混音"),
      test("test-money-printer-final-render.mjs", "MoneyPrinter 最终合成"),
      test("test-xiaohei-video-render.mjs", "小黑真实渲染"),
      test("test-kinetic-text-render-smoke.mjs", "动态大字真实渲染"),
      test("test-production-media-line-binding-scope.mjs", "四条生产线媒体绑定"),
    ],
  },
  {
    name: "restart",
    label: "服务重启恢复测试",
    requiresUi: true,
    tests: [test("test-service-restart.mjs", "8787/8080/浏览器真实重启恢复")],
  },
  {
    name: "security",
    label: "安全测试",
    tests: [
      test("test-download-safety.mjs", "下载目录安全"),
      test("test-static-path-safety.mjs", "静态路径安全"),
      test("test-local-api-trust-boundary.mjs", "本地 API 信任边界"),
      test("test-settings-secret-safety.mjs", "设置密钥安全"),
      test("test-safe-sync-policy.mjs", "安全同步策略"),
      test("test-ssrf-guard.mjs", "SSRF 防护"),
      test("test-atomic-write.mjs", "原子写"),
      test("test-error-codes.mjs", "结构化错误码"),
    ],
  },
  {
    name: "external",
    label: "外部服务测试",
    required: true,
    tests: [],
    note: "真实供应商 TTS/BGM/四条生产线外部任务尚未接入；空必需类别必须阻塞发布。",
  },
];

function readOption(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return "";
  const value = String(argv[index + 1] || "").trim();
  if (!value) throw new Error(`${name} 缺少参数`);
  return value;
}

function parseOptions(argv) {
  const rawOnly = readOption(argv, "--only");
  const report = readOption(argv, "--report");
  const evidenceDir = readOption(argv, "--evidence-dir");
  const selected = rawOnly
    ? new Set(rawOnly.split(",").map((value) => value.trim()).filter(Boolean))
    : null;
  const known = new Set(CATEGORIES.map((category) => category.name));
  for (const name of selected || []) {
    if (!known.has(name)) throw new Error(`未知门禁分类：${name}`);
  }
  return { selected, report, evidenceDir };
}

function safeFilePart(value) {
  return String(value || "test").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "test";
}

function runTest(entry, categoryName, index, evidenceDir) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const env = { ...process.env };
  if (evidenceDir && categoryName === "browser") {
    env.BROWSER_EVIDENCE_FILE = path.resolve(evidenceDir, "browser", "browser-smoke.png");
  }
  if (evidenceDir && categoryName === "restart") {
    env.RESTART_EVIDENCE_DIR = path.resolve(evidenceDir, "restart");
  }
  if (evidenceDir && categoryName === "media") {
    env.PRODUCTION_MEDIA_EVIDENCE_DIR = path.resolve(evidenceDir, "media");
  }
  const result = spawnSync(entry.cmd, entry.args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: entry.timeoutMs || 240000,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  let logPath = "";
  if (evidenceDir) {
    logPath = path.resolve(evidenceDir, "tests", categoryName, `${String(index + 1).padStart(2, "0")}-${safeFilePart(entry.args[0])}.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, output, "utf8");
  }
  return {
    command: [entry.cmd, ...entry.args].join(" "),
    note: entry.note,
    startedAt,
    durationMs: Date.now() - startedMs,
    exitCode,
    status: exitCode === 0 ? "passed" : "failed",
    timedOut: result.error?.code === "ETIMEDOUT",
    signal: result.signal || null,
    logPath,
    tail: output.trim().split(/\r?\n/).slice(-5).join(" | "),
  };
}

function categoryResult(category, evidenceDir) {
  if (category.tests.length === 0) {
    return {
      label: category.label,
      status: category.required ? "blocked" : "skipped",
      exitCode: category.required ? EXIT.blocked : EXIT.passed,
      passed: 0,
      failed: 0,
      note: category.note || "没有配置测试",
      tests: [],
    };
  }
  const tests = category.tests.map((entry, index) => runTest(entry, category.name, index, evidenceDir));
  const failed = tests.filter((entry) => entry.exitCode !== 0).length;
  return {
    label: category.label,
    status: failed === 0 ? "passed" : "failed",
    exitCode: failed === 0 ? EXIT.passed : EXIT.failed,
    passed: tests.length - failed,
    failed,
    note: "",
    tests,
  };
}

let options;
try {
  options = parseOptions(process.argv.slice(2));
} catch (error) {
  console.error(`发布门禁参数错误：${error.message}`);
  process.exitCode = EXIT.failed;
  process.exit();
}

const categoriesToRun = options.selected
  ? CATEGORIES.filter((category) => options.selected.has(category.name))
  : CATEGORIES;
const gateStartedAt = new Date().toISOString();
const uiWasRunning = Boolean(findPidByPort(8787));
if (categoriesToRun.some((category) => category.requiresUi) && !uiWasRunning) {
  startUiServer(process.cwd());
  if (!await waitForHealth("http://127.0.0.1:8787", 25000)) {
    console.error("发布门禁无法启动 8787，本轮需要 UI 的类别将如实失败。");
  }
}

const categories = {};
for (const category of categoriesToRun) {
  console.log(`\n${"=".repeat(60)}\n▌${category.label} (${category.name})\n${"=".repeat(60)}`);
  const result = categoryResult(category, options.evidenceDir);
  categories[category.name] = result;
  if (result.status === "blocked") {
    console.log(`  ⛔ 阻塞（exit 2）：${result.note}`);
    continue;
  }
  for (const entry of result.tests) {
    console.log(`  ${entry.exitCode === 0 ? "✅" : "❌"} exit=${entry.exitCode} ${entry.note}`);
    if (entry.exitCode !== 0) console.log(`     ${entry.tail}`);
  }
  console.log(`  小结: ${result.passed} passed, ${result.failed} failed, exit=${result.exitCode}`);
}

if (!uiWasRunning && findPidByPort(8787)) {
  await stopService(8787, "http://127.0.0.1:8787");
}

const categoryValues = Object.values(categories);
const exitCode = categoryValues.some((category) => category.status === "failed")
  ? EXIT.failed
  : categoryValues.some((category) => category.status === "blocked")
    ? EXIT.blocked
    : EXIT.passed;
const report = {
  schemaVersion: 1,
  startedAt: gateStartedAt,
  finishedAt: new Date().toISOString(),
  selected: options.selected ? [...options.selected] : CATEGORIES.map((category) => category.name),
  releaseReady: exitCode === EXIT.passed,
  exitCode,
  categories,
};

console.log(`\n${"=".repeat(60)}\n统一发布门禁汇总（分类独立退出码）\n${"=".repeat(60)}`);
for (const [name, category] of Object.entries(categories)) {
  console.log(`  ${category.status.padEnd(7)} exit=${category.exitCode} ${name}: ${category.passed} passed, ${category.failed} failed`);
}
console.log(`\n  发布结论: ${report.releaseReady ? "可发布" : exitCode === EXIT.blocked ? "阻塞" : "失败"}（exit=${exitCode}）`);

const reportPath = options.report || (options.evidenceDir ? path.resolve(options.evidenceDir, "result.json") : "");
if (reportPath) {
  const resolved = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`  报告: ${resolved}`);
}

process.exitCode = exitCode;
