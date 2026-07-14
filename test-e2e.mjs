// 端到端 API 测试
// 运行: 先启动服务器 node ui-server.mjs，然后 node test-e2e.mjs

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
  const [pageResponse, legacyResponse, cloneResponse] = await Promise.all([
    fetch(`${BASE}/`),
    fetch(`${BASE}/modules/legacy-runtime.js`),
    fetch(`${BASE}/modules/tts-voice-clone.js`),
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
    || !clone.includes("SOURCE_MODE_STORAGE_KEY")) {
    throw new Error("Choice preference restoration is incomplete");
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
