import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openTaskStore } from "./task-store.mjs";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.XIAOHEI_BGM_DEFAULT_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "07.01", "manual"));
const browserDir = path.join(evidenceDir, "browser");
const testsDir = path.join(evidenceDir, "tests");
fs.mkdirSync(browserDir, { recursive: true });
fs.mkdirSync(testsDir, { recursive: true });

const projectId = `xiaohei-bgm-default-${Date.now()}`;
const audioPath = path.join(ROOT, "fixtures", "kinetic", "narration-440.wav");
const bgmPath = path.join(ROOT, "fixtures", "kinetic", "bgm-110.wav");
const servedBgmPath = path.join(ROOT, ".data", "tts", "audio", `xiaohei-bgm-player-${Date.now()}.wav`);
fs.mkdirSync(path.dirname(servedBgmPath), { recursive: true });
fs.copyFileSync(bgmPath, servedBgmPath);
const timeline = [{ start: 0, end: 1.2, text: "小黑四件套 BGM 默认规则。" }];
const store = openTaskStore(ROOT);
const row = store.createTtsJob({
  provider: "fixture",
  voice_id: "fixture-440",
  voice_name: "固定旁白",
  text: timeline[0].text,
  audio_path: audioPath,
  status: "completed",
  completed_at: new Date().toISOString(),
  metadata_json: JSON.stringify({
    project_id: projectId,
    final_text: timeline[0].text,
    original_text: timeline[0].text,
    alignment_status: "confirmed",
    alignment_confirmed_at: new Date().toISOString(),
    sentence_timeline: timeline,
    subtitle_timeline: timeline,
    audio_duration: 1.2,
  }),
});
const bgmRow = store.createTtsJob({
  provider: "fixture", voice_id: "fixture-110", voice_name: "固定 BGM", text: "", audio_path: servedBgmPath, format: "wav",
  status: "completed", completed_at: new Date().toISOString(), metadata_json: JSON.stringify({ source: "fixture_bgm", audio_duration: 4.7 }),
});
store.close();

const browser = new BrowserCDP({ debuggingPort: 9250, additionalArgs: ["--autoplay-policy=no-user-gesture-required"] });
let page;
const report = {};
try {
  await browser.launch();
  page = await browser.newPage(`${BASE}/#xiaohei-video`);
  await page.waitForFunction("globalThis.xiaoheiProduction?.receiveHandoff && document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelector('#xiaoheiIncludeBgm')", 30000);
  report.manual = await page.evaluate(`(function(){
    const doc=document.querySelector('#xiaoheiProductionFrame').contentDocument;
    const box=doc.querySelector('#xiaoheiIncludeBgm');
    return { checked: box.checked, disabled: box.disabled, name: doc.querySelector('#xiaoheiBgmName')?.textContent || '' };
  })()`);
  assert.equal(report.manual.checked, false, "手动进入小黑页面时 BGM 不应默认开启");
  await page.evaluate(`document.querySelector('#xiaoheiProductionFrame').contentDocument.querySelector('#xiaoheiIncludeBgm').scrollIntoView({ block: 'center' })`);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await page.screenshot(path.join(browserDir, "xiaohei-manual-bgm-default-off.png"));

  await page.evaluate(`globalThis.xiaoheiProduction.receiveHandoff({
    projectId: ${JSON.stringify(projectId)}, projectTitle: '07.01 小黑四件套', title: '07.01 小黑四件套', text: ${JSON.stringify(timeline[0].text)},
    handoffId: 'xiaohei-default-${row.id}', bgm_path: ${JSON.stringify(bgmPath)}, bgm_url: '/api/tts/audio?id=${bgmRow.id}', bgm_name: '固定 110Hz BGM', bgm_volume_percent: 18,
    ttsJob: { id: ${row.id}, status: 'completed', audio_path: ${JSON.stringify(audioPath)}, final_text: ${JSON.stringify(timeline[0].text)}, original_text: ${JSON.stringify(timeline[0].text)}, alignment_status: 'confirmed', alignment_confirmed_at: new Date().toISOString(), sentence_timeline: ${JSON.stringify(timeline)}, subtitle_timeline: ${JSON.stringify(timeline)}, bgm_path: ${JSON.stringify(bgmPath)}, bgm_url: '/api/tts/audio?id=${bgmRow.id}', bgm_name: '固定 110Hz BGM', bgm_volume_percent: 18 }
  })`);
  await page.waitForFunction("document.querySelector('#xiaoheiProductionFrame')?.contentDocument?.querySelector('#xiaoheiIncludeBgm')?.checked === true", 30000);
  report.fourPiece = await page.evaluate(`(function(){
    const doc=document.querySelector('#xiaoheiProductionFrame').contentDocument;
    const box=doc.querySelector('#xiaoheiIncludeBgm');
    return { checked: box.checked, disabled: box.disabled, volume: doc.querySelector('#xiaoheiBgmVolume')?.value || '', name: doc.querySelector('#xiaoheiBgmName')?.textContent || '' };
  })()`);
  assert.equal(report.fourPiece.checked, true, "有效四件套到达后 BGM 应自动开启");
  assert.equal(report.fourPiece.disabled, false, "有效四件套到达后 BGM 开关应可操作");
  assert.equal(report.fourPiece.volume, "18");
  assert.match(report.fourPiece.name, /110Hz BGM/);
  report.player = await page.evaluate(`(function(){
    const doc=document.querySelector('#xiaoheiProductionFrame').contentDocument;
    const player=doc.querySelector('#xiaoheiBgmPlayer');
    if (!player) return { exists: false };
    const rect=player.getBoundingClientRect();
    return { exists:true, controls:player.controls, hidden:player.hidden, visible:rect.width>0&&rect.height>0, src:player.currentSrc||player.src, volume:player.volume };
  })()`);
  assert.equal(report.player.exists, true, "小黑页面没有独立 BGM 播放条");
  assert.equal(report.player.controls, true, "小黑 BGM 播放条没有播放/时间/音量控件");
  assert.equal(report.player.visible, true, "小黑 BGM 播放条不可见");
  assert.match(report.player.src, /\/api\/tts\/audio\?id=/);
  assert.ok(Math.abs(report.player.volume - 0.18) < 0.001, "小黑 BGM 播放器音量没有使用 18% 设置");
  await page.evaluate(`(async function(){ const player=document.querySelector('#xiaoheiProductionFrame').contentDocument.querySelector('#xiaoheiBgmPlayer'); player.scrollIntoView({block:'center'}); await player.play(); })()`);
  await page.waitForFunction("document.querySelector('#xiaoheiProductionFrame').contentDocument.querySelector('#xiaoheiBgmPlayer').currentTime > 0.08", 10000);
  report.playback = await page.evaluate(`(function(){ const player=document.querySelector('#xiaoheiProductionFrame').contentDocument.querySelector('#xiaoheiBgmPlayer'); return { currentTime:player.currentTime, paused:player.paused }; })()`);
  assert.ok(report.playback.currentTime > 0.08, "点击小黑 BGM 播放条后时间没有推进");
  assert.equal(report.playback.paused, false, "点击小黑 BGM 播放条后仍处于暂停状态");
  await page.evaluate(`document.querySelector('#xiaoheiProductionFrame').contentDocument.querySelector('#xiaoheiIncludeBgm').scrollIntoView({ block: 'center' })`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.screenshot(path.join(browserDir, "xiaohei-four-piece-bgm-auto-on.png"));
  fs.writeFileSync(path.join(testsDir, "xiaohei-bgm-default-browser.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
} finally {
  await browser.close().catch(() => {});
  const cleanup = openTaskStore(ROOT);
  cleanup.deleteTtsJobs([row.id, bgmRow.id]);
  cleanup.close();
  fs.rmSync(servedBgmPath, { force: true });
}

console.log(`Xiaohei BGM default browser: OK (${row.id})`);
