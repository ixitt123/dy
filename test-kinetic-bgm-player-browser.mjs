import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.KINETIC_BGM_PLAYER_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "R2-01.07", "manual"));
const browserDir = path.join(evidenceDir, "browser");
const testsDir = path.join(evidenceDir, "tests");
const fixtureDir = path.join(ROOT, "fixtures", "kinetic");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
const narrationPath = path.join(fixtureDir, fixture.narration.file);
const bgmPath = path.join(fixtureDir, fixture.bgm.file);
const narrationMedia = verifyMedia(narrationPath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
const bgmMedia = verifyMedia(bgmPath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
const probeId = Number(`97${String(Date.now()).slice(-7)}`);
const testHandoffId = `r2-01-07-${probeId}`;
const keepProject = process.env.KINETIC_BGM_PLAYER_KEEP_PROJECT === "1";
const browser = new BrowserCDP({ debuggingPort: 9248 });

fs.mkdirSync(browserDir, { recursive: true });
fs.mkdirSync(testsDir, { recursive: true });
assert.equal(narrationMedia.ok, true, `旁白 fixture 不可解码：${narrationMedia.errors.join("；")}`);
assert.equal(bgmMedia.ok, true, `BGM fixture 不可解码：${bgmMedia.errors.join("；")}`);

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function deleteTestHandoff() {
  const dbPath = path.join(ROOT, ".data", "tts", "handoffs.sqlite");
  if (!fs.existsSync(dbPath)) return false;
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys=ON");
    const row = db.prepare("SELECT id, payload_json FROM tts_handoffs WHERE id=?").get(testHandoffId);
    if (!row) return false;
    const payload = JSON.parse(String(row.payload_json || "{}"));
    assert.equal(String(row.id), testHandoffId, "拒绝清理非本测试 handoff ID");
    assert.equal(String(payload.id), String(probeId), "拒绝清理不属于本测试探针的 handoff");
    const deleted = db.prepare("DELETE FROM tts_handoffs WHERE id=?").run(testHandoffId);
    assert.equal(Number(deleted.changes), 1, "测试 handoff 未被准确清理");
    return true;
  } finally {
    db.close();
  }
}

async function playerState(page) {
  return page.evaluate(`(function(){
    const player = document.querySelector('#kineticBgmPlayer');
    const wrap = document.querySelector('#kineticBgmPlayerWrap');
    const seek = document.querySelector('#kineticPreviewSeek');
    const parseTime = (text) => {
      const match = String(text || '').match(/^(\\d+):(\\d+(?:\\.\\d+)?)$/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
    };
    const rect = player?.getBoundingClientRect();
    return {
      exists: Boolean(player),
      controls: Boolean(player?.controls),
      hidden: Boolean(wrap?.hidden || player?.hidden),
      visible: Boolean(player && rect.width > 0 && rect.height > 0),
      src: player?.currentSrc || player?.src || '',
      volume: Number(player?.volume),
      duration: Number(player?.duration),
      currentTime: Number(player?.currentTime),
      paused: Boolean(player?.paused),
      seeking: Boolean(player?.seeking),
      readyState: Number(player?.readyState || 0),
      seekValue: Number(seek?.value || 0),
      seekMaximum: Number(seek?.max || 1000),
      mainTimeText: document.querySelector('#kineticCurrentTime')?.textContent || '',
      mainTime: parseTime(document.querySelector('#kineticCurrentTime')?.textContent),
      previewButton: document.querySelector('#kineticPreviewPlay')?.textContent?.trim() || '',
    };
  })()`);
}

async function waitForBgmReady(page) {
  await page.waitForFunction(`(function(){
    const player = document.querySelector('#kineticBgmPlayer');
    const wrap = document.querySelector('#kineticBgmPlayerWrap');
    const rect = player?.getBoundingClientRect();
    return Boolean(player && wrap && !wrap.hidden && player.controls && rect.width > 0 && rect.height > 0
      && player.readyState >= 1 && Number.isFinite(player.duration) && player.duration > 0
      && (player.currentSrc || player.src).includes('kind=bgm'));
  })()`, 30000);
}

async function rangeProbe(page, url, range) {
  return page.evaluate(`(async function(){
    const response = await fetch(${JSON.stringify(url)}, { headers: { Range: ${JSON.stringify(range)} } });
    const body = new Uint8Array(await response.arrayBuffer());
    return {
      range: ${JSON.stringify(range)},
      status: response.status,
      acceptRanges: response.headers.get('accept-ranges') || '',
      contentRange: response.headers.get('content-range') || '',
      contentLength: Number(response.headers.get('content-length') || 0),
      byteLength: body.byteLength,
      head: Array.from(body.slice(0, 32)),
      tail: Array.from(body.slice(Math.max(0, body.length - 32))),
    };
  })()`);
}

async function physicalSeek(page, ratio, { expectPlaying, label }) {
  const geometry = await page.evaluate(`(function(){
    const seek = document.querySelector('#kineticPreviewSeek');
    seek.scrollIntoView({ behavior: 'instant', block: 'center' });
    const rect = seek.getBoundingClientRect();
    const maximum = Math.max(1, Number(seek.max || 1000));
    const currentRatio = Number(seek.value || 0) / maximum;
    return {
      startX: rect.left + Math.max(0, Math.min(1, currentRatio)) * rect.width,
      endX: rect.left + ${Number(ratio)} * rect.width,
      y: rect.top + rect.height / 2,
    };
  })()`);
  await page._send("Input.dispatchMouseEvent", { type: "mouseMoved", x: geometry.startX, y: geometry.y });
  await page._send("Input.dispatchMouseEvent", { type: "mousePressed", x: geometry.startX, y: geometry.y, button: "left", buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 6; step += 1) {
    const x = geometry.startX + (geometry.endX - geometry.startX) * (step / 6);
    await page._send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: geometry.y, button: "left", buttons: 1 });
  }
  await page._send("Input.dispatchMouseEvent", { type: "mouseReleased", x: geometry.endX, y: geometry.y, button: "left", buttons: 0, clickCount: 1 });
  const dispatched = await playerState(page);
  const expectedMain = (dispatched.seekValue / Math.max(1, dispatched.seekMaximum)) * Number(fixture.narration.durationSeconds);
  const expectedBgm = expectedMain % dispatched.duration;
  try {
    await page.waitForFunction(`(function(){
      const player = document.querySelector('#kineticBgmPlayer');
      const seek = document.querySelector('#kineticPreviewSeek');
      const expectedMain = (Number(seek.value || 0) / Math.max(1, Number(seek.max || 1000))) * ${Number(fixture.narration.durationSeconds)};
      const expectedBgm = expectedMain % Number(player?.duration || 1);
      return Boolean(player && !player.seeking
        && Math.abs(player.currentTime - expectedBgm) <= 0.14
        && player.paused === ${expectPlaying ? "false" : "true"});
    })()`, 15000);
  } catch (error) {
    throw new Error(`${label} 未完成同步：expectedMain=${expectedMain.toFixed(3)}, expectedBgm=${expectedBgm.toFixed(3)}, dispatched=${JSON.stringify(dispatched)}；${error.message}`);
  }
  const settled = await playerState(page);
  assert.equal(Math.abs(settled.mainTime - expectedMain) <= 0.14, true, `${label} 主预览时间不正确`);
  assert.equal(Math.abs(settled.currentTime - expectedBgm) <= 0.14, true, `${label} BGM 时间不正确`);
  assert.equal(settled.paused, !expectPlaying, `${label} BGM 播放状态不正确`);
  return { label, ratio, expectedMain, expectedBgm, dispatched, settled };
}

async function assertPlaybackAdvances(page, fromTime, label) {
  await page.waitForFunction(`(function(){
    const player = document.querySelector('#kineticBgmPlayer');
    return Boolean(player && !player.paused && player.currentTime > ${Number(fromTime)} + 0.08);
  })()`, 10000);
  const state = await playerState(page);
  assert.equal(state.paused, false, `${label} BGM 未播放`);
  assert.equal(state.currentTime > fromTime + 0.08, true, `${label} BGM 时间未推进`);
  return state;
}

let page;
let projectDir = "";
let result = {
  checkedAt: new Date().toISOString(),
  mode: "fresh-headless-physical-pointer",
  probeId,
  passed: false,
};
let thrown;

try {
  await browser.launch();
  page = await browser.newPage(`${BASE}/#kinetic-text`);
  await page.waitForFunction("globalThis.kineticTextProduction?.receiveTts", 30000);
  const received = await page.evaluate(`(async function(){
    const payload = {
      id: ${probeId},
      title: 'R2-01.07 BGM seek 同步探针',
      final_text: '验证背景音乐播放器的拖动、播放、暂停和刷新同步。',
      original_text: '验证背景音乐播放器的拖动、播放、暂停和刷新同步。',
      audio_path: ${JSON.stringify(narrationPath)},
      audio_duration: ${fixture.narration.durationSeconds},
      alignment_status: 'confirmed',
      alignment_confirmed_at: new Date().toISOString(),
      sentence_timeline: ${JSON.stringify(fixture.timeline)},
      subtitle_timeline: ${JSON.stringify(fixture.timeline)},
      handoff_id: ${JSON.stringify(testHandoffId)},
      handoff_revision: 'r2-01-07-revision-${probeId}',
      include_bgm: true,
      bgm_path: ${JSON.stringify(bgmPath)},
      bgm_name: '固定 110Hz BGM',
      bgm_volume: ${fixture.bgm.volume}
    };
    const saved = await globalThis.ttsHandoffStore.save(payload, ['kinetic-text']);
    const project = await globalThis.kineticTextProduction.receiveTts(saved);
    return { project, handoffId: globalThis.ttsHandoffStore.latestId('kinetic-text') };
  })()`);
  const project = received.project;
  assert.ok(project?.id, "浏览器没有创建四件套动态大字项目");
  assert.equal(received.handoffId, testHandoffId, "测试 handoff 没有通过正式持久化链路保存");
  projectDir = path.join(ROOT, ".data", "kinetic-text", "projects", project.id);

  const bgmBuffer = fs.readFileSync(bgmPath);
  const bgmUrl = `/api/kinetic-text/file?id=${encodeURIComponent(project.id)}&kind=bgm`;
  const rangeRequests = {
    first: await rangeProbe(page, bgmUrl, "bytes=0-15"),
    suffix: await rangeProbe(page, bgmUrl, "bytes=-16"),
    openEnded: await rangeProbe(page, bgmUrl, "bytes=16-"),
    malformed: await rangeProbe(page, bgmUrl, "bytes=broken"),
    multiple: await rangeProbe(page, bgmUrl, "bytes=0-1,3-4"),
    outOfBounds: await rangeProbe(page, bgmUrl, `bytes=${bgmBuffer.length}-`),
  };
  assert.deepEqual(rangeRequests.first, {
    range: "bytes=0-15",
    status: 206,
    acceptRanges: "bytes",
    contentRange: `bytes 0-15/${bgmBuffer.length}`,
    contentLength: 16,
    byteLength: 16,
    head: [...bgmBuffer.subarray(0, 16)],
    tail: [...bgmBuffer.subarray(0, 16)],
  });
  assert.equal(rangeRequests.suffix.status, 206);
  assert.equal(rangeRequests.suffix.contentRange, `bytes ${bgmBuffer.length - 16}-${bgmBuffer.length - 1}/${bgmBuffer.length}`);
  assert.deepEqual(rangeRequests.suffix.head, [...bgmBuffer.subarray(bgmBuffer.length - 16)]);
  assert.equal(rangeRequests.openEnded.status, 206);
  assert.equal(rangeRequests.openEnded.contentRange, `bytes 16-${bgmBuffer.length - 1}/${bgmBuffer.length}`);
  assert.equal(rangeRequests.openEnded.byteLength, bgmBuffer.length - 16);
  for (const invalid of [rangeRequests.malformed, rangeRequests.multiple, rangeRequests.outOfBounds]) {
    assert.equal(invalid.status, 416);
    assert.equal(invalid.contentRange, `bytes */${bgmBuffer.length}`);
    assert.equal(invalid.byteLength, 0);
  }

  await waitForBgmReady(page);
  const initial = await playerState(page);
  assert.equal(initial.exists, true, "页面没有独立 BGM 播放条");
  assert.equal(initial.controls, true, "BGM 播放条没有原生播放/时间/音量控件");
  assert.equal(initial.hidden, false, "有效四件套的 BGM 播放条仍被隐藏");
  assert.equal(initial.visible, true, "BGM 播放条没有可见尺寸");
  assert.match(initial.src, /\/api\/kinetic-text\/file\?.*kind=bgm/);
  assert.equal(Math.abs(initial.duration - Number(bgmMedia.duration.duration)) <= 0.1, true, "BGM 播放器时长与真实文件不一致");

  const volume = await page.evaluate(`(function(){
    const slider = document.querySelector('#kineticBgVolume');
    slider.value = '37';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const player = document.querySelector('#kineticBgmPlayer');
    return { slider: slider.value, output: document.querySelector('#kineticBgVolumeValue').value, player: player.volume };
  })()`);
  assert.deepEqual(volume, { slider: "37", output: "37%", player: 0.37 });

  await page.click("#kineticPreviewPlay");
  const initialPlaying = await assertPlaybackAdvances(page, 0, "首次播放");
  const firstSeek = await physicalSeek(page, 0.45, { expectPlaying: true, label: "播放中第一次拖动" });
  const afterFirstSeekPlayback = await assertPlaybackAdvances(page, firstSeek.settled.currentTime, "第一次拖动后恢复播放");

  await page.click("#kineticPreviewPlay");
  await page.waitForFunction("document.querySelector('#kineticBgmPlayer')?.paused === true", 10000);
  const pausedBeforeWait = await playerState(page);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const pausedAfterWait = await playerState(page);
  assert.equal(Math.abs(pausedAfterWait.currentTime - pausedBeforeWait.currentTime) <= 0.04, true, "主预览暂停后 BGM 仍在推进");

  const secondSeek = await physicalSeek(page, 0.2, { expectPlaying: false, label: "暂停态第二次拖动" });
  await page.click("#kineticPreviewPlay");
  const afterSecondSeekPlayback = await assertPlaybackAdvances(page, secondSeek.settled.currentTime, "第二次拖动后恢复播放");
  await page.click("#kineticPreviewPlay");
  await page.waitForFunction("document.querySelector('#kineticBgmPlayer')?.paused === true", 10000);
  await page.screenshot(path.join(browserDir, "kinetic-bgm-first-and-second-seek.png"));

  await page.reload();
  await page.waitForFunction("globalThis.kineticTextProduction?.receiveTts", 30000);
  await waitForBgmReady(page);
  const afterReload = await playerState(page);
  assert.match(afterReload.src, /\/api\/kinetic-text\/file\?.*kind=bgm/);
  assert.equal(afterReload.paused, true, "刷新后不应自动播放 BGM");
  const reloadSeek = await physicalSeek(page, 0.7, { expectPlaying: false, label: "刷新后第三次拖动" });
  await page.click("#kineticPreviewPlay");
  const afterReloadPlayback = await assertPlaybackAdvances(page, reloadSeek.settled.currentTime, "刷新后恢复播放");
  await page.click("#kineticPreviewPlay");
  await page.waitForFunction("document.querySelector('#kineticBgmPlayer')?.paused === true", 10000);
  await page.screenshot(path.join(browserDir, "kinetic-bgm-after-refresh-seek.png"));

  result = {
    ...result,
    completedAt: new Date().toISOString(),
    projectId: project.id,
    handoffId: testHandoffId,
    fixtures: {
      narration: { path: path.relative(ROOT, narrationPath).replaceAll("\\", "/"), sha256: sha256(narrationPath), media: narrationMedia },
      bgm: { path: path.relative(ROOT, bgmPath).replaceAll("\\", "/"), sha256: sha256(bgmPath), media: bgmMedia },
    },
    states: {
      rangeRequests,
      initial,
      volume,
      initialPlaying,
      firstSeek,
      afterFirstSeekPlayback,
      pausedBeforeWait,
      pausedAfterWait,
      secondSeek,
      afterSecondSeekPlayback,
      afterReload,
      reloadSeek,
      afterReloadPlayback,
    },
    assertions: {
      visiblePlayerAndNativeControls: true,
      realBgmSourceAndDuration: true,
      physicalPlayAdvances: true,
      firstPhysicalSeekSynchronized: true,
      pauseStopsBgm: true,
      secondPhysicalSeekWhilePausedSynchronized: true,
      resumeAfterSecondSeekAdvances: true,
      refreshRestoresPlayerWithoutAutoplay: true,
      physicalSeekAfterRefreshSynchronized: true,
      byteRangeSupportsRandomMediaAccess: true,
      malformedMultipleAndOutOfBoundsRangesRejected: true,
    },
    projectRetained: keepProject,
    passed: true,
  };
} catch (error) {
  thrown = error;
  result = {
    ...result,
    failedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    passed: false,
  };
  if (page) await page.screenshot(path.join(browserDir, "kinetic-bgm-player-failure.png")).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  if (projectDir && !keepProject) {
    const allowedRoot = path.join(ROOT, ".data", "kinetic-text", "projects");
    const relative = path.relative(allowedRoot, projectDir);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "拒绝清理非测试项目路径");
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
  const handoffRemoved = deleteTestHandoff();
  result.cleanup = { projectRemoved: Boolean(projectDir && !keepProject), handoffRemoved };
  const reportPath = path.join(testsDir, "kinetic-bgm-player-browser.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Evidence: ${reportPath} (${sha256(reportPath)})`);
}

if (thrown) throw thrown;
console.log(`Kinetic visible BGM player browser: OK (${probeId}, physical seeks=3)`);
