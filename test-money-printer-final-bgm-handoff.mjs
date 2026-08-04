import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.MPT_FINAL_HANDOFF_EVIDENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "05.02", "manual"));
const fixtureDir = path.join(ROOT, "fixtures", "money-printer");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
const browser = new BrowserCDP({ debuggingPort: 9242 });
let result;
try {
  await browser.launch();
  const page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.waitForFunction("globalThis.ttsHandoffStore?.hydrate && globalThis.moneyPrinterProduction?.receiveTts", 30000);
  result = await page.evaluate(`(async function(){
    const job = (await fetchJson('/api/tts/job?id=93')).job;
    await resolveTtsBgmForHandoff(job);
    const payload = confirmedTtsAudioPayload(job);
    await sendTtsPayloadToTargets(payload, ['money-printer']);
    const handoff = await globalThis.ttsHandoffStore.hydrate('money-printer');
    const body = {
      title: 'mpt-final-handoff-05.02',
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
    const validResponse = await fetch('/api/money-printer/render-final', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const valid = await validResponse.json();
    const badPathResponse = await fetch('/api/money-printer/render-final', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, bgm_file: ${JSON.stringify(path.join(fixtureDir, fixture.bgm))} }) });
    const badPath = await badPathResponse.json();
    const staleResponse = await fetch('/api/money-printer/render-final', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, revision: 'stale-revision' }) });
    const stale = await staleResponse.json();
    return { body, validStatus: validResponse.status, valid, badPathStatus: badPathResponse.status, badPath, staleStatus: staleResponse.status, stale };
  })()`);
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "money-printer-final-bgm-handoff.png"));
} finally {
  await browser.close().catch(() => {});
}

assert.equal(result.validStatus, 200, result.valid?.message);
assert.equal(result.valid.bgmMixed, true);
assert.equal(path.resolve(result.valid.bgmPath).toLowerCase(), path.resolve(result.body.bgm_file).toLowerCase());
assert.equal(result.badPathStatus, 400);
assert.match(result.badPath.message, /受信任资产/);
assert.equal(result.staleStatus, 400);
assert.match(result.stale.message, /revision/);
const media = verifyMedia(result.valid.outputPath, { expectAudio: true, expectVideo: true, minDuration: 1 });
assert.equal(media.ok, true, JSON.stringify(media.errors));
fs.mkdirSync(path.join(evidenceDir, "media"), { recursive: true });
const retainedOutputPath = path.join(evidenceDir, "media", "money-printer-final-handoff.mp4");
fs.copyFileSync(result.valid.outputPath, retainedOutputPath);
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "money-printer-final-bgm-handoff.json");
fs.writeFileSync(reportPath, `${JSON.stringify({ ...result, retainedOutputPath, media }, null, 2)}\n`, "utf8");
console.log(`MoneyPrinter trusted final BGM handoff: OK (${result.valid.outputPath})`);
