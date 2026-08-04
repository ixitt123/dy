import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffprobeStatic from "ffprobe-static";
import { openTaskStore } from "./task-store.mjs";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.XIAOHEI_ONE_CLICK_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "07.04", "manual"));
const browserDir = path.join(evidenceDir, "browser");
const mediaDir = path.join(evidenceDir, "media");
fs.mkdirSync(browserDir, { recursive: true });
fs.mkdirSync(mediaDir, { recursive: true });

const stamp = Date.now();
const projectId = `xiaohei-one-click-${stamp}`;
const batchId = `fixture-xiaohei-one-click-${stamp}`;
const suffix = `codex-one-click-${stamp}`;
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const desktopFolder = path.join(os.homedir(), "Desktop", `${localDate}-${suffix}`);
const batchDir = path.join(ROOT, "image-assets", "ian-xiaohei", batchId);
assert.equal(fs.existsSync(desktopFolder), false, `Refusing to reuse existing fixture folder: ${desktopFolder}`);
assert.equal(fs.existsSync(batchDir), false, `Refusing to reuse existing output batch: ${batchDir}`);
fs.mkdirSync(desktopFolder, { recursive: false });
const sourceImages = [1, 2, 3].map((number) => path.join(ROOT, "integrations", "moneyprinterturbo", "test", "resources", `${number}.png`));
const fixtureImages = sourceImages.map((source, index) => {
  const target = path.join(desktopFolder, `fixture (${index + 1}).png`);
  fs.copyFileSync(source, target);
  fs.copyFileSync(source, path.join(mediaDir, `input-${index + 1}.png`));
  return target;
});
const bootstrapResponse = await fetch(`${BASE}/`);
const localApiCookie = String(bootstrapResponse.headers.get("set-cookie") || "").split(";", 1)[0];
assert.ok(localApiCookie, "无法取得本地 API 会话 Cookie");
const apiHeaders = { cookie: localApiCookie, origin: BASE, "content-type": "application/json" };
const folderNamesResponse = await fetch(`${BASE}/api/folder-names`, { headers: { cookie: localApiCookie } });
assert.equal(folderNamesResponse.ok, true, "无法读取文件夹名称配置");
const originalFolderNames = (await folderNamesResponse.json()).names || [];
const saveFolderNamesResponse = await fetch(`${BASE}/api/folder-names`, {
  method: "POST",
  headers: apiHeaders,
  body: JSON.stringify({ names: [...new Set([...originalFolderNames, suffix])] }),
});
assert.equal(saveFolderNamesResponse.ok, true, "无法写入测试专属文件夹名称");

const text = "第一段。第二段。第三段。";
const timeline = [
  { start: 0, end: 0.4, text: "第一段。" },
  { start: 0.4, end: 0.8, text: "第二段。" },
  { start: 0.8, end: 1.2, text: "第三段。" },
];
const audioPath = path.join(ROOT, "fixtures", "kinetic", "narration-440.wav");
const store = openTaskStore(ROOT);
const row = store.createTtsJob({
  provider: "fixture",
  voice_id: "fixture-440",
  voice_name: "固定旁白",
  text,
  audio_path: audioPath,
  status: "completed",
  completed_at: new Date().toISOString(),
  metadata_json: JSON.stringify({
    project_id: projectId,
    final_text: text,
    original_text: text,
    alignment_status: "confirmed",
    alignment_confirmed_at: new Date().toISOString(),
    sentence_timeline: timeline,
    subtitle_timeline: timeline,
    audio_duration: 1.2,
  }),
});
store.close();

const plan = {
  version: 2,
  skillProfileVersion: 2,
  projectId,
  ttsJobId: row.id,
  batchId,
  title: "07.04 一键图片实测",
  sourceText: text,
  purpose: "article",
  aspectRatio: "16:9",
  audioDuration: 1.2,
  timingSource: "fixture",
  skillId: "ian-xiaohei-illustrations",
  skillName: "小黑配图",
  shots: timeline.map((item, index) => ({
    index: index + 1,
    segmentId: `seg-${index + 1}`,
    startTime: item.start,
    endTime: item.end,
    duration: item.end - item.start,
    topic: `分镜 ${index + 1}`,
    role: "正文",
    structureType: "叙述",
    sourceText: item.text,
    subtitleText: item.text,
    coreIdea: item.text,
    xiaoheiAction: "指向当前分镜",
    visualMetaphor: "顺序清晰",
    keywords: [`第${index + 1}段`],
    labels: [],
    prompt: `小黑分镜 ${index + 1}`,
    skillId: "ian-xiaohei-illustrations",
    skillName: "小黑配图",
  })),
};

const browser = new BrowserCDP({ debuggingPort: 9251 });
const report = { projectId, batchId, desktopFolder, fixtureImages };
const createdAssetIds = [];
try {
  await browser.launch();
  const page = await browser.newPage(`${BASE}/#xiaohei-video`);
  await page.waitForFunction("globalThis.xiaoheiProduction?.receiveHandoff && document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.readyState === 'complete'", 30000);
  await page.evaluate(`globalThis.xiaoheiProduction.receiveHandoff({
    projectId: ${JSON.stringify(projectId)}, projectTitle: ${JSON.stringify(plan.title)}, title: ${JSON.stringify(plan.title)}, text: ${JSON.stringify(text)},
    handoffId: ${JSON.stringify(`07.05-missing-receipt-${row.id}`)},
    ttsJob: { id: ${row.id}, status: "completed", audio_path: ${JSON.stringify(audioPath)}, final_text: ${JSON.stringify(text)}, original_text: ${JSON.stringify(text)}, alignment_status: "confirmed", alignment_confirmed_at: new Date().toISOString(), sentence_timeline: ${JSON.stringify(timeline)}, subtitle_timeline: ${JSON.stringify(timeline)} }
  })`);
  await page.waitForFunction(`document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelector('#statusLabel')?.textContent.includes('已接收 TTS 资产')`, 30000);

  const cacheKey = `ian-xiaohei-prompt-plan:v2:${projectId}:tts-${row.id}`;
  const signature = JSON.stringify({ projectId, ttsJobId: row.id, title: plan.title, text, purpose: "article", aspectRatio: "16:9" });
  await page.evaluate(`(function(){
    const win = document.querySelector('#xiaoheiProductionFrame').contentWindow;
    win.localStorage.setItem(${JSON.stringify(cacheKey)}, JSON.stringify({
      version: 2, savedAt: new Date().toISOString(), signature: ${JSON.stringify(signature)}, plan: ${JSON.stringify(plan)},
      boundImages: [], localMaterialPool: [], desktopFolderPath: ${JSON.stringify(desktopFolder)}, desktopFolderName: ${JSON.stringify(suffix)}
    }));
    win.localStorage.setItem('ian-xiaohei-prompt-plan:latest', ${JSON.stringify(cacheKey)});
    win.location.reload();
  })()`);
  await page.waitForFunction(`document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelectorAll('[data-shot-card]').length === 3`, 30000);
  await page.waitForFunction(`document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelector('#folderNameSelect')?.value === ${JSON.stringify(suffix)}`, 10000);

  await page.setFileInputFiles(
    `document.querySelector('#xiaoheiProductionFrame').contentDocument.querySelector('[data-shot-upload="1"]')`,
    [fixtureImages[0]],
  );
  await page.waitForFunction(`document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelectorAll('.manual-preview').length === 1`, 10000);
  await page.clickInFrame("#xiaoheiProductionFrame", '[data-prompt-action="add-folder-images"]');
  try {
    await page.waitForFunction(`document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelectorAll('.manual-preview').length === 3`, 30000);
  } catch (error) {
    const debug = await page.evaluate(`(function(){
      const doc=document.querySelector('#xiaoheiProductionFrame')?.contentDocument;
      return { pending: doc?.querySelectorAll('.manual-preview').length || 0, label: doc?.querySelector('#statusLabel')?.textContent || '', detail: doc?.querySelector('#statusDetail')?.textContent || '', folder: doc?.querySelector('#folderNameSelect')?.value || '' };
    })()`);
    throw new Error(`${error.message}; page=${JSON.stringify(debug)}`);
  }
  report.afterAdd = await page.evaluate(`(function(){
    const doc=document.querySelector('#xiaoheiProductionFrame').contentDocument;
    return { pending: doc.querySelectorAll('.manual-preview').length, status: doc.querySelector('#statusDetail')?.textContent || '' };
  })()`);
  assert.equal(report.afterAdd.pending, 3, "一键添加没有按 (1)(2)(3) 绑定到三个分镜待确认区");

  await page.clickInFrame("#xiaoheiProductionFrame", '[data-prompt-action="confirm-all-images"]');
  await page.waitForFunction(`document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelectorAll('.binding-ok').length === 3`, 30000);
  report.afterConfirm = await page.evaluate(`(function(){
    const doc=document.querySelector('#xiaoheiProductionFrame').contentDocument;
    return { bound: doc.querySelectorAll('.binding-ok').length, pending: doc.querySelectorAll('.manual-preview').length, status: doc.querySelector('#statusDetail')?.textContent || '' };
  })()`);
  assert.deepEqual({ bound: report.afterConfirm.bound, pending: report.afterConfirm.pending }, { bound: 3, pending: 0 });
  await page.screenshot(path.join(browserDir, "one-click-three-images-bound.png"));

  await page.evaluate(`document.querySelector('#xiaoheiProductionFrame').contentWindow.location.reload()`);
  await page.waitForFunction(`document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelectorAll('.binding-ok').length === 3`, 30000);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  report.afterRefresh = await page.evaluate(`(function(){
    const frame=document.querySelector('#xiaoheiProductionFrame');
    const doc=frame.contentDocument;
    let cached=null;
    try { cached=JSON.parse(frame.contentWindow.localStorage.getItem(${JSON.stringify(cacheKey)}) || 'null'); } catch {}
    return { bound: doc.querySelectorAll('.binding-ok').length, previewReady: doc.querySelector('#videoPreviewEmpty')?.hidden === true, cachedBound: cached?.boundImages?.length || 0, label: doc.querySelector('#statusLabel')?.textContent || '', detail: doc.querySelector('#statusDetail')?.textContent || '' };
  })()`);
  assert.deepEqual({ bound: report.afterRefresh.bound, previewReady: report.afterRefresh.previewReady }, { bound: 3, previewReady: true }, JSON.stringify(report.afterRefresh));

  const finalPath = path.join(batchDir, "final.mp4");
  const speeds = process.env.XIAOHEI_SPEED_MATRIX === "1" ? [1, 1.1, 1.2, 1.3] : [1];
  report.speedMatrix = [];
  for (const speed of speeds) {
    await page.evaluate(`(function(){
      const select=document.querySelector('#xiaoheiProductionFrame').contentDocument.querySelector('#xiaoheiPlaybackSpeed');
      select.value=${JSON.stringify(String(speed))};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.waitForFunction(`document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelector('#downloadXiaoheiVideo')?.disabled === true`, 10000);
    await page.clickInFrame("#xiaoheiProductionFrame", "#generateImages");
    try {
      await page.waitForFunction(`document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelector('#videoRenderStatus')?.textContent.includes(${JSON.stringify(`${speed.toFixed(1)}×`)}) && document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelector('#downloadXiaoheiVideo')?.disabled === false`, 90000);
    } catch (error) {
      const debug = await page.evaluate(`(function(){ const doc=document.querySelector('#xiaoheiProductionFrame')?.contentDocument; return { label:doc?.querySelector('#statusLabel')?.textContent||'', detail:doc?.querySelector('#statusDetail')?.textContent||'', render:doc?.querySelector('#videoRenderStatus')?.textContent||'', downloadDisabled:doc?.querySelector('#downloadXiaoheiVideo')?.disabled }; })()`);
      throw new Error(`${error.message}; speed=${speed}; page=${JSON.stringify(debug)}; finalExists=${fs.existsSync(finalPath)}`);
    }
    assert.ok(fs.existsSync(finalPath) && fs.statSync(finalPath).size > 10_000, `一键添加后的 ${speed}x 最终 MP4 没有生成`);
    const retainedName = speeds.length > 1 ? `xiaohei-speed-${speed.toFixed(1)}x.mp4` : "xiaohei-one-click-final.mp4";
    const retainedPath = path.join(mediaDir, retainedName);
    fs.copyFileSync(finalPath, retainedPath);
    const probe = spawnSync(ffprobeStatic.path, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", retainedPath], { encoding: "utf8", windowsHide: true });
    assert.equal(probe.status, 0, probe.stderr || probe.stdout);
    const duration = Number(probe.stdout.trim());
    const expectedDuration = 1.2 / speed;
    assert.ok(Math.abs(duration - expectedDuration) <= 0.08, `Expected ${speed}x duration near ${expectedDuration}s, got ${duration}s`);
    report.speedMatrix.push({ speed, duration, expectedDuration, bytes: fs.statSync(retainedPath).size, sha256: createHash("sha256").update(fs.readFileSync(retainedPath)).digest("hex"), file: retainedName });
  }
  const mapping = JSON.parse(fs.readFileSync(path.join(batchDir, "segment-image-map.json"), "utf8"));
  assert.equal(mapping.length, 3);
  assert.ok(mapping.every((item, index) => item.scene_index === index + 1 && fs.existsSync(item.image_path)), "最终渲染没有保持三个分镜的图片绑定");
  createdAssetIds.push(...mapping.map((item) => String(item.image_asset_id || "")).filter(Boolean));
  fs.writeFileSync(path.join(evidenceDir, "xiaohei-one-click-browser.json"), `${JSON.stringify({ ...report, mapping, finalBytes: fs.statSync(finalPath).size }, null, 2)}\n`, "utf8");
} finally {
  await browser.close().catch(() => {});
  const cleanup = openTaskStore(ROOT);
  cleanup.deleteTtsJobs([row.id]);
  cleanup.close();
  await fetch(`${BASE}/api/folder-names`, {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify({ names: originalFolderNames }),
  }).catch(() => {});
  for (const assetId of createdAssetIds) {
    await fetch(`${BASE}/api/image/${encodeURIComponent(assetId)}/delete`, {
      method: "POST",
      headers: { cookie: localApiCookie, origin: BASE },
    }).catch(() => {});
  }
  if (path.dirname(path.resolve(desktopFolder)) === path.resolve(path.join(os.homedir(), "Desktop")) && path.basename(desktopFolder).endsWith(suffix)) {
    fs.rmSync(desktopFolder, { recursive: true, force: true });
  }
  if (path.dirname(path.resolve(batchDir)) === path.resolve(path.join(ROOT, "image-assets", "ian-xiaohei")) && path.basename(batchDir) === batchId) {
    fs.rmSync(batchDir, { recursive: true, force: true });
  }
}

console.log(`Xiaohei one-click images browser/render: OK (${row.id})`);
