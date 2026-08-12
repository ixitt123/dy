import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  findPidByPort,
  startUiServer,
  stopService,
  waitForHealth,
} from "./service-restart.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const UI_URL = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 240_000;

const test = (file, note, options = {}) => ({ file, note, ...options });

export const ROUND2_SUPPLEMENTAL_TESTS = Object.freeze([
  test("test-rewrite-crossover.mjs", "改写交叉流程"),
  test("test-rewrite-draft-migration.mjs", "改写草稿迁移"),
  test("test-moments-emoji-audit.mjs", "朋友圈表情审计"),
  test("test-moments-emoji-platform.mjs", "朋友圈平台兼容"),
  test("test-tts-auto-preview.mjs", "TTS 自动预览"),
  test("test-tts-bgm-option.mjs", "TTS BGM 选项"),
  test("test-tts-bgm-generation.mjs", "TTS BGM 生成"),
  test("test-tts-bgm-persistence.mjs", "TTS BGM 持久化"),
  test("test-tts-bgm-progress.mjs", "TTS BGM 进度"),
  test("test-tts-bgm-player.mjs", "TTS BGM 播放器"),
  test("test-tts-bgm-volume.mjs", "TTS BGM 音量"),
  test("test-tts-bgm-tail.mjs", "TTS BGM 尾部"),
  test("test-tts-bgm-loudness.mjs", "TTS BGM 响度"),
  test("test-tts-bundle-labels.mjs", "TTS 三/四件套标签"),
  test("test-tts-send-selected-lines.mjs", "TTS 选择发送"),
  test("test-server-handoff-persistence.mjs", "服务端交接持久化"),
  test("test-production-receipts.mjs", "生产回执"),
  test("test-cs1-complete-acceptance.mjs", "CS1 完整验收及原片备份排除"),
  test("test-task-center-unification.mjs", "任务中心统一"),
  test("test-final-asset-registry.mjs", "最终资产注册表"),
  test("test-settings-concurrency.mjs", "设置并发"),
  test("test-dom-xss-dataflow.mjs", "DOM XSS 数据流"),
  test("test-image-delete-boundary.mjs", "图片删除边界"),
  test("test-error-code-http.mjs", "错误码 HTTP 契约"),
  test("test-error-code-integration.mjs", "错误码生产集成"),
  test("test-task-export-xlsx-browser.mjs", "浏览器 XLSX 导出"),
  test("test-xlsx-export-compatibility.mjs", "XLSX 兼容"),
  test("test-xiaohei-one-click-images-browser.mjs", "小黑四档倍速浏览器矩阵", { env: { XIAOHEI_SPEED_MATRIX: "1" } }),
  test("test-xiaohei-sync-matrix.mjs", "小黑 1.0/1.1/1.2/1.3 同步矩阵"),
  test("test-xiaohei-bgm-default-browser.mjs", "小黑 BGM 默认规则"),
  test("test-kinetic-atomic-bgm-browser.mjs", "动态大字 BGM 原子更新"),
  test("test-kinetic-bgm-player-browser.mjs", "动态大字 BGM 播放同步"),
  test("test-kinetic-bgm-recovery-browser.mjs", "动态大字 BGM 恢复"),
  test("test-money-printer-final-asset-browser.mjs", "MoneyPrinter 最终资产"),
  test("test-money-printer-final-bgm-loss.mjs", "MoneyPrinter BGM 丢失保护"),
  test("test-money-printer-final-bgm-handoff.mjs", "MoneyPrinter BGM 交接"),
  test("test-money-printer-final-bgm-mix.mjs", "MoneyPrinter BGM 混音"),
  test("test-money-printer-restart-recovery.mjs", "MoneyPrinter 重启恢复"),
  test("test-money-printer-progress-browser.mjs", "MoneyPrinter 浏览器进度"),
  test("test-ui-server-read-observability.mjs", "UI 服务读取可观测性"),
  test("test-ui-server-streamed-file-response.mjs", "UI 服务流式文件响应"),
]);

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function safePart(value) {
  return String(value || "test").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "test";
}

function readOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || "").trim() : "";
}

function loadTests(manifestPath) {
  if (!manifestPath) return { source: "round2-supplemental-41", tests: [...ROUND2_SUPPLEMENTAL_TESTS] };
  const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), "utf8"));
  if (!Array.isArray(manifest.tests) || !manifest.tests.length) throw new Error("custom manifest requires a non-empty tests array");
  return { source: path.resolve(manifestPath), tests: manifest.tests };
}

function validateTests(tests) {
  const seen = new Set();
  return tests.map((entry, index) => {
    const file = String(entry?.file || "").trim();
    if (!file) throw new Error(`test ${index + 1} is missing file`);
    const resolved = path.resolve(repoRoot, file);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`test file does not exist: ${resolved}`);
    if (seen.has(resolved.toLowerCase())) throw new Error(`duplicate test file: ${resolved}`);
    seen.add(resolved.toLowerCase());
    const timeoutMs = Number(entry.timeoutMs || DEFAULT_TIMEOUT_MS);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 900_000) throw new Error(`invalid timeout for ${file}`);
    return {
      file,
      resolved,
      note: String(entry.note || file).trim(),
      timeoutMs,
      env: entry.env && typeof entry.env === "object" ? entry.env : {},
    };
  });
}

async function ensureUiRunning(recoveryLog, reason) {
  const existingPid = findPidByPort(8787);
  if (existingPid) {
    recoveryLog.push({ reason, action: "already-running", pid: existingPid, ok: true });
    return true;
  }
  const child = startUiServer(repoRoot);
  const ok = await waitForHealth(UI_URL, 25_000);
  recoveryLog.push({ reason, action: "start", pid: child.pid || null, ok, finalPid: findPidByPort(8787) });
  return ok;
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function runRound2Matrix(options = {}) {
  const loaded = loadTests(options.manifestPath || "");
  const tests = validateTests(loaded.tests);
  const evidenceDir = path.resolve(options.evidenceDir || path.join(repoRoot, ".data", "repair-evidence", "R2-00.04", timestamp(), "complete-runner"));
  const logDir = path.join(evidenceDir, "tests");
  fs.mkdirSync(logDir, { recursive: true });

  const skipService = options.skipService === true;
  const originalPid = skipService ? null : findPidByPort(8787);
  const service = {
    skipped: skipService,
    initialRunning: skipService ? null : Boolean(originalPid),
    initialPid: originalPid,
    recoveries: [],
  };
  const startedAt = new Date().toISOString();
  const results = [];

  try {
    for (let index = 0; index < tests.length; index += 1) {
      const entry = tests[index];
      if (!skipService) await ensureUiRunning(service.recoveries, `before:${entry.file}`);
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `douyin-r2-${String(index + 1).padStart(2, "0")}-`));
      const logPath = path.join(logDir, `${String(index + 1).padStart(2, "0")}-${safePart(path.basename(entry.file))}.log`);
      const started = Date.now();
      const result = spawnSync(process.execPath, [entry.resolved], {
        cwd: repoRoot,
        env: {
          ...process.env,
          TMP: tempDir,
          TEMP: tempDir,
          TMPDIR: tempDir,
          ROUND2_TEST_TEMP_DIR: tempDir,
          ROUND2_TEST_EVIDENCE_DIR: evidenceDir,
          ...Object.fromEntries(Object.entries(entry.env).map(([key, value]) => [key, String(value)])),
        },
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        timeout: entry.timeoutMs,
        windowsHide: true,
      });
      const output = `${result.stdout || ""}${result.stderr || ""}`;
      fs.writeFileSync(logPath, output, "utf8");
      const timedOut = result.error?.code === "ETIMEDOUT";
      const exitCode = Number.isInteger(result.status) ? result.status : 1;
      let recoveredAfterFailure = null;
      if (!skipService && exitCode !== 0) {
        recoveredAfterFailure = await ensureUiRunning(service.recoveries, `after-failure:${entry.file}`);
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
      results.push({
        index: index + 1,
        file: entry.file,
        note: entry.note,
        command: `${process.execPath} ${entry.resolved}`,
        timeoutMs: entry.timeoutMs,
        durationMs: Date.now() - started,
        exitCode,
        status: timedOut ? "timed-out" : exitCode === 0 ? "passed" : "failed",
        timedOut,
        signal: result.signal || null,
        tempDir,
        tempRemoved: !fs.existsSync(tempDir),
        logPath,
        recoveredAfterFailure,
        tail: output.trim().split(/\r?\n/).slice(-8).join(" | "),
      });
    }
  } finally {
    if (!skipService) {
      if (service.initialRunning) {
        service.finalRestored = await ensureUiRunning(service.recoveries, "final:restore-running");
      } else if (findPidByPort(8787)) {
        const stopped = await stopService(8787, UI_URL);
        service.recoveries.push({ reason: "final:restore-stopped", action: "stop", ...stopped });
        service.finalRestored = stopped.stopped;
      } else {
        service.finalRestored = true;
      }
      service.finalPid = findPidByPort(8787);
      service.finalRunning = Boolean(service.finalPid);
    } else {
      service.finalRestored = true;
      service.finalPid = null;
      service.finalRunning = null;
    }
  }

  const failed = results.filter((entry) => entry.exitCode !== 0).length;
  const report = {
    schemaVersion: 1,
    matrixSource: loaded.source,
    matrixSha256: hashObject(tests.map(({ file, note, timeoutMs, env }) => ({ file, note, timeoutMs, env }))),
    matrixCount: tests.length,
    startedAt,
    finishedAt: new Date().toISOString(),
    passed: results.length - failed,
    failed,
    continuedAfterFailures: results.every((entry, index) => entry.exitCode === 0 || index < results.length - 1 || results.length === 1),
    service,
    tests: results,
  };
  const reportPath = path.join(evidenceDir, "round2-complete-runner-result.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, reportPath, exitCode: failed === 0 && service.finalRestored ? 0 : 1 };
}

if (path.resolve(process.argv[1] || "") === scriptPath) {
  const args = process.argv.slice(2);
  try {
    const result = await runRound2Matrix({
      manifestPath: readOption(args, "--manifest"),
      evidenceDir: readOption(args, "--evidence-dir"),
      skipService: args.includes("--skip-service"),
    });
    for (const entry of result.report.tests) {
      console.log(`${entry.exitCode === 0 ? "PASS" : "FAIL"} ${entry.index}/${result.report.matrixCount} ${entry.file} exit=${entry.exitCode}${entry.timedOut ? " timeout" : ""}`);
    }
    console.log(`[round2-complete] passed=${result.report.passed} failed=${result.report.failed} total=${result.report.matrixCount}`);
    console.log(`[round2-complete] serviceRestored=${result.report.service.finalRestored} report=${result.reportPath}`);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`[round2-complete] FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
