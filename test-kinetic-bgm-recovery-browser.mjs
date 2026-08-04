import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.KINETIC_BGM_RECOVERY_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "06.05", "manual"));
const browserDir = path.join(evidenceDir, "browser");
const testsDir = path.join(evidenceDir, "tests");
const fixtureDir = path.join(ROOT, "fixtures", "kinetic");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
fs.mkdirSync(browserDir, { recursive: true });
fs.mkdirSync(testsDir, { recursive: true });

const probeId = Number(`98${String(Date.now()).slice(-7)}`);
const revision = `kinetic-recovery-${probeId}`;
const browser = new BrowserCDP({ debuggingPort: 9249 });
let page;
let projectDir = "";
const report = {};

function recoverySnapshotScript(projectId) {
  return `(async function(){
    await globalThis.kineticTextProduction.refresh(${JSON.stringify(projectId)});
    const response = await fetch('/api/kinetic-text/project?id=' + encodeURIComponent(${JSON.stringify(projectId)}), { cache: 'no-store' });
    const data = await response.json();
    const player = document.querySelector('#kineticBgmPlayer');
    return {
      project: data.project,
      controls: {
        includeBgm: document.querySelector('#kineticIncludeBgm')?.checked,
        source: document.querySelector('#kineticAudioSource')?.value,
        volume: document.querySelector('#kineticBgVolume')?.value,
        volumeLabel: document.querySelector('#kineticBgVolumeValue')?.value,
        playerVisible: Boolean(player && !player.closest('#kineticBgmPlayerWrap')?.hidden && player.getBoundingClientRect().width > 0),
        playerVolume: player?.volume,
        playerSrc: player?.currentSrc || player?.src || ''
      }
    };
  })()`;
}

function assertRecovered(snapshot, label) {
  assert.equal(snapshot.project.ttsHandoffRevision, revision, `${label}: handoff revision 丢失`);
  assert.equal(snapshot.project.audioMix.source, "local", `${label}: BGM 开关丢失`);
  assert.equal(snapshot.project.audioMix.backgroundVolume, 33, `${label}: BGM 音量丢失`);
  assert.equal(snapshot.controls.includeBgm, true, `${label}: 页面开关未恢复`);
  assert.equal(snapshot.controls.source, "local", `${label}: 页面音源未恢复`);
  assert.equal(snapshot.controls.volume, "33", `${label}: 页面音量未恢复`);
  assert.equal(snapshot.controls.volumeLabel, "33%", `${label}: 页面音量标签未恢复`);
  assert.equal(snapshot.controls.playerVisible, true, `${label}: BGM 播放条未恢复`);
  assert.ok(Math.abs(snapshot.controls.playerVolume - 0.33) < 0.001, `${label}: 播放器音量未恢复`);
  assert.match(snapshot.controls.playerSrc, /kind=bgm/, `${label}: 播放器 BGM URL 未恢复`);
}

try {
  await browser.launch();
  page = await browser.newPage(`${BASE}/#kinetic-text`);
  await page.waitForFunction("globalThis.kineticTextProduction?.receiveTts", 30000);
  const project = await page.evaluate(`globalThis.kineticTextProduction.receiveTts({
    id: ${probeId}, title: '06.05 BGM 恢复探针', final_text: '验证切页刷新重启恢复。', original_text: '验证切页刷新重启恢复。',
    audio_path: ${JSON.stringify(path.join(fixtureDir, fixture.narration.file))}, audio_duration: ${fixture.narration.durationSeconds},
    alignment_status: 'confirmed', alignment_confirmed_at: new Date().toISOString(),
    sentence_timeline: ${JSON.stringify(fixture.timeline)}, subtitle_timeline: ${JSON.stringify(fixture.timeline)},
    handoff_id: 'fixture-${probeId}', handoff_revision: ${JSON.stringify(revision)}, include_bgm: true,
    bgm_path: ${JSON.stringify(path.join(fixtureDir, fixture.bgm.file))}, bgm_name: '固定 110Hz BGM', bgm_volume: ${fixture.bgm.volume}
  })`);
  projectDir = path.join(ROOT, ".data", "kinetic-text", "projects", project.id);
  await page.evaluate(`(function(){ const slider=document.querySelector('#kineticBgVolume'); slider.value='33'; slider.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await new Promise((resolve) => setTimeout(resolve, 700));

  await page.navigate(`${BASE}/#control`);
  await page.waitForFunction("location.hash === '#control'", 10000);
  await page.navigate(`${BASE}/#kinetic-text`);
  await page.waitForFunction("globalThis.kineticTextProduction?.refresh", 30000);
  report.afterPageSwitch = await page.evaluate(recoverySnapshotScript(project.id));
  assertRecovered(report.afterPageSwitch, "切页后");

  await page.navigate(`${BASE}/#kinetic-text`);
  await page.waitForFunction("globalThis.kineticTextProduction?.refresh", 30000);
  report.afterRefresh = await page.evaluate(recoverySnapshotScript(project.id));
  assertRecovered(report.afterRefresh, "刷新后");

  const restart = spawnSync("npm.cmd", ["run", "test:restart"], { cwd: ROOT, encoding: "utf8", shell: true, timeout: 180000 });
  fs.writeFileSync(path.join(testsDir, "nested-restart.txt"), `${restart.stdout || ""}\n${restart.stderr || ""}`, "utf8");
  assert.equal(restart.status, 0, `真实重启门禁失败: ${restart.stderr || restart.stdout}`);
  await page.navigate(`${BASE}/#kinetic-text`);
  await page.waitForFunction("globalThis.kineticTextProduction?.refresh", 30000);
  report.afterRestart = await page.evaluate(recoverySnapshotScript(project.id));
  assertRecovered(report.afterRestart, "8787 重启后");

  await page.screenshot(path.join(browserDir, "kinetic-bgm-recovered-after-restart.png"));
  fs.writeFileSync(path.join(testsDir, "kinetic-bgm-recovery-browser.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
} finally {
  await browser.close().catch(() => {});
  if (projectDir) {
    const allowedRoot = path.join(ROOT, ".data", "kinetic-text", "projects");
    const relative = path.relative(allowedRoot, projectDir);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "拒绝清理非测试项目路径");
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

console.log(`Kinetic BGM refresh/page/restart recovery: OK (${revision})`);
