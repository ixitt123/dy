import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { normalizeCs1HandoffBgmVolume } from "./ui/modules/cs1-video.js";

assert.equal(normalizeCs1HandoffBgmVolume({}), 0.18);
assert.equal(normalizeCs1HandoffBgmVolume({ bgm_volume_percent: 18 }), 0.18);
assert.equal(normalizeCs1HandoffBgmVolume({ bgm_volume: 0.22 }), 0.22);
assert.equal(normalizeCs1HandoffBgmVolume({ bgm_volume_percent: 250 }), 1);

const evidenceDir = path.resolve(process.env.CS1_BGM_DEFAULT_EVIDENCE_DIR || path.join(".data", "repair-evidence", "08.01", "manual"));
const browserDir = path.join(evidenceDir, "browser");
fs.mkdirSync(browserDir, { recursive: true });
const browser = new BrowserCDP({ debuggingPort: 9252 });
const report = {};
try {
  await browser.launch();
  const page = await browser.newPage("http://127.0.0.1:8787/#cs1-video");
  await page.waitForFunction("document.querySelector('#cs1VideoIncludeBgm') && typeof window.workbenchNavigate === 'function' && typeof window.cs1VideoProduction?.receiveTts === 'function'", 30000);
  await page.evaluate(`window.workbenchNavigate('cs1-video')`);
  report.manual = await page.evaluate(`({ checked: document.querySelector('#cs1VideoIncludeBgm').checked })`);
  assert.equal(report.manual.checked, false, "手动进入 CS1 时 BGM 应默认关闭");
  const timeline = [{ start: 0, end: 1.2, text: "CS1 BGM 默认规则" }];
  await page.evaluate(`window.cs1VideoProduction.receiveTts({id:8001,status:'completed',alignment_status:'confirmed',sentence_timeline:${JSON.stringify(timeline)},subtitle_timeline:${JSON.stringify(timeline)},final_text:'CS1 三件套',has_bgm:false})`);
  report.threePiece = await page.evaluate(`({ checked: document.querySelector('#cs1VideoIncludeBgm').checked, status: document.querySelector('#cs1VideoStatus').textContent })`);
  assert.equal(report.threePiece.checked, false);
  assert.match(report.threePiece.status, /三件套/u);
  await page.evaluate(`window.cs1VideoProduction.receiveTts({id:8002,status:'completed',alignment_status:'confirmed',sentence_timeline:${JSON.stringify(timeline)},subtitle_timeline:${JSON.stringify(timeline)},final_text:'CS1 四件套',has_bgm:true,bgm_path:'C:\\\\fixture\\\\bgm.wav',bgm_volume_percent:18})`);
  report.fourPiece = await page.evaluate(`({ checked: document.querySelector('#cs1VideoIncludeBgm').checked, status: document.querySelector('#cs1VideoStatus').textContent, path: document.querySelector('#cs1VideoBgmPath').value })`);
  assert.equal(report.fourPiece.checked, true);
  assert.match(report.fourPiece.status, /四件套/u);
  assert.match(report.fourPiece.path, /bgm\.wav/u);
  await page.click("#cs1VideoIncludeBgm");
  report.manualOff = await page.evaluate(`({ checked: document.querySelector('#cs1VideoIncludeBgm').checked })`);
  assert.equal(report.manualOff.checked, false, "四件套自动开启后仍应允许手动关闭");
  await page.screenshot(path.join(browserDir, "cs1-four-piece-manual-off.png"));
  fs.writeFileSync(path.join(evidenceDir, "cs1-bgm-default-browser.json"), `${JSON.stringify({ ...report, normalizedVolume: normalizeCs1HandoffBgmVolume({ bgm_volume_percent: 18 }) }, null, 2)}\n`, "utf8");
} finally {
  await browser.close().catch(() => {});
}

console.log("CS1 BGM default browser: OK");
