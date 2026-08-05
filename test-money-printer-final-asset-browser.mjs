import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.MPT_FINAL_ASSET_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "R2-01.08", "manual"));
const browserDir = path.join(evidenceDir, "browser");
const testsDir = path.join(evidenceDir, "tests");
const downloadDir = path.join(evidenceDir, "downloads");
const fixtureDir = path.join(ROOT, "fixtures", "money-printer");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
const narrationPath = path.join(fixtureDir, fixture.narration);
const bgmPath = path.join(fixtureDir, fixture.bgm);
const backgroundPath = path.join(fixtureDir, fixture.background);
const probeId = `r2-01-08-${Date.now()}`;
const handoffId = `${probeId}-handoff`;
const handoffRevision = `${probeId}-revision`;
const title = `${probeId}-final-asset`;
const browser = new BrowserCDP({ debuggingPort: 9244 });

for (const directory of [browserDir, testsDir, downloadDir]) fs.mkdirSync(directory, { recursive: true });
for (const [label, mediaPath, options] of [
  ["旁白", narrationPath, { expectAudio: true, expectVideo: false, minDuration: 1 }],
  ["BGM", bgmPath, { expectAudio: true, expectVideo: false, minDuration: 1 }],
]) {
  const media = verifyMedia(mediaPath, options);
  assert.equal(media.ok, true, `${label} fixture 不可解码：${media.errors.join("；")}`);
}
assert.equal(fs.existsSync(backgroundPath), true, "背景视频 fixture 不存在");

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

function withDatabase(dbPath, action) {
  if (!fs.existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys=ON");
    return action(db);
  } finally {
    db.close();
  }
}

function cleanupProbe(result) {
  const cleanup = { handoff: false, renderedFile: false, finalAsset: false, outputFile: false, workflowDir: false };
  cleanup.handoff = Boolean(withDatabase(path.join(ROOT, ".data", "tts", "handoffs.sqlite"), (db) => {
    const row = db.prepare("SELECT id, payload_json FROM tts_handoffs WHERE id=?").get(handoffId);
    if (!row) return false;
    const payload = JSON.parse(String(row.payload_json || "{}"));
    assert.equal(String(payload.handoff_id), handoffId, "拒绝清理非本测试 handoff");
    assert.equal(String(payload.id), probeId, "拒绝清理非本测试探针 handoff");
    return Number(db.prepare("DELETE FROM tts_handoffs WHERE id=?").run(handoffId).changes) === 1;
  }));
  const wrapperId = String(result?.finalAsset?.wrapperId || "");
  const assetId = String(result?.finalAsset?.assetId || "");
  if (wrapperId) {
    cleanup.renderedFile = Boolean(withDatabase(path.join(ROOT, ".data", "money-printer.sqlite"), (db) => {
      const row = db.prepare("SELECT id, metadata_json FROM money_printer_assets WHERE id=?").get(wrapperId);
      if (!row) return false;
      const metadata = JSON.parse(String(row.metadata_json || "{}"));
      assert.equal(row.id, wrapperId, "拒绝清理非本测试包装记录");
      assert.equal(metadata.assetId, assetId, "包装记录与最终资产 ID 不一致，拒绝清理");
      return Number(db.prepare("DELETE FROM money_printer_assets WHERE id=?").run(wrapperId).changes) === 1;
    }));
  }
  if (assetId) {
    cleanup.finalAsset = Boolean(withDatabase(path.join(ROOT, ".data", "tasks.sqlite"), (db) => {
      const row = db.prepare("SELECT asset_id, source, source_ref FROM final_assets WHERE asset_id=?").get(assetId);
      if (!row) return false;
      assert.equal(row.source, "money-printer", "拒绝清理非 MoneyPrinter 最终资产");
      assert.equal(row.source_ref, wrapperId, "拒绝清理不属于本测试包装 ID 的最终资产");
      return Number(db.prepare("DELETE FROM final_assets WHERE asset_id=?").run(assetId).changes) === 1;
    }));
  }
  const outputPath = path.resolve(String(result?.finalAsset?.outputPath || ""));
  if (outputPath && fs.existsSync(outputPath)) {
    assert.ok(path.basename(outputPath).startsWith(title), "拒绝删除非本测试输出文件");
    fs.rmSync(outputPath);
    cleanup.outputFile = true;
  }
  if (wrapperId) {
    const workflowRoot = path.resolve(ROOT, ".data", "money-printer");
    const workflowDir = path.resolve(workflowRoot, wrapperId);
    if (fs.existsSync(workflowDir)) {
      assert.equal(path.dirname(workflowDir), workflowRoot, "拒绝清理工作流根目录之外的路径");
      assert.equal(path.basename(workflowDir), wrapperId, "拒绝清理非本测试工作流目录");
      fs.rmSync(workflowDir, { recursive: true, force: true });
      cleanup.workflowDir = true;
    }
  }
  return cleanup;
}

let page;
let thrown;
let result = {
  checkedAt: new Date().toISOString(),
  mode: "fresh-headless-real-service-physical-download",
  probeId,
  handoffId,
  passed: false,
};

try {
  await browser.launch();
  page = await browser.newPage(`${BASE}/#money-printer`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("globalThis.moneyPrinterProduction?.showFinalAsset && globalThis.ttsHandoffStore?.save", 30000);
  await page._send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  result = {
    ...result,
    ...(await page.evaluate(`(async function(){
      const payload = {
        id: ${JSON.stringify(probeId)},
        title: ${JSON.stringify(title)},
        final_text: '固定回归字幕',
        original_text: '固定回归字幕',
        audio_path: ${JSON.stringify(narrationPath)},
        audio_duration: 2,
        alignment_status: 'confirmed',
        alignment_confirmed_at: new Date().toISOString(),
        sentence_timeline: ${JSON.stringify(fixture.segments)},
        subtitle_timeline: ${JSON.stringify(fixture.segments)},
        handoff_id: ${JSON.stringify(handoffId)},
        handoff_revision: ${JSON.stringify(handoffRevision)},
        include_bgm: true,
        bgm_path: ${JSON.stringify(bgmPath)},
        bgm_name: '固定 110Hz BGM',
        bgm_volume: ${Number(fixture.feature.bgmVolume)}
      };
      const saved = await globalThis.ttsHandoffStore.save(payload, ['money-printer']);
      const response = await fetch('/api/money-printer/render-final', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: ${JSON.stringify(title)},
          tts: saved,
          text: '固定回归字幕',
          handoff_id: saved.handoff_id,
          revision: saved.handoff_revision,
          includeBgm: true,
          bgm_file: saved.bgm_path,
          bgm_volume: saved.bgm_volume,
          background_video: ${JSON.stringify(backgroundPath)},
          segments: ${JSON.stringify(fixture.segments)},
          settings: ${JSON.stringify(fixture.settings)}
        })
      });
      const finalAsset = await response.json();
      if (!response.ok) return { status: response.status, finalAsset };
      const urls = globalThis.moneyPrinterProduction.showFinalAsset(finalAsset);
      async function hashUrl(url) {
        const resource = await fetch(url);
        const bytes = await resource.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return {
          status: resource.status,
          bytes: bytes.byteLength,
          hash: [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join(''),
          finalAssetId: resource.headers.get('x-final-asset-id') || '',
          disposition: resource.headers.get('content-disposition') || ''
        };
      }
      async function rangeUrl(url, range) {
        const resource = await fetch(url, { headers: { Range: range } });
        const bytes = new Uint8Array(await resource.arrayBuffer());
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return {
          range,
          status: resource.status,
          acceptRanges: resource.headers.get('accept-ranges') || '',
          contentRange: resource.headers.get('content-range') || '',
          contentLength: Number(resource.headers.get('content-length') || 0),
          byteLength: bytes.byteLength,
          hash: [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join(''),
          head: Array.from(bytes.slice(0, 16)),
          tail: Array.from(bytes.slice(Math.max(0, bytes.length - 16)))
        };
      }
      const registry = await (await fetch('/api/final-assets/list?source=money-printer&limit=100')).json();
      return {
        status: response.status,
        finalAsset,
        urls,
        registryAsset: (registry.assets || []).find((item) => item.assetId === finalAsset.assetId) || null,
        dom: {
          taskId: document.querySelector('#moneyPrinterTaskId')?.textContent?.trim() || '',
          previewSrc: document.querySelector('#moneyPrinterFinalVideo')?.getAttribute('src') || '',
          previewHref: document.querySelector('#moneyPrinterFinalPreview')?.getAttribute('href') || '',
          downloadHref: document.querySelector('#moneyPrinterFinalDownload')?.getAttribute('href') || '',
          assetId: document.querySelector('.money-printer-final-asset')?.dataset.finalAssetId || ''
        },
        previewFetch: await hashUrl(urls.previewUrl),
        downloadFetch: await hashUrl(urls.downloadUrl),
        rangeRequests: {
          first: await rangeUrl(urls.previewUrl, 'bytes=0-15'),
          suffix: await rangeUrl(urls.previewUrl, 'bytes=-16'),
          openEnded: await rangeUrl(urls.previewUrl, 'bytes=16-'),
          malformed: await rangeUrl(urls.previewUrl, 'bytes=broken'),
          multiple: await rangeUrl(urls.previewUrl, 'bytes=0-1,3-4'),
          zeroSuffix: await rangeUrl(urls.previewUrl, 'bytes=-0'),
          outOfBounds: await rangeUrl(urls.previewUrl, 'bytes=999999999-')
        }
      };
    })()`)),
  };
  assert.equal(result.status, 200, result.finalAsset?.message);
  assert.ok(result.finalAsset.wrapperId, "响应缺少显式 wrapperId");
  assert.equal(result.finalAsset.id, result.finalAsset.wrapperId, "旧 id 兼容字段没有保持包装 ID");
  assert.notEqual(result.finalAsset.wrapperId, result.finalAsset.assetId, "包装 ID 与最终资产 ID 被错误合并");
  assert.equal(result.urls.assetId, result.finalAsset.assetId);
  assert.equal(result.dom.taskId, result.finalAsset.wrapperId);
  assert.equal(result.dom.assetId, result.finalAsset.assetId);
  assert.equal(result.dom.previewSrc, result.urls.previewUrl);
  assert.equal(result.dom.previewHref, result.urls.previewUrl);
  assert.equal(result.dom.downloadHref, result.urls.downloadUrl);
  assert.equal(new URL(result.urls.previewUrl, BASE).searchParams.get("id"), result.finalAsset.assetId);
  assert.equal(result.registryAsset?.assetId, result.finalAsset.assetId);
  assert.equal(result.registryAsset?.sourceRef, result.finalAsset.wrapperId);
  assert.equal(result.previewFetch.status, 200);
  assert.equal(result.downloadFetch.status, 200);
  assert.equal(result.previewFetch.finalAssetId, result.finalAsset.assetId);
  assert.equal(result.downloadFetch.finalAssetId, result.finalAsset.assetId);
  assert.match(result.downloadFetch.disposition, /^attachment;/u);
  assert.equal(result.previewFetch.hash, result.downloadFetch.hash);
  const serverBytes = fs.readFileSync(result.finalAsset.outputPath);
  assert.equal(result.rangeRequests.first.status, 206);
  assert.equal(result.rangeRequests.first.acceptRanges, "bytes");
  assert.equal(result.rangeRequests.first.contentRange, `bytes 0-15/${serverBytes.length}`);
  assert.equal(result.rangeRequests.first.contentLength, 16);
  assert.equal(result.rangeRequests.first.byteLength, 16);
  assert.deepEqual(result.rangeRequests.first.head, [...serverBytes.subarray(0, 16)]);
  assert.equal(result.rangeRequests.suffix.status, 206);
  assert.equal(result.rangeRequests.suffix.contentRange, `bytes ${serverBytes.length - 16}-${serverBytes.length - 1}/${serverBytes.length}`);
  assert.equal(result.rangeRequests.suffix.contentLength, 16);
  assert.equal(result.rangeRequests.suffix.byteLength, 16);
  assert.deepEqual(result.rangeRequests.suffix.head, [...serverBytes.subarray(serverBytes.length - 16)]);
  assert.equal(result.rangeRequests.openEnded.status, 206);
  assert.equal(result.rangeRequests.openEnded.contentRange, `bytes 16-${serverBytes.length - 1}/${serverBytes.length}`);
  assert.equal(result.rangeRequests.openEnded.contentLength, serverBytes.length - 16);
  assert.equal(result.rangeRequests.openEnded.byteLength, serverBytes.length - 16);
  assert.equal(result.rangeRequests.openEnded.hash, crypto.createHash("sha256").update(serverBytes.subarray(16)).digest("hex"));
  for (const invalid of [result.rangeRequests.malformed, result.rangeRequests.multiple, result.rangeRequests.zeroSuffix, result.rangeRequests.outOfBounds]) {
    assert.equal(invalid.status, 416);
    assert.equal(invalid.contentRange, `bytes */${serverBytes.length}`);
    assert.equal(invalid.byteLength, 0);
  }
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
  result.serverSha256 = sha256(result.finalAsset.outputPath);
  assert.equal(result.previewFetch.hash, result.downloadedSha256);
  assert.equal(result.previewFetch.hash, result.serverSha256);
  result.media = verifyMedia(result.downloadedPath, { expectAudio: true, expectVideo: true, minDuration: 1 });
  assert.equal(result.media.ok, true, JSON.stringify(result.media.errors));
  result.featureDetection = {
    narration440RmsDb: narrowBandRms(result.downloadedPath, 440),
    bgm110RmsDb: narrowBandRms(result.downloadedPath, 110),
  };
  result.featureDetection.bothDetected = Number.isFinite(result.featureDetection.narration440RmsDb)
    && result.featureDetection.narration440RmsDb > -55
    && Number.isFinite(result.featureDetection.bgm110RmsDb)
    && result.featureDetection.bgm110RmsDb > -55;
  assert.equal(result.featureDetection.bothDetected, true, JSON.stringify(result.featureDetection));
  await page.screenshot(path.join(browserDir, "money-printer-final-preview-download.png"));
  result.passed = true;
} catch (error) {
  thrown = error;
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  if (page) await page.screenshot(path.join(browserDir, "money-printer-final-asset-failure.png")).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  try {
    result.cleanup = cleanupProbe(result);
  } catch (cleanupError) {
    result.cleanupError = cleanupError instanceof Error ? cleanupError.stack || cleanupError.message : String(cleanupError);
    thrown ||= cleanupError;
  }
  fs.writeFileSync(path.join(testsDir, "money-printer-final-asset-browser.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

if (thrown) throw thrown;
console.log(`MoneyPrinter final identity/preview/download: OK (${result.finalAsset.assetId}, wrapper ${result.finalAsset.wrapperId}, ${result.serverSha256})`);
