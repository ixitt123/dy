import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildFastMaterialPlan,
  buildMoneyPrinterVideoFilter,
  openExternalCommand,
  openTarget,
  resolveMaterialSourceOrder,
  sanitizeMptError,
  sanitizeMoneyPrinterTaskVideoUrl,
  shouldTryNextMaterialSource,
} from "./server/routes/money-printer-routes.js";
import { automaticSearchTerm } from "./ui/modules/money-printer.js";

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
assert.equal(
  routeSource.includes("handleMoneyPrinterRoutes.shutdown = stopApiProcess"),
  false,
  "restarting the UI server must not kill an active MoneyPrinterTurbo task",
);
assert.equal(
  buildMoneyPrinterVideoFilter({ width: 1920, height: 1080, frameRate: 30, textEffectEnabled: false }),
  "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30[v]",
);
assert.ok(buildMoneyPrinterVideoFilter({
  width: 1920,
  height: 1080,
  frameRate: 30,
  textEffectEnabled: true,
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
assert.ok(uiSource.includes('material_mode: els.materialMode.value'));
assert.ok(uiSource.includes("textEffectEnabled: els.textEffectEnabled.checked"));
assert.ok(routeSource.includes('target === "downloads"'));
assert.ok(uiSource.includes("state.task.progress"));

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
