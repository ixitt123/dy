// 端到端 API 测试
// 运行: 先启动服务器 node ui-server.mjs，然后 node test-e2e.mjs

import { readFile } from "node:fs/promises";

const BASE = "http://127.0.0.1:8787";
const tests = [];

function test(name, fn) { tests.push({ name, fn }); }

test("Status API", async () => {
  const r = await fetch(`${BASE}/api/status`);
  const d = await r.json();
  if (!d.ok) throw new Error("Status not OK");
});

test("Provider List", async () => {
  const r = await fetch(`${BASE}/api/providers/list`);
  const d = await r.json();
  if (!d.providers?.length) throw new Error("No providers");
});

test("Settings API", async () => {
  const r = await fetch(`${BASE}/api/settings/all`);
  const d = await r.json();
  if (!d.ok) throw new Error("Settings not OK");
});

test("Model Mapping", async () => {
  const r = await fetch(`${BASE}/api/settings/model-mapping`);
  const d = await r.json();
  if (!d.mapping) throw new Error("No mapping");
});

test("Router Model Map", async () => {
  const r = await fetch(`${BASE}/api/router/map`);
  const d = await r.json();
  if (!d.map) throw new Error("No router map");
});

test("Image Stats", async () => {
  const r = await fetch(`${BASE}/api/image/stats`);
  const d = await r.json();
  if (!d.ok || !Number.isFinite(d.jobs) || !Number.isFinite(d.assets)) throw new Error("No image stats");
});

test("Task Center Stats", async () => {
  const r = await fetch(`${BASE}/api/task-center/stats`);
  const d = await r.json();
  if (d.total === undefined) throw new Error("No task stats");
});

test("Moments Generation Progress", async () => {
  const progressId = `e2e-moments-${Date.now()}`;
  const generate = await fetch(`${BASE}/api/moments/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ progressId }),
  });
  const failure = await generate.json();
  if (generate.status !== 400 || failure.ok !== false) throw new Error("Invalid moments generation request was not rejected");

  const progressResponse = await fetch(`${BASE}/api/moments/progress?id=${encodeURIComponent(progressId)}`);
  const progress = await progressResponse.json();
  if (!progressResponse.ok || progress.status !== "failed" || progress.progress !== 100) {
    throw new Error("Failed moments request did not expose terminal progress");
  }
});

test("Single page title and choice-memory sources", async () => {
  const [pageResponse, legacyResponse, cloneResponse, server] = await Promise.all([
    fetch(`${BASE}/`),
    fetch(`${BASE}/modules/legacy-runtime.js`),
    fetch(`${BASE}/modules/tts-voice-clone.js`),
    readFile(new URL("./ui-server.mjs", import.meta.url), "utf8"),
  ]);
  const [page, legacy, clone] = await Promise.all([
    pageResponse.text(),
    legacyResponse.text(),
    cloneResponse.text(),
  ]);
  const start = page.indexOf('<section class="workbench-page" data-page="moments-copy"');
  const end = page.indexOf('<section class="workbench-page" data-page="tts"', start);
  const momentsPage = start >= 0 && end > start ? page.slice(start, end) : "";
  if (!momentsPage.includes('class="moments-page-toolbar"') || /<h2>朋友圈文案定制<\/h2>/.test(momentsPage)) {
    throw new Error("Moments page has a duplicate page title");
  }
  if (!legacy.includes('select, input[type="checkbox"], input[type="radio"], input[type="range"]')
    || !legacy.includes("readUiNamedChoice")
    || !clone.includes("SOURCE_MODE_STORAGE_KEY")
    || !page.includes('id="analysisProvider" data-no-choice-persist')
    || !legacy.includes("renderAnalysisProviderControl")
    || !legacy.includes("provider: analysisProvider?.value")
    || !server.includes("analyzeTranscriptWithProvider")
    || !server.includes("persistAutoModel: false")) {
    throw new Error("Choice preference restoration is incomplete");
  }
});

test("Archived assets details view", async () => {
  const [pageResponse, workbenchResponse, projectResponse, legacyResponse] = await Promise.all([
    fetch(`${BASE}/`),
    fetch(`${BASE}/workbench.js`),
    fetch(`${BASE}/modules/project.js`),
    fetch(`${BASE}/modules/legacy-runtime.js`),
  ]);
  const [page, workbench, project, legacy] = await Promise.all([
    pageResponse.text(),
    workbenchResponse.text(),
    projectResponse.text(),
    legacyResponse.text(),
  ]);
  const assetTypes = ["image", "video", "bgm", "sfx", "subtitle", "cover"];
  if (!assetTypes.every((type) => page.includes(`data-project-asset-type="${type}"`))
    || !page.includes('id="projectAssetDetailModal"')
    || !page.includes('id="projectAssetGrid"')
    || !page.includes('id="projectAssetPageSize"')
    || !page.includes('id="projectAssetPager"')
    || !page.includes('id="projectAssetPrevPage"')
    || !page.includes('id="projectAssetNextPage"')
    || page.includes('id="projectAssetTypeFilter"')
    || page.includes('id="projectAssetUseCaseFilter"')
    || !workbench.includes("PROJECT_ASSET_TYPE_KEY")
    || !workbench.includes("PROJECT_ASSET_PAGE_SIZE_KEY")
    || !workbench.includes("projectAssetDetailsRow")
    || !workbench.includes("renderProjectAssetPage")
    || !workbench.includes("projectAssetsState.slice(start, start + projectAssetPageSize)")
    || !workbench.includes("assetType: activeProjectAssetType")
    || !workbench.includes("window.projectAssetLibrary")
    || !project.includes("window.projectAssetLibrary?.refresh?.()")
    || !legacy.includes("allFiles = [...(Array.isArray(files) ? files : [])].sort")) {
    throw new Error("Archived asset category details view is incomplete");
  }
});

test("Settings keeps API services collapsed by default", async () => {
  const [pageResponse, workbenchResponse] = await Promise.all([
    fetch(`${BASE}/`),
    fetch(`${BASE}/workbench.js`),
  ]);
  const [page, workbench] = await Promise.all([pageResponse.text(), workbenchResponse.text()]);
  if (!page.includes('class="legacy-download-settings" hidden')
    || page.includes('id="v2SettingsSummary"')
    || page.includes('id="v2RefreshSettings"')
    || page.includes('class="settings-category-grid"')
    || !page.includes('<details class="settings-card provider-card" id="apiServiceCenter">')
    || !workbench.includes("if (!summaryEl) return;")
    || !workbench.includes('<details class="provider-group">')) {
    throw new Error("Settings overview removal or API collapse default is incomplete");
  }
});

test("Kinetic text production line", async () => {
  const [effectsResponse, pageResponse, moduleResponse, legacyResponse, packageSource] = await Promise.all([
    fetch(`${BASE}/api/kinetic-text/effects`),
    fetch(`${BASE}/`),
    fetch(`${BASE}/modules/kinetic-text.js`),
    fetch(`${BASE}/modules/legacy-runtime.js`),
    readFile(new URL("./package.json", import.meta.url), "utf8"),
  ]);
  const [effects, page, moduleSource, legacySource] = await Promise.all([
    effectsResponse.json(),
    pageResponse.text(),
    moduleResponse.text(),
    legacyResponse.text(),
  ]);
  const packageJson = JSON.parse(packageSource);
  if (!effectsResponse.ok || effects.effects?.length !== 13
    || !page.includes('data-nav="kinetic-text"')
    || !page.includes('data-page="kinetic-text"')
    || !page.includes('data-target="kinetic-text"')
    || !page.includes('id="kineticPreviewCanvas"')
    || !page.includes('id="kineticTimeline"')
    || !page.includes('id="kineticGenerateMaterials"')
    || !page.includes('id="kineticRenderFinal"')
    || !moduleSource.includes("PREF_KEY")
    || !moduleSource.includes("receiveTts")
    || !moduleSource.includes("pollJob")
    || !legacySource.includes('targets.includes("kinetic-text")')
    || !packageJson.dependencies?.["@motion-canvas/core"]
    || !packageJson.dependencies?.["@motion-canvas/2d"]) {
    throw new Error("Kinetic text production line is incomplete");
  }
});

// Run all
let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log(`✅ ${t.name}`);
  } catch (e) {
    failed++;
    console.error(`❌ ${t.name}: ${e.message}`);
  }
}
console.log(`\n📊 ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
