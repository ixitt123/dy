import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.KINETIC_ATOMIC_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "06.01", "manual"));
const fixtureDir = path.join(ROOT, "fixtures", "kinetic");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
const browserDir = path.join(evidenceDir, "browser");
const testsDir = path.join(evidenceDir, "tests");
fs.mkdirSync(browserDir, { recursive: true });
fs.mkdirSync(testsDir, { recursive: true });
const probeId = Number(`96${String(Date.now()).slice(-7)}`);
const revision = `kinetic-atomic-browser-${probeId}`;

const browser = new BrowserCDP({ debuggingPort: 9247 });
let page;
let report;
let projectDir = "";
let manualProjectDir = "";
try {
  await browser.launch();
  page = await browser.newPage(`${BASE}/#kinetic-text`);
  await page.waitForFunction("globalThis.kineticTextProduction?.receiveTts", 30000);
  const manual = await page.evaluate(`(async function(){
    const response = await fetch('/api/kinetic-text/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '06.02 手动新建默认关闭 BGM',
        text: '手动新建动态大字项目。',
        aspectRatio: '9:16',
        frameRate: 30
      })
    });
    const created = await response.json();
    if (!response.ok) throw new Error(created.message || '手动新建失败');
    await globalThis.kineticTextProduction.refresh(created.project.id);
    return {
      project: created.project,
      controls: {
        includeBgm: document.querySelector('#kineticIncludeBgm')?.checked || false,
        includeBgmDisabled: document.querySelector('#kineticIncludeBgm')?.disabled || false,
        audioSource: document.querySelector('#kineticAudioSource')?.value || '',
        bgmName: document.querySelector('#kineticBgmName')?.textContent || ''
      }
    };
  })()`);
  manualProjectDir = path.join(ROOT, ".data", "kinetic-text", "projects", manual.project.id);
  await page.screenshot(path.join(browserDir, "kinetic-manual-default-bgm-off.png"));
  const fourPiece = await page.evaluate(`(async function(){
    const project = await globalThis.kineticTextProduction.receiveTts({
      id: ${probeId},
      title: '06.01 原子 BGM 浏览器探针',
      final_text: '动态大字原子 BGM 回归。',
      original_text: '动态大字原子 BGM 回归。',
      audio_path: ${JSON.stringify(path.join(fixtureDir, fixture.narration.file))},
      audio_duration: ${fixture.narration.durationSeconds},
      alignment_status: 'confirmed',
      alignment_confirmed_at: new Date().toISOString(),
      sentence_timeline: ${JSON.stringify(fixture.timeline)},
      subtitle_timeline: ${JSON.stringify(fixture.timeline)},
      handoff_id: 'fixture-${probeId}',
      handoff_revision: ${JSON.stringify(revision)},
      include_bgm: true,
      bgm_path: ${JSON.stringify(path.join(fixtureDir, fixture.bgm.file))},
      bgm_name: '固定 110Hz BGM',
      bgm_volume: ${fixture.bgm.volume}
    });
    return {
      project,
      controls: {
        includeBgm: document.querySelector('#kineticIncludeBgm')?.checked || false,
        bgmName: document.querySelector('#kineticBgmName')?.textContent || '',
        bgmVolume: document.querySelector('#kineticBgVolume')?.value || '',
        audioSource: document.querySelector('#kineticAudioSource')?.value || '',
      }
    };
  })()`);
  report = { manual, fourPiece, project: fourPiece.project, controls: fourPiece.controls };
  assert.ok(report.project?.id, "浏览器没有创建动态大字项目");
  projectDir = path.join(ROOT, ".data", "kinetic-text", "projects", report.project.id);
  const manifestPath = path.join(projectDir, "project.json");
  assert.ok(fs.existsSync(manifestPath), "第一次可见 project.json 不存在");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  report.manifest = manifest;
  fs.copyFileSync(manifestPath, path.join(testsDir, "kinetic-browser-first-manifest.json"));
  await page.screenshot(path.join(browserDir, "kinetic-atomic-bgm-first-visible.png"));
} finally {
  await browser.close().catch(() => {});
}

assert.equal(report.project.ttsHandoffRevision, revision);
assert.equal(report.project.audioMix.source, "local");
assert.equal(report.project.audioMix.localPath, path.join(fixtureDir, fixture.bgm.file));
assert.equal(report.project.audioMix.backgroundVolume, 18);
assert.equal(report.manifest.ttsHandoffRevision, revision);
assert.equal(report.manifest.audioMix.source, "local");
assert.equal(report.manifest.audioMix.localPath, path.join(fixtureDir, fixture.bgm.file));
assert.equal(report.controls.includeBgm, true);
assert.equal(report.controls.audioSource, "local");
assert.equal(report.controls.bgmVolume, "18");
assert.match(report.controls.bgmName, /110Hz BGM/);
assert.equal(report.manual.project.audioMix.source, "none");
assert.equal(report.manual.project.audioMix.localPath, "");
assert.equal(report.manual.controls.includeBgm, false);
assert.equal(report.manual.controls.includeBgmDisabled, true);
assert.equal(report.manual.controls.audioSource, "none");
assert.match(report.manual.controls.bgmName, /未上传背景音乐/);
fs.writeFileSync(path.join(testsDir, "kinetic-atomic-bgm-browser.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

for (const testProjectDir of [manualProjectDir, projectDir].filter(Boolean)) {
  const allowedRoot = path.join(ROOT, ".data", "kinetic-text", "projects");
  const relative = path.relative(allowedRoot, testProjectDir);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "拒绝清理非测试项目路径");
  fs.rmSync(testProjectDir, { recursive: true, force: true });
}
console.log(`Kinetic atomic BGM browser: OK (${revision})`);
