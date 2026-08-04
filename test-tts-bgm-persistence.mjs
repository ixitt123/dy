import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";
import { verifyMedia } from "./scripts/media-verifier.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8787";
const evidenceDir = path.resolve(process.env.TTS_BGM_PERSISTENCE_DIR || path.join(ROOT, ".data", "repair-evidence", "04.03", "manual"));
const parentJobId = String(process.env.TTS_BGM_PARENT_JOB_ID || "93").trim();
const bgmJobId = String(process.env.TTS_BGM_JOB_ID || "94").trim();
const nativeFetch = globalThis.fetch.bind(globalThis);

const session = await nativeFetch(`${BASE}/`);
const cookie = String(session.headers.get("set-cookie") || "").split(";")[0];
if (!session.ok || !cookie) throw new Error("无法建立本机 API 会话");

async function jobById(id) {
  const response = await nativeFetch(`${BASE}/api/tts/job?id=${encodeURIComponent(id)}`, {
    headers: { cookie, origin: BASE },
  });
  const data = await response.json();
  if (!response.ok || !data.job) throw new Error(`读取 TTS 任务 ${id} 失败：${data.message || response.status}`);
  return data.job;
}

const parent = await jobById(parentJobId);
const bgm = await jobById(bgmJobId);
const linkedParentId = String(bgm.parent_tts_job_id || bgm.metadata?.parent_tts_job_id || bgm.metadata?.source_tts_job_id || "");
if (parent.status !== "completed" || bgm.status !== "completed") throw new Error("父旁白或 BGM 在重启后不是完成状态");
if (linkedParentId !== parentJobId) throw new Error(`BGM #${bgmJobId} 的父任务关联丢失：${linkedParentId}`);
const narrationPath = path.resolve(String(parent.audio_path || ""));
const bgmPath = path.resolve(String(bgm.audio_path || ""));
if (!fs.existsSync(narrationPath) || !fs.existsSync(bgmPath)) throw new Error("重启后旁白或 BGM 文件不可读取");
const bgmMedia = verifyMedia(bgmPath, { expectAudio: true, expectVideo: false, minDuration: 0.5 });
if (!bgmMedia.ok) throw new Error(`重启后 BGM 媒体检查失败：${bgmMedia.errors.join("；")}`);

let browser;
let page;
let browserState;
try {
  browser = new BrowserCDP({ debuggingPort: 9231 });
  await browser.launch();
  page = await browser.newPage(`${BASE}/#tts`);
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.click('[data-nav="tts"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="tts"].active\')', 10000);
  await page.waitForFunction(`(function(){
    const row = document.querySelector('[data-tts-job-id="${parentJobId}"]');
    return Boolean(row?.querySelector('[data-tts-load-file="bgm"]') && row.textContent.includes('四件套'));
  })()`, 30000);
  browserState = await page.evaluate(`(function(){
    const row = document.querySelector('[data-tts-job-id="${parentJobId}"]');
    return {
      rowText: row?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasBgmButton: Boolean(row?.querySelector('[data-tts-load-file="bgm"]')),
      hasFourPieceLabel: Boolean(row?.textContent?.includes('四件套')),
    };
  })()`);
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", `tts-parent-${parentJobId}-after-restart.png`));
} finally {
  if (browser) await browser.close().catch(() => {});
}

const result = {
  checkedAt: new Date().toISOString(),
  parentJobId,
  bgmJobId,
  linkedParentId,
  narrationPath,
  bgmPath,
  bgmSha256: crypto.createHash("sha256").update(fs.readFileSync(bgmPath)).digest("hex").toUpperCase(),
  bgmMedia,
  browser: browserState,
  passed: true,
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "tts-bgm-persistence.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`TTS BGM persistence: OK (parent=${parentJobId}, bgm=${bgmJobId}, duration=${bgmMedia.duration?.duration}s)`);
console.log(`Evidence: ${reportPath}`);
