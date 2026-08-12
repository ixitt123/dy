import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.MPT_FINAL_ASSET_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "05.04", "manual"));
const fixtureDir = path.join(ROOT, "fixtures", "money-printer");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
const downloadDir = path.join(evidenceDir, "downloads");
fs.mkdirSync(downloadDir, { recursive: true });

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function narrowBandRms(filePath, frequency) {
  const filter = `atrim=start=0.8:duration=0.2,asetpts=N/SR/TB,bandpass=f=${frequency}:width_type=h:w=10,astats=metadata=1:reset=0`;
  const run = spawnSync(ffmpegPath, ["-hide_banner", "-i", filePath, "-af", filter, "-f", "null", "-"], { encoding: "utf8", windowsHide: true, timeout: 120000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const matches = `${run.stdout}\n${run.stderr}`.match(/RMS level dB:\s*(-?(?:\d+(?:\.\d+)?)|-inf)/gi) || [];
  assert.ok(matches.length, `无法测量 ${frequency}Hz 窄带`);
  return Number(matches.at(-1).match(/-?(?:\d+(?:\.\d+)?)|-inf/i)?.[0]);
}

const browser = new BrowserCDP({ debuggingPort: 9244 });
let page;
let result;
try {
  await browser.launch();
  page = await browser.newPage(`${BASE}/#money-printer`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("globalThis.moneyPrinterProduction?.showFinalAsset && globalThis.ttsHandoffStore?.hydrate", 30000);
  await page._send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  result = await page.evaluate(`(async function(){
    const job = (await fetchJson('/api/tts/job?id=93')).job;
    await resolveTtsBgmForHandoff(job);
    const payload = confirmedTtsAudioPayload(job);
    await sendTtsPayloadToTargets(payload, ['money-printer']);
    const handoff = await globalThis.ttsHandoffStore.hydrate('money-printer');
    const body = {
      title: 'mpt-final-asset-05.04',
      tts: { ...handoff, audio_path: ${JSON.stringify(path.join(fixtureDir, fixture.narration))} },
      text: '固定回归字幕',
      handoff_id: handoff.handoff_id,
      revision: handoff.handoff_revision,
      includeBgm: true,
      bgm_file: handoff.bgm_path,
      bgm_volume: handoff.bgm_volume,
      background_video: ${JSON.stringify(path.join(fixtureDir, fixture.background))},
      segments: ${JSON.stringify(fixture.segments)},
      settings: ${JSON.stringify(fixture.settings)},
    };
    const response = await fetch('/api/money-printer/render-final', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const finalAsset = await response.json();
    if (!response.ok) return { status: response.status, finalAsset };
    const urls = globalThis.moneyPrinterProduction.showFinalAsset(finalAsset);
    async function hashUrl(url) {
      const resource = await fetch(url);
      const bytes = await resource.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return { status: resource.status, bytes: bytes.byteLength, hash: [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('') };
    }
    return {
      status: response.status,
      finalAsset,
      urls,
      dom: {
        previewSrc: document.querySelector('#moneyPrinterFinalVideo')?.getAttribute('src') || '',
        previewHref: document.querySelector('#moneyPrinterFinalPreview')?.getAttribute('href') || '',
        downloadHref: document.querySelector('#moneyPrinterFinalDownload')?.getAttribute('href') || '',
        assetId: document.querySelector('.money-printer-final-asset')?.dataset.finalAssetId || '',
      },
      previewFetch: await hashUrl(urls.previewUrl),
      downloadFetch: await hashUrl(urls.downloadUrl),
    };
  })()`);
  assert.equal(result.status, 200, result.finalAsset?.message);
  await page.click("#moneyPrinterFinalVideo");
  await page.waitForFunction("document.querySelector('#moneyPrinterFinalVideo')?.currentTime > 0.1", 10000);
  result.playbackTime = await page.evaluate("document.querySelector('#moneyPrinterFinalVideo').currentTime");
  await page.click("#moneyPrinterFinalDownload");
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !fs.readdirSync(downloadDir).some((name) => name.toLowerCase().endsWith(".mp4"))) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const downloadedName = fs.readdirSync(downloadDir).find((name) => name.toLowerCase().endsWith(".mp4"));
  assert.ok(downloadedName, "物理点击下载后没有 MP4 落盘");
  result.downloadedPath = path.join(downloadDir, downloadedName);
  result.downloadedSha256 = sha256(result.downloadedPath);
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "money-printer-final-preview-download.png"));
} finally {
  await browser.close().catch(() => {});
}

assert.equal(result.dom.previewSrc, result.urls.previewUrl);
assert.equal(result.dom.previewHref, result.urls.previewUrl);
assert.equal(result.dom.downloadHref, result.urls.downloadUrl);
assert.equal(result.dom.assetId, result.finalAsset.id);
assert.equal(result.previewFetch.status, 200);
assert.equal(result.downloadFetch.status, 200);
assert.equal(result.previewFetch.hash, result.downloadFetch.hash);
assert.equal(result.previewFetch.hash, result.downloadedSha256);
assert.ok(result.playbackTime > 0.1);
const serverSha256 = sha256(result.finalAsset.outputPath);
assert.equal(result.previewFetch.hash, serverSha256);
const media = verifyMedia(result.downloadedPath, { expectAudio: true, expectVideo: true, minDuration: 1 });
assert.equal(media.ok, true, JSON.stringify(media.errors));
const featureDetection = {
  narration440RmsDb: narrowBandRms(result.downloadedPath, 440),
  bgm110RmsDb: narrowBandRms(result.downloadedPath, 110),
};
featureDetection.bothDetected = Number.isFinite(featureDetection.narration440RmsDb)
  && featureDetection.narration440RmsDb > -55
  && Number.isFinite(featureDetection.bgm110RmsDb)
  && featureDetection.bgm110RmsDb > -55;
assert.equal(featureDetection.bothDetected, true, JSON.stringify(featureDetection));
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "tests", "money-printer-final-asset-browser.json"), `${JSON.stringify({ ...result, serverSha256, media, featureDetection }, null, 2)}\n`, "utf8");
console.log(`MoneyPrinter final preview/download: OK (${serverSha256}, playback ${result.playbackTime.toFixed(3)}s, narration440 ${featureDetection.narration440RmsDb}dB, bgm110 ${featureDetection.bgm110RmsDb}dB)`);
