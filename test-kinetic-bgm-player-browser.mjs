import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.KINETIC_BGM_PLAYER_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "06.03", "manual"));
const browserDir = path.join(evidenceDir, "browser");
const testsDir = path.join(evidenceDir, "tests");
const fixtureDir = path.join(ROOT, "fixtures", "kinetic");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
fs.mkdirSync(browserDir, { recursive: true });
fs.mkdirSync(testsDir, { recursive: true });

const probeId = Number(`97${String(Date.now()).slice(-7)}`);
const browser = new BrowserCDP({ debuggingPort: 9248 });
let page;
let projectDir = "";
let report = {};

try {
  await browser.launch();
  page = await browser.newPage(`${BASE}/#kinetic-text`);
  await page.waitForFunction("globalThis.kineticTextProduction?.receiveTts", 30000);
  const project = await page.evaluate(`globalThis.kineticTextProduction.receiveTts({
    id: ${probeId},
    title: '06.03 可见 BGM 播放条探针',
    final_text: '验证背景音乐播放器的时间和音量控制。',
    original_text: '验证背景音乐播放器的时间和音量控制。',
    audio_path: ${JSON.stringify(path.join(fixtureDir, fixture.narration.file))},
    audio_duration: ${fixture.narration.durationSeconds},
    alignment_status: 'confirmed',
    alignment_confirmed_at: new Date().toISOString(),
    sentence_timeline: ${JSON.stringify(fixture.timeline)},
    subtitle_timeline: ${JSON.stringify(fixture.timeline)},
    handoff_id: 'fixture-${probeId}',
    handoff_revision: 'kinetic-bgm-player-${probeId}',
    include_bgm: true,
    bgm_path: ${JSON.stringify(path.join(fixtureDir, fixture.bgm.file))},
    bgm_name: '固定 110Hz BGM',
    bgm_volume: ${fixture.bgm.volume}
  })`);
  assert.ok(project?.id, "浏览器没有创建四件套动态大字项目");
  projectDir = path.join(ROOT, ".data", "kinetic-text", "projects", project.id);

  report.initial = await page.evaluate(`(function(){
    const player = document.querySelector('#kineticBgmPlayer');
    if (!player) return { exists: false };
    const rect = player.getBoundingClientRect();
    return {
      exists: true,
      controls: player.controls,
      hidden: player.hidden,
      visible: rect.width > 0 && rect.height > 0,
      src: player.currentSrc || player.src,
      volume: player.volume,
      duration: player.duration,
      readyState: player.readyState
    };
  })()`);
  assert.equal(report.initial.exists, true, "页面没有独立 BGM 播放条");
  assert.equal(report.initial.controls, true, "BGM 播放条没有原生播放/时间/音量控件");
  assert.equal(report.initial.hidden, false, "有效四件套的 BGM 播放条仍被隐藏");
  assert.equal(report.initial.visible, true, "BGM 播放条没有可见尺寸");
  assert.match(report.initial.src, /\/api\/kinetic-text\/file\?.*kind=bgm/);

  report.volume = await page.evaluate(`(function(){
    const slider = document.querySelector('#kineticBgVolume');
    slider.value = '37';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const player = document.querySelector('#kineticBgmPlayer');
    return { slider: slider.value, output: document.querySelector('#kineticBgVolumeValue').value, player: player.volume };
  })()`);
  assert.equal(report.volume.slider, "37");
  assert.equal(report.volume.output, "37%");
  assert.ok(Math.abs(report.volume.player - 0.37) < 0.001, "背景音量滑杆没有真实作用到可见播放器");

  await page.click("#kineticPreviewPlay");
  await page.waitForFunction("document.querySelector('#kineticBgmPlayer')?.currentTime > 0.08", 10000);
  report.playing = await page.evaluate(`(function(){
    const player = document.querySelector('#kineticBgmPlayer');
    return { currentTime: player.currentTime, paused: player.paused, previewButton: document.querySelector('#kineticPreviewPlay').textContent };
  })()`);
  assert.ok(report.playing.currentTime > 0.08, "主预览开始后可见 BGM 播放条时间没有前进");
  assert.equal(report.playing.paused, false, "主预览开始后可见 BGM 播放条仍暂停");

  report.seek = await page.evaluate(`(function(){
    const seek = document.querySelector('#kineticPreviewSeek');
    seek.value = '500';
    seek.dispatchEvent(new Event('input', { bubbles: true }));
    seek.dispatchEvent(new Event('change', { bubbles: true }));
    const player = document.querySelector('#kineticBgmPlayer');
    return { currentTime: player.currentTime, duration: player.duration, mainTime: document.querySelector('#kineticCurrentTime').textContent };
  })()`);
  assert.ok(report.seek.currentTime > 0.5, "拖动主预览时间后可见 BGM 播放条没有同步");

  await page.screenshot(path.join(browserDir, "kinetic-visible-bgm-player.png"));
  fs.writeFileSync(path.join(testsDir, "kinetic-bgm-player-browser.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
} finally {
  await browser.close().catch(() => {});
  if (projectDir) {
    const allowedRoot = path.join(ROOT, ".data", "kinetic-text", "projects");
    const relative = path.relative(allowedRoot, projectDir);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "拒绝清理非测试项目路径");
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

console.log(`Kinetic visible BGM player browser: OK (${probeId})`);
