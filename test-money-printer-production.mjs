import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildFastMaterialPlan,
  buildMoneyPrinterVideoFilter,
  applyTrustedMoneyPrinterBgm,
  openExternalCommand,
  openTarget,
  resolveMaterialSourceOrder,
  sanitizeMptError,
  stageTtsBgmForMoneyPrinter,
  sanitizeMoneyPrinterTaskVideoUrl,
  shouldTryNextMaterialSource,
  updateMoneyPrinterTaskRuntime,
  moneyPrinterTaskPresentation,
} from "./server/routes/money-printer-routes.js";
import { buildAss } from "./server/kinetic-text/kinetic-text-service.js";
import { automaticSearchTerm, moneyPrinterTaskDisplay } from "./ui/modules/money-printer.js";

const [routeSource, uiSource, htmlSource] = await Promise.all([
  readFile(new URL("./server/routes/money-printer-routes.js", import.meta.url), "utf8"),
  readFile(new URL("./ui/modules/money-printer.js", import.meta.url), "utf8"),
  readFile(new URL("./ui/index.html", import.meta.url), "utf8"),
]);

assert.ok(routeSource.includes('path.join(rootDir, ".venv", "Scripts", "python.exe")'));
assert.ok(routeSource.includes("if (status.api.online) return"));
assert.ok(routeSource.includes("apiStartPromise"));
assert.ok(routeSource.includes("waitForApiReady"));
assert.ok(routeSource.includes("resolveMaterialSourceOrder"));
assert.ok(routeSource.includes("shouldTryNextMaterialSource"));
assert.ok(routeSource.includes("sanitizeMptError"));
assert.ok(routeSource.includes("stageTtsBgmForMoneyPrinter"));
assert.equal(routeSource.includes('spawn("cmd"'), false, "MoneyPrinter open target must not invoke cmd.exe");
assert.deepEqual(openExternalCommand("https://example.com/video.mp4", "win32"), {
  command: "explorer.exe",
  args: ["https://example.com/video.mp4"],
});
assert.ok(uiSource.includes("ensureApiReady().catch"));
assert.ok(uiSource.includes("正在切换备用素材 API"));
assert.ok(uiSource.includes("素材备用顺序"));
assert.ok(uiSource.includes("state.handoff.audio_path"));
assert.ok(uiSource.includes("subtitle_enabled: false"));
const finalRequestStart = uiSource.indexOf('postJson("/api/money-printer/render-final", {');
const finalRequestEnd = uiSource.indexOf("\n    });", finalRequestStart);
assert.ok(finalRequestStart >= 0 && finalRequestEnd > finalRequestStart, "must find the live final-render payload");
const finalRequestSource = uiSource.slice(finalRequestStart, finalRequestEnd);
for (const field of ["includeBgm", "bgm_file", "bgm_volume", "revision", "handoff_id"]) {
  assert.match(finalRequestSource, new RegExp(`\\b${field}\\b`), `final-render payload must carry ${field}`);
}
for (const token of ["moneyPrinterFinalVideo", "moneyPrinterFinalPreview", "moneyPrinterFinalDownload", "download=1", "showFinalAsset"]) {
  assert.ok(uiSource.includes(token), `final preview/download UI must include ${token}`);
}
const trustedHandoff = {
  id: "handoff-money-printer-test",
  revision: "revision-money-printer-test",
  targets: ["money-printer"],
  payload: { bgm_path: "D:\\trusted\\bgm.wav", bgm_volume: 0.18 },
};
const trustedFinal = applyTrustedMoneyPrinterBgm({
  includeBgm: true,
  handoff_id: trustedHandoff.id,
  revision: trustedHandoff.revision,
  bgm_file: trustedHandoff.payload.bgm_path,
  bgm_volume: 0.18,
}, { get: () => trustedHandoff });
assert.equal(trustedFinal.bgm_file, trustedHandoff.payload.bgm_path);
assert.equal(trustedFinal.bgm_volume, 0.18);
assert.throws(() => applyTrustedMoneyPrinterBgm({
  includeBgm: true,
  handoff_id: trustedHandoff.id,
  revision: trustedHandoff.revision,
  bgm_file: "D:\\untrusted\\bgm.wav",
  bgm_volume: 0.18,
}, { get: () => trustedHandoff }), /受信任资产/);
assert.throws(() => applyTrustedMoneyPrinterBgm({
  includeBgm: true,
  handoff_id: trustedHandoff.id,
  revision: "stale-revision",
  bgm_file: trustedHandoff.payload.bgm_path,
  bgm_volume: 0.18,
}, { get: () => trustedHandoff }), /revision/);
assert.equal(
  routeSource.includes("handleMoneyPrinterRoutes.shutdown = stopApiProcess"),
  false,
  "restarting the UI server must not kill an active MoneyPrinterTurbo task",
);
assert.equal(
  buildMoneyPrinterVideoFilter({
    width: 1920,
    height: 1080,
    frameRate: 30,
    textEffectEnabled: false,
    showBottomSubtitles: false,
  }),
  "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30[v]",
);
assert.ok(buildMoneyPrinterVideoFilter({
  width: 1920,
  height: 1080,
  frameRate: 30,
  textEffectEnabled: false,
  showBottomSubtitles: true,
  assPath: "D:\\tmp\\subtitle.ass",
}).includes("subtitles="));
assert.ok(
  uiSource.includes("任务连接暂时中断，正在自动重试"),
  "a transient polling error must keep retrying instead of freezing the progress display",
);
assert.equal(
  /catch \(error\) \{\s*stopPolling\(\);\s*setStatus\("任务轮询失败"/m.test(uiSource),
  false,
  "polling must not stop after a single request failure",
);
assert.ok(htmlSource.includes('id="moneyPrinterMaterialMode"'));
assert.ok(htmlSource.includes('value="fast"'));
assert.ok(htmlSource.includes('id="moneyPrinterTextEffectEnabled"'));
assert.equal(
  /data-money-printer-effect-setting[^>]*>\s*<input id="moneyPrinterBottomSubtitles"/m.test(htmlSource),
  false,
  "bottom keyword subtitles must remain independently selectable when the big-text effect is off",
);
assert.ok(
  htmlSource.includes('id="moneyPrinterBottomSubtitles" type="checkbox" checked'),
  "bottom keyword subtitles must be selected by default",
);
assert.ok(
  uiSource.includes("moneyPrefs.showBottomSubtitles ?? true"),
  "the first-run preference fallback must keep bottom keyword subtitles selected",
);
assert.ok(uiSource.includes('material_mode: els.materialMode.value'));
assert.ok(uiSource.includes("textEffectEnabled: els.textEffectEnabled.checked"));
assert.ok(routeSource.includes('target === "downloads"'));
assert.ok(uiSource.includes("state.task.progress"));
assert.ok(
  routeSource.includes('processing_stage: "video"') && routeSource.includes("progress_changed_at"),
  "a long 50% video/FFmpeg stage must expose persisted progress timing instead of looking failed",
);
assert.ok(
  uiSource.includes("视频合成仍在进行") && uiSource.includes("任务已经失败"),
  "the UI must distinguish a responsive long-running 50% task from an actual failed task",
);

const bottomOnlyAss = buildAss({
  effectId: "rolling-focus-subtitle",
  aspectRatio: "9:16",
  frameRate: 30,
  text: "底部关键词字幕",
  segments: [{
    id: "mpt-bottom-1",
    start: 0,
    end: 2,
    text: "底部关键词字幕",
    keywords: ["关键词"],
  }],
  showBottomSubtitles: true,
}, { includeMainText: false, includeBookends: false });
const bottomOnlyDialogues = bottomOnlyAss
  .split(/\r?\n/)
  .filter((line) => line.startsWith("Dialogue:"));
assert.ok(bottomOnlyDialogues.some((line) => line.includes(",Bottom,")));
assert.equal(
  bottomOnlyDialogues.some((line) => !line.includes(",Bottom,")),
  false,
  "bottom-only mode must not render the dynamic big-text track",
);

const fastPlan = buildFastMaterialPlan([
  { start: 0, end: 5.2, text: "运动后感觉疲惫", searchTerm: "tired workout" },
  { start: 5.2, end: 12.7, text: "仍然感觉身体虚弱", searchTerm: "tired workout" },
  { start: 12.7, end: 19.7, text: "身体正在逐渐变强", searchTerm: "strength training" },
  { start: 19.7, end: 31.8, text: "学习新知识时遇到困难", searchTerm: "student learning" },
  { start: 31.8, end: 42.4, text: "熬过脆弱吃力的阶段", searchTerm: "overcoming challenge" },
  { start: 42.4, end: 60.2, text: "面对困难就是成长", searchTerm: "personal growth" },
]);
assert.ok(fastPlan.groups.length >= 3 && fastPlan.groups.length <= 5);
assert.ok(fastPlan.clipDuration >= 12 && fastPlan.clipDuration <= 20);
assert.deepEqual(
  fastPlan.groups.flatMap((group) => group.segmentIndexes),
  [0, 1, 2, 3, 4, 5],
);
assert.equal(
  automaticSearchTerm("当你做运动的时候，可能觉得身体更累", { title: "学习一个新知识" }),
  "tired person exercising workout",
  "the segment text must take precedence over an unrelated title keyword",
);

const materials = { fallbackOrder: ["pexels", "pixabay", "coverr"] };
assert.deepEqual(resolveMaterialSourceOrder("pixabay", materials), ["pixabay", "pexels", "coverr"]);
assert.equal(shouldTryNextMaterialSource(
  { state: -1, progress: 40, failed_stage: "pipeline", error: "Pexels failed" },
  { sourceIndex: 0, materialSources: ["pexels", "pixabay"] },
), true);
assert.equal(
  sanitizeMptError('ValueError: pexels_api_keys is not set {"moonshot_api_key":"secret"}'),
  "Pexels 素材 API Key 未配置",
);
assert.ok(!sanitizeMptError('request failed {"api_key":"secret"}').includes("secret"));

const slowStarted = updateMoneyPrinterTaskRuntime({}, { state: 4, progress: 50 }, new Date("2026-08-02T04:00:00.000Z"));
const slowHeartbeat = updateMoneyPrinterTaskRuntime(slowStarted, { state: 4, progress: 50 }, new Date("2026-08-02T04:01:05.000Z"));
const slowPresentation = moneyPrinterTaskPresentation({ state: 4, progress: 50 }, slowHeartbeat, Date.parse("2026-08-02T04:01:05.000Z"));
assert.equal(slowPresentation.processing_stage, "video");
assert.equal(slowPresentation.progress_unchanged_seconds, 65);
assert.equal(slowPresentation.stateLabel, "视频合成仍在进行");
assert.match(slowPresentation.activity_message, /心跳正常.*65 秒未变化/);
assert.deepEqual(moneyPrinterTaskDisplay({ state: 4, progress: 50, ...slowPresentation }), {
  progress: 50,
  stage: "视频合成仍在进行",
  title: "视频合成仍在进行",
  detail: slowPresentation.activity_message,
  isError: false,
});
const failedPresentation = moneyPrinterTaskPresentation({ state: -1, progress: 50, failed_stage: "video" }, slowHeartbeat);
assert.equal(failedPresentation.status_kind, "failed");
assert.equal(failedPresentation.stateLabel, "任务已经失败 · 视频合成");
assert.equal(moneyPrinterTaskDisplay({ state: -1, progress: 50, error: "FFmpeg exited", ...failedPresentation }).isError, true);

const bgmStageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "money-printer-bgm-stage-"));
try {
  const ttsAudioRoot = path.join(bgmStageRoot, "tts-audio");
  const moneyPrinterRoot = path.join(bgmStageRoot, "money-printer");
  fs.mkdirSync(ttsAudioRoot, { recursive: true });
  const sourceBgm = path.join(ttsAudioRoot, "tts-bgm.mp3");
  fs.writeFileSync(sourceBgm, "test-bgm");
  const stagedName = stageTtsBgmForMoneyPrinter({ sourcePath: sourceBgm, ttsAudioRoot, moneyPrinterRoot });
  assert.match(stagedName, /^tts-bgm-[a-f0-9-]+\.mp3$/);
  assert.equal(fs.readFileSync(path.join(moneyPrinterRoot, "storage", "bgm", stagedName), "utf8"), "test-bgm");
  assert.throws(() => stageTtsBgmForMoneyPrinter({ sourcePath: path.join(bgmStageRoot, "outside.mp3"), ttsAudioRoot, moneyPrinterRoot }), /允许的音频目录/);
} finally {
  fs.rmSync(bgmStageRoot, { recursive: true, force: true });
}

const openStatus = {
  root: "D:\\tools\\moneyprinterturbo",
  api: { docsUrl: "http://127.0.0.1:8080/docs", baseUrl: "http://127.0.0.1:8080" },
  webui: { baseUrl: "http://127.0.0.1:8501" },
  downloadDir: "D:\\douyin-downloads",
};
assert.equal(openTarget("root", openStatus), openStatus.root);
assert.equal(openTarget("tasks", openStatus), "D:\\tools\\moneyprinterturbo\\storage\\tasks");
assert.equal(openTarget("downloads", openStatus), "D:\\douyin-downloads");
assert.equal(
  openTarget("tasks", { ...openStatus, root: "/opt/moneyprinterturbo" }),
  "/opt/moneyprinterturbo/storage/tasks",
  "task directory joining must preserve the root path platform instead of the CI host platform",
);
assert.equal(openTarget("task-video", openStatus, { url: "https://example.com/output.mp4?clip=1&format=mp4" }), "https://example.com/output.mp4?clip=1&format=mp4");

const rejectedUrls = [
  "file:///C:/Windows/win.ini",
  "javascript:alert(1)",
  "http://user:pass@example.com/video.mp4",
  "https://example.com/video.mp4& calc",
  "https://example.com/video.mp4|calc",
  "https://example.com/video.mp4\"",
  "https://example.com/video.mp4\ncalc",
  "https://example.com/video.mp4\\calc",
  `https://example.com/${"a".repeat(2050)}`,
];
for (const url of rejectedUrls) {
  assert.equal(sanitizeMoneyPrinterTaskVideoUrl(url), "", `dangerous MoneyPrinter URL must be rejected: ${url}`);
  assert.equal(openTarget("task-video", openStatus, { url }), "", `dangerous task-video target must be rejected: ${url}`);
}

console.log("MoneyPrinterTurbo auto-start, single-instance and material fallback integration: OK");
